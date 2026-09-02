const db = require('./db');

const AUTO_STAFF_LOGIN = 'auto_auto';
const AUTO_STAFF_NAME = 'ระบบ Insert ข้อมูลอัตโนมัติ';

let pending = null;

async function createIfMissing() {
  const existing = await db.query(
    `SELECT officer_id FROM officer WHERE officer_login_name = ?`,
    [AUTO_STAFF_LOGIN]
  );
  if (existing.length > 0) return;

  const [{ next_id: officerId }] = await db.query(`SELECT get_serialnumber('officer_id') AS next_id`);
  try {
    await db.query(
      `INSERT INTO officer (officer_id, officer_name, officer_login_name, officer_active) VALUES (?, ?, ?, ?)`,
      [officerId, AUTO_STAFF_NAME, AUTO_STAFF_LOGIN, 'Y']
    );
  } catch (err) {
    // อีกงานอัตโนมัติหนึ่งอาจสร้างแถวนี้ไปแล้วพอดีในจังหวะเดียวกัน
    // ถ้าตรวจแล้วมีอยู่จริงถือว่าสำเร็จ ไม่ต้องโยน error ทิ้งทั้งรอบ
    const again = await db.query(
      `SELECT officer_id FROM officer WHERE officer_login_name = ?`,
      [AUTO_STAFF_LOGIN]
    );
    if (again.length === 0) throw err;
  }
}

// เจ้าหน้าที่ 'auto_auto' ถูกใช้ร่วมกันโดยงานอัตโนมัติทุกตัว (ค่า DF แพทย์, ค่าบริการ, ...)
// ถ้าปล่อยให้แต่ละงานเช็ค-แล้ว-สร้างเองแยกกัน เวลาเปิดพร้อมกันแล้วยังไม่เคยมีแถวนี้
// ทั้งสองงานจะอ่านเจอ "ไม่มี" พร้อมกันแล้วสร้างซ้อนกันเป็นสองแถว
// จึงรวมไว้ที่เดียว: ใครเรียกก่อนเป็นคนสร้าง ที่เหลือรอ promise เดียวกัน
function ensureAutoOfficer() {
  if (!pending) {
    pending = createIfMissing().catch((err) => {
      pending = null; // ให้รอบถัดไปลองใหม่ได้ ไม่ค้าง error ไว้ตลอดอายุโปรเซส
      throw err;
    });
  }
  return pending;
}

module.exports = { ensureAutoOfficer, AUTO_STAFF_LOGIN };
