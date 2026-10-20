const alertBox = document.getElementById('alert');
const autoStatusDot = document.getElementById('autoStatusDot');
const autoStatusText = document.getElementById('autoStatusText');
const lastRunText = document.getElementById('lastRunText');
const toggleBtn = document.getElementById('toggleBtn');
const runNowBtn = document.getElementById('runNowBtn');
const statusFilter = document.getElementById('statusFilter');
const itemFilter = document.getElementById('itemFilter');
const registryDateFrom = document.getElementById('registryDateFrom');
const registryDateTo = document.getElementById('registryDateTo');
const resetDateBtn = document.getElementById('resetDateBtn');
const registryBody = document.getElementById('registryBody');
const registryEmpty = document.getElementById('registryEmpty');

let autoEnabled = false;
// ถ้าผู้ใช้ยังไม่เคยแก้ช่องวันที่เอง ให้ดีฟอลต์เลื่อนตามวันปัจจุบันไปเรื่อย ๆ (หน้าเปิดค้างข้ามวันก็ยังถูก)
let dateTouchedByUser = false;

const STATUS_LABELS = {
  done: '✅ เพิ่ม ICD10 ครบแล้ว',
  pending: '⏳ ยังไม่ครบ',
};

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
  const scope = lastRun.dateFrom
    ? (lastRun.dateFrom === lastRun.dateTo ? `วันที่ ${lastRun.dateFrom}` : `ช่วง ${lastRun.dateFrom} ถึง ${lastRun.dateTo}`)
    : 'วันปัจจุบัน';
  if (lastRun.error) {
    lastRunText.textContent = `รันล่าสุด ${time} (${scope}) — เกิดข้อผิดพลาด: ${lastRun.error}`;
  } else {
    lastRunText.textContent = `รันล่าสุด ${time} (${scope}) — เพิ่มรายการใหม่ ${lastRun.inserted} รายการ`;
  }
}

async function loadStatus() {
  try {
    const res = await fetch('/api/icd10auto/status');
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
    const res = await fetch('/api/icd10auto/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autoEnabled }),
    });
    const data = await res.json();
    if (data.ok) {
      showAlert(data.state.enabled ? 'เปิดใช้งาน Insert อัตโนมัติแล้ว' : 'ปิดใช้งาน Insert อัตโนมัติแล้ว', 'success');
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
  const today = todayLocalDateStr();
  const dateFrom = registryDateFrom.value || today;
  const dateTo = registryDateTo.value || dateFrom;
  const icode = itemFilter.value;
  const scopeLabel = icode
    ? `ค่าบริการ "${itemFilter.options[itemFilter.selectedIndex].text}"`
    : 'ทุกค่าบริการ';
  if (dateFrom !== today || dateTo !== today) {
    const label = dateFrom === dateTo ? `วันที่ ${dateFrom}` : `ช่วง ${dateFrom} ถึง ${dateTo}`;
    if (!confirm(`กำลังจะ insert ICD10 ย้อนหลังสำหรับ${label} — ${scopeLabel}

รายการที่เพิ่มแล้วจะไม่ถูกเพิ่มซ้ำ แต่การเพิ่มย้อนหลังมีผลกับข้อมูลจริง ยืนยันหรือไม่?`)) return;
  }
  runNowBtn.disabled = true;
  const originalText = runNowBtn.textContent;
  runNowBtn.textContent = 'กำลังรัน...';
  try {
    const res = await fetch('/api/icd10auto/run-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom, dateTo, icode }),
    });
    const data = await res.json();
    if (data.ok) {
      if (data.summary.skipped) {
        showAlert('รอบก่อนหน้ายังทำงานไม่เสร็จ ระบบข้ามรอบนี้ไปเพื่อไม่ให้เพิ่มรายการซ้ำ', 'error', true);
      } else if (data.summary.error) {
        showAlert('รันแล้ว แต่เกิดข้อผิดพลาด: ' + data.summary.error, 'error', true);
      } else {
        showAlert(`รันเสร็จแล้ว เพิ่มรายการใหม่ ${data.summary.inserted} รายการ`, 'success', true);
      }
      await loadStatus();
      await loadRegistry();
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

function todayLocalDateStr() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

// ค่าบริการที่เลือกได้ = ทุกรายการที่ถูกผูกรหัส ICD10 ไว้ในหน้าตั้งค่า
async function loadItems() {
  try {
    const res = await fetch('/api/icd10auto/items');
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'โหลดรายการค่าบริการไม่สำเร็จ', 'error');
      return;
    }
    const current = itemFilter.value;
    const options = (data.items || []).map((d) =>
      `<option value="${d.icode}">${d.name} (${d.icd10Count} รหัส)</option>`
    ).join('');
    itemFilter.innerHTML = '<option value="">ทุกค่าบริการ</option>' + options;
    if (current) itemFilter.value = current;
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function loadRegistry() {
  try {
    const status = statusFilter.value;
    const today = todayLocalDateStr();
    // ยังไม่แตะช่องวันที่เอง = ตามวันปัจจุบันเสมอ (อัปเดตให้ตอน refresh อัตโนมัติด้วย)
    if (!dateTouchedByUser && (registryDateFrom.value !== today || registryDateTo.value !== today)) {
      registryDateFrom.value = today;
      registryDateTo.value = today;
    }
    const dateFrom = registryDateFrom.value || today;
    const dateTo = registryDateTo.value || dateFrom;
    const res = await fetch('/api/icd10auto/registry?status=' + encodeURIComponent(status)
      + '&dateFrom=' + encodeURIComponent(dateFrom)
      + '&dateTo=' + encodeURIComponent(dateTo)
      + '&icode=' + encodeURIComponent(itemFilter.value));
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'โหลดทะเบียนไม่สำเร็จ', 'error');
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      registryBody.innerHTML = '';
      registryEmpty.classList.remove('hidden');
      return;
    }
    registryEmpty.classList.add('hidden');
    registryBody.innerHTML = items.map((it) => `
      <tr>
        <td>${it.vstdate || '-'}</td>
        <td>${it.vn}</td>
        <td>${it.hn}</td>
        <td>${it.name || '-'}</td>
        <td>${it.department || it.depcode || '-'}</td>
        <td>${it.itemNames || '-'}</td>
        <td>${it.loggedCount} / ${it.itemCount}</td>
        <td>${STATUS_LABELS[it.status] || it.status}</td>
      </tr>
    `).join('');
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

statusFilter.addEventListener('change', loadRegistry);
itemFilter.addEventListener('change', loadRegistry);
[registryDateFrom, registryDateTo].forEach((el) => el.addEventListener('change', () => {
  dateTouchedByUser = true;
  loadRegistry();
}));
resetDateBtn.addEventListener('click', () => {
  dateTouchedByUser = false;
  registryDateFrom.value = todayLocalDateStr();
  registryDateTo.value = registryDateFrom.value;
  loadRegistry();
});

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    registryDateFrom.value = todayLocalDateStr();
    registryDateTo.value = registryDateFrom.value;
    loadStatus();
    loadItems().then(loadRegistry);
    setInterval(loadStatus, 60 * 1000);
    setInterval(loadRegistry, 60 * 1000);
  }
});
