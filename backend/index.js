// index.js — Entry point do iSolar Backend
// Railway e outros hosts procuram este arquivo por padrão.
// Toda a lógica está em src/server.js; aqui apenas inicializamos.

// ─── POLYFILL: Web Crypto API global ──────────────────────────────────────
// O Baileys depende de `globalThis.crypto` (Web Crypto API), disponível
// nativamente apenas a partir do Node.js 20. Em Node 18 (versão atual no
// Railway) isso não existe por padrão, causando "ReferenceError: crypto is
// not defined" durante a validação da conexão com o WhatsApp — bem na hora
// em que o QR seria gerado. Esse polyfill resolve sem precisar trocar a
// versão do Node imediatamente.
import { webcrypto } from "crypto";
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

import './src/server.js';
