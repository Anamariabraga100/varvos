/**
 * API: Verificar se o token admin é válido
 * GET /api/admin/verify
 * Header: Authorization: Bearer <token>
 * Retorna: { ok: true } ou 401
 */
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!requireAdmin(req, res)) return;
  return res.status(200).json({ ok: true });
}
