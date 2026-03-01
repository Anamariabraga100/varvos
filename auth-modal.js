const AUTH_STORAGE = 'varvos_user';
const REDIRECT_URL = 'video/';

const authModal = document.getElementById('authModal');
const authModalBackdrop = document.getElementById('authModalBackdrop');
const authModalClose = document.getElementById('authModalClose');
const authReturnTo = document.getElementById('authReturnTo');

function openAuthModal(returnTo) {
  if (!authModal) return;
  if (authReturnTo) authReturnTo.value = returnTo || REDIRECT_URL;
  authModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Reset form state
  const authOptions = document.getElementById('authOptions');
  const emailForm = document.getElementById('emailForm');
  const authErrors = document.getElementById('authErrors');
  if (authOptions) authOptions.classList.remove('hidden');
  if (emailForm) emailForm.classList.add('hidden');
  if (authErrors) { authErrors.textContent = ''; authErrors.classList.add('hidden'); }
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function getReturnTo() {
  return authReturnTo ? authReturnTo.value : REDIRECT_URL;
}

// Triggers
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

// Auth options
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

document.getElementById('btnGoogle')?.addEventListener('click', () => {
  localStorage.setItem(AUTH_STORAGE, JSON.stringify({ provider: 'google', email: 'google-user@varvos.com' }));
  window.location.href = getReturnTo();
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
