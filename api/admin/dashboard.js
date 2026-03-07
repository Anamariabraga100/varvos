/**
 * API: Dados do dashboard admin (usuários, pagamentos, stats)
 * GET /api/admin/dashboard
 * Header: Authorization: Bearer <token>
 */
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!requireAdmin(req, res)) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const salesFilter = req.query?.filter || 'day';
  const today = new Date().toISOString().split('T')[0];
  const todayStart = today + 'T00:00:00.000Z';

  let periodFrom, periodTo;
  const now = new Date();
  if (salesFilter === 'day') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    periodFrom = d.toISOString();
  } else if (salesFilter === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    periodFrom = d.toISOString();
  } else {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
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
      const creditsA = Number(a.credits ?? 0);
      const creditsB = Number(b.credits ?? 0);
      if (creditsA > 0 && creditsB === 0) return -1;
      if (creditsA === 0 && creditsB > 0) return 1;
      if (creditsA !== creditsB) return creditsB - creditsA;
      return new Date(b.created_at) - new Date(a.created_at);
    });

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

    return res.status(200).json({
      users: users.slice(0, 20),
      payments: payments.slice(0, 20),
      stats: {
        statTotalUsers: totalUsers,
        statTotalRevenue: totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        statNewToday: newToday,
        statPeriodRevenue: periodRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        statRecurring: recurring,
        statNewPurchases: newPurchases,
        statPayingToday: payingToday,
        statRepeatBuyersToday: multiPurchaseToday
      }
    });
  } catch (err) {
    console.error('Admin dashboard:', err);
    return res.status(500).json({ error: err?.message || 'Erro ao carregar' });
  }
}
