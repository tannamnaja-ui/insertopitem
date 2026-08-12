let searchTimer = null;

const alertBox = document.getElementById('alert');
const drugSearch = document.getElementById('drugSearch');
const searchResults = document.getElementById('searchResults');
const itemsBody = document.getElementById('itemsBody');
const itemsEmpty = document.getElementById('itemsEmpty');

function money(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showAlert(message, type) {
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
  setTimeout(() => alertBox.classList.remove('show'), 4000);
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
        showAlert(data.message || 'ค้นหาไม่สำเร็จ', 'error');
        return;
      }
      renderSearchResults(data.items);
    } catch (err) {
      showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    }
  }, 250);
});

function renderSearchResults(items) {
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
    el.addEventListener('click', () => addItem(items[idx]));
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) searchResults.classList.remove('show');
});

async function addItem(item) {
  try {
    const res = await fetch('/api/df-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icode: item.icode, name: item.name }),
    });
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'เพิ่มรายการไม่สำเร็จ', 'error');
      return;
    }
    drugSearch.value = '';
    searchResults.classList.remove('show');
    showAlert('เพิ่มรายการสำเร็จ', 'success');
    loadItems();
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

async function loadItems() {
  try {
    const res = await fetch('/api/df-items');
    const data = await res.json();
    if (!data.ok) {
      showAlert(data.message || 'โหลดรายการไม่สำเร็จ', 'error');
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      itemsBody.innerHTML = '';
      itemsEmpty.classList.remove('hidden');
      return;
    }
    itemsEmpty.classList.add('hidden');
    itemsBody.innerHTML = items.map((it) => `
      <tr>
        <td>${it.icode}</td>
        <td>${it.name}</td>
        <td>${money(it.price)}</td>
        <td><button class="link-btn" data-del="${it.app_df_auto_id}" style="color:var(--danger);">ลบ</button></td>
      </tr>
    `).join('');

    Array.from(itemsBody.querySelectorAll('[data-del]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('ต้องการลบรายการนี้หรือไม่?')) return;
        await fetch('/api/df-items/' + encodeURIComponent(btn.dataset.del), { method: 'DELETE' });
        loadItems();
      });
    });
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
}

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadItems();
  }
});
