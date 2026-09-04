const db = require('./db');
const { getIcd10AutoState, saveIcd10AutoState } = require('./dataStore');
const { ensureAutoOfficer } = require('./autoStaff');
const { nowTimestamp } = require('./sqlDialect');
const { insertRows } = require('./bulkInsert');

// insert ICD10 อัตโนมัติ "ตามค่าบริการ" ที่ผู้ป่วยได้รับ
//
// เงื่อนไข: VN ไหนมีรายการค่าบริการ (icode) ที่ถูกผูก ICD10 ไว้ใน app_icd10_opi_item
// อยู่ใน opitemrece แล้ว ให้เพิ่มรหัสวินิจฉัยนั้นลง ovstdiag ให้อัตโนมัติ
// (1 icode ผูกได้หลาย ICD10, 1 ICD10 ผูกได้หลาย icode ไม่บังคับ 1 ต่อ 1)
//
// แพทย์ผู้วินิจฉัยตั้งได้ต่อ template: ฟิกชื่อแพทย์ไว้ หรือใช้แพทย์จากยารายการแรกที่คีย์ของ VN นั้น
// เลือกเจาะจงได้ว่าจะทำเฉพาะค่าบริการรายการไหน (icode) ไม่ส่งมาคือทำทุกรายการที่ผูกไว้
// ไม่เช็คแพทย์ ไม่เช็คห้องตรวจ — ยึดจากรายการค่าบริการที่เกิดขึ้นจริงอย่างเดียว
// กันซ้ำจาก ovstdiag โดยตรง: ถ้า VN นั้นมี ICD10 นั้นอยู่แล้ว (ไม่ว่าใครเป็นคนลง) จะไม่เพิ่มอีก
// รับช่วงวันที่ได้เพื่อเพิ่มย้อนหลัง — ไม่ส่งมา (เช่น scheduler) จะใช้ CURRENT_DATE ซึ่งเลื่อนตามปฏิทินเอง
// app_icd10_auto_log เก็บไว้เป็น audit trail ว่าแถวไหนมาจากระบบนี้

let running = false;

// แบ่ง list ยาว ๆ เป็นก้อนก่อนเอาไปใส่ใน IN (...) กันคำสั่งยาวเกินและพารามิเตอร์เกินลิมิต
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// แพทย์ของยารายการแรกที่คีฟใน VN นั้น (icode ขึ้นต้นด้วย 1)
// เรียงตามเวลาที่สั่งจริง rxdate/rxtime แล้วค่อย last_modified กันกรณีเวลาซ้ำ
// ดึงมาทั้งชุดแล้วหยิบตัวแรกของแต่ละ VN ในแอป เพื่อเลี่ยง "first row per group" ที่เขียนต่างกันในแต่ละฐานข้อมูล
async function loadFirstDrugDoctors(query, vns) {
  const firstDoctorByVn = new Map();

  for (const part of chunk(vns, 500)) {
    const placeholders = part.map(() => '?').join(',');
    const rows = await query(
      `SELECT rx.vn, rx.doctor
         FROM opitemrece rx
        WHERE rx.vn IN (${placeholders})
          AND rx.icode LIKE '1%'
        ORDER BY rx.vn, rx.rxdate, rx.rxtime, rx.last_modified`,
      part
    );
    for (const r of rows) {
      if (!firstDoctorByVn.has(r.vn)) firstDoctorByVn.set(r.vn, r.doctor || '');
    }
  }

  return firstDoctorByVn;
}

// ลำดับวินิจฉัยสูงสุดที่ VN นั้นมีอยู่แล้ว ใช้เป็นฐานให้ diag_no ของรายการใหม่นับต่อ ไม่ทับของเดิม
async function loadMaxDiagNo(query, vns) {
  const maxByVn = new Map();

  for (const part of chunk(vns, 500)) {
    const placeholders = part.map(() => '?').join(',');
    const rows = await query(
      `SELECT vn, MAX(diag_no) AS max_no FROM ovstdiag WHERE vn IN (${placeholders}) GROUP BY vn`,
      part
    );
    for (const r of rows) maxByVn.set(r.vn, Number(r.max_no) || 0);
  }

  return maxByVn;
}

async function runOnce({ dateFrom, dateTo, icode } = {}) {
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  let from = isDate(dateFrom) ? dateFrom : null;
  let to = isDate(dateTo) ? dateTo : from;
  if (from && to && from > to) [from, to] = [to, from];
  const useRange = Boolean(from && to);
  const item = typeof icode === 'string' && icode.trim() ? icode.trim() : null;

  const conditions = [useRange ? 'o.vstdate BETWEEN ? AND ?' : 'o.vstdate = CURRENT_DATE'];
  const dateParams = useRange ? [from, to] : [];
  if (item) conditions.push('m.icode = ?');
  const whereParams = item ? [...dateParams, item] : dateParams;

  // ถ้ารอบก่อนหน้ายังทำงานไม่จบ ให้ข้ามรอบนี้ไป ไม่งั้นสองรอบจะมองไม่เห็นการ insert ของกันและกัน
  if (running) {
    return { ranAt: new Date().toISOString(), inserted: 0, error: null, skipped: true };
  }
  running = true;

  const summary = {
    ranAt: new Date().toISOString(),
    dateFrom: useRange ? from : null,
    dateTo: useRange ? to : null,
    icode: item,
    inserted: 0,
    error: null,
  };
  try {
    const [{ mapped_count: mappedCount } = { mapped_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS mapped_count FROM app_icd10_opi_item`
    );
    if (!Number(mappedCount)) return summary;

    await ensureAutoOfficer();

    summary.inserted = await db.transaction(async (query) => {
      // จับกลุ่มที่ระดับ vn + icd10 ไม่ใช่ vn + icode
      // ถ้าค่าบริการหลายรายการชี้ไปรหัสเดียวกัน จะได้ลงวินิจฉัยครั้งเดียว ไม่ซ้ำ
      const candidates = await query(
        `SELECT
           o.vn,
           o.hn,
           MIN(o.vstdate) AS vstdate,
           MIN(o.vsttime) AS vsttime,
           m.icd10,
           MIN(m.icode) AS icode,
           MIN(m.diagtype) AS diagtype,
           MIN(m.doctor_mode) AS doctor_mode,
           MIN(m.doctor) AS fixed_doctor,
           MIN(COALESCE(o.doctor, '')) AS visit_doctor
         FROM ovst o
         JOIN opitemrece opi ON opi.vn = o.vn
         JOIN app_icd10_opi_item m ON m.icode = opi.icode
         WHERE ${conditions.join(' AND ')}
           AND NOT EXISTS (
             SELECT 1 FROM ovstdiag d
             WHERE d.vn = o.vn AND d.icd10 = m.icd10
           )
         GROUP BY o.vn, o.hn, m.icd10
         ORDER BY o.vn, m.icd10`,
        whereParams
      );

      if (!candidates.length) return 0;

      const vns = [...new Set(candidates.map((r) => r.vn))];
      const needsOrderDoctor = candidates.some((r) => r.doctor_mode !== 'fixed' || !r.fixed_doctor);
      const firstDoctorByVn = needsOrderDoctor ? await loadFirstDrugDoctors(query, vns) : new Map();
      const maxDiagNoByVn = await loadMaxDiagNo(query, vns);

      // เดินไล่ตามลำดับที่คิวรี่เรียงมาแล้ว (vn, icd10) เพื่อให้ diag_no ของแต่ละ VN นับต่อเนื่องกัน
      const runningNoByVn = new Map();
      for (const r of candidates) {
        r.doctor = (r.doctor_mode === 'fixed' && r.fixed_doctor)
          ? r.fixed_doctor
          : (firstDoctorByVn.get(r.vn) || r.visit_doctor || '');

        const next = (runningNoByVn.get(r.vn) || maxDiagNoByVn.get(r.vn) || 0) + 1;
        runningNoByVn.set(r.vn, next);
        r.diag_no = next;
      }

      // ovst_diag_id เป็น primary key แบบ NOT NULL และไม่มี default ต้องขอเลขจาก get_serialnumber เอง
      // คอลัมน์ที่เหลือ (hcode, dep_flag, episode, icd103, hos_guid, ...) ของจริงแทบไม่ถูกใช้ ปล่อยเป็น NULL ตามระบบ
      await insertRows(query, {
        table: 'ovstdiag',
        columns: ['ovst_diag_id', 'vn', 'hn', 'vstdate', 'vsttime', 'icd10', 'diagtype',
          'doctor', 'staff', 'diag_no', 'update_datetime'],
        valueTemplate: `(get_serialnumber('ovst_diag_id'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ${nowTimestamp()})`,
        toParams: (r) => [r.vn, r.hn, r.vstdate, r.vsttime, r.icd10, r.diagtype, r.doctor, 'auto_auto', r.diag_no],
        rows: candidates,
      });

      await insertRows(query, {
        table: 'app_icd10_auto_log',
        columns: ['vn', 'hn', 'icode', 'icd10', 'inserted_at'],
        valueTemplate: `(?, ?, ?, ?, ${nowTimestamp()})`,
        toParams: (r) => [r.vn, r.hn, r.icode, r.icd10],
        rows: candidates,
      });

      return candidates.length;
    });
  } catch (err) {
    summary.error = err.message;
  } finally {
    running = false;
  }

  const state = getIcd10AutoState();
  state.lastRun = summary;
  saveIcd10AutoState(state);
  return summary;
}

let timer = null;

// งานอัตโนมัติแต่ละตัวมี timer ของตัวเอง จึงทำงานพร้อมกันได้โดยไม่ต้องรอกัน
// offsetMs ใช้เหลื่อมเวลาเริ่ม เพื่อไม่ให้ทุกงานยิงคำสั่งใหญ่เข้าฐานข้อมูลพร้อมกันเป๊ะ ๆ ทุก 5 นาที
function startScheduler({ offsetMs = 0 } = {}) {
  if (timer) return;
  const tick = () => {
    const state = getIcd10AutoState();
    if (state.enabled) runOnce().catch(() => {});
  };
  setTimeout(() => {
    if (timer) return;
    timer = setInterval(tick, 5 * 60 * 1000);
    tick();
  }, offsetMs);
}

module.exports = { runOnce, startScheduler };
