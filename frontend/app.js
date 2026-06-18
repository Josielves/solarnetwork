// ═══════════════════════════════════════════════════════════════════════════
// iSolar v3 — app.js  (frontend completo)
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://xvzqsusaaccjeewfsnev.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2enFzdXNhYWNjamVld2ZzbmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzNTA4NiwiZXhwIjoyMDk2NTExMDg2fQ.oycjFk28DgIsUezX0g8jkO6Ul4N84lSM9cY8FLoNoxY"; // ← sua anon key
const BACKEND_URL       = "https://solarnetwork-production.up.railway.app";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentTenant = null;
let authToken     = null;
let appData = { leads: [], kits: [], activities: [], tenants: [], messages: [] };
let chartInstance = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const qs  = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

// ═══════════════════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════════════════
async function api(path, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
      ...opts.headers,
    },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════
function toast(msg, type = "success") {
  const el = qs("#toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}
function fmtBrl(v) {
  if (!v && v !== 0) return "–";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}
function stars(v) {
  const n = Math.round(Number(v) || 0);
  return "★".repeat(n) + "☆".repeat(5 - n);
}
function powerBucket(p) {
  return p <= 10 ? "baixo" : p <= 50 ? "medio" : "alto";
}
function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function switchView(viewId) {
  qsa(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  qsa(".bottom-nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  qsa(".view").forEach(v => v.classList.toggle("active", v.id === "view" + cap(viewId)));
  qs("#pageTitle").textContent = {
    dashboard: "Dashboard", pipeline: "Pipeline", network: "Network",
    marketplace: "Marketplace", chat: "Chat", whatsapp: "WhatsApp",
    subscription: "Assinatura", admin: "Administração"
  }[viewId] || viewId;
  // Auto-close mobile sidebar on view change
  const sb = document.querySelector("#sidebar");
  const ov = document.querySelector("#sidebarOverlay");
  if (sb && sb.classList.contains("mobile-open")) {
    sb.classList.remove("mobile-open");
    if (ov) ov.classList.remove("active");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session);
  else showAuth();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session)  await onLogin(session);
    if (event === "SIGNED_OUT")             showAuth();
  });
}

function showAuth() {
  qs("#authScreen").classList.remove("hidden");
  qs("#appShell").classList.add("hidden");
}

async function onLogin(session) {
  currentUser = session.user;
  authToken   = session.access_token;
  qs("#authScreen").classList.add("hidden");
  qs("#appShell").classList.remove("hidden");
  showLoading(true);
  await loadProfile();
  await loadAllData();
  renderUI();
  lucide.createIcons();
  showLoading(false);
}

// loadTenant replaced by loadProfile (see ADMIN section below)

// ─── Login ────────────────────────────────────────────────────────────────────
qs("#btnLogin").addEventListener("click", async () => {
  const email = qs("#loginEmail").value.trim();
  const pass  = qs("#loginPassword").value;
  if (!email || !pass) return;
  setLoading("#btnLogin", "Entrando…");
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  resetBtn("#btnLogin", "<span>Entrar na plataforma</span>");
  if (error) showAuthError("loginError", error.message);
});

// ─── Demo ─────────────────────────────────────────────────────────────────────
qs("#btnLoginDemo").addEventListener("click", async () => {
  setLoading("#btnLoginDemo", "Carregando demo…");
  const { error } = await sb.auth.signInWithPassword({ email: "demo@isolar.com", password: "demo123456" });
  if (error) {
    await sb.auth.signUp({ email: "demo@isolar.com", password: "demo123456",
      options: { data: { name: "Demo", tenant_id: "00000000-0000-0000-0000-000000000001" } } });
    await sb.auth.signInWithPassword({ email: "demo@isolar.com", password: "demo123456" });
  }
  resetBtn("#btnLoginDemo", "Acessar demo sem cadastro");
});

// ─── Signup ───────────────────────────────────────────────────────────────────
qs("#btnSignup").addEventListener("click", async () => {
  const company  = qs("#signupCompany").value.trim();
  const name     = qs("#signupName").value.trim();
  const email    = qs("#signupEmail").value.trim();
  const pass     = qs("#signupPassword").value;
  const role     = qs("#signupRole").value;
  if (!company || !name || !email || !pass) {
    return showAuthError("signupError", "Preencha todos os campos.");
  }
  setLoading("#btnSignup", "Criando conta…");

  const { data: tenant, error: tErr } = await sb.from("tenants").insert({
    name: company, slug: slugify(company), role,
    initials: company.slice(0, 2).toUpperCase(), plan: "free"
  }).select().single();

  if (tErr) { resetBtn("#btnSignup", "Criar conta grátis"); return showAuthError("signupError", tErr.message); }

  const { error: uErr } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name, tenant_id: tenant.id } },
  });
  resetBtn("#btnSignup", "Criar conta grátis");
  if (uErr) showAuthError("signupError", uErr.message);
  else toast("Conta criada! Verifique seu e-mail.");
});

// ─── Logout ───────────────────────────────────────────────────────────────────
qs("#btnLogout").addEventListener("click", () => sb.auth.signOut());

// ─── Auth tabs ────────────────────────────────────────────────────────────────
qsa(".auth-tab").forEach(btn => btn.addEventListener("click", () => {
  const tab = btn.dataset.tab;
  qsa(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  qsa(".auth-form").forEach(f => f.classList.toggle("active", f.id === "tab" + cap(tab)));
}));

function showAuthError(id, msg) {
  const el = qs(`#${id}`);
  el.textContent = msg;
  el.classList.remove("hidden");
}
function setLoading(sel, txt) { qs(sel).textContent = txt; qs(sel).disabled = true; }
function resetBtn(sel, html)  { qs(sel).innerHTML = html; qs(sel).disabled = false; }

// ═══════════════════════════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════════════════════════
function showLoading(on) {
  let el = qs("#loadingBar");
  if (!el) {
    el = document.createElement("div");
    el.id = "loadingBar";
    el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;height:3px;" +
      "background:linear-gradient(90deg,#16a34a,#f5a623);transition:opacity .3s";
    document.body.prepend(el);
  }
  el.style.opacity = on ? "1" : "0";
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════
async function loadAllData() {
  try {
    const [leads, kits, activities, tenants] = await Promise.all([
      api("/api/leads"),
      api("/api/kits"),
      api("/api/activities"),
      api("/api/tenants"),
    ]);
    appData.leads      = leads      || [];
    appData.kits       = kits       || [];
    appData.activities = activities || [];
    appData.tenants    = tenants    || [];
  } catch (err) {
    console.error("Erro ao carregar dados:", err.message);
    toast("Erro ao carregar dados: " + err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════════════════════════════
function renderUI() {
  renderDashboard();
  renderKanban();
  renderNetwork();
  renderMarketplace();
  renderAdmin();
  renderSubscription();
  renderDistributorKitPanel();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const { leads, kits, activities } = appData;
  const totalKwp = leads.reduce((s, l) => s + Number(l.power || 0), 0);
  const closed   = leads.filter(l => l.stage === "Fechado").length;
  const conv     = leads.length ? Math.round(closed / leads.length * 100) : 0;

  qs("#kpiLeads").textContent    = leads.length;
  qs("#kpiKwp").textContent      = totalKwp.toFixed(0) + " kWp";
  qs("#kpiConv").textContent     = conv + "%";
  qs("#kpiMrr").textContent      = currentTenant?.plan === "pro" ? "R$ 297" : "R$ 0";
  qs("#kpiLeadsDelta").textContent = leads.length + " no pipeline";
  qs("#kpiKwpDelta").textContent   = "em " + leads.length + " projetos";
  qs("#kpiMrrDelta").textContent   = "+14% este mês";

  // Funnel
  const stages = ["Novo","Contato","Proposta","Negociação","Fechado"];
  const maxN = Math.max(...stages.map(s => leads.filter(l => l.stage === s).length), 1);
  qs("#funnelList").innerHTML = stages.map(stage => {
    const n = leads.filter(l => l.stage === stage).length;
    return `<div class="funnel-row">
      <div style="flex:1">
        <div class="funnel-label">${stage}</div>
        <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${(n/maxN)*100}%"></div></div>
      </div>
      <div class="funnel-count">${n}</div>
    </div>`;
  }).join("");

  // Activity feed
  qs("#activityFeed").innerHTML = activities.slice(0, 8).map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.type || 'info'}"></div>
      <div class="activity-text">
        <strong>${a.title}</strong>
        <span>${a.detail || ""}</span>
      </div>
    </div>`).join("") || `<p style="color:var(--muted);padding:12px;font-size:13px">Nenhuma atividade.</p>`;

  // Top kits
  qs("#topKits").innerHTML = kits.slice(0, 4).map(k => `
    <div class="kit-row">
      <div>
        <div class="kit-row-name">${k.title}</div>
        <div style="font-size:11px;color:var(--muted)">${k.distributor}</div>
      </div>
      <div class="kit-row-price">${k.price || fmtBrl(k.price_cents/100)}</div>
    </div>`).join("");

  // Chart
  const ctx = qs("#chartLeads");
  if (chartInstance) chartInstance.destroy();
  const dark = document.documentElement.dataset.theme === "dark";
  const gc   = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const tc   = dark ? "#6e7f95" : "#7a8fa6";
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun"];
  const base = Math.max(1, Math.floor(leads.length / 6));
  const ld = months.map(() => base + Math.floor(Math.random() * base * 2));
  ld[5] = leads.length;

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Leads", data: ld, backgroundColor: "rgba(22,163,74,.15)", borderColor: "#16a34a", borderWidth: 2, borderRadius: 6 },
        { label: "Fechados", data: ld.map(v => Math.round(v * conv / 100)), backgroundColor: "rgba(245,166,35,.2)", borderColor: "#f5a623", borderWidth: 2, borderRadius: 6 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: tc, font: { size: 12 } } } },
      scales: { x: { grid: { color: gc }, ticks: { color: tc } }, y: { grid: { color: gc }, ticks: { color: tc } } },
    },
  });
}

// ─── KANBAN ───────────────────────────────────────────────────────────────────
function renderKanban() {
  const stages  = ["Novo","Contato","Proposta","Negociação","Fechado","Perdido"];
  const stateF  = qs("#pipelineStateFilter")?.value || "";
  const powerF  = qs("#pipelinePowerFilter")?.value || "";
  const search  = (qs("#globalSearch")?.value || "").toLowerCase();

  const filtered = appData.leads.filter(l => {
    // Usuários não-admin veem apenas leads atribuídos a eles
    if (!isAdmin() && l.assigned_to && l.assigned_to !== currentUser?.id) return false;
    const blob = `${l.name} ${l.city} ${l.state} ${l.type} ${l.note || ""}`.toLowerCase();
    return (!stateF || l.state === stateF) && (!powerF || powerBucket(l.power) === powerF) && (!search || blob.includes(search));
  });

  qs("#kanbanBoard").innerHTML = stages.map(stage => {
    const cards = filtered.filter(l => l.stage === stage);
    return `<div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${stage}</span>
        <span class="kanban-count">${cards.length}</span>
      </div>
      <div class="kanban-cards">
        ${cards.map(l => `
          <div class="lead-card" data-id="${l.id}">
            <div class="lead-card-title">${l.name}</div>
            <div class="lead-card-note">${l.note || ""}</div>
            ${l.assigned_to ? `<div class="lead-card-assigned"><i data-lucide="user" style="width:11px;height:11px"></i> ${l.assigned_name || "Atribuído"}</div>` : ""}
            <div class="lead-card-tags">
              <span class="tag">${l.city}/${l.state}</span>
              <span class="tag yellow">${l.power} kWp</span>
              <span class="tag">${l.type}</span>
            </div>
            <div class="lead-card-footer">
              <span class="lead-card-value">${l.value_brl ? fmtBrl(l.value_brl) : "–"}</span>
              <div style="display:flex;gap:4px">
                <button class="icon-btn" onclick="moveStage('${l.id}','${stage}',1)" title="Avançar">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
                <button class="icon-btn" onclick="deleteLead('${l.id}')" title="Excluir">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
          </div>`).join("") || `<div class="kanban-empty">Nenhum lead</div>`}
      </div>
    </div>`;
  }).join("");

  // Populate state filter once
  const sf = qs("#pipelineStateFilter");
  if (sf && sf.options.length <= 1) {
    [...new Set(appData.leads.map(l => l.state))].sort().forEach(s => sf.add(new Option(s,s)));
  }
}

window.moveStage = async (leadId, currentStage, dir) => {
  const stages = ["Novo","Contato","Proposta","Negociação","Fechado","Perdido"];
  const idx = stages.indexOf(currentStage);
  const next = stages[Math.min(Math.max(idx + dir, 0), stages.length - 1)];
  if (next === currentStage) return;
  try {
    await api(`/api/leads/${leadId}`, { method: "PATCH", body: { stage: next } });
    const lead = appData.leads.find(l => l.id === leadId);
    if (lead) lead.stage = next;
    renderKanban(); renderDashboard();
    toast(`Lead movido para "${next}"`);
  } catch (e) { toast(e.message, "error"); }
};

window.deleteLead = async (leadId) => {
  if (!confirm("Excluir este lead?")) return;
  try {
    await api(`/api/leads/${leadId}`, { method: "DELETE" });
    appData.leads = appData.leads.filter(l => l.id !== leadId);
    renderKanban(); renderDashboard();
    toast("Lead excluído.");
  } catch (e) { toast(e.message, "error"); }
};

// ─── NETWORK ──────────────────────────────────────────────────────────────────
function renderNetwork() {
  const roleF  = qs("#networkRoleFilter")?.value  || "";
  const stateF = qs("#networkStateFilter")?.value || "";
  const search = (qs("#globalSearch")?.value || "").toLowerCase();

  const list = appData.tenants.filter(t => {
    const blob = `${t.name} ${t.role} ${t.city||""} ${t.state||""} ${t.comment||""}`.toLowerCase();
    return (!roleF || t.role === roleF) && (!stateF || t.state === stateF) && (!search || blob.includes(search));
  });

  const grid = qs("#profileGrid");
  grid.innerHTML = list.map(t => {
    const loc   = [t.city, t.state].filter(Boolean).join("/");
    const score = calcMatch(currentTenant, t);
    const matchChip = (score !== null && t.id !== currentTenant?.id)
      ? `<span class="profile-match-chip"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>${score}% match</span>`
      : "";
    return `
    <article class="profile-card profile-card--clickable" data-tenant-id="${t.id}" title="Ver perfil de ${esc(t.name)}">
      <div class="profile-top">
        <span class="avatar">${t.initials || "iS"}</span>
        <div>
          <div class="profile-name">${esc(t.name)}</div>
          <span class="tag">${esc(t.role)}</span>
        </div>
      </div>
      <div class="rating">
        <span class="stars">${stars(t.rating)}</span>
        <span class="rating-val">${Number(t.rating||0).toFixed(1)}</span>
        ${matchChip}
      </div>
      ${loc ? `<p style="font-size:12px;margin:4px 0;color:var(--muted);display:flex;align-items:center;gap:4px">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</p>` : ""}
      ${t.comment ? `<div class="comment-box">${esc(t.comment)}</div>` : ""}
      <div class="tag-row">${(t.permissions||[]).map(p=>`<span class="tag">${esc(p)}</span>`).join("")}</div>
      <div style="margin-top:auto;padding-top:8px;font-size:12px;color:var(--leaf);font-weight:600;display:flex;align-items:center;gap:4px">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Ver perfil completo
      </div>
    </article>`;
  }).join("") || `<p style="color:var(--muted)">Nenhuma empresa encontrada.</p>`;

  // Attach click handlers via JS (avoids inline JSON / escaping issues)
  grid.querySelectorAll(".profile-card--clickable").forEach(card => {
    card.addEventListener("click", () => {
      const tenant = appData.tenants.find(t => t.id === card.dataset.tenantId);
      if (tenant) openProfileModal(tenant);
    });
  });

  const rf  = qs("#networkRoleFilter");
  const sf2 = qs("#networkStateFilter");
  if (rf  && rf.options.length  <= 1) [...new Set(appData.tenants.map(t=>t.role).filter(Boolean))].sort().forEach(r=>rf.add(new Option(r,r)));
  if (sf2 && sf2.options.length <= 1) [...new Set(appData.tenants.map(t=>t.state).filter(Boolean))].sort().forEach(s=>sf2.add(new Option(s,s)));
}

// HTML-escape helper used in renderNetwork
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────
function renderMarketplace() {
  const search = (qs("#kitSearch")?.value || "").toLowerCase();
  const kits = appData.kits.filter(k =>
    `${k.title} ${k.distributor} ${k.city} ${k.state}`.toLowerCase().includes(search)
  );

  // Botão "Publicar kit" SOMENTE para role Distribuidor
  const publishBtn = qs("#publishKitBtn");
  if (publishBtn) {
    const isDistributor = currentTenant?.role?.toLowerCase() === "distribuidor";
    publishBtn.style.display = isDistributor ? "" : "none";
  }

  qs("#kitGrid").innerHTML = kits.map(k => {
    const isOwn = (k.tenant_id && k.tenant_id === currentTenant?.id)
      || (!k.tenant_id && k.distributor === currentTenant?.name);
    const ownBadge = isOwn ? `<span class="kit-own-badge">Seu kit</span>` : "";
    const kData = JSON.stringify(k).replace(/"/g, "&quot;");
    return `
    <article class="kit-card" onclick="openKitDetail(${kData})" style="cursor:pointer">
      <div class="kit-card-top">
        <div>
          <div class="kit-distributor">${k.distributor}</div>
          <div class="kit-title">${k.title}</div>
        </div>
        ${ownBadge}
      </div>
      <div class="kit-price">${k.price || fmtBrl(k.price_cents / 100)}</div>
      <div class="kit-meta"><i data-lucide="map-pin" style="width:11px;height:11px"></i> ${k.city}/${k.state}</div>
      <div class="kit-stock"><i data-lucide="package" style="width:11px;height:11px"></i> ${k.stock}</div>
      <div class="tag-row">${(k.items||[]).slice(0,3).map(i=>`<span class="tag">${i}</span>`).join("")}</div>
    </article>`;
  }).join("") || `<p style="color:var(--muted)">Nenhum kit encontrado.</p>`;

  lucide.createIcons();
}

// ─── MODAL DE DETALHE DO KIT ─────────────────────────────────────────────────
window.openKitDetail = (kit) => {
  const isOwn = (kit.tenant_id && kit.tenant_id === currentTenant?.id)
    || (!kit.tenant_id && kit.distributor === currentTenant?.name);
  const price = kit.price || fmtBrl((kit.price_cents || 0) / 100);

  // Tabela de preços (estrutura mock extensível via kit.pricing_tiers)
  const tiers = kit.pricing_tiers || [
    { label: "1 unidade",    price },
    { label: "5+ unidades",  price: "Consultar" },
    { label: "10+ unidades", price: "Consultar" },
  ];
  const tiersHtml = tiers.map(t => `
    <tr>
      <td>${t.label}</td>
      <td style="font-weight:700;color:var(--leaf)">${t.price}</td>
    </tr>`).join("");

  const itemsHtml = (kit.items||[]).map(i => `<li>${i}</li>`).join("");

  const actionHtml = isOwn
    ? `<div class="kit-own-msg"><i data-lucide="check-circle"></i> Este kit foi publicado por você</div>`
    : `<button class="btn-primary" id="kitDetailChatBtn" style="width:100%">
        <i data-lucide="message-circle"></i> Conversar com o distribuidor
       </button>`;

  qs("#kitDetailTitle").textContent       = kit.title;
  qs("#kitDetailDistributor").textContent = kit.distributor;
  qs("#kitDetailLocation").textContent    = `${kit.city}/${kit.state}`;
  qs("#kitDetailStock").textContent       = kit.stock || "—";
  qs("#kitDetailPricingBody").innerHTML   = tiersHtml;
  qs("#kitDetailItems").innerHTML         = itemsHtml || "<li>—</li>";
  qs("#kitDetailAction").innerHTML        = actionHtml;

  if (!isOwn) {
    qs("#kitDetailChatBtn")?.addEventListener("click", () => {
      qs("#kitDetailModal").close();
      openChatWithKit(kit);
    });
  }

  qs("#kitDetailModal").showModal();
  lucide.createIcons();
};

// Abre (ou cria) conversa com o distribuidor do kit e envia mensagem de interesse
window.openChatWithKit = async (kit) => {
  // Encontra o tenant distribuidor pelo tenant_id do kit ou pelo nome
  let distributorTenant = kit.tenant_id
    ? appData.tenants.find(t => t.id === kit.tenant_id)
    : appData.tenants.find(t => t.name === kit.distributor);

  if (!distributorTenant) {
    toast("Distribuidor não encontrado na rede.", "error");
    return;
  }

  if (distributorTenant.id === currentTenant?.id) {
    toast("Este kit é seu.", "error");
    return;
  }

  showLoading(true);

  try {
    // Verifica se já existe conversa
    const { data: existingRows } = await sb
      .from("chat_conversations")
      .select("id, last_message, last_at, tenant_a, tenant_b")
      .or(
        `and(tenant_a.eq.${currentTenant.id},tenant_b.eq.${distributorTenant.id}),` +
        `and(tenant_a.eq.${distributorTenant.id},tenant_b.eq.${currentTenant.id})`
      )
      .limit(1);

    let convId;

    if (existingRows?.length) {
      const raw = existingRows[0];
      const existing = {
        ...raw,
        tenant_a: raw.tenant_a === currentTenant.id ? currentTenant : distributorTenant,
        tenant_b: raw.tenant_b === currentTenant.id ? currentTenant : distributorTenant,
      };
      if (!conversations.find(c => c.id === existing.id)) conversations.unshift(existing);
      convId = existing.id;
    } else {
      // Cria nova conversa
      const { data, error } = await sb.from("chat_conversations").insert({
        tenant_a: currentTenant.id,
        tenant_b: distributorTenant.id,
        last_message: null,
      }).select("id, last_message, last_at, tenant_a, tenant_b").single();

      if (error) throw error;

      const newConv = { ...data, tenant_a: currentTenant, tenant_b: distributorTenant };
      conversations.unshift(newConv);
      convId = newConv.id;
    }

    // Navega para o chat e abre a conversa
    switchView("chat");
    await loadChat();
    await openConversation(convId);

    // Monta e envia mensagem de interesse automática
    const price = kit.price || fmtBrl((kit.price_cents || 0) / 100);
    const kitMsg = `Olá! Tenho interesse no kit *${kit.title}* (${price}) que vi no Marketplace. Poderia me passar mais detalhes sobre disponibilidade e condições de compra?`;

    const input = qs("#chatInput");
    if (input) {
      input.value = kitMsg;
      input.dispatchEvent(new Event("input")); // auto-resize
      input.focus();
    }

    toast(`Chat aberto com ${distributorTenant.name}`);
  } catch (e) {
    toast("Erro ao abrir chat: " + e.message, "error");
    console.error("openChatWithKit:", e);
  } finally {
    showLoading(false);
  }
};

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
async function loadWAStatus() {
  try {
    const { status, qr, phone } = await api("/api/whatsapp/status");
    updateWABadge(status, phone);
    if (qr) showQR(qr);
  } catch (e) { console.warn("WA status:", e.message); }
}

function updateWABadge(status, phone) {
  const badge = qs("#waBadge");
  if (status === "connected") {
    badge.className = "wa-badge connected";
    badge.innerHTML = `<i data-lucide="wifi"></i> Conectado${phone ? " · " + phone : ""}`;
    qs("#waConnectBtn").textContent = "Desconectar";
    qs("#waConnectBtn").onclick = disconnectWA;
  } else if (status === "connecting") {
    badge.className = "wa-badge disconnected";
    badge.innerHTML = `<i data-lucide="loader"></i> Aguardando QR…`;
    qs("#waConnectBtn").textContent = "Cancelar";
    qs("#waConnectBtn").onclick = disconnectWA;
  } else {
    badge.className = "wa-badge disconnected";
    badge.innerHTML = `<i data-lucide="wifi-off"></i> Desconectado`;
    qs("#waConnectBtn").innerHTML = `<i data-lucide="qr-code"></i> Gerar QR Code`;
    qs("#waConnectBtn").onclick = connectWA;
  }
  lucide.createIcons();
}

function showQR(qrDataUrl) {
  const container = qs("#waQRContainer");
  const img       = qs("#waQRImg");
  if (container && img) {
    img.src = qrDataUrl;
    container.style.display = "block";
  }
}

function hideQR() {
  const container = qs("#waQRContainer");
  if (container) container.style.display = "none";
}

let waPolling = null;

async function connectWA() {
  qs("#waConnectBtn").textContent = "Iniciando…";
  qs("#waConnectBtn").disabled = true;

  try {
    // Dispara conexão no backend (não aguarda — retorna rápido)
    fetch(`${BACKEND_URL}/api/whatsapp/connect`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      }
    }).catch(() => {}); // ignora erros do SSE

    // Polling a cada 3s para pegar QR e status
    updateWABadge("connecting");
    qs("#waConnectBtn").disabled = false;

    clearInterval(waPolling);
    waPolling = setInterval(async () => {
      try {
        const { status, qr, phone } = await api("/api/whatsapp/status");
        updateWABadge(status, phone);
        if (qr) showQR(qr);
        if (status === "connected") {
          clearInterval(waPolling);
          hideQR();
          toast("WhatsApp conectado!");
          loadWAMessages();
        }
        if (status === "disconnected") {
          clearInterval(waPolling);
        }
      } catch (e) { console.warn("WA poll:", e.message); }
    }, 3000);

    // Para de poller após 90s
    setTimeout(() => {
      clearInterval(waPolling);
      loadWAStatus();
    }, 90000);

  } catch (e) {
    toast("Erro ao conectar: " + e.message, "error");
    qs("#waConnectBtn").disabled = false;
  }
}

async function disconnectWA() {
  clearInterval(waPolling);
  if (!confirm("Desconectar WhatsApp?")) return;
  try {
    await api("/api/whatsapp/disconnect", { method: "POST" });
    updateWABadge("disconnected");
    hideQR();
    toast("WhatsApp desconectado.");
  } catch (e) { toast(e.message, "error"); }
}

async function loadWAMessages() {
  try {
    const msgs = await api("/api/whatsapp/messages");
    appData.messages = msgs || [];
    qs(".wa-messages").innerHTML = msgs.length
      ? msgs.map(m => `
          <div class="activity-item">
            <div class="activity-dot ${m.direction === "in" ? "lead" : "kit"}"></div>
            <div class="activity-text">
              <strong>${m.direction === "in" ? m.from_jid : "Você → " + m.to_jid}</strong>
              <span>${m.body || ""}</span>
            </div>
          </div>`).join("")
      : `<div class="wa-empty"><i data-lucide="message-circle"></i><p>Nenhuma mensagem ainda.</p></div>`;
    lucide.createIcons();
  } catch (e) { console.warn("WA messages:", e.message); }
}

// ─── SUBSCRIPTION ─────────────────────────────────────────────────────────────
async function renderSubscription() {
  try {
    const sub = await api("/api/stripe/subscription");
    const currentPlan = sub?.plan || currentTenant?.plan || "free";
    qsa(".plan-option").forEach(el => {
      const plan = el.dataset.plan;
      el.style.outline = plan === currentPlan ? "2px solid var(--leaf)" : "";
      const btn = el.querySelector("button");
      if (plan === currentPlan) {
        btn.textContent = "Plano atual";
        btn.className = "btn-ghost full";
        btn.onclick = () => managePortal();
      } else if (plan !== "free") {
        btn.textContent = "Assinar";
        btn.className = "btn-primary full";
        btn.onclick = () => subscribePlan(plan);
      }
    });
  } catch (e) { console.warn("Subscription:", e.message); }
}

async function subscribePlan(plan) {
  try {
    const { url } = await api("/api/stripe/checkout", { method: "POST", body: { plan } });
    window.location.href = url;
  } catch (e) { toast("Erro ao iniciar checkout: " + e.message, "error"); }
}

async function managePortal() {
  try {
    const { url } = await api("/api/stripe/portal", { method: "POST" });
    window.open(url, "_blank");
  } catch (e) { toast("Erro ao abrir portal: " + e.message, "error"); }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

// Verifica se o usuário atual é admin (campo is_admin no profile)
let currentProfile = null;

async function loadProfile() {
  const { data } = await sb.from("profiles")
    .select("*, tenants(*)")
    .eq("id", currentUser.id)
    .single();
  if (data) {
    currentProfile = data;
    currentTenant  = data.tenants;
    qs("#userName").textContent  = data.name || currentUser.email.split("@")[0];
    qs("#userAvatar").textContent = (data.name || "?")[0].toUpperCase();
    qs("#userPlan").textContent   = currentTenant?.plan || "Free";
  }
  applyAdminVisibility();
}

function isAdmin() {
  return currentProfile?.is_admin === true;
}

function applyAdminVisibility() {
  const adminNavItem = qs('[data-view="admin"]');
  if (adminNavItem) {
    adminNavItem.style.display = isAdmin() ? "" : "none";
  }
}

async function renderAdmin() {
  if (!isAdmin()) {
    toast("Acesso restrito a administradores.", "error");
    switchView("dashboard");
    return;
  }

  if (currentTenant) {
    qs("#settingName").value  = currentTenant.name  || "";
    qs("#settingCity").value  = currentTenant.city  || "";
    qs("#settingState").value = currentTenant.state || "";
    if (qs("#settingCnpj"))      qs("#settingCnpj").value      = currentTenant.cnpj      || "";
    if (qs("#settingRazao"))     qs("#settingRazao").value     = currentTenant.razao     || "";
    if (qs("#settingSite"))      qs("#settingSite").value      = currentTenant.site      || "";
    if (qs("#settingInstagram")) qs("#settingInstagram").value = currentTenant.instagram || "";
    if (qs("#settingLinkedin"))  qs("#settingLinkedin").value  = currentTenant.linkedin  || "";
    if (qs("#settingColabs"))    qs("#settingColabs").value    = currentTenant.colabs    || "";
    if (qs("#settingFounded"))   qs("#settingFounded").value   = currentTenant.founded   || "";
  }

  await loadAdminUsers();
}

async function loadAdminUsers() {
  const tableEl = qs("#userTable");
  tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Carregando usuários…</div>`;

  try {
    // Busca profiles + email via RPC get_all_users() (SECURITY DEFINER no Supabase)
    // Espera colunas: id, name, is_admin, tenant_id, tenant_name, email
    const { data: profiles, error } = await sb.rpc("get_all_users");

    if (error) throw error;

    tableEl.innerHTML = profiles.map(p => {
      const email = p.email || "–";
      const name  = p.name || email.split("@")[0];
      const role  = p.tenant_role || "";
      const admin = p.is_admin ? `<span class="tag" style="background:var(--leaf);color:#fff">admin</span>` : `<span class="tag">usuário</span>`;
      const roleBadge = role ? `<span class="tag" style="background:var(--accent,#f5a623);color:#fff">${role}</span>` : "";
      return `
        <div class="user-row" id="urow-${p.id}">
          <div class="user-row-info">
            <div class="user-avatar" style="width:36px;height:36px;font-size:13px;border-radius:10px;background:var(--leaf);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${(name[0]||"?").toUpperCase()}</div>
            <div>
              <div style="font-weight:600;font-size:14px">${name}</div>
              <div style="font-size:12px;color:var(--muted)">${email} · ${p.tenant_name || "–"}</div>
            </div>
            ${admin}${roleBadge}
          </div>
          <div class="user-row-actions">
            <button class="btn-ghost sm" onclick="openEditUserModal('${p.id}','${escapeHtml(name)}','${email}',${!!p.is_admin},'${escapeHtml(role)}')">
              <i data-lucide="pencil"></i> Editar
            </button>
            ${p.id !== currentUser.id ? `
            <button class="btn-ghost sm" style="color:var(--danger,#e53e3e)" onclick="confirmDeleteUser('${p.id}','${escapeHtml(name)}')">
              <i data-lucide="trash-2"></i>
            </button>` : ""}
          </div>
        </div>`;
    }).join("") || `<p style="color:var(--muted);font-size:13px;padding:12px">Nenhum usuário encontrado.</p>`;

    lucide.createIcons();
  } catch (e) {
    tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Erro ao carregar usuários: ${e.message}</div>`;
    console.error("loadAdminUsers:", e);
  }
}

// ─── Admin: alternador de abas ────────────────────────────────────────────────
window.switchAdminTab = (tab, btn) => {
  qsa(".admin-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  qsa(".admin-tab-panel").forEach(p => p.style.display = "none");
  qs(`#adminTab${tab.charAt(0).toUpperCase()+tab.slice(1)}`).style.display = "";
  if (tab === "leads") renderAdminLeads();
  if (tab === "kits")  renderAdminKits();
};

// ─── Admin: lista de todos os leads com atribuição ────────────────────────────
let adminAllUsers = []; // cache de usuários para o select

async function loadAdminLeadUsers() {
  if (adminAllUsers.length) return adminAllUsers;
  const { data } = await sb.rpc("get_all_users");
  adminAllUsers = data || [];
  return adminAllUsers;
}

window.renderAdminLeads = async () => {
  const tableEl = qs("#adminLeadTable");
  if (!tableEl) return;
  tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Carregando leads…</div>`;

  try {
    const users = await loadAdminLeadUsers();

    // Popular filtro de usuários
    const filterEl = qs("#adminLeadUserFilter");
    if (filterEl && filterEl.options.length <= 1) {
      users.forEach(u => {
        const name = u.name || u.email?.split("@")[0] || "?";
        filterEl.add(new Option(name, u.id));
      });
    }

    // Popular select do modal assignLeadUser
    const assignSel = qs("#assignLeadUser");
    if (assignSel && assignSel.options.length <= 1) {
      users.forEach(u => {
        const name = u.name || u.email?.split("@")[0] || "?";
        assignSel.add(new Option(name, u.id));
      });
    }

    // Popular select do lead modal (criar novo lead)
    const leadAssignSel = qs("#leadAssignedTo");
    if (leadAssignSel && leadAssignSel.options.length <= 1) {
      users.forEach(u => {
        const name = u.name || u.email?.split("@")[0] || "?";
        leadAssignSel.add(new Option(name, u.id));
      });
    }

    // Busca todos os leads (admin vê tudo via backend)
    const leads = await api("/api/leads?admin=1");

    // Cria mapa id→name de usuários
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name || u.email?.split("@")[0] || "?"]));

    const userF  = qs("#adminLeadUserFilter")?.value  || "";
    const stageF = qs("#adminLeadStageFilter")?.value || "";

    const filtered = leads.filter(l => {
      if (userF  && l.assigned_to !== userF)  return false;
      if (stageF && l.stage       !== stageF) return false;
      return true;
    });

    if (!filtered.length) {
      tableEl.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:12px">Nenhum lead encontrado.</p>`;
      return;
    }

    tableEl.innerHTML = `
      <table class="admin-lead-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Estágio</th>
            <th>Potência</th>
            <th>Cidade / UF</th>
            <th>Responsável</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(l => {
            const responsible = l.assigned_to ? (userMap[l.assigned_to] || "–") : `<span style="color:var(--muted);font-style:italic">Sem responsável</span>`;
            return `<tr>
              <td style="font-weight:600">${l.name}</td>
              <td><span class="tag">${l.stage || "–"}</span></td>
              <td>${l.power ? l.power + " kWp" : "–"}</td>
              <td>${l.city || "–"} / ${l.state || "–"}</td>
              <td>${responsible}</td>
              <td>
                <button class="btn-ghost sm" onclick="openAssignLeadModal('${l.id}','${escapeHtml(l.name)}','${l.assigned_to||''}')">
                  <i data-lucide="user-check"></i> Atribuir
                </button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    lucide.createIcons();
  } catch(e) {
    tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Erro: ${e.message}</div>`;
    console.error("renderAdminLeads:", e);
  }
};

// ─── Modal atribuir lead ──────────────────────────────────────────────────────
window.openAssignLeadModal = async (leadId, leadName, currentAssigned) => {
  await loadAdminLeadUsers(); // garante que o select está populado
  qs("#assignLeadId").value       = leadId;
  qs("#assignLeadName").textContent = leadName;
  qs("#assignLeadUser").value     = currentAssigned || "";
  qs("#assignLeadModal").showModal();
  lucide.createIcons();
};

qs("#closeAssignLeadModal")?.addEventListener("click",  () => qs("#assignLeadModal").close());
qs("#cancelAssignLeadModal")?.addEventListener("click", () => qs("#assignLeadModal").close());

qs("#saveAssignLeadBtn")?.addEventListener("click", async () => {
  const leadId = qs("#assignLeadId").value;
  const userId = qs("#assignLeadUser").value || null;
  setLoading("#saveAssignLeadBtn", "Salvando…");
  try {
    await api(`/api/leads/${leadId}`, { method: "PATCH", body: { assigned_to: userId } });
    toast("Lead atribuído com sucesso!");
    qs("#assignLeadModal").close();
    renderAdminLeads();
    // Atualiza cache local
    const lead = appData.leads.find(l => l.id === leadId);
    if (lead) {
      lead.assigned_to = userId;
      const users = await loadAdminLeadUsers();
      lead.assigned_name = users.find(u => u.id === userId)?.name || "";
    }
    renderKanban();
  } catch(e) {
    toast("Erro: " + e.message, "error");
  }
  resetBtn("#saveAssignLeadBtn", `<i data-lucide="user-check"></i> Atribuir`);
  lucide.createIcons();
});

// ─── Modal criar/editar usuário ───────────────────────────────────────────────
window.openCreateUserModal = () => {
  qs("#userModalTitle").textContent   = "Criar usuário";
  qs("#userModalId").value            = "";
  qs("#userModalName").value          = "";
  qs("#userModalEmail").value         = "";
  qs("#userModalPassword").value      = "";
  qs("#userModalIsAdmin").checked     = false;
  qs("#userModalRole").value          = "";
  qs("#userModalPasswordRow").style.display = "";
  qs("#userModal").showModal();
  lucide.createIcons();
};

window.openEditUserModal = (id, name, email, isAdminVal, role) => {
  qs("#userModalTitle").textContent   = "Editar usuário";
  qs("#userModalId").value            = id;
  qs("#userModalName").value          = name;
  qs("#userModalEmail").value         = email;
  qs("#userModalPassword").value      = "";
  qs("#userModalIsAdmin").checked     = isAdminVal;
  qs("#userModalRole").value          = role || "";
  qs("#userModalPasswordRow").style.display = "";
  qs("#userModal").showModal();
  lucide.createIcons();
};

qs("#closeUserModal")?.addEventListener("click",  () => qs("#userModal").close());
qs("#cancelUserModal")?.addEventListener("click", () => qs("#userModal").close());

qs("#saveUserBtn")?.addEventListener("click", async () => {
  const id       = qs("#userModalId").value.trim();
  const name     = qs("#userModalName").value.trim();
  const email    = qs("#userModalEmail").value.trim();
  const password = qs("#userModalPassword").value;
  const isAdminVal = qs("#userModalIsAdmin").checked;
  const role     = qs("#userModalRole").value;

  if (!email) { toast("Informe o e-mail.", "error"); return; }
  if (!role)  { toast("Selecione o tipo de empresa.", "error"); return; }
  setLoading("#saveUserBtn", "Salvando…");

  try {
    if (id) {
      // ── EDITAR usuário existente ──
      const updatePayload = { email };
      if (password) updatePayload.password = password;

      const { error: authErr } = await sb.auth.admin.updateUserById(id, updatePayload);
      if (authErr) throw authErr;

      const { error: profErr } = await sb.from("profiles")
        .update({ name, is_admin: isAdminVal })
        .eq("id", id);
      if (profErr) throw profErr;

      // Atualiza role no tenant associado ao profile
      const { data: prof } = await sb.from("profiles").select("tenant_id").eq("id", id).single();
      if (prof?.tenant_id) {
        await sb.from("tenants").update({ role }).eq("id", prof.tenant_id);
      }

      toast("Usuário atualizado!");
    } else {
      // ── CRIAR novo usuário ──
      if (!password) { toast("Informe a senha para o novo usuário.", "error"); resetBtn("#saveUserBtn", "Salvar"); return; }

      const { data: newUser, error: createErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, tenant_id: currentTenant?.id },
      });
      if (createErr) throw createErr;

      // Cria perfil associado ao mesmo tenant
      await sb.from("profiles").upsert({
        id:        newUser.user.id,
        name,
        is_admin:  isAdminVal,
        tenant_id: currentTenant?.id,
      });

      // Atualiza role no tenant
      if (currentTenant?.id) {
        await sb.from("tenants").update({ role }).eq("id", currentTenant.id);
      }

      toast("Usuário criado com sucesso!");
    }

    qs("#userModal").close();
    await loadAdminUsers();
  } catch (e) {
    toast("Erro: " + e.message, "error");
  }

  resetBtn("#saveUserBtn", "Salvar");
});

window.confirmDeleteUser = async (id, name) => {
  if (!confirm(`Excluir o usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
  try {
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) throw error;
    await sb.from("profiles").delete().eq("id", id);
    toast(`Usuário "${name}" excluído.`);
    await loadAdminUsers();
  } catch (e) {
    toast("Erro ao excluir: " + e.message, "error");
  }
};

// ─── Save tenant settings ─────────────────────────────────────────────────────
qs("#btnSaveTenantSettings")?.addEventListener("click", async () => {
  const name    = qs("#settingName").value.trim();
  const city    = qs("#settingCity").value.trim();
  const state   = qs("#settingState").value.trim().toUpperCase();
  const cnpj    = qs("#settingCnpj")?.value.trim()    || null;
  const razao   = qs("#settingRazao")?.value.trim()   || null;
  const site    = qs("#settingSite")?.value.trim()    || null;
  const instagram = qs("#settingInstagram")?.value.trim() || null;
  const linkedin  = qs("#settingLinkedin")?.value.trim()  || null;
  const colabs  = qs("#settingColabs")?.value.trim()  || null;
  const founded = qs("#settingFounded")?.value.trim() || null;
  if (!name) return;
  const payload = { name, city, state, cnpj, razao, site, instagram, linkedin, colabs, founded };
  const { error } = await sb.from("tenants").update(payload).eq("id", currentTenant.id);
  if (!error) {
    Object.assign(currentTenant, payload);
    toast("Perfil salvo!");
  } else toast(error.message, "error");
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MODAL
// ═══════════════════════════════════════════════════════════════════════════
const openLead = async () => {
  // Exibe campo de responsável só para admin
  const assignRow = qs("#leadAssignRow");
  if (assignRow) assignRow.style.display = isAdmin() ? "" : "none";
  // Popula o select de usuários (se admin)
  if (isAdmin()) {
    const users = await loadAdminLeadUsers();
    const sel = qs("#leadAssignedTo");
    if (sel && sel.options.length <= 1) {
      users.forEach(u => sel.add(new Option(u.name || u.email?.split("@")[0], u.id)));
    }
  }
  qs("#leadModal").showModal();
};
qs("#newLeadBtn").addEventListener("click",  openLead);
qs("#newLeadBtn2").addEventListener("click", openLead);
qs("#closeLeadModal").addEventListener("click",  () => qs("#leadModal").close());
qs("#cancelLeadModal").addEventListener("click", () => qs("#leadModal").close());

qs("#saveLeadBtn").addEventListener("click", async () => {
  const name  = qs("#leadName").value.trim();
  const city  = qs("#leadCity").value.trim();
  const state = qs("#leadState").value.trim().toUpperCase();
  const power = parseFloat(qs("#leadPower").value);
  if (!name || !city || !state || !power) { toast("Preencha os campos obrigatórios.", "error"); return; }

  setLoading("#saveLeadBtn", "Salvando…");
  try {
    const data = await api("/api/leads", {
      method: "POST",
      body: {
        name, city, state, power,
        type:          qs("#leadType").value,
        note:          qs("#leadNote").value.trim(),
        value_brl:     parseFloat(qs("#leadValue").value) || null,
        contact_name:  qs("#leadContact").value.trim(),
        contact_phone: qs("#leadPhone").value.trim(),
        assigned_to:   qs("#leadAssignedTo")?.value || null,
      },
    });
    appData.leads.unshift(data);
    qs("#leadModal").close();
    ["#leadName","#leadCity","#leadState","#leadPower","#leadNote","#leadValue","#leadContact","#leadPhone"]
      .forEach(s => qs(s).value = "");
    renderKanban(); renderDashboard();
    toast("Lead salvo!");
  } catch (e) {
    toast(e.message, "error");
  }
  resetBtn("#saveLeadBtn", `<i data-lucide="save"></i> Salvar lead`);
  lucide.createIcons();
});


// ═══════════════════════════════════════════════════════════════════════════
// CHAT — Realtime via Supabase
// ═══════════════════════════════════════════════════════════════════════════
let activeConvId   = null;
let chatChannel    = null;
let conversations  = [];

async function loadChat() {
  if (!currentTenant) return;
  await loadConversations();
  subscribeToChat();
}

async function loadConversations() {
  // 1. Busca as conversas (apenas IDs de tenant)
  const { data: convRows, error } = await sb
    .from("chat_conversations")
    .select("id, last_message, last_at, tenant_a, tenant_b")
    .or(`tenant_a.eq.${currentTenant.id},tenant_b.eq.${currentTenant.id}`)
    .order("last_at", { ascending: false });

  if (error) { console.error("Chat:", error.message); return; }
  if (!convRows?.length) { conversations = []; renderConversationList(); return; }

  // 2. Coleta todos os IDs unicos de tenants envolvidos
  const tenantIds = [...new Set(convRows.flatMap(c => [c.tenant_a, c.tenant_b]))];

  // 3. Busca os dados dos tenants de uma vez
  const { data: tenantRows } = await sb
    .from("tenants")
    .select("id, name, initials, role, city, state")
    .in("id", tenantIds);

  const tenantMap = Object.fromEntries((tenantRows || []).map(t => [t.id, t]));

  // Garante que o tenant atual está no mapa (fallback local)
  if (currentTenant?.id && !tenantMap[currentTenant.id]) {
    tenantMap[currentTenant.id] = currentTenant;
  }

  // IDs que não vieram na tabela tenants — busca em profiles como fallback
  const missingIds = tenantIds.filter(id => !tenantMap[id]);
  if (missingIds.length) {
    const { data: profileRows } = await sb
      .from("profiles")
      .select("id, name, tenant_id, tenants(id, name, initials, role, city, state)")
      .in("tenant_id", missingIds);

    (profileRows || []).forEach(p => {
      if (p.tenants && !tenantMap[p.tenant_id]) {
        tenantMap[p.tenant_id] = p.tenants;
      } else if (!tenantMap[p.tenant_id]) {
        // último fallback: usa o nome do profile
        const initials = (p.name || "?").slice(0, 2).toUpperCase();
        tenantMap[p.tenant_id] = { id: p.tenant_id, name: p.name || "Usuário", initials, role: "" };
      }
    });
  }

  // 4. Monta o objeto de conversa com dados completos
  conversations = convRows.map(c => ({
    ...c,
    tenant_a: tenantMap[c.tenant_a] || { id: c.tenant_a, name: "Empresa", initials: "?", role: "" },
    tenant_b: tenantMap[c.tenant_b] || { id: c.tenant_b, name: "Empresa", initials: "?", role: "" },
  }));

  renderConversationList();
}

function renderConversationList(filter = "") {
  const list = qs("#conversationList");
  const filtered = conversations.filter(c => {
    const other = getOtherTenant(c);
    return !filter || other.name.toLowerCase().includes(filter.toLowerCase());
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="chat-empty">
      <i data-lucide="messages-square"></i>
      <p>Nenhuma conversa ainda.<br/>Clique em "Nova" para começar.</p>
    </div>`;
    lucide.createIcons();
    return;
  }

  list.innerHTML = filtered.filter(c => c.tenant_a && c.tenant_b).map(c => {
    const other = getOtherTenant(c);
    const time  = c.last_at ? new Date(c.last_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
    return `<div class="conv-item ${c.id === activeConvId ? "active" : ""}"
      onclick="openConversation('${c.id}')">
      <div class="conv-avatar">${other.initials || "?"}</div>
      <div class="conv-info">
        <div class="conv-name">${other.name}</div>
        <div class="conv-preview">${c.last_message || "Iniciar conversa…"}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${time}</span>
      </div>
    </div>`;
  }).join("");
}

function getOtherTenant(conv) {
  const other = conv.tenant_a?.id === currentTenant.id ? conv.tenant_b : conv.tenant_a;
  return other || { initials: "?", name: "Empresa removida", role: "" };
}

async function openConversation(convId) {
  activeConvId = convId;
  renderConversationList();

  const conv = conversations.find(c => c.id === convId);
  const other = getOtherTenant(conv);

  const win = qs("#chatWindow");
  win.innerHTML = `
    <div class="chat-header">
      <div class="conv-avatar">${other.initials || "?"}</div>
      <div class="chat-header-info">
        <div class="chat-header-name">${other.name}</div>
        <div class="chat-header-role">${other.role || ""}</div>
      </div>
    </div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input-bar">
      <textarea id="chatInput" placeholder="Digite uma mensagem…" rows="1"></textarea>
      <button class="send-btn" id="sendMsgBtn">
        <i data-lucide="send"></i>
      </button>
    </div>`;
  lucide.createIcons();

  await loadMessages(convId);

  qs("#sendMsgBtn").addEventListener("click", sendMessage);
  qs("#chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Auto-resize textarea
  qs("#chatInput").addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });
}

async function loadMessages(convId) {
  const { data, error } = await sb
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });

  if (error) { console.error("loadMessages:", error.message); return; }
  renderMessages(data || []);

  // Mark as read — usa tenant_id se existir, senão user id
  const myId = currentTenant.id;
  await sb.from("chat_messages")
    .update({ read: true })
    .eq("conversation_id", convId)
    .neq("sender_id", myId);
}

function renderMessages(msgs) {
  const el = qs("#chatMessages");
  if (!el) return;

  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:24px">
      Nenhuma mensagem ainda. Diga oi! 👋
    </div>`;
    return;
  }

  // sender_id pode ser tenant_id ou user_id dependendo de quem enviou
  // considera "minha" se bater com currentTenant.id OU currentUser.id
  const myIds = new Set([currentTenant.id, currentUser?.id].filter(Boolean));

  el.innerHTML = msgs.map(m => {
    const out  = myIds.has(m.sender_id);
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `<div class="msg ${out ? "out" : "in"}">
      <div class="msg-bubble">${escapeHtml(m.body)}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  }).join("");
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function sendMessage() {
  const input = qs("#chatInput");
  const body  = input?.value.trim();
  if (!body || !activeConvId) return;

  input.value = "";
  input.style.height = "auto";

  // Adiciona otimisticamente na tela antes de salvar
  const el = qs("#chatMessages");
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (el) {
    el.insertAdjacentHTML("beforeend", `
      <div class="msg out pending">
        <div class="msg-bubble">${escapeHtml(body)}</div>
        <div class="msg-time">${time}</div>
      </div>`);
    el.scrollTop = el.scrollHeight;
  }

  const { error } = await sb.from("chat_messages").insert({
    conversation_id: activeConvId,
    sender_id:       currentTenant.id,
    body,
    read: false,
  });

  if (error) {
    toast(error.message, "error");
    // Remove a mensagem otimista em caso de erro
    el?.querySelector(".msg.out.pending")?.remove();
    input.value = body;
    return;
  }

  // Remove classe pending (mensagem confirmada)
  el?.querySelector(".msg.out.pending")?.classList.remove("pending");

  // Atualiza last_message da conversa
  await sb.from("chat_conversations")
    .update({ last_message: body, last_at: now.toISOString() })
    .eq("id", activeConvId);

  // Atualiza localmente o preview da lista
  const conv = conversations.find(c => c.id === activeConvId);
  if (conv) { conv.last_message = body; conv.last_at = now.toISOString(); }
  renderConversationList();
}

function subscribeToChat() {
  if (chatChannel) sb.removeChannel(chatChannel);

  chatChannel = sb
    .channel("chat-" + currentTenant.id)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
    }, async (payload) => {
      const msg = payload.new;

      // Se é da conversa aberta, adiciona na tela
      if (msg.conversation_id === activeConvId) {
        const el = qs("#chatMessages");
        if (el) {
          const myIds = new Set([currentTenant.id, currentUser?.id].filter(Boolean));
          const out  = myIds.has(msg.sender_id);
          // Se já foi adicionado otimisticamente (out), não duplica
          if (!out) {
            const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            el.insertAdjacentHTML("beforeend", `
              <div class="msg in">
                <div class="msg-bubble">${escapeHtml(msg.body)}</div>
                <div class="msg-time">${time}</div>
              </div>`);
            el.scrollTop = el.scrollHeight;
          }
        }
      } else {
        // Notificação de nova mensagem
        toast("Nova mensagem recebida!", "success");
      }

      // Atualiza lista de conversas
      await loadConversations();
    })
    .subscribe();
}

// ─── Modal nova conversa ──────────────────────────────────────────────────────
let selectedTenantId = null;

qs("#newChatBtn")?.addEventListener("click", () => {
  selectedTenantId = null;
  renderTenantOptions("");
  qs("#newChatModal").showModal();
  lucide.createIcons();
});
qs("#closeNewChatModal")?.addEventListener("click", () => qs("#newChatModal").close());
qs("#cancelNewChat")?.addEventListener("click",    () => qs("#newChatModal").close());

qs("#newChatSearch")?.addEventListener("input", e => renderTenantOptions(e.target.value));

function renderTenantOptions(filter) {
  const list = qs("#tenantOptionList");
  const opts = appData.tenants.filter(t =>
    t.id !== currentTenant?.id &&
    (!filter || t.name.toLowerCase().includes(filter.toLowerCase()))
  );
  list.innerHTML = opts.map(t => `
    <div class="tenant-option ${selectedTenantId === t.id ? "selected" : ""}"
      onclick="selectTenantForChat('${t.id}')">
      <div class="conv-avatar" style="width:36px;height:36px;font-size:12px">${t.initials || "?"}</div>
      <div>
        <div style="font-size:13px;font-weight:700">${t.name}</div>
        <div style="font-size:12px;color:var(--muted)">${t.role} · ${t.city || ""}${t.state ? "/" + t.state : ""}</div>
      </div>
    </div>`).join("") || `<p style="color:var(--muted);font-size:13px;padding:12px">Nenhuma empresa encontrada.</p>`;
}

window.selectTenantForChat = (tenantId) => {
  selectedTenantId = tenantId;
  renderTenantOptions(qs("#newChatSearch")?.value || "");
};

qs("#startChatBtn")?.addEventListener("click", async () => {
  if (!selectedTenantId) { toast("Selecione uma empresa.", "error"); return; }

  // Tenant do outro lado (já está em appData.tenants)
  const otherTenant = appData.tenants.find(t => t.id === selectedTenantId);
  if (!otherTenant) { toast("Empresa não encontrada.", "error"); return; }

  // Verifica no Supabase se já existe conversa entre os dois (em qualquer ordem)
  const { data: existingRows } = await sb
    .from("chat_conversations")
    .select("id, last_message, last_at, tenant_a, tenant_b")
    .or(
      `and(tenant_a.eq.${currentTenant.id},tenant_b.eq.${selectedTenantId}),` +
      `and(tenant_a.eq.${selectedTenantId},tenant_b.eq.${currentTenant.id})`
    )
    .limit(1);

  if (existingRows?.length) {
    const raw = existingRows[0];
    // Monta objeto com dados completos
    const existing = {
      ...raw,
      tenant_a: raw.tenant_a === currentTenant.id ? currentTenant : otherTenant,
      tenant_b: raw.tenant_b === currentTenant.id ? currentTenant : otherTenant,
    };
    if (!conversations.find(c => c.id === existing.id)) conversations.unshift(existing);
    qs("#newChatModal").close();
    renderConversationList();
    openConversation(existing.id);
    return;
  }

  // Cria nova conversa
  const { data, error } = await sb.from("chat_conversations").insert({
    tenant_a: currentTenant.id,
    tenant_b: selectedTenantId,
    last_message: null,
  }).select("id, last_message, last_at, tenant_a, tenant_b").single();

  if (error) { toast(error.message, "error"); return; }

  // Monta objeto localmente sem depender de reload
  const newConv = {
    ...data,
    tenant_a: currentTenant,
    tenant_b: otherTenant,
  };
  conversations.unshift(newConv);
  renderConversationList();
  qs("#newChatModal").close();
  openConversation(newConv.id);
  toast("Conversa iniciada!");
});

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION & EVENTS
// ═══════════════════════════════════════════════════════════════════════════
qsa(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.view;
    switchView(v);
    if (v === "dashboard")    renderDashboard();
    if (v === "pipeline")     renderKanban();
    if (v === "network")      renderNetwork();
    if (v === "marketplace")  renderMarketplace();
    if (v === "chat")         { loadChat(); }
    if (v === "whatsapp")     { loadWAStatus(); loadWAMessages(); }
    if (v === "subscription") renderSubscription();
    if (v === "admin")        renderAdmin();
    closeMobileSidebar();
  });
});

qs("#sidebarToggle").addEventListener("click", () => qs("#appShell").classList.toggle("collapsed"));

function openMobileSidebar() {
  qs("#sidebar").classList.add("mobile-open");
  qs("#sidebarOverlay")?.classList.add("active");
  document.body.style.overflow = "hidden";
}
function closeMobileSidebar() {
  qs("#sidebar").classList.remove("mobile-open");
  qs("#sidebarOverlay")?.classList.remove("active");
  document.body.style.overflow = "";
}
qs("#mobileMenuBtn").addEventListener("click", () => {
  qs("#sidebar").classList.contains("mobile-open") ? closeMobileSidebar() : openMobileSidebar();
});
qs("#sidebarOverlay")?.addEventListener("click", closeMobileSidebar);

["#pipelineStateFilter","#pipelinePowerFilter"].forEach(s => qs(s)?.addEventListener("change", renderKanban));
["#networkRoleFilter","#networkStateFilter"].forEach(s => qs(s)?.addEventListener("change", renderNetwork));
qs("#kitSearch")?.addEventListener("input", renderMarketplace);
qs("#globalSearch")?.addEventListener("input", () => { renderKanban(); renderNetwork(); renderMarketplace(); });

// WhatsApp connect button initial binding
qs("#waConnectBtn")?.addEventListener("click", connectWA);

// Theme
qs("#themeToggle").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  localStorage.setItem("isolar-theme", document.documentElement.dataset.theme);
  lucide.createIcons();
  renderDashboard();
});
const savedTheme = localStorage.getItem("isolar-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

// ═══════════════════════════════════════════════════════════════════════════
// KIT MODAL
// ═══════════════════════════════════════════════════════════════════════════
const openKit = () => { qs("#kitModal").showModal(); lucide.createIcons(); };
qs("#publishKitBtn").addEventListener("click", openKit);
qs("#closeKitModal").addEventListener("click",  () => qs("#kitModal").close());
qs("#cancelKitModal").addEventListener("click", () => qs("#kitModal").close());

// Profile modal — listeners fixos (não usam clone)
qs("#profileModalCloseX")?.addEventListener("click",   () => qs("#profileModal").close());
qs("#profileModalCloseBtn")?.addEventListener("click", () => qs("#profileModal").close());
// Fecha também ao clicar fora do conteúdo (no backdrop)
qs("#profileModal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

qs("#saveKitBtn").addEventListener("click", async () => {
  // Segurança: apenas Distribuidor pode publicar
  if (currentTenant?.role?.toLowerCase() !== "distribuidor") {
    toast("Apenas distribuidores podem publicar kits.", "error"); return;
  }

  const title       = qs("#kitTitle").value.trim();
  const distributor = currentTenant.name; // sempre usa o nome do tenant logado
  const city        = qs("#kitCity").value.trim();
  const state       = qs("#kitState").value.trim().toUpperCase();
  const price       = parseFloat(qs("#kitPrice").value);
  const stock       = parseInt(qs("#kitStock").value) || 0;
  const items       = qs("#kitItems").value.split("\n").map(s => s.trim()).filter(Boolean);

  if (!title || !city || !state || !price) {
    toast("Preencha os campos obrigatórios.", "error"); return;
  }

  setLoading("#saveKitBtn", "Publicando...");
  try {
    const data = await api("/api/kits", {
      method: "POST",
      body: { title, distributor, city, state, price_cents: Math.round(price * 100), stock, items, tenant_id: currentTenant.id },
    });
    appData.kits.unshift({ ...data, tenant_id: data.tenant_id || currentTenant.id, price: fmtBrl(data.price_cents / 100), stock: data.stock + " unidades" });
    qs("#kitModal").close();
    ["#kitTitle","#kitDistributor","#kitCity","#kitState","#kitPrice","#kitStock","#kitItems"]
      .forEach(s => qs(s).value = "");
    renderMarketplace();
    toast("Kit publicado com sucesso!");
  } catch (e) {
    toast(e.message, "error");
  }
  resetBtn("#saveKitBtn", '<i data-lucide="save"></i> Publicar kit');
  lucide.createIcons();
});

// ─── PROFILE MODAL ────────────────────────────────────────────────────────────
// ─── Dados locais de reputação e feed (persistência via appData) ──────────────
if (!appData.reputation) appData.reputation = {}; // { tenantId: { criteria: {}, reviews: [] } }
if (!appData.feed)       appData.feed = {};       // { tenantId: [] }

const REP_CRITERIA = ["Qualidade técnica", "Prazo", "Comunicação", "Organização"];

// Gera match score baseado em região, especialidade e tipo de projeto
function calcMatch(a, b) {
  if (!a || !b) return null;
  let score = 0;
  // Região
  if (a.state && b.state && a.state === b.state) score += 30;
  else if (a.state && b.state) score += 10;
  // Especialidade / role complementar
  const complements = {
    "Integrador": ["Distribuidor", "Instalador"],
    "Instalador":  ["Integrador", "Distribuidor"],
    "Distribuidor":["Integrador", "Instalador"],
    "Elétrica":    ["Integrador"],
  };
  if ((complements[a.role] || []).includes(b.role)) score += 35;
  else if (a.role === b.role) score += 15;
  // Disponibilidade / tags em comum
  const tagsA = new Set(a.permissions || []);
  const tagsB = new Set(b.permissions || []);
  const shared = [...tagsA].filter(x => tagsB.has(x)).length;
  score += Math.min(shared * 10, 25);
  // Reputação mínima
  if (Number(b.rating || 0) >= 4) score += 10;
  return Math.min(score, 99);
}

function matchFactors(a, b) {
  const factors = [];
  if (a.state && b.state && a.state === b.state)
    factors.push({ icon: "map-pin", text: `Mesma região — ${b.state}` });
  else if (a.state && b.state)
    factors.push({ icon: "map-pin", text: `Regiões próximas (${a.state} / ${b.state})` });
  const complements = { "Integrador":["Distribuidor","Instalador"],"Instalador":["Integrador","Distribuidor"],"Distribuidor":["Integrador","Instalador"],"Elétrica":["Integrador"] };
  if ((complements[a.role]||[]).includes(b.role))
    factors.push({ icon: "zap", text: `Perfis complementares — ${a.role} + ${b.role}` });
  const tagsA = new Set(a.permissions||[]);
  const tagsB = new Set(b.permissions||[]);
  const shared = [...tagsA].filter(x => tagsB.has(x));
  if (shared.length) factors.push({ icon: "tag", text: `Especialidades em comum: ${shared.join(", ")}` });
  if (Number(b.rating||0) >= 4) factors.push({ icon: "star", text: `Alta reputação (${Number(b.rating).toFixed(1)}★)` });
  return factors;
}

// ─── Renderiza aba Reputação ───────────────────────────────────────────────────
function renderReputation(tenant) {
  const rep = appData.reputation[tenant.id] || { reviews: [] };
  const reviews = rep.reviews || [];

  // Score global
  let globalScore = Number(tenant.rating || 0);
  if (reviews.length) {
    globalScore = reviews.reduce((s, r) => s + r.overall, 0) / reviews.length;
  }
  qs("#repScore").textContent = globalScore ? globalScore.toFixed(1) : "–";
  qs("#repStars").textContent = globalScore ? stars(globalScore) : "☆☆☆☆☆";
  qs("#repCount").textContent = reviews.length
    ? `${reviews.length} avaliação${reviews.length > 1 ? "ões" : ""}`
    : "Sem avaliações";

  // Barras por critério
  const criteriaScores = {};
  REP_CRITERIA.forEach(c => {
    const vals = reviews.map(r => r.criteria?.[c] || 0).filter(Boolean);
    criteriaScores[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  qs("#repBars").innerHTML = REP_CRITERIA.map(c => {
    const v = criteriaScores[c];
    return `<div class="rep-bar-row">
      <span class="rep-bar-label">${c}</span>
      <div class="rep-bar-wrap"><div class="rep-bar-fill" style="width:${v * 20}%"></div></div>
      <span class="rep-bar-val">${v ? v.toFixed(1) : "–"}</span>
    </div>`;
  }).join("");

  // Lista de reviews
  qs("#repReviewList").innerHTML = reviews.length
    ? reviews.slice().reverse().map(r => `
      <div class="rep-review-item">
        <div class="rep-review-header">
          <span class="rep-review-author">${esc(r.author || "Parceiro")}</span>
          <span class="rep-review-date">${r.date || ""}</span>
          <span class="rep-review-stars">${stars(r.overall)}</span>
        </div>
        ${r.text ? `<p class="rep-review-text">${esc(r.text)}</p>` : ""}
        <div class="rep-review-criteria">
          ${REP_CRITERIA.map(c => r.criteria?.[c] ? `<span class="rep-crit-tag">${c}: ${r.criteria[c]}★</span>` : "").join("")}
        </div>
      </div>`).join("")
    : `<p style="color:var(--muted);font-size:13px;padding:8px 0">Ainda sem avaliações para este parceiro.</p>`;

  // ── Star pickers (recriar HTML a cada render evita listeners duplicados) ──
  const criteriaState = {};
  REP_CRITERIA.forEach(c => { criteriaState[c] = 0; });

  const inputsEl = qs("#repCriteriaInputs");
  inputsEl.innerHTML = REP_CRITERIA.map(c => `
    <div class="rep-crit-row">
      <label>${c}</label>
      <div class="star-picker" data-crit="${c}">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-val="${n}">★</button>`).join("")}
      </div>
    </div>`).join("");

  // Escopo restrito ao container — sem qsa global
  inputsEl.querySelectorAll(".star-picker").forEach(picker => {
    const crit = picker.dataset.crit;
    picker.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        criteriaState[crit] = Number(btn.dataset.val);
        picker.querySelectorAll("button").forEach(b =>
          b.classList.toggle("lit", Number(b.dataset.val) <= criteriaState[crit]));
      });
    });
  });

  // Substituir o botão por um clone para remover qualquer listener anterior
  const oldBtn = qs("#repSubmitBtn");
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.replaceWith(newBtn);
  newBtn.addEventListener("click", () => {
    const overall = Object.values(criteriaState).filter(Boolean);
    if (!overall.length) { toast("Selecione ao menos uma estrela.", "error"); return; }
    const avg = overall.reduce((a, b) => a + b, 0) / overall.length;
    const review = {
      author: currentProfile?.name || currentUser?.email?.split("@")[0] || "Você",
      date: new Date().toLocaleDateString("pt-BR"),
      overall: parseFloat(avg.toFixed(1)),
      criteria: { ...criteriaState },
      text: qs("#repComment").value.trim(),
    };
    if (!appData.reputation[tenant.id]) appData.reputation[tenant.id] = { reviews: [] };
    appData.reputation[tenant.id].reviews.push(review);
    qs("#repComment").value = "";
    renderReputation(tenant);
    toast("Avaliação enviada!");
  });
}

// ─── Renderiza aba Feed ────────────────────────────────────────────────────────
function renderFeed(tenant) {
  const isOwn = tenant.id === currentTenant?.id;
  qs("#feedPublishWrap").style.display = isOwn ? "block" : "none";

  if (isOwn) {
    // Tipo selecionado — recriar botões com cloneNode para limpar listeners antigos
    let selectedType = "obra";
    const typeContainer = qs("#feedComposeType");
    const freshTypes = typeContainer.cloneNode(true);
    typeContainer.replaceWith(freshTypes);
    freshTypes.querySelectorAll(".fct").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedType = btn.dataset.fct;
        freshTypes.querySelectorAll(".fct").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    // Botão publicar — clone para remover listener anterior
    const oldPub = qs("#feedPublishBtn");
    const newPub = oldPub.cloneNode(true);
    oldPub.replaceWith(newPub);
    newPub.addEventListener("click", () => {
      const text = qs("#feedText").value.trim();
      if (!text) { toast("Escreva algo antes de publicar.", "error"); return; }
      if (!appData.feed[tenant.id]) appData.feed[tenant.id] = [];
      appData.feed[tenant.id].unshift({
        id: Date.now(),
        type: selectedType,
        text,
        author: currentProfile?.name || "Você",
        when: "agora mesmo",
        likes: 0,
      });
      qs("#feedText").value = "";
      renderFeedList(tenant);
      toast("Publicado!");
    });
  }

  renderFeedList(tenant);
}

const feedTypeLabels = { obra: "Obra", dica: "Dica", problema: "Problema", equipamento: "Equipamento" };

function renderFeedList(tenant) {
  const posts = appData.feed[tenant.id] || [];
  const initials = tenant.initials || (tenant.name || "?")[0].toUpperCase();
  const list = qs("#feedList");
  list.innerHTML = posts.length
    ? posts.map(p => `
      <div class="feed-post" data-post-id="${p.id}" data-tenant-id="${tenant.id}">
        <div class="feed-post-header">
          <div class="feed-post-avatar">${esc(initials)}</div>
          <div>
            <div class="feed-post-author">${esc(p.author)}</div>
            <div class="feed-post-when">${p.when}</div>
          </div>
          <span class="feed-post-type-badge ${p.type}">${feedTypeLabels[p.type] || p.type}</span>
        </div>
        <p class="feed-post-text">${esc(p.text)}</p>
        <div class="feed-post-actions">
          <button class="feed-action-btn like-btn">
            <i data-lucide="heart"></i> <span class="like-count">${p.likes || 0}</span>
          </button>
          <button class="feed-action-btn">
            <i data-lucide="message-circle"></i> Comentar
          </button>
          <button class="feed-action-btn">
            <i data-lucide="share-2"></i> Compartilhar
          </button>
        </div>
      </div>`).join("")
    : `<div class="feed-empty">
        <i data-lucide="rss"></i>
        <p>Nenhuma publicação ainda.</p>
        ${tenant.id === currentTenant?.id ? "<small>Seja o primeiro a publicar!</small>" : ""}
      </div>`;

  // Like buttons via JS delegation
  list.querySelectorAll(".like-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const postEl = btn.closest(".feed-post");
      const postId = Number(postEl.dataset.postId);
      const tId    = postEl.dataset.tenantId;
      const post   = (appData.feed[tId] || []).find(p => p.id === postId);
      if (post) {
        post.likes = (post.likes || 0) + 1;
        btn.querySelector(".like-count").textContent = post.likes;
        btn.style.color = "var(--danger)";
      }
    });
  });

  lucide.createIcons();
}

// ─── Renderiza aba Sobre ───────────────────────────────────────────────────────
function renderSobre(tenant) {
  // ── Dados Comerciais ──
  const showField = (wrapperId, val) => { const el = qs(wrapperId); if (el) el.style.display = val ? "" : "none"; };
  showField("#piCnpj",    tenant.cnpj);
  showField("#piRazao",   tenant.razao);
  showField("#piColabs",  tenant.colabs);
  showField("#piFounded", tenant.founded);
  if (tenant.cnpj)    qs("#profileModalCnpj").textContent    = formatCnpj(tenant.cnpj);
  if (tenant.razao)   qs("#profileModalRazao").textContent   = tenant.razao;
  if (tenant.colabs)  qs("#profileModalColabs").textContent  = tenant.colabs + " colaboradores";
  if (tenant.founded) qs("#profileModalFounded").textContent = "Desde " + tenant.founded;

  // Oculta grade se sem dados comerciais
  const infoGrid = qs("#profileModalCnpj")?.closest(".profile-info-grid");
  if (infoGrid) infoGrid.style.display = (tenant.cnpj || tenant.razao || tenant.colabs || tenant.founded) ? "" : "none";

  // ── Links ──
  const links = [];
  if (tenant.site)      links.push({ icon: "globe",     label: "Site",      url: ensureHttp(tenant.site) });
  if (tenant.instagram) links.push({ icon: "instagram", label: "Instagram", url: "https://instagram.com/" + tenant.instagram.replace("@", "") });
  if (tenant.linkedin)  links.push({ icon: "linkedin",  label: "LinkedIn",  url: ensureHttp(tenant.linkedin) });
  if (tenant.facebook)  links.push({ icon: "facebook",  label: "Facebook",  url: ensureHttp(tenant.facebook) });
  qs("#profileModalLinks").innerHTML = links.map(l =>
    `<a class="profile-link-btn" href="${l.url}" target="_blank" rel="noopener">
       <i data-lucide="${l.icon}"></i> ${l.label}
     </a>`).join("");

  // ── Apresentação ──
  qs("#profileModalCommentWrap").style.display = tenant.comment ? "" : "none";
  if (tenant.comment) qs("#profileModalComment").textContent = tenant.comment;

  // ── Tags ──
  const tags = tenant.permissions || [];
  qs("#profileModalTagsWrap").style.display = tags.length ? "" : "none";
  qs("#profileModalTags").innerHTML = tags.map(p => `<span class="tag">${esc(p)}</span>`).join("");

  // ── Match detail (fatores) ──
  const score  = calcMatch(currentTenant, tenant);
  const isSelf = tenant.id && tenant.id === currentTenant?.id;
  const detailWrap = qs("#profileModalMatchDetail");
  if (score !== null && !isSelf) {
    const factors = matchFactors(currentTenant, tenant);
    detailWrap.style.display = factors.length ? "" : "none";
    qs("#profileModalMatchFactors").innerHTML = factors.map(f =>
      `<div class="match-factor"><i data-lucide="${f.icon}"></i> ${f.text}</div>`).join("");
  } else {
    if (detailWrap) detailWrap.style.display = "none";
  }

  lucide.createIcons();
}

// ─── Modal principal ───────────────────────────────────────────────────────────
window.openProfileModal = (tenant) => {
  const modal = qs("#profileModal");

  // ── Identidade (header — sempre visível, sem custo) ──
  qs("#profileModalInitials").textContent  = tenant.initials || (tenant.name || "?")[0].toUpperCase();
  qs("#profileModalName").textContent      = tenant.name || "–";
  qs("#profileModalRoleBadge").textContent = tenant.role || "";

  // Localização no header
  const locWrapper = qs("#profileModalLocation");
  const locText    = qs("#profileModalLocationText");
  const locVal     = [tenant.city, tenant.state].filter(Boolean).join("/");
  if (locWrapper) locWrapper.style.display = locVal ? "flex" : "none";
  if (locText)    locText.textContent = locVal;

  // Badge de match (header)
  const score      = calcMatch(currentTenant, tenant);
  const matchBadge = qs("#profileModalMatch");
  const isSelf     = tenant.id && tenant.id === currentTenant?.id;
  if (score !== null && !isSelf) {
    matchBadge.style.display = "flex";
    qs("#profileModalMatchPct").textContent = score + "%";
    const arc = qs("#matchArc");
    if (arc) arc.setAttribute("stroke-dasharray", `${(score / 100) * 94} 94`);
  } else {
    matchBadge.style.display = "none";
  }

  // ── Tabs — reset + re-bind sem acúmulo de listeners ──
  // Todas as 3 abas são lazy: só renderizam quando clicadas
  const activateTab = (tabName) => {
    modal.querySelectorAll(".pmt").forEach(b => b.classList.toggle("active", b.dataset.pmt === tabName));
    modal.querySelectorAll(".pmt-panel").forEach(p => p.classList.toggle("active", p.id === "pmt" + cap(tabName)));
  };
  activateTab("sobre");
  // Renderiza "Sobre" imediatamente pois é a aba inicial
  renderSobre(tenant);

  modal.querySelectorAll(".pmt").forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
  });
  modal.querySelectorAll(".pmt").forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.pmt);
      if (btn.dataset.pmt === "sobre")     renderSobre(tenant);
      if (btn.dataset.pmt === "reputacao") renderReputation(tenant);
      if (btn.dataset.pmt === "feed")      renderFeed(tenant);
    });
  });

  // ── Chat btn ──
  const chatBtn = qs("#profileModalChatBtn");
  const freshChat = chatBtn.cloneNode(true);
  chatBtn.replaceWith(freshChat);
  freshChat.addEventListener("click", () => {
    qs("#profileModal").close();
    selectedTenantId = tenant.id;
    switchView("chat");
    loadChat();
  });

  modal.showModal();
  lucide.createIcons();
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCnpj(v) {
  const d = String(v).replace(/\D/g,"");
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5") : v;
}
function ensureHttp(url) {
  if (!url) return "#";
  return /^https?:\/\//.test(url) ? url : "https://" + url;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initAuth();
  // Bottom Nav — mobile
  document.querySelectorAll(".bottom-nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GERENCIAMENTO DE KITS — ADMIN
// ═══════════════════════════════════════════════════════════════════════════

window.renderAdminKits = async () => {
  const tableEl = qs("#adminKitTable");
  if (!tableEl) return;
  tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Carregando kits…</div>`;

  try {
    const search  = (qs("#adminKitSearch")?.value || "").toLowerCase();
    const tenantF = qs("#adminKitTenantFilter")?.value || "";

    const kits = await api("/api/kits");
    appData.kits = kits || [];

    const filterEl = qs("#adminKitTenantFilter");
    if (filterEl && filterEl.options.length <= 1) {
      const names = [...new Set(kits.map(k => k.distributor).filter(Boolean))].sort();
      names.forEach(n => filterEl.add(new Option(n, n)));
    }

    const filtered = kits.filter(k => {
      const blob = `${k.title} ${k.distributor} ${k.city} ${k.state}`.toLowerCase();
      return (!search || blob.includes(search)) && (!tenantF || k.distributor === tenantF);
    });

    if (!filtered.length) {
      tableEl.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:12px">Nenhum kit encontrado.</p>`;
      return;
    }

    tableEl.innerHTML = `
      <table class="admin-lead-table">
        <thead>
          <tr>
            <th>Kit</th><th>Distribuidor</th><th>Cidade / UF</th>
            <th>Preço</th><th>Estoque</th><th style="width:110px"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(k => {
            const price = k.price || fmtBrl((k.price_cents || 0) / 100);
            const kJson = JSON.stringify(k).replace(/"/g, "&quot;");
            return `<tr>
              <td style="font-weight:600">${esc(k.title)}</td>
              <td>${esc(k.distributor || "–")}</td>
              <td>${esc(k.city || "–")} / ${esc(k.state || "–")}</td>
              <td style="color:var(--leaf);font-weight:700">${price}</td>
              <td>${k.stock ?? "–"}</td>
              <td style="display:flex;gap:6px">
                <button class="btn-ghost sm" onclick='openAdminKitModal(${kJson})'>
                  <i data-lucide="pencil"></i>
                </button>
                <button class="btn-ghost sm" style="color:var(--danger,#e53e3e)" onclick="confirmDeleteKit('${k.id}','${esc(k.title).replace(/'/g,"\\'")}','admin')">
                  <i data-lucide="trash-2"></i>
                </button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    lucide.createIcons();
  } catch (e) {
    tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Erro: ${e.message}</div>`;
  }
};

window.openAdminKitModal = async (kit = null) => {
  // Popula select de tenants distribuidores
  const sel = qs("#adminKitModalTenant");
  if (sel && sel.options.length <= 1) {
    const distributors = appData.tenants.filter(t => t.role?.toLowerCase() === "distribuidor");
    distributors.forEach(t => sel.add(new Option(t.name, t.id)));
  }

  // Linha de tenant: admin vê, distribuidor não vê
  const tenantRow = qs("#adminKitTenantRow");
  if (tenantRow) tenantRow.style.display = isAdmin() ? "" : "none";

  const titleH2 = qs("#adminKitModalTitle2");
  const eyebrow = qs("#adminKitModalEyebrow");
  if (eyebrow) eyebrow.textContent = "Admin › Kits";

  if (kit) {
    if (titleH2) titleH2.textContent = "Editar Kit";
    qs("#adminKitModalId").value    = kit.id || "";
    qs("#adminKitModalTitleInput").value = kit.title || "";
    qs("#adminKitModalCity").value  = kit.city || "";
    qs("#adminKitModalState").value = kit.state || "";
    qs("#adminKitModalPrice").value = kit.price_cents
      ? kit.price_cents / 100
      : (parseFloat(String(kit.price || "0").replace(/[^\d.]/g, "")) || "");
    qs("#adminKitModalStock").value = kit.stock ?? "";
    qs("#adminKitModalPower").value = kit.power || "";
    qs("#adminKitModalItems").value = (kit.items || []).join("\n");
    if (sel) sel.value = kit.tenant_id || "";
  } else {
    if (titleH2) titleH2.textContent = "Novo Kit";
    qs("#adminKitModalId").value    = "";
    qs("#adminKitModalTitleInput").value = "";
    qs("#adminKitModalCity").value  = currentTenant?.city || "";
    qs("#adminKitModalState").value = currentTenant?.state || "";
    qs("#adminKitModalPrice").value = "";
    qs("#adminKitModalStock").value = "";
    qs("#adminKitModalPower").value = "";
    qs("#adminKitModalItems").value = "";
    if (sel) sel.value = currentTenant?.id || "";
  }
  qs("#adminKitModal").showModal();
  lucide.createIcons();
};

qs("#closeAdminKitModal")?.addEventListener("click",  () => qs("#adminKitModal").close());
qs("#cancelAdminKitModal")?.addEventListener("click", () => qs("#adminKitModal").close());

qs("#saveAdminKitBtn")?.addEventListener("click", async () => {
  const id       = qs("#adminKitModalId").value.trim();
  const title    = qs("#adminKitModalTitleInput").value.trim();
  const city     = qs("#adminKitModalCity").value.trim();
  const state    = qs("#adminKitModalState").value.trim().toUpperCase();
  const price    = parseFloat(qs("#adminKitModalPrice").value);
  const stock    = parseInt(qs("#adminKitModalStock").value) || 0;
  const power    = parseFloat(qs("#adminKitModalPower").value) || null;
  // tenant_id: admin escolhe pelo select; distribuidor usa o próprio tenant
  const tenantId = (qs("#adminKitTenantRow")?.style.display !== "none" && qs("#adminKitModalTenant")?.value)
    ? qs("#adminKitModalTenant").value
    : currentTenant?.id;
  const items    = (qs("#adminKitModalItems").value || "").split("\n").map(s => s.trim()).filter(Boolean);

  if (!title || !city || !state || !price) {
    toast("Preencha: nome, cidade, estado e preço.", "error"); return;
  }
  if (!tenantId) {
    toast("Selecione o distribuidor.", "error"); return;
  }

  const distributorTenant = appData.tenants.find(t => t.id === tenantId) || currentTenant;
  const distributor = distributorTenant?.name || currentTenant?.name || "";
  const body = { title, city, state, price_cents: Math.round(price * 100), stock, power, items, distributor, tenant_id: tenantId };

  setLoading("#saveAdminKitBtn", "Salvando…");
  try {
    if (id) {
      await api(`/api/kits/${id}`, { method: "PATCH", body });
      const idx = appData.kits.findIndex(k => k.id === id);
      if (idx >= 0) appData.kits[idx] = { ...appData.kits[idx], ...body, id, price: fmtBrl(price) };
      toast("Kit atualizado!");
    } else {
      const created = await api("/api/kits", { method: "POST", body });
      // Garante tenant_id no cache — usa o retorno da API ou o valor enviado
      appData.kits.unshift({ ...body, ...created, tenant_id: created.tenant_id || tenantId, price: fmtBrl(price) });
      toast("Kit criado com sucesso!");
    }
    qs("#adminKitModal").close();
    renderAdminKits();
    renderMarketplace();
    renderDistributorKits();
  } catch (e) {
    toast("Erro: " + e.message, "error");
  }
  resetBtn("#saveAdminKitBtn", `<i data-lucide="save"></i> Salvar kit`);
  lucide.createIcons();
});

window.confirmDeleteKit = async (kitId, kitTitle, source) => {
  if (!confirm(`Excluir o kit "${kitTitle}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/kits/${kitId}`, { method: "DELETE" });
    appData.kits = appData.kits.filter(k => k.id !== kitId);
    toast(`Kit "${kitTitle}" excluído.`);
    if (source === "admin") renderAdminKits();
    renderDistributorKits();
    renderMarketplace();
  } catch (e) {
    toast("Erro ao excluir: " + e.message, "error");
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GERENCIAMENTO DE KITS — DISTRIBUIDOR
// ═══════════════════════════════════════════════════════════════════════════

function renderDistributorKitPanel() {
  const panel = qs("#distributorKitPanel");
  if (!panel) return;
  const isDistributor = currentTenant?.role?.toLowerCase() === "distribuidor";
  panel.style.display = isDistributor ? "" : "none";
  if (isDistributor) renderDistributorKits();
}

window.renderDistributorKits = () => {
  const tableEl = qs("#distKitTable");
  if (!tableEl) return;

  const search = (qs("#distKitSearch")?.value || "").toLowerCase();
  const myKits = appData.kits.filter(k => {
    const isOwner = k.tenant_id === currentTenant?.id
      || (!k.tenant_id && k.distributor === currentTenant?.name);
    if (!isOwner) return false;
    return !search || `${k.title} ${k.city} ${k.state}`.toLowerCase().includes(search);
  });

  if (!myKits.length) {
    tableEl.innerHTML = `
      <div style="text-align:center;padding:32px;color:var(--muted)">
        <p style="font-size:13px">Você ainda não publicou nenhum kit.</p>
        <button class="btn-primary sm" style="margin-top:12px" onclick="openDistributorKitModal()">
          <i data-lucide="plus"></i> Publicar primeiro kit
        </button>
      </div>`;
    lucide.createIcons();
    return;
  }

  tableEl.innerHTML = `
    <table class="admin-lead-table">
      <thead>
        <tr>
          <th>Kit</th><th>Cidade / UF</th><th>Preço</th><th>Estoque</th><th style="width:130px"></th>
        </tr>
      </thead>
      <tbody>
        ${myKits.map(k => {
          const price = k.price || fmtBrl((k.price_cents || 0) / 100);
          const kJson = JSON.stringify(k).replace(/"/g, "&quot;");
          return `<tr>
            <td style="font-weight:600">${esc(k.title)}</td>
            <td>${esc(k.city || "–")} / ${esc(k.state || "–")}</td>
            <td style="color:var(--leaf);font-weight:700">${price}</td>
            <td>${k.stock ?? "–"}</td>
            <td style="display:flex;gap:6px">
              <button class="btn-ghost sm" onclick='openDistributorKitModal(${kJson})'>
                <i data-lucide="pencil"></i> Editar
              </button>
              <button class="btn-ghost sm" style="color:var(--danger,#e53e3e)" onclick="confirmDeleteKit('${k.id}','${esc(k.title).replace(/'/g,"\\'")}','dist')">
                <i data-lucide="trash-2"></i>
              </button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  lucide.createIcons();
};

window.openDistributorKitModal = (kit = null) => {
  const tenantRow = qs("#adminKitTenantRow");
  if (tenantRow) tenantRow.style.display = "none";

  const eyebrow = qs("#adminKitModalEyebrow");
  const titleH2 = qs("#adminKitModalTitle2");
  if (eyebrow) eyebrow.textContent = "Distribuidor › Meus Kits";

  if (kit) {
    if (titleH2) titleH2.textContent = "Editar Kit";
    qs("#adminKitModalId").value    = kit.id || "";
    qs("#adminKitModalTitleInput").value = kit.title || "";
    qs("#adminKitModalCity").value  = kit.city || "";
    qs("#adminKitModalState").value = kit.state || "";
    qs("#adminKitModalPrice").value = kit.price_cents
      ? kit.price_cents / 100
      : (parseFloat(String(kit.price || "0").replace(/[^\d.]/g, "")) || "");
    qs("#adminKitModalStock").value = kit.stock ?? "";
    qs("#adminKitModalPower").value = kit.power || "";
    qs("#adminKitModalItems").value = (kit.items || []).join("\n");
  } else {
    if (titleH2) titleH2.textContent = "Novo Kit";
    qs("#adminKitModalId").value    = "";
    qs("#adminKitModalTitleInput").value = "";
    qs("#adminKitModalCity").value  = currentTenant?.city || "";
    qs("#adminKitModalState").value = currentTenant?.state || "";
    qs("#adminKitModalPrice").value = "";
    qs("#adminKitModalStock").value = "";
    qs("#adminKitModalPower").value = "";
    qs("#adminKitModalItems").value = "";
  }
  qs("#adminKitModal").showModal();
  lucide.createIcons();
};
