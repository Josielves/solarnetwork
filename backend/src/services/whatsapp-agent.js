// ═══════════════════════════════════════════════════════════════════════════
// src/services/whatsapp-agent.js
// Agente WhatsApp — interpreta mensagens recebidas e executa ações no CRM
// ═══════════════════════════════════════════════════════════════════════════

import { sb } from './supabase.js';

// ─── Comandos reconhecidos (regex + intent) ──────────────────────────────────
const INTENTS = [
  // LEADS
  { intent: 'lead_list',    pattern: /\b(listar?|ver?|mostrar?)\s+(leads?|clientes?|pipeline)\b/i },
  { intent: 'lead_create',  pattern: /\b(novo|criar?|adicionar?|cadastrar?)\s+lead\b/i },
  { intent: 'lead_move',    pattern: /\b(mover?|avan[çc]ar?|mudar?)\s+lead\b/i },
  { intent: 'lead_delete',  pattern: /\b(excluir?|deletar?|remover?)\s+lead\b/i },
  { intent: 'lead_search',  pattern: /\bbusc[ae]r?\s+lead\b|\blead\s+.{2,30}\?/i },

  // PIPELINE / RELATÓRIOS
  { intent: 'pipeline_summary', pattern: /\b(resumo|relat[oó]rio|status)\s+(do\s+)?(pipeline|crm|vendas)\b/i },
  { intent: 'dashboard',        pattern: /\b(dashboard|kpis?|m[eé]tricas?|indicadores?)\b/i },

  // KITS / MARKETPLACE
  { intent: 'kit_list',    pattern: /\b(listar?|ver?|mostrar?)\s+kits?\b/i },
  { intent: 'kit_create',  pattern: /\b(novo|criar?|publicar?|cadastrar?)\s+kit\b/i },

  // ATIVIDADES
  { intent: 'activity_list', pattern: /\b(atividades?|hist[oó]rico|timeline)\b/i },

  // AJUDA
  { intent: 'help', pattern: /\b(ajuda|help|comandos?|o que (você|vc) (faz|pode))\b/i },
];

// ─── Detecta intenção da mensagem ────────────────────────────────────────────
function detectIntent(text) {
  for (const { intent, pattern } of INTENTS) {
    if (pattern.test(text)) return intent;
  }
  return 'unknown';
}

// ─── Extrai campos de criação de lead via texto livre ────────────────────────
// Formato esperado: "novo lead NomeTeste, Campinas, SP, 18kWp, Comercial"
function parseLeadFromText(text) {
  // Remove a parte do comando
  const body = text.replace(/\b(novo|criar?|adicionar?|cadastrar?)\s+lead[:\s]*/i, '').trim();
  const parts = body.split(/[,;|]/).map(s => s.trim()).filter(Boolean);

  const kWpMatch = body.match(/(\d+(?:[.,]\d+)?)\s*k[Ww]p/i);
  const stateMatch = body.match(/\b([A-Z]{2})\b/);

  return {
    name:   parts[0] || null,
    city:   parts[1] || null,
    state:  stateMatch?.[1] || parts[2]?.toUpperCase() || null,
    power:  kWpMatch ? parseFloat(kWpMatch[1].replace(',', '.')) : (parseFloat(parts[3]) || null),
    type:   /rural/i.test(body) ? 'Rural' : /indust/i.test(body) ? 'Industrial' : /sa[úu]de/i.test(body) ? 'Saúde' : /resid/i.test(body) ? 'Residencial' : 'Comercial',
    note:   parts[4] || '',
    stage:  'Novo',
  };
}

// ─── Extrai campos de kit ────────────────────────────────────────────────────
// Formato: "novo kit Kit 6kWp Residencial, VoltSul, Curitiba, PR, 52400"
function parseKitFromText(text) {
  const body = text.replace(/\b(novo|criar?|publicar?|cadastrar?)\s+kit[:\s]*/i, '').trim();
  const parts = body.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  const stateMatch = body.match(/\b([A-Z]{2})\b/);
  const priceMatch = body.match(/R?\$?\s*(\d[\d.,]+)/);

  return {
    title:       parts[0] || null,
    distributor: parts[1] || null,
    city:        parts[2] || null,
    state:       stateMatch?.[1] || parts[3]?.toUpperCase() || null,
    price:       priceMatch ? parseFloat(priceMatch[1].replace(/\./g,'').replace(',','.')) : null,
    stock:       10,
    items:       [],
  };
}

// ─── Formata lista de leads para WhatsApp ────────────────────────────────────
function formatLeadList(leads, limit = 10) {
  if (!leads.length) return '📭 Nenhum lead encontrado.';
  const lines = leads.slice(0, limit).map((l, i) =>
    `*${i + 1}. ${l.name}*\n` +
    `   📍 ${l.city}/${l.state} · ⚡ ${l.power} kWp · 🏷️ ${l.stage}\n` +
    (l.value_brl ? `   💰 ${fmtBrl(l.value_brl)}\n` : '')
  );
  const extra = leads.length > limit ? `\n_...e mais ${leads.length - limit} leads._` : '';
  return `📋 *${leads.length} lead(s) no CRM:*\n\n` + lines.join('\n') + extra;
}

function fmtBrl(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
}

// ─── Handler principal do agente ─────────────────────────────────────────────
/**
 * Processa uma mensagem recebida pelo WhatsApp e retorna texto de resposta.
 * @param {string}  fromJid    - JID do remetente (ex: "5511999999999@s.whatsapp.net")
 * @param {string}  body       - Texto da mensagem
 * @param {string}  tenantId   - UUID do tenant dono da conta WhatsApp
 * @returns {Promise<string>}  - Texto de resposta
 */
export async function handleAgentMessage(fromJid, body, tenantId) {
  const text   = (body || '').trim();
  const intent = detectIntent(text);

  console.log(`[WA-Agent] intent="${intent}" tenant="${tenantId}" from="${fromJid}" msg="${text.slice(0, 80)}"`);

  // ── Roteador de intenções ──────────────────────────────────────────────────
  switch (intent) {

    // ── HELP ────────────────────────────────────────────────────────────────
    case 'help':
      return (
        '☀️ *iSolar CRM Agent*\n\n' +
        'Comandos disponíveis:\n\n' +
        '📋 *Leads*\n' +
        '• `listar leads` — lista todos os leads\n' +
        '• `novo lead Nome, Cidade, UF, kWp` — cria lead\n' +
        '• `buscar lead <nome>` — pesquisa leads\n' +
        '• `mover lead <nome> para <etapa>` — avança etapa\n\n' +
        '📦 *Kits*\n' +
        '• `listar kits` — lista kits do marketplace\n' +
        '• `novo kit Nome, Distribuidor, Cidade, UF, Preço`\n\n' +
        '📊 *Relatórios*\n' +
        '• `resumo do pipeline` — visão geral\n' +
        '• `dashboard` — KPIs principais\n' +
        '• `atividades` — histórico recente\n\n' +
        '_Dica: use vírgulas para separar os campos!_'
      );

    // ── LEADS — LISTAR ───────────────────────────────────────────────────────
    case 'lead_list': {
      const { data: leads, error } = await sb
        .from('leads')
        .select('id, name, city, state, power, stage, value_brl, type')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) return `❌ Erro ao buscar leads: ${error.message}`;
      return formatLeadList(leads || []);
    }

    // ── LEADS — BUSCAR ───────────────────────────────────────────────────────
    case 'lead_search': {
      const term = text.replace(/\bbusc[ae]r?\s+lead\b[:\s]*/i, '').replace(/\?/g, '').trim();
      if (!term) return '❓ Informe o nome para buscar. Ex: `buscar lead João`';

      const { data: leads, error } = await sb
        .from('leads')
        .select('id, name, city, state, power, stage, value_brl')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${term}%`)
        .limit(10);

      if (error) return `❌ Erro: ${error.message}`;
      return formatLeadList(leads || []);
    }

    // ── LEADS — CRIAR ────────────────────────────────────────────────────────
    case 'lead_create': {
      const fields = parseLeadFromText(text);

      if (!fields.name || !fields.city || !fields.state || !fields.power) {
        return (
          '⚠️ Dados incompletos. Formato:\n' +
          '`novo lead Nome, Cidade, UF, kWp`\n\n' +
          'Exemplo:\n`novo lead Supermercado Aurora, Campinas, SP, 18kWp`'
        );
      }

      const { data: lead, error } = await sb
        .from('leads')
        .insert({ ...fields, tenant_id: tenantId })
        .select()
        .single();

      if (error) return `❌ Erro ao criar lead: ${error.message}`;

      // Registra atividade
      await sb.from('activities').insert({
        tenant_id: tenantId,
        type:      'lead',
        title:     'Lead criado via WhatsApp',
        detail:    `${lead.name} — ${lead.city}/${lead.state} — ${lead.power} kWp`,
      }).catch(() => {});

      return (
        `✅ *Lead criado com sucesso!*\n\n` +
        `👤 *${lead.name}*\n` +
        `📍 ${lead.city}/${lead.state}\n` +
        `⚡ ${lead.power} kWp · ${lead.type}\n` +
        `🏷️ Etapa: ${lead.stage}\n` +
        `🆔 ID: \`${lead.id}\``
      );
    }

    // ── LEADS — MOVER ETAPA ──────────────────────────────────────────────────
    case 'lead_move': {
      const STAGES = ['Novo', 'Contato', 'Proposta', 'Negociação', 'Fechado', 'Perdido'];
      // Extrai nome e etapa destino: "mover lead João para Proposta"
      const mvMatch = text.match(/mover?\s+lead\s+(.+?)\s+para\s+(\w+)/i);
      if (!mvMatch) {
        return (
          '⚠️ Formato: `mover lead <nome> para <etapa>`\n' +
          'Etapas: Novo, Contato, Proposta, Negociação, Fechado, Perdido'
        );
      }
      const [, nameTerm, stageRaw] = mvMatch;
      const targetStage = STAGES.find(s => s.toLowerCase().startsWith(stageRaw.toLowerCase()));
      if (!targetStage) return `❌ Etapa inválida: "${stageRaw}". Use: ${STAGES.join(', ')}`;

      const { data: found } = await sb
        .from('leads')
        .select('id, name, stage')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${nameTerm.trim()}%`)
        .limit(1)
        .single();

      if (!found) return `❌ Lead "${nameTerm.trim()}" não encontrado.`;

      const { error } = await sb
        .from('leads')
        .update({ stage: targetStage })
        .eq('id', found.id);

      if (error) return `❌ Erro ao mover lead: ${error.message}`;

      await sb.from('activities').insert({
        tenant_id: tenantId,
        type:      'pipeline',
        title:     'Lead movido via WhatsApp',
        detail:    `${found.name}: ${found.stage} → ${targetStage}`,
      }).catch(() => {});

      return `✅ *${found.name}* movido para *${targetStage}*! 🎯`;
    }

    // ── LEADS — EXCLUIR ──────────────────────────────────────────────────────
    case 'lead_delete': {
      const delTerm = text.replace(/\b(excluir?|deletar?|remover?)\s+lead\b[:\s]*/i, '').trim();
      if (!delTerm) return '❓ Informe o nome do lead para excluir. Ex: `excluir lead João`';

      const { data: found } = await sb
        .from('leads')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${delTerm}%`)
        .limit(1)
        .single();

      if (!found) return `❌ Lead "${delTerm}" não encontrado.`;

      const { error } = await sb.from('leads').delete().eq('id', found.id);
      if (error) return `❌ Erro ao excluir: ${error.message}`;

      return `🗑️ Lead *${found.name}* excluído.`;
    }

    // ── PIPELINE SUMMARY ─────────────────────────────────────────────────────
    case 'pipeline_summary': {
      const { data: leads } = await sb
        .from('leads')
        .select('stage, power, value_brl')
        .eq('tenant_id', tenantId);

      if (!leads?.length) return '📭 Nenhum lead no pipeline.';

      const STAGES = ['Novo', 'Contato', 'Proposta', 'Negociação', 'Fechado', 'Perdido'];
      const totalKwp  = leads.reduce((s, l) => s + Number(l.power || 0), 0);
      const totalVal  = leads.reduce((s, l) => s + Number(l.value_brl || 0), 0);
      const closed    = leads.filter(l => l.stage === 'Fechado').length;
      const conv      = Math.round(closed / leads.length * 100);

      const stageLines = STAGES.map(s => {
        const n = leads.filter(l => l.stage === s).length;
        const bar = '▓'.repeat(Math.round(n / leads.length * 10)) || '░';
        return n ? `${bar} *${s}*: ${n}` : null;
      }).filter(Boolean).join('\n');

      return (
        `📊 *Resumo do Pipeline*\n\n` +
        `📋 Total de leads: *${leads.length}*\n` +
        `⚡ Total kWp: *${totalKwp.toFixed(1)} kWp*\n` +
        `💰 Valor estimado: *${fmtBrl(totalVal)}*\n` +
        `✅ Taxa de conversão: *${conv}%*\n\n` +
        `*Distribuição por etapa:*\n${stageLines}`
      );
    }

    // ── DASHBOARD / KPIs ─────────────────────────────────────────────────────
    case 'dashboard': {
      const [{ data: leads }, { data: kits }, { data: tenant }] = await Promise.all([
        sb.from('leads').select('stage, power, value_brl').eq('tenant_id', tenantId),
        sb.from('kits').select('id').eq('tenant_id', tenantId),
        sb.from('tenants').select('name, plan, rating').eq('id', tenantId).single(),
      ]);

      const totalLeads = leads?.length || 0;
      const totalKwp   = (leads || []).reduce((s, l) => s + Number(l.power || 0), 0);
      const closed     = (leads || []).filter(l => l.stage === 'Fechado').length;
      const conv       = totalLeads ? Math.round(closed / totalLeads * 100) : 0;

      return (
        `☀️ *Dashboard iSolar — ${tenant?.data?.name || 'Sua empresa'}*\n\n` +
        `👥 Leads ativos: *${totalLeads}*\n` +
        `⚡ kWp em pipeline: *${totalKwp.toFixed(1)} kWp*\n` +
        `✅ Taxa de conversão: *${conv}%*\n` +
        `📦 Kits publicados: *${kits?.length || 0}*\n` +
        `⭐ Rating: *${Number(tenant?.data?.rating || 0).toFixed(1)}/5*\n` +
        `💳 Plano: *${(tenant?.data?.plan || 'free').toUpperCase()}*`
      );
    }

    // ── KITS — LISTAR ────────────────────────────────────────────────────────
    case 'kit_list': {
      const { data: kits, error } = await sb
        .from('kits')
        .select('title, distributor, city, state, price, stock')
        .eq('tenant_id', tenantId)
        .limit(10);

      if (error) return `❌ Erro: ${error.message}`;
      if (!kits?.length) return '📭 Nenhum kit publicado.';

      const lines = kits.map((k, i) =>
        `*${i + 1}. ${k.title}*\n` +
        `   🏢 ${k.distributor} · 📍 ${k.city}/${k.state}\n` +
        `   💰 ${fmtBrl(k.price)} · 📦 Estoque: ${k.stock}`
      );
      return `📦 *${kits.length} kit(s):*\n\n` + lines.join('\n\n');
    }

    // ── KITS — CRIAR ─────────────────────────────────────────────────────────
    case 'kit_create': {
      const fields = parseKitFromText(text);

      if (!fields.title || !fields.distributor || !fields.city || !fields.state || !fields.price) {
        return (
          '⚠️ Formato: `novo kit Nome, Distribuidor, Cidade, UF, Preço`\n\n' +
          'Exemplo:\n`novo kit Kit 6kWp, VoltSul, Curitiba, PR, 52400`'
        );
      }

      const { data: kit, error } = await sb
        .from('kits')
        .insert({ ...fields, tenant_id: tenantId })
        .select()
        .single();

      if (error) return `❌ Erro ao publicar kit: ${error.message}`;
      return (
        `✅ *Kit publicado!*\n\n` +
        `📦 *${kit.title}*\n` +
        `🏢 ${kit.distributor} · 📍 ${kit.city}/${kit.state}\n` +
        `💰 ${fmtBrl(kit.price)} · Estoque: ${kit.stock}`
      );
    }

    // ── ATIVIDADES ───────────────────────────────────────────────────────────
    case 'activity_list': {
      const { data: acts, error } = await sb
        .from('activities')
        .select('type, title, detail, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) return `❌ Erro: ${error.message}`;
      if (!acts?.length) return '📭 Nenhuma atividade recente.';

      const typeEmoji = { lead: '👤', pipeline: '🔄', kit: '📦', info: 'ℹ️' };
      const lines = acts.map(a => {
        const emoji = typeEmoji[a.type] || '•';
        const when  = new Date(a.created_at).toLocaleDateString('pt-BR');
        return `${emoji} *${a.title}*\n   ${a.detail || ''} · _${when}_`;
      });
      return `📜 *Atividades recentes:*\n\n` + lines.join('\n\n');
    }

    // ── DESCONHECIDO ─────────────────────────────────────────────────────────
    default:
      return (
        '🤖 Não entendi. Digite *ajuda* para ver os comandos disponíveis.\n\n' +
        '_Dica: tente "listar leads", "resumo do pipeline" ou "dashboard"_'
      );
  }
}
