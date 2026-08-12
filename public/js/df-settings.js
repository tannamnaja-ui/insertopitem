const alertBox = document.getElementById('alert');
const deptBody = document.getElementById('deptBody');
const deptEmpty = document.getElementById('deptEmpty');
const deptNoMatch = document.getElementById('deptNoMatch');
const deptSearch = document.getElementById('deptSearch');

let departments = [];

function showAlert(message, type) {
  alertBox.className = 'alert show ' + (type === 'success' ? 'alert-success' : 'alert-error');
  alertBox.textContent = message;
  setTimeout(() => alertBox.classList.remove('show'), 4000);
}

function renderRows(items) {
  deptNoMatch.classList.toggle('hidden', items.length > 0);
  deptBody.innerHTML = items.map((d) => `
    <tr>
      <td><input type="checkbox" data-depcode="${d.depcode}" ${d.df_auto === 'Y' ? 'checked' : ''}></td>
      <td>${d.depcode}</td>
      <td>${d.department}</td>
    </tr>
  `).join('');

  Array.from(deptBody.querySelectorAll('input[type="checkbox"]')).forEach((cb) => {
    cb.addEventListener('change', async () => {
      const depcode = cb.dataset.depcode;
      const dfAuto = cb.checked ? 'Y' : 'N';
      cb.disabled = true;
      try {
        const res = await fetch('/api/df-departments/' + encodeURIComponent(depcode), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ df_auto: dfAuto }),
        });
        const data = await res.json();
        if (!data.ok) {
          cb.checked = !cb.checked;
          showAlert(data.message || 'บันทึกไม่สำเร็จ', 'error');
        } else {
          const dept = departments.find((d) => d.depcode === depcode);
          if (dept) dept.df_auto = dfAuto;
          showAlert('บันทึกเรียบร้อย', 'success');
        }
      } catch (err) {
        cb.checked = !cb.checked;
        showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
      } finally {
        cb.disabled = false;
      }
    });
  });
}

function applySearch() {
  const q = deptSearch.value.trim().toLowerCase();
  const filtered = !q
    ? departments
    : departments.filter((d) =>
        (d.department || '').toLowerCase().includes(q) ||
        (d.depcode || '').toLowerCase().includes(q)
      );
  renderRows(filtered);
}

deptSearch.addEventListener('input', applySearch);

async function loadDepartments() {
  const res = await fetch('/api/df-departments');
  const data = await res.json();
  if (!data.ok) {
    showAlert(data.message || 'โหลดรายชื่อห้องไม่สำเร็จ', 'error');
    return;
  }
  departments = data.items || [];
  if (!departments.length) {
    deptEmpty.classList.remove('hidden');
    return;
  }
  applySearch();
}

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadDepartments();
  }
});
