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
  qsa(".view").forEach(v => v.classList.toggle("active", v.id === "view" + cap(viewId)));
  qs("#pageTitle").textContent = {
    dashboard: "Dashboard", pipeline: "Pipeline", network: "Network",
    marketplace: "Marketplace", chat: "Chat", whatsapp: "WhatsApp",
    subscription: "Assinatura", admin: "Administração"
  }[viewId] || viewId;
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

  qs("#profileGrid").innerHTML = list.map(t => `
    <article class="profile-card">
      <div class="profile-top">
        <span class="avatar">${t.initials || "iS"}</span>
        <div>
          <div class="profile-name">${t.name}</div>
          <span class="tag">${t.role}</span>
        </div>
      </div>
      <div class="rating">
        <span class="stars">${stars(t.rating)}</span>
        <span class="rating-val">${Number(t.rating||0).toFixed(1)}</span>
      </div>
      <p style="font-size:12px;margin:4px 0">${t.city||""}${t.city&&t.state?"/":""}${t.state||""}</p>
      ${t.comment ? `<div class="comment-box">${t.comment}</div>` : ""}
      <div class="tag-row">${(t.permissions||[]).map(p=>`<span class="tag">${p}</span>`).join("")}</div>
      <button class="btn-primary" style="width:100%;justify-content:center"
        onclick="openProfileModal(${JSON.stringify(t).replace(/"/g, "&quot;")})">
        Abrir perfil
      </button>
    </article>`).join("") || `<p style="color:var(--muted)">Nenhuma empresa encontrada.</p>`;

  const rf = qs("#networkRoleFilter");
  const sf2 = qs("#networkStateFilter");
  if (rf && rf.options.length <= 1) [...new Set(appData.tenants.map(t=>t.role))].sort().forEach(r=>rf.add(new Option(r,r)));
  if (sf2 && sf2.options.length <= 1) [...new Set(appData.tenants.map(t=>t.state).filter(Boolean))].sort().forEach(s=>sf2.add(new Option(s,s)));
}

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────
function renderMarketplace() {
  const search = (qs("#kitSearch")?.value || "").toLowerCase();
  const kits = appData.kits.filter(k =>
    `${k.title} ${k.distributor} ${k.city} ${k.state}`.toLowerCase().includes(search)
  );
  qs("#kitGrid").innerHTML = kits.map(k => `
    <article class="kit-card">
      <div>
        <div class="kit-distributor">${k.distributor}</div>
        <div class="kit-title">${k.title}</div>
      </div>
      <div class="kit-price">${k.price || fmtBrl(k.price_cents / 100)}</div>
      <div class="kit-meta">${k.city}/${k.state}</div>
      <div class="kit-stock">${k.stock}</div>
      <div class="tag-row">${(k.items||[]).map(i=>`<span class="tag">${i}</span>`).join("")}</div>
      <button class="btn-primary" style="width:100%;justify-content:center">Solicitar compra</button>
    </article>`).join("") || `<p style="color:var(--muted)">Nenhum kit.</p>`;
}

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
  }

  await loadAdminUsers();
}

async function loadAdminUsers() {
  const tableEl = qs("#userTable");
  tableEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Carregando usuários…</div>`;

  try {
    // Busca profiles + email via RPC (requer função list_users_with_email no Supabase)
    // A função deve fazer SELECT p.id, p.name, p.is_admin, p.tenant_id, t.name as tenant_name, u.email
    // FROM profiles p LEFT JOIN tenants t ON t.id = p.tenant_id LEFT JOIN auth.users u ON u.id = p.id
    const { data: profiles, error } = await sb.rpc("list_users_with_email");

    if (error) throw error;

    tableEl.innerHTML = profiles.map(p => {
      const email = p.email || "–";
      const name  = p.name || email.split("@")[0];
      const admin = p.is_admin ? `<span class="tag" style="background:var(--leaf);color:#fff">admin</span>` : `<span class="tag">usuário</span>`;
      return `
        <div class="user-row" id="urow-${p.id}">
          <div class="user-row-info">
            <div class="user-avatar" style="width:36px;height:36px;font-size:13px;border-radius:10px;background:var(--leaf);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${(name[0]||"?").toUpperCase()}</div>
            <div>
              <div style="font-weight:600;font-size:14px">${name}</div>
              <div style="font-size:12px;color:var(--muted)">${email} · ${p.tenant_name || "–"}</div>
            </div>
            ${admin}
          </div>
          <div class="user-row-actions">
            <button class="btn-ghost sm" onclick="openEditUserModal('${p.id}','${escapeHtml(name)}','${email}',${!!p.is_admin})">
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

// ─── Modal criar/editar usuário ───────────────────────────────────────────────
window.openCreateUserModal = () => {
  qs("#userModalTitle").textContent   = "Criar usuário";
  qs("#userModalId").value            = "";
  qs("#userModalName").value          = "";
  qs("#userModalEmail").value         = "";
  qs("#userModalPassword").value      = "";
  qs("#userModalIsAdmin").checked     = false;
  qs("#userModalPasswordRow").style.display = "";
  qs("#userModal").showModal();
  lucide.createIcons();
};

window.openEditUserModal = (id, name, email, isAdminVal) => {
  qs("#userModalTitle").textContent   = "Editar usuário";
  qs("#userModalId").value            = id;
  qs("#userModalName").value          = name;
  qs("#userModalEmail").value         = email;
  qs("#userModalPassword").value      = "";
  qs("#userModalIsAdmin").checked     = isAdminVal;
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

  if (!email) { toast("Informe o e-mail.", "error"); return; }
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
  const name  = qs("#settingName").value.trim();
  const city  = qs("#settingCity").value.trim();
  const state = qs("#settingState").value.trim().toUpperCase();
  if (!name) return;
  const { error } = await sb.from("tenants").update({ name, city, state }).eq("id", currentTenant.id);
  if (!error) { currentTenant.name = name; currentTenant.city = city; currentTenant.state = state; toast("Salvo!"); }
  else toast(error.message, "error");
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MODAL
// ═══════════════════════════════════════════════════════════════════════════
const openLead = () => qs("#leadModal").showModal();
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
    qs("#sidebar").classList.remove("mobile-open");
  });
});

qs("#sidebarToggle").addEventListener("click", () => qs("#appShell").classList.toggle("collapsed"));
qs("#mobileMenuBtn").addEventListener("click", () => qs("#sidebar").classList.toggle("mobile-open"));

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

qs("#saveKitBtn").addEventListener("click", async () => {
  const title       = qs("#kitTitle").value.trim();
  const distributor = qs("#kitDistributor").value.trim();
  const city        = qs("#kitCity").value.trim();
  const state       = qs("#kitState").value.trim().toUpperCase();
  const price       = parseFloat(qs("#kitPrice").value);
  const stock       = parseInt(qs("#kitStock").value) || 0;
  const items       = qs("#kitItems").value.split("\n").map(s => s.trim()).filter(Boolean);

  if (!title || !distributor || !city || !state || !price) {
    toast("Preencha os campos obrigatórios.", "error"); return;
  }

  setLoading("#saveKitBtn", "Publicando...");
  try {
    const data = await api("/api/kits", {
      method: "POST",
      body: { title, distributor, city, state, price_cents: Math.round(price * 100), stock, items },
    });
    appData.kits.unshift({ ...data, price: fmtBrl(data.price_cents / 100), stock: data.stock + " unidades" });
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
window.openProfileModal = (tenant) => {
  qs("#profileModalName").textContent     = tenant.name;
  qs("#profileModalRole").textContent     = tenant.role || "";
  const loc = qs("#profileModalLocationText");
  if (loc) loc.textContent = `${tenant.city || ""}${tenant.city && tenant.state ? "/" : ""}${tenant.state || ""}`;
  qs("#profileModalComment").textContent  = tenant.comment || "";
  qs("#profileModalComment").style.display = tenant.comment ? "block" : "none";
  qs("#profileModalTags").innerHTML       = (tenant.permissions || []).map(p => `<span class="tag">${p}</span>`).join("");
  qs("#profileModalRating").innerHTML     = `<span class="stars">${stars(tenant.rating)}</span><span class="rating-val">${Number(tenant.rating || 0).toFixed(1)}</span>`;
  qs("#profileModalInitials").textContent = tenant.initials || (tenant.name || "?")[0].toUpperCase();

  qs("#profileModalChatBtn").onclick = () => {
    qs("#profileModal").close();
    selectedTenantId = tenant.id;
    switchView("chat");
    loadChat();
  };

  qs("#profileModal").showModal();
  lucide.createIcons();
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initAuth();
});
