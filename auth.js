const AUTH_STORAGE = 'varvos_user';
const REDIRECT_URL = 'video/';

const clientId = window.VARVOS_CONFIG?.googleClientId;
const container = document.getElementById('googleAuthContainer');
const btnGoogle = document.getElementById('btnGoogle');

function getReturnTo() {
  return new URLSearchParams(window.location.search).get('return') || REDIRECT_URL;
}

function saveUserAndRedirect(user) {
  localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
  window.location.href = getReturnTo();
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    return null;
  }
}

async function handleGoogleCredential(response) {
  const payload = decodeJwtPayload(response.credential);
  if (!payload) {
    console.error('Falha ao decodificar token Google');
    return;
  }
  const base = { provider: 'google', email: payload.email || '', name: payload.name || '', picture: payload.picture || '', sub: payload.sub };
  if (window.varvosAuthSupabase?.syncUserFromGoogle) {
    try {
      const user = await window.varvosAuthSupabase.syncUserFromGoogle(payload);
      saveUserAndRedirect(user || base);
    } catch {
      saveUserAndRedirect(base);
    }
  } else {
    saveUserAndRedirect(base);
  }
}

function initGoogleSignIn() {
  if (!clientId || !container) return;
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initGoogleSignIn, 100);
    return;
  }
  container.innerHTML = '';
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
    auto_select: false
  });
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: 320
  });
}

// Fallback: botão fake quando não há Client ID (dev)
function setupFakeGoogleBtn() {
  if (btnGoogle) btnGoogle.style.display = '';
  btnGoogle?.addEventListener('click', () => {
    localStorage.setItem(AUTH_STORAGE, JSON.stringify({ provider: 'google', email: 'google-user@varvos.com' }));
    window.location.href = getReturnTo();
  });
}

if (clientId) {
  initGoogleSignIn();
} else {
  setupFakeGoogleBtn();
}

document.getElementById('btnEmail')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.add('hidden');
  document.getElementById('emailForm').classList.remove('hidden');
});

document.getElementById('btnBack')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.remove('hidden');
  document.getElementById('emailForm').classList.add('hidden');
});

function validatePassword(password, passwordConfirm) {
  const errors = [];
  if (password.length < 8) errors.push('Use 8 caracteres ou mais.');
  if (password !== passwordConfirm) errors.push('As senhas não conferem.');
  return errors;
}

document.getElementById('emailForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;
  const errorsEl = document.getElementById('authErrors');

  if (!email) return;

  const errors = validatePassword(password, passwordConfirm);
  if (errors.length) {
    if (errorsEl) {
      errorsEl.textContent = errors.join(' ');
      errorsEl.classList.remove('hidden');
    }
    return;
  }
  if (errorsEl) errorsEl.classList.add('hidden');

  localStorage.setItem(AUTH_STORAGE, JSON.stringify({
    provider: 'email',
    email,
    hasPassword: !!password
  }));
  window.location.href = getReturnTo();
});
