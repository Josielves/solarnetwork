// ═══════════════════════════════════════════════════════════════════════════
// iSolar v3 — app.js  (frontend completo)
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://xvzqsusaaccjeewfsnev.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2enFzdXNhYWNjamVld2ZzbmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzNTA4NiwiZXhwIjoyMDk2NTExMDg2fQ.oycjFk28DgIsUezX0g8jkO6Ul4N84lSM9cY8FLoNoxY"; // ← sua anon key
const BACKEND_URL       = "solarnetwork-production.up.railway.app"; // ← ex: https://isolar-backend.up.railway.app

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
    marketplace: "Marketplace", whatsapp: "WhatsApp",
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
  await loadTenant();
  await loadAllData();
  renderUI();
  lucide.createIcons();
  showLoading(false);
}

async function loadTenant() {
  const { data } = await sb.from("profiles")
    .select("*, tenants(*)")
    .eq("id", currentUser.id)
    .single();
  if (data) {
    currentTenant = data.tenants;
    qs("#userName").textContent  = data.name || currentUser.email.split("@")[0];
    qs("#userAvatar").textContent = (data.name || "?")[0].toUpperCase();
    qs("#userPlan").textContent   = currentTenant?.plan || "Free";
  }
}

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
      <button class="btn-primary" style="width:100%;justify-content:center">Abrir perfil</button>
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
    if (status === "connecting" && qr) showQR(qr);
  } catch (e) { console.warn("WA status:", e.message); }
}

function updateWABadge(status, phone) {
  const badge = qs("#waBadge");
  if (status === "connected") {
    badge.className = "wa-badge connected";
    badge.innerHTML = `<i data-lucide="wifi"></i> Conectado${phone ? ` · ${phone}` : ""}`;
    qs("#waConnectBtn").textContent = "Desconectar";
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
  let qrEl = qs("#waQR");
  if (!qrEl) {
    qrEl = document.createElement("img");
    qrEl.id = "waQR";
    qrEl.style.cssText = "display:block;width:220px;height:220px;border-radius:12px;margin:16px auto;border:4px solid var(--border)";
    qs(".wa-status").appendChild(qrEl);
  }
  qrEl.src = qrDataUrl;
}

async function connectWA() {
  qs("#waConnectBtn").textContent = "Aguardando QR…";
  const evtSource = new EventSource(`${BACKEND_URL}/api/whatsapp/connect`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  // EventSource doesn't support custom headers natively; use fetch SSE instead
  evtSource.close();

  // Fallback: POST to connect then poll status
  try {
    await fetch(`${BACKEND_URL}/api/whatsapp/connect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    }).then(async res => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data:"));
        for (const line of lines) {
          const payload = JSON.parse(line.replace("data: ", ""));
          if (payload.type === "qr")        showQR(payload.qr);
          if (payload.type === "connected") { updateWABadge("connected", payload.phone); toast("WhatsApp conectado!"); return; }
          if (payload.type === "timeout")   { toast("QR expirou. Tente novamente.", "error"); return; }
        }
      }
    });
  } catch (e) { toast("Erro ao conectar: " + e.message, "error"); }
}

async function disconnectWA() {
  if (!confirm("Desconectar WhatsApp?")) return;
  try {
    await api("/api/whatsapp/disconnect", { method: "POST" });
    updateWABadge("disconnected");
    qs("#waQR")?.remove();
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
            <div class="activity-dot ${m.direction === 'in' ? 'lead' : 'kit'}"></div>
            <div class="activity-text">
              <strong>${m.direction === 'in' ? m.from_jid : 'Você → ' + m.to_jid}</strong>
              <span>${m.body}</span>
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
function renderAdmin() {
  const { data: profiles } = sb.from("profiles").select("*").eq("tenant_id", currentTenant?.id) || { data: [] };

  // Mostra o usuário atual por enquanto
  qs("#userTable").innerHTML = `
    <div class="user-row">
      <strong>${qs("#userName").textContent}</strong>
      <span>${currentUser?.email} · owner</span>
    </div>`;

  const perms = [
    { label: "Visualizar leads",          checked: true  },
    { label: "Comprar kits",              checked: true  },
    { label: "Publicar kits",             checked: true  },
    { label: "Comentar e avaliar perfis", checked: true  },
    { label: "Gerenciar usuários",        checked: false },
    { label: "Exportar dados",            checked: false },
  ];
  qs("#permissionList").innerHTML = perms.map(p => `
    <label class="permission-item">
      <span>${p.label}</span>
      <span class="switch">
        <input type="checkbox" ${p.checked ? "checked" : ""}/>
        <span class="slider"></span>
      </span>
    </label>`).join("");

  if (currentTenant) {
    qs("#settingName").value  = currentTenant.name  || "";
    qs("#settingCity").value  = currentTenant.city  || "";
    qs("#settingState").value = currentTenant.state || "";
  }
}

// ─── Save tenant settings ─────────────────────────────────────────────────────
qs("#viewAdmin")?.querySelector(".btn-primary")?.addEventListener("click", async () => {
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

// Publish kit
qs("#publishKitBtn").addEventListener("click", () => toast("Publicação de kits: em breve!"));

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initAuth();
});
