const AUTH_STORAGE = 'varvos_user';
const REDIRECT_URL = 'video/';

document.getElementById('btnEmail').addEventListener('click', () => {
  document.getElementById('authOptions').classList.add('hidden');
  document.getElementById('emailForm').classList.remove('hidden');
});

document.getElementById('btnBack').addEventListener('click', () => {
  document.getElementById('authOptions').classList.remove('hidden');
  document.getElementById('emailForm').classList.add('hidden');
});

document.getElementById('btnGoogle').addEventListener('click', () => {
  localStorage.setItem(AUTH_STORAGE, JSON.stringify({ provider: 'google', email: 'google-user@varvos.com' }));
  const returnTo = new URLSearchParams(window.location.search).get('return') || REDIRECT_URL;
  window.location.href = returnTo;
});

document.getElementById('emailForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email) return;
  localStorage.setItem(AUTH_STORAGE, JSON.stringify({
    provider: 'email',
    email,
    hasPassword: !!password
  }));
  const returnTo = new URLSearchParams(window.location.search).get('return') || REDIRECT_URL;
  window.location.href = returnTo;
});
