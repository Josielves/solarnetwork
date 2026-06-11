import { sb } from '../services/supabase.js';

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente.' });

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido.' });

  // Carrega profile + tenant
  const { data: profile } = await sb
    .from('profiles')
    .select('*, tenants(*)')
    .eq('id', user.id)
    .single();

  if (!profile) return res.status(403).json({ error: 'Perfil não encontrado.' });

  req.user      = user;
  req.profile   = profile;
  req.tenant    = profile.tenants;
  req.tenantId  = profile.tenant_id;
  next();
}
