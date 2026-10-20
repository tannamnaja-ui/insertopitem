const db = require('./db');
const { getTypeAreaState, saveTypeAreaState } = require('./dataStore');
const { nowTimestamp } = require('./sqlDialect');
const { insertRows } = require('./bulkInsert');
const { ensureTable, explainMissingTable } = require('./schema');

// ปรับ type_area ให้เป็น 4 (นอกเขต) อัตโนมัติ ทั้ง patient และ person
//
// ใช้เฉพาะ รพ. ที่ไม่มีคนไข้ในเขตรับผิดชอบเลย ทุกคนจึงต้องเป็นประเภท 4
//   1) patient : type_area <> 4            → type_area = 4
//   2) person  : house_regist_type_id <> 4 → house_regist_type_id = 4
//
// เงื่อนไขครอบค่า NULL ด้วย (IS NULL OR <> '4') เพราะใน SQL นั้น NULL <> '4' ไม่เป็นจริง
// แถวที่ยังว่างอยู่จะถูกข้ามไปตลอดกาลถ้าไม่ครอบ
// เทียบกับ '4' แบบ literal ใช้ได้ทั้งคอลัมน์ตัวเลขและตัวอักษร ทั้ง PostgreSQL และ MariaDB
//
// ค่าเดิมทุกแถวถูกเก็บลง app_type_area_log ใน transaction เดียวกับ UPDATE ก่อนเขียนทับ

let running = false;

// แถวต่อหนึ่ง transaction — ทำทีละก้อนให้ lock สั้น ไม่ค้างตาราง patient ทั้งตารางไว้นาน ๆ
const BATCH_SIZE = 2000;

// เพดานก้อนต่อรอบ กันกรณีผิดปกติ (เช่น trigger เขียนค่ากลับ) ทำให้วนไม่จบ
// รันแค่วันละครั้ง จึงตั้งไว้สูงพอให้เคลียร์ทั้งตารางได้ในรอบเดียว (1000 × 2000 = 2 ล้านแถว)
const MAX_BATCHES_PER_RUN = 1000;

// จำนวนค่าใน IN (...) ต่อหนึ่งคำสั่ง UPDATE
const UPDATE_CHUNK_SIZE = 500;

const TARGETS = {
  patient: {
    table: 'patient',
    key: 'hn',
    column: 'type_area',
    pending: `(p.type_area IS NULL OR p.type_area <> '4')`,
    // patient ไม่มีปัญหาเรื่อง hn ซ้ำ ใช้ hn เป็นทั้งคีย์และค่าที่แสดง
    selectSql: (extra = '') => `SELECT p.hn AS row_key, p.hn, p.type_area AS old_value${extra}
                                  FROM patient p`,
  },
  person: {
    table: 'person',
    key: 'person_id',
    column: 'house_regist_type_id',
    pending: `(p.house_regist_type_id IS NULL OR p.house_regist_type_id <> '4')`,
    selectSql: (extra = '') => `SELECT p.person_id AS row_key, p.patient_hn AS hn,
                                       p.house_regist_type_id AS old_value${extra}
                                  FROM person p`,
  },
};

function pendingSql(target, extra = '') {
  const t = TARGETS[target];
  return `${t.selectSql(extra)} WHERE ${t.pending}`;
}

async function countPending(target) {
  const [{ pending_count: n } = { pending_count: 0 }] = await db.query(
    `SELECT COUNT(*) AS pending_count FROM ${TARGETS[target].table} p WHERE ${TARGETS[target].pending}`
  );
  return Number(n) || 0;
}

// ทำหนึ่งก้อน: อ่านแถวที่ค้าง → เก็บ log → UPDATE คืนจำนวนแถวที่ทำ
async function runBatch(target) {
  const t = TARGETS[target];
  return db.transaction(async (query) => {
    const rows = await query(`${pendingSql(target)} ORDER BY p.${t.key} LIMIT ${BATCH_SIZE}`);
    if (!rows.length) return 0;

    await insertRows(query, {
      table: 'app_type_area_log',
      columns: ['hn', 'target_table', 'row_key', 'old_value', 'updated_at'],
      valueTemplate: `(?, ?, ?, ?, ${nowTimestamp()})`,
      toParams: (r) => [
        r.hn == null ? null : String(r.hn),
        target,
        String(r.row_key),
        r.old_value == null ? null : String(r.old_value),
      ],
      rows,
    });

    for (let i = 0; i < rows.length; i += UPDATE_CHUNK_SIZE) {
      const part = rows.slice(i, i + UPDATE_CHUNK_SIZE);
      await query(
        `UPDATE ${t.table} p SET ${t.column} = '4'
          WHERE p.${t.key} IN (${part.map(() => '?').join(',')})
            AND ${t.pending}`,
        part.map((r) => r.row_key)
      );
    }
    return rows.length;
  });
}

// ความคืบหน้าของรอบที่กำลังรัน ให้หน้าเว็บดึงไปแสดงระหว่างรอ (7 แสนแถวใช้เวลาหลายนาที)
let progress = null;

async function runTarget(target) {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i += 1) {
    const done = await runBatch(target);
    total += done;
    progress[target === 'patient' ? 'patientUpdated' : 'personUpdated'] = total;
    if (done < BATCH_SIZE) break;
  }
  return total;
}

function isRunning() {
  return running;
}

function getProgress() {
  return running ? { ...progress } : null;
}

async function runOnce() {
  // ถ้ารอบก่อนหน้ายังทำงานไม่จบ ให้ข้ามรอบนี้ไป กันสองรอบเขียนทับแถวเดียวกัน
  if (running) {
    return { ranAt: new Date().toISOString(), patientUpdated: 0, personUpdated: 0, error: null, skipped: true };
  }
  running = true;

  const summary = {
    ranAt: new Date().toISOString(),
    patientUpdated: 0,
    personUpdated: 0,
    error: null,
  };
  progress = { startedAt: summary.ranAt, patientUpdated: 0, personUpdated: 0 };

  try {
    await ensureTable('app_type_area_log');
    summary.patientUpdated = await runTarget('patient');
    summary.personUpdated = await runTarget('person');
  } catch (err) {
    // แถวที่ทำเสร็จในก้อนก่อนหน้าถูก commit ไปแล้ว ยอดที่ทำได้จริงจึงยึดตาม progress
    summary.patientUpdated = progress.patientUpdated;
    summary.personUpdated = progress.personUpdated;
    summary.error = explainMissingTable(err, ['app_type_area_log']);
  } finally {
    running = false;
    progress = null;
  }

  const state = getTypeAreaState();
  state.lastRun = summary;
  saveTypeAreaState(state);
  return summary;
}

let timer = null;

// งานนี้ไม่ต้องทำบ่อย รันวันละครั้งตอน 00:01 ตามเวลาเครื่อง server
const RUN_HOUR = 0;
const RUN_MINUTE = 1;

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(RUN_HOUR, RUN_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

// ตั้ง setTimeout ใหม่ทุกครั้งแทน setInterval 24 ชม. เพื่อไม่ให้เวลาเลื่อนสะสม
function startScheduler() {
  if (timer) return;
  const schedule = () => {
    timer = setTimeout(() => {
      const state = getTypeAreaState();
      if (state.enabled) runOnce().catch(() => {});
      schedule();
    }, msUntilNextRun());
  };
  schedule();
}

module.exports = { runOnce, startScheduler, isRunning, getProgress, pendingSql, countPending, TARGETS };
