const db = require('./db');
const { getDfAutoState, saveDfAutoState } = require('./dataStore');

// insert ค่า DF อัตโนมัติ: สำหรับ VN ของวันนี้ที่ main_dep อยู่ในห้องที่ตั้งค่า df_auto='Y'
// หาแพทย์จากรายการที่คีย์ไว้แล้วใน opitemrece (แพทย์คีย์ยา/รายการแล้ว) และตรวจสอบว่าเป็นแพทย์จริง (มีอยู่ในตาราง doctor)
// แล้ว insert รายการจาก app_df_auto ให้แพทย์แต่ละคน (เฉพาะคู่ vn+doctor+icode ที่ยังไม่เคย insert)
async function runOnce() {
  const summary = { ranAt: new Date().toISOString(), inserted: 0, error: null };
  try {
    const deps = await db.query(`SELECT depcode FROM kskdepartment WHERE df_auto = 'Y' AND depcode_active = 'Y'`);
    const depcodes = deps.map((d) => d.depcode);
    if (!depcodes.length) return summary;

    const items = await db.query(`SELECT icode FROM app_df_auto`);
    if (!items.length) return summary;

    const depPlaceholders = depcodes.map(() => '?').join(',');

    const inserted = await db.transaction(async (query) => query(
      `WITH signers AS (
         SELECT DISTINCT o2.vn, o2.doctor
         FROM opitemrece o2
         JOIN doctor doc ON doc.code = o2.doctor
         WHERE o2.vstdate = CURRENT_DATE
           AND o2.doctor IS NOT NULL AND o2.doctor <> ''
           AND (o2.idr IS NULL OR o2.idr <> 'DF_AUTO')
       ),
       candidates AS MATERIALIZED (
         SELECT
           '{' || UPPER(gen_random_uuid()::TEXT) || '}' AS hos_guid,
           o.vn, o.hn, o.vstdate, o.vsttime, o.pttype, o.main_dep AS dep_code,
           s.doctor,
           a.icode,
           COALESCE(dg.unitprice, ng.price, 0) AS unitprice,
           COALESCE(sd.income, '') AS income,
           COALESCE(sd.cost, 0) AS cost,
           pt.paidst
         FROM ovst o
         JOIN signers s ON s.vn = o.vn
         CROSS JOIN app_df_auto a
         LEFT JOIN s_drugitems sd ON sd.icode = a.icode
         LEFT JOIN drugitems dg ON dg.icode = a.icode
         LEFT JOIN nondrugitems ng ON ng.icode = a.icode
         LEFT JOIN pttype pt ON pt.pttype = o.pttype
         LEFT JOIN app_df_auto_log log
           ON log.vn = o.vn AND log.doctor = s.doctor AND log.icode = a.icode
         WHERE o.vstdate = CURRENT_DATE
           AND o.main_dep IN (${depPlaceholders})
           AND log.app_df_auto_log_id IS NULL
       ),
       ins AS (
         INSERT INTO opitemrece (hos_guid, vn, hn, icode, qty, drugusage, unitprice, vstdate, vsttime,
             doctor, rxdate, rxtime, dep_code, pttype, income, staff, paidst, last_modified, sum_price, cost, sp_use, idr)
         SELECT hos_guid, vn, hn, icode, 1, '', unitprice, vstdate, vsttime,
             doctor, vstdate, LOCALTIME(0), dep_code, pttype, income, 'ADD_APP_DF', paidst, LOCALTIMESTAMP(0), unitprice, cost, 'DF_AUTO', 'DF_AUTO'
         FROM candidates
         RETURNING hos_guid
       )
       INSERT INTO app_df_auto_log (vn, hn, doctor, icode, hos_guid, inserted_at)
       SELECT vn, hn, doctor, icode, hos_guid, LOCALTIMESTAMP(0) FROM candidates
       RETURNING vn`,
      [...depcodes]
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
