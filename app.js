// ─── Config ──────────────────────────────────────────────────────────────────
// Em produção a API está no mesmo domínio (/api/...); em dev local aponte para
// o Vercel CLI rodando localmente (vercel dev) ou use um .env com VITE_API_URL.
const API = "https://xvzqsusaaccjeewfsnev.supabase.co";

// ─── State ───────────────────────────────────────────────────────────────────
let leads = [];
let companies = [];
let kits = [];
let users = [];
let activities = [];

const permissions = [
  { label: "Visualizar leads de clientes finais", checked: true },
  { label: "Comprar kits de distribuidores",      checked: true },
  { label: "Publicar kits fotovoltaicos",         checked: true },
  { label: "Comentar e avaliar perfis",           checked: true },
  { label: "Gerenciar usuarios e permissoes",     checked: false },
  { label: "Exportar dados comerciais",           checked: false },
];

// ─── DOM helpers ─────────────────────────────────────────────────────────────
const qs  = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];

function uniqueOptions(items, key, label) {
  return [
    `<option value="">${label}</option>`,
    ...[...new Set(items.map((i) => i[key]))].sort().map(
      (v) => `<option value="${v}">${v}</option>`
    ),
  ].join("");
}

function stars(value) {
  const full = Math.round(value);
  return `${"★".repeat(full)}${"☆".repeat(5 - full)} ${Number(value).toFixed(1)}`;
}

function powerBucket(power) {
  if (power <= 10) return "baixo";
  if (power <= 50) return "medio";
  return "alto";
}

function matchesSearch(text) {
  const term = qs("#globalSearch").value.trim().toLowerCase();
  return !term || text.toLowerCase().includes(term);
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadAll() {
  showLoading(true);
  try {
    [leads, companies, kits, users, activities] = await Promise.all([
      apiFetch("/api/leads"),
      apiFetch("/api/companies"),
      apiFetch("/api/kits"),
      apiFetch("/api/users"),
      apiFetch("/api/activities"),
    ]);
    setupFilters();
    renderAll();
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function showLoading(on) {
  let el = qs("#loadingBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "loadingBanner";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:9999;height:3px;background:linear-gradient(90deg,#1f8f6f,#f5b640);animation:slide 1s linear infinite;";
    document.head.insertAdjacentHTML(
      "beforeend",
      `<style>@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}</style>`
    );
    document.body.prepend(el);
  }
  el.style.display = on ? "block" : "none";
}

function showError(msg) {
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;bottom:18px;right:18px;z-index:9999;padding:12px 18px;border-radius:8px;background:#b94a48;color:#fff;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,.25);";
  banner.textContent = `⚠ ${msg}`;
  document.body.append(banner);
  setTimeout(() => banner.remove(), 5000);
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderStats() {
  qs("#statLeads").textContent   = leads.length;
  qs("#statMembers").textContent = companies.length;
  qs("#statKits").textContent    = kits.length;
}

function renderFunnel() {
  const stages = ["Novo", "Em disputa", "Com proposta"];
  const max = Math.max(...stages.map((s) => leads.filter((l) => l.stage === s).length), 1);
  qs("#funnel").innerHTML = stages.map((stage) => {
    const total = leads.filter((l) => l.stage === stage).length;
    return `
      <div class="funnel-row">
        <strong>${stage}</strong>
        <div class="progress"><span style="width:${(total / max) * 100}%"></span></div>
        <span>${total}</span>
      </div>`;
  }).join("");
}

function renderActivities() {
  qs("#activityList").innerHTML = activities.map(({ title, detail }) => `
    <article class="activity-item">
      <strong>${title}</strong>
      <span>${detail}</span>
    </article>`).join("");
}

function renderLeads() {
  const state = qs("#leadStateFilter").value;
  const power = qs("#leadPowerFilter").value;
  const stages = ["Novo", "Em disputa", "Com proposta"];
  const filtered = leads.filter((lead) => {
    const blob = `${lead.name} ${lead.city} ${lead.state} ${lead.type} ${lead.note}`;
    return (
      (!state || lead.state === state) &&
      (!power || powerBucket(lead.power) === power) &&
      matchesSearch(blob)
    );
  });

  qs("#leadBoard").innerHTML = stages.map((stage) => `
    <div class="lead-column">
      <h3>${stage}</h3>
      ${filtered.filter((l) => l.stage === stage).map((lead) => `
        <article class="lead-card">
          <h3>${lead.name}</h3>
          <p>${lead.note || ""}</p>
          <div class="tag-row">
            <span class="tag">${lead.city}/${lead.state}</span>
            <span class="tag">${lead.power} kWp</span>
            <span class="tag">${lead.type}</span>
          </div>
          <button class="primary-button" type="button">Reservar lead</button>
        </article>`).join("") || `<p class="empty">Nenhum lead nesta etapa.</p>`}
    </div>`).join("");
}

function renderNetwork() {
  const role  = qs("#roleFilter").value;
  const state = qs("#stateFilter").value;
  const filtered = companies.filter((c) => {
    const blob = `${c.name} ${c.role} ${c.city} ${c.state} ${c.comment}`;
    return (!role || c.role === role) && (!state || c.state === state) && matchesSearch(blob);
  });

  qs("#profileGrid").innerHTML = filtered.map((c) => `
    <article class="profile-card">
      <div class="profile-top">
        <span class="avatar">${c.initials}</span>
        <div>
          <h3>${c.name}</h3>
          <span class="tag">${c.role}</span>
        </div>
      </div>
      <div class="rating">${stars(c.rating)}</div>
      <p>${c.city}/${c.state}</p>
      <div class="comment-box">"${c.comment}"</div>
      <div class="tag-row">
        ${(c.permissions || []).map((p) => `<span class="tag">${p}</span>`).join("")}
      </div>
      <button class="primary-button" type="button">Abrir perfil</button>
    </article>`).join("") || `<p class="empty">Nenhuma empresa encontrada.</p>`;
}

function renderKits() {
  qs("#kitGrid").innerHTML = kits
    .filter((k) => matchesSearch(`${k.title} ${k.distributor} ${k.city} ${k.state}`))
    .map((k) => `
      <article class="kit-card">
        <div>
          <span class="eyebrow">${k.distributor}</span>
          <h3>${k.title}</h3>
        </div>
        <span class="kit-price">${k.price}</span>
        <p>${k.city}/${k.state} · ${k.stock}</p>
        <div class="tag-row">
          ${(k.items || []).map((item) => `<span class="tag">${item}</span>`).join("")}
        </div>
        <button class="primary-button" type="button">Solicitar compra</button>
      </article>`).join("");
}

function renderUsers() {
  qs("#userTable").innerHTML = users.map((u) => `
    <div class="user-row">
      <strong>${u.name}</strong>
      <span>${u.email} · ${u.role} · ${u.status}</span>
    </div>`).join("");

  qs("#permissionList").innerHTML = permissions.map((p) => `
    <label class="permission-item">
      <span>${p.label}</span>
      <span class="switch">
        <input type="checkbox" ${p.checked ? "checked" : ""} />
        <span class="slider"></span>
      </span>
    </label>`).join("");
}

function renderAll() {
  renderStats();
  renderFunnel();
  renderActivities();
  renderLeads();
  renderNetwork();
  renderKits();
  renderUsers();
}

// ─── Filters ─────────────────────────────────────────────────────────────────
function setupFilters() {
  qs("#leadStateFilter").innerHTML = uniqueOptions(leads,     "state", "Todos os estados");
  qs("#roleFilter").innerHTML      = uniqueOptions(companies, "role",  "Todos os perfis");
  qs("#stateFilter").innerHTML     = uniqueOptions(companies, "state", "Todos os estados");
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function setupNavigation() {
  qsa(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".nav-item").forEach((i) => i.classList.remove("active"));
      qsa(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      qs(`#${btn.dataset.view}`).classList.add("active");
    });
  });
}

// ─── Modal (novo lead) ───────────────────────────────────────────────────────
function setupModal() {
  const modal = qs("#leadModal");
  qs("#newLeadButton").addEventListener("click", () => modal.showModal());

  qs("#saveLead").addEventListener("click", async () => {
    const name       = qs("#leadName").value.trim();
    const city       = qs("#leadCity").value.trim();
    const state      = qs("#leadState").value.trim().toUpperCase();
    const powerValue = qs("#leadPower").value.match(/\d+/)?.[0];
    if (!name || !city || !state || !powerValue) return;

    try {
      const newLead = await apiFetch("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name,
          city,
          state,
          power: Number(powerValue),
          type:  "Novo cadastro",
          note:  qs("#leadNote").value.trim() || "Lead cadastrado pelo painel comercial.",
        }),
      });

      leads.unshift(newLead);
      setupFilters();
      renderAll();

      // Limpa form
      ["#leadName","#leadCity","#leadState","#leadPower","#leadNote"].forEach(
        (sel) => (qs(sel).value = "")
      );
      modal.close();
    } catch (err) {
      showError("Erro ao salvar lead: " + err.message);
    }
  });
}

// ─── Events ──────────────────────────────────────────────────────────────────
function setupEvents() {
  ["#globalSearch","#leadStateFilter","#leadPowerFilter","#roleFilter","#stateFilter"].forEach((sel) => {
    qs(sel).addEventListener("input",  renderAll);
    qs(sel).addEventListener("change", renderAll);
  });

  qsa(".segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".segmented button").forEach((i) => i.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  qs("#kitButton").addEventListener("click", () => {
    alert("Formulário de publicação de kits: próximo passo para integrar com backend e estoque do distribuidor.");
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
setupNavigation();
setupModal();
setupEvents();
loadAll(); // busca tudo do Supabase via API routes
