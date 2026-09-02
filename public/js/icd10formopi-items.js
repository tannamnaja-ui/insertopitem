let configuredItems = [];
let allDoctors = [];
let selectedItem = null;
let itemSearchTimer = null;
let icd10SearchTimer = null;
let editingId = null;

const alertBox = document.getElementById('alert');
const itemSearch = document.getElementById('itemSearch');
const itemResults = document.getElementById('itemResults');
const selectedItemBox = document.getElementById('selectedItemBox');
const selectedItemName = document.getElementById('selectedItemName');
const selectedItemIcode = document.getElementById('selectedItemIcode');
const icd10PickerBox = document.getElementById('icd10PickerBox');
const icd10Search = document.getElementById('icd10Search');
const icd10Results = document.getElementById('icd10Results');
const itemsList = document.getElementById('itemsList');
const itemsEmpty = document.getElementById('itemsEmpty');

function showAlert(message, type) {
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
  setTimeout(() => alertBox.classList.remove('show'), 4000);
}

function money(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

// ---------- ค้นหารายการค่าบริการ ----------
itemSearch.addEventListener('input', () => {
  clearTimeout(itemSearchTimer);
  const q = itemSearch.value.trim();
  if (q.length < 2) {
    itemResults.classList.remove('show');
    return;
  }
  itemSearchTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/drugitems?q=' + encodeURIComponent(q));
      const data = await res.json();
      if (!data.ok) {
        showAlert(data.message || 'ค้นหาไม่สำเร็จ', 'error');
        return;
      }
      const matches = data.items || [];
      if (!matches.length) {
        itemResults.innerHTML = '<div class="search-item">ไม่พบรายการ</div>';
        itemResults.classList.add('show');
        return;
      }
      itemResults.innerHTML = matches.map((it, idx) => `
        <div class="search-item" data-idx="${idx}">
          <div>${it.name}</div>
          <div class="icode">icode: ${it.icode} · ${money(it.price)} บาท</div>
        </div>
      `).join('');
      itemResults.classList.add('show');
      Array.from(itemResults.querySelectorAll('[data-idx]')).forEach((el, idx) => {
        el.addEventListener('click', () => selectItem(matches[idx]));
      });
    } catch (err) {
      showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    }
  }, 250);
});

function selectItem(item) {
  selectedItem = item;
  selectedItemName.textContent = `${item.name} (icode: ${item.icode})`;
  selectedItemIcode.value = item.icode;
  selectedItemBox.classList.remove('hidden');
  icd10PickerBox.classList.remove('hidden');
  itemSearch.value = item.name;
  itemResults.classList.remove('show');
  icd10Search.value = '';
  icd10Search.focus();
}

// ---------- ค้นหา ICD10 (ค้นจากฐานข้อมูลทุกครั้ง รายการมีเป็นหมื่นรหัส โหลดมาเก็บไว้ทั้งหมดไม่ไหว) ----------
function searchIcd10(input, resultsBox, onPick) {
  clearTimeout(icd10SearchTimer);
  const q = input.value.trim();
  if (q.length < 2) {
    resultsBox.classList.remove('show');
    return;
  }
  icd10SearchTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/icd10?q=' + encodeURIComponent(q));
      const data = await res.json();
      if (!data.ok) {
        showAlert(data.message || 'ค้นหา ICD10 ไม่สำเร็จ', 'error');
        return;
      }
      const matches = data.items || [];
      if (!matches.length) {
        resultsBox.innerHTML = '<div class="search-item">ไม่พบรหัส ICD10</div>';
        resultsBox.classList.add('show');
        return;
      }
      resultsBox.innerHTML = matches.map((d, idx) => `
        <div class="search-item" data-idx="${idx}">
          <div>${d.code}</div>
          <div class="icode">${d.name || '-'}</div>
        </div>
      `).join('');
      resultsBox.classList.add('show');
      Array.from(resultsBox.querySelectorAll('[data-idx]')).forEach((el, idx) => {
        el.addEventListener('click', () => onPick(matches[idx]));
      });
    } catch (err) {
      showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    }
  }, 250);
}

icd10Search.addEventListener('input', () => {
  searchIcd10(icd10Search, icd10Results, (d) => bindIcd10(d));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) {
    document.querySelectorAll('.search-results').forEach((el) => el.classList.remove('show'));
  }
});

// ---------- บันทึก / แก้ไข / ลบ ----------
async function bindIcd10(diag) {
  if (!selectedItem) return;
  await addIcd10ToItem(selectedItem.icode, selectedItem.name, diag.code, () => {
    icd10Search.value = '';
    icd10Results.classList.remove('show');
    showAlert(`ผูก "${selectedItem.name}" กับ ICD10 ${diag.code} สำเร็จ`, 'success');
  });
}

async function addIcd10ToItem(icode, name, icd10, onSuccess) {
  try {
    const res = await fetch('/api/icd10auto-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icode, name, icd10 }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'เพิ่มไม่สำเร็จ', 'error');
      return;
    }
    if (onSuccess) onSuccess();
    else showAlert(`เพิ่ม ICD10 ${icd10} สำเร็จ`, 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function removeBinding(id) {
  try {
    await fetch('/api/icd10auto-items/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function saveEditedIcd10(id, icd10) {
  try {
    const res = await fetch('/api/icd10auto-items/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icd10 }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'แก้ไขไม่สำเร็จ', 'error');
      return;
    }
    editingId = null;
    showAlert('แก้ไขรหัส ICD10 สำเร็จ', 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function saveDoctorConfig(icode, doctorMode, doctor) {
  try {
    const res = await fetch('/api/icd10auto-items/doctor/' + encodeURIComponent(icode), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorMode, doctor }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'บันทึกการตั้งค่าแพทย์ไม่สำเร็จ', 'error');
      await loadAll();
      return;
    }
    showAlert(doctorMode === 'fixed' ? 'ฟิกชื่อแพทย์ให้ template นี้แล้ว' : 'ตั้งให้ใช้แพทย์จากการสั่งยาแล้ว', 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function removeTemplate(icode, name) {
  if (!confirm(`ลบ template "${name}" ทั้งรายการ?\n\nรหัส ICD10 ที่ผูกไว้กับค่าบริการนี้จะถูกลบทั้งหมด และจะไม่มีการลงวินิจฉัยอัตโนมัติจากรายการนี้อีก`)) return;
  try {
    const res = await fetch('/api/icd10auto-items/template/' + encodeURIComponent(icode), { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'ลบ template ไม่สำเร็จ', 'error');
      return;
    }
    showAlert(`ลบ template "${name}" แล้ว`, 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

// ค้นหาแพทย์จากรายชื่อที่โหลดมาไว้แล้ว (ค้นได้ทั้งรหัสและชื่อ)
function searchDoctors(input, resultsBox, onPick) {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    resultsBox.classList.remove('show');
    return;
  }
  const matches = allDoctors.filter((d) =>
    (d.name || '').toLowerCase().includes(q) || (d.code || '').toLowerCase().includes(q)
  ).slice(0, 20);
  if (!matches.length) {
    resultsBox.innerHTML = '<div class="search-item">ไม่พบแพทย์</div>';
    resultsBox.classList.add('show');
    return;
  }
  resultsBox.innerHTML = matches.map((d, idx) => `
    <div class="search-item" data-idx="${idx}">
      <div>${d.name}</div>
      <div class="icode">รหัส: ${d.code}</div>
    </div>
  `).join('');
  resultsBox.classList.add('show');
  Array.from(resultsBox.querySelectorAll('[data-idx]')).forEach((el, idx) => {
    el.addEventListener('click', () => onPick(matches[idx]));
  });
}

// ---------- แสดงรายการที่ตั้งค่าไว้ ----------
function renderConfiguredItems() {
  if (!configuredItems.length) {
    itemsList.innerHTML = '';
    itemsEmpty.classList.remove('hidden');
    return;
  }
  itemsEmpty.classList.add('hidden');
  itemsList.innerHTML = configuredItems.map((it) => `
    <div class="template-card">
      <div class="head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin-bottom:2px;">${it.name}</h3>
          <span style="font-size:12px;color:var(--ink-soft);">icode: ${it.icode} · ${it.diagnoses.length} รหัส ICD10</span>
        </div>
        <button type="button" class="btn btn-danger btn-sm" data-remove-template="${it.icode}" data-template-name="${escapeAttr(it.name)}">🗑️ ลบ template นี้</button>
      </div>

      <div style="border:1.5px dashed var(--green-200);border-radius:10px;padding:12px 14px;margin-top:4px;">
        <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">แพทย์ผู้วินิจฉัย</div>

        <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;cursor:pointer;">
          <input type="radio" name="docmode-${it.icode}" value="fixed" data-doc-mode="${it.icode}" ${it.doctorMode === 'fixed' ? 'checked' : ''}>
          ฟิกชื่อแพทย์
        </label>
        <div class="field search-wrap" style="max-width:340px;margin:0 0 10px 26px;${it.doctorMode === 'fixed' ? '' : 'display:none;'}" data-doc-picker="${it.icode}">
          <input type="text" class="doctor-search" data-icode="${it.icode}" placeholder="ค้นหาชื่อแพทย์หรือรหัส" value="${escapeAttr(it.doctorName ? it.doctorName + ' (' + it.doctor + ')' : '')}">
          <div class="search-results doctor-results"></div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="radio" name="docmode-${it.icode}" value="order" data-doc-mode="${it.icode}" ${it.doctorMode === 'fixed' ? '' : 'checked'}>
          นำแพทย์จากการสั่งยา
        </label>
        <div style="font-size:11.5px;color:var(--ink-soft);margin:2px 0 0 26px;">ใช้แพทย์ของยารายการแรกที่คีย์ใน VN นั้น</div>
      </div>
      <div class="items-list">
        ${it.diagnoses.map((d) => (
          d.id === editingId
            ? `<span class="item-chip search-wrap" style="padding:4px 8px;">
                 <input type="text" class="edit-icd10-search" data-editing-id="${d.id}" placeholder="ค้นหารหัส ICD10 ใหม่" style="border:none;background:none;padding:2px;min-width:180px;">
                 <div class="search-results edit-icd10-results"></div>
                 <button data-cancel-edit style="border:none;background:none;cursor:pointer;color:var(--ink-soft);font-weight:700;">×</button>
               </span>`
            : `<span class="item-chip" title="${escapeAttr(d.icd10Name)}">${d.icd10}${d.icd10Name ? ' — ' + d.icd10Name : ''} <button data-edit="${d.id}" style="border:none;background:none;cursor:pointer;color:var(--green-600);font-weight:700;">✏️</button><button data-remove="${d.id}" style="border:none;background:none;cursor:pointer;color:var(--danger);font-weight:700;">×</button></span>`
        )).join('')}
      </div>
      <div class="field search-wrap" style="max-width:320px;margin:12px 0 0;">
        <input type="text" class="add-icd10-search" data-icode="${it.icode}" data-name="${escapeAttr(it.name)}" placeholder="+ ค้นหา ICD10 เพื่อเพิ่มให้รายการนี้">
        <div class="search-results add-icd10-results"></div>
      </div>
    </div>
  `).join('');

  itemsList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeBinding(btn.dataset.remove));
  });
  itemsList.querySelectorAll('[data-remove-template]').forEach((btn) => {
    btn.addEventListener('click', () => removeTemplate(btn.dataset.removeTemplate, btn.dataset.templateName));
  });
  itemsList.querySelectorAll('[data-doc-mode]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const icode = radio.dataset.docMode;
      const picker = itemsList.querySelector('[data-doc-picker="' + icode + '"]');
      if (radio.value === 'fixed') {
        // เลือกฟิกแล้วยังไม่บันทึกทันที ต้องเลือกชื่อแพทย์ก่อน
        if (picker) {
          picker.style.display = '';
          picker.querySelector('.doctor-search').focus();
        }
        return;
      }
      if (picker) picker.style.display = 'none';
      saveDoctorConfig(icode, 'order', null);
    });
  });
  itemsList.querySelectorAll('.doctor-search').forEach((input) => {
    const resultsBox = input.parentElement.querySelector('.doctor-results');
    input.addEventListener('input', () => {
      searchDoctors(input, resultsBox, (d) => {
        input.value = d.name + ' (' + d.code + ')';
        resultsBox.classList.remove('show');
        saveDoctorConfig(input.dataset.icode, 'fixed', d.code);
      });
    });
  });
  itemsList.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingId = btn.dataset.edit;
      renderConfiguredItems();
    });
  });
  itemsList.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingId = null;
      renderConfiguredItems();
    });
  });
  itemsList.querySelectorAll('.edit-icd10-search').forEach((input) => {
    input.focus();
    const resultsBox = input.parentElement.querySelector('.edit-icd10-results');
    input.addEventListener('input', () => {
      searchIcd10(input, resultsBox, (d) => saveEditedIcd10(input.dataset.editingId, d.code));
    });
  });
  itemsList.querySelectorAll('.add-icd10-search').forEach((input) => {
    const resultsBox = input.parentElement.querySelector('.add-icd10-results');
    input.addEventListener('input', () => {
      searchIcd10(input, resultsBox, (d) => {
        input.value = '';
        resultsBox.classList.remove('show');
        addIcd10ToItem(input.dataset.icode, input.dataset.name, d.code);
      });
    });
  });
}

async function loadAll() {
  try {
    const [itemsRes, doctorsRes] = await Promise.all([
      fetch('/api/icd10auto-items').then((r) => r.json()),
      fetch('/api/doctors').then((r) => r.json()),
    ]);
    if (!itemsRes.ok) {
      showAlert(itemsRes.message || 'โหลดรายการไม่สำเร็จ', 'error');
      return;
    }
    configuredItems = itemsRes.items || [];
    allDoctors = doctorsRes.ok ? (doctorsRes.items || []) : [];
    renderConfiguredItems();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadAll();
  }
});
