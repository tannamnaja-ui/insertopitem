// MariaDB ไม่รองรับ INSERT ที่อยู่ใน CTE และไม่รองรับ RETURNING ในตำแหน่งนั้น
// งานอัตโนมัติจึงเปลี่ยนวิธีเป็น: SELECT รายการที่จะเพิ่มออกมาก่อน แล้วค่อย INSERT กลับเข้าไป
// ทั้งหมดอยู่ในทรานแซกชันเดียวกัน การรับประกันจึงเท่าเดิม (สำเร็จทั้งหมด หรือ rollback ทั้งหมด)
//
// ส่งเป็น multi-row VALUES ทีละก้อน แทนที่จะยิงทีละแถว เพื่อไม่ให้ช้าเวลารันย้อนหลังหลายพันรายการ
// (PostgreSQL จำกัดพารามิเตอร์ที่ 65535 ตัวต่อคำสั่ง ก้อนละ 200 แถวจึงปลอดภัยกับทุกตาราง)
const DEFAULT_CHUNK_SIZE = 200;

async function insertRows(query, { table, columns, valueTemplate, toParams, rows, chunkSize = DEFAULT_CHUNK_SIZE }) {
  if (!rows.length) return 0;

  const columnList = columns.join(', ');
  let total = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map(() => valueTemplate).join(', ');
    const params = [];
    for (const row of chunk) params.push(...toParams(row));

    await query(`INSERT INTO ${table} (${columnList}) VALUES ${values}`, params);
    total += chunk.length;
  }

  return total;
}

module.exports = { insertRows };
