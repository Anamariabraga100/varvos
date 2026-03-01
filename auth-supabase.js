/**
 * Integração auth + Supabase
 * Salva/cria usuário no banco ao logar com Google
 */
window.varvosAuthSupabase = {
  async syncUserFromGoogle(payload) {
    const sb = window.varvosSupabase;
    if (!sb) return null;

    const email = payload.email || '';
    const name = payload.name || '';
    const picture = payload.picture || '';
    const googleId = payload.sub || '';

    if (!email || !googleId) return null;

    try {
      const { data: userId, error: rpcError } = await sb.rpc('upsert_user_from_google', {
        p_email: email,
        p_name: name,
        p_picture: picture,
        p_google_id: googleId
      });

      if (rpcError) {
        console.error('Supabase upsert user:', rpcError);
        return { provider: 'google', email, name, picture, sub: googleId, credits: 0 };
      }

      const { data: user, error: fetchError } = await sb
        .from('users')
        .select('id, email, name, picture, credits, plan')
        .eq('id', userId)
        .single();

      if (fetchError || !user) {
        return { provider: 'google', email, name, picture, sub: googleId, id: userId, credits: 0 };
      }

      return {
        provider: 'google',
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        sub: googleId,
        credits: user.credits ?? 0,
        plan: user.plan
      };
    } catch (e) {
      console.error('auth-supabase sync:', e);
      return { provider: 'google', email, name, picture, sub: googleId, credits: 0 };
    }
  }
};
