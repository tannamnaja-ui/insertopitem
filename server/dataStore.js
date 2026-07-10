const fs = require('fs');
const path = require('path');

const DB_CONFIG_PATH = path.join(__dirname, 'data', 'dbconfig.json');

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

module.exports = {
  getDbConfig,
  saveDbConfig,
};
