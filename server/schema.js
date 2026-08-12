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
  app_df_auto: {
    name: 'app_df_auto',
    columns: [
      { name: 'app_df_auto_id', mysql: 'INT(5) AUTO_INCREMENT PRIMARY KEY', pg: 'SERIAL PRIMARY KEY' },
      { name: 'icode', mysql: 'VARCHAR(7)', pg: 'VARCHAR(7)' },
      { name: 'name', mysql: 'VARCHAR(250)', pg: 'VARCHAR(250)' },
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

module.exports = { checkStatus, createTable, addMissingColumns, TABLES };
