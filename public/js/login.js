const alertBox = document.getElementById('alert');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.add('show');
}

document.getElementById('settingsBtn').addEventListener('click', async () => {
  alertBox.classList.remove('show');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showAlert('กรุณากรอก Username และ Password ก่อนเข้าหน้าตั้งค่าการเชื่อมต่อ');
    return;
  }

  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.disabled = true;

  try {
    const res = await fetch('/api/auth/check-settings-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!data.ok) {
      showAlert(data.message || 'ตรวจสอบสิทธิ์ไม่สำเร็จ');
      return;
    }

    if (!data.allowed) {
      alert(data.message || 'ไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อ Admin ผู้ดูแลระบบ');
      return;
    }

    window.location.href = 'settings.html';
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    settingsBtn.disabled = false;
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.classList.remove('show');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  loginBtn.disabled = true;
  loginBtnText.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (data.ok) {
      sessionStorage.setItem('officer', JSON.stringify(data.officer));
      window.location.href = 'menu.html';
    } else {
      showAlert(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
    }
  } catch (err) {
    showAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    loginBtn.disabled = false;
    loginBtnText.textContent = 'เข้าสู่ระบบ';
  }
});
