const fs = require('fs');
const path = require('path');

const DB_CONFIG_PATH = path.join(__dirname, 'data', 'dbconfig.json');
const DF_AUTO_STATE_PATH = path.join(__dirname, 'data', 'dfauto-state.json');
const OPI_AUTO_STATE_PATH = path.join(__dirname, 'data', 'opiauto-state.json');
const ICD10_AUTO_STATE_PATH = path.join(__dirname, 'data', 'icd10auto-state.json');
const PHONE_CLEAN_STATE_PATH = path.join(__dirname, 'data', 'phoneclean-state.json');
const DEATH_UPDATE_STATE_PATH = path.join(__dirname, 'data', 'deathupdate-state.json');
const TYPE_AREA_STATE_PATH = path.join(__dirname, 'data', 'typearea-state.json');
const MENU_VISIBILITY_PATH = path.join(__dirname, 'data', 'menu-visibility.json');
const API_TOKEN_PATH = path.join(__dirname, 'data', 'apitoken.json');

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getDbConfig() {
  return readJson(DB_CONFIG_PATH, {
    type: 'mysql', host: '', port: '', database: '', user: '', password: '', charset: 'TIS620'
  });
}

function saveDbConfig(config) {
  writeJson(DB_CONFIG_PATH, config);
}

function getDfAutoState() {
  return readJson(DF_AUTO_STATE_PATH, { enabled: false, lastRun: null });
}

function saveDfAutoState(state) {
  writeJson(DF_AUTO_STATE_PATH, state);
}

function getOpiAutoState() {
  return readJson(OPI_AUTO_STATE_PATH, { enabled: false, lastRun: null });
}

function saveOpiAutoState(state) {
  writeJson(OPI_AUTO_STATE_PATH, state);
}

function getIcd10AutoState() {
  return readJson(ICD10_AUTO_STATE_PATH, { enabled: false, lastRun: null });
}

function saveIcd10AutoState(state) {
  writeJson(ICD10_AUTO_STATE_PATH, state);
}

function getPhoneCleanState() {
  return readJson(PHONE_CLEAN_STATE_PATH, { enabled: false, lastRun: null });
}

function savePhoneCleanState(state) {
  writeJson(PHONE_CLEAN_STATE_PATH, state);
}

function getDeathUpdateState() {
  return readJson(DEATH_UPDATE_STATE_PATH, { enabled: false, lastRun: null });
}

function saveDeathUpdateState(state) {
  writeJson(DEATH_UPDATE_STATE_PATH, state);
}

function getTypeAreaState() {
  return readJson(TYPE_AREA_STATE_PATH, { enabled: false, lastRun: null });
}

function saveTypeAreaState(state) {
  writeJson(TYPE_AREA_STATE_PATH, state);
}

// รายชื่อ key ของกล่องเมนูที่ถูกสั่งซ่อน เก็บฝั่งเซิร์ฟเวอร์เหมือนค่าตั้งค่าตัวอื่นของแอป
// จึงมีผลกับทุกเครื่องที่เปิดระบบนี้ ไม่ใช่แค่เบราว์เซอร์ที่กดตั้งค่า
function getMenuVisibility() {
  const data = readJson(MENU_VISIBILITY_PATH, { hidden: [] });
  return { hidden: Array.isArray(data.hidden) ? data.hidden : [] };
}

function saveMenuVisibility(state) {
  writeJson(MENU_VISIBILITY_PATH, { hidden: Array.isArray(state.hidden) ? state.hidden : [] });
}

function getApiTokenConfig() {
  return readJson(API_TOKEN_PATH, { hospitalCode: '', token: '' });
}

function saveApiTokenConfig(config) {
  writeJson(API_TOKEN_PATH, config);
}

module.exports = {
  getDbConfig,
  saveDbConfig,
  getDfAutoState,
  saveDfAutoState,
  getOpiAutoState,
  saveOpiAutoState,
  getIcd10AutoState,
  saveIcd10AutoState,
  getPhoneCleanState,
  savePhoneCleanState,
  getDeathUpdateState,
  saveDeathUpdateState,
  getTypeAreaState,
  saveTypeAreaState,
  getMenuVisibility,
  saveMenuVisibility,
  getApiTokenConfig,
  saveApiTokenConfig,
};
