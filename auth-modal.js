const AUTH_STORAGE = 'varvos_user';
const REDIRECT_URL = 'video/';

const authModal = document.getElementById('authModal');
const authModalBackdrop = document.getElementById('authModalBackdrop');
const authModalClose = document.getElementById('authModalClose');
const authReturnTo = document.getElementById('authReturnTo');

const clientId = window.VARVOS_CONFIG?.googleClientId;
const container = document.getElementById('googleAuthContainerModal');
const btnGoogle = document.getElementById('btnGoogle');

function openAuthModal(returnTo) {
  if (!authModal) return;
  if (authReturnTo) authReturnTo.value = returnTo || REDIRECT_URL;
  authModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const authOptions = document.getElementById('authOptions');
  const emailForm = document.getElementById('emailForm');
  const authErrors = document.getElementById('authErrors');
  if (authOptions) authOptions.classList.remove('hidden');
  if (emailForm) emailForm.classList.add('hidden');
  if (authErrors) { authErrors.textContent = ''; authErrors.classList.add('hidden'); }
  if (clientId && container && typeof google !== 'undefined' && google.accounts) {
    initGoogleButtonInModal();
  }
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function getReturnTo() {
  return authReturnTo ? authReturnTo.value : REDIRECT_URL;
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
  if (!payload) return;
  const base = { provider: 'google', email: payload.email || '', name: payload.name || '', picture: payload.picture || '', sub: payload.sub };
  let user = base;
  if (window.varvosAuthSupabase?.syncUserFromGoogle) {
    try {
      user = await window.varvosAuthSupabase.syncUserFromGoogle(payload) || base;
    } catch {}
  }
  localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
  closeAuthModal();
  window.location.href = getReturnTo();
}

function initGoogleButtonInModal() {
  if (!clientId || !container) return;
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

function initGoogleOnLoad() {
  if (!clientId || !container) return;
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initGoogleOnLoad, 100);
    return;
  }
  initGoogleButtonInModal();
}

if (clientId) {
  initGoogleOnLoad();
} else if (btnGoogle) {
  btnGoogle.style.display = '';
  btnGoogle.addEventListener('click', () => {
    localStorage.setItem(AUTH_STORAGE, JSON.stringify({ provider: 'google', email: 'google-user@varvos.com' }));
    closeAuthModal();
    window.location.href = getReturnTo();
  });
}

document.getElementById('authTrigger')?.addEventListener('click', (e) => {
  e.preventDefault();
  openAuthModal(REDIRECT_URL);
});

document.getElementById('authTriggerHero')?.addEventListener('click', (e) => {
  e.preventDefault();
  openAuthModal(REDIRECT_URL);
});

document.getElementById('authTriggerCta')?.addEventListener('click', (e) => {
  e.preventDefault();
  openAuthModal(REDIRECT_URL);
});

document.querySelectorAll('.auth-trigger').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthModal(el.dataset.return || REDIRECT_URL);
  });
});

authModalClose?.addEventListener('click', closeAuthModal);
authModalBackdrop?.addEventListener('click', closeAuthModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && authModal && !authModal.classList.contains('hidden')) {
    closeAuthModal();
  }
});

document.getElementById('btnEmail')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.add('hidden');
  document.getElementById('emailForm').classList.remove('hidden');
});

document.getElementById('btnBack')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.remove('hidden');
  document.getElementById('emailForm').classList.add('hidden');
  const authErrors = document.getElementById('authErrors');
  if (authErrors) { authErrors.textContent = ''; authErrors.classList.add('hidden'); }
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
  closeAuthModal();
  window.location.href = getReturnTo();
});
