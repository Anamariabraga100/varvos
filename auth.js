const AUTH_STORAGE = 'varvos_user';
const REDIRECT_URL = 'video/';

const clientId = window.VARVOS_CONFIG?.googleClientId;

// Fluxo de redefinição de senha (link no e-mail)
(function initRecovery() {
  const hash = window.location.hash || '';
  if (!hash.includes('type=recovery') && !hash.includes('recovery')) return;

  const sb = window.varvosSupabase;
  if (!sb) return;

  const authOptions = document.getElementById('authOptions');
  const emailForm = document.getElementById('emailForm');
  const recoveryForm = document.getElementById('recoveryForm');
  if (!recoveryForm || !authOptions) return;

  authOptions.classList.add('hidden');
  if (emailForm) emailForm.classList.add('hidden');
  recoveryForm.classList.remove('hidden');
  document.querySelector('.auth-title').textContent = 'Redefinir senha';

  document.getElementById('btnRecoverySubmit')?.addEventListener('click', async () => {
    const pwd = document.getElementById('recoveryPassword')?.value || '';
    const pwdConfirm = document.getElementById('recoveryPasswordConfirm')?.value || '';
    const errEl = document.getElementById('recoveryErrors');
    const btn = document.getElementById('btnRecoverySubmit');

    if (pwd.length < 8) {
      if (errEl) { errEl.textContent = 'Use 8 caracteres ou mais.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (pwd !== pwdConfirm) {
      if (errEl) { errEl.textContent = 'As senhas não conferem.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (errEl) errEl.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      const { error } = await sb.auth.updateUser({ password: pwd });
      if (error) throw error;
      window.location.href = '/video/';
    } catch (e) {
      if (errEl) { errEl.textContent = e?.message || 'Erro ao redefinir.'; errEl.classList.remove('hidden'); }
      if (btn) { btn.disabled = false; btn.textContent = 'Redefinir senha'; }
    }
  });
})();
const container = document.getElementById('googleAuthContainer');
const btnGoogle = document.getElementById('btnGoogle');

function getReturnTo() {
  const path = new URLSearchParams(window.location.search).get('return') || REDIRECT_URL;
  return addPlanosIfCreatePage(path);
}

function addPlanosIfCreatePage(path) {
  const norm = path.replace(/^\/+/, '').split('?')[0];
  const isCreatePage = norm === 'video' || norm.startsWith('video/') || norm === 'imitar-movimento' || norm.startsWith('imitar-movimento/');
  if (!isCreatePage) return path;
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'planos=1';
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

document.querySelectorAll('.password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const wrap = btn.closest('.password-input-wrap');
    const input = wrap?.querySelector('input');
    if (!input) return;
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    btn.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');
    btn.setAttribute('title', isVisible ? 'Mostrar senha' : 'Ocultar senha');
  });
});

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
  window.location.href = getReturnTo(); // volta para criar vídeo com ?planos=1 → modal de créditos
});
