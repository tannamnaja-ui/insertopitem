const alertBox = document.getElementById('alert');
const autoStatusDot = document.getElementById('autoStatusDot');
const autoStatusText = document.getElementById('autoStatusText');
const lastRunText = document.getElementById('lastRunText');
const toggleBtn = document.getElementById('toggleBtn');
const runNowBtn = document.getElementById('runNowBtn');
const refreshBtn = document.getElementById('refreshBtn');
const pendingSummary = document.getElementById('pendingSummary');
const pendingBody = document.getElementById('pendingBody');
const pendingEmpty = document.getElementById('pendingEmpty');
const logBody = document.getElementById('logBody');
const logEmpty = document.getElementById('logEmpty');

let autoEnabled = false;
let maxRowsPerRun = 2000;
let maxPhoneDigits = 10;

// เบอร์โทรในฐานข้อมูลเป็นข้อความอิสระที่เจ้าหน้าที่พิมพ์เอง อาจมี < > & ปนมาได้
// ต้อง escape ก่อนยัดเข้า innerHTML ไม่งั้นหน้าเว็บเพี้ยน
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

let wasRunning = false;
let pollTimer = null;

// ระหว่างที่งานรันอยู่ ปิดปุ่มไว้และแสดงยอดที่ตัดไปแล้ว พอจบรอบให้แสดงผลค้างไว้และโหลดรายการใหม่
function renderRunning(data) {
  const running = Boolean(data.running);
  runNowBtn.disabled = running;
  if (running) {
    const p = data.progress || {};
    runNowBtn.textContent = 'กำลังตัด...';
    lastRunText.textContent = `กำลังตัดจนหมด — ตัดไปแล้ว ${(p.cleaned || 0).toLocaleString('th-TH')} รายการ`
      + ' (ปิดหน้านี้ได้ งานยังทำต่อ)';
    if (!pollTimer) pollTimer = setInterval(loadStatus, 3000);
  } else {
    runNowBtn.textContent = '▶️ รันเดี๋ยวนี้ (ทำจนหมด)';
    clearInterval(pollTimer);
    pollTimer = null;
    if (wasRunning) {
      const lastRun = data.state.lastRun || {};
      const cleaned = (lastRun.cleaned || 0).toLocaleString('th-TH');
      if (lastRun.error) showAlert(`ตัดไป ${cleaned} รายการ แล้วเกิดข้อผิดพลาด: ${lastRun.error}`, 'error', true);
      else showAlert(`รันเสร็จแล้ว ตัดไป ${cleaned} รายการ`, 'success', true);
      loadAll();
    }
  }
  wasRunning = running;
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
  const remain = Number(lastRun.remaining) || 0;
  const remainText = remain > 0 ? ` (ยังเหลืออีก ${remain} รายการ จะทยอยทำในรอบถัดไป)` : '';
  lastRunText.textContent = `รันล่าสุด ${time} — ตัดไป ${lastRun.cleaned} รายการ${remainText}`;
}

async function loadStatus() {
  try {
    const res = await fetch('/api/phoneclean/status');
    const data = await res.json();
    if (!data.ok) return;
    autoEnabled = Boolean(data.state.enabled);
    maxRowsPerRun = Number(data.maxRowsPerRun) || maxRowsPerRun;
    maxPhoneDigits = Number(data.maxPhoneDigits) || maxPhoneDigits;
    autoStatusDot.className = 'status-dot ' + (autoEnabled ? 'complete' : 'missing');
    autoStatusText.textContent = autoEnabled
      ? `เปิดใช้งานอยู่ (รันทุก 5 นาที ครั้งละไม่เกิน ${maxRowsPerRun} รายการ ตัดเหลือไม่เกิน ${maxPhoneDigits} หลัก)`
      : 'ปิดใช้งานอยู่';
    toggleBtn.textContent = autoEnabled ? '⏸️ ปิดใช้งาน' : '▶️ เปิดใช้งาน';
    toggleBtn.className = 'btn btn-sm ' + (autoEnabled ? 'btn-danger' : 'btn-secondary');
    renderLastRun(data.state);
    renderRunning(data);
  } catch (err) {
    autoStatusText.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
  }
}

toggleBtn.addEventListener('click', async () => {
  toggleBtn.disabled = true;
  try {
    const res = await fetch('/api/phoneclean/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autoEnabled }),
    });
    const data = await res.json();
    if (data.ok) {
      showAlert(data.state.enabled ? 'เปิดใช้งานการตัดอัตโนมัติแล้ว' : 'ปิดใช้งานการตัดอัตโนมัติแล้ว', 'success');
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
  if (!confirm('กำลังจะแก้ไขเบอร์โทรในตาราง patient ของจริง โดยวนตัดจนไม่เหลือรายการค้าง\n\nค่าเดิมจะถูกบันทึกไว้ในตาราง app_phone_clean_log ก่อนเขียนทับ ยืนยันหรือไม่?')) return;
  runNowBtn.disabled = true;
  try {
    const res = await fetch('/api/phoneclean/run-now', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'สั่งรันไม่สำเร็จ', 'error', true);
      runNowBtn.disabled = false;
      return;
    }
    showAlert(data.alreadyRunning ? 'กำลังรันอยู่แล้ว รอให้รอบนี้เสร็จก่อน' : 'เริ่มตัดแล้ว ระบบจะทำจนหมด', 'success');
    await loadStatus();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error', true);
    runNowBtn.disabled = false;
  }
});

async function loadPending() {
  try {
    const res = await fetch('/api/phoneclean/pending');
    const data = await res.json();
    if (!data.ok) {
      pendingSummary.textContent = data.message || 'โหลดรายการไม่สำเร็จ';
      return;
    }
    const items = data.items || [];
    pendingSummary.textContent = data.total === 0
      ? 'ไม่มีรายการรอตัด'
      : (data.total > data.shown
        ? `รอตัดทั้งหมด ${data.total} รายการ (แสดง ${data.shown} รายการแรก)`
        : `รอตัดทั้งหมด ${data.total} รายการ`);

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
        <td>${esc(it.oldValue)}</td>
        <td><strong>${esc(it.newValue) || '<span style="color:var(--danger)">(ว่าง — ไม่มีตัวเลขเลย)</span>'}</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function loadLog() {
  try {
    const res = await fetch('/api/phoneclean/log');
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
        <td>${esc(it.oldValue)}</td>
        <td>${esc(it.newValue) || '-'}</td>
        <td>${it.cleanedAt ? new Date(it.cleanedAt).toLocaleString('th-TH') : '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    /* ตารางประวัติโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย ไม่ต้องรบกวนผู้ใช้ด้วย alert */
  }
}

function loadAll() {
  return Promise.all([loadPending(), loadLog()]);
}

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
