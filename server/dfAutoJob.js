const crypto = require('crypto');
const db = require('./db');
const { getDfAutoState, saveDfAutoState } = require('./dataStore');
const { ensureAutoOfficer } = require('./autoStaff');
const { nowTime, nowTimestamp } = require('./sqlDialect');
const { insertRows } = require('./bulkInsert');

// insert ค่า DF อัตโนมัติ: สำหรับ VN ของวันนี้ที่ main_dep ถูกผูกไว้กับรายการ (icode) ใน app_df_item_department
// (1 ห้องผูกได้หลาย icode, 1 icode ผูกได้หลายห้อง ไม่บังคับ 1 ต่อ 1)
// หาแพทย์จากตาราง ovst_doctor_sign เฉพาะที่เป็น doctor.position_id='1' เท่านั้น
// (ถ้าไม่มีแพทย์ position_id='1' ลงนามไว้ จะไม่ดีดค่า DF ให้)
// แล้ว insert รายการที่ผูกไว้กับห้องนั้นให้แพทย์แต่ละคน (เฉพาะคู่ vn+doctor+icode ที่ยังไม่เคย insert)
let running = false;

// hos_guid รูปแบบที่ HOSxP ใช้: {UUID ตัวพิมพ์ใหญ่}
// สร้างฝั่งแอปเพื่อให้ใช้ได้ทั้ง PostgreSQL และ MariaDB โดยไม่ต้องพึ่งฟังก์ชันของฐานข้อมูล
function newHosGuid() {
  return '{' + crypto.randomUUID().toUpperCase() + '}';
}

async function runOnce() {
  // ถ้ารอบก่อนหน้ายังทำงานไม่จบ ให้ข้ามรอบนี้ไป ไม่งั้นสองรอบจะมองไม่เห็นการ insert ของกันและกัน
  // แล้วเพิ่มรายการซ้ำให้ผู้ป่วยคนเดียวกัน
  if (running) {
    return { ranAt: new Date().toISOString(), inserted: 0, error: null, skipped: true };
  }
  running = true;

  const summary = { ranAt: new Date().toISOString(), inserted: 0, error: null };
  try {
    const [{ mapped_count: mappedCount } = { mapped_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS mapped_count FROM app_df_item_department`
    );
    if (!Number(mappedCount)) return summary;

    await ensureAutoOfficer();

    summary.inserted = await db.transaction(async (query) => {
      // หารายการที่ต้องเพิ่มก่อน (ใช้ derived table แทน CTE เพื่อให้รองรับทั้งสองฐานข้อมูล)
      const candidates = await query(
        `SELECT
           o.vn, o.hn, o.vstdate, o.vsttime, o.pttype, o.main_dep AS dep_code,
           s.doctor,
           idep.icode,
           -- ราคายึดจาก nondrugitems.price เป็นหลัก (รายการค่าบริการ/หัตถการเก็บราคาไว้ที่นี่)
           COALESCE(ng.price, dg.unitprice, 0) AS unitprice,
           COALESCE(sd.income, '') AS income,
           COALESCE(sd.cost, 0) AS cost
         FROM ovst o
         JOIN (
           SELECT DISTINCT ds.vn, ds.doctor
           FROM ovst_doctor_sign ds
           JOIN doctor doc ON doc.code = ds.doctor AND doc.position_id = 1
         ) s ON s.vn = o.vn
         JOIN app_df_item_department idep ON idep.depcode = o.main_dep
         -- เพิ่มได้เฉพาะรายการที่ยังเปิดใช้งานอยู่ในคลัง (s_drugitems.istatus = 'Y')
         -- ใช้ JOIN ธรรมดา ไม่ใช่ LEFT JOIN รายการที่ถูกปิดหรือถูกลบออกจากคลังจะไม่ถูกดีดให้
         JOIN s_drugitems sd ON sd.icode = idep.icode AND sd.istatus = 'Y'
         LEFT JOIN drugitems dg ON dg.icode = idep.icode
         -- ต้องมีรหัส adp ของ สปสช. กำกับไว้ จึงจะถือว่าเปิดใช้งาน (nondrugitems.nhso_adp_code)
         -- ใช้ JOIN ธรรมดา รายการที่ยังไม่ได้ผูกรหัส adp จะไม่ถูกดีดให้
         JOIN nondrugitems ng ON ng.icode = idep.icode AND COALESCE(ng.nhso_adp_code, '') <> ''
         LEFT JOIN app_df_auto_log log
           ON log.vn = o.vn AND log.doctor = s.doctor AND log.icode = idep.icode
         WHERE o.vstdate = CURRENT_DATE
           AND log.app_df_auto_log_id IS NULL`,
        []
      );

      if (!candidates.length) return 0;
      for (const row of candidates) row.hos_guid = newHosGuid();

      await insertRows(query, {
        table: 'opitemrece',
        columns: ['hos_guid', 'vn', 'hn', 'icode', 'qty', 'drugusage', 'unitprice', 'vstdate', 'vsttime',
          'doctor', 'rxdate', 'rxtime', 'dep_code', 'pttype', 'income', 'staff', 'paidst', 'last_modified',
          'sum_price', 'cost', 'sp_use', 'idr'],
        valueTemplate: `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${nowTime()}, ?, ?, ?, ?, ?, ${nowTimestamp()}, ?, ?, ?, ?)`,
        toParams: (r) => [
          r.hos_guid, r.vn, r.hn, r.icode, 1, '', r.unitprice, r.vstdate, r.vsttime,
          r.doctor, r.vstdate, r.dep_code, r.pttype, r.income, 'auto_auto', '03',
          r.unitprice, r.cost, 'DF_AUTO', 'DF_AUTO',
        ],
        rows: candidates,
      });

      await insertRows(query, {
        table: 'app_df_auto_log',
        columns: ['vn', 'hn', 'doctor', 'icode', 'hos_guid', 'inserted_at'],
        valueTemplate: `(?, ?, ?, ?, ?, ${nowTimestamp()})`,
        toParams: (r) => [r.vn, r.hn, r.doctor, r.icode, r.hos_guid],
        rows: candidates,
      });

      return candidates.length;
    });
  } catch (err) {
    summary.error = err.message;
  } finally {
    running = false;
  }

  const state = getDfAutoState();
  state.lastRun = summary;
  saveDfAutoState(state);
  return summary;
}

let timer = null;

// งานอัตโนมัติแต่ละตัวมี timer ของตัวเอง จึงทำงานพร้อมกันได้โดยไม่ต้องรอกัน
// offsetMs ใช้เหลื่อมเวลาเริ่ม เพื่อไม่ให้ทุกงานยิงคำสั่งใหญ่เข้าฐานข้อมูลพร้อมกันเป๊ะ ๆ ทุก 5 นาที
function startScheduler({ offsetMs = 0 } = {}) {
  if (timer) return;
  const tick = () => {
    const state = getDfAutoState();
    if (state.enabled) runOnce().catch(() => {});
  };
  setTimeout(() => {
    if (timer) return;
    timer = setInterval(tick, 5 * 60 * 1000);
    tick();
  }, offsetMs);
}

module.exports = { runOnce, startScheduler };
