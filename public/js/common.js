async function requireAuthOrRedirect() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.ok) {
      window.location.href = 'index.html';
      return null;
    }
    sessionStorage.setItem('officer', JSON.stringify(data.officer));
    return data.officer;
  } catch (err) {
    window.location.href = 'index.html';
    return null;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  sessionStorage.removeItem('officer');
  window.location.href = 'index.html';
}
