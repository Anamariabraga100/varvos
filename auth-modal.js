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
  localStorage.setItem(AUTH_STORAGE, JSON.stringify(user));
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
    localStorage.setItem(AUTH_STORAGE, JSON.stringify({ provider: 'google', email: 'google-user@varvos.com' }));
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
    const raw = localStorage.getItem(AUTH_STORAGE);
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

document.getElementById('btnEmail')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.add('hidden');
  document.getElementById('emailForm').classList.remove('hidden');
  const sub = document.getElementById('authSubtitle');
  if (sub) sub.innerHTML = 'Digite seu e-mail para continuar';
  resetEmailForm();
});

function resetEmailForm() {
  const emailStep = document.getElementById('emailStep');
  const passwordStep = document.getElementById('passwordStep');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const passwordConfirm = document.getElementById('passwordConfirm');
  if (emailStep) emailStep.classList.remove('hidden');
  if (passwordStep) passwordStep.classList.add('hidden');
  const hint = document.getElementById('passwordStepHint');
  if (hint) hint.classList.add('hidden');
  if (email) email.value = '';
  if (password) password.value = '';
  if (passwordConfirm) passwordConfirm.value = '';
  ['authErrors', 'authErrorsStep2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  });
}

document.getElementById('btnBack')?.addEventListener('click', () => {
  const passwordStep = document.getElementById('passwordStep');
  if (passwordStep && !passwordStep.classList.contains('hidden')) {
    document.getElementById('emailStep')?.classList.remove('hidden');
    passwordStep.classList.add('hidden');
    const p = document.getElementById('password'); if (p) p.value = '';
    const pc = document.getElementById('passwordConfirm'); if (pc) pc.value = '';
    document.getElementById('authErrorsStep2')?.classList.add('hidden');
  } else {
    document.getElementById('authOptions').classList.remove('hidden');
    document.getElementById('emailForm').classList.add('hidden');
    resetEmailForm();
  }
});

document.getElementById('btnEmailContinue')?.addEventListener('click', async () => {
  const email = document.getElementById('email')?.value?.trim();
  const errorsEl = document.getElementById('authErrors');
  if (!email) return;
  if (errorsEl) errorsEl.classList.add('hidden');

  const btn = document.getElementById('btnEmailContinue');
  const origText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  try {
    const res = await fetch('/api/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao verificar');
    const exists = !!json.exists;

    document.getElementById('emailStep')?.classList.add('hidden');
    const passwordStep = document.getElementById('passwordStep');
    const confirmWrap = document.getElementById('passwordConfirmWrap');
    const passwordLabel = document.getElementById('passwordLabel');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('btnPasswordSubmit');

    const sub = document.getElementById('authSubtitle');
    const hint = document.getElementById('passwordStepHint');
    const forgotLink = document.getElementById('btnForgotPassword');
    if (exists) {
      if (sub) sub.innerHTML = 'Entre na sua <strong>conta</strong>';
      if (hint) { hint.textContent = 'Digite sua senha para entrar.'; hint.classList.remove('hidden'); }
      passwordLabel.textContent = 'Senha';
      passwordInput.placeholder = 'Digite sua senha';
      confirmWrap?.classList.add('hidden');
      if (submitBtn) submitBtn.textContent = 'Entrar';
      // Esqueci minha senha oculto até SES produção estar ativo
      // if (forgotLink) forgotLink.classList.remove('hidden');
    } else {
      if (sub) sub.innerHTML = 'Crie uma conta <strong>gratuita</strong>';
      if (hint) { hint.textContent = 'Crie uma senha com no mínimo 8 caracteres.'; hint.classList.remove('hidden'); }
      passwordLabel.textContent = 'Criar senha';
      passwordInput.placeholder = 'Mínimo 8 caracteres';
      confirmWrap?.classList.remove('hidden');
      if (submitBtn) submitBtn.textContent = 'Criar conta';
      if (forgotLink) forgotLink.classList.add('hidden');
    }
    passwordStep?.classList.remove('hidden');
    document.getElementById('authErrorsStep2')?.classList.add('hidden');
  } catch (e) {
    console.error('check_email:', e);
    if (errorsEl) { errorsEl.textContent = 'Não foi possível verificar o e-mail. Tente novamente.'; errorsEl.classList.remove('hidden'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText || 'Continuar'; }
  }
});

document.getElementById('btnForgotPassword')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email')?.value?.trim();
  const errorsEl = document.getElementById('authErrorsStep2');
  if (!email || !email.includes('@')) {
    if (errorsEl) { errorsEl.textContent = 'Digite um e-mail válido.'; errorsEl.classList.remove('hidden'); }
    return;
  }
  if (errorsEl) errorsEl.classList.add('hidden');
  const link = e.target.closest('a') || e.target;
  const origText = link.textContent;
  if (link) { link.style.pointerEvents = 'none'; link.textContent = 'Enviando...'; }
  try {
    const res = await fetch('/api/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      if (errorsEl) {
        errorsEl.textContent = 'Enviamos um link para seu e-mail. Verifique sua caixa de entrada.';
        errorsEl.classList.remove('hidden');
        errorsEl.classList.remove('error');
      }
      if (link) link.textContent = 'E-mail enviado';
    } else {
      if (errorsEl) {
        errorsEl.textContent = json.error || 'Não foi possível enviar. Tente novamente.';
        errorsEl.classList.remove('hidden');
      }
      if (link) { link.style.pointerEvents = ''; link.textContent = origText; }
    }
  } catch (err) {
    if (errorsEl) {
      errorsEl.textContent = 'Erro de conexão. Tente novamente.';
      errorsEl.classList.remove('hidden');
    }
    if (link) { link.style.pointerEvents = ''; link.textContent = origText; }
  }
});

document.getElementById('btnPasswordSubmit')?.addEventListener('click', async () => {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const passwordConfirm = document.getElementById('passwordConfirm')?.value;
  const confirmWrap = document.getElementById('passwordConfirmWrap');
  const errorsEl = document.getElementById('authErrorsStep2');
  const submitBtn = document.getElementById('btnPasswordSubmit');

  const isSignup = confirmWrap && !confirmWrap.classList.contains('hidden');

  if (isSignup) {
    if (!password || password.length < 8) {
      if (errorsEl) { errorsEl.textContent = 'Use 8 caracteres ou mais.'; errorsEl.classList.remove('hidden'); }
      return;
    }
    if (password !== passwordConfirm) {
      if (errorsEl) { errorsEl.textContent = 'As senhas não conferem.'; errorsEl.classList.remove('hidden'); }
      return;
    }
  } else {
    if (!password) {
      if (errorsEl) { errorsEl.textContent = 'Digite sua senha.'; errorsEl.classList.remove('hidden'); }
      return;
    }
  }
  if (errorsEl) errorsEl.classList.add('hidden');

  const sb = window.varvosSupabase;
  if (!sb) {
    if (errorsEl) { errorsEl.textContent = 'Serviço indisponível.'; errorsEl.classList.remove('hidden'); }
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isSignup ? 'Criando...' : 'Entrando...'; }

  try {
    if (isSignup) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (data?.user) {
        const user = await (window.varvosAuthSupabase?.syncUserFromEmail(data.user) || Promise.resolve(null));
        localStorage.setItem(AUTH_STORAGE, JSON.stringify(user || { provider: 'email', email: data.user.email }));
        fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.user.email, name: user?.name || '' })
        }).catch(() => {});
      }
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.user) {
        const user = await (window.varvosAuthSupabase?.syncUserFromEmail(data.user) || Promise.resolve(null));
        localStorage.setItem(AUTH_STORAGE, JSON.stringify(user || { provider: 'email', email: data.user.email }));
      }
    }
    closeAuthModal();
    window.location.href = getReturnTo();
  } catch (e) {
    console.error('auth:', e);
    if (errorsEl) {
      const msg = (e?.message || '').toLowerCase();
      let text = 'Erro ao fazer login.';
      if (msg.includes('invalid api key') || msg.includes('api key')) {
        text = 'Configuração temporária. Tente novamente em alguns minutos.';
      } else if (msg.includes('invalid') && (msg.includes('password') || msg.includes('senha') || msg.includes('credentials'))) {
        text = 'Senha incorreta.';
      } else if (msg.includes('invalid')) {
        text = 'Senha incorreta.';
      } else if (e?.message) {
        text = e.message;
      }
      errorsEl.textContent = text;
      errorsEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isSignup ? 'Criar conta' : 'Entrar'; }
  }
});
