let currentItems = [];
let selectedDrug = null;
let searchTimer = null;
let usageSearchTimer = null;
let editingTemplateId = null;
let loadedTemplates = [];

const editingBanner = document.getElementById('editingBanner');
const editingBannerName = document.getElementById('editingBannerName');
const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const templateNameInput = document.getElementById('templateName');

const alertBox = document.getElementById('alert');
const drugSearch = document.getElementById('drugSearch');
const searchResults = document.getElementById('searchResults');
const usageInput = document.getElementById('usageInput');
const usageResults = document.getElementById('usageResults');
const usageCode = document.getElementById('usageCode');
const selectedItemBox = document.getElementById('selectedItemBox');
const itemsBody = document.getElementById('itemsBody');
const itemsEmpty = document.getElementById('itemsEmpty');
const summaryBox = document.getElementById('summaryBox');
const summaryTotal = document.getElementById('summaryTotal');

function showAlert(message, type) {
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
  setTimeout(() => alertBox.classList.remove('show'), 4000);
}

function money(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

drugSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = drugSearch.value.trim();
  if (q.length < 2) {
    searchResults.classList.remove('show');
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/drugitems?q=' + encodeURIComponent(q));
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) {
          showAlert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
          setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        } else {
          showAlert(data.message || 'ค้นหาไม่สำเร็จ', 'error');
        }
        return;
      }
      renderResults(data.items);
    } catch (err) {
      showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    }
  }, 250);
});

function renderResults(items) {
  if (!items.length) {
    searchResults.innerHTML = '<div class="search-item">ไม่พบรายการ</div>';
    searchResults.classList.add('show');
    return;
  }
  searchResults.innerHTML = items.map((it, idx) =>
    `<div class="search-item" data-idx="${idx}">
      <div>${it.name}</div>
      <div class="icode">icode: ${it.icode} · ${money(it.price)} บาท</div>
    </div>`
  ).join('');
  searchResults.classList.add('show');

  Array.from(searchResults.querySelectorAll('.search-item[data-idx]')).forEach((el, idx) => {
    el.addEventListener('click', () => selectDrug(items[idx]));
  });
}

function selectDrug(item) {
  selectedDrug = item;
  document.getElementById('selIcode').value = item.icode;
  document.getElementById('selName').value = item.name;
  document.getElementById('selPrice').value = money(item.price);
  document.getElementById('selIncome').value = item.income || '';
  document.getElementById('selCost').value = money(item.cost);
  document.getElementById('selQty').value = 1;
  selectedItemBox.classList.remove('hidden');
  searchResults.classList.remove('show');
  drugSearch.value = item.name;
}

usageInput.addEventListener('input', () => {
  clearTimeout(usageSearchTimer);
  usageCode.value = '';
  const q = usageInput.value.trim();
  if (q.length < 1) {
    usageResults.classList.remove('show');
    return;
  }
  usageSearchTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/drugusage?q=' + encodeURIComponent(q));
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) {
          showAlert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
          setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        }
        return;
      }
      renderUsageResults(data.items);
    } catch (err) {
      showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    }
  }, 250);
});

function renderUsageResults(items) {
  if (!items.length) {
    usageResults.innerHTML = '<div class="search-item">ไม่พบวิธีใช้ยา</div>';
    usageResults.classList.add('show');
    return;
  }
  usageResults.innerHTML = items.map((it, idx) =>
    `<div class="search-item" data-idx="${idx}">
      <div>${it.shortlist}</div>
      <div class="icode">รหัส: ${it.drugusage}</div>
    </div>`
  ).join('');
  usageResults.classList.add('show');

  Array.from(usageResults.querySelectorAll('.search-item[data-idx]')).forEach((el, idx) => {
    el.addEventListener('click', () => {
      usageInput.value = items[idx].shortlist;
      usageCode.value = items[idx].drugusage;
      usageResults.classList.remove('show');
    });
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) {
    searchResults.classList.remove('show');
    usageResults.classList.remove('show');
  }
});

document.getElementById('addItemBtn').addEventListener('click', () => {
  if (!selectedDrug) {
    showAlert('กรุณาเลือกรายการก่อน', 'error');
    return;
  }
  const qty = Number(document.getElementById('selQty').value) || 1;
  const usage = usageInput.value.trim();
  const usageCodeValue = usageCode.value.trim();
  currentItems.push({
    icode: selectedDrug.icode,
    name: selectedDrug.name,
    price: Number(selectedDrug.price) || 0,
    qty,
    usage,
    usageCode: usageCodeValue,
    income: selectedDrug.income || '',
    cost: Number(selectedDrug.cost) || 0,
  });
  selectedDrug = null;
  selectedItemBox.classList.add('hidden');
  drugSearch.value = '';
  usageInput.value = '';
  usageCode.value = '';
  renderItemsTable();
});

function renderItemsTable() {
  if (!currentItems.length) {
    itemsBody.innerHTML = '';
    itemsEmpty.classList.remove('hidden');
    summaryBox.style.display = 'none';
    return;
  }
  itemsEmpty.classList.add('hidden');
  summaryBox.style.display = 'flex';

  let total = 0;
  itemsBody.innerHTML = currentItems.map((it, idx) => {
    const lineTotal = it.price * it.qty;
    total += lineTotal;
    return `<tr>
      <td>${it.icode}</td>
      <td>${it.name}</td>
      <td>${it.usage || '-'}</td>
      <td>${it.usageCode || '-'}</td>
      <td>${money(it.price)}</td>
      <td>${it.income || '-'}</td>
      <td>${money(it.cost)}</td>
      <td>${it.qty}</td>
      <td>${money(lineTotal)}</td>
      <td style="white-space:nowrap;">
        <button class="link-btn" data-edit-item="${idx}">แก้ไข</button>
        <button class="link-btn" data-remove="${idx}" style="color:var(--danger); margin-left:8px;">ลบ</button>
      </td>
    </tr>`;
  }).join('');
  summaryTotal.textContent = money(total) + ' บาท';

  Array.from(itemsBody.querySelectorAll('[data-edit-item]')).forEach((btn) => {
    btn.addEventListener('click', () => editItemRow(Number(btn.dataset.editItem)));
  });

  Array.from(itemsBody.querySelectorAll('[data-remove]')).forEach((btn) => {
    btn.addEventListener('click', () => {
      currentItems.splice(Number(btn.dataset.remove), 1);
      renderItemsTable();
    });
  });
}

function editItemRow(idx) {
  const it = currentItems[idx];
  if (!it) return;

  selectedDrug = { icode: it.icode, name: it.name, price: it.price, income: it.income, cost: it.cost };
  document.getElementById('selIcode').value = it.icode;
  document.getElementById('selName').value = it.name;
  document.getElementById('selPrice').value = money(it.price);
  document.getElementById('selIncome').value = it.income || '';
  document.getElementById('selCost').value = money(it.cost);
  document.getElementById('selQty').value = it.qty;
  selectedItemBox.classList.remove('hidden');

  drugSearch.value = it.name;
  usageInput.value = it.usage || '';
  usageCode.value = it.usageCode || '';

  currentItems.splice(idx, 1);
  renderItemsTable();

  selectedItemBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function startEdit(id) {
  const t = loadedTemplates.find((tpl) => tpl.id === id);
  if (!t) return;

  editingTemplateId = id;
  templateNameInput.value = t.name;
  currentItems = t.items.map((it) => ({ ...it }));
  renderItemsTable();

  editingBannerName.textContent = t.name;
  editingBanner.classList.remove('hidden');
  saveTemplateBtn.textContent = '💾 บันทึกการแก้ไข';

  document.querySelector('.card-xl').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingTemplateId = null;
  currentItems = [];
  templateNameInput.value = '';
  renderItemsTable();
  editingBanner.classList.add('hidden');
  saveTemplateBtn.textContent = '💾 บันทึก Template';
}

document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);

saveTemplateBtn.addEventListener('click', async () => {
  const name = templateNameInput.value.trim();
  if (!name) {
    showAlert('กรุณาใส่ชื่อ Template', 'error');
    return;
  }
  if (!currentItems.length) {
    showAlert('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ', 'error');
    return;
  }

  const isEditing = Boolean(editingTemplateId);
  const url = isEditing ? '/api/templates/' + encodeURIComponent(editingTemplateId) : '/api/templates';
  const method = isEditing ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items: currentItems }),
    });
    const data = await res.json();
    if (data.ok) {
      showAlert(isEditing ? 'บันทึกการแก้ไขสำเร็จ' : 'บันทึก Template สำเร็จ', 'success');
      cancelEdit();
      loadTemplates();
    } else {
      showAlert(data.message || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
});

async function loadTemplates() {
  const listEl = document.getElementById('templateList');
  const emptyEl = document.getElementById('templateListEmpty');
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    const templates = (data.templates || []).slice().reverse();
    loadedTemplates = templates;
    if (!templates.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = templates.map((t) => {
      const total = t.items.reduce((s, it) => s + it.price * it.qty, 0);
      return `<div class="template-card">
        <div class="head">
          <div>
            <h3 style="margin-bottom:2px;">${t.name}</h3>
            <span style="font-size:12px;color:var(--ink-soft);">${t.items.length} รายการ · รวม ${money(total)} บาท</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" data-edit="${t.id}">✏️ แก้ไข</button>
            <button class="btn btn-danger btn-sm" data-del="${t.id}">ลบ</button>
          </div>
        </div>
        <div class="items-list">
          ${t.items.map((it) => `<span class="item-chip">${it.name} × ${it.qty}</span>`).join('')}
        </div>
      </div>`;
    }).join('');

    Array.from(listEl.querySelectorAll('[data-edit]')).forEach((btn) => {
      btn.addEventListener('click', () => startEdit(btn.dataset.edit));
    });

    Array.from(listEl.querySelectorAll('[data-del]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('ต้องการลบ Template นี้หรือไม่?')) return;
        await fetch('/api/templates/' + encodeURIComponent(btn.dataset.del), { method: 'DELETE' });
        if (editingTemplateId === btn.dataset.del) cancelEdit();
        loadTemplates();
      });
    });
  } catch (err) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
  }
}

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadTemplates();
  }
});
