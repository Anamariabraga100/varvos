const ADMIN_TOKEN_KEY = 'varvos_admin_token';

const loginEl = document.getElementById('adminLogin');
const statusEl = document.getElementById('adminStatus');
const dashboardEl = document.getElementById('adminDashboard');
const loginForm = document.getElementById('adminLoginForm');
const passwordInput = document.getElementById('adminPassword');
const loginError = document.getElementById('adminLoginError');
const logoutBtn = document.getElementById('adminLogout');

function getAdminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminToken(token) {
  if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function adminFetch(url, options = {}) {
  const token = getAdminToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, { ...options, headers });
}

async function updateStatus() {
  if (!statusEl) return;
  const parts = [];
  const cfg = window.VARVOS_CONFIG;
  if (!cfg) {
    parts.push('<span class="fail">✗ config.js não carregou (404?)</span>');
    statusEl.innerHTML = parts.join('<br>');
    return;
  }
  parts.push('<span class="ok">✓ config.js OK</span>');
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    parts.push('<span class="ok">✓ Supabase configurado</span>');
  } else {
    parts.push('<span class="fail">✗ Supabase não configurado</span>');
  }
  parts.push('<span class="ok">✓ Login validado no servidor (senha nunca no client)</span>');
  statusEl.innerHTML = parts.join('<br>');
}

async function verifySession() {
  const token = getAdminToken();
  if (!token) return false;
  const res = await adminFetch('/api/admin/verify');
  return res.ok;
}

function checkAuth() {
  verifySession().then((ok) => {
    if (ok) {
      loginEl?.classList.add('hidden');
      dashboardEl?.classList.remove('hidden');
      loadDashboard();
    } else {
      setAdminToken('');
      loginEl?.classList.remove('hidden');
      dashboardEl?.classList.add('hidden');
    }
  });
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = (passwordInput.value || '').trim();
  if (!input) {
    loginError.textContent = 'Digite a senha';
    loginError.classList.remove('hidden');
    return;
  }
  loginError.classList.add('hidden');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      loginError.textContent = data.error || 'Senha incorreta';
      loginError.classList.remove('hidden');
      return;
    }
    if (data.token) {
      setAdminToken(data.token);
      passwordInput.value = '';
      checkAuth();
    } else {
      loginError.textContent = 'Erro ao fazer login';
      loginError.classList.remove('hidden');
    }
  } catch (err) {
    loginError.textContent = 'Erro de conexão. Tente novamente.';
    loginError.classList.remove('hidden');
  }
});

logoutBtn?.addEventListener('click', () => {
  setAdminToken('');
  checkAuth();
});

document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
});

async function loadAppSettings() {
  try {
    const res = await adminFetch('/api/admin/settings');
    if (!res.ok) return;
    const data = await res.json();
    const hideModelCb = document.getElementById('hideModelSelection');
    const hideVEO3Cb = document.getElementById('hideVEO3');
    if (hideModelCb) hideModelCb.checked = !!data.hide_model_selection;
    if (hideVEO3Cb) hideVEO3Cb.checked = !!data.hide_veo3;
  } catch (e) {
    console.error('loadAppSettings:', e);
  }
}

async function saveAppSettings() {
  const hideModelCb = document.getElementById('hideModelSelection');
  const hideVEO3Cb = document.getElementById('hideVEO3');
  if (!hideModelCb || !hideVEO3Cb) return;
  try {
    const res = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hide_model_selection: hideModelCb.checked,
        hide_veo3: hideVEO3Cb.checked
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('saveAppSettings:', err);
    }
  } catch (e) {
    console.error('saveAppSettings:', e);
  }
}

async function loadDashboard() {
  const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  try {
    const res = await adminFetch('/api/admin/dashboard?filter=' + (salesFilter || 'day'));
    if (!res.ok) {
      if (res.status === 401) {
        setAdminToken('');
        checkAuth();
        return;
      }
      throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao carregar');
    }
    const data = await res.json();
    const { users, payments, stats } = data;

    setStat('statTotalUsers', stats?.statTotalUsers ?? '—');
    setStat('statTotalRevenue', stats?.statTotalRevenue ?? '—');
    setStat('statNewToday', stats?.statNewToday ?? '—');
    setStat('statPeriodRevenue', stats?.statPeriodRevenue ?? '—');
    setStat('statRecurring', stats?.statRecurring ?? '—');
    setStat('statNewPurchases', stats?.statNewPurchases ?? '—');
    setStat('statPayingToday', stats?.statPayingToday ?? '—');
    setStat('statRepeatBuyersToday', stats?.statRepeatBuyersToday ?? '—');

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = (users && users.length) ? users.map(u => `
      <tr>
        <td>${escapeHtml(u.name || '—')}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.credits ?? 0}</td>
        <td>${formatDate(u.created_at)}</td>
        <td><button type="button" class="admin-btn-edit" data-user-id="${u.id}" data-credits="${u.credits ?? 0}">Editar créditos</button></td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="admin-loading">Nenhum usuário</td></tr>';

    tbody.querySelectorAll('.admin-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        openEditCreditsModal({
          id: btn.dataset.userId,
          email: row?.cells[1]?.textContent || '—',
          name: row?.cells[0]?.textContent || '',
          credits: parseInt(btn.dataset.credits, 10) || 0
        });
      });
    });

    const usersMap = {};
    (users || []).forEach(u => { usersMap[u.id] = u; });
    (payments || []).forEach(p => {
      if (!usersMap[p.user_id]) usersMap[p.user_id] = { email: p.user_id, name: '—' };
    });

    const statusClass = (s) => {
      const v = (s || '').toLowerCase();
      if (v === 'completed') return 'status-completed';
      if (v === 'pending') return 'status-pending';
      if (v === 'failed') return 'status-failed';
      if (v === 'refunded') return 'status-refunded';
      return '';
    };
    const paymentTypeLabel = (p) => ((p.metadata?.type || '').toLowerCase() === 'assinatura' ? 'Recorrente' : 'Avulso');

    const paymentsTbody = document.getElementById('paymentsTableBody');
    paymentsTbody.innerHTML = (payments && payments.length) ? payments.map(p => {
      const u = usersMap[p.user_id];
      const sc = statusClass(p.status);
      return `
        <tr>
          <td><strong>R$ ${Number(p.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
          <td><span class="type-badge type-${(p.metadata?.type || 'avulso').toLowerCase()}">${escapeHtml(paymentTypeLabel(p))}</span></td>
          <td><span class="status-badge ${sc}">${escapeHtml(p.status || '—')}</span></td>
          <td>${escapeHtml(u?.email || p.user_id)}</td>
          <td>${escapeHtml(p.gateway || '—')}</td>
          <td>${formatDate(p.created_at)}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6" class="admin-loading">Nenhum pagamento</td></tr>';

  } catch (err) {
    console.error('Admin load:', err);
    const msg = err?.message || 'Erro ao carregar';
    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setStat('statTotalUsers', '—');
    setStat('statTotalRevenue', '—');
    setStat('statNewToday', '—');
    setStat('statPeriodRevenue', '—');
    setStat('statRecurring', '—');
    setStat('statNewPurchases', '—');
    setStat('statPayingToday', '—');
    setStat('statRepeatBuyersToday', '—');
    document.getElementById('usersTableBody').innerHTML = `<tr><td colspan="5">Erro: ${escapeHtml(msg)}</td></tr>`;
    document.getElementById('paymentsTableBody').innerHTML = `<tr><td colspan="6">Erro: ${escapeHtml(msg)}</td></tr>`;
  }
  await loadAppSettings();
}

document.getElementById('hideModelSelection')?.addEventListener('change', saveAppSettings);
document.getElementById('hideVEO3')?.addEventListener('change', saveAppSettings);

let salesFilter = 'day';

document.querySelectorAll('.admin-filter-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    salesFilter = btn.dataset.filter || 'day';
    document.querySelectorAll('.admin-filter-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadDashboard();
  });
});

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const editCreditsModal = document.getElementById('adminEditCreditsModal');
const editCreditsInput = document.getElementById('adminEditCreditsInput');
const editCreditsUserInfo = document.getElementById('adminEditUserInfo');
const editCreditsSave = document.getElementById('adminEditCreditsSave');
let editingUserId = null;

function openEditCreditsModal(user) {
  editingUserId = user.id;
  editCreditsUserInfo.textContent = (user.name ? user.name + ' · ' : '') + user.email;
  editCreditsInput.value = user.credits;
  editCreditsModal?.classList.remove('hidden');
}

function closeEditCreditsModal() {
  editingUserId = null;
  editCreditsModal?.classList.add('hidden');
}

editCreditsModal?.querySelector('.admin-modal-backdrop')?.addEventListener('click', closeEditCreditsModal);
editCreditsModal?.querySelector('.admin-modal-cancel')?.addEventListener('click', closeEditCreditsModal);

editCreditsSave?.addEventListener('click', async () => {
  const val = parseInt(editCreditsInput.value, 10);
  if (isNaN(val) || val < 0) {
    alert('Digite um número válido de créditos (≥ 0).');
    return;
  }
  if (!editingUserId) return;
  editCreditsSave.disabled = true;
  try {
    const res = await adminFetch('/api/admin/edit-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: editingUserId, credits: val })
    });
    if (!res.ok) {
      if (res.status === 401) {
        setAdminToken('');
        checkAuth();
        return;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar');
    }
    closeEditCreditsModal();
    loadDashboard();
  } catch (err) {
    console.error('Erro ao atualizar créditos:', err);
    alert('Erro: ' + (err?.message || 'Não foi possível atualizar'));
  } finally {
    editCreditsSave.disabled = false;
  }
});

document.getElementById('adminSearchBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('adminSearchEmail');
  const resultEl = document.getElementById('adminSearchResult');
  const email = input?.value?.trim();
  if (!email) return;

  resultEl.classList.remove('hidden');
  try {
    const res = await adminFetch('/api/admin/search?email=' + encodeURIComponent(email));
    if (!res.ok) {
      if (res.status === 401) {
        setAdminToken('');
        checkAuth();
        return;
      }
      const err = await res.json().catch(() => ({}));
      resultEl.innerHTML = '<p>Erro: ' + escapeHtml(err.error || 'Erro na busca') + '</p>';
      return;
    }
    const data = await res.json();
    const users = data.users || [];
    if (!users.length) {
      resultEl.innerHTML = '<p>Nenhum usuário encontrado.</p>';
      return;
    }
    resultEl.innerHTML = '<pre>' + escapeHtml(JSON.stringify(users, null, 2)) + '</pre>';
  } catch (err) {
    resultEl.innerHTML = '<p>Erro de conexão.</p>';
  }
});

checkAuth();
