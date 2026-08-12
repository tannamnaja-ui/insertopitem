const alertBox = document.getElementById('alert');
const autoStatusDot = document.getElementById('autoStatusDot');
const autoStatusText = document.getElementById('autoStatusText');
const lastRunText = document.getElementById('lastRunText');
const toggleBtn = document.getElementById('toggleBtn');
const runNowBtn = document.getElementById('runNowBtn');
const statusFilter = document.getElementById('statusFilter');
const registryBody = document.getElementById('registryBody');
const registryEmpty = document.getElementById('registryEmpty');

let autoEnabled = false;

const STATUS_LABELS = {
  done: '✅ เพิ่มครบทุกแพทย์แล้ว',
  pending: '⏳ ยังไม่ครบทุกแพทย์',
  no_signer: '⚪ ไม่มีแพทย์ตรวจ',
};

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
  } else {
    lastRunText.textContent = `รันล่าสุด ${time} — เพิ่มรายการใหม่ ${lastRun.inserted} รายการ`;
  }
}

async function loadStatus() {
  try {
    const res = await fetch('/api/dfauto/status');
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
    const res = await fetch('/api/dfauto/toggle', {
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
  runNowBtn.disabled = true;
  const originalText = runNowBtn.textContent;
  runNowBtn.textContent = 'กำลังรัน...';
  try {
    const res = await fetch('/api/dfauto/run-now', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      if (data.summary.error) {
        showAlert('รันแล้ว แต่เกิดข้อผิดพลาด: ' + data.summary.error, 'error');
      } else {
        showAlert(`รันเสร็จแล้ว เพิ่มรายการใหม่ ${data.summary.inserted} รายการ`, 'success');
      }
      await loadStatus();
      await loadRegistry();
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

async function loadRegistry() {
  try {
    const status = statusFilter.value;
    const res = await fetch('/api/dfauto/registry?status=' + encodeURIComponent(status));
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
        <td>${it.vn}</td>
        <td>${it.hn}</td>
        <td>${it.name || '-'}</td>
        <td>${it.department || it.depcode || '-'}</td>
        <td>${it.signerCount}</td>
        <td>${STATUS_LABELS[it.status] || it.status}</td>
      </tr>
    `).join('');
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

statusFilter.addEventListener('change', loadRegistry);

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadStatus();
    loadRegistry();
    setInterval(loadStatus, 60 * 1000);
    setInterval(loadRegistry, 60 * 1000);
  }
});
