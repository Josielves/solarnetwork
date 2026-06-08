const leads = [
  { name: "Condominio Vista Verde", city: "Campinas", state: "SP", power: 42, stage: "Novo", type: "Residencial coletivo", note: "Busca reducao de conta e financiamento em 60x." },
  { name: "Mercado Estrela", city: "Ribeirao Preto", state: "SP", power: 68, stage: "Em disputa", type: "Comercial", note: "Telhado metalico, decisao prevista para esta semana." },
  { name: "Fazenda Boa Luz", city: "Uberlandia", state: "MG", power: 115, stage: "Com proposta", type: "Rural", note: "Precisa de estudo de solo e estrutura de solo." },
  { name: "Padaria Sol Nascente", city: "Curitiba", state: "PR", power: 18, stage: "Novo", type: "Comercial", note: "Cliente quer payback menor que 4 anos." },
  { name: "Clínica Amaral", city: "Goiania", state: "GO", power: 26, stage: "Em disputa", type: "Saude", note: "Tem demanda por backup para cargas criticas." },
  { name: "Galpao Jatoba", city: "Fortaleza", state: "CE", power: 91, stage: "Com proposta", type: "Industrial", note: "Precisa comparar kit string e microinversor." }
];

const companies = [
  { name: "SolPrime Energia", role: "Integrador", city: "Campinas", state: "SP", rating: 4.8, initials: "SP", comment: "Equipe rapida no atendimento e pos-venda organizado.", permissions: ["leads", "kits", "network"] },
  { name: "Nexo Solar Projetos", role: "Engenharia", city: "Belo Horizonte", state: "MG", rating: 4.9, initials: "NS", comment: "Memoriais e homologacoes sem retrabalho.", permissions: ["network", "projects"] },
  { name: "VoltSul Distribuidora", role: "Distribuidor", city: "Curitiba", state: "PR", rating: 4.7, initials: "VS", comment: "Boa disponibilidade de inversores e entrega previsivel.", permissions: ["kits", "network"] },
  { name: "Alfa FV Instalacoes", role: "Integrador", city: "Goiania", state: "GO", rating: 4.5, initials: "AF", comment: "Atua bem em projetos comerciais de medio porte.", permissions: ["leads", "kits", "network"] },
  { name: "EngSol Consultoria", role: "Engenharia", city: "Fortaleza", state: "CE", rating: 4.6, initials: "ES", comment: "Especialistas em usinas de solo e laudos tecnicos.", permissions: ["network", "projects"] },
  { name: "Brasil PV Supply", role: "Distribuidor", city: "Ribeirao Preto", state: "SP", rating: 4.4, initials: "BP", comment: "Kits competitivos para residenciais e pequenos comercios.", permissions: ["kits", "network"] }
];

const kits = [
  { title: "Kit Residencial 6,6 kWp", distributor: "Brasil PV Supply", city: "Ribeirao Preto", state: "SP", price: "R$ 12.890", items: ["12 modulos 550 W", "Inversor 6 kW", "String box CA/CC"], stock: "34 unidades" },
  { title: "Kit Comercial 25 kWp", distributor: "VoltSul Distribuidora", city: "Curitiba", state: "PR", price: "R$ 52.400", items: ["46 modulos TOPCon", "Inversor 25 kW", "Estrutura metalica"], stock: "12 unidades" },
  { title: "Kit Solo 75 kWp", distributor: "Brasil PV Supply", city: "Campinas", state: "SP", price: "R$ 168.900", items: ["136 modulos bifaciais", "3 inversores 25 kW", "Estrutura solo"], stock: "5 unidades" }
];

const users = [
  { name: "Marina Costa", email: "admin@isolar.com", role: "Administrador", status: "Ativo" },
  { name: "Rafael Lima", email: "rafael@solprime.com", role: "Integrador", status: "Assinante" },
  { name: "Bianca Torres", email: "bianca@nexosolar.com", role: "Engenharia", status: "Ativo" },
  { name: "Eduardo Reis", email: "eduardo@voltsul.com", role: "Distribuidor", status: "Pendente" }
];

const permissions = [
  { label: "Visualizar leads de clientes finais", checked: true },
  { label: "Comprar kits de distribuidores", checked: true },
  { label: "Publicar kits fotovoltaicos", checked: true },
  { label: "Comentar e avaliar perfis", checked: true },
  { label: "Gerenciar usuarios e permissoes", checked: false },
  { label: "Exportar dados comerciais", checked: false }
];

const activities = [
  ["Lead novo recebido", "Condominio Vista Verde entrou no funil em Campinas, SP."],
  ["Kit atualizado", "VoltSul publicou nova condicao para 25 kWp."],
  ["Avaliacao registrada", "SolPrime recebeu 5 estrelas de um cliente final."],
  ["Parceria iniciada", "Nexo Solar aceitou cotar projeto para Alfa FV."]
];

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => [...document.querySelectorAll(selector)];

function uniqueOptions(items, key, label) {
  return [`<option value="">${label}</option>`, ...[...new Set(items.map((item) => item[key]))].sort().map((value) => `<option value="${value}">${value}</option>`)].join("");
}

function stars(value) {
  const full = Math.round(value);
  return `${"★".repeat(full)}${"☆".repeat(5 - full)} ${value.toFixed(1)}`;
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

function renderStats() {
  qs("#statLeads").textContent = leads.length;
  qs("#statMembers").textContent = companies.length;
  qs("#statKits").textContent = kits.length;
}

function renderFunnel() {
  const stages = ["Novo", "Em disputa", "Com proposta"];
  const max = Math.max(...stages.map((stage) => leads.filter((lead) => lead.stage === stage).length), 1);
  qs("#funnel").innerHTML = stages.map((stage) => {
    const total = leads.filter((lead) => lead.stage === stage).length;
    return `
      <div class="funnel-row">
        <strong>${stage}</strong>
        <div class="progress"><span style="width:${(total / max) * 100}%"></span></div>
        <span>${total}</span>
      </div>
    `;
  }).join("");
}

function renderActivities() {
  qs("#activityList").innerHTML = activities.map(([title, detail]) => `
    <article class="activity-item">
      <strong>${title}</strong>
      <span>${detail}</span>
    </article>
  `).join("");
}

function renderLeads() {
  const state = qs("#leadStateFilter").value;
  const power = qs("#leadPowerFilter").value;
  const stages = ["Novo", "Em disputa", "Com proposta"];
  const filtered = leads.filter((lead) => {
    const blob = `${lead.name} ${lead.city} ${lead.state} ${lead.type} ${lead.note}`;
    return (!state || lead.state === state) && (!power || powerBucket(lead.power) === power) && matchesSearch(blob);
  });

  qs("#leadBoard").innerHTML = stages.map((stage) => `
    <div class="lead-column">
      <h3>${stage}</h3>
      ${filtered.filter((lead) => lead.stage === stage).map((lead) => `
        <article class="lead-card">
          <h3>${lead.name}</h3>
          <p>${lead.note}</p>
          <div class="tag-row">
            <span class="tag">${lead.city}/${lead.state}</span>
            <span class="tag">${lead.power} kWp</span>
            <span class="tag">${lead.type}</span>
          </div>
          <button class="primary-button" type="button">Reservar lead</button>
        </article>
      `).join("") || `<p class="empty">Nenhum lead nesta etapa.</p>`}
    </div>
  `).join("");
}

function renderNetwork() {
  const role = qs("#roleFilter").value;
  const state = qs("#stateFilter").value;
  const filtered = companies.filter((company) => {
    const blob = `${company.name} ${company.role} ${company.city} ${company.state} ${company.comment}`;
    return (!role || company.role === role) && (!state || company.state === state) && matchesSearch(blob);
  });

  qs("#profileGrid").innerHTML = filtered.map((company) => `
    <article class="profile-card">
      <div class="profile-top">
        <span class="avatar">${company.initials}</span>
        <div>
          <h3>${company.name}</h3>
          <span class="tag">${company.role}</span>
        </div>
      </div>
      <div class="rating">${stars(company.rating)}</div>
      <p>${company.city}/${company.state}</p>
      <div class="comment-box">"${company.comment}"</div>
      <div class="tag-row">
        ${company.permissions.map((permission) => `<span class="tag">${permission}</span>`).join("")}
      </div>
      <button class="primary-button" type="button">Abrir perfil</button>
    </article>
  `).join("") || `<p class="empty">Nenhuma empresa encontrada.</p>`;
}

function renderKits() {
  qs("#kitGrid").innerHTML = kits.filter((kit) => matchesSearch(`${kit.title} ${kit.distributor} ${kit.city} ${kit.state}`)).map((kit) => `
    <article class="kit-card">
      <div>
        <span class="eyebrow">${kit.distributor}</span>
        <h3>${kit.title}</h3>
      </div>
      <span class="kit-price">${kit.price}</span>
      <p>${kit.city}/${kit.state} · ${kit.stock}</p>
      <div class="tag-row">
        ${kit.items.map((item) => `<span class="tag">${item}</span>`).join("")}
      </div>
      <button class="primary-button" type="button">Solicitar compra</button>
    </article>
  `).join("");
}

function renderUsers() {
  qs("#userTable").innerHTML = users.map((user) => `
    <div class="user-row">
      <strong>${user.name}</strong>
      <span>${user.email} · ${user.role} · ${user.status}</span>
    </div>
  `).join("");

  qs("#permissionList").innerHTML = permissions.map((permission) => `
    <label class="permission-item">
      <span>${permission.label}</span>
      <span class="switch">
        <input type="checkbox" ${permission.checked ? "checked" : ""} />
        <span class="slider"></span>
      </span>
    </label>
  `).join("");
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

function setupFilters() {
  qs("#leadStateFilter").innerHTML = uniqueOptions(leads, "state", "Todos os estados");
  qs("#roleFilter").innerHTML = uniqueOptions(companies, "role", "Todos os perfis");
  qs("#stateFilter").innerHTML = uniqueOptions(companies, "state", "Todos os estados");
}

function setupNavigation() {
  qsa(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      qsa(".nav-item").forEach((item) => item.classList.remove("active"));
      qsa(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      qs(`#${button.dataset.view}`).classList.add("active");
    });
  });
}

function setupModal() {
  const modal = qs("#leadModal");
  qs("#newLeadButton").addEventListener("click", () => modal.showModal());
  qs("#saveLead").addEventListener("click", () => {
    const name = qs("#leadName").value.trim();
    const city = qs("#leadCity").value.trim();
    const state = qs("#leadState").value.trim().toUpperCase();
    const powerValue = qs("#leadPower").value.match(/\d+/)?.[0];
    if (!name || !city || !state || !powerValue) return;

    leads.unshift({
      name,
      city,
      state,
      power: Number(powerValue),
      stage: "Novo",
      type: "Novo cadastro",
      note: qs("#leadNote").value.trim() || "Lead cadastrado pelo painel comercial."
    });

    setupFilters();
    renderAll();
    qs("#leadName").value = "";
    qs("#leadCity").value = "";
    qs("#leadState").value = "";
    qs("#leadPower").value = "";
    qs("#leadNote").value = "";
  });
}

function setupEvents() {
  ["#globalSearch", "#leadStateFilter", "#leadPowerFilter", "#roleFilter", "#stateFilter"].forEach((selector) => {
    qs(selector).addEventListener("input", renderAll);
    qs(selector).addEventListener("change", renderAll);
  });

  qsa(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      qsa(".segmented button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  qs("#kitButton").addEventListener("click", () => {
    alert("Formulario de publicacao de kits: proximo passo para integrar com backend e estoque do distribuidor.");
  });
}

setupFilters();
setupNavigation();
setupModal();
setupEvents();
renderAll();
