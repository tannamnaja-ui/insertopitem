const db = require('./db');
const { getPhoneCleanState, savePhoneCleanState } = require('./dataStore');
const { nowTimestamp, hasNonDigit } = require('./sqlDialect');
const { insertRows } = require('./bulkInsert');
const { explainMissingTable } = require('./schema');

// ตัดตัวหนังสือออกจากเบอร์โทรผู้ป่วยอัตโนมัติ
//
// เงื่อนไข: patient.mobile_phone_number แถวไหนมีอักขระที่ไม่ใช่ตัวเลขปนอยู่
// (ตัวหนังสือไทย/อังกฤษ ขีด วงเล็บ เว้นวรรค ฯลฯ) ให้ตัดทิ้งเหลือแต่ตัวเลข
// และถ้าตัวเลขที่เหลือยาวเกิน 10 หลัก ให้ตัดท้ายทิ้งเหลือ 10 หลักแรก (เบอร์มือถือไทยยาว 10 หลัก)
//
// การ "ตรวจจับ" ทำด้วย REGEXP ในฐานข้อมูล เพื่อไม่ต้องดึงตาราง patient ทั้งตารางมาทุก 5 นาที
// ส่วนการ "ตัด" ทำในฝั่ง Node เพราะ REGEXP_REPLACE มีเฉพาะ MariaDB 10.0.5+ / MySQL 8+
// แต่ตัวดำเนินการ REGEXP มีครบทุกเวอร์ชัน วิธีนี้จึงใช้ได้กับฐานข้อมูลเก่ากว่าด้วย
//
// งานนี้ idempotent: พอตัดเสร็จแล้วค่าที่เหลือเป็นตัวเลขล้วนและไม่เกิน 10 หลัก
// จึงไม่เข้าเงื่อนไขของรอบถัดไปอีก
//
// ค่าที่ไม่มีตัวเลขเลย (เช่น "ไม่มี", "-") จะกลายเป็นค่าว่าง ซึ่งเป็นไปตามกติกาที่ตั้งไว้
// ค่าเดิมทุกค่าถูกเก็บไว้ใน app_phone_clean_log ก่อนเขียนทับ จึงย้อนดูได้ว่าเดิมเป็นอะไร

let running = false;

// เพดานต่อรอบ กันรอบแรกที่มีข้อมูลค้างสะสมเป็นหมื่นแถวทำงานยาวจนชนรอบถัดไป
// ที่เหลือจะถูกเก็บต่อในรอบหน้าเอง
const MAX_ROWS_PER_RUN = 2000;

// จำนวนแถวต่อหนึ่งคำสั่ง UPDATE ... CASE (ใช้พารามิเตอร์ 3 ตัวต่อแถว)
const UPDATE_CHUNK_SIZE = 200;

// ความยาวสูงสุดของเบอร์หลังตัด เกินกว่านี้ตัดท้ายทิ้ง เหลือเฉพาะหลักแรก ๆ
const MAX_PHONE_DIGITS = 10;

// ตรรกะการตัดชุดเดียวที่ใช้ทั้งตอนรันจริงและตอนแสดงตัวอย่างบนหน้าเว็บ
// หน้าเว็บจึงเห็นค่าที่จะได้จริงเสมอ ไม่มีทางคำนวณคนละแบบกัน
function digitsOnly(value) {
  return String(value == null ? '' : value)
    .replace(/[^0-9]/g, '')
    .slice(0, MAX_PHONE_DIGITS);
}

// อัปเดตหลายแถวด้วยคำสั่งเดียวผ่าน CASE แทนการยิงทีละแถว
// ทั้ง PostgreSQL และ MariaDB รองรับรูปแบบนี้เหมือนกัน
async function updatePhones(query, rows) {
  for (let i = 0; i < rows.length; i += UPDATE_CHUNK_SIZE) {
    const part = rows.slice(i, i + UPDATE_CHUNK_SIZE);
    const cases = part.map(() => 'WHEN ? THEN ?').join(' ');
    const placeholders = part.map(() => '?').join(',');
    const params = [];
    for (const r of part) params.push(r.hn, r.newValue);
    for (const r of part) params.push(r.hn);

    await query(
      `UPDATE patient SET mobile_phone_number = CASE hn ${cases} END WHERE hn IN (${placeholders})`,
      params
    );
  }
}

// แถวที่ยังรอตัด = แถวที่ค่าปัจจุบันยังไม่ตรงกับผลลัพธ์ของ digitsOnly()
// ซึ่งเกิดได้สองทาง: มีอักขระที่ไม่ใช่ตัวเลขปนอยู่ หรือยาวเกิน 10 หลัก
//
// เงื่อนไขความยาวต้องมีด้วย ไม่งั้นกติกา 10 หลักจะบังคับใช้ไม่เสมอต้นเสมอปลาย:
// เบอร์เดียวกัน "0812345678999" จะถูกตัดเหลือ 10 หลักก็ต่อเมื่อบังเอิญมีตัวหนังสือปนอยู่
// ถ้าเป็นตัวเลขล้วนกลับถูกปล่อยไว้ยาวเกิน ทั้งที่ผิดกติกาเหมือนกัน
//
// CHAR_LENGTH นับเป็นจำนวนอักขระ (ไม่ใช่ไบต์) และเป็นมาตรฐาน SQL ใช้ได้ทั้งสองฐานข้อมูล
function pendingWhere() {
  return `p.mobile_phone_number IS NOT NULL
      AND p.mobile_phone_number <> ''
      AND (${hasNonDigit('p.mobile_phone_number')}
           OR CHAR_LENGTH(p.mobile_phone_number) > ${MAX_PHONE_DIGITS})`;
}

// ตัดหนึ่งก้อน (ไม่เกิน MAX_ROWS_PER_RUN แถว) ใน transaction เดียว คืนจำนวนแถวที่ตัด
async function cleanBatch() {
  return db.transaction(async (query) => {
    const candidates = await query(
      `SELECT p.hn, p.mobile_phone_number
         FROM patient p
        WHERE ${pendingWhere()}
        ORDER BY p.hn
        LIMIT ${MAX_ROWS_PER_RUN}`
    );

    if (!candidates.length) return 0;

    const rows = candidates.map((r) => ({
      hn: r.hn,
      oldValue: String(r.mobile_phone_number),
      newValue: digitsOnly(r.mobile_phone_number),
    }));

    // เก็บค่าเดิมลง log ก่อน แล้วค่อยเขียนทับ ถ้า insert log พังจะ rollback ทั้งชุด
    // ไม่มีทางที่ค่าเดิมจะหายไปโดยไม่มีบันทึก
    await insertRows(query, {
      table: 'app_phone_clean_log',
      columns: ['hn', 'old_value', 'new_value', 'cleaned_at'],
      valueTemplate: `(?, ?, ?, ${nowTimestamp()})`,
      toParams: (r) => [r.hn, r.oldValue, r.newValue],
      rows,
    });

    await updatePhones(query, rows);
    return rows.length;
  });
}

// เพดานก้อนต่อการกดเองหนึ่งครั้ง กันกรณีผิดปกติทำให้วนไม่จบ (500 × 2000 = 1 ล้านแถว)
const MAX_BATCHES_UNTIL_DONE = 500;

// ความคืบหน้าของรอบที่กำลังรัน ให้หน้าเว็บดึงไปแสดงระหว่างรอ
let progress = null;

function isRunning() {
  return running;
}

function getProgress() {
  return running ? { ...progress } : null;
}

// untilDone = false (รอบอัตโนมัติ) ทำแค่ก้อนเดียว ที่เหลือเก็บต่อรอบหน้า
// untilDone = true  (กดเอง)        วนทำทีละก้อนจนไม่เหลือ แต่ละก้อนแยก transaction ให้ lock สั้น
async function runOnce({ untilDone = false } = {}) {
  // ถ้ารอบก่อนหน้ายังทำงานไม่จบ ให้ข้ามรอบนี้ไป ไม่งั้นสองรอบจะแย่งอัปเดตแถวเดียวกัน
  if (running) {
    return { ranAt: new Date().toISOString(), cleaned: 0, error: null, skipped: true };
  }
  running = true;

  const summary = {
    ranAt: new Date().toISOString(),
    cleaned: 0,
    remaining: 0,
    error: null,
  };
  progress = { startedAt: summary.ranAt, cleaned: 0 };

  try {
    const maxBatches = untilDone ? MAX_BATCHES_UNTIL_DONE : 1;
    for (let i = 0; i < maxBatches; i += 1) {
      const done = await cleanBatch();
      progress.cleaned += done;
      if (done < MAX_ROWS_PER_RUN) break;
    }
    summary.cleaned = progress.cleaned;

    // ยอดคงค้างหลังรอบนี้ ใช้บอกหน้าเว็บว่ายังต้องรออีกกี่รอบถึงจะหมด
    const [{ pending_count: pendingCount } = { pending_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS pending_count FROM patient p WHERE ${pendingWhere()}`
    );
    summary.remaining = Number(pendingCount) || 0;
  } catch (err) {
    // ก้อนที่ทำเสร็จก่อนหน้าถูก commit ไปแล้ว ยอดที่ทำได้จริงจึงยึดตาม progress
    summary.cleaned = progress.cleaned;
    summary.error = explainMissingTable(err, ['app_phone_clean_log']);
  } finally {
    running = false;
    progress = null;
  }

  const state = getPhoneCleanState();
  state.lastRun = summary;
  savePhoneCleanState(state);
  return summary;
}

let timer = null;

// timer ของตัวเอง แยกจากงานอัตโนมัติตัวอื่น จึงทำงานพร้อมกันได้โดยไม่ต้องรอกัน
function startScheduler({ offsetMs = 0 } = {}) {
  if (timer) return;
  const tick = () => {
    const state = getPhoneCleanState();
    if (state.enabled) runOnce().catch(() => {});
  };
  setTimeout(() => {
    if (timer) return;
    timer = setInterval(tick, 5 * 60 * 1000);
    tick();
  }, offsetMs);
}

module.exports = { runOnce, startScheduler, isRunning, getProgress, digitsOnly, pendingWhere, MAX_ROWS_PER_RUN, MAX_PHONE_DIGITS };
