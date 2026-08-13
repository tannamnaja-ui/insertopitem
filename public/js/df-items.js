let configuredItems = [];
let allDepartments = [];
let selectedItem = null;
let itemSearchTimer = null;

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
    itemResults.classList.remove('show');
    deptResults.classList.remove('show');
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

async function removeBinding(id) {
  try {
    await fetch('/api/df-items/' + encodeURIComponent(id), { method: 'DELETE' });
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
        ${it.departments.map((d) => `<span class="item-chip">${d.department || d.depcode} <button data-remove="${d.id}" style="border:none;background:none;cursor:pointer;color:var(--danger);font-weight:700;">×</button></span>`).join('')}
      </div>
    </div>
  `).join('');

  itemsList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeBinding(btn.dataset.remove));
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
