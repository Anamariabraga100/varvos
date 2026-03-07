/**
 * API: Login admin — valida senha no servidor e retorna token de sessão
 * POST /api/admin/login
 * Body: { password: string }
 * Retorna: { token: string } ou 401
 */
import { createAdminToken } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin não configurado (ADMIN_PASSWORD)' });
  }

  const { password } = req.body || {};
  const input = (password || '').trim();

  if (!input) {
    return res.status(400).json({ error: 'Senha obrigatória' });
  }

  if (input !== adminPassword) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  const token = createAdminToken();
  if (!token) {
    return res.status(500).json({ error: 'Erro ao gerar sessão' });
  }

  return res.status(200).json({ token });
}
