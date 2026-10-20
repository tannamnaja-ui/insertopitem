const { getDbConfig } = require('./dataStore');
const db = require('./db');

const TABLES = {
  template_opitem: {
    name: 'template_opitem',
    columns: [
      { name: 'template_opitem_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'template_name', mysql: 'VARCHAR(100)', pg: 'VARCHAR(100)' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'name', mysql: 'VARCHAR(250)', pg: 'VARCHAR(250)' },
      { name: 'shortlist', mysql: 'VARCHAR(255)', pg: 'VARCHAR(255)' },
      { name: 'drugusage', mysql: 'VARCHAR(10)', pg: 'VARCHAR(10)' },
      { name: 'price', mysql: 'DECIMAL(12,2)', pg: 'NUMERIC(12,2)' },
      { name: 'qty', mysql: 'DECIMAL(12,2)', pg: 'NUMERIC(12,2)' },
      { name: 'sum_price', mysql: 'DECIMAL(12,2)', pg: 'NUMERIC(12,2)' },
      { name: 'staff', mysql: 'VARCHAR(30)', pg: 'VARCHAR(30)' },
      { name: 'income', mysql: 'CHAR(2)', pg: 'CHAR(2)' },
      { name: 'cost', mysql: 'DECIMAL(12,2)', pg: 'NUMERIC(12,2)' },
    ],
  },
  app_df_item_department: {
    name: 'app_df_item_department',
    columns: [
      { name: 'app_df_item_department_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'name', mysql: 'VARCHAR(250)', pg: 'VARCHAR(250)' },
      { name: 'depcode', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
    ],
  },
  app_df_auto_log: {
    name: 'app_df_auto_log',
    columns: [
      { name: 'app_df_auto_log_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'vn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'hn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'doctor', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'hos_guid', mysql: 'VARCHAR(50)', pg: 'VARCHAR(50)' },
      { name: 'inserted_at', mysql: 'DATETIME', pg: 'TIMESTAMP' },
    ],
  },
  app_opiauto_item_department: {
    name: 'app_opiauto_item_department',
    columns: [
      { name: 'app_opiauto_item_department_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'name', mysql: 'VARCHAR(250)', pg: 'VARCHAR(250)' },
      { name: 'depcode', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      // รายการรหัสกลุ่มสิทธิ (pttype.hipdata_code) คั่นด้วยจุลภาค ว่าง = ทุกกลุ่มสิทธิ
      { name: 'hipdata_code', mysql: 'VARCHAR(200)', pg: 'VARCHAR(200)' },
    ],
  },
  app_opiauto_log: {
    name: 'app_opiauto_log',
    columns: [
      { name: 'app_opiauto_log_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'vn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'hn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'doctor', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'hos_guid', mysql: 'VARCHAR(50)', pg: 'VARCHAR(50)' },
      { name: 'inserted_at', mysql: 'DATETIME', pg: 'TIMESTAMP' },
    ],
  },
  app_icd10_opi_item: {
    name: 'app_icd10_opi_item',
    columns: [
      { name: 'app_icd10_opi_item_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'name', mysql: 'VARCHAR(250)', pg: 'VARCHAR(250)' },
      { name: 'icd10', mysql: 'VARCHAR(10)', pg: 'VARCHAR(10)' },
      { name: 'diagtype', mysql: 'VARCHAR(2)', pg: 'VARCHAR(2)' },
      { name: 'doctor_mode', mysql: 'VARCHAR(10)', pg: 'VARCHAR(10)' },
      { name: 'doctor', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
    ],
  },
  app_icd10_auto_log: {
    name: 'app_icd10_auto_log',
    columns: [
      { name: 'app_icd10_auto_log_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'vn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'hn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'icd10', mysql: 'VARCHAR(10)', pg: 'VARCHAR(10)' },
      { name: 'inserted_at', mysql: 'DATETIME', pg: 'TIMESTAMP' },
    ],
  },
  app_phone_clean_log: {
    name: 'app_phone_clean_log',
    columns: [
      { name: 'app_phone_clean_log_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'hn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'old_value', mysql: 'VARCHAR(100)', pg: 'VARCHAR(100)' },
      { name: 'new_value', mysql: 'VARCHAR(100)', pg: 'VARCHAR(100)' },
      { name: 'cleaned_at', mysql: 'DATETIME', pg: 'TIMESTAMP' },
    ],
  },
  app_death_update_log: {
    name: 'app_death_update_log',
    columns: [
      { name: 'app_death_update_log_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'hn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      // 'clinicmember' หรือ 'person' บอกว่าแถวนี้ไปอัปเดตตารางไหน
      { name: 'target_table', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      { name: 'death_date', mysql: 'DATE', pg: 'DATE' },
      { name: 'updated_at', mysql: 'DATETIME', pg: 'TIMESTAMP' },
    ],
  },
  app_type_area_log: {
    name: 'app_type_area_log',
    columns: [
      { name: 'app_type_area_log_id', mysql: 'INT AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'hn', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      // 'patient' หรือ 'person' บอกว่าแถวนี้ไปอัปเดตตารางไหน
      { name: 'target_table', mysql: 'VARCHAR(20)', pg: 'VARCHAR(20)' },
      // คีย์ของแถวที่ถูกแก้ (patient = hn, person = person_id)
      { name: 'row_key', mysql: 'VARCHAR(30)', pg: 'VARCHAR(30)' },
      { name: 'old_value', mysql: 'VARCHAR(10)', pg: 'VARCHAR(10)' },
      { name: 'updated_at', mysql: 'DATETIME', pg: 'TIMESTAMP' },
    ],
  },
  kskdepartment: {
    name: 'kskdepartment',
    alterOnly: true,
    columns: [
      { name: 'df_auto', mysql: 'CHAR(1)', pg: 'CHAR(1)' },
    ],
  },
};

function getTable(tableKey) {
  const table = TABLES[tableKey];
  if (!table) throw new Error('ไม่รู้จักตาราง: ' + tableKey);
  return table;
}

async function getExistingColumns(tableName) {
  const cfg = getDbConfig();
  const rows = cfg.type === 'postgresql'
    ? await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?`,
        [tableName]
      )
    : await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
        [tableName]
      );
  return rows.map((r) => String(r.column_name || r.COLUMN_NAME).toLowerCase());
}

async function checkStatus(tableKey) {
  const table = getTable(tableKey);
  const existing = await getExistingColumns(table.name);
  if (existing.length === 0) {
    return { status: 'missing', missingColumns: table.columns.map((c) => c.name), alterOnly: Boolean(table.alterOnly) };
  }
  const missing = table.columns.filter((c) => !existing.includes(c.name.toLowerCase()));
  if (missing.length === 0) {
    return { status: 'complete', missingColumns: [], alterOnly: Boolean(table.alterOnly) };
  }
  return { status: 'incomplete', missingColumns: missing.map((c) => c.name), alterOnly: Boolean(table.alterOnly) };
}

async function createTable(tableKey) {
  const table = getTable(tableKey);
  if (table.alterOnly) {
    throw new Error(`ตาราง ${table.name} เป็นตารางระบบหลักที่มีอยู่แล้ว ไม่สามารถสร้างใหม่ได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล`);
  }
  const cfg = getDbConfig();
  const isPg = cfg.type === 'postgresql';
  const colDefs = table.columns.map((c) => `${c.name} ${isPg ? c.pg : c.mysql}`).join(',\n  ');
  await db.query(`CREATE TABLE ${table.name} (\n  ${colDefs}\n)`);
}

async function addMissingColumns(tableKey) {
  const table = getTable(tableKey);
  const cfg = getDbConfig();
  const isPg = cfg.type === 'postgresql';
  const { missingColumns } = await checkStatus(tableKey);
  const toAdd = table.columns.filter((c) => {
    if (!missingColumns.includes(c.name)) return false;
    return !/PRIMARY KEY/i.test(isPg ? c.pg : c.mysql);
  });
  for (const col of toAdd) {
    const typeDef = (isPg ? col.pg : col.mysql)
      .replace(/PRIMARY KEY/i, '')
      .replace(/AUTO_INCREMENT/i, '')
      .trim();
    await db.query(`ALTER TABLE ${table.name} ADD COLUMN ${col.name} ${typeDef}`);
  }
}

// ตาราง log ของงานอัตโนมัติ: ถ้ายังไม่มีให้สร้างเอง ถ้าคอลัมน์ไม่ครบให้เติม
// กันงานล้มทั้งรอบเพียงเพราะผู้ใช้ลืมไปกดสร้างตารางที่หน้าตั้งค่า
async function ensureTable(tableKey) {
  const { status } = await checkStatus(tableKey);
  if (status === 'missing') await createTable(tableKey);
  else if (status === 'incomplete') await addMissingColumns(tableKey);
}

// ข้อความ error ดิบตอนตารางของแอปยังไม่ถูกสร้าง อ่านแล้วไม่รู้ว่าต้องไปทำอะไรต่อ
//   PostgreSQL : relation "app_xxx" does not exist
//   MariaDB    : Table 'db.app_xxx' doesn't exist
// แปลงให้บอกทางออกตรง ๆ ว่าต้องไปกดสร้างที่หน้าตั้งค่าการเชื่อมต่อฐานข้อมูล
function explainMissingTable(err, appTables) {
  const message = String((err && err.message) || '');
  const missing = appTables.find((name) => message.includes(name));
  if (missing && /does not exist|doesn't exist|Unknown table/i.test(message)) {
    return `ยังไม่ได้สร้างตาราง ${missing} — เปิดหน้า "ตั้งค่าการเชื่อมต่อฐานข้อมูล" แล้วกดปุ่มสร้างตาราง ${missing} ก่อน จึงจะเริ่มใช้งานได้`;
  }
  return message;
}

module.exports = { checkStatus, createTable, addMissingColumns, ensureTable, explainMissingTable, TABLES };
