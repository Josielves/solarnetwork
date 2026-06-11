import { Router } from 'express';
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createCheckoutSession, createPortalSession, handleWebhook } from '../services/stripe.js';
import { sb } from '../services/supabase.js';

const router = Router();

// GET /api/stripe/plans
router.get('/plans', async (req, res) => {
  const { data } = await sb.from('stripe_products').select('*').eq('active', true).order('price_brl');
  res.json(data || []);
});

// GET /api/stripe/subscription
router.get('/subscription', requireAuth, async (req, res) => {
  const { data } = await sb.from('subscriptions')
    .select('*').eq('tenant_id', req.tenantId).maybeSingle();
  res.json(data || { plan: req.tenant?.plan || 'free', status: 'active' });
});

// POST /api/stripe/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const origin = req.headers.origin || process.env.FRONTEND_URL;
  try {
    const session = await createCheckoutSession(
      req.tenantId, plan,
      `${origin}/subscription?success=1`,
      `${origin}/subscription?canceled=1`
    );
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stripe/portal
router.post('/portal', requireAuth, async (req, res) => {
  const origin = req.headers.origin || process.env.FRONTEND_URL;
  try {
    const session = await createPortalSession(req.tenantId, `${origin}/subscription`);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stripe/webhook  (raw body needed)
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    try {
      const type = await handleWebhook(req.body, sig);
      console.log(`[Stripe] Webhook handled: ${type}`);
      res.json({ received: true });
    } catch (err) {
      console.error('[Stripe] Webhook error:', err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
