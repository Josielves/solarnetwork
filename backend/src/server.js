import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import leadsRouter     from './routes/leads.js';
import whatsappRouter  from './routes/whatsapp.js';
import stripeRouter    from './routes/stripe.js';
import kitsRouter      from './routes/kits.js';
import { restoreSessions } from './services/whatsapp.js';
import { sb } from './services/supabase.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5500'],
  credentials: true,
}));

// Stripe webhook needs raw body — mount BEFORE json middleware
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/leads',     leadsRouter);
app.use('/api/whatsapp',  whatsappRouter);
app.use('/api/stripe',    stripeRouter);
app.use('/api/kits',      kitsRouter);

// General data routes (tenants, kits, activities)
app.get('/api/tenants', async (req, res) => {
  const { data, error } = await sb.from('tenants').select('*').order('rating', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// /api/kits handled by kitsRouter

app.get('/api/activities', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token ausente.' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).single();
  const { data, error } = await sb.from('activities')
    .select('*').eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false }).limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[iSolar] Backend rodando na porta ${PORT}`);
  await restoreSessions();
});
