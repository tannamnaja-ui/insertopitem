const alertBox = document.getElementById('alert');
const hostInput = document.getElementById('host');
const portInput = document.getElementById('port');
const dbInput = document.getElementById('database');
const userInput = document.getElementById('dbuser');
const passInput = document.getElementById('dbpassword');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');
const configForm = document.getElementById('configForm');
const tableActionBtn = document.getElementById('tableActionBtn');
const tableStatusDot = document.getElementById('tableStatusDot');
const tableStatusText = document.getElementById('tableStatusText');

let dbType = 'mysql';
const defaultPorts = { mysql: '3306', postgresql: '5432' };

function showAlert(message, type) {
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
}

function selectType(type) {
  const prevDefault = defaultPorts[dbType];
  dbType = type;
  document.getElementById('opt-mysql').classList.toggle('active', type === 'mysql');
  document.getElementById('opt-postgresql').classList.toggle('active', type === 'postgresql');
  if (!portInput.value || portInput.value === prevDefault) {
    portInput.value = defaultPorts[type];
  }
}

document.getElementById('opt-mysql').addEventListener('click', () => selectType('mysql'));
document.getElementById('opt-postgresql').addEventListener('click', () => selectType('postgresql'));

function getConfig() {
  return {
    type: dbType,
    host: hostInput.value.trim(),
    port: portInput.value.trim(),
    database: dbInput.value.trim(),
    user: userInput.value.trim(),
    password: passInput.value,
  };
}

async function loadExisting() {
  try {
    const res = await fetch('/api/dbconfig');
    const data = await res.json();
    if (data.ok && data.config && data.config.host) {
      const cfg = data.config;
      selectType(cfg.type || 'mysql');
      hostInput.value = cfg.host || '';
      portInput.value = cfg.port || defaultPorts[dbType];
      dbInput.value = cfg.database || '';
      userInput.value = cfg.user || '';
    } else {
      portInput.value = defaultPorts[dbType];
    }
  } catch (err) {
    portInput.value = defaultPorts[dbType];
  }
}

testBtn.addEventListener('click', async () => {
  alertBox.classList.remove('show');
  const cfg = getConfig();
  if (!cfg.host || !cfg.port || !cfg.database || !cfg.user) {
    showAlert('กรุณากรอกข้อมูลให้ครบถ้วนก่อนทดสอบ', 'error');
    return;
  }

  testBtn.disabled = true;
  const originalText = testBtn.textContent;
  testBtn.textContent = 'กำลังทดสอบ...';

  try {
    const res = await fetch('/api/dbconfig/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    showAlert(data.message, data.ok ? 'success' : 'error');
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = originalText;
  }
});

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.classList.remove('show');
  const cfg = getConfig();

  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'กำลังบันทึก...';

  try {
    const res = await fetch('/api/dbconfig/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = 'index.html';
    } else {
      showAlert(data.message || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
});

let tableStatus = null;

function renderTableButton(result) {
  tableStatus = result.status;
  tableStatusDot.className = 'status-dot ' + result.status;
  tableActionBtn.disabled = false;

  if (result.status === 'complete') {
    tableStatusText.textContent = 'มีตาราง template_opitem ครบทุกฟิลด์แล้ว';
    tableActionBtn.className = 'btn btn-block btn-gray';
    tableActionBtn.textContent = '✓ ตารางพร้อมใช้งาน';
    tableActionBtn.disabled = true;
  } else if (result.status === 'incomplete') {
    tableStatusText.textContent = 'มีตารางแล้ว แต่ขาดฟิลด์: ' + result.missingColumns.join(', ');
    tableActionBtn.className = 'btn btn-block btn-warning';
    tableActionBtn.textContent = '➕ เพิ่มฟิล';
  } else {
    tableStatusText.textContent = 'ยังไม่มีตาราง template_opitem ในฐานข้อมูลนี้';
    tableActionBtn.className = 'btn btn-block btn-warning';
    tableActionBtn.textContent = '➕ เพิ่มตาราง template_opitem';
  }
}

async function checkTableStatus() {
  tableStatusText.textContent = 'กำลังตรวจสอบ...';
  tableStatusDot.className = 'status-dot';
  tableActionBtn.disabled = true;
  tableActionBtn.className = 'btn btn-block btn-gray';
  tableActionBtn.textContent = 'ตรวจสอบตาราง...';

  try {
    const res = await fetch('/api/dbconfig/table-status');
    const data = await res.json();
    if (data.ok) {
      renderTableButton(data);
    } else {
      tableStatusText.textContent = data.message || 'ตรวจสอบตารางไม่สำเร็จ';
    }
  } catch (err) {
    tableStatusText.textContent = 'ไม่สามารถตรวจสอบตารางได้ (ยังไม่ได้ตั้งค่าการเชื่อมต่อ หรือเชื่อมต่อไม่สำเร็จ)';
  }
}

tableActionBtn.addEventListener('click', async () => {
  const endpoint = tableStatus === 'incomplete' ? '/api/dbconfig/add-columns' : '/api/dbconfig/create-table';
  tableActionBtn.disabled = true;
  const originalText = tableActionBtn.textContent;
  tableActionBtn.textContent = 'กำลังดำเนินการ...';

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showAlert(tableStatus === 'incomplete' ? 'เพิ่มฟิลด์สำเร็จ' : 'สร้างตาราง template_opitem สำเร็จ', 'success');
      await checkTableStatus();
    } else {
      showAlert(data.message || 'ดำเนินการไม่สำเร็จ', 'error');
      tableActionBtn.disabled = false;
      tableActionBtn.textContent = originalText;
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    tableActionBtn.disabled = false;
    tableActionBtn.textContent = originalText;
  }
});

loadExisting().then(checkTableStatus);
