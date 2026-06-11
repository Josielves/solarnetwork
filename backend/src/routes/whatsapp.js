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

// POST /api/whatsapp/connect — inicia sessão e retorna QR via SSE
router.post('/connect', requireAuth, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onQR = (qr) => {
      res.write(`data: ${JSON.stringify({ type: 'qr', qr })}\n\n`);
    };

    const result = await createSession(req.tenantId, onQR);

    if (result.status === 'connected') {
      res.write(`data: ${JSON.stringify({ type: 'connected', phone: result.phone })}\n\n`);
      res.end();
      return;
    }

    // Poll for connection for up to 60s
    const start = Date.now();
    const poll = setInterval(async () => {
      const s = await getSessionStatus(req.tenantId);
      if (s.status === 'connected') {
        res.write(`data: ${JSON.stringify({ type: 'connected', phone: s.phone })}\n\n`);
        clearInterval(poll);
        res.end();
      }
      if (Date.now() - start > 60000) {
        res.write(`data: ${JSON.stringify({ type: 'timeout' })}\n\n`);
        clearInterval(poll);
        res.end();
      }
    }, 2000);

    req.on('close', () => clearInterval(poll));
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
