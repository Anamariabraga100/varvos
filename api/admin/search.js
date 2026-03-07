/**
 * API: Buscar usuário por email (admin)
 * GET /api/admin/search?email=xxx
 * Header: Authorization: Bearer <token>
 */
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!requireAdmin(req, res)) return;

  const email = (req.query?.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'email obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase.from('users').select('*').ilike('email', `%${email}%`).limit(10);
    if (error) throw error;
    return res.status(200).json({ users: data || [] });
  } catch (err) {
    console.error('Admin search:', err);
    return res.status(500).json({ error: err?.message || 'Erro' });
  }
}
