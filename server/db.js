const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const { getDbConfig } = require('./dataStore');

let pool = null;
let poolType = null;
let poolKey = null;

function configKey(cfg) {
  return [cfg.type, cfg.host, cfg.port, cfg.database, cfg.user].join('|');
}

function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function createPool(cfg) {
  if (cfg.type === 'postgresql') {
    return new Pool({
      host: cfg.host,
      port: Number(cfg.port) || 5432,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      max: 5,
      connectionTimeoutMillis: 5000,
    });
  }
  return mysql.createPool({
    host: cfg.host,
    port: Number(cfg.port) || 3306,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionLimit: 5,
    connectTimeout: 5000,
  });
}

async function getPool() {
  const cfg = getDbConfig();
  const key = configKey(cfg);
  if (pool && key === poolKey) return { pool, type: poolType };

  if (pool) {
    try {
      if (poolType === 'postgresql') await pool.end();
      else await pool.end();
    } catch (e) { /* ignore close errors on stale pool */ }
  }

  pool = await createPool(cfg);
  poolType = cfg.type;
  poolKey = key;
  return { pool, type: poolType };
}

// รันคำสั่ง SQL แบบ parameterized โดยใช้ '?' เป็น placeholder เสมอ
// (แปลงเป็น $1,$2,... ให้อัตโนมัติเมื่อฐานข้อมูลเป็น PostgreSQL)
async function query(sql, params = []) {
  const { pool: p, type } = await getPool();
  if (type === 'postgresql') {
    const res = await p.query(toPgPlaceholders(sql), params);
    return res.rows;
  }
  const [rows] = await p.query(sql, params);
  return rows;
}

// รันหลายคำสั่งใน transaction เดียวกัน (commit ถ้าสำเร็จทั้งหมด, rollback ถ้ามี error)
// callback จะได้ฟังก์ชัน query(sql, params) ที่ผูกกับ connection เดียวกันตลอด transaction
async function transaction(callback) {
  const { pool: p, type } = await getPool();

  if (type === 'postgresql') {
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      const txQuery = async (sql, params = []) => {
        const res = await client.query(toPgPlaceholders(sql), params);
        return res.rows;
      };
      const result = await callback(txQuery);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const txQuery = async (sql, params = []) => {
      const [rows] = await conn.query(sql, params);
      return rows;
    };
    const result = await callback(txQuery);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ทดสอบการเชื่อมต่อด้วยค่าที่ส่งเข้ามาโดยตรง (ยังไม่บันทึก)
async function testConnection(cfg) {
  let testPool = null;
  try {
    testPool = await createPool(cfg);
    if (cfg.type === 'postgresql') {
      await testPool.query('SELECT 1');
      await testPool.end();
    } else {
      const conn = await testPool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      await testPool.end();
    }
    return { ok: true };
  } catch (err) {
    if (testPool) {
      try { await testPool.end(); } catch (e) { /* ignore */ }
    }
    return { ok: false, message: err.message };
  }
}

function resetPool() {
  pool = null;
  poolType = null;
  poolKey = null;
}

module.exports = { query, transaction, testConnection, resetPool };
