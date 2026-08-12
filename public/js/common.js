(function () {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      const token = sessionStorage.getItem('apiToken');
      if (token) {
        init = init || {};
        init.headers = Object.assign({}, init.headers || {}, { 'x-api-token': token });
      }
    }
    return originalFetch(input, init);
  };
})();

async function requireAuthOrRedirect() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.ok) {
      window.location.href = 'index.html';
      return null;
    }
    sessionStorage.setItem('officer', JSON.stringify(data.officer));
    if (data.apiToken) {
      sessionStorage.setItem('apiToken', data.apiToken);
    } else {
      sessionStorage.removeItem('apiToken');
    }
    return data.officer;
  } catch (err) {
    window.location.href = 'index.html';
    return null;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  sessionStorage.removeItem('officer');
  sessionStorage.removeItem('apiToken');
  window.location.href = 'index.html';
}
