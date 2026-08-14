let configuredItems = [];
let allDepartments = [];
let selectedItem = null;
let itemSearchTimer = null;
let editingId = null;

const alertBox = document.getElementById('alert');
const itemSearch = document.getElementById('itemSearch');
const itemResults = document.getElementById('itemResults');
const selectedItemBox = document.getElementById('selectedItemBox');
const selectedItemName = document.getElementById('selectedItemName');
const selectedItemIcode = document.getElementById('selectedItemIcode');
const deptPickerBox = document.getElementById('deptPickerBox');
const deptSearch = document.getElementById('deptSearch');
const deptResults = document.getElementById('deptResults');
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
  deptPickerBox.classList.remove('hidden');
  itemSearch.value = item.name;
  itemResults.classList.remove('show');
  deptSearch.value = '';
  deptSearch.focus();
}

deptSearch.addEventListener('input', () => {
  const q = deptSearch.value.trim().toLowerCase();
  if (!q) {
    deptResults.classList.remove('show');
    return;
  }
  const matches = allDepartments.filter((d) =>
    (d.department || '').toLowerCase().includes(q) || (d.depcode || '').toLowerCase().includes(q)
  ).slice(0, 20);
  if (!matches.length) {
    deptResults.innerHTML = '<div class="search-item">ไม่พบห้องตรวจ</div>';
    deptResults.classList.add('show');
    return;
  }
  deptResults.innerHTML = matches.map((d, idx) => `
    <div class="search-item" data-idx="${idx}">
      <div>${d.department}</div>
      <div class="icode">${d.depcode}</div>
    </div>
  `).join('');
  deptResults.classList.add('show');
  Array.from(deptResults.querySelectorAll('[data-idx]')).forEach((el, idx) => {
    el.addEventListener('click', () => bindDepartment(matches[idx]));
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) {
    document.querySelectorAll('.search-results').forEach((el) => el.classList.remove('show'));
  }
});

async function bindDepartment(dept) {
  if (!selectedItem) return;
  try {
    const res = await fetch('/api/df-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icode: selectedItem.icode, name: selectedItem.name, depcode: dept.depcode }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'เพิ่มไม่สำเร็จ', 'error');
      return;
    }
    deptSearch.value = '';
    deptResults.classList.remove('show');
    showAlert(`ผูก "${selectedItem.name}" กับห้อง "${dept.department}" สำเร็จ`, 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function addDepartmentToItem(icode, name, depcode, deptLabel) {
  try {
    const res = await fetch('/api/df-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icode, name, depcode }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'เพิ่มไม่สำเร็จ', 'error');
      return;
    }
    showAlert(`เพิ่มห้องตรวจ "${deptLabel}" สำเร็จ`, 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function removeBinding(id) {
  try {
    await fetch('/api/df-items/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function saveEditedDepartment(id, depcode) {
  try {
    const res = await fetch('/api/df-items/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depcode }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'แก้ไขไม่สำเร็จ', 'error');
      return;
    }
    editingId = null;
    showAlert('แก้ไขห้องตรวจสำเร็จ', 'success');
    await loadAll();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

function renderConfiguredItems() {
  if (!configuredItems.length) {
    itemsList.innerHTML = '';
    itemsEmpty.classList.remove('hidden');
    return;
  }
  itemsEmpty.classList.add('hidden');
  itemsList.innerHTML = configuredItems.map((it) => `
    <div class="template-card">
      <div class="head">
        <div>
          <h3 style="margin-bottom:2px;">${it.name}</h3>
          <span style="font-size:12px;color:var(--ink-soft);">icode: ${it.icode} · ${money(it.price)} บาท · ${it.departments.length} ห้องตรวจ</span>
        </div>
      </div>
      <div class="items-list">
        ${it.departments.map((d) => (
          d.id === editingId
            ? `<span class="item-chip search-wrap" style="padding:4px 8px;">
                 <input type="text" class="edit-dept-search" data-editing-id="${d.id}" placeholder="ค้นหาห้องตรวจใหม่" style="border:none;background:none;padding:2px;min-width:180px;" autofocus>
                 <div class="search-results edit-dept-results"></div>
                 <button data-cancel-edit style="border:none;background:none;cursor:pointer;color:var(--ink-soft);font-weight:700;">×</button>
               </span>`
            : `<span class="item-chip">${d.department || d.depcode} <button data-edit="${d.id}" style="border:none;background:none;cursor:pointer;color:var(--green-600);font-weight:700;">✏️</button><button data-remove="${d.id}" style="border:none;background:none;cursor:pointer;color:var(--danger);font-weight:700;">×</button></span>`
        )).join('')}
      </div>
      <div class="field search-wrap" style="max-width:320px;margin:12px 0 0;">
        <input type="text" class="add-dept-search" data-icode="${it.icode}" data-name="${it.name.replace(/"/g, '&quot;')}" placeholder="+ ค้นหาห้องตรวจเพื่อเพิ่มให้รายการนี้">
        <div class="search-results add-dept-results"></div>
      </div>
    </div>
  `).join('');

  itemsList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeBinding(btn.dataset.remove));
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
  itemsList.querySelectorAll('.edit-dept-search').forEach((input) => {
    input.focus();
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const resultsBox = input.parentElement.querySelector('.edit-dept-results');
      if (!q) {
        resultsBox.classList.remove('show');
        return;
      }
      const matches = allDepartments.filter((d) =>
        (d.department || '').toLowerCase().includes(q) || (d.depcode || '').toLowerCase().includes(q)
      ).slice(0, 20);
      if (!matches.length) {
        resultsBox.innerHTML = '<div class="search-item">ไม่พบห้องตรวจ</div>';
        resultsBox.classList.add('show');
        return;
      }
      resultsBox.innerHTML = matches.map((d, idx) => `
        <div class="search-item" data-idx="${idx}">
          <div>${d.department}</div>
          <div class="icode">${d.depcode}</div>
        </div>
      `).join('');
      resultsBox.classList.add('show');
      Array.from(resultsBox.querySelectorAll('[data-idx]')).forEach((el, idx) => {
        el.addEventListener('click', () => saveEditedDepartment(input.dataset.editingId, matches[idx].depcode));
      });
    });
  });

  itemsList.querySelectorAll('.add-dept-search').forEach((input) => {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const resultsBox = input.parentElement.querySelector('.add-dept-results');
      if (!q) {
        resultsBox.classList.remove('show');
        return;
      }
      const alreadyBound = configuredItems.find((it) => it.icode === input.dataset.icode)?.departments.map((d) => d.depcode) || [];
      const matches = allDepartments.filter((d) =>
        !alreadyBound.includes(d.depcode) &&
        ((d.department || '').toLowerCase().includes(q) || (d.depcode || '').toLowerCase().includes(q))
      ).slice(0, 20);
      if (!matches.length) {
        resultsBox.innerHTML = '<div class="search-item">ไม่พบห้องตรวจ (หรือถูกเพิ่มไปแล้ว)</div>';
        resultsBox.classList.add('show');
        return;
      }
      resultsBox.innerHTML = matches.map((d, idx) => `
        <div class="search-item" data-idx="${idx}">
          <div>${d.department}</div>
          <div class="icode">${d.depcode}</div>
        </div>
      `).join('');
      resultsBox.classList.add('show');
      Array.from(resultsBox.querySelectorAll('[data-idx]')).forEach((el, idx) => {
        el.addEventListener('click', () => {
          input.value = '';
          resultsBox.classList.remove('show');
          addDepartmentToItem(input.dataset.icode, input.dataset.name, matches[idx].depcode, matches[idx].department);
        });
      });
    });
  });
}

async function loadAll() {
  try {
    const [itemsRes, deptsRes] = await Promise.all([
      fetch('/api/df-items').then((r) => r.json()),
      fetch('/api/departments').then((r) => r.json()),
    ]);
    configuredItems = itemsRes.items || [];
    allDepartments = deptsRes.items || [];
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
