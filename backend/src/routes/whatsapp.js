// ═══════════════════════════════════════════════════════════════════════════
// whatsapp.js — Módulo de integração WhatsApp (Baileys) para iSolar Backend
// ═══════════════════════════════════════════════════════════════════════════
//
// COMO INTEGRAR no seu src/server.js:
//
//   import whatsappRouter from "./whatsapp.js"; // ajuste o caminho se necessário
//   app.use("/api/whatsapp", authMiddleware, whatsappRouter);
//
// `authMiddleware` é o middleware que você já usa para validar o JWT do
// Supabase (o que popula req.user / req.tenantId). Se seu middleware usa
// outro nome, é só trocar.
//
// Endpoints expostos:
//   POST /api/whatsapp/connect      -> inicia a sessão e começa a gerar o QR
//   GET  /api/whatsapp/status       -> { status, qr, phone }
//   POST /api/whatsapp/disconnect   -> desconecta e limpa a sessão
//   GET  /api/whatsapp/messages     -> lista mensagens recebidas/enviadas
//
// O front-end (app.js) já está pronto para consumir esses endpoints
// exatamente como estão (showQR, connectWA, polling de status etc.)

import express from "express";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";

const router = express.Router();

// ─── ESTADO EM MEMÓRIA ────────────────────────────────────────────────────
// OBS: simples e funcional para 1 número de WhatsApp por instância do
// backend. Se no futuro precisar de 1 sessão por tenant, troque `state`
// por um Map<tenantId, state> e use req.tenantId para escolher a sessão.
const state = {
  sock: null,
  status: "disconnected", // "disconnected" | "connecting" | "connected"
  qr: null,                // data URL (base64) do QR atual
  phone: null,             // número conectado, ex: "5545999999999"
  messages: [],            // histórico simples em memória
};

const AUTH_DIR = path.join(process.cwd(), "baileys_auth");
const logger = pino({ level: "silent" }); // mude para "info" se quiser debugar

// ─── CONEXÃO COM O WHATSAPP ────────────────────────────────────────────────
async function startSock() {
  if (state.status === "connecting" || state.status === "connected") return;

  state.status = "connecting";
  state.qr = null;

  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: authState,
    logger,
    printQRInTerminal: false,
  });

  state.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        state.qr = await QRCode.toDataURL(qr);
        state.status = "connecting";
      } catch (e) {
        logger.error(e, "Erro ao gerar QR code");
      }
    }

    if (connection === "open") {
      state.status = "connected";
      state.qr = null;
      state.phone = sock.user?.id?.split(":")[0]?.split("@")[0] || null;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      state.status = "disconnected";
      state.qr = null;
      state.sock = null;

      if (loggedOut) {
        // Sessão revogada pelo celular: limpa credenciais salvas
        state.phone = null;
        fs.rm(AUTH_DIR, { recursive: true, force: true }, () => {});
      } else {
        // Queda de conexão "normal": tenta reconectar automaticamente
        startSock().catch((e) => logger.error(e, "Erro ao reconectar"));
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    for (const m of messages) {
      if (!m.message) continue;
      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        "";

      state.messages.unshift({
        id: m.key.id,
        direction: m.key.fromMe ? "out" : "in",
        from_jid: m.key.remoteJid,
        to_jid: m.key.fromMe ? m.key.remoteJid : sock.user?.id,
        body: text,
        timestamp: Number(m.messageTimestamp) * 1000,
      });
    }
    // mantém só as últimas 100 mensagens em memória
    if (state.messages.length > 100) state.messages.length = 100;
  });
}

// ─── ROTAS ──────────────────────────────────────────────────────────────────

// Inicia a conexão (gera QR). Responde imediatamente; o front faz polling
// em /status para acompanhar o progresso.
router.post("/connect", async (req, res) => {
  try {
    if (state.status === "connected") {
      return res.json({ status: "connected", phone: state.phone });
    }
    startSock().catch((e) => logger.error(e, "Erro ao iniciar sessão WA"));
    res.json({ status: "connecting" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status atual + QR (se houver)
router.get("/status", (req, res) => {
  res.json({
    status: state.status,
    qr: state.qr,
    phone: state.phone,
  });
});

// Desconecta e limpa a sessão salva
router.post("/disconnect", async (req, res) => {
  try {
    if (state.sock) {
      await state.sock.logout().catch(() => {});
    }
    state.sock = null;
    state.status = "disconnected";
    state.qr = null;
    state.phone = null;
    fs.rm(AUTH_DIR, { recursive: true, force: true }, () => {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lista mensagens recebidas/enviadas
router.get("/messages", (req, res) => {
  res.json(state.messages);
});

export default router;
