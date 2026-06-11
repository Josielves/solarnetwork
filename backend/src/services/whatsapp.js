import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { sb } from './supabase.js';
import path from 'path';
import fs from 'fs';

// Map of tenantId -> { socket, qr, status }
const sessions = new Map();
const DATA_DIR = path.resolve('./data/wa_sessions');
fs.mkdirSync(DATA_DIR, { recursive: true });

function sessionDir(tenantId) {
  const dir = path.join(DATA_DIR, tenantId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function updateSessionStatus(tenantId, status, extra = {}) {
  await sb.from('whatsapp_sessions').upsert({
    tenant_id: tenantId,
    status,
    updated_at: new Date().toISOString(),
    ...extra,
  }, { onConflict: 'tenant_id' });
}

export async function createSession(tenantId, onQR) {
  if (sessions.has(tenantId)) {
    const s = sessions.get(tenantId);
    if (s.status === 'connected') return { status: 'connected', phone: s.phone };
    if (s.status === 'connecting') return { status: 'connecting', qr: s.qr };
  }

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(tenantId));

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
    printQRInTerminal: false,
    browser: ['iSolar', 'Chrome', '1.0'],
    generateHighQualityLinkPreview: false,
  });

  const session = { sock, status: 'connecting', qr: null, phone: null };
  sessions.set(tenantId, session);
  await updateSessionStatus(tenantId, 'connecting');

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr);
      session.qr = qrDataUrl;
      session.status = 'connecting';
      await updateSessionStatus(tenantId, 'connecting', { qr_code: qrDataUrl });
      if (onQR) onQR(qrDataUrl);
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.phone  = sock.user?.id?.split(':')[0] || null;
      session.qr     = null;
      await updateSessionStatus(tenantId, 'connected', {
        phone: session.phone,
        qr_code: null,
        connected_at: new Date().toISOString(),
      });
      console.log(`[WA] Tenant ${tenantId} connected as ${session.phone}`);
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reconnect = reason !== DisconnectReason.loggedOut;
      session.status = 'disconnected';
      await updateSessionStatus(tenantId, reconnect ? 'connecting' : 'disconnected');
      sessions.delete(tenantId);
      if (reconnect) {
        console.log(`[WA] Reconnecting tenant ${tenantId}...`);
        setTimeout(() => createSession(tenantId), 3000);
      } else {
        console.log(`[WA] Tenant ${tenantId} logged out.`);
        fs.rmSync(sessionDir(tenantId), { recursive: true, force: true });
      }
    }
  });

  // Save incoming messages to Supabase
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text || '';
      await sb.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        direction: 'in',
        from_jid:  msg.key.remoteJid,
        body,
        wa_msg_id: msg.key.id,
        status: 'received',
      });
    }
  });

  return { status: 'connecting' };
}

export async function getSessionStatus(tenantId) {
  const s = sessions.get(tenantId);
  if (s) return { status: s.status, qr: s.qr, phone: s.phone };
  // Check DB
  const { data } = await sb.from('whatsapp_sessions')
    .select('status, qr_code, phone').eq('tenant_id', tenantId).single();
  return data
    ? { status: data.status, qr: data.qr_code, phone: data.phone }
    : { status: 'disconnected' };
}

export async function disconnectSession(tenantId) {
  const s = sessions.get(tenantId);
  if (s) {
    await s.sock.logout();
    sessions.delete(tenantId);
  }
  await updateSessionStatus(tenantId, 'disconnected', { qr_code: null, phone: null });
  fs.rmSync(sessionDir(tenantId), { recursive: true, force: true });
}

export async function sendMessage(tenantId, to, body) {
  const s = sessions.get(tenantId);
  if (!s || s.status !== 'connected') throw new Error('WhatsApp não conectado.');
  const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
  await s.sock.sendMessage(jid, { text: body });
  await sb.from('whatsapp_messages').insert({
    tenant_id: tenantId,
    direction: 'out',
    to_jid: jid,
    body,
    status: 'sent',
  });
}

// Restore sessions on startup
export async function restoreSessions() {
  const { data } = await sb.from('whatsapp_sessions')
    .select('tenant_id').eq('status', 'connected');
  if (!data) return;
  for (const { tenant_id } of data) {
    console.log(`[WA] Restoring session for tenant ${tenant_id}`);
    createSession(tenant_id).catch(console.error);
  }
}
