let templates = [];
let doctors = [];
let selectedTemplate = null;

const alertBox = document.getElementById('alert');
const templateSelect = document.getElementById('templateSelect');
const templatePickerEmpty = document.getElementById('templatePickerEmpty');
const doctorSearch = document.getElementById('doctorSearch');
const doctorResults = document.getElementById('doctorResults');
const doctorCode = document.getElementById('doctorCode');
const departmentSelect = document.getElementById('departmentSelect');
const vnInput = document.getElementById('vnInput');
const vnSuccessMsg = document.getElementById('vnSuccessMsg');
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

async function loadTemplates() {
  const res = await fetch('/api/templates');
  const data = await res.json();
  templates = data.templates || [];
  if (!templates.length) {
    templatePickerEmpty.classList.remove('hidden');
    return;
  }
  templateSelect.innerHTML = '<option value="">-- เลือก Template --</option>' + templates.map((t) => {
    const total = t.items.reduce((s, it) => s + it.price * it.qty, 0);
    return `<option value="${t.id}">${t.name} (${t.items.length} รายการ · รวม ${money(total)} บาท)</option>`;
  }).join('');

  const rememberedTemplateId = localStorage.getItem('rememberedTemplateId');
  if (rememberedTemplateId && templates.some((t) => t.id === rememberedTemplateId)) {
    templateSelect.value = rememberedTemplateId;
    selectTemplate(rememberedTemplateId);
  }
}

templateSelect.addEventListener('change', () => selectTemplate(templateSelect.value));

function selectTemplate(id) {
  selectedTemplate = templates.find((t) => t.id === id) || null;
  renderItems();
}

function renderItems() {
  if (!selectedTemplate) {
    itemsBody.innerHTML = '';
    itemsEmpty.classList.remove('hidden');
    summaryBox.style.display = 'none';
    return;
  }
  itemsEmpty.classList.add('hidden');
  summaryBox.style.display = 'flex';
  let total = 0;
  itemsBody.innerHTML = selectedTemplate.items.map((it) => {
    const lineTotal = it.price * it.qty;
    total += lineTotal;
    return `<tr><td>${it.icode}</td><td>${it.name}</td><td>${it.usage || '-'}</td><td>${it.usageCode || '-'}</td><td>${money(it.price)}</td><td>${it.qty}</td><td>${money(lineTotal)}</td></tr>`;
  }).join('');
  summaryTotal.textContent = money(total) + ' บาท';
}

async function loadDoctors() {
  const res = await fetch('/api/doctors');
  const data = await res.json();
  doctors = data.items || [];

  const remembered = JSON.parse(localStorage.getItem('rememberedDoctor') || 'null');
  if (remembered) {
    doctorSearch.value = remembered.name;
    doctorCode.value = remembered.code;
  }
}

doctorSearch.addEventListener('input', () => {
  const q = doctorSearch.value.trim().toLowerCase();
  doctorCode.value = '';
  if (!q) {
    doctorResults.classList.remove('show');
    return;
  }
  const matches = doctors.filter((d) => (d.name || '').toLowerCase().includes(q)).slice(0, 30);
  if (!matches.length) {
    doctorResults.innerHTML = '<div class="search-item">ไม่พบแพทย์</div>';
    doctorResults.classList.add('show');
    return;
  }
  doctorResults.innerHTML = matches.map((d, idx) => `<div class="search-item" data-idx="${idx}">${d.name}</div>`).join('');
  doctorResults.classList.add('show');
  Array.from(doctorResults.querySelectorAll('[data-idx]')).forEach((el, idx) => {
    el.addEventListener('click', () => {
      doctorSearch.value = matches[idx].name;
      doctorCode.value = matches[idx].code;
      doctorResults.classList.remove('show');
    });
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) doctorResults.classList.remove('show');
});

async function loadDepartments() {
  const res = await fetch('/api/departments');
  const data = await res.json();
  const departments = data.items || [];
  departmentSelect.innerHTML = '<option value="">-- เลือกห้องที่สั่ง --</option>' +
    departments.map((d) => `<option value="${d.depcode}">${d.department}</option>`).join('');

  const remembered = JSON.parse(localStorage.getItem('rememberedDepartment') || 'null');
  if (remembered && departments.some((d) => d.depcode === remembered.depcode)) {
    departmentSelect.value = remembered.depcode;
  }
}

document.getElementById('rememberBtn').addEventListener('click', () => {
  if (!selectedTemplate) {
    showAlert('กรุณาเลือก Template ก่อนจึงจะจำค่าได้', 'error');
    return;
  }
  if (!doctorCode.value) {
    showAlert('กรุณาเลือกแพทย์จากรายการก่อนจึงจะจำค่าได้', 'error');
    return;
  }
  if (!departmentSelect.value) {
    showAlert('กรุณาเลือกห้องที่สั่งก่อนจึงจะจำค่าได้', 'error');
    return;
  }

  localStorage.setItem('rememberedTemplateId', selectedTemplate.id);
  localStorage.setItem('rememberedDoctor', JSON.stringify({ code: doctorCode.value, name: doctorSearch.value }));
  localStorage.setItem('rememberedDepartment', JSON.stringify({
    depcode: departmentSelect.value,
    name: departmentSelect.options[departmentSelect.selectedIndex].text,
  }));
  showAlert('จำค่า Template, แพทย์ และห้องที่สั่งเรียบร้อย', 'success');
});

vnInput.addEventListener('input', () => {
  vnSuccessMsg.classList.add('hidden');
});

document.getElementById('submitBtn').addEventListener('click', async () => {
  if (!selectedTemplate) {
    showAlert('กรุณาเลือก Template', 'error');
    return;
  }
  if (!doctorCode.value) {
    showAlert('กรุณาเลือกแพทย์ผู้สั่ง', 'error');
    return;
  }
  if (!departmentSelect.value) {
    showAlert('กรุณาเลือกห้องที่สั่ง', 'error');
    return;
  }
  const vn = vnInput.value.trim();
  if (!vn) {
    showAlert('กรุณาระบุ VN', 'error');
    return;
  }

  vnSuccessMsg.classList.add('hidden');

  try {
    const res = await fetch('/api/expense/insert-individual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: selectedTemplate.id,
        doctorCode: doctorCode.value,
        depcode: departmentSelect.value,
        vn,
        items: selectedTemplate.items,
      }),
    });
    const data = await res.json();
    showAlert(data.message || (data.ok ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ'), data.ok ? 'success' : 'error');
    if (data.ok) {
      vnSuccessMsg.classList.remove('hidden');
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  }
});

requireAuthOrRedirect().then((officer) => {
  if (officer) {
    document.getElementById('officerName').textContent = officer.name;
    loadTemplates();
    loadDoctors();
    loadDepartments();
  }
});
