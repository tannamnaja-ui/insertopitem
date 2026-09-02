const db = require('./db');
const { getIcd10AutoState, saveIcd10AutoState } = require('./dataStore');
const { ensureAutoOfficer } = require('./autoStaff');

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

    const inserted = await db.transaction(async (query) => query(
      `WITH candidates AS MATERIALIZED (
         -- จับกลุ่มที่ระดับ vn + icd10 ไม่ใช่ vn + icode
         -- ถ้าค่าบริการหลายรายการชี้ไปรหัสเดียวกัน จะได้ลงวินิจฉัยครั้งเดียว ไม่ซ้ำ
         SELECT
           o.vn,
           o.hn,
           MIN(o.vstdate) AS vstdate,
           MIN(o.vsttime) AS vsttime,
           MIN(o.main_dep) AS dep_code,
           m.icd10,
           MIN(m.icode) AS icode,
           MIN(m.diagtype) AS diagtype,
           -- ลำดับการวินิจฉัยใน VN นั้น ต่อจากที่มีอยู่เดิม (window function ทำงานหลัง GROUP BY จึงนับต่อได้ถูก)
           COALESCE((SELECT MAX(d2.diag_no) FROM ovstdiag d2 WHERE d2.vn = o.vn), 0)
             + ROW_NUMBER() OVER (PARTITION BY o.vn ORDER BY m.icd10) AS diag_no,
           -- fixed = ใช้แพทย์ที่ฟิกไว้
           -- order = ใช้แพทย์จาก "ยารายการแรกที่คีย์ของ VN นั้น" (icode ขึ้นต้นด้วย 1)
           --         เรียงตามเวลาที่สั่งจริง rxdate/rxtime แล้วค่อย last_modified กันกรณีเวลาซ้ำ
           --         ถ้ายารายการแรกไม่มีแพทย์กำกับ ค่อยถอยไปใช้แพทย์เจ้าของ visit
           CASE
             WHEN MIN(m.doctor_mode) = 'fixed' AND COALESCE(MIN(m.doctor), '') <> ''
               THEN MIN(m.doctor)
             ELSE COALESCE(
               NULLIF((
                 SELECT rx.doctor
                   FROM opitemrece rx
                  WHERE rx.vn = o.vn
                    AND rx.icode LIKE '1%'
                  ORDER BY rx.rxdate, rx.rxtime, rx.last_modified
                  LIMIT 1
               ), ''),
               MIN(o.doctor),
               ''
             )
           END AS doctor
         FROM ovst o
         JOIN opitemrece opi ON opi.vn = o.vn
         JOIN app_icd10_opi_item m ON m.icode = opi.icode
         WHERE ${conditions.join(' AND ')}
           AND NOT EXISTS (
             SELECT 1 FROM ovstdiag d
             WHERE d.vn = o.vn AND d.icd10 = m.icd10
           )
         GROUP BY o.vn, o.hn, m.icd10
       ),
       ins AS (
         -- ovst_diag_id เป็น primary key แบบ NOT NULL และไม่มี default ต้องขอเลขจาก get_serialnumber เอง
         -- คอลัมน์ที่เหลือ (hcode, dep_flag, episode, icd103, hos_guid, ...) ของจริงแทบไม่ถูกใช้ ปล่อยเป็น NULL ตามระบบ
         INSERT INTO ovstdiag (ovst_diag_id, vn, hn, vstdate, vsttime, icd10, diagtype,
             doctor, staff, diag_no, update_datetime)
         SELECT get_serialnumber('ovst_diag_id'), vn, hn, vstdate, vsttime, icd10, diagtype,
             doctor, 'auto_auto', diag_no, LOCALTIMESTAMP(0)
         FROM candidates
         RETURNING vn
       )
       INSERT INTO app_icd10_auto_log (vn, hn, icode, icd10, inserted_at)
       SELECT vn, hn, icode, icd10, LOCALTIMESTAMP(0) FROM candidates
       RETURNING vn`,
      whereParams
    ));

    summary.inserted = inserted.length;
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
