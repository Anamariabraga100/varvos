/**
 * API: Configurações do app (admin) — GET e POST
 * GET /api/admin/settings — retorna app_settings
 * POST /api/admin/settings — atualiza app_settings
 * Header: Authorization: Bearer <token>
 */
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!requireAdmin(req, res)) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === 'GET') {
      const { data: rows, error } = await supabase.from('app_settings').select('key, value').in('key', ['hide_model_selection', 'hide_veo3']);
      if (error) throw error;
      const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
      return res.status(200).json({
        hide_model_selection: !!(map.hide_model_selection === true || map.hide_model_selection === 'true'),
        hide_veo3: !!(map.hide_veo3 === true || map.hide_veo3 === 'true')
      });
    }

    const { hide_model_selection, hide_veo3 } = req.body || {};
    const rows = [];
    if (typeof hide_model_selection === 'boolean') {
      rows.push({ key: 'hide_model_selection', value: hide_model_selection, updated_at: new Date().toISOString() });
    }
    if (typeof hide_veo3 === 'boolean') {
      rows.push({ key: 'hide_veo3', value: hide_veo3, updated_at: new Date().toISOString() });
    }
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
