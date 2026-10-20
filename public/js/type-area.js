const alertBox = document.getElementById('alert');
const autoStatusDot = document.getElementById('autoStatusDot');
const autoStatusText = document.getElementById('autoStatusText');
const lastRunText = document.getElementById('lastRunText');
const toggleBtn = document.getElementById('toggleBtn');
const runNowBtn = document.getElementById('runNowBtn');
const refreshBtn = document.getElementById('refreshBtn');
const targetFilter = document.getElementById('targetFilter');
const valueHeader = document.getElementById('valueHeader');
const pendingSummary = document.getElementById('pendingSummary');
const pendingBody = document.getElementById('pendingBody');
const pendingEmpty = document.getElementById('pendingEmpty');
const pager = document.getElementById('pager');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageText = document.getElementById('pageText');
const logBody = document.getElementById('logBody');
const logEmpty = document.getElementById('logEmpty');

let autoEnabled = false;
let currentPage = 1;

const COLUMN_LABELS = {
  patient: 'type_area',
  person: 'house_regist_type_id',
};

// ชื่อและค่ามาจากฐานข้อมูลโดยตรง ต้อง escape ก่อนยัดเข้า innerHTML
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showAlert(message, type) {
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
  setTimeout(() => alertBox.classList.remove('show'), 4000);
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
  lastRunText.textContent = `รันล่าสุด ${time} — patient ${lastRun.patientUpdated} แถว, person ${lastRun.personUpdated} แถว`;
}

async function loadStatus() {
  try {
    const res = await fetch('/api/typearea/status');
    const data = await res.json();
    if (!data.ok) return;
    autoEnabled = Boolean(data.state.enabled);
    autoStatusDot.className = 'status-dot ' + (autoEnabled ? 'complete' : 'missing');
    autoStatusText.textContent = autoEnabled ? 'เปิดใช้งานอยู่ (รันทุกวันเวลา 00:01 น.)' : 'ปิดใช้งานอยู่';
    toggleBtn.textContent = autoEnabled ? '⏸️ ปิดใช้งาน' : '▶️ เปิดใช้งาน';
    toggleBtn.className = 'btn btn-sm ' + (autoEnabled ? 'btn-danger' : 'btn-secondary');
    renderLastRun(data.state);
  } catch (err) {
    autoStatusText.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
  }
}

toggleBtn.addEventListener('click', async () => {
  if (!autoEnabled && !confirm('เปิดอัปเดตอัตโนมัติ: ระบบจะปรับคนไข้ทุกคนใน patient และ person ให้เป็นประเภท 4 ทุกวันเวลา 00:01 น.\n\nใช้เฉพาะ รพ. ที่ไม่มีคนไข้ในเขตเท่านั้น ยืนยันหรือไม่?')) return;
  toggleBtn.disabled = true;
  try {
    const res = await fetch('/api/typearea/toggle', {
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
  const warning = 'กำลังจะปรับ patient.type_area และ person.house_regist_type_id ของทุกคนที่ยังไม่เป็น 4 ให้เป็น 4 ของจริง\n\n'
    + 'ใช้เฉพาะ รพ. ที่ไม่มีคนไข้ในเขตเท่านั้น ค่าเดิมจะถูกบันทึกไว้ในตาราง app_type_area_log ยืนยันหรือไม่?';
  if (!confirm(warning)) return;
  runNowBtn.disabled = true;
  const originalText = runNowBtn.textContent;
  runNowBtn.textContent = 'กำลังอัพเดท...';
  try {
    const res = await fetch('/api/typearea/run-now', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      if (data.summary.skipped) {
        showAlert('รอบก่อนหน้ายังทำงานไม่เสร็จ ระบบข้ามรอบนี้ไป', 'error');
      } else if (data.summary.error) {
        showAlert('รันแล้ว แต่เกิดข้อผิดพลาด: ' + data.summary.error, 'error');
      } else {
        showAlert(`อัพเดทเสร็จแล้ว — patient ${data.summary.patientUpdated} แถว, person ${data.summary.personUpdated} แถว`, 'success');
      }
      currentPage = 1;
      await loadStatus();
      await loadAll();
    } else {
      showAlert(data.message || 'รันไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    runNowBtn.disabled = false;
    runNowBtn.textContent = originalText;
  }
});

async function loadPending() {
  try {
    const target = targetFilter.value;
    valueHeader.textContent = COLUMN_LABELS[target] + ' ปัจจุบัน';

    const res = await fetch(`/api/typearea/pending?target=${encodeURIComponent(target)}&page=${currentPage}`);
    const data = await res.json();
    if (!data.ok) {
      pendingSummary.textContent = data.message || 'โหลดรายการไม่สำเร็จ';
      return;
    }
    const items = data.items || [];
    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    pendingSummary.textContent = data.total === 0
      ? `ไม่มีรายการรออัปเดตใน ${target}`
      : `ยังไม่เป็น 4 ทั้งหมด ${data.total.toLocaleString('th-TH')} คน`;

    pager.classList.toggle('hidden', totalPages <= 1);
    pageText.textContent = `หน้า ${data.page} / ${totalPages}`;
    prevBtn.disabled = data.page <= 1;
    nextBtn.disabled = data.page >= totalPages;

    if (!items.length) {
      pendingBody.innerHTML = '';
      pendingEmpty.classList.remove('hidden');
      return;
    }
    pendingEmpty.classList.add('hidden');
    const offset = (data.page - 1) * data.pageSize;
    pendingBody.innerHTML = items.map((it, i) => `
      <tr>
        <td>${offset + i + 1}</td>
        <td>${esc(it.hn) || '-'}</td>
        <td>${esc(it.name) || '-'}</td>
        <td>${it.oldValue === null || it.oldValue === '' ? '(ว่าง)' : esc(it.oldValue)}</td>
      </tr>
    `).join('');
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function loadLog() {
  try {
    const res = await fetch('/api/typearea/log');
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
        <td>${esc(it.hn) || '-'}</td>
        <td>${esc(it.name) || '-'}</td>
        <td>${esc(it.targetTable)}</td>
        <td>${it.oldValue === null || it.oldValue === '' ? '(ว่าง)' : esc(it.oldValue)}</td>
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

targetFilter.addEventListener('change', () => { currentPage = 1; loadPending(); });
refreshBtn.addEventListener('click', loadAll);
prevBtn.addEventListener('click', () => { currentPage -= 1; loadPending(); });
nextBtn.addEventListener('click', () => { currentPage += 1; loadPending(); });

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadStatus();
    loadAll();
    setInterval(loadStatus, 60 * 1000);
    setInterval(loadLog, 60 * 1000);
  }
});
