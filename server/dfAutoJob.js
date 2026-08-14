const db = require('./db');
const { getDfAutoState, saveDfAutoState } = require('./dataStore');

const AUTO_STAFF_LOGIN = 'auto_auto';

// เช็คว่ามี officer login 'auto_auto' ไว้เป็นผู้บันทึกของรายการ insert อัตโนมัติหรือยัง ถ้ายังไม่มีให้สร้างให้
async function ensureAutoOfficer() {
  const existing = await db.query(
    `SELECT officer_id FROM officer WHERE officer_login_name = ?`,
    [AUTO_STAFF_LOGIN]
  );
  if (existing.length > 0) return;

  const [{ next_id: officerId }] = await db.query(`SELECT get_serialnumber('officer_id') AS next_id`);
  await db.query(
    `INSERT INTO officer (officer_id, officer_name, officer_login_name, officer_active) VALUES (?, ?, ?, ?)`,
    [officerId, 'ระบบ Insert ค่า DF อัตโนมัติ', AUTO_STAFF_LOGIN, 'Y']
  );
}

// insert ค่า DF อัตโนมัติ: สำหรับ VN ของวันนี้ที่ main_dep ถูกผูกไว้กับรายการ (icode) ใน app_df_item_department
// (1 ห้องผูกได้หลาย icode, 1 icode ผูกได้หลายห้อง ไม่บังคับ 1 ต่อ 1)
// หาแพทย์จากตาราง ovst_doctor_sign เฉพาะที่เป็น doctor.position_id='1' เท่านั้น
// (ถ้าไม่มีแพทย์ position_id='1' ลงนามไว้ จะไม่ดีดค่า DF ให้)
// แล้ว insert รายการที่ผูกไว้กับห้องนั้นให้แพทย์แต่ละคน (เฉพาะคู่ vn+doctor+icode ที่ยังไม่เคย insert)
async function runOnce() {
  const summary = { ranAt: new Date().toISOString(), inserted: 0, error: null };
  try {
    const [{ mapped_count: mappedCount } = { mapped_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS mapped_count FROM app_df_item_department`
    );
    if (!Number(mappedCount)) return summary;

    await ensureAutoOfficer();

    const inserted = await db.transaction(async (query) => query(
      `WITH signers AS (
         SELECT DISTINCT ds.vn, ds.doctor
         FROM ovst_doctor_sign ds
         JOIN doctor doc ON doc.code = ds.doctor AND doc.position_id = 1
       ),
       candidates AS MATERIALIZED (
         SELECT
           '{' || UPPER(gen_random_uuid()::TEXT) || '}' AS hos_guid,
           o.vn, o.hn, o.vstdate, o.vsttime, o.pttype, o.main_dep AS dep_code,
           s.doctor,
           idep.icode,
           COALESCE(dg.unitprice, ng.price, 0) AS unitprice,
           COALESCE(sd.income, '') AS income,
           COALESCE(sd.cost, 0) AS cost
         FROM ovst o
         JOIN signers s ON s.vn = o.vn
         JOIN app_df_item_department idep ON idep.depcode = o.main_dep
         LEFT JOIN s_drugitems sd ON sd.icode = idep.icode
         LEFT JOIN drugitems dg ON dg.icode = idep.icode
         LEFT JOIN nondrugitems ng ON ng.icode = idep.icode
         LEFT JOIN app_df_auto_log log
           ON log.vn = o.vn AND log.doctor = s.doctor AND log.icode = idep.icode
         WHERE o.vstdate = CURRENT_DATE
           AND log.app_df_auto_log_id IS NULL
       ),
       ins AS (
         INSERT INTO opitemrece (hos_guid, vn, hn, icode, qty, drugusage, unitprice, vstdate, vsttime,
             doctor, rxdate, rxtime, dep_code, pttype, income, staff, paidst, last_modified, sum_price, cost, sp_use, idr)
         SELECT hos_guid, vn, hn, icode, 1, '', unitprice, vstdate, vsttime,
             doctor, vstdate, LOCALTIME(0), dep_code, pttype, income, 'auto_auto', '03', LOCALTIMESTAMP(0), unitprice, cost, 'DF_AUTO', 'DF_AUTO'
         FROM candidates
         RETURNING hos_guid
       )
       INSERT INTO app_df_auto_log (vn, hn, doctor, icode, hos_guid, inserted_at)
       SELECT vn, hn, doctor, icode, hos_guid, LOCALTIMESTAMP(0) FROM candidates
       RETURNING vn`,
      []
    ));

    summary.inserted = inserted.length;
  } catch (err) {
    summary.error = err.message;
  }

  const state = getDfAutoState();
  state.lastRun = summary;
  saveDfAutoState(state);
  return summary;
}

let timer = null;

function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    const state = getDfAutoState();
    if (state.enabled) runOnce().catch(() => {});
  }, 5 * 60 * 1000);
}

module.exports = { runOnce, startScheduler };
