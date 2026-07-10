const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

async function insertExpenseForVns({ templateId, doctorCode, depcode, vns, staff }) {
  const [officer] = await db.query(
    'SELECT officer_id FROM officer WHERE officer_login_name = ?',
    [staff]
  );
  if (!officer) {
    throw new Error('ไม่พบข้อมูลเจ้าหน้าที่ในตาราง officer');
  }
  const officerId = officer.officer_id;
  const vnPlaceholders = vns.map(() => '?').join(',');

  await db.transaction(async (query) => {
    // step 1: insert opitemrece จาก ovst join template_opitem (เฉพาะ vn ที่เลือก)
    await query(
      `INSERT INTO opitemrece (hos_guid, vn, hn, icode, qty, drugusage, unitprice, vstdate, vsttime,
          doctor, rxdate, rxtime, dep_code, pttype, income, staff, paidst, last_modified, sum_price, cost, sp_use, idr)
       SELECT '{' || UPPER(gen_random_uuid()::TEXT) || '}' AS hos_guid,
           o.vn,
           o.hn,
           t.icode,
           t.qty,
           t.drugusage,
           t.price AS unitprice,
           o.vstdate,
           o.vsttime,
           ? AS doctor,
           o.vstdate AS rxdate,
           LOCALTIME(0) AS rxtime,
           ? AS dep_code,
           o.pttype,
           t.income,
           ? AS staff,
           p.paidst,
           LOCALTIMESTAMP(0) AS last_modified,
           t.sum_price,
           t.cost,
           t.template_name AS sp_use,
           'ADD_APP' AS idr
       FROM ovst o
       LEFT OUTER JOIN template_opitem t ON t.template_name = ?
       LEFT OUTER JOIN pttype p ON p.pttype = o.pttype
       WHERE o.vn IN (${vnPlaceholders})`,
      [doctorCode, depcode, staff, templateId, ...vns]
    );

    // step 2: insert opi_dispense จาก opitemrece ที่เพิ่ง insert (เฉพาะรายการยา icode ขึ้นต้นด้วย '1')
    await query(
      `INSERT INTO opi_dispense (opi_dispense_id, hos_guid, icode, qty, usage_code, dose,
          frequency_code, time_code, drug_hint_text,
          modify_datetime, modify_staff,
          price, usage_unit_code, doctor, usage_line1, usage_line2, usage_line3,
          usage_shortlist, shortlist, depcode, lang, usage_note, modify_computer)
       (SELECT get_serialnumber('opi_dispense_id') AS opi_dispense_id,
           o.hos_guid,
           o.icode,
           o.qty,
           d.opi_usage_code AS usage_code,
           d.opi_dose AS dose,
           d.opi_frequency_code AS frequency_code,
           d.opi_time_code AS time_code,
           dt.therapeutic AS drug_hint_text,
           concat(o.vstdate, ' ', o.vsttime)::timestamp AS modify_datetime,
           o.staff AS modify_staff,
           o.unitprice AS price,
           d.opi_usage_unit_code AS usage_unit_code,
           o.doctor,
           d.name1 AS usage_line1,
           d.name2 AS usage_line2,
           d.name3 AS usage_line3,
           substr(d.shortlist,1,150) AS usage_shortlist,
           substr(d.shortlist,1,250) AS shortlist,
           o.dep_code AS depcode,
           'TH' AS lang,
           o.drugusage,
           'ADD_APP' AS modify_computer
       FROM opitemrece o
       LEFT JOIN drugitems dt ON dt.icode = o.icode
       LEFT JOIN drugusage d ON d.drugusage = o.drugusage
       LEFT JOIN opi_dispense od ON od.hos_guid = o.hos_guid
       WHERE o.vn IN (${vnPlaceholders})
         AND o.icode IS NOT NULL
         AND o.idr = 'ADD_APP'
         AND o.icode LIKE '1%'
       ORDER BY modify_datetime)`,
      [...vns]
    );

    // step 3: insert officer_activity_log (1 แถวต่อ 1 รายการที่เพิ่งสร้างใน opitemrece)
    await query(
      `INSERT INTO officer_activity_log (officer_activity_log_id,
          officer_id,
          officer_activity_log_datetime,
          officer_activity_log_computer,
          officer_activity_log_table,
          officer_activity_log_operation,
          staff,
          depcode,
          officer_activity_log_parent_kv,
          active_screen_class,
          officer_activity_log_date)
       (SELECT get_serialnumber('officer_activity_log_id') AS officer_activity_log_id,
           ? AS officer_id,
           LOCALTIMESTAMP(0) AS officer_activity_log_datetime,
           'ADD_APP' AS officer_activity_log_computer,
           'opitemrece' AS officer_activity_log_table,
           'Add' AS officer_activity_log_operation,
           ? AS staff,
           ? AS depcode,
           o.vn AS officer_activity_log_parent_kv,
           'ADD_APP' AS active_screen_class,
           o.vstdate AS officer_activity_log_date
       FROM opitemrece o
       WHERE o.vn IN (${vnPlaceholders})
         AND o.idr = 'ADD_APP')`,
      [officerId, staff, depcode, ...vns]
    );

    // step 4: update ovst.staff เฉพาะ vn ที่เลือก
    await query(
      `UPDATE ovst SET staff = 'ADD_APP' WHERE vn IN (${vnPlaceholders})`,
      [...vns]
    );
  });
}

router.post('/insert-group', requireAuth, async (req, res) => {
  const { templateId, doctorCode, depcode, vns } = req.body || {};

  if (!templateId || !doctorCode || !depcode || !Array.isArray(vns) || vns.length === 0) {
    return res.status(400).json({ ok: false, message: 'ข้อมูลไม่ครบถ้วน (Template, แพทย์, ห้องที่สั่ง, รายชื่อผู้ป่วย)' });
  }

  try {
    await insertExpenseForVns({ templateId, doctorCode, depcode, vns, staff: req.session.officer.username });
    res.json({ ok: true, message: `เพิ่มข้อมูลแล้ว: บันทึกค่าใช้จ่ายสำเร็จสำหรับผู้ป่วย ${vns.length} ราย` });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึกค่าใช้จ่ายไม่สำเร็จ: ' + err.message });
  }
});

router.post('/insert-individual', requireAuth, async (req, res) => {
  const { templateId, doctorCode, depcode, vn } = req.body || {};

  if (!templateId || !doctorCode || !depcode || !vn) {
    return res.status(400).json({ ok: false, message: 'ข้อมูลไม่ครบถ้วน (Template, แพทย์, ห้องที่สั่ง, VN)' });
  }

  try {
    await insertExpenseForVns({ templateId, doctorCode, depcode, vns: [vn], staff: req.session.officer.username });
    res.json({ ok: true, message: 'เพิ่มรายการสำเร็จ' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึกค่าใช้จ่ายไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
