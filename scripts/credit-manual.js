/**
 * Script para creditar manualmente um usuário (ex.: PIX pago mas webhook não creditou)
 *
 * Uso:
 *   EMAIL=comprador@email.com CREDITOS=200 node scripts/credit-manual.js
 *
 * Requer variáveis de ambiente:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY com permissões)
 */

const email = (process.env.EMAIL || '').trim().toLowerCase();
const creditos = parseInt(process.env.CREDITOS || '200', 10);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function run() {
  if (!email || email.length < 5) {
    console.log('Uso: EMAIL=comprador@email.com CREDITOS=200 node scripts/credit-manual.js');
    console.log('');
    console.log('CREDITOS default: 200 (oferta boas-vindas)');
    process.exit(1);
  }
  if (!supabaseUrl || !supabaseKey) {
    console.log('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('id, email, credits')
    .eq('email', email)
    .single();

  if (fetchErr) {
    const { data: inserted, error: upsertErr } = await supabase
      .from('users')
      .upsert({ email, name: email.split('@')[0] || 'Cliente' }, { onConflict: 'email' })
      .select('id, credits')
      .single();

    if (upsertErr) {
      console.error('Erro:', upsertErr.message);
      process.exit(1);
    }
    const newCredits = (inserted?.credits || 0) + creditos;
    await supabase.from('users').update({ credits: newCredits }).eq('id', inserted.id);
    await supabase.from('credit_logs').insert({
      user_id: inserted.id,
      amount: creditos,
      type: 'admin_adjustment',
      reference_id: null,
    });
    console.log('Usuário criado e creditado:', email, '→', creditos, 'créditos (total:', newCredits, ')');
    return;
  }

  const oldCredits = user?.credits ?? 0;
  const newCredits = oldCredits + creditos;

  await supabase.from('users').update({ credits: newCredits }).eq('id', user.id });
  await supabase.from('credit_logs').insert({
    user_id: user.id,
    amount: creditos,
    type: 'admin_adjustment',
    reference_id: null,
  });

  console.log('Créditos adicionados:', email, '→', creditos, '(anterior:', oldCredits, '| novo total:', newCredits, ')');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
