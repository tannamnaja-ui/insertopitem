const db = require('./db');
const { getDeathUpdateState, saveDeathUpdateState } = require('./dataStore');
const { nowTimestamp, updateFrom } = require('./sqlDialect');
const { insertRows } = require('./bulkInsert');
const { explainMissingTable } = require('./schema');

// อัปเดตข้อมูลเสียชีวิตจากตาราง death ไปยัง clinicmember และ person อัตโนมัติ
//
// 1) คลินิกพิเศษ : ผู้ป่วยที่มีชื่อในตาราง death ให้ปิดสถานะสมาชิกคลินิกและจำหน่าย
//                 clinic_member_status_id = 3, discharge = 'Y'
// 2) person      : ผู้ป่วยที่มีชื่อในตาราง death ให้ลงว่าเสียชีวิตและจำหน่าย
//                 death = 'Y', person_discharge_id = 1, discharge_date/death_date = วันที่เสียชีวิต
//
// ตาราง death อาจมีหลายแถวต่อ 1 HN (คีย์ซ้ำ/แก้ไขภายหลัง) ทุกคิวรี่จึงยุบเหลือแถวเดียวต่อ HN
// ด้วย MIN(death_date) ก่อนเสมอ ไม่งั้นการ JOIN จะทำให้นับซ้ำ และ UPDATE จะได้วันที่แบบสุ่ม
//
// เงื่อนไขกันทำซ้ำต่างจากคิวรี่ต้นฉบับสองจุด (ตั้งใจแก้):
//   - clinicmember ใช้ OR ไม่ใช่ AND เพราะแถวที่ status=3 แล้วแต่ discharge ยังไม่ 'Y'
//     (หรือกลับกัน) ถือว่ายังทำไม่ครบ ต้องถูกหยิบมาทำต่อ
//   - ครอบ COALESCE ให้ค่า NULL ด้วย เพราะใน SQL นั้น NULL <> 3 ไม่เป็นจริง
//     แถวที่คอลัมน์ยังว่างอยู่จึงถูกข้ามไปตลอดกาลถ้าไม่ครอบ
// และ UPDATE ทุกคำสั่งมีเงื่อนไขกันทำซ้ำติดไปด้วย (ต้นฉบับมีเฉพาะใน SELECT)
// ไม่งั้นทุก 5 นาทีจะเขียนทับแถวเดิมทั้งตารางซ้ำ ๆ โดยเปล่าประโยชน์

let running = false;

// ตาราง death ยุบเหลือแถวเดียวต่อ HN ใช้ร่วมกันทั้งคิวรี่นับ คิวรี่แสดงผล และคำสั่ง UPDATE
const DEATH_SRC = '(SELECT hn, MIN(death_date) AS death_date FROM death GROUP BY hn)';

// แถวคลินิกพิเศษที่ยังปิดสถานะไม่ครบ
const CLINIC_PENDING = `(COALESCE(c.clinic_member_status_id, 0) <> 3 OR COALESCE(c.discharge, '') <> 'Y')`;

// แถว person ที่ยังไม่ถูกจำหน่ายด้วยเหตุเสียชีวิต
const PERSON_PENDING = `COALESCE(p.person_discharge_id, 0) <> 1`;

// รายชื่อที่รออัปเดตในตาราง clinicmember (1 คนอาจอยู่หลายคลินิก = หลายแถว)
function clinicPendingSql(extraColumns = '') {
  return `SELECT c.hn, d.death_date${extraColumns}
            FROM clinicmember c
            JOIN ${DEATH_SRC} d ON d.hn = c.hn
           WHERE ${CLINIC_PENDING}`;
}

// รายชื่อที่รออัปเดตในตาราง person
function personPendingSql(extraColumns = '') {
  return `SELECT p.patient_hn AS hn, d.death_date${extraColumns}
            FROM person p
            JOIN ${DEATH_SRC} d ON d.hn = p.patient_hn
           WHERE ${PERSON_PENDING}`;
}

async function runOnce() {
  // ถ้ารอบก่อนหน้ายังทำงานไม่จบ ให้ข้ามรอบนี้ไป กันสองรอบเขียนทับแถวเดียวกัน
  if (running) {
    return { ranAt: new Date().toISOString(), clinicUpdated: 0, personUpdated: 0, error: null, skipped: true };
  }
  running = true;

  const summary = {
    ranAt: new Date().toISOString(),
    clinicUpdated: 0,
    personUpdated: 0,
    error: null,
  };

  try {
    const result = await db.transaction(async (query) => {
      // อ่านรายชื่อที่จะถูกแตะออกมาก่อน ใช้ทั้งเป็นยอดสรุปและเป็น log
      // อยู่ใน transaction เดียวกับ UPDATE จึงเห็นข้อมูลชุดเดียวกันเป๊ะ ๆ ยอดไม่มีทางเพี้ยน
      const clinicRows = await query(clinicPendingSql());
      const personRows = await query(personPendingSql());

      const logRows = [
        ...clinicRows.map((r) => ({ hn: r.hn, target: 'clinicmember', deathDate: r.death_date })),
        ...personRows.map((r) => ({ hn: r.hn, target: 'person', deathDate: r.death_date })),
      ];

      if (logRows.length) {
        await insertRows(query, {
          table: 'app_death_update_log',
          columns: ['hn', 'target_table', 'death_date', 'updated_at'],
          valueTemplate: `(?, ?, ?, ${nowTimestamp()})`,
          toParams: (r) => [r.hn, r.target, r.deathDate],
          rows: logRows,
        });
      }

      if (clinicRows.length) {
        await query(
          `UPDATE clinicmember c
              SET clinic_member_status_id = 3, discharge = 'Y'
            WHERE c.hn IN (SELECT hn FROM death)
              AND ${CLINIC_PENDING}`
        );
      }

      if (personRows.length) {
        await query(updateFrom({
          target: 'person',
          alias: 'p',
          join: DEATH_SRC,
          joinAlias: 'd',
          on: 'd.hn = p.patient_hn',
          setPg: `death = 'Y', person_discharge_id = 1, discharge_date = d.death_date, death_date = d.death_date`,
          setMysql: `p.death = 'Y', p.person_discharge_id = 1, p.discharge_date = d.death_date, p.death_date = d.death_date`,
          where: PERSON_PENDING,
        }));
      }

      return { clinic: clinicRows.length, person: personRows.length };
    });

    summary.clinicUpdated = result.clinic;
    summary.personUpdated = result.person;
  } catch (err) {
    summary.error = explainMissingTable(err, ['app_death_update_log']);
  } finally {
    running = false;
  }

  const state = getDeathUpdateState();
  state.lastRun = summary;
  saveDeathUpdateState(state);
  return summary;
}

let timer = null;

// timer ของตัวเอง แยกจากงานอัตโนมัติตัวอื่น จึงทำงานพร้อมกันได้โดยไม่ต้องรอกัน
function startScheduler({ offsetMs = 0 } = {}) {
  if (timer) return;
  const tick = () => {
    const state = getDeathUpdateState();
    if (state.enabled) runOnce().catch(() => {});
  };
  setTimeout(() => {
    if (timer) return;
    timer = setInterval(tick, 5 * 60 * 1000);
    tick();
  }, offsetMs);
}

module.exports = { runOnce, startScheduler, clinicPendingSql, personPendingSql };
