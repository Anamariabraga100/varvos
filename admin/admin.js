const ADMIN_SESSION = 'varvos_admin_session';

const loginEl = document.getElementById('adminLogin');
const statusEl = document.getElementById('adminStatus');

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

  const hasPass = !!(cfg.adminPassword || '').toString().trim();
  parts.push(hasPass ? '<span class="ok">✓ adminPassword definido</span>' : '<span class="fail">✗ adminPassword vazio em config.js</span>');

  const sb = window.varvosSupabase;
  if (!sb) {
    parts.push('<span class="fail">✗ Supabase não inicializou</span>');
    statusEl.innerHTML = parts.join('<br>');
    return;
  }
  parts.push('<span class="ok">✓ Supabase cliente OK</span>');

  try {
    const { data, error } = await sb.from('users').select('id').limit(1);
    if (error) {
      parts.push('<span class="fail">✗ Supabase: ' + (error.message || 'erro') + '</span>');
    } else {
      parts.push('<span class="ok">✓ Supabase conectado e tabelas OK</span>');
    }
  } catch (e) {
    parts.push('<span class="fail">✗ Erro ao testar: ' + (e.message || e) + '</span>');
  }
  statusEl.innerHTML = parts.join('<br>');
}

const dashboardEl = document.getElementById('adminDashboard');
const loginForm = document.getElementById('adminLoginForm');
const passwordInput = document.getElementById('adminPassword');
const loginError = document.getElementById('adminLoginError');
const logoutBtn = document.getElementById('adminLogout');

function isAdminLoggedIn() {
  const pass = (window.VARVOS_CONFIG?.adminPassword || '').toString().trim();
  if (!pass) return false;
  return sessionStorage.getItem(ADMIN_SESSION) === pass;
}

function checkAuth() {
  if (isAdminLoggedIn()) {
    loginEl?.classList.add('hidden');
    dashboardEl?.classList.remove('hidden');
    loadDashboard();
  } else {
    loginEl?.classList.remove('hidden');
    dashboardEl?.classList.add('hidden');
  }
}

loginForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const pass = (window.VARVOS_CONFIG?.adminPassword || '').toString().trim();
  if (!pass) {
    loginError.textContent = 'Configure adminPassword no config.js';
    loginError.classList.remove('hidden');
    return;
  }
  const input = (passwordInput.value || '').trim();
  if (input === pass) {
    sessionStorage.setItem(ADMIN_SESSION, pass);
    loginError.classList.add('hidden');
    passwordInput.value = '';
    checkAuth();
  } else {
    loginError.textContent = 'Senha incorreta';
    loginError.classList.remove('hidden');
  }
});

logoutBtn?.addEventListener('click', () => {
  sessionStorage.removeItem(ADMIN_SESSION);
  checkAuth();
});

document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
});

async function loadAppSettings() {
  const sb = window.varvosSupabase;
  const checkbox = document.getElementById('hideModelSelection');
  if (!sb || !checkbox) return;
  try {
    const { data } = await sb.from('app_settings').select('value').eq('key', 'hide_model_selection').maybeSingle();
    checkbox.checked = !!(data?.value === true || data?.value === 'true');
  } catch (e) {
    console.error('loadAppSettings:', e);
  }
}

async function saveAppSettings() {
  const sb = window.varvosSupabase;
  const checkbox = document.getElementById('hideModelSelection');
  if (!sb || !checkbox) return;
  try {
    await sb.from('app_settings').upsert(
      { key: 'hide_model_selection', value: checkbox.checked, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.error('saveAppSettings:', e);
  }
}

async function loadDashboard() {
  const sb = window.varvosSupabase;
  if (!sb) {
    document.getElementById('statTotalUsers').textContent = '—';
    document.getElementById('statTotalRevenue').textContent = '—';
    document.getElementById('statNewToday').textContent = '—';
    document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="4">Supabase não configurado (config.js)</td></tr>';
    document.getElementById('paymentsTableBody').innerHTML = '<tr><td colspan="5">Supabase não configurado</td></tr>';
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const todayStart = today + 'T00:00:00.000Z';

    const [usersRes, paymentsRes, usersTodayRes, totalUsersRes] = await Promise.all([
      sb.from('users').select('id, email, name, credits, created_at').order('created_at', { ascending: false }).limit(50),
      sb.from('payments').select('id, user_id, amount, status, gateway, created_at').order('created_at', { ascending: false }).limit(30),
      sb.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      sb.from('users').select('id', { count: 'exact', head: true })
    ]);

    const users = usersRes.data || [];
    const payments = paymentsRes.data || [];
    const newToday = usersTodayRes.count ?? 0;
    const totalUsers = totalUsersRes.count ?? 0;

    const totalRevenue = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount || 0), 0);

    document.getElementById('statTotalUsers').textContent = totalUsers;
    document.getElementById('statTotalRevenue').textContent = totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    document.getElementById('statNewToday').textContent = newToday;

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.length ? users.slice(0, 20).map(u => `
      <tr>
        <td>${escapeHtml(u.name || '—')}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.credits ?? 0}</td>
        <td>${formatDate(u.created_at)}</td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="admin-loading">Nenhum usuário</td></tr>';

    const userIds = [...new Set(payments.map(p => p.user_id))];
    const usersMap = {};
    users.forEach(u => { usersMap[u.id] = u; });
    if (userIds.length) {
      const { data: extraUsers } = await sb.from('users').select('id, email, name').in('id', userIds);
      extraUsers?.forEach(u => { usersMap[u.id] = u; });
    }

    const statusClass = (s) => {
      const v = (s || '').toLowerCase();
      if (v === 'completed') return 'status-completed';
      if (v === 'pending') return 'status-pending';
      if (v === 'failed') return 'status-failed';
      if (v === 'refunded') return 'status-refunded';
      return '';
    };

    const paymentsTbody = document.getElementById('paymentsTableBody');
    paymentsTbody.innerHTML = payments.length ? payments.slice(0, 20).map(p => {
      const u = usersMap[p.user_id];
      const sc = statusClass(p.status);
      return `
        <tr>
          <td>${escapeHtml(u?.email || p.user_id)}</td>
          <td><strong>R$ ${Number(p.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
          <td><span class="status-badge ${sc}">${escapeHtml(p.status || '—')}</span></td>
          <td>${escapeHtml(p.gateway || '—')}</td>
          <td>${formatDate(p.created_at)}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="5" class="admin-loading">Nenhum pagamento</td></tr>';

  } catch (err) {
    console.error('Admin load:', err);
    const msg = err?.message || 'Erro ao carregar';
    document.getElementById('usersTableBody').innerHTML = `<tr><td colspan="4">Erro: ${escapeHtml(msg)}</td></tr>`;
    document.getElementById('paymentsTableBody').innerHTML = `<tr><td colspan="5">Erro: ${escapeHtml(msg)}</td></tr>`;
  }
  await loadAppSettings();
}

document.getElementById('hideModelSelection')?.addEventListener('change', saveAppSettings);

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

document.getElementById('adminSearchBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('adminSearchEmail');
  const resultEl = document.getElementById('adminSearchResult');
  const email = input?.value?.trim();
  if (!email) return;

  const sb = window.varvosSupabase;
  if (!sb) {
    resultEl.textContent = 'Supabase não configurado';
    resultEl.classList.remove('hidden');
    return;
  }

  const { data, error } = await sb.from('users').select('*').ilike('email', `%${email}%`).limit(10);
  resultEl.classList.remove('hidden');
  if (error) {
    resultEl.innerHTML = '<p>Erro: ' + escapeHtml(error.message) + '</p>';
    return;
  }
  if (!data?.length) {
    resultEl.innerHTML = '<p>Nenhum usuário encontrado.</p>';
    return;
  }
  resultEl.innerHTML = '<pre>' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
});

checkAuth();
