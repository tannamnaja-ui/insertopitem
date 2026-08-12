const fs = require('fs');
const path = require('path');

const DB_CONFIG_PATH = path.join(__dirname, 'data', 'dbconfig.json');
const DF_AUTO_STATE_PATH = path.join(__dirname, 'data', 'dfauto-state.json');
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
    type: 'mysql', host: '', port: '', database: '', user: '', password: ''
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
  getApiTokenConfig,
  saveApiTokenConfig,
};
