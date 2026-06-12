import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createSession, getSessionStatus,
  disconnectSession, sendMessage
} from '../services/whatsapp.js';

const router = Router();

// GET /api/whatsapp/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await getSessionStatus(req.tenantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/connect — inicia sessão (frontend faz polling no /status)
router.post('/connect', requireAuth, async (req, res) => {
  try {
    const result = await createSession(req.tenantId);
    res.json({ status: result.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    await disconnectSession(req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send
router.post('/send', requireAuth, async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to e body obrigatórios.' });
  try {
    await sendMessage(req.tenantId, to, body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/messages
router.get('/messages', requireAuth, async (req, res) => {
  const { sb } = await import('../services/supabase.js');
  const { data, error } = await sb.from('whatsapp_messages')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
