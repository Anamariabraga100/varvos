/**
 * API Admin unificada — todas as rotas em uma única Serverless Function
 * POST /api/admin/login | GET /api/admin/verify | GET /api/admin/dashboard
 * POST /api/admin/edit-credits | GET|POST /api/admin/settings | GET /api/admin/search
 */
import { createClient } from '@supabase/supabase-js';
import { createAdminToken, requireAdmin } from './_auth.js';

function getRoute(req) {
  let route = '';
  const slug = req.query?.slug;
  if (Array.isArray(slug) && slug.length > 0) {
    route = slug[0];
  } else if (req.url) {
    const match = String(req.url).match(/\/api\/admin\/?([^/?]*)/);
    route = match ? match[1] : '';
  }
  if (!route && req.method === 'POST') route = 'login';
  return route;
}

export default async function handler(req, res) {
  const route = getRoute(req);

  if (route === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
    if (!adminPassword) return res.status(500).json({ error: 'Admin não configurado (ADMIN_PASSWORD)' });
    const { password } = req.body || {};
    const input = (password || '').trim();
    if (!input) return res.status(400).json({ error: 'Senha obrigatória' });
    if (input !== adminPassword) return res.status(401).json({ error: 'Senha incorreta' });
    const token = createAdminToken();
    if (!token) return res.status(500).json({ error: 'Erro ao gerar sessão' });
    return res.status(200).json({ token });
  }

  if (route === 'verify') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    if (!requireAdmin(req, res)) return;
    return res.status(200).json({ ok: true });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (route === 'dashboard') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    if (!requireAdmin(req, res)) return;
    const salesFilter = req.query?.filter || 'day';
    const today = new Date().toISOString().split('T')[0];
    const todayStart = today + 'T00:00:00.000Z';
    let periodFrom, periodTo;
    const now = new Date();
    if (salesFilter === 'day') {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      periodFrom = d.toISOString();
    } else if (salesFilter === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      periodFrom = d.toISOString();
    } else {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      periodFrom = d.toISOString();
    }
    periodTo = now.toISOString();
    try {
      const [usersRes, paymentsRes, usersTodayRes, totalUsersRes, paymentsPeriodRes, paymentsTodayRes] = await Promise.all([
        supabase.from('users').select('id, email, name, credits, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('payments').select('id, user_id, amount, status, gateway, metadata, created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('payments').select('id, user_id, amount, status, metadata, created_at').eq('status', 'completed').gte('created_at', periodFrom).lte('created_at', periodTo),
        supabase.from('payments').select('user_id').eq('status', 'completed').gte('created_at', todayStart)
      ]);
      const users = (usersRes.data || []).sort((a, b) => {
        const ca = Number(a.credits ?? 0), cb = Number(b.credits ?? 0);
        if (ca > 0 && cb === 0) return -1;
        if (ca === 0 && cb > 0) return 1;
        if (ca !== cb) return cb - ca;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      const payments = paymentsRes.data || [];
      const paymentsPeriod = paymentsPeriodRes.data || [];
      const paymentsToday = paymentsTodayRes.data || [];
      const totalRevenue = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount || 0), 0);
      const periodRevenue = paymentsPeriod.reduce((s, p) => s + Number(p.amount || 0), 0);
      const countByUserToday = {};
      paymentsToday.forEach(p => { countByUserToday[p.user_id] = (countByUserToday[p.user_id] || 0) + 1; });
      return res.status(200).json({
        users: users.slice(0, 20),
        payments: payments.slice(0, 20),
        stats: {
          statTotalUsers: totalUsersRes.count ?? 0,
          statTotalRevenue: totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          statNewToday: usersTodayRes.count ?? 0,
          statPeriodRevenue: periodRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          statRecurring: paymentsPeriod.filter(p => (p.metadata?.type || '').toLowerCase() === 'assinatura').length,
          statNewPurchases: paymentsPeriod.filter(p => (p.metadata?.type || '').toLowerCase() === 'avulso' || !p.metadata?.type).length,
          statPayingToday: new Set(paymentsToday.map(p => p.user_id)).size,
          statRepeatBuyersToday: Object.values(countByUserToday).filter(c => c >= 2).length
        }
      });
    } catch (err) {
      console.error('Admin dashboard:', err);
      return res.status(500).json({ error: err?.message || 'Erro ao carregar' });
    }
  }

  if (route === 'edit-credits') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    if (!requireAdmin(req, res)) return;
    const { userId, credits } = req.body || {};
    const val = parseInt(credits, 10);
    if (!userId || isNaN(val) || val < 0) return res.status(400).json({ error: 'userId e credits (≥ 0) obrigatórios' });
    try {
      const { data: userRow, error: fetchErr } = await supabase.from('users').select('credits').eq('id', userId).single();
      if (fetchErr || !userRow) return res.status(404).json({ error: 'Usuário não encontrado' });
      const diff = val - (userRow?.credits ?? 0);
      const { error: updateErr } = await supabase.from('users').update({ credits: val }).eq('id', userId);
      if (updateErr) return res.status(500).json({ error: updateErr.message || 'Erro ao atualizar' });
      if (diff !== 0) await supabase.from('credit_logs').insert({ user_id: userId, amount: diff, type: 'admin_adjustment', reference_id: null });
      return res.status(200).json({ ok: true, credits: val });
    } catch (err) {
      console.error('Admin edit-credits:', err);
      return res.status(500).json({ error: err?.message || 'Erro ao atualizar' });
    }
  }

  if (route === 'settings') {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    if (!requireAdmin(req, res)) return;
    try {
      if (req.method === 'GET') {
        const { data: rows, error } = await supabase.from('app_settings').select('key, value').in('key', ['hide_model_grok', 'hide_model_veo3', 'hide_model_sora2']);
        if (error) throw error;
        const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
        const toBool = (v) => !!(v === true || v === 'true');
        return res.status(200).json({
          hide_model_grok: toBool(map.hide_model_grok),
          hide_model_veo3: toBool(map.hide_model_veo3),
          hide_model_sora2: toBool(map.hide_model_sora2)
        });
      }
      const { hide_model_grok, hide_model_veo3, hide_model_sora2 } = req.body || {};
      const rows = [];
      if (typeof hide_model_grok === 'boolean') rows.push({ key: 'hide_model_grok', value: hide_model_grok, updated_at: new Date().toISOString() });
      if (typeof hide_model_veo3 === 'boolean') rows.push({ key: 'hide_model_veo3', value: hide_model_veo3, updated_at: new Date().toISOString() });
      if (typeof hide_model_sora2 === 'boolean') rows.push({ key: 'hide_model_sora2', value: hide_model_sora2, updated_at: new Date().toISOString() });
      if (rows.length) {
        const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Admin settings:', err);
      return res.status(500).json({ error: err?.message || 'Erro' });
    }
  }

  if (route === 'search') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    if (!requireAdmin(req, res)) return;
    const email = (req.query?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email obrigatório' });
    try {
      const { data, error } = await supabase.from('users').select('*').ilike('email', `%${email}%`).limit(10);
      if (error) throw error;
      return res.status(200).json({ users: data || [] });
    } catch (err) {
      console.error('Admin search:', err);
      return res.status(500).json({ error: err?.message || 'Erro' });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}
