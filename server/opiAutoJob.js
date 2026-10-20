const crypto = require('crypto');
const db = require('./db');
const { getOpiAutoState, saveOpiAutoState } = require('./dataStore');
const { ensureAutoOfficer } = require('./autoStaff');
const { nowTime, nowTimestamp } = require('./sqlDialect');
const { insertRows } = require('./bulkInsert');

// insert ค่าบริการอัตโนมัติ: เช็คเงื่อนไขเดียวคือห้องตรวจ — VN ของวันนี้ที่ main_dep ถูกผูกไว้กับรายการ (icode)
// ใน app_opiauto_item_department (1 ห้องผูกได้หลาย icode, 1 icode ผูกได้หลายห้อง ไม่บังคับ 1 ต่อ 1)
// จำกัดกลุ่มสิทธิได้ต่อ template: ถ้าตั้งไว้ จะดีดให้เฉพาะผู้ป่วยที่สิทธิอยู่ในกลุ่มนั้น (pttype.hipdata_code)
// ไม่เช็คแพทย์เลย ไม่ต้องรอลงนาม — แพทย์ผู้สั่งใช้ ovst.doctor ของ visit นั้น (ถ้าไม่มีจะปล่อยว่าง)
// กันซ้ำจาก opitemrece โดยตรง: ถ้า VN นั้นมี icode นั้นอยู่แล้ว (ไม่ว่าใครเป็นคนลง) จะไม่เพิ่มให้อีก
// รับช่วงวันที่ได้เพื่อ insert ย้อนหลัง — ถ้าไม่ส่งมา (เช่น scheduler) จะใช้ CURRENT_DATE ของฐานข้อมูล
// ซึ่งเลื่อนตามปฏิทินเองทุกวัน
// รับ depcode ได้เพื่อจำกัดเฉพาะห้องตรวจเดียว — ถ้าไม่ส่งมาจะทำให้ทุกห้องที่ตั้งค่าไว้
// app_opiauto_log เก็บไว้เป็น audit trail ว่าแถวไหนมาจากระบบนี้ (ไม่ได้ใช้เป็นตัวกันซ้ำแล้ว)
let running = false;

// hos_guid รูปแบบที่ HOSxP ใช้: {UUID ตัวพิมพ์ใหญ่}
// สร้างฝั่งแอปเพื่อให้ใช้ได้ทั้ง PostgreSQL และ MariaDB โดยไม่ต้องพึ่งฟังก์ชันของฐานข้อมูล
function newHosGuid() {
  return '{' + crypto.randomUUID().toUpperCase() + '}';
}

async function runOnce({ dateFrom, dateTo, depcode } = {}) {
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  let from = isDate(dateFrom) ? dateFrom : null;
  let to = isDate(dateTo) ? dateTo : from;
  if (from && to && from > to) [from, to] = [to, from];
  const useRange = Boolean(from && to);
  const dep = typeof depcode === 'string' && depcode.trim() ? depcode.trim() : null;

  const conditions = [useRange ? 'o.vstdate BETWEEN ? AND ?' : 'o.vstdate = CURRENT_DATE'];
  const dateParams = useRange ? [from, to] : [];
  if (dep) conditions.push('o.main_dep = ?');
  const whereParams = dep ? [...dateParams, dep] : dateParams;

  // ถ้ารอบก่อนหน้ายังทำงานไม่จบ ให้ข้ามรอบนี้ไป ไม่งั้นสองรอบจะมองไม่เห็นการ insert ของกันและกัน
  // (เงื่อนไข NOT EXISTS ถูกประเมินภายใน transaction ของใครของมัน) แล้วเพิ่มรายการซ้ำ
  if (running) {
    return { ranAt: new Date().toISOString(), inserted: 0, error: null, skipped: true };
  }
  running = true;

  const summary = {
    ranAt: new Date().toISOString(),
    dateFrom: useRange ? from : null,
    dateTo: useRange ? to : null,
    depcode: dep,
    inserted: 0,
    error: null,
  };
  try {
    const [{ mapped_count: mappedCount } = { mapped_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS mapped_count FROM app_opiauto_item_department`
    );
    if (!Number(mappedCount)) return summary;

    await ensureAutoOfficer();

    summary.inserted = await db.transaction(async (query) => {
      const candidates = await query(
        `SELECT
           o.vn, o.hn, o.vstdate, o.vsttime, o.pttype, o.main_dep AS dep_code,
           COALESCE(o.doctor, '') AS doctor,
           idep.icode,
           -- ราคายึดจาก nondrugitems.price เป็นหลัก (รายการค่าบริการ/หัตถการเก็บราคาไว้ที่นี่)
           COALESCE(ng.price, dg.unitprice, 0) AS unitprice,
           COALESCE(sd.income, '') AS income,
           COALESCE(sd.cost, 0) AS cost,
           -- paidst ยึดจาก pttype.paidst ของสิทธิ visit นั้นเท่านั้น ไม่มีค่าสำรอง
           pt.paidst
         FROM ovst o
         JOIN app_opiauto_item_department idep ON idep.depcode = o.main_dep
         -- เพิ่มได้เฉพาะรายการที่ยังเปิดใช้งานอยู่ในคลัง (s_drugitems.istatus = 'Y')
         -- ใช้ JOIN ธรรมดา ไม่ใช่ LEFT JOIN รายการที่ถูกปิดหรือถูกลบออกจากคลังจะไม่ถูกดีดให้
         JOIN s_drugitems sd ON sd.icode = idep.icode AND sd.istatus = 'Y'
         LEFT JOIN drugitems dg ON dg.icode = idep.icode
         -- ต้องมีรหัส adp ของ สปสช. กำกับไว้ จึงจะถือว่าเปิดใช้งาน (nondrugitems.nhso_adp_code)
         -- ใช้ JOIN ธรรมดา รายการที่ยังไม่ได้ผูกรหัส adp จะไม่ถูกดีดให้
         JOIN nondrugitems ng ON ng.icode = idep.icode AND COALESCE(ng.nhso_adp_code, '') <> ''
         LEFT JOIN pttype pt ON pt.pttype = o.pttype
         WHERE ${conditions.join(' AND ')}
           AND NOT EXISTS (
             SELECT 1 FROM opitemrece opi
             WHERE opi.vn = o.vn AND opi.icode = idep.icode
           )
           -- กลุ่มสิทธิเก็บเป็นรายการคั่นจุลภาค เทียบแบบครอบด้วยจุลภาคหัวท้ายกันรหัสสั้นไปชนรหัสยาว
           -- ว่าง/NULL = ไม่จำกัด, ผู้ป่วยที่สิทธิไม่มี hipdata_code จะไม่เข้าเกณฑ์เมื่อมีการจำกัดไว้
           AND (
             COALESCE(idep.hipdata_code, '') = ''
             OR CONCAT(',', idep.hipdata_code, ',') LIKE CONCAT('%,', COALESCE(pt.hipdata_code, ''), ',%')
           )`,
        whereParams
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
          r.doctor, r.vstdate, r.dep_code, r.pttype, r.income, 'auto_auto', r.paidst,
          r.unitprice, r.cost, 'OPI_AUTO', 'OPI_AUTO',
        ],
        rows: candidates,
      });

      await insertRows(query, {
        table: 'app_opiauto_log',
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

  const state = getOpiAutoState();
  state.lastRun = summary;
  saveOpiAutoState(state);
  return summary;
}

let timer = null;

// งานอัตโนมัติแต่ละตัวมี timer ของตัวเอง จึงทำงานพร้อมกันได้โดยไม่ต้องรอกัน
// offsetMs ใช้เหลื่อมเวลาเริ่ม เพื่อไม่ให้ทุกงานยิงคำสั่งใหญ่เข้าฐานข้อมูลพร้อมกันเป๊ะ ๆ ทุก 5 นาที
function startScheduler({ offsetMs = 0 } = {}) {
  if (timer) return;
  const tick = () => {
    const state = getOpiAutoState();
    if (state.enabled) runOnce().catch(() => {});
  };
  setTimeout(() => {
    if (timer) return;
    timer = setInterval(tick, 5 * 60 * 1000);
    tick();
  }, offsetMs);
}

module.exports = { runOnce, startScheduler };
