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
  const hideModelCb = document.getElementById('hideModelSelection');
  const hideVEO3Cb = document.getElementById('hideVEO3');
  if (!sb) return;
  try {
    const { data: rows } = await sb.from('app_settings').select('key, value').in('key', ['hide_model_selection', 'hide_veo3']);
    const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
    if (hideModelCb) hideModelCb.checked = !!(map.hide_model_selection === true || map.hide_model_selection === 'true');
    if (hideVEO3Cb) hideVEO3Cb.checked = !!(map.hide_veo3 === true || map.hide_veo3 === 'true');
  } catch (e) {
    console.error('loadAppSettings:', e);
  }
}

async function saveAppSettings() {
  const sb = window.varvosSupabase;
  const hideModelCb = document.getElementById('hideModelSelection');
  const hideVEO3Cb = document.getElementById('hideVEO3');
  if (!sb) return;
  try {
    const rows = [];
    if (hideModelCb) rows.push({ key: 'hide_model_selection', value: hideModelCb.checked, updated_at: new Date().toISOString() });
    if (hideVEO3Cb) rows.push({ key: 'hide_veo3', value: hideVEO3Cb.checked, updated_at: new Date().toISOString() });
    if (rows.length) await sb.from('app_settings').upsert(rows, { onConflict: 'key' });
  } catch (e) {
    console.error('saveAppSettings:', e);
  }
}

async function loadDashboard() {
  const sb = window.varvosSupabase;
  const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  if (!sb) {
    setStat('statTotalUsers', '—');
    setStat('statTotalRevenue', '—');
    setStat('statNewToday', '—');
    setStat('statPeriodRevenue', '—');
    setStat('statRecurring', '—');
    setStat('statNewPurchases', '—');
    setStat('statPayingToday', '—');
    setStat('statRepeatBuyersToday', '—');
    document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="5">Supabase não configurado (config.js)</td></tr>';
    document.getElementById('paymentsTableBody').innerHTML = '<tr><td colspan="6">Supabase não configurado</td></tr>';
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const todayStart = today + 'T00:00:00.000Z';
    const { from: periodFrom, to: periodTo } = getDateRangeForFilter(salesFilter);

    const [usersRes, paymentsRes, usersTodayRes, totalUsersRes, paymentsPeriodRes, paymentsTodayRes] = await Promise.all([
      sb.from('users').select('id, email, name, credits, created_at').order('created_at', { ascending: false }).limit(50),
      sb.from('payments').select('id, user_id, amount, status, gateway, metadata, created_at').order('created_at', { ascending: false }).limit(100),
      sb.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      sb.from('users').select('id', { count: 'exact', head: true }),
      sb.from('payments').select('id, user_id, amount, status, metadata, created_at').eq('status', 'completed').gte('created_at', periodFrom).lte('created_at', periodTo),
      sb.from('payments').select('user_id').eq('status', 'completed').gte('created_at', todayStart)
    ]);

    const users = usersRes.data || [];
    const payments = paymentsRes.data || [];
    const paymentsPeriod = paymentsPeriodRes.data || [];
    const paymentsToday = paymentsTodayRes.data || [];
    const newToday = usersTodayRes.count ?? 0;
    const totalUsers = totalUsersRes.count ?? 0;

    const totalRevenue = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount || 0), 0);
    const periodRevenue = paymentsPeriod.reduce((s, p) => s + Number(p.amount || 0), 0);
    const recurring = paymentsPeriod.filter(p => (p.metadata?.type || '').toLowerCase() === 'assinatura').length;
    const newPurchases = paymentsPeriod.filter(p => (p.metadata?.type || '').toLowerCase() === 'avulso' || !p.metadata?.type).length;
    const payingToday = new Set(paymentsToday.map(p => p.user_id)).size;
    const countByUserToday = {};
    paymentsToday.forEach(p => { countByUserToday[p.user_id] = (countByUserToday[p.user_id] || 0) + 1; });
    const multiPurchaseToday = Object.values(countByUserToday).filter(c => c >= 2).length;

    setStat('statTotalUsers', totalUsers);
    setStat('statTotalRevenue', totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setStat('statNewToday', newToday);
    setStat('statPeriodRevenue', periodRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setStat('statRecurring', recurring);
    setStat('statNewPurchases', newPurchases);
    setStat('statPayingToday', payingToday);
    setStat('statRepeatBuyersToday', multiPurchaseToday);

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.length ? users.slice(0, 20).map(u => `
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
    const paymentTypeLabel = (p) => ((p.metadata?.type || '').toLowerCase() === 'assinatura' ? 'Recorrente' : 'Avulso');

    const paymentsTbody = document.getElementById('paymentsTableBody');
    paymentsTbody.innerHTML = payments.length ? payments.slice(0, 20).map(p => {
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
    document.getElementById('usersTableBody').innerHTML = `<tr><td colspan="5">Erro: ${escapeHtml(msg)}</td></tr>`;
    document.getElementById('paymentsTableBody').innerHTML = `<tr><td colspan="6">Erro: ${escapeHtml(msg)}</td></tr>`;
  }
  await loadAppSettings();
}

document.getElementById('hideModelSelection')?.addEventListener('change', saveAppSettings);
document.getElementById('hideVEO3')?.addEventListener('change', saveAppSettings);

/** Filtro de vendas: day | week | month */
let salesFilter = 'day';

function getDateRangeForFilter(filter) {
  const now = new Date();
  const to = now.toISOString();
  let from;
  if (filter === 'day') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    from = d.toISOString();
  } else if (filter === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString();
  } else {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString();
  }
  return { from, to };
}

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
  const sb = window.varvosSupabase;
  if (!sb || !editingUserId) return;
  editCreditsSave.disabled = true;
  try {
    const { data: userRow } = await sb.from('users').select('credits').eq('id', editingUserId).single();
    const oldCredits = userRow?.credits ?? 0;
    const diff = val - oldCredits;

    await sb.from('users').update({ credits: val }).eq('id', editingUserId);

    if (diff !== 0) {
      await sb.from('credit_logs').insert({
        user_id: editingUserId,
        amount: diff,
        type: 'admin_adjustment',
        reference_id: null
      });
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
