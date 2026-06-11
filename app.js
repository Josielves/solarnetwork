// ═══════════════════════════════════════════════════════════════════════════
// iSolar v2 — app.js
// Supabase Auth + Multi-tenant + Dashboard + Pipeline + Network + Marketplace
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://xvzqsusaaccjeewfsnev.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2enFzdXNhYWNjamVld2ZzbmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzNTA4NiwiZXhwIjoyMDk2NTExMDg2fQ.oycjFk28DgIsUezX0g8jkO6Ul4N84lSM9cY8FLoNoxY"; // ← substitua pela sua anon key

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentTenant = null;
let appData = { leads: [], kits: [], activities: [], profiles: [] };

// ─── DOM ─────────────────────────────────────────────────────────────────────
const qs  = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

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

function fmtBrl(cents) {
  if (!cents && cents !== 0) return "–";
  return "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}

function fmtBrlVal(val) {
  if (!val && val !== 0) return "–";
  return "R$ " + Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}

function stars(val) {
  const n = Math.round(Number(val) || 0);
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function powerBucket(p) {
  if (p <= 10) return "baixo";
  if (p <= 50) return "medio";
  return "alto";
}

function slugify(str) {
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function matchSearch(text) {
  const t = (qs("#globalSearch")?.value || "").trim().toLowerCase();
  return !t || text.toLowerCase().includes(t);
}

function switchView(viewId) {
  qsa(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  qsa(".view").forEach(v => v.classList.toggle("active", v.id === "view" + cap(viewId)));
  qs("#pageTitle").textContent = {
    dashboard: "Dashboard", pipeline: "Pipeline", network: "Network",
    marketplace: "Marketplace", whatsapp: "WhatsApp",
    subscription: "Assinatura", admin: "Administração"
  }[viewId] || viewId;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onLogin(session.user);
  } else {
    showAuthScreen();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session) await onLogin(session.user);
    if (event === "SIGNED_OUT") showAuthScreen();
  });
}

function showAuthScreen() {
  qs("#authScreen").classList.remove("hidden");
  qs("#appShell").classList.add("hidden");
}

async function onLogin(user) {
  currentUser = user;
  qs("#authScreen").classList.add("hidden");
  qs("#appShell").classList.remove("hidden");

  await loadTenant();
  await loadAllData();
  renderUI();
  lucide.createIcons();
}

async function loadTenant() {
  const { data, error } = await sb.from("profiles")
    .select("*, tenants(*)")
    .eq("id", currentUser.id)
    .single();
  if (!error && data) {
    currentTenant = data.tenants;
    qs("#userName").textContent  = data.name || currentUser.email.split("@")[0];
    qs("#userAvatar").textContent = (data.name || "?")[0].toUpperCase();
    qs("#userPlan").textContent   = currentTenant?.plan || "Free";
  }
}

// ─── Login ───────────────────────────────────────────────────────────────────
qs("#btnLogin").addEventListener("click", async () => {
  const email = qs("#loginEmail").value.trim();
  const pass  = qs("#loginPassword").value;
  if (!email || !pass) return;
  qs("#btnLogin").textContent = "Entrando…";
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  qs("#btnLogin").innerHTML = "<span>Entrar na plataforma</span>";
  if (error) {
    qs("#loginError").textContent = error.message;
    qs("#loginError").classList.remove("hidden");
  }
});

// ─── Demo ────────────────────────────────────────────────────────────────────
qs("#btnLoginDemo").addEventListener("click", async () => {
  qs("#btnLoginDemo").textContent = "Carregando demo…";
  const { error } = await sb.auth.signInWithPassword({
    email: "demo@isolar.com", password: "demo123456"
  });
  if (error) {
    // Tenta criar a conta demo se não existir
    await sb.auth.signUp({ email: "demo@isolar.com", password: "demo123456",
      options: { data: { name: "Demo User", tenant_id: "00000000-0000-0000-0000-000000000001" }}
    });
    await sb.auth.signInWithPassword({ email: "demo@isolar.com", password: "demo123456" });
  }
  qs("#btnLoginDemo").textContent = "Acessar demo sem cadastro";
});

// ─── Signup ──────────────────────────────────────────────────────────────────
qs("#btnSignup").addEventListener("click", async () => {
  const company  = qs("#signupCompany").value.trim();
  const name     = qs("#signupName").value.trim();
  const email    = qs("#signupEmail").value.trim();
  const pass     = qs("#signupPassword").value;
  const role     = qs("#signupRole").value;
  if (!company || !name || !email || !pass) {
    qs("#signupError").textContent = "Preencha todos os campos.";
    qs("#signupError").classList.remove("hidden");
    return;
  }

  qs("#btnSignup").textContent = "Criando conta…";

  // 1. Cria tenant
  const { data: tenant, error: tErr } = await sb.from("tenants")
    .insert({ name: company, slug: slugify(company), role,
              initials: company.slice(0,2).toUpperCase(), plan: "free" })
    .select().single();

  if (tErr) {
    qs("#signupError").textContent = tErr.message;
    qs("#signupError").classList.remove("hidden");
    qs("#btnSignup").textContent = "Criar conta grátis";
    return;
  }

  // 2. Cria usuário Auth com tenant_id nos metadados
  const { error: uErr } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name, tenant_id: tenant.id } }
  });

  qs("#btnSignup").textContent = "Criar conta grátis";
  if (uErr) {
    qs("#signupError").textContent = uErr.message;
    qs("#signupError").classList.remove("hidden");
  } else {
    toast("Conta criada! Verifique seu e-mail.", "success");
  }
});

// ─── Logout ──────────────────────────────────────────────────────────────────
qs("#btnLogout").addEventListener("click", async () => {
  await sb.auth.signOut();
});

// ─── Auth tabs ───────────────────────────────────────────────────────────────
qsa(".auth-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    qsa(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    qsa(".auth-form").forEach(f => f.classList.toggle("active", f.id === "tab" + cap(tab)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════
async function loadAllData() {
  if (!currentTenant) return;
  const tid = currentTenant.id;

  const [leads, kits, activities, profiles] = await Promise.all([
    sb.from("leads").select("*").eq("tenant_id", tid).order("created_at", { ascending: false }),
    sb.from("kits").select("*").order("price_cents"),
    sb.from("activities").select("*").eq("tenant_id", tid).order("created_at", { ascending: false }).limit(20),
    sb.from("profiles").select("*").eq("tenant_id", tid),
  ]);

  appData.leads      = leads.data      || [];
  appData.kits       = kits.data       || [];
  appData.activities = activities.data || [];
  appData.profiles   = profiles.data   || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════════
function renderUI() {
  renderDashboard();
  renderKanban();
  renderNetwork();
  renderMarketplace();
  renderAdmin();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
let chartInstance = null;
function renderDashboard() {
  const leads = appData.leads;
  const kits  = appData.kits;

  // KPIs
  const totalKwp = leads.reduce((s, l) => s + Number(l.power || 0), 0);
  const closed   = leads.filter(l => l.stage === "Fechado").length;
  const conv     = leads.length ? Math.round((closed / leads.length) * 100) : 0;

  qs("#kpiLeads").textContent    = leads.length;
  qs("#kpiKwp").textContent      = totalKwp.toFixed(0) + " kWp";
  qs("#kpiConv").textContent     = conv + "%";
  qs("#kpiMrr").textContent      = currentTenant?.plan === "pro" ? "R$ 297" : "R$ 0";
  qs("#kpiMrrDelta").textContent = "+14% este mês";
  qs("#kpiLeadsDelta").textContent = leads.length + " no pipeline";
  qs("#kpiKwpDelta").textContent = "em " + leads.length + " projetos";
  qs("#kpiConvDelta").className  = "kpi-delta " + (conv > 25 ? "positive" : "");

  // Funnel
  const stages = ["Novo","Contato","Proposta","Negociação","Fechado"];
  const maxStage = Math.max(...stages.map(s => leads.filter(l => l.stage === s).length), 1);
  qs("#funnelList").innerHTML = stages.map(stage => {
    const n = leads.filter(l => l.stage === stage).length;
    const pct = (n / maxStage) * 100;
    return `<div class="funnel-row">
      <div>
        <div class="funnel-label">${stage}</div>
        <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="funnel-count">${n}</div>
    </div>`;
  }).join("");

  // Activity feed
  qs("#activityFeed").innerHTML = appData.activities.slice(0, 8).map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.type || 'info'}"></div>
      <div class="activity-text">
        <strong>${a.title}</strong>
        <span>${a.detail || ""}</span>
      </div>
    </div>`).join("") || '<p style="color:var(--muted);padding:12px;font-size:13px">Nenhuma atividade.</p>';

  // Top kits
  qs("#topKits").innerHTML = kits.slice(0, 4).map(k => `
    <div class="kit-row">
      <div>
        <div class="kit-row-name">${k.title}</div>
        <div style="font-size:11px;color:var(--muted)">${k.distributor}</div>
      </div>
      <div class="kit-row-price">${fmtBrl(k.price_cents)}</div>
    </div>`).join("") || '<p style="color:var(--muted);font-size:13px">Nenhum kit.</p>';

  // Chart — leads por mês (simulado para MVP)
  const ctx = qs("#chartLeads");
  if (chartInstance) chartInstance.destroy();
  const isDark = document.documentElement.dataset.theme === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const textColor = isDark ? "#6e7f95" : "#7a8fa6";

  const months = ["Jan","Fev","Mar","Abr","Mai","Jun"];
  // Distribui leads reais pelos últimos 6 meses de forma simplificada
  const base = Math.max(1, Math.floor(leads.length / 6));
  const data = months.map((_, i) => base + Math.floor(Math.random() * base));
  data[5] = leads.length; // mês atual = total real

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [{
        label: "Leads",
        data,
        backgroundColor: "rgba(22,163,74,0.15)",
        borderColor: "#16a34a",
        borderWidth: 2,
        borderRadius: 6,
      }, {
        label: "Fechados",
        data: data.map(v => Math.round(v * conv / 100)),
        backgroundColor: "rgba(245,166,35,0.2)",
        borderColor: "#f5a623",
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor, font: { size: 12 } } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });
}

// ─── KANBAN ───────────────────────────────────────────────────────────────────
function renderKanban() {
  const stages = ["Novo","Contato","Proposta","Negociação","Fechado","Perdido"];
  const stateF = qs("#pipelineStateFilter")?.value || "";
  const powerF = qs("#pipelinePowerFilter")?.value || "";
  const search = (qs("#globalSearch")?.value || "").toLowerCase().trim();

  const filtered = appData.leads.filter(l => {
    const blob = `${l.name} ${l.city} ${l.state} ${l.type} ${l.note || ""}`.toLowerCase();
    return (!stateF || l.state === stateF) &&
           (!powerF || powerBucket(l.power) === powerF) &&
           (!search || blob.includes(search));
  });

  qs("#kanbanBoard").innerHTML = stages.map(stage => {
    const cards = filtered.filter(l => l.stage === stage);
    return `<div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${stage}</span>
        <span class="kanban-count">${cards.length}</span>
      </div>
      <div class="kanban-cards">
        ${cards.map(lead => `
          <div class="lead-card" data-id="${lead.id}">
            <div class="lead-card-title">${lead.name}</div>
            <div class="lead-card-note">${lead.note || ""}</div>
            <div class="lead-card-tags">
              <span class="tag">${lead.city}/${lead.state}</span>
              <span class="tag yellow">${lead.power} kWp</span>
              <span class="tag">${lead.type}</span>
            </div>
            <div class="lead-card-footer">
              <span class="lead-card-value">${lead.value_brl ? fmtBrlVal(lead.value_brl) : "–"}</span>
              <button class="icon-btn" onclick="moveLeadStage('${lead.id}', '${stage}')" title="Mover etapa">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>`).join("") || `<div class="kanban-empty">Nenhum lead</div>`}
      </div>
    </div>`;
  }).join("");

  // Populate state filter
  const states = [...new Set(appData.leads.map(l => l.state))].sort();
  const stFilter = qs("#pipelineStateFilter");
  if (stFilter && stFilter.options.length <= 1) {
    states.forEach(s => stFilter.add(new Option(s, s)));
  }
}

async function moveLeadStage(leadId, currentStage) {
  const stages = ["Novo","Contato","Proposta","Negociação","Fechado","Perdido"];
  const idx = stages.indexOf(currentStage);
  const nextStage = stages[(idx + 1) % stages.length];

  const { error } = await sb.from("leads")
    .update({ stage: nextStage, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (!error) {
    const lead = appData.leads.find(l => l.id === leadId);
    if (lead) lead.stage = nextStage;
    renderKanban();
    renderDashboard();
    toast(`Lead movido para ${nextStage}`);
  }
}

// ─── NETWORK ─────────────────────────────────────────────────────────────────
async function renderNetwork() {
  const roleF  = qs("#networkRoleFilter")?.value  || "";
  const stateF = qs("#networkStateFilter")?.value || "";

  const { data: tenants } = await sb.from("tenants").select("*").order("rating", { ascending: false });
  const list = (tenants || []).filter(t => {
    const blob = `${t.name} ${t.role} ${t.city || ""} ${t.state || ""} ${t.comment || ""}`;
    return (!roleF || t.role === roleF) && (!stateF || t.state === stateF) && matchSearch(blob);
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
        <span class="rating-val">${Number(t.rating || 0).toFixed(1)}</span>
      </div>
      <p style="font-size:12px">${t.city || ""}${t.city && t.state ? "/" : ""}${t.state || ""}</p>
      ${t.comment ? `<div class="comment-box">${t.comment}</div>` : ""}
      <div class="tag-row">
        ${(t.permissions || []).map(p => `<span class="tag">${p}</span>`).join("")}
      </div>
      <button class="btn-primary" style="margin-top:4px;width:100%;justify-content:center">Abrir perfil</button>
    </article>`).join("") || '<p style="color:var(--muted)">Nenhuma empresa encontrada.</p>';

  // Populate filters
  const roleFilter  = qs("#networkRoleFilter");
  const stateFilter = qs("#networkStateFilter");
  if (roleFilter && roleFilter.options.length <= 1) {
    [...new Set((tenants || []).map(t => t.role))].sort().forEach(r => roleFilter.add(new Option(r, r)));
  }
  if (stateFilter && stateFilter.options.length <= 1) {
    [...new Set((tenants || []).map(t => t.state).filter(Boolean))].sort().forEach(s => stateFilter.add(new Option(s, s)));
  }
}

// ─── MARKETPLACE ─────────────────────────────────────────────────────────────
function renderMarketplace() {
  const search = (qs("#kitSearch")?.value || "").toLowerCase().trim();
  const kits = appData.kits.filter(k =>
    matchSearch(`${k.title} ${k.distributor} ${k.city} ${k.state}`) &&
    (!search || `${k.title} ${k.distributor}`.toLowerCase().includes(search))
  );

  qs("#kitGrid").innerHTML = kits.map(k => `
    <article class="kit-card">
      <div>
        <div class="kit-distributor">${k.distributor}</div>
        <div class="kit-title">${k.title}</div>
      </div>
      <div class="kit-price">${fmtBrl(k.price_cents)}</div>
      <div class="kit-meta">${k.city}/${k.state}</div>
      <div class="kit-stock">${k.stock} unidades em estoque</div>
      <div class="tag-row">
        ${(k.items || []).map(item => `<span class="tag">${item}</span>`).join("")}
      </div>
      <button class="btn-primary" style="width:100%;justify-content:center;margin-top:4px">Solicitar compra</button>
    </article>`).join("") || '<p style="color:var(--muted)">Nenhum kit disponível.</p>';
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function renderAdmin() {
  qs("#userTable").innerHTML = appData.profiles.map(p => `
    <div class="user-row">
      <strong>${p.name}</strong>
      <span>${p.email} · ${p.role}</span>
    </div>`).join("") || '<p style="color:var(--muted);font-size:13px">Nenhum usuário.</p>';

  const perms = [
    { label: "Visualizar leads de clientes finais", checked: true },
    { label: "Comprar kits de distribuidores",      checked: true },
    { label: "Publicar kits fotovoltaicos",         checked: true },
    { label: "Comentar e avaliar perfis",           checked: true },
    { label: "Gerenciar usuários e permissões",     checked: false },
    { label: "Exportar dados comerciais",           checked: false },
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

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MODAL
// ═══════════════════════════════════════════════════════════════════════════
function openLeadModal() { qs("#leadModal").showModal(); }

qs("#newLeadBtn").addEventListener("click",  openLeadModal);
qs("#newLeadBtn2").addEventListener("click", openLeadModal);
qs("#closeLeadModal").addEventListener("click",  () => qs("#leadModal").close());
qs("#cancelLeadModal").addEventListener("click", () => qs("#leadModal").close());

qs("#saveLeadBtn").addEventListener("click", async () => {
  if (!currentTenant) return;
  const name  = qs("#leadName").value.trim();
  const city  = qs("#leadCity").value.trim();
  const state = qs("#leadState").value.trim().toUpperCase();
  const power = parseFloat(qs("#leadPower").value);
  if (!name || !city || !state || !power) {
    toast("Preencha os campos obrigatórios.", "error"); return;
  }

  qs("#saveLeadBtn").textContent = "Salvando…";
  const { data, error } = await sb.from("leads").insert({
    tenant_id: currentTenant.id,
    name, city, state, power,
    type:  qs("#leadType").value,
    note:  qs("#leadNote").value.trim(),
    value_brl: parseFloat(qs("#leadValue").value) || null,
    contact_name:  qs("#leadContact").value.trim(),
    contact_phone: qs("#leadPhone").value.trim(),
    stage: "Novo",
  }).select().single();

  qs("#saveLeadBtn").innerHTML = '<i data-lucide="save"></i> Salvar lead';
  lucide.createIcons();

  if (error) { toast(error.message, "error"); return; }

  appData.leads.unshift(data);
  qs("#leadModal").close();
  ["#leadName","#leadCity","#leadState","#leadPower","#leadNote","#leadValue","#leadContact","#leadPhone"]
    .forEach(s => qs(s).value = "");
  renderDashboard();
  renderKanban();
  toast("Lead salvo com sucesso!");
});

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
qsa(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    switchView(btn.dataset.view);
    // Re-render on switch
    if (btn.dataset.view === "network")      renderNetwork();
    if (btn.dataset.view === "marketplace")  renderMarketplace();
    if (btn.dataset.view === "dashboard")    renderDashboard();
    if (btn.dataset.view === "pipeline")     renderKanban();
    // Close mobile sidebar
    qs("#sidebar").classList.remove("mobile-open");
  });
});

// ─── Sidebar toggle ───────────────────────────────────────────────────────────
qs("#sidebarToggle").addEventListener("click", () => {
  qs("#appShell").classList.toggle("collapsed");
});
qs("#mobileMenuBtn").addEventListener("click", () => {
  qs("#sidebar").classList.toggle("mobile-open");
});

// ─── Filters ──────────────────────────────────────────────────────────────────
["#pipelineStateFilter","#pipelinePowerFilter"].forEach(s => {
  qs(s)?.addEventListener("change", renderKanban);
});
["#networkRoleFilter","#networkStateFilter"].forEach(s => {
  qs(s)?.addEventListener("change", renderNetwork);
});
qs("#kitSearch")?.addEventListener("input", renderMarketplace);
qs("#globalSearch")?.addEventListener("input", () => {
  renderKanban(); renderNetwork(); renderMarketplace();
});

// ─── Theme toggle ─────────────────────────────────────────────────────────────
qs("#themeToggle").addEventListener("click", () => {
  const html  = document.documentElement;
  const isDark = html.dataset.theme === "dark";
  html.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem("isolar-theme", html.dataset.theme);
  lucide.createIcons();
  // Redraw chart with new colors
  if (appData.leads.length >= 0) renderDashboard();
});

// Apply saved theme
const savedTheme = localStorage.getItem("isolar-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

// ─── Publish kit ──────────────────────────────────────────────────────────────
qs("#publishKitBtn").addEventListener("click", () => {
  toast("Publicação de kits: em breve!", "success");
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initAuth();
});
