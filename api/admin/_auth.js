/**
 * Utilitário de autenticação admin — token assinado com HMAC
 */
import crypto from 'crypto';

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas

export function createAdminToken() {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !secret.trim()) return null;
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}.${random}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !secret.trim()) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split('.');
    if (parts.length !== 3) return false;
    const [timestamp, random, signature] = parts;
    const age = Date.now() - parseInt(timestamp, 10);
    if (age < 0 || age > TOKEN_EXPIRY_MS) return false;
    const payload = `${timestamp}.${random}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function getAdminTokenFromRequest(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

export function requireAdmin(req, res) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'Não autorizado' });
    return false;
  }
  return true;
}
