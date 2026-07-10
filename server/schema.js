const { getDbConfig } = require('./dataStore');
const db = require('./db');

const TABLE_NAME = 'template_opitem';

const COLUMNS = [
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
];

async function getExistingColumns() {
  const cfg = getDbConfig();
  const rows = cfg.type === 'postgresql'
    ? await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?`,
        [TABLE_NAME]
      )
    : await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
        [TABLE_NAME]
      );
  return rows.map((r) => String(r.column_name || r.COLUMN_NAME).toLowerCase());
}

async function checkStatus() {
  const existing = await getExistingColumns();
  if (existing.length === 0) {
    return { status: 'missing', missingColumns: COLUMNS.map((c) => c.name) };
  }
  const missing = COLUMNS.filter((c) => !existing.includes(c.name.toLowerCase()));
  if (missing.length === 0) {
    return { status: 'complete', missingColumns: [] };
  }
  return { status: 'incomplete', missingColumns: missing.map((c) => c.name) };
}

async function createTable() {
  const cfg = getDbConfig();
  const isPg = cfg.type === 'postgresql';
  const colDefs = COLUMNS.map((c) => `${c.name} ${isPg ? c.pg : c.mysql}`).join(',\n  ');
  await db.query(`CREATE TABLE ${TABLE_NAME} (\n  ${colDefs}\n)`);
}

async function addMissingColumns() {
  const cfg = getDbConfig();
  const isPg = cfg.type === 'postgresql';
  const { missingColumns } = await checkStatus();
  const toAdd = COLUMNS.filter((c) => missingColumns.includes(c.name) && c.name !== 'template_opitem_id');
  for (const col of toAdd) {
    const typeDef = (isPg ? col.pg : col.mysql)
      .replace(/PRIMARY KEY/i, '')
      .replace(/AUTO_INCREMENT/i, '')
      .trim();
    await db.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${col.name} ${typeDef}`);
  }
}

module.exports = { checkStatus, createTable, addMissingColumns, TABLE_NAME, COLUMNS };
