// ═══════════════════════════════════════════════════════════════════════════
// whatsapp.js — Módulo de integração WhatsApp (Baileys) para iSolar Backend
// ═══════════════════════════════════════════════════════════════════════════
//
// COMO INTEGRAR no seu src/server.js:
//
//   import whatsappRouter from "./whatsapp.js"; // ajuste o caminho se necessário
//   app.use("/api/whatsapp", authMiddleware, whatsappRouter);
//
// Endpoints expostos:
//   POST /api/whatsapp/connect      -> inicia a sessão e começa a gerar o QR
//   GET  /api/whatsapp/status       -> { status, qr, phone, error }
//   POST /api/whatsapp/disconnect   -> desconecta e limpa a sessão
//   GET  /api/whatsapp/messages     -> lista mensagens recebidas/enviadas
//
// CORREÇÃO (vs. versão anterior):
//   `fetchLatestBaileysVersion()` faz uma chamada de rede para checar a
//   versão mais recente do protocolo do WhatsApp Web. Se essa chamada
//   travar (rede do Railway bloqueando o domínio, DNS lento, etc.) e nunca
//   resolver nem rejeitar, o código ficava parado ali para sempre — sem
//   erro, sem log, sem QR. `makeWASocket()` nunca era chamado.
//   Agora há um timeout de 5s com fallback para uma versão fixa conhecida,
//   garantindo que o socket seja criado mesmo se a checagem de versão falhar.

import express from "express";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import * as BaileysPkg from "@whiskeysockets/baileys";
import {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

// O pacote @whiskeysockets/baileys mudou a forma de exportar `makeWASocket`
// entre versões (default export vs named export vs default.default em
// builds CJS/ESM misturados). Em vez de assumir um formato, detectamos
// qual está disponível em tempo de execução.
const makeWASocket =
  (typeof BaileysPkg.default === "function" && BaileysPkg.default) ||
  (typeof BaileysPkg.default?.default === "function" && BaileysPkg.default.default) ||
  (typeof BaileysPkg.makeWASocket === "function" && BaileysPkg.makeWASocket);

if (typeof makeWASocket !== "function") {
  console.error(
    "[WA] Não foi possível localizar a função makeWASocket no pacote @whiskeysockets/baileys. " +
    "Chaves disponíveis no módulo:", Object.keys(BaileysPkg)
  );
}

const router = express.Router();

// ─── ESTADO EM MEMÓRIA ────────────────────────────────────────────────────
const state = {
  sock: null,
  status: "disconnected", // "disconnected" | "connecting" | "connected"
  qr: null,                // data URL (base64) do QR atual
  phone: null,             // número conectado, ex: "5545999999999"
  error: null,             // última mensagem de erro (para depuração)
  messages: [],            // histórico simples em memória
};

const AUTH_DIR = path.join(process.cwd(), "baileys_auth");

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Versão fixa de fallback, usada apenas se a checagem online travar/falhar.
// Pode atualizar de tempos em tempos consultando:
// https://github.com/WhiskeySockets/Baileys/blob/master/src/Defaults/baileys-version.json
const FALLBACK_WA_VERSION = [2, 3000, 1023223821];

async function getBaileysVersion() {
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout ao buscar versão do protocolo")), 5000)
      ),
    ]);
    console.log(`[WA] Versão do protocolo (online): ${result.version.join(".")} (latest: ${result.isLatest})`);
    return result.version;
  } catch (e) {
    console.warn("[WA] Não foi possível buscar a versão mais recente, usando fallback fixo:", e.message);
    return FALLBACK_WA_VERSION;
  }
}

// ─── CONEXÃO COM O WHATSAPP ────────────────────────────────────────────────
async function startSock() {
  if (state.status === "connecting" || state.status === "connected") return;

  state.status = "connecting";
  state.qr = null;
  state.error = null;

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const version = await getBaileysVersion();
    console.log(`[WA] Usando versão do protocolo WA Web: ${version.join(".")}`);

    const sock = makeWASocket({
      auth: authState,
      version,
      // printQRInTerminal removido nas versões mais novas do Baileys —
      // pegamos o QR via evento connection.update abaixo.
    });

    state.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log("[WA] connection.update:", JSON.stringify({
        connection,
        hasQr: !!qr,
        errMsg: lastDisconnect?.error?.message,
        statusCode: lastDisconnect?.error?.output?.statusCode,
      }));

      if (qr) {
        try {
          state.qr = await QRCode.toDataURL(qr);
          state.status = "connecting";
          console.log("[WA] QR gerado e disponível em /status");
        } catch (e) {
          console.error("[WA] Erro ao gerar imagem do QR:", e);
          state.error = "Erro ao gerar imagem do QR: " + e.message;
        }
      }

      if (connection === "open") {
        reconnectAttempts = 0;
        state.status = "connected";
        state.qr = null;
        state.error = null;
        state.phone = sock.user?.id?.split(":")[0]?.split("@")[0] || null;
        console.log("[WA] Conectado como", state.phone);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        state.status = "disconnected";
        state.qr = null;
        state.sock = null;

        if (loggedOut) {
          console.log("[WA] Sessão deslogada pelo celular. Limpando credenciais.");
          state.phone = null;
          state.error = null;
          reconnectAttempts = 0;
          fs.rm(AUTH_DIR, { recursive: true, force: true }, () => {});
        } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`[WA] Conexão caiu (status ${statusCode}). Tentando reconectar (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          startSock().catch((e) => {
            console.error("[WA] Erro ao reconectar:", e);
            state.error = e.message;
            state.status = "disconnected";
          });
        } else {
          console.error("[WA] Limite de tentativas de reconexão atingido.");
          state.error = `Falha ao conectar (status ${statusCode}). Tente gerar o QR novamente.`;
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
  } catch (e) {
    console.error("[WA] Erro fatal ao iniciar sessão:", e);
    state.status = "disconnected";
    state.error = e.message;
    state.sock = null;
  }
}

// ─── ROTAS ──────────────────────────────────────────────────────────────────

router.post("/connect", async (req, res) => {
  try {
    if (state.status === "connected") {
      return res.json({ status: "connected", phone: state.phone });
    }
    reconnectAttempts = 0;
    startSock().catch((e) => {
      console.error("[WA] Erro ao iniciar sessão WA:", e);
      state.error = e.message;
      state.status = "disconnected";
    });
    res.json({ status: "connecting" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/status", (req, res) => {
  res.json({
    status: state.status,
    qr: state.qr,
    phone: state.phone,
    error: state.error,
  });
});

router.post("/disconnect", async (req, res) => {
  try {
    if (state.sock) {
      await state.sock.logout().catch(() => {});
    }
    state.sock = null;
    state.status = "disconnected";
    state.qr = null;
    state.phone = null;
    state.error = null;
    reconnectAttempts = 0;
    fs.rm(AUTH_DIR, { recursive: true, force: true }, () => {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/messages", (req, res) => {
  res.json(state.messages);
});

export default router;
