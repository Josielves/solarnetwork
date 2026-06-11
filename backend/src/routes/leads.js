import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sb } from '../services/supabase.js';

const router = Router();

// GET /api/leads
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await sb.from('leads')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/leads
router.post('/', requireAuth, async (req, res) => {
  const { name, city, state, power, type, note, value_brl,
          contact_name, contact_phone, contact_email } = req.body;
  if (!name || !city || !state || !power)
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });

  const { data, error } = await sb.from('leads').insert({
    tenant_id: req.tenantId,
    name, city, state: state.toUpperCase(), power: Number(power),
    type: type || 'Outro', note, value_brl,
    contact_name, contact_phone, contact_email,
    stage: 'Novo',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Log activity
  await sb.from('activities').insert({
    tenant_id: req.tenantId,
    title: 'Lead novo recebido',
    detail: `${name} entrou no funil em ${city}/${state}.`,
    type: 'lead',
  });

  res.status(201).json(data);
});

// PATCH /api/leads/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  delete updates.tenant_id; delete updates.id;

  const { data, error } = await sb.from('leads')
    .update(updates)
    .eq('id', id).eq('tenant_id', req.tenantId)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/leads/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await sb.from('leads')
    .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
