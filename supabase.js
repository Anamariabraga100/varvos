/**
 * Inicializa o cliente Supabase.
 * Use window.varvosSupabase para acessar nas páginas.
 * Carregue após config.js e o script do Supabase.
 */
(function() {
  const cfg = window.VARVOS_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) {
    window.varvosSupabase = null;
    return;
  }
  if (typeof supabase === 'undefined') {
    console.warn('Supabase: biblioteca não carregada. Adicione <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    window.varvosSupabase = null;
    return;
  }
  try {
    const { createClient } = supabase;
    window.varvosSupabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  } catch (e) {
    console.error('Supabase: erro ao conectar', e);
    window.varvosSupabase = null;
  }
})();
