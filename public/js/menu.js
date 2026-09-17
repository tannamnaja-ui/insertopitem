const menuGrid = document.getElementById('menuGrid');
const settingsBtn = document.getElementById('menuSettingsBtn');
const settingsModal = document.getElementById('menuSettingsModal');
const settingsList = document.getElementById('menuSettingsList');
const settingsAlert = document.getElementById('menuSettingsAlert');
const saveBtn = document.getElementById('menuSettingsSaveBtn');
const cancelBtn = document.getElementById('menuSettingsCancelBtn');

// รายการกล่องทั้งหมดอ่านจาก DOM ไม่ได้เขียนรายชื่อซ้ำไว้ใน JS
// เพิ่มกล่องใหม่ในหน้า menu.html แล้วใส่ data-menu-key ให้ ก็โผล่ในหน้าตั้งค่าเองโดยไม่ต้องแก้ไฟล์นี้
function allBoxes() {
  return [...menuGrid.querySelectorAll('.menu-box[data-menu-key]')].map((el) => ({
    el,
    key: el.dataset.menuKey,
    // ชื่อกล่องเอาจากหัวข้อจริงบนกล่อง จะได้ไม่มีทางเพี้ยนจากของที่แสดงอยู่
    name: (el.querySelector('h2') ? el.querySelector('h2').textContent : el.dataset.menuKey).trim(),
    statusUrl: el.dataset.autoStatus || null,
    autoName: el.dataset.autoName || null,
  }));
}

// ชื่อกล่องถูกดึงมาเป็นข้อความแล้วเอาไปประกอบ innerHTML ใหม่ ต้อง escape กัน & < > ตีความผิด
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let hiddenKeys = new Set();

function applyVisibility() {
  for (const box of allBoxes()) {
    box.el.classList.toggle('hidden', hiddenKeys.has(box.key));
  }
}

function showSettingsAlert(message, type) {
  settingsAlert.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  settingsAlert.textContent = message;
}

// โหลดรายการที่ซ่อนไว้จากเซิร์ฟเวอร์ ถ้าเรียกไม่สำเร็จให้แสดงทุกกล่องไว้ก่อน
// ดีกว่าซ่อนมั่วแล้วเจ้าหน้าที่หาเมนูไม่เจอ
async function loadVisibility() {
  try {
    const res = await fetch('/api/menu/visibility');
    const data = await res.json();
    if (data.ok) hiddenKeys = new Set(data.hidden || []);
  } catch (err) {
    hiddenKeys = new Set();
  }
  applyVisibility();
}

function openSettings() {
  settingsAlert.className = 'alert';
  settingsList.innerHTML = allBoxes().map((box) => {
    const checked = hiddenKeys.has(box.key);
    const note = box.statusUrl ? '<div class="note">งานอัตโนมัติ — ซ่อนแล้วยังทำงานอยู่เบื้องหลัง</div>' : '';
    return `
      <label class="check-row${checked ? ' checked' : ''}" data-key="${esc(box.key)}">
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span>
          <span class="name">${esc(box.name)}</span>
          ${note}
        </span>
      </label>`;
  }).join('');

  // ไฮไลต์แถวตามสถานะติ๊ก ให้เห็นชัดว่ากล่องไหนกำลังจะถูกซ่อน
  settingsList.querySelectorAll('.check-row').forEach((row) => {
    row.querySelector('input').addEventListener('change', (e) => {
      row.classList.toggle('checked', e.target.checked);
    });
  });

  settingsModal.classList.add('show');
}

function closeSettings() {
  settingsModal.classList.remove('show');
}

saveBtn.addEventListener('click', async () => {
  const hidden = [...settingsList.querySelectorAll('.check-row')]
    .filter((row) => row.querySelector('input').checked)
    .map((row) => row.dataset.key);

  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'กำลังบันทึก...';
  try {
    const res = await fetch('/api/menu/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    });
    const data = await res.json();
    if (data.ok) {
      hiddenKeys = new Set(data.hidden || []);
      applyVisibility();
      closeSettings();
      loadAutoStatuses();
    } else {
      showSettingsAlert(data.message || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showSettingsAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
});

settingsBtn.addEventListener('click', openSettings);
cancelBtn.addEventListener('click', closeSettings);

// คลิกพื้นหลังนอกกล่อง หรือกด Esc = ปิดโดยไม่บันทึก
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsModal.classList.contains('show')) closeSettings();
});

function renderBadge(box, state) {
  const badge = box.el.querySelector('.auto-badge');
  if (!badge) return;
  const label = badge.querySelector('.label');
  if (state === null) {
    badge.className = 'auto-badge unknown';
    label.textContent = 'ตรวจสอบไม่ได้';
    return;
  }
  badge.className = 'auto-badge ' + (state ? 'on' : 'off');
  label.textContent = state ? 'อัตโนมัติ: เปิด' : 'อัตโนมัติ: ปิด';
}

// งานอัตโนมัติทุกตัวทำงานพร้อมกันได้ แต่ละตัวมีสถานะเปิด/ปิดของตัวเอง
// ถามสถานะเฉพาะกล่องที่ยังไม่ถูกซ่อน ซ่อนแล้วก็ไม่ต้องยิง request ให้เปลืองทุกนาที
async function loadAutoStatuses() {
  const boxes = allBoxes().filter((b) => b.statusUrl && !hiddenKeys.has(b.key));

  const results = await Promise.all(boxes.map(async (box) => {
    try {
      const res = await fetch(box.statusUrl);
      const data = await res.json();
      return data.ok ? Boolean(data.state.enabled) : null;
    } catch (err) {
      return null;
    }
  }));

  results.forEach((enabled, i) => renderBadge(boxes[i], enabled));

  const summary = document.getElementById('autoSummary');
  const summaryText = document.getElementById('autoSummaryText');
  const dot = summary.querySelector('.status-dot');
  const onNames = boxes.filter((b, i) => results[i] === true).map((b) => b.autoName);

  if (boxes.length === 0) {
    dot.className = 'status-dot missing';
    summaryText.textContent = 'ซ่อนกล่องงานอัตโนมัติไว้ทั้งหมด — กด "ตั้งค่าเมนู" เพื่อเอากลับมาแสดง';
  } else if (onNames.length === 0) {
    dot.className = 'status-dot missing';
    summaryText.textContent = 'ยังไม่ได้เปิดการทำงานอัตโนมัติไว้เลย';
  } else {
    dot.className = 'status-dot complete';
    summaryText.innerHTML = 'เปิดอัตโนมัติอยู่ ' + onNames.length
      + ' รายการ ทำงานพร้อมกันทุกๆ 5 นาที: <strong>' + onNames.join(' + ') + '</strong>';
  }
}

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadVisibility().then(loadAutoStatuses);
    setInterval(loadAutoStatuses, 60 * 1000);
  }
});
