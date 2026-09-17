const { getDbConfig } = require('./dataStore');

// แอปนี้ต่อได้ทั้ง PostgreSQL และ MySQL/MariaDB (เลือกที่หน้าตั้งค่าการเชื่อมต่อ)
// ฟังก์ชันในไฟล์นี้คืนชิ้นส่วน SQL ที่เขียนถูกไวยากรณ์ของฐานข้อมูลที่กำลังเชื่อมต่ออยู่
// จะได้ไม่ต้องเขียนคิวรี่แยกสองชุด
function isPostgres() {
  return getDbConfig().type === 'postgresql';
}

// รวมหลายแถวเป็นสตริงเดียว ตัดค่าซ้ำออก คั่นด้วย ', '
//   PostgreSQL : STRING_AGG(DISTINCT expr, ', ')
//   MariaDB    : GROUP_CONCAT(DISTINCT expr SEPARATOR ', ')
function groupConcatDistinct(expr) {
  return isPostgres()
    ? `STRING_AGG(DISTINCT ${expr}, ', ')`
    : `GROUP_CONCAT(DISTINCT ${expr} SEPARATOR ', ')`;
}

// แปลงคอลัมน์วันที่เป็นสตริงรูปแบบ YYYY-MM-DD
//   PostgreSQL : TO_CHAR(col, 'YYYY-MM-DD')
//   MariaDB    : DATE_FORMAT(col, '%Y-%m-%d')
function dateToStr(col) {
  return isPostgres()
    ? `TO_CHAR(${col}, 'YYYY-MM-DD')`
    : `DATE_FORMAT(${col}, '%Y-%m-%d')`;
}

// ต่อสตริงหลายชิ้น (MariaDB ไม่รองรับตัวดำเนินการ || สำหรับต่อสตริง มันแปลว่า OR)
function concat(...parts) {
  return isPostgres() ? parts.join(' || ') : `CONCAT(${parts.join(', ')})`;
}

// เวลาปัจจุบันแบบ timestamp (ใช้กับคอลัมน์ last_modified, inserted_at, update_datetime)
function nowTimestamp() {
  return isPostgres() ? 'LOCALTIMESTAMP(0)' : 'NOW()';
}

// เวลาปัจจุบันแบบ time อย่างเดียว (ใช้กับคอลัมน์ rxtime)
//   MariaDB: LOCALTIME(0) จะคืนค่าเป็น datetime ไม่ใช่ time จึงต้องใช้ CURTIME()
function nowTime() {
  return isPostgres() ? 'LOCALTIME(0)' : 'CURTIME()';
}

// แปลงสตริงวันที่+เวลาเป็น timestamp
function toTimestamp(expr) {
  return isPostgres() ? `(${expr})::timestamp` : `CAST(${expr} AS DATETIME)`;
}

// สร้าง hos_guid รูปแบบที่ HOSxP ใช้: {UUID ตัวพิมพ์ใหญ่}
// ใช้ในคิวรี่แบบ INSERT ... SELECT ที่ต้องให้ฐานข้อมูลสร้าง guid ให้เองทีละแถว
function newHosGuid() {
  return isPostgres()
    ? `'{' || UPPER(gen_random_uuid()::TEXT) || '}'`
    : `CONCAT('{', UPPER(UUID()), '}')`;
}

// ชื่อรายการสำหรับแสดงผล ประกอบจากตารางคลังของ HOSxP โดยตรง (s_drugitems + drugitems)
// ซึ่งเป็นต้นทางเดียวกับช่องค้นหา จึงได้ข้อความชุดเดียวกันเสมอ
//
// สำคัญ: อย่ายึดสำเนาชื่อที่เก็บไว้ในตารางของแอปเป็นหลัก เพราะถ้าฐานข้อมูลเป็น MySQL/MariaDB
// ที่ charset ของคอลัมน์ไม่ตรงกับข้อมูลที่เขียนลงไป สำเนานั้นจะกลายเป็นอักขระอ่านไม่ออก
// (ไบต์ UTF-8 ถูกตีความเป็น TIS-620 เช่น "ยา" กลายเป็น "เธขเธฒ")
// เก็บสำเนาไว้เป็นตัวสำรองกรณีรายการถูกลบออกจากคลังไปแล้วเท่านั้น
function itemDisplayName({ stored, sd = 'sd', dg = 'dg' }) {
  const parts = concat(
    `COALESCE(${sd}.name, '')`,
    "' '",
    `COALESCE(${dg}.strength, '')`,
    "' '",
    `COALESCE(${dg}.units, '')`
  );
  return `COALESCE(NULLIF(TRIM(${parts}), ''), ${stored})`;
}

// เงื่อนไข "คอลัมน์นี้มีอักขระที่ไม่ใช่ตัวเลขปนอยู่"
// ใช้เฉพาะตอน "ตรวจจับ" เท่านั้น ส่วนการตัดตัวอักษรทิ้งทำในฝั่ง Node
// เพราะ REGEXP_REPLACE มีเฉพาะ MariaDB 10.0.5+ / MySQL 8+ แต่ตัวดำเนินการ REGEXP มีทุกเวอร์ชัน
function hasNonDigit(col) {
  return isPostgres() ? `${col} ~ '[^0-9]'` : `${col} REGEXP '[^0-9]'`;
}

// UPDATE ที่ต้องอ่านค่าจากอีกตารางหนึ่ง เขียนคนละแบบในสองฐานข้อมูล
//   PostgreSQL : UPDATE a SET ... FROM b WHERE b.x = a.y AND <where>
//   MariaDB    : UPDATE a JOIN b ON b.x = a.y SET ... WHERE <where>
// MariaDB ต้องมี alias นำหน้าคอลัมน์ที่ถูก SET ส่วน PostgreSQL ห้ามมี จึงแยก setClause กันคนละชุด
function updateFrom({ target, alias, join, joinAlias, on, setPg, setMysql, where }) {
  return isPostgres()
    ? `UPDATE ${target} ${alias} SET ${setPg} FROM ${join} ${joinAlias} WHERE ${on} AND ${where}`
    : `UPDATE ${target} ${alias} JOIN ${join} ${joinAlias} ON ${on} SET ${setMysql} WHERE ${where}`;
}

module.exports = {
  itemDisplayName,
  hasNonDigit,
  updateFrom,
  isPostgres,
  groupConcatDistinct,
  dateToStr,
  concat,
  nowTimestamp,
  nowTime,
  toTimestamp,
  newHosGuid,
};
