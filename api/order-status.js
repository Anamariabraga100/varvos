/**
 * API: Verificar se pedido Pix foi pago
 * GET /api/order-status?orderId=xxx
 * Retorna { paid: true, credits?: N } quando o webhook já creditou
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const orderId = req.query.orderId;
  if (!orderId) {
    return res.status(400).json({ error: 'orderId obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: payment } = await supabase
    .from('payments')
    .select('id, metadata')
    .eq('gateway_id', orderId)
    .eq('status', 'completed')
    .single();

  if (payment) {
    const credits = payment.metadata?.credits
      ? parseInt(payment.metadata.credits, 10)
      : undefined;
    return res.status(200).json({ paid: true, credits });
  }

  return res.status(200).json({ paid: false });
}
