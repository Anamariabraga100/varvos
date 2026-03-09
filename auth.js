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

let isLoginMode = false;

function setAuthMode(login) {
  isLoginMode = login;
  const wrap = document.getElementById('passwordConfirmWrap');
  const btn = document.getElementById('btnAuthSubmit');
  const toggle = document.getElementById('authModeToggle');
  const sub = document.querySelector('.auth-subtitle');
  if (wrap) wrap.classList.toggle('hidden', login);
  if (btn) btn.textContent = login ? 'Entrar' : 'Criar conta';
  if (toggle) toggle.textContent = login ? 'Não tem conta? Criar conta' : 'Já tem conta? Fazer login';
  if (sub) sub.innerHTML = login ? 'Entre com seu e-mail e senha' : 'Crie uma conta <strong>gratuita</strong>';
  const err = document.getElementById('authErrors');
  if (err) { err.textContent = ''; err.classList.add('hidden'); }
}

document.getElementById('btnEmail')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.add('hidden');
  document.getElementById('emailForm').classList.remove('hidden');
  setAuthMode(false);
});

document.getElementById('btnBack')?.addEventListener('click', () => {
  document.getElementById('authOptions').classList.remove('hidden');
  document.getElementById('emailForm').classList.add('hidden');
});

document.getElementById('authModeToggle')?.addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode(!isLoginMode);
});

function validatePassword(password, passwordConfirm, requireConfirm) {
  const errors = [];
  if (password.length < 8) errors.push('Use 8 caracteres ou mais.');
  if (requireConfirm && password !== passwordConfirm) errors.push('As senhas não conferem.');
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

document.getElementById('emailForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;
  const errorsEl = document.getElementById('authErrors');
  const btn = document.getElementById('btnAuthSubmit');

  if (!email || !email.includes('@')) {
    if (errorsEl) { errorsEl.textContent = 'Digite um e-mail válido.'; errorsEl.classList.remove('hidden'); }
    return;
  }

  const errors = validatePassword(password, passwordConfirm, !isLoginMode);
  if (errors.length) {
    if (errorsEl) { errorsEl.textContent = errors.join(' '); errorsEl.classList.remove('hidden'); }
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

  try {
    if (isLoginMode) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = await (window.varvosAuthSupabase?.syncUserFromEmail(data.user) || Promise.resolve(null));
      saveUserAndRedirect(user || { provider: 'email', email: data.user.email, id: data.user.id });
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (data?.user) {
        const user = await (window.varvosAuthSupabase?.syncUserFromEmail(data.user) || Promise.resolve(null));
        saveUserAndRedirect(user || { provider: 'email', email: data.user.email, id: data.user.id });
      }
    }
  } catch (err) {
    console.error('auth:', err);
    if (errorsEl) {
      const msg = (err?.message || '').toLowerCase();
      let text = isLoginMode ? 'Erro ao entrar.' : 'Erro ao criar conta.';
      if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        text = 'E-mail ou senha incorretos.';
      } else if (msg.includes('user already registered') || msg.includes('already been registered')) {
        text = 'E-mail já cadastrado. Use o link acima para fazer login.';
      } else if (msg.includes('invalid api key')) {
        text = 'Configuração temporária. Tente novamente em alguns minutos.';
      } else if (err?.message) {
        text = err.message;
      }
      errorsEl.textContent = text;
      errorsEl.classList.remove('hidden');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
});
