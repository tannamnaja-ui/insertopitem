const alertBox = document.getElementById('alert');
const autoStatusDot = document.getElementById('autoStatusDot');
const autoStatusText = document.getElementById('autoStatusText');
const lastRunText = document.getElementById('lastRunText');
const toggleBtn = document.getElementById('toggleBtn');
const runNowBtn = document.getElementById('runNowBtn');
const refreshBtn = document.getElementById('refreshBtn');
const targetFilter = document.getElementById('targetFilter');
const flagHeader = document.getElementById('flagHeader');
const pendingSummary = document.getElementById('pendingSummary');
const pendingBody = document.getElementById('pendingBody');
const pendingEmpty = document.getElementById('pendingEmpty');
const logBody = document.getElementById('logBody');
const logEmpty = document.getElementById('logEmpty');

let autoEnabled = false;

const TARGET_LABELS = {
  clinicmember: 'คลินิกพิเศษ (clinicmember)',
  person: 'person',
};

// ชื่อและค่าสถานะมาจากฐานข้อมูลโดยตรง ต้อง escape ก่อนยัดเข้า innerHTML
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let alertTimer = null;

// persist = true ให้ข้อความค้างไว้จนกว่าจะมีข้อความใหม่ (ใช้กับผลการรัน ไม่ให้หายไปก่อนอ่านทัน)
function showAlert(message, type, persist) {
  clearTimeout(alertTimer);
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
  if (!persist) alertTimer = setTimeout(() => alertBox.classList.remove('show'), 4000);
}

function renderLastRun(state) {
  const lastRun = state.lastRun;
  if (!lastRun) {
    lastRunText.textContent = 'ยังไม่เคยรัน';
    return;
  }
  const time = new Date(lastRun.ranAt).toLocaleString('th-TH');
  if (lastRun.error) {
    lastRunText.textContent = `รันล่าสุด ${time} — เกิดข้อผิดพลาด: ${lastRun.error}`;
    return;
  }
  lastRunText.textContent = `รันล่าสุด ${time} — คลินิกพิเศษ ${lastRun.clinicUpdated} แถว, person ${lastRun.personUpdated} แถว`;
}

async function loadStatus() {
  try {
    const res = await fetch('/api/deathupdate/status');
    const data = await res.json();
    if (!data.ok) return;
    autoEnabled = Boolean(data.state.enabled);
    autoStatusDot.className = 'status-dot ' + (autoEnabled ? 'complete' : 'missing');
    autoStatusText.textContent = autoEnabled ? 'เปิดใช้งานอยู่ (รันทุก 5 นาที)' : 'ปิดใช้งานอยู่';
    toggleBtn.textContent = autoEnabled ? '⏸️ ปิดใช้งาน' : '▶️ เปิดใช้งาน';
    toggleBtn.className = 'btn btn-sm ' + (autoEnabled ? 'btn-danger' : 'btn-secondary');
    renderLastRun(data.state);
  } catch (err) {
    autoStatusText.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
  }
}

toggleBtn.addEventListener('click', async () => {
  toggleBtn.disabled = true;
  try {
    const res = await fetch('/api/deathupdate/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autoEnabled }),
    });
    const data = await res.json();
    if (data.ok) {
      showAlert(data.state.enabled ? 'เปิดใช้งานการอัปเดตอัตโนมัติแล้ว' : 'ปิดใช้งานการอัปเดตอัตโนมัติแล้ว', 'success');
      await loadStatus();
    } else {
      showAlert(data.message || 'ดำเนินการไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    toggleBtn.disabled = false;
  }
});

runNowBtn.addEventListener('click', async () => {
  const warning = 'กำลังจะอัปเดตสถานะเสียชีวิตในตาราง clinicmember และ person ของจริง\n\n'
    + 'ระบบจะแตะเฉพาะแถวที่ยังไม่ถูกจำหน่าย และบันทึกไว้ในตาราง app_death_update_log ยืนยันหรือไม่?';
  if (!confirm(warning)) return;
  runNowBtn.disabled = true;
  const originalText = runNowBtn.textContent;
  runNowBtn.textContent = 'กำลังรัน...';
  try {
    const res = await fetch('/api/deathupdate/run-now', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      if (data.summary.skipped) {
        showAlert('รอบก่อนหน้ายังทำงานไม่เสร็จ ระบบข้ามรอบนี้ไป', 'error', true);
      } else if (data.summary.error) {
        showAlert('รันแล้ว แต่เกิดข้อผิดพลาด: ' + data.summary.error, 'error', true);
      } else {
        showAlert(`รันเสร็จแล้ว — คลินิกพิเศษ ${data.summary.clinicUpdated} แถว, person ${data.summary.personUpdated} แถว`, 'success', true);
      }
      await loadStatus();
      await loadAll();
    } else {
      showAlert(data.message || 'รันไม่สำเร็จ', 'error', true);
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error', true);
  } finally {
    runNowBtn.disabled = false;
    runNowBtn.textContent = originalText;
  }
});

// คอลัมน์สุดท้ายของตารางแสดงค่าที่ทำให้แถวนี้ "ยังไม่เสร็จ" ซึ่งเป็นคนละคอลัมน์กันในสองตาราง
function renderFlag(target, it) {
  if (target === 'person') {
    return 'person_discharge_id = ' + (it.flagValue === null ? '(ว่าง)' : esc(it.flagValue));
  }
  const status = it.flagValue === null ? '(ว่าง)' : esc(it.flagValue);
  const discharge = (it.discharge === null || it.discharge === '') ? '(ว่าง)' : esc(it.discharge);
  return 'status = ' + status + ', discharge = ' + discharge;
}

async function loadPending() {
  try {
    const target = targetFilter.value;
    flagHeader.textContent = target === 'person' ? 'person_discharge_id ปัจจุบัน' : 'สถานะสมาชิก / จำหน่าย ปัจจุบัน';

    const res = await fetch('/api/deathupdate/pending?target=' + encodeURIComponent(target));
    const data = await res.json();
    if (!data.ok) {
      pendingSummary.textContent = data.message || 'โหลดรายการไม่สำเร็จ';
      return;
    }
    const items = data.items || [];
    pendingSummary.textContent = data.total === 0
      ? 'ไม่มีรายการรออัปเดตใน ' + TARGET_LABELS[target]
      : (data.total > data.shown
        ? `รออัปเดตทั้งหมด ${data.total} แถว (แสดง ${data.shown} แถวแรก)`
        : `รออัปเดตทั้งหมด ${data.total} แถว`);

    if (!items.length) {
      pendingBody.innerHTML = '';
      pendingEmpty.classList.remove('hidden');
      return;
    }
    pendingEmpty.classList.add('hidden');
    pendingBody.innerHTML = items.map((it) => `
      <tr>
        <td>${esc(it.hn)}</td>
        <td>${esc(it.name) || '-'}</td>
        <td>${esc(it.deathDate) || '-'}</td>
        <td>${renderFlag(target, it)}</td>
      </tr>
    `).join('');
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function loadLog() {
  try {
    const res = await fetch('/api/deathupdate/log');
    const data = await res.json();
    if (!data.ok) return;
    const items = data.items || [];
    if (!items.length) {
      logBody.innerHTML = '';
      logEmpty.classList.remove('hidden');
      return;
    }
    logEmpty.classList.add('hidden');
    logBody.innerHTML = items.map((it) => `
      <tr>
        <td>${esc(it.hn)}</td>
        <td>${esc(it.name) || '-'}</td>
        <td>${esc(TARGET_LABELS[it.targetTable] || it.targetTable)}</td>
        <td>${esc(it.deathDate) || '-'}</td>
        <td>${it.updatedAt ? new Date(it.updatedAt).toLocaleString('th-TH') : '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    /* ตารางประวัติโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย ไม่ต้องรบกวนผู้ใช้ด้วย alert */
  }
}

function loadAll() {
  return Promise.all([loadPending(), loadLog()]);
}

targetFilter.addEventListener('change', loadPending);
refreshBtn.addEventListener('click', loadAll);

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadStatus();
    loadAll();
    setInterval(loadStatus, 60 * 1000);
    setInterval(loadAll, 60 * 1000);
  }
});
