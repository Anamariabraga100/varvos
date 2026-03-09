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
  const path = authReturnTo ? authReturnTo.value : REDIRECT_URL;
  return addPlanosIfCreatePage(path);
}

function addPlanosIfCreatePage(path) {
  const norm = (path || '').replace(/^\/+/, '').split('?')[0];
  const isCreatePage = norm === 'video' || norm.startsWith('video/') || norm === 'imitar-movimento' || norm.startsWith('imitar-movimento/');
  if (!isCreatePage) return path;
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'planos=1';
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
  localStorage.setItem(window.AUTH_STORAGE, JSON.stringify(user));
  fetch('/api/send-welcome-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, name: user.name || '' })
  }).catch(() => {});
  closeAuthModal();
  window.location.href = getReturnTo();
}

function initGoogleButtonInModal() {
  if (!clientId || !container) return;
  container.innerHTML = '';
  var parent = container.closest('.auth-modal-content');
  var parentW = (parent && parent.offsetWidth > 0) ? parent.offsetWidth : 380;
  var w = Math.min(Math.max(parentW - 60, 280), 360);
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
    auto_select: false
  });
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: w
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
    localStorage.setItem(window.AUTH_STORAGE, JSON.stringify({ provider: 'google', email: 'google-user@varvos.com' }));
    closeAuthModal();
    window.location.href = getReturnTo();
  });
}

document.getElementById('authTrigger')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (isLoggedIn()) {
    window.location.href = REDIRECT_URL;
    return;
  }
  openAuthModal(REDIRECT_URL);
});

document.getElementById('authTriggerHero')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (isLoggedIn()) {
    window.location.href = REDIRECT_URL;
    return;
  }
  openAuthModal(REDIRECT_URL);
});

function isLoggedIn() {
  try {
    const raw = localStorage.getItem(window.AUTH_STORAGE);
    const user = raw ? JSON.parse(raw) : null;
    return !!(user && user.email);
  } catch (_) {
    return false;
  }
}

document.getElementById('authTriggerCta')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (isLoggedIn()) {
    window.location.href = REDIRECT_URL;
    return;
  }
  openAuthModal(REDIRECT_URL);
});

document.querySelectorAll('.auth-trigger').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const returnTo = el.dataset.return || REDIRECT_URL;
    if (isLoggedIn()) {
      window.location.href = returnTo;
      return;
    }
    openAuthModal(returnTo);
  });
});

authModalClose?.addEventListener('click', closeAuthModal);
authModalBackdrop?.addEventListener('click', closeAuthModal);

document.querySelectorAll('.password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const wrap = btn.closest('.password-input-wrap');
    const input = wrap?.querySelector('input');
    if (!input) return;
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    btn.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');
    btn.setAttribute('title', isVisible ? 'Mostrar senha' : 'Ocultar senha');
    btn.setAttribute('aria-pressed', !isVisible);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && authModal && !authModal.classList.contains('hidden')) {
    closeAuthModal();
  }
});

let isLoginMode = false;

function setAuthMode(login) {
  isLoginMode = login;
  const wrap = document.getElementById('passwordConfirmWrap');
  const btn = document.getElementById('btnAuthSubmit');
  const toggle = document.getElementById('authLoginLink');
  const sub = document.getElementById('authSubtitle');
  if (wrap) wrap.classList.toggle('hidden', login);
  if (btn) btn.textContent = login ? 'Entrar' : 'Criar conta';
  if (toggle) toggle.textContent = login ? 'Não tem conta? Criar conta' : 'Já tem conta? Fazer login';
  if (sub) sub.innerHTML = login ? 'Entre com seu e-mail e senha' : 'Crie sua conta';
  const err = document.getElementById('authErrors');
  if (err) { err.textContent = ''; err.classList.add('hidden'); }
}

document.getElementById('btnEmail')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.add('hidden');
  document.getElementById('emailForm').classList.remove('hidden');
  setAuthMode(false);
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
  document.getElementById('passwordConfirm').value = '';
});

document.getElementById('btnBack')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.remove('hidden');
  document.getElementById('emailForm').classList.add('hidden');
});

document.getElementById('authLoginLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode(!isLoginMode);
});

function validatePasswordMatch() {
  const password = document.getElementById('password')?.value;
  const passwordConfirm = document.getElementById('passwordConfirm')?.value;
  const errorsEl = document.getElementById('authErrors');
  if (!errorsEl) return;
  if (password !== passwordConfirm) {
    errorsEl.textContent = 'As senhas não conferem.';
    errorsEl.classList.remove('hidden');
  } else if (errorsEl.textContent === 'As senhas não conferem.') {
    errorsEl.textContent = '';
    errorsEl.classList.add('hidden');
  }
}

document.getElementById('password')?.addEventListener('input', validatePasswordMatch);
document.getElementById('passwordConfirm')?.addEventListener('input', validatePasswordMatch);

document.getElementById('btnAuthSubmit')?.addEventListener('click', () => {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const passwordConfirm = document.getElementById('passwordConfirm')?.value;
  const errorsEl = document.getElementById('authErrors');
  const btn = document.getElementById('btnAuthSubmit');

  if (!email || !email.includes('@')) {
    if (errorsEl) { errorsEl.textContent = 'Digite um e-mail válido.'; errorsEl.classList.remove('hidden'); }
    return;
  }
  if (!password) {
    if (errorsEl) { errorsEl.textContent = 'Digite sua senha.'; errorsEl.classList.remove('hidden'); }
    return;
  }
  if (password.length < 8) {
    if (errorsEl) { errorsEl.textContent = 'Use 8 caracteres ou mais.'; errorsEl.classList.remove('hidden'); }
    return;
  }
  if (!isLoginMode && password !== passwordConfirm) {
    if (errorsEl) { errorsEl.textContent = 'As senhas não conferem.'; errorsEl.classList.remove('hidden'); }
    return;
  }
  if (errorsEl) errorsEl.classList.add('hidden');

  const sb = window.varvosSupabase;
  if (!sb) {
    if (errorsEl) { errorsEl.textContent = 'Serviço indisponível.'; errorsEl.classList.remove('hidden'); }
    return;
  }

  const origText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = isLoginMode ? 'Entrando...' : 'Criando...'; }

  (async function runAuth() {
    try {
      if (isLoginMode) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const user = await (window.varvosAuthSupabase?.syncUserFromEmail(data.user) || Promise.resolve(null));
        localStorage.setItem(window.AUTH_STORAGE, JSON.stringify(user || { provider: 'email', email: data.user.email, id: data.user.id }));
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user) {
          const user = await (window.varvosAuthSupabase?.syncUserFromEmail(data.user) || Promise.resolve(null));
          localStorage.setItem(window.AUTH_STORAGE, JSON.stringify(user || { provider: 'email', email: data.user.email }));
          fetch('/api/send-welcome-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.user.email, name: user?.name || '' })
          }).catch(() => {});
        }
      }
      closeAuthModal();
      window.location.href = getReturnTo();
    } catch (e) {
      console.error('auth:', e);
      if (errorsEl) {
        const msg = (e?.message || '').toLowerCase();
        let text = isLoginMode ? 'Erro ao entrar.' : 'Erro ao criar conta.';
        if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
          text = 'E-mail ou senha incorretos.';
        } else if (msg.includes('invalid api key') || msg.includes('api key')) {
          text = 'Configuração temporária. Tente novamente em alguns minutos.';
        } else if (msg.includes('user already registered') || msg.includes('already been registered')) {
          text = 'E-mail já cadastrado. Clique em "Já tem conta? Fazer login" para entrar.';
        } else if (e?.message) {
          text = e.message;
        }
        errorsEl.textContent = text;
        errorsEl.classList.remove('hidden');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  })();
});
