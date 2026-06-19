// ═══════════════════════════════════════════════════════════════════════════
// PATCH para src/services/whatsapp.js
// Adicione estas modificações ao seu serviço Baileys existente
// ═══════════════════════════════════════════════════════════════════════════

// 1. Altere a assinatura da função `connect` para aceitar um callback:
//
//    ANTES:
//      export async function connect(tenantId) { ... }
//
//    DEPOIS:
//      export async function connect(tenantId, onMessage = null) { ... }

// 2. Dentro do handler de eventos do Baileys, na seção 'messages.upsert',
//    chame o callback com a mensagem recebida:
//
//    Encontre o trecho similar a:
//      sock.ev.on('messages.upsert', async ({ messages }) => { ... })
//
//    E adicione ANTES de salvar no banco:

/*
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    if (msg.key.fromMe) continue;                          // ignora mensagens próprias
    const fromJid = msg.key.remoteJid;
    const body    =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    // ── Salva no banco (lógica já existente) ──
    // await sb.from('wa_messages').insert({ ... });

    // ── Chama o agente CRM ──
    if (body && onMessage) {
      try {
        await onMessage(fromJid, body);
      } catch (agentErr) {
        console.error('[WA] Erro no agente:', agentErr.message);
      }
    }
  }
});
*/

// 3. Certifique-se de que `getSession` retorna o objeto com `sock` exposto:
//
//    sessions.set(tenantId, { status, qr, phone, sock });
//
//    Se hoje você guarda apenas { status, qr, phone }, adicione `sock`:
//
//    sessions.set(tenantId, { status: 'connecting', qr: null, phone: null, sock });

// ─── Nenhuma outra alteração necessária — o agente é chamado pela rota. ──────
