// ═══════════════════════════════════════════════════════════════════════════
// src/routes/whatsapp.js
// Rota WhatsApp — conecta Baileys + chama o agente CRM em mensagens recebidas
// ═══════════════════════════════════════════════════════════════════════════

import { Router }            from 'express';
import { getSession, connect, disconnect, getMessages } from '../services/whatsapp.js';
import { handleAgentMessage }                            from '../services/whatsapp-agent.js';
import { sb }                                            from '../services/supabase.js';

const router = Router();

// ─── Middleware de autenticação ───────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente.' });

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Não autorizado.' });

  const { data: profile } = await sb
    .from('profiles')
    .select('tenant_id, is_admin')
    .eq('id', user.id)
    .single();

  req.user      = user;
  req.tenantId  = profile?.tenant_id;
  req.isAdmin   = profile?.is_admin === true;
  next();
}

// ─── GET /api/whatsapp/status ────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const session = getSession(req.tenantId);
    if (!session) return res.json({ status: 'disconnected' });

    res.json({
      status: session.status,
      qr:    session.qr    || null,
      phone: session.phone || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/whatsapp/connect ──────────────────────────────────────────────
router.post('/connect', requireAuth, async (req, res) => {
  try {
    // Registra callback do agente antes de conectar
    await connect(req.tenantId, async (fromJid, body) => {
      try {
        const reply = await handleAgentMessage(fromJid, body, req.tenantId);
        if (reply) {
          const session = getSession(req.tenantId);
          await session?.sock?.sendMessage(fromJid, { text: reply });
        }
      } catch (err) {
        console.error('[WA-Agent] Erro ao processar mensagem:', err);
      }
    });

    res.json({ ok: true, message: 'Conexão iniciada. Aguarde o QR Code.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/whatsapp/disconnect ───────────────────────────────────────────
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    await disconnect(req.tenantId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/whatsapp/messages ──────────────────────────────────────────────
router.get('/messages', requireAuth, async (req, res) => {
  try {
    const msgs = await getMessages(req.tenantId);
    res.json(msgs || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/whatsapp/send ─────────────────────────────────────────────────
// Envio manual de mensagem via API (para testes ou automações)
router.post('/send', requireAuth, async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: 'Informe "to" e "text".' });

  try {
    const session = getSession(req.tenantId);
    if (!session || session.status !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp não conectado.' });
    }

    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    await session.sock.sendMessage(jid, { text });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/whatsapp/agent-test ───────────────────────────────────────────
// Testa o agente CRM sem WhatsApp (útil para desenvolvimento)
router.post('/agent-test', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Informe "message".' });

  try {
    const reply = await handleAgentMessage('test@test', message, req.tenantId);
    res.json({ input: message, reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
