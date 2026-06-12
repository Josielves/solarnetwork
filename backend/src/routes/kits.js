import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sb } from '../services/supabase.js';

const router = Router();

// GET /api/kits — público
router.get('/', async (req, res) => {
  const { data, error } = await sb.from('kits')
    .select('*')
    .eq('active', true)
    .order('price_cents');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(k => ({
    ...k,
    price: 'R$ ' + (k.price_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }),
    stock: `${k.stock} unidades`,
  })));
});

// POST /api/kits — autenticado
router.post('/', requireAuth, async (req, res) => {
  const { title, distributor, city, state, price_cents, stock, items } = req.body;
  if (!title || !distributor || !city || !state || !price_cents)
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });

  const { data, error } = await sb.from('kits').insert({
    tenant_id:   req.tenantId,
    title,
    distributor,
    city,
    state:       state.toUpperCase(),
    price_cents: Number(price_cents),
    stock:       Number(stock) || 0,
    items:       items || [],
    active:      true,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Log activity
  await sb.from('activities').insert({
    tenant_id: req.tenantId,
    title: 'Kit publicado',
    detail: `${title} adicionado ao marketplace por ${distributor}.`,
    type: 'kit',
  });

  res.status(201).json(data);
});

// DELETE /api/kits/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await sb.from('kits')
    .update({ active: false })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
