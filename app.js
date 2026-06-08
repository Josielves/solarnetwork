// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Substitua pelos valores do seu projeto Supabase:
//   Project Settings → API → URL e anon/public key
const supabaseUrl = 'https://rbuqlwdyrcteebkhusjo.supabase.co'
const supabaseKey = 'sb_publishable_lR67D95YfJiLHi86HXw-uw_skQJFMNZ'

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey)

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "eletrica", label: "Elétrica" },
  { id: "mecanica", label: "Mecânica" },
  { id: "hidraulica", label: "Hidráulica" },
  { id: "pneumatica", label: "Pneumática" },
];

const SESSION_KEY = "industrial-equipment-crm-session";

const ROLE_LABELS = {
  admin: "Administrador",
  tecnico: "Técnico",
  consulta: "Consulta",
};

const ROLE_PERMISSIONS = {
  admin: { write: true, delete: true, manageUsers: true },
  tecnico: { write: true, delete: false, manageUsers: false },
  consulta: { write: false, delete: false, manageUsers: false },
};

const defaultData = {
  equipments: [
    {
      id: crypto.randomUUID(),
      name: "Prensa hidráulica 220T",
      manufacturer: "Atlas Industrial",
      model: "PH-220X",
      photo: "",
      specs:
        "Capacidade: 220 toneladas\nTensão: 380 V trifásico\nPressão nominal: 210 bar\nCurso útil: 500 mm",
      criticalPoints: "",
      peripherals: {
        eletrica: [
          {
            id: crypto.randomUUID(),
            name: "Inversor de frequência",
            manufacturer: "WEG",
            model: "CFW500",
            photo: "",
            specs: "Potência: 15 cv\nEntrada: 380 V\nComunicação: Modbus RTU",
          },
        ],
        mecanica: [
          {
            id: crypto.randomUUID(),
            name: "Conjunto de guias lineares",
            manufacturer: "THK",
            model: "HSR35",
            photo: "",
            specs: "Carga dinâmica: 49 kN\nLubrificação: graxa industrial EP2",
          },
        ],
        hidraulica: [
          {
            id: crypto.randomUUID(),
            name: "Bomba hidráulica",
            manufacturer: "Parker",
            model: "PVP3336",
            photo: "",
            specs: "Vazão: 98 L/min\nPressão máxima: 250 bar\nRotação: 1800 rpm",
          },
        ],
        pneumatica: [],
      },
    },
  ],
  stockItems: [],
  preventives: [],
  correctives: [],
  engineeringLogics: [],
  users: [
    {
      id: crypto.randomUUID(),
      name: "Administrador",
      username: "admin",
      password: "admin123",
      role: "admin",
    },
  ],
};

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let data = structuredClone(defaultData);
let state = {
  currentUserId: sessionStorage.getItem(SESSION_KEY),
  currentView: "equipments",
  selectedEquipmentId: null,
  selectedCategory: "eletrica",
  editingEquipmentId: null,
  editingComponent: null,
  editingStockId: null,
  editingPreventiveId: null,
  editingCorrectiveId: null,
  editingEngineeringId: null,
  editingUserId: null,
  _equipmentSearch: "",
};

// ─── REFERÊNCIAS DOM ──────────────────────────────────────────────────────────
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const crmApp = document.querySelector("#crmApp");
const viewRoot = document.querySelector("#viewRoot");
const equipmentList = document.querySelector("#equipmentList");
const equipmentCount = document.querySelector("#equipmentCount");
const searchInput = document.querySelector("#searchInput");
const currentUserLabel = document.querySelector("#currentUserLabel");

const equipmentDialog = document.querySelector("#equipmentDialog");
const equipmentForm = document.querySelector("#equipmentForm");
const equipmentDialogTitle = document.querySelector("#equipmentDialogTitle");
const componentDialog = document.querySelector("#componentDialog");
const componentForm = document.querySelector("#componentForm");
const componentDialogTitle = document.querySelector("#componentDialogTitle");
const componentCategoryLabel = document.querySelector("#componentCategoryLabel");
const stockDialog = document.querySelector("#stockDialog");
const stockForm = document.querySelector("#stockForm");
const stockDialogTitle = document.querySelector("#stockDialogTitle");
const preventiveDialog = document.querySelector("#preventiveDialog");
const preventiveForm = document.querySelector("#preventiveForm");
const preventiveDialogTitle = document.querySelector("#preventiveDialogTitle");
const correctiveDialog = document.querySelector("#correctiveDialog");
const correctiveForm = document.querySelector("#correctiveForm");
const correctiveDialogTitle = document.querySelector("#correctiveDialogTitle");
const engineeringDialog = document.querySelector("#engineeringDialog");
const engineeringForm = document.querySelector("#engineeringForm");
const engineeringDialogTitle = document.querySelector("#engineeringDialogTitle");
const userDialog = document.querySelector("#userDialog");
const userForm = document.querySelector("#userForm");
const userDialogTitle = document.querySelector("#userDialogTitle");

// ─── PERSISTÊNCIA SUPABASE ────────────────────────────────────────────────────

// Fotos base64 podem ser muito grandes para o Supabase (limite ~1MB por linha).
// Salvamos os dados sem as fotos no banco; as fotos ficam apenas em memória/sessão.
function stripPhotos(obj) {
  if (Array.isArray(obj)) return obj.map(stripPhotos);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = k === 'photo' ? '' : stripPhotos(v);
    }
    return out;
  }
  return obj;
}

async function saveData() {
  const payload = stripPhotos(data);
  console.log('[CRM] Salvando no Supabase...', {
    usuarios: payload.users?.length,
    equipamentos: payload.equipments?.length,
    estoque: payload.stockItems?.length,
    preventivas: payload.preventives?.length,
    corretivas: payload.correctives?.length,
    engenharia: payload.engineeringLogics?.length,
  });

  const { error } = await supabaseClient
    .from('crm_data')
    .upsert({ id: 1, payload });

  if (error) {
    console.error('[CRM] Erro ao salvar no Supabase:', error.message, error);
    alert('Erro ao salvar dados: ' + error.message);
  } else {
    console.log('[CRM] Dados salvos com sucesso.');
  }
}

async function loadData() {
  const { data: dbData, error } = await supabaseClient
    .from('crm_data')
    .select('*')
    .eq('id', 1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = nenhuma linha encontrada (primeira vez)
    console.error("Erro ao carregar dados:", error);
  }

  if (dbData?.payload) {
    return normalizeData(dbData.payload);
  }

  return structuredClone(defaultData);
}

// ─── NORMALIZAÇÃO ─────────────────────────────────────────────────────────────
function normalizeData(value) {
  const next = {
    equipments: Array.isArray(value.equipments) ? value.equipments : [],
    stockItems: Array.isArray(value.stockItems) ? value.stockItems : [],
    preventives: Array.isArray(value.preventives) ? value.preventives : [],
    correctives: Array.isArray(value.correctives) ? value.correctives : [],
    engineeringLogics: Array.isArray(value.engineeringLogics) ? value.engineeringLogics : [],
    users: Array.isArray(value.users) && value.users.length
      ? value.users
      : structuredClone(defaultData.users),
  };

  next.equipments = next.equipments.map((equipment) => ({
    ...equipment,
    id: equipment.id || crypto.randomUUID(),
    criticalPoints: equipment.criticalPoints || "",
    peripherals: normalizePeripherals(equipment),
  }));
  next.stockItems = next.stockItems.map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    category: item.category || "mecanica",
    quantity: Number(item.quantity || 0),
    minimum: Number(item.minimum || 0),
  }));
  next.preventives = next.preventives.map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    osNumber: item.osNumber || "",
    materials: Array.isArray(item.materials) ? item.materials : [],
    materialsDeductedAt: item.materialsDeductedAt || "",
  }));
  next.correctives = next.correctives.map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    osNumber: item.osNumber || "",
    materials: Array.isArray(item.materials) ? item.materials : [],
    materialsDeductedAt: item.materialsDeductedAt || "",
    openedAt: item.openedAt || new Date().toISOString(),
  }));
  next.engineeringLogics = next.engineeringLogics.map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    createdAt: item.createdAt || new Date().toISOString(),
  }));
  return next;
}

function normalizePeripherals(equipment) {
  const current = equipment.peripherals || {};
  return {
    eletrica: current.eletrica || [],
    mecanica: current.mecanica || [],
    hidraulica: current.hidraulica || [],
    pneumatica: current.pneumatica || [],
  };
}

// ─── NUMERAÇÃO DE ORDEM DE SERVIÇO ───────────────────────────────────────────
function nextOsNumber(list, prefix) {
  const nums = list
    .map((item) => {
      const match = String(item.osNumber || "").match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

// ─── HELPERS DE ESTADO ────────────────────────────────────────────────────────
function currentUser() {
  return data.users.find((user) => user.id === state.currentUserId);
}

function can(permission) {
  const user = currentUser();
  return Boolean(user && ROLE_PERMISSIONS[user.role]?.[permission]);
}

function requirePermission(permission) {
  if (can(permission)) return true;
  alert("Seu usuário não tem permissão para esta ação.");
  return false;
}

function getSelectedEquipment() {
  return data.equipments.find((equipment) => equipment.id === state.selectedEquipmentId);
}

function getEquipment(id) {
  return data.equipments.find((equipment) => equipment.id === id);
}

function getUser(id) {
  return data.users.find((user) => user.id === id);
}

function getPreventiveResponsibleName(item) {
  return getUser(item.responsibleUserId)?.name || item.responsible || "Não definido";
}

function getCategoryLabel(id) {
  return CATEGORIES.find((category) => category.id === id)?.label || id;
}

function allComponents() {
  return data.equipments.flatMap((equipment) =>
    CATEGORIES.flatMap((category) =>
      (equipment.peripherals?.[category.id] || []).map((component) => ({
        ...component,
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        categoryId: category.id,
        categoryLabel: category.label,
      })),
    ),
  );
}

function selectInitialEquipment() {
  if (!state.selectedEquipmentId && data.equipments.length > 0) {
    state.selectedEquipmentId = data.equipments[0].id;
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
function boot() {
  const user = currentUser();
  if (!user) {
    state.currentUserId = null;
    sessionStorage.removeItem(SESSION_KEY);
    loginScreen.classList.remove("hidden");
    crmApp.classList.add("hidden");
    return;
  }

  loginScreen.classList.add("hidden");
  crmApp.classList.remove("hidden");

  // Atualiza sidebar com info do usuário
  const avatarEl = document.querySelector("#sidebarAvatar");
  const nameEl   = document.querySelector("#sidebarUserName");
  const roleEl   = document.querySelector("#sidebarUserRole");
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
  if (nameEl)   nameEl.textContent   = user.name;
  if (roleEl)   roleEl.textContent   = ROLE_LABELS[user.role] || user.role;

  selectInitialEquipment();
  render();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  renderPermissions();
  renderNav();
  renderEquipmentList();
  renderCurrentView();
}

function renderPermissions() {
  document.querySelectorAll("[data-permission]").forEach((element) => {
    element.classList.toggle("hidden", !can(element.dataset.permission));
  });
}

function renderNav() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.currentView);
  });
}

function renderEquipmentList() {
  // Os elementos podem estar no workspace (view) ou no DOM fixo
  const searchEl = document.querySelector("#searchInput");
  const listEl   = document.querySelector("#equipmentList");
  const countEl  = document.querySelector("#equipmentCount");
  if (!listEl) return;

  const query = (searchEl?.value || "").trim().toLowerCase();
  const filtered = data.equipments.filter((equipment) =>
    [equipment.name, equipment.manufacturer, equipment.model].join(" ").toLowerCase().includes(query),
  );

  if (countEl) countEl.textContent = filtered.length;
  listEl.innerHTML = "";

  if (filtered.length === 0) {
    listEl.innerHTML = '<p style="padding:16px;color:var(--muted);font-size:0.86rem;text-align:center">Nenhum equipamento encontrado.</p>';
    return;
  }

  filtered.forEach((equipment) => {
    const button = document.createElement("button");
    button.className = `equipment-item ${equipment.id === state.selectedEquipmentId ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="equipment-item-dot"></span>
      <span class="equipment-item-text">
        <strong>${escapeHtml(equipment.name)}</strong>
        <span>${escapeHtml(equipment.manufacturer)} · ${escapeHtml(equipment.model)}</span>
      </span>
    `;
    button.addEventListener("click", () => {
      state.selectedEquipmentId = equipment.id;
      state.currentView = "equipments";
      render();
    });
    listEl.append(button);
  });
}

function renderCurrentView() {
  if (state.currentView === "products") return renderProductsView();
  if (state.currentView === "stock") return renderStockView();
  if (state.currentView === "preventives") return renderPreventivesView();
  if (state.currentView === "correctives") return renderCorrectivesView();
  if (state.currentView === "engineering") return renderEngineeringView();
  if (state.currentView === "users") return can("manageUsers") ? renderUsersView() : renderEquipmentsView();
  if (state.currentView === "reports") return can("manageUsers") ? renderReportsView() : renderEquipmentsView();
  return renderEquipmentsView();
}

function renderEquipmentsView() {
  const equipment = getSelectedEquipment();

  // Preserva o valor da busca entre re-renders
  const searchQuery = viewRoot.querySelector("#searchInput")?.value || state._equipmentSearch || "";
  state._equipmentSearch = searchQuery;

  const query = searchQuery.trim().toLowerCase();
  const filtered = data.equipments.filter((eq) =>
    [eq.name, eq.manufacturer, eq.model].join(" ").toLowerCase().includes(query)
  );

  // Painel de detalhe — só renderiza se há um equipamento selecionado
  const detailHtml = equipment ? (() => {
    equipment.peripherals = normalizePeripherals(equipment);
    const activeCategory = CATEGORIES.find((c) => c.id === state.selectedCategory);
    const components = equipment.peripherals[state.selectedCategory] || [];
    return `
      <article class="eq-detail-panel">
        <div class="detail-header">
          ${renderPhoto(equipment.photo, "Foto do equipamento")}
          <div class="detail-copy">
            <p class="eyebrow">Equipamento</p>
            <h2>${escapeHtml(equipment.name)}</h2>
            <div class="meta-row">
              <span>Fabricante: ${escapeHtml(equipment.manufacturer)}</span>
              <span>Modelo: ${escapeHtml(equipment.model)}</span>
            </div>
            <div class="detail-actions">
              ${can("write") ? '<button class="ghost" type="button" data-action="edit-equipment">Editar equipamento</button>' : ""}
              ${can("delete") ? '<button class="danger" type="button" data-action="delete-equipment">Excluir equipamento</button>' : ""}
            </div>
          </div>
        </div>
        <div class="spec-box">${escapeHtml(equipment.specs || "Sem especificações cadastradas.")}</div>
        <div class="spec-box critical-box"><strong>Pontos críticos:</strong><br>${escapeHtml(equipment.criticalPoints || "Nenhum ponto crítico cadastrado.")}</div>
        <nav class="category-tabs" aria-label="Categorias de periféricos">
          ${CATEGORIES.map((category) => `
            <button class="tab-btn ${category.id === state.selectedCategory ? "active" : ""}"
              type="button" data-category="${category.id}">
              ${category.label} (${equipment.peripherals[category.id].length})
            </button>
          `).join("")}
        </nav>
        <section>
          <div class="category-header">
            <div>
              <p class="eyebrow">Periféricos</p>
              <h3>${activeCategory.label}</h3>
            </div>
            ${can("write") ? '<button class="primary" type="button" data-action="new-component">Novo produto</button>' : ""}
          </div>
          <div class="component-grid">
            ${components.length
              ? components.map((component) => renderComponentCard(component)).join("")
              : '<div class="empty-state compact"><h2>Nenhum produto cadastrado</h2><p>Adicione componentes para esta categoria.</p></div>'
            }
          </div>
        </section>
      </article>
    `;
  })() : `
    <div class="eq-detail-empty">
      <span>👈</span>
      <p>Selecione um equipamento para ver os detalhes</p>
    </div>
  `;

  viewRoot.innerHTML = `
    <div class="eq-master-detail">
      <!-- Painel esquerdo: lista -->
      <aside class="eq-list-panel">
        <div class="eq-list-panel-header">
          <div class="eq-list-panel-title">
            <h2>⚙️ Equipamentos</h2>
            <span class="eq-badge">${data.equipments.length}</span>
          </div>
          ${can("write") ? '<button class="primary small" type="button" data-action="new-equipment">+ Novo</button>' : ""}
        </div>
        <div class="eq-search-bar">
          <span>🔍</span>
          <input id="searchInput" type="search" placeholder="Buscar equipamento..." value="${escapeAttr(searchQuery)}" autocomplete="off" />
        </div>
        <div class="equipment-list" id="equipmentList">
          ${filtered.length === 0
            ? `<p class="eq-list-empty">Nenhum equipamento encontrado.</p>`
            : filtered.map((eq) => `
              <button class="equipment-item ${eq.id === state.selectedEquipmentId ? "active" : ""}"
                type="button" data-action="select-equipment" data-id="${eq.id}">
                <span class="equipment-item-dot"></span>
                <span class="equipment-item-text">
                  <strong>${escapeHtml(eq.name)}</strong>
                  <span>${escapeHtml(eq.manufacturer)} · ${escapeHtml(eq.model)}</span>
                </span>
              </button>
            `).join("")
          }
        </div>
      </aside>

      <!-- Painel direito: detalhe -->
      <main class="eq-detail-area">
        ${detailHtml}
      </main>
    </div>
  `;

  // Busca com foco preservado
  const si = viewRoot.querySelector("#searchInput");
  if (si) {
    si.addEventListener("input", () => {
      state._equipmentSearch = si.value;
      renderEquipmentsView();
      const restored = viewRoot.querySelector("#searchInput");
      if (restored) restored.focus();
    });
  }

  // Seleção de equipamento
  viewRoot.querySelectorAll("[data-action='select-equipment']").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedEquipmentId = btn.dataset.id;
      renderEquipmentsView();
    });
  });

  viewRoot.querySelector("[data-action='new-equipment']")?.addEventListener("click", openNewEquipment);
  bindEquipmentViewActions();
}

function renderProductsView() {
  const query = document.querySelector("#productSearch")?.value || "";
  const category = document.querySelector("#productCategoryFilter")?.value || "all";
  const equipmentId = document.querySelector("#productEquipmentFilter")?.value || "all";
  const products = filterRows(allComponents(), query, ["name", "manufacturer", "model", "specs", "equipmentName"])
    .filter((item) => category === "all" || item.categoryId === category)
    .filter((item) => equipmentId === "all" || item.equipmentId === equipmentId);

  viewRoot.innerHTML = `
    <section class="view-stack">
      <div class="view-header">
        <div>
          <p class="eyebrow">Produtos</p>
          <h2>Pesquisa geral de produtos</h2>
        </div>
      </div>
      <div class="filter-bar">
        <input id="productSearch" type="search" placeholder="Pesquisar em todos os produtos..." value="${escapeAttr(query)}" />
        <select id="productCategoryFilter">
          <option value="all">Todas as categorias</option>
          ${CATEGORIES.map((item) => `<option value="${item.id}" ${item.id === category ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
        <select id="productEquipmentFilter">
          <option value="all">Todos os equipamentos</option>
          ${data.equipments.map((item) => `<option value="${item.id}" ${item.id === equipmentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
      ${renderTable(
        ["Produto", "Fabricante", "Modelo", "Categoria", "Equipamento", "Especificações"],
        products.map((item) => [
          item.name,
          item.manufacturer,
          item.model,
          item.categoryLabel,
          item.equipmentName,
          item.specs || "-",
        ]),
      )}
    </section>
  `;

  bindLiveFilters(["productSearch", "productCategoryFilter", "productEquipmentFilter"], renderProductsView);
}

function renderStockView() {
  const query = document.querySelector("#stockSearch")?.value || "";
  const equipmentId = document.querySelector("#stockEquipmentFilter")?.value || "all";
  const category = document.querySelector("#stockCategoryFilter")?.value || "all";
  const items = filterRows(data.stockItems, query, ["name", "manufacturer", "model", "location", "specs"])
    .filter((item) => equipmentId === "all" || item.equipmentId === equipmentId)
    .filter((item) => category === "all" || item.category === category);

  viewRoot.innerHTML = `
    <section class="view-stack">
      <div class="view-header">
        <div>
          <p class="eyebrow">Estoque</p>
          <h2>Peças vinculadas aos equipamentos</h2>
        </div>
        ${can("write") ? '<button class="primary" type="button" data-action="new-stock">Nova peça</button>' : ""}
      </div>
      <div class="filter-bar">
        <input id="stockSearch" type="search" placeholder="Pesquisar peça, fabricante, código..." value="${escapeAttr(query)}" />
        <select id="stockEquipmentFilter">
          <option value="all">Todos os equipamentos</option>
          ${data.equipments.map((item) => `<option value="${item.id}" ${item.id === equipmentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select id="stockCategoryFilter">
          <option value="all">Todas as categorias</option>
          ${CATEGORIES.map((item) => `<option value="${item.id}" ${item.id === category ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
      </div>
      <div class="card-table">
        ${items.length ? items.map(renderStockCard).join("") : renderEmptyLine("Nenhuma peça cadastrada no estoque.")}
      </div>
    </section>
  `;

  bindLiveFilters(["stockSearch", "stockEquipmentFilter", "stockCategoryFilter"], renderStockView);
  viewRoot.querySelector("[data-action='new-stock']")?.addEventListener("click", openNewStock);
  bindCardActions("edit-stock", openEditStock);
  bindCardActions("delete-stock", deleteStock);
}

function renderPreventivesView() {
  const query = document.querySelector("#preventiveSearch")?.value || "";
  const equipmentId = document.querySelector("#preventiveEquipmentFilter")?.value || "all";
  const status = document.querySelector("#preventiveStatusFilter")?.value || "all";
  const searchable = data.preventives.map((item) => ({
    ...item,
    responsibleName: getPreventiveResponsibleName(item),
  }));
  const items = filterRows(searchable, query, ["title", "frequency", "responsibleName", "notes", "status"])
    .filter((item) => equipmentId === "all" || item.equipmentId === equipmentId)
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  viewRoot.innerHTML = `
    <section class="view-stack">
      <div class="view-header">
        <div>
          <p class="eyebrow">Preventivas</p>
          <h2>Plano de manutenção preventiva</h2>
        </div>
        ${can("write") ? '<button class="primary" type="button" data-action="new-preventive">Nova preventiva</button>' : ""}
      </div>
      <div class="filter-bar">
        <input id="preventiveSearch" type="search" placeholder="Pesquisar preventiva..." value="${escapeAttr(query)}" />
        <select id="preventiveEquipmentFilter">
          <option value="all">Todos os equipamentos</option>
          ${data.equipments.map((item) => `<option value="${item.id}" ${item.id === equipmentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select id="preventiveStatusFilter">
          <option value="all">Todos os status</option>
          ${["Pendente", "Em andamento", "Concluída"].map((item) => `<option value="${item}" ${item === status ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
      <div class="card-table">
        ${items.length ? items.map(renderPreventiveCard).join("") : renderEmptyLine("Nenhuma preventiva cadastrada.")}
      </div>
    </section>
  `;

  bindLiveFilters(["preventiveSearch", "preventiveEquipmentFilter", "preventiveStatusFilter"], renderPreventivesView);
  viewRoot.querySelector("[data-action='new-preventive']")?.addEventListener("click", openNewPreventive);
  bindCardActions("complete-preventive", completePreventive);
  bindCardActions("edit-preventive", openEditPreventive);
  bindCardActions("delete-preventive", deletePreventive);
}

function renderCorrectivesView() {
  const query = document.querySelector("#correctiveSearch")?.value || "";
  const equipmentId = document.querySelector("#correctiveEquipmentFilter")?.value || "all";
  const status = document.querySelector("#correctiveStatusFilter")?.value || "all";
  const searchable = data.correctives.map((item) => ({
    ...item,
    responsibleName: getPreventiveResponsibleName(item),
  }));
  const items = filterRows(searchable, query, ["title", "criticalPoint", "responsibleName", "notes", "status"])
    .filter((item) => equipmentId === "all" || item.equipmentId === equipmentId)
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)));

  viewRoot.innerHTML = `
    <section class="view-stack">
      <div class="view-header">
        <div>
          <p class="eyebrow">Corretivas</p>
          <h2>Ordens corretivas e pontos críticos</h2>
        </div>
        ${can("write") ? '<button class="primary" type="button" data-action="new-corrective">Nova corretiva</button>' : ""}
      </div>
      <div class="filter-bar">
        <input id="correctiveSearch" type="search" placeholder="Pesquisar corretiva, ponto crítico, responsável..." value="${escapeAttr(query)}" />
        <select id="correctiveEquipmentFilter">
          <option value="all">Todos os equipamentos</option>
          ${data.equipments.map((item) => `<option value="${item.id}" ${item.id === equipmentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select id="correctiveStatusFilter">
          <option value="all">Todos os status</option>
          ${["Aberta", "Em andamento", "Concluída"].map((item) => `<option value="${item}" ${item === status ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
      <div class="card-table">
        ${items.length ? items.map(renderCorrectiveCard).join("") : renderEmptyLine("Nenhuma corretiva cadastrada.")}
      </div>
    </section>
  `;

  bindLiveFilters(["correctiveSearch", "correctiveEquipmentFilter", "correctiveStatusFilter"], renderCorrectivesView);
  viewRoot.querySelector("[data-action='new-corrective']")?.addEventListener("click", openNewCorrective);
  bindCardActions("complete-corrective", completeCorrective);
  bindCardActions("edit-corrective", openEditCorrective);
  bindCardActions("delete-corrective", deleteCorrective);
}

function renderEngineeringView() {
  const query = document.querySelector("#engineeringSearch")?.value || "";
  const type = document.querySelector("#engineeringTypeFilter")?.value || "all";
  const equipmentId = document.querySelector("#engineeringEquipmentFilter")?.value || "all";
  const rows = filterRows(data.engineeringLogics, query, ["title", "logicType", "controller", "inputs", "outputs", "logic", "safetyNotes"])
    .filter((item) => type === "all" || item.logicType === type)
    .filter((item) => equipmentId === "all" || item.equipmentId === equipmentId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const logicTypes = ["Comando elétrico", "Automação CLP", "Inversor", "Disjuntor", "Intertravamento"];

  viewRoot.innerHTML = `
    <section class="view-stack">
      <div class="view-header">
        <div>
          <p class="eyebrow">Engenharia</p>
          <h2>Lógicas elétricas e automação</h2>
        </div>
        ${can("write") ? '<button class="primary" type="button" data-action="new-engineering">Nova lógica</button>' : ""}
      </div>
      <div class="filter-bar">
        <input id="engineeringSearch" type="search" placeholder="Pesquisar lógica, CLP, inversor, disjuntor..." value="${escapeAttr(query)}" />
        <select id="engineeringTypeFilter">
          <option value="all">Todos os tipos</option>
          ${logicTypes.map((item) => `<option value="${item}" ${item === type ? "selected" : ""}>${item}</option>`).join("")}
        </select>
        <select id="engineeringEquipmentFilter">
          <option value="all">Todos os equipamentos</option>
          ${data.equipments.map((item) => `<option value="${item.id}" ${item.id === equipmentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
      <div class="card-table">
        ${rows.length ? rows.map(renderEngineeringCard).join("") : renderEmptyLine("Nenhuma lógica cadastrada.")}
      </div>
    </section>
  `;

  bindLiveFilters(["engineeringSearch", "engineeringTypeFilter", "engineeringEquipmentFilter"], renderEngineeringView);
  viewRoot.querySelector("[data-action='new-engineering']")?.addEventListener("click", openNewEngineering);
  bindCardActions("edit-engineering", openEditEngineering);
  bindCardActions("delete-engineering", deleteEngineering);
}

function renderUsersView() {
  viewRoot.innerHTML = `
    <section class="view-stack">
      <div class="view-header">
        <div>
          <p class="eyebrow">Usuários</p>
          <h2>Login e permissões</h2>
        </div>
        <button class="primary" type="button" data-action="new-user">Novo usuário</button>
      </div>
      ${renderTable(
        ["Nome", "Usuário", "Permissão", "Ações"],
        data.users.map((user) => [
          escapeHtml(user.name),
          escapeHtml(user.username),
          escapeHtml(ROLE_LABELS[user.role]),
          `<button class="ghost small" type="button" data-action="edit-user" data-id="${user.id}">Editar</button>
           <button class="danger small" type="button" data-action="delete-user" data-id="${user.id}">Excluir</button>`,
        ]),
        true,
      )}
    </section>
  `;
  viewRoot.querySelector("[data-action='new-user']").addEventListener("click", openNewUser);
  bindCardActions("edit-user", openEditUser);
  bindCardActions("delete-user", deleteUser);
}

// ─── RENDER HELPERS ───────────────────────────────────────────────────────────
function renderPhoto(photo, fallback) {
  if (!photo) return `<div class="photo-frame"><span class="photo-placeholder">${fallback}</span></div>`;
  return `<div class="photo-frame"><img src="${photo}" alt="${fallback}" /></div>`;
}

function renderComponentCard(component) {
  return `
    <article class="component-card">
      ${renderPhoto(component.photo, "Foto do produto")}
      <div>
        <h4>${escapeHtml(component.name)}</h4>
        <p>${escapeHtml(component.manufacturer)} · ${escapeHtml(component.model)}</p>
      </div>
      <div class="component-specs">${escapeHtml(component.specs || "Sem especificações cadastradas.")}</div>
      <div class="card-actions">
        ${can("write") ? `<button class="ghost" type="button" data-action="edit-component" data-id="${component.id}">Editar</button>` : ""}
        ${can("delete") ? `<button class="danger" type="button" data-action="delete-component" data-id="${component.id}">Excluir</button>` : ""}
      </div>
    </article>
  `;
}

function renderStockCard(item) {
  const equipment = getEquipment(item.equipmentId);
  const low = Number(item.quantity) <= Number(item.minimum);
  return `
    <article class="record-card ${low ? "is-low" : ""}">
      ${renderPhoto(item.photo, "Foto da peça")}
      <div class="record-main">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.manufacturer)} · ${escapeHtml(item.model)}</p>
        <p>Categoria: ${escapeHtml(getCategoryLabel(item.category))}</p>
        <p>Equipamento: ${escapeHtml(equipment?.name || "Não encontrado")}</p>
        <p>Local: ${escapeHtml(item.location || "-")}</p>
        <div class="meta-row">
          <span>Qtd: ${Number(item.quantity)}</span>
          <span>Mínimo: ${Number(item.minimum)}</span>
          ${low ? "<span>Reposição necessária</span>" : ""}
        </div>
        <div class="component-specs">${escapeHtml(item.specs || "")}</div>
      </div>
      <div class="card-actions">
        ${can("write") ? `<button class="ghost" type="button" data-action="edit-stock" data-id="${item.id}">Editar</button>` : ""}
        ${can("delete") ? `<button class="danger" type="button" data-action="delete-stock" data-id="${item.id}">Excluir</button>` : ""}
      </div>
    </article>
  `;
}

function renderPreventiveCard(item) {
  const equipment = getEquipment(item.equipmentId);
  const isDone = item.status === "Concluída";
  return `
    <article class="record-card">
      <div class="date-block">
        <strong>${formatDate(item.dueDate)}</strong>
        <span>${escapeHtml(item.frequency)}</span>
        ${item.osNumber ? `<span class="os-badge">${escapeHtml(item.osNumber)}</span>` : ""}
      </div>
      <div class="record-main">
        <h3>${item.osNumber ? `<span class="os-tag">${escapeHtml(item.osNumber)}</span> ` : ""}${escapeHtml(item.title)}</h3>
        <p>Equipamento: ${escapeHtml(equipment?.name || "Não encontrado")}</p>
        <p>Responsável: ${escapeHtml(getPreventiveResponsibleName(item))}</p>
        <div class="meta-row">
          <span>${escapeHtml(item.status)}</span>
          ${item.completedAt ? `<span>Concluída em: ${escapeHtml(formatDateTime(item.completedAt))}</span>` : ""}
          ${item.completedByUserId ? `<span>Por: ${escapeHtml(getUser(item.completedByUserId)?.name || "-")}</span>` : ""}
        </div>
        <div class="component-specs">${escapeHtml(item.notes || "")}</div>
        ${renderMaterialsSummary(item.materials)}
      </div>
      <div class="card-actions">
        ${canCompletePreventive(item) && !isDone ? `<button class="primary" type="button" data-action="complete-preventive" data-id="${item.id}">Confirmar conclusão</button>` : ""}
        ${can("write") ? `<button class="ghost" type="button" data-action="edit-preventive" data-id="${item.id}">Editar</button>` : ""}
        ${can("delete") ? `<button class="danger" type="button" data-action="delete-preventive" data-id="${item.id}">Excluir</button>` : ""}
      </div>
    </article>
  `;
}

function renderCorrectiveCard(item) {
  const equipment = getEquipment(item.equipmentId);
  const isDone = item.status === "Concluída";
  return `
    <article class="record-card">
      <div class="date-block">
        <strong>${escapeHtml(formatDateTime(item.openedAt))}</strong>
        <span>Aberta</span>
        ${item.osNumber ? `<span class="os-badge">${escapeHtml(item.osNumber)}</span>` : ""}
      </div>
      <div class="record-main">
        <h3>${item.osNumber ? `<span class="os-tag">${escapeHtml(item.osNumber)}</span> ` : ""}${escapeHtml(item.title)}</h3>
        <p>Equipamento: ${escapeHtml(equipment?.name || "Não encontrado")}</p>
        <p>Responsável: ${escapeHtml(getPreventiveResponsibleName(item))}</p>
        <p>Ponto crítico: ${escapeHtml(item.criticalPoint || "-")}</p>
        <div class="meta-row">
          <span>${escapeHtml(item.status)}</span>
          ${item.completedAt ? `<span>Concluída em: ${escapeHtml(formatDateTime(item.completedAt))}</span>` : ""}
          ${item.materialsDeductedAt ? `<span>Estoque baixado em: ${escapeHtml(formatDateTime(item.materialsDeductedAt))}</span>` : ""}
        </div>
        <div class="component-specs">${escapeHtml(item.notes || "")}</div>
        ${renderMaterialsSummary(item.materials)}
      </div>
      <div class="card-actions">
        ${canCompleteCorrective(item) && !isDone ? `<button class="primary" type="button" data-action="complete-corrective" data-id="${item.id}">Concluir e baixar estoque</button>` : ""}
        ${can("write") ? `<button class="ghost" type="button" data-action="edit-corrective" data-id="${item.id}">Editar</button>` : ""}
        ${can("delete") ? `<button class="danger" type="button" data-action="delete-corrective" data-id="${item.id}">Excluir</button>` : ""}
      </div>
    </article>
  `;
}

function renderEngineeringCard(item) {
  const equipment = getEquipment(item.equipmentId);
  return `
    <article class="record-card engineering-card">
      <div class="date-block">
        <strong>${escapeHtml(item.logicType)}</strong>
        <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
      </div>
      <div class="record-main">
        <h3>${escapeHtml(item.title)}</h3>
        <p>Equipamento: ${escapeHtml(equipment?.name || "Não encontrado")}</p>
        <p>Componente/controlador: ${escapeHtml(item.controller || "-")}</p>
        <div class="logic-grid">
          <div><strong>Entradas</strong><span>${escapeHtml(item.inputs || "-")}</span></div>
          <div><strong>Saídas</strong><span>${escapeHtml(item.outputs || "-")}</span></div>
          <div><strong>Lógica</strong><span>${escapeHtml(item.logic || "-")}</span></div>
          <div><strong>Segurança</strong><span>${escapeHtml(item.safetyNotes || "-")}</span></div>
        </div>
      </div>
      <div class="card-actions">
        ${can("write") ? `<button class="ghost" type="button" data-action="edit-engineering" data-id="${item.id}">Editar</button>` : ""}
        ${can("delete") ? `<button class="danger" type="button" data-action="delete-engineering" data-id="${item.id}">Excluir</button>` : ""}
      </div>
    </article>
  `;
}

function renderMaterialsSummary(materials = []) {
  const valid = materials.filter((item) => item.stockItemId && Number(item.quantity) > 0);
  if (!valid.length) return "";
  return `
    <div class="material-summary">
      <strong>Materiais do estoque</strong>
      ${valid
        .map((material) => {
          const stock = data.stockItems.find((item) => item.id === material.stockItemId);
          return `<span>${escapeHtml(stock?.name || "Item removido")} · ${Number(material.quantity)} un.</span>`;
        })
        .join("")}
    </div>
  `;
}

function renderTable(headers, rows, allowHtml = false) {
  if (!rows.length) return renderEmptyLine("Nenhum registro encontrado.");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${allowHtml ? cell : escapeHtml(cell)}</td>`).join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyLine(text) {
  return `<div class="empty-state compact"><h2>${escapeHtml(text)}</h2></div>`;
}

// ─── BIND ACTIONS ─────────────────────────────────────────────────────────────
function bindEquipmentViewActions() {
  viewRoot.querySelector("[data-action='edit-equipment']")?.addEventListener("click", openEditEquipment);
  viewRoot.querySelector("[data-action='delete-equipment']")?.addEventListener("click", deleteEquipment);
  viewRoot.querySelector("[data-action='new-component']")?.addEventListener("click", openNewComponent);
  viewRoot.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category;
      renderEquipmentsView();
    });
  });
  bindCardActions("edit-component", openEditComponent);
  bindCardActions("delete-component", deleteComponent);
}

function bindCardActions(action, handler) {
  viewRoot.querySelectorAll(`[data-action='${action}']`).forEach((button) => {
    button.addEventListener("click", () => handler(button.dataset.id));
  });
}

function bindLiveFilters(ids, renderer) {
  ids.forEach((id) => {
    const element = viewRoot.querySelector(`#${id}`);
    if (!element) return;
    element.addEventListener("input", () => {
      const activeId  = document.activeElement?.id;
      const selStart  = document.activeElement?.selectionStart;
      const selEnd    = document.activeElement?.selectionEnd;
      renderer();
      if (activeId) {
        const restored = viewRoot.querySelector(`#${activeId}`);
        if (restored) {
          restored.focus();
          if (selStart != null) {
            try { restored.setSelectionRange(selStart, selEnd); } catch (_) {}
          }
        }
      }
    });
  });
}

function filterRows(rows, query, keys) {
  const term = query.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => keys.map((key) => row[key]).join(" ").toLowerCase().includes(term));
}

// ─── EQUIPAMENTOS ─────────────────────────────────────────────────────────────
function openNewEquipment() {
  if (!requirePermission("write")) return;
  state.editingEquipmentId = null;
  equipmentDialogTitle.textContent = "Novo equipamento";
  equipmentForm.reset();
  renderUploadPreview("equipmentPhotoPreview", "");
  equipmentDialog.showModal();
}

function openEditEquipment() {
  if (!requirePermission("write")) return;
  const equipment = getSelectedEquipment();
  if (!equipment) return;
  state.editingEquipmentId = equipment.id;
  equipmentDialogTitle.textContent = "Editar equipamento";
  setFormValues(equipmentForm, equipment);
  equipmentForm.elements.photo.value = "";
  renderUploadPreview("equipmentPhotoPreview", equipment.photo);
  equipmentDialog.showModal();
}

async function submitEquipment(event) {
  event.preventDefault();
  if (!requirePermission("write")) return;
  const formData = new FormData(equipmentForm);
  const existing = data.equipments.find((equipment) => equipment.id === state.editingEquipmentId);
  const photo = await fileToDataUrl(formData.get("photo"));
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    name: formData.get("name").trim(),
    manufacturer: formData.get("manufacturer").trim(),
    model: formData.get("model").trim(),
    photo: photo || existing?.photo || "",
    specs: formData.get("specs").trim(),
    criticalPoints: formData.get("criticalPoints").trim(),
    peripherals: existing ? normalizePeripherals(existing) : createEmptyPeripherals(),
  };

  data.equipments = existing
    ? data.equipments.map((equipment) => (equipment.id === existing.id ? payload : equipment))
    : [payload, ...data.equipments];
  state.selectedEquipmentId = payload.id;
  await saveData();
  equipmentDialog.close();
  render();
}

async function deleteEquipment() {
  if (!requirePermission("delete")) return;
  const equipment = getSelectedEquipment();
  if (!equipment || !confirm(`Excluir "${equipment.name}" e todos os seus vínculos?`)) return;
  data.equipments = data.equipments.filter((item) => item.id !== equipment.id);
  data.stockItems = data.stockItems.filter((item) => item.equipmentId !== equipment.id);
  data.preventives = data.preventives.filter((item) => item.equipmentId !== equipment.id);
  data.correctives = data.correctives.filter((item) => item.equipmentId !== equipment.id);
  data.engineeringLogics = data.engineeringLogics.filter((item) => item.equipmentId !== equipment.id);
  state.selectedEquipmentId = data.equipments[0]?.id || null;
  await saveData();
  render();
}

// ─── COMPONENTES ──────────────────────────────────────────────────────────────
function openNewComponent() {
  if (!requirePermission("write")) return;
  const category = CATEGORIES.find((item) => item.id === state.selectedCategory);
  state.editingComponent = null;
  componentCategoryLabel.textContent = category.label;
  componentDialogTitle.textContent = "Novo produto";
  componentForm.reset();
  renderUploadPreview("componentPhotoPreview", "");
  componentDialog.showModal();
}

function openEditComponent(componentId) {
  if (!requirePermission("write")) return;
  const equipment = getSelectedEquipment();
  const component = equipment?.peripherals[state.selectedCategory].find((item) => item.id === componentId);
  if (!component) return;
  state.editingComponent = { categoryId: state.selectedCategory, componentId };
  componentCategoryLabel.textContent = getCategoryLabel(state.selectedCategory);
  componentDialogTitle.textContent = "Editar produto";
  setFormValues(componentForm, component);
  componentForm.elements.photo.value = "";
  renderUploadPreview("componentPhotoPreview", component.photo);
  componentDialog.showModal();
}

async function submitComponent(event) {
  event.preventDefault();
  if (!requirePermission("write")) return;
  const equipment = getSelectedEquipment();
  if (!equipment) return;
  const formData = new FormData(componentForm);
  const categoryId = state.editingComponent?.categoryId || state.selectedCategory;
  const existing = equipment.peripherals[categoryId].find(
    (component) => component.id === state.editingComponent?.componentId,
  );
  const photo = await fileToDataUrl(formData.get("photo"));
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    name: formData.get("name").trim(),
    manufacturer: formData.get("manufacturer").trim(),
    model: formData.get("model").trim(),
    photo: photo || existing?.photo || "",
    specs: formData.get("specs").trim(),
  };

  equipment.peripherals[categoryId] = existing
    ? equipment.peripherals[categoryId].map((component) => (component.id === existing.id ? payload : component))
    : [payload, ...equipment.peripherals[categoryId]];
  await saveData();
  componentDialog.close();
  render();
}

async function deleteComponent(componentId) {
  if (!requirePermission("delete")) return;
  const equipment = getSelectedEquipment();
  if (!equipment || !confirm("Excluir este produto da categoria selecionada?")) return;
  equipment.peripherals[state.selectedCategory] = equipment.peripherals[state.selectedCategory].filter(
    (component) => component.id !== componentId,
  );
  await saveData();
  render();
}

// ─── ESTOQUE ──────────────────────────────────────────────────────────────────
function openNewStock() {
  if (!requirePermission("write")) return;
  state.editingStockId = null;
  stockDialogTitle.textContent = "Nova peça";
  stockForm.reset();
  hydrateEquipmentSelect(stockForm.elements.equipmentId, state.selectedEquipmentId);
  hydrateComponentSelect(stockForm.elements.componentId, stockForm.elements.equipmentId.value);
  renderUploadPreview("stockPhotoPreview", "");
  stockDialog.showModal();
}

function openEditStock(id) {
  if (!requirePermission("write")) return;
  const item = data.stockItems.find((stockItem) => stockItem.id === id);
  if (!item) return;
  state.editingStockId = id;
  stockDialogTitle.textContent = "Editar peça";
  hydrateEquipmentSelect(stockForm.elements.equipmentId, item.equipmentId);
  hydrateComponentSelect(stockForm.elements.componentId, item.equipmentId, item.componentId);
  setFormValues(stockForm, item);
  stockForm.elements.photo.value = "";
  renderUploadPreview("stockPhotoPreview", item.photo);
  stockDialog.showModal();
}

async function submitStock(event) {
  event.preventDefault();
  if (!requirePermission("write")) return;
  const formData = new FormData(stockForm);
  const existing = data.stockItems.find((item) => item.id === state.editingStockId);
  const photo = await fileToDataUrl(formData.get("photo"));
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    equipmentId: formData.get("equipmentId"),
    componentId: formData.get("componentId"),
    category: formData.get("category"),
    name: formData.get("name").trim(),
    manufacturer: formData.get("manufacturer").trim(),
    model: formData.get("model").trim(),
    location: formData.get("location").trim(),
    quantity: Number(formData.get("quantity")),
    minimum: Number(formData.get("minimum")),
    photo: photo || existing?.photo || "",
    specs: formData.get("specs").trim(),
  };
  data.stockItems = existing
    ? data.stockItems.map((item) => (item.id === existing.id ? payload : item))
    : [payload, ...data.stockItems];
  await saveData();
  stockDialog.close();
  renderStockView();
}

async function deleteStock(id) {
  if (!requirePermission("delete")) return;
  if (!confirm("Excluir esta peça do estoque?")) return;
  data.stockItems = data.stockItems.filter((item) => item.id !== id);
  await saveData();
  renderStockView();
}

// ─── PREVENTIVAS ──────────────────────────────────────────────────────────────
function openNewPreventive() {
  if (!requirePermission("write")) return;
  state.editingPreventiveId = null;
  preventiveDialogTitle.textContent = "Nova preventiva";
  preventiveForm.reset();
  hydrateEquipmentSelect(preventiveForm.elements.equipmentId, state.selectedEquipmentId);
  hydrateUserSelect(preventiveForm.elements.responsibleUserId, currentUser()?.id);
  renderMaterialRows(document.querySelector("#preventiveMaterials"), []);
  preventiveDialog.showModal();
}

function openEditPreventive(id) {
  if (!requirePermission("write")) return;
  const item = data.preventives.find((preventive) => preventive.id === id);
  if (!item) return;
  state.editingPreventiveId = id;
  preventiveDialogTitle.textContent = `Editar preventiva${item.osNumber ? " · " + item.osNumber : ""}`;
  hydrateEquipmentSelect(preventiveForm.elements.equipmentId, item.equipmentId);
  hydrateUserSelect(preventiveForm.elements.responsibleUserId, item.responsibleUserId || currentUser()?.id);
  setFormValues(preventiveForm, item);
  renderMaterialRows(document.querySelector("#preventiveMaterials"), item.materials || []);
  preventiveDialog.showModal();
}

async function submitPreventive(event) {
  event.preventDefault();
  if (!requirePermission("write")) return;
  const formData = new FormData(preventiveForm);
  const existing = data.preventives.find((item) => item.id === state.editingPreventiveId);
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    osNumber: existing?.osNumber || nextOsNumber(data.preventives, "OS-P"),
    equipmentId: formData.get("equipmentId"),
    title: formData.get("title").trim(),
    frequency: formData.get("frequency"),
    dueDate: formData.get("dueDate"),
    responsibleUserId: formData.get("responsibleUserId"),
    responsible: getUser(formData.get("responsibleUserId"))?.name || "",
    status: formData.get("status"),
    completedAt: existing?.completedAt || "",
    completedByUserId: existing?.completedByUserId || "",
    materials: collectMaterials(document.querySelector("#preventiveMaterials")),
    materialsDeductedAt: existing?.materialsDeductedAt || "",
    notes: formData.get("notes").trim(),
  };
  if (payload.status === "Concluída" && !payload.completedAt) {
    payload.completedAt = new Date().toISOString();
    payload.completedByUserId = currentUser()?.id || "";
  }
  if (payload.status !== "Concluída") {
    payload.completedAt = "";
    payload.completedByUserId = "";
    payload.materialsDeductedAt = "";
  }
  if (payload.status === "Concluída" && !payload.materialsDeductedAt && !applyMaterialUsage(payload)) {
    return;
  }
  data.preventives = existing
    ? data.preventives.map((item) => (item.id === existing.id ? payload : item))
    : [payload, ...data.preventives];
  await saveData();
  preventiveDialog.close();
  renderPreventivesView();
}

function canCompletePreventive(item) {
  const user = currentUser();
  if (!user || item.status === "Concluída") return false;
  return user.role === "admin" || item.responsibleUserId === user.id || (!item.responsibleUserId && can("write"));
}

async function completePreventive(id) {
  const item = data.preventives.find((preventive) => preventive.id === id);
  if (!item || !canCompletePreventive(item)) {
    alert("Somente o responsável indicado ou um administrador pode concluir esta preventiva.");
    return;
  }
  item.status = "Concluída";
  item.completedAt = new Date().toISOString();
  item.completedByUserId = currentUser()?.id || "";
  if (!applyMaterialUsage(item)) return;
  await saveData();
  renderPreventivesView();
}

async function deletePreventive(id) {
  if (!requirePermission("delete")) return;
  if (!confirm("Excluir esta preventiva?")) return;
  data.preventives = data.preventives.filter((item) => item.id !== id);
  await saveData();
  renderPreventivesView();
}

// ─── CORRETIVAS ───────────────────────────────────────────────────────────────
function openNewCorrective() {
  if (!requirePermission("write")) return;
  state.editingCorrectiveId = null;
  correctiveDialogTitle.textContent = "Nova corretiva";
  correctiveForm.reset();
  hydrateEquipmentSelect(correctiveForm.elements.equipmentId, state.selectedEquipmentId);
  hydrateUserSelect(correctiveForm.elements.responsibleUserId, currentUser()?.id);
  correctiveForm.elements.openedAt.value = toDateTimeLocal(new Date());
  renderMaterialRows(document.querySelector("#correctiveMaterials"), []);
  correctiveDialog.showModal();
}

function openEditCorrective(id) {
  if (!requirePermission("write")) return;
  const item = data.correctives.find((corrective) => corrective.id === id);
  if (!item) return;
  state.editingCorrectiveId = id;
  correctiveDialogTitle.textContent = `Editar corretiva${item.osNumber ? " · " + item.osNumber : ""}`;
  hydrateEquipmentSelect(correctiveForm.elements.equipmentId, item.equipmentId);
  hydrateUserSelect(correctiveForm.elements.responsibleUserId, item.responsibleUserId || currentUser()?.id);
  setFormValues(correctiveForm, item);
  correctiveForm.elements.openedAt.value = toDateTimeLocal(item.openedAt || new Date());
  renderMaterialRows(document.querySelector("#correctiveMaterials"), item.materials || []);
  correctiveDialog.showModal();
}

async function submitCorrective(event) {
  event.preventDefault();
  if (!requirePermission("write")) return;
  const formData = new FormData(correctiveForm);
  const existing = data.correctives.find((item) => item.id === state.editingCorrectiveId);
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    osNumber: existing?.osNumber || nextOsNumber(data.correctives, "OS-C"),
    equipmentId: formData.get("equipmentId"),
    responsibleUserId: formData.get("responsibleUserId"),
    responsible: getUser(formData.get("responsibleUserId"))?.name || "",
    title: formData.get("title").trim(),
    openedAt: formData.get("openedAt"),
    criticalPoint: formData.get("criticalPoint").trim(),
    status: formData.get("status"),
    notes: formData.get("notes").trim(),
    materials: collectMaterials(document.querySelector("#correctiveMaterials")),
    completedAt: existing?.completedAt || "",
    completedByUserId: existing?.completedByUserId || "",
    materialsDeductedAt: existing?.materialsDeductedAt || "",
  };
  if (payload.status === "Concluída" && !payload.completedAt) {
    payload.completedAt = new Date().toISOString();
    payload.completedByUserId = currentUser()?.id || "";
  }
  if (payload.status !== "Concluída") {
    payload.completedAt = "";
    payload.completedByUserId = "";
    payload.materialsDeductedAt = "";
  }
  if (payload.status === "Concluída" && !payload.materialsDeductedAt && !applyMaterialUsage(payload)) {
    return;
  }
  data.correctives = existing
    ? data.correctives.map((item) => (item.id === existing.id ? payload : item))
    : [payload, ...data.correctives];
  await saveData();
  correctiveDialog.close();
  renderCorrectivesView();
}

function canCompleteCorrective(item) {
  const user = currentUser();
  if (!user || item.status === "Concluída") return false;
  return user.role === "admin" || item.responsibleUserId === user.id || (!item.responsibleUserId && can("write"));
}

async function completeCorrective(id) {
  const item = data.correctives.find((corrective) => corrective.id === id);
  if (!item || !canCompleteCorrective(item)) {
    alert("Somente o responsável indicado ou um administrador pode concluir esta corretiva.");
    return;
  }
  if (!applyMaterialUsage(item)) return;
  item.status = "Concluída";
  item.completedAt = new Date().toISOString();
  item.completedByUserId = currentUser()?.id || "";
  await saveData();
  renderCorrectivesView();
}

async function deleteCorrective(id) {
  if (!requirePermission("delete")) return;
  if (!confirm("Excluir esta corretiva?")) return;
  data.correctives = data.correctives.filter((item) => item.id !== id);
  await saveData();
  renderCorrectivesView();
}

// ─── ENGENHARIA ───────────────────────────────────────────────────────────────
function openNewEngineering() {
  if (!requirePermission("write")) return;
  state.editingEngineeringId = null;
  engineeringDialogTitle.textContent = "Nova lógica";
  engineeringForm.reset();
  hydrateEquipmentSelect(engineeringForm.elements.equipmentId, state.selectedEquipmentId);
  engineeringDialog.showModal();
}

function openEditEngineering(id) {
  if (!requirePermission("write")) return;
  const item = data.engineeringLogics.find((logic) => logic.id === id);
  if (!item) return;
  state.editingEngineeringId = id;
  engineeringDialogTitle.textContent = "Editar lógica";
  hydrateEquipmentSelect(engineeringForm.elements.equipmentId, item.equipmentId);
  setFormValues(engineeringForm, item);
  engineeringDialog.showModal();
}

async function submitEngineering(event) {
  event.preventDefault();
  if (!requirePermission("write")) return;
  const formData = new FormData(engineeringForm);
  const existing = data.engineeringLogics.find((item) => item.id === state.editingEngineeringId);
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    equipmentId: formData.get("equipmentId"),
    logicType: formData.get("logicType"),
    title: formData.get("title").trim(),
    controller: formData.get("controller").trim(),
    inputs: formData.get("inputs").trim(),
    outputs: formData.get("outputs").trim(),
    logic: formData.get("logic").trim(),
    safetyNotes: formData.get("safetyNotes").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  data.engineeringLogics = existing
    ? data.engineeringLogics.map((item) => (item.id === existing.id ? payload : item))
    : [payload, ...data.engineeringLogics];
  await saveData();
  engineeringDialog.close();
  renderEngineeringView();
}

async function deleteEngineering(id) {
  if (!requirePermission("delete")) return;
  if (!confirm("Excluir esta lógica de engenharia?")) return;
  data.engineeringLogics = data.engineeringLogics.filter((item) => item.id !== id);
  await saveData();
  renderEngineeringView();
}

// ─── USUÁRIOS ─────────────────────────────────────────────────────────────────
function openNewUser() {
  if (!requirePermission("manageUsers")) return;
  state.editingUserId = null;
  userDialogTitle.textContent = "Novo usuário";
  userForm.reset();
  userForm.elements.password.required = true;
  userDialog.showModal();
}

function openEditUser(id) {
  if (!requirePermission("manageUsers")) return;
  const user = data.users.find((item) => item.id === id);
  if (!user) return;
  state.editingUserId = id;
  userDialogTitle.textContent = "Editar usuário";
  setFormValues(userForm, user);
  userForm.elements.password.value = "";
  userForm.elements.password.required = false;
  userDialog.showModal();
}

async function submitUser(event) {
  event.preventDefault();
  if (!requirePermission("manageUsers")) return;
  const formData = new FormData(userForm);
  const existing = data.users.find((user) => user.id === state.editingUserId);
  const username = formData.get("username").trim();
  const duplicate = data.users.some((user) => user.username === username && user.id !== existing?.id);
  if (duplicate) {
    alert("Já existe um usuário com este login.");
    return;
  }
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    name: formData.get("name").trim(),
    username,
    password: formData.get("password") || existing?.password,
    role: formData.get("role"),
  };
  data.users = existing
    ? data.users.map((user) => (user.id === existing.id ? payload : user))
    : [payload, ...data.users];
  await saveData();
  userDialog.close();
  renderUsersView();
}

async function deleteUser(id) {
  if (!requirePermission("manageUsers")) return;
  if (id === state.currentUserId) {
    alert("Você não pode excluir o usuário logado.");
    return;
  }
  const remainingAdmins = data.users.filter((user) => user.id !== id && user.role === "admin").length;
  if (remainingAdmins === 0) {
    alert("Mantenha pelo menos um usuário administrador no CRM.");
    return;
  }
  if (!confirm("Excluir este usuário?")) return;
  data.users = data.users.filter((user) => user.id !== id);
  await saveData();
  renderUsersView();
}

// ─── HELPERS DE FORMULÁRIO ────────────────────────────────────────────────────
function hydrateEquipmentSelect(select, selectedId = "") {
  select.innerHTML = data.equipments
    .map((equipment) => `<option value="${equipment.id}" ${equipment.id === selectedId ? "selected" : ""}>${escapeHtml(equipment.name)}</option>`)
    .join("");
}

function hydrateUserSelect(select, selectedId = "") {
  select.innerHTML = data.users
    .map((user) => `<option value="${user.id}" ${user.id === selectedId ? "selected" : ""}>${escapeHtml(user.name)} · ${escapeHtml(ROLE_LABELS[user.role])}</option>`)
    .join("");
}

function hydrateComponentSelect(select, equipmentId, selectedId = "") {
  const equipment = getEquipment(equipmentId);
  const options = allComponents()
    .filter((component) => component.equipmentId === equipment?.id)
    .map(
      (component) =>
        `<option value="${component.id}" ${component.id === selectedId ? "selected" : ""}>${escapeHtml(component.categoryLabel)} · ${escapeHtml(component.name)}</option>`,
    );
  select.innerHTML = `<option value="">Sem vínculo específico</option>${options.join("")}`;
}

function stockOptionHtml(selectedId = "") {
  return data.stockItems
    .map((item) => {
      const label = `${item.name} · ${getCategoryLabel(item.category)} · saldo ${Number(item.quantity)}`;
      return `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderMaterialRows(container, materials = []) {
  container.innerHTML = "";
  if (!materials.length) {
    addMaterialRow(container);
    return;
  }
  materials.forEach((material) => addMaterialRow(container, material));
}

function addMaterialRow(container, material = {}) {
  const row = document.createElement("div");
  row.className = "material-row";
  row.innerHTML = `
    <select data-material-field="stockItemId">
      <option value="">Selecione uma peça</option>
      ${stockOptionHtml(material.stockItemId)}
    </select>
    <input data-material-field="quantity" type="number" min="0" step="1" value="${Number(material.quantity || 1)}" />
    <button class="danger small" type="button" data-action="remove-material">Remover</button>
  `;
  row.querySelector("[data-action='remove-material']").addEventListener("click", () => row.remove());
  container.append(row);
}

function collectMaterials(container) {
  return Array.from(container.querySelectorAll(".material-row"))
    .map((row) => ({
      stockItemId: row.querySelector("[data-material-field='stockItemId']").value,
      quantity: Number(row.querySelector("[data-material-field='quantity']").value || 0),
    }))
    .filter((item) => item.stockItemId && item.quantity > 0);
}

function applyMaterialUsage(record) {
  if (record.materialsDeductedAt) return true;
  const materials = Array.isArray(record.materials) ? record.materials : [];

  for (const material of materials) {
    const stock = data.stockItems.find((item) => item.id === material.stockItemId);
    const quantity = Number(material.quantity || 0);
    if (!stock) {
      alert("Um dos materiais selecionados não existe mais no estoque.");
      return false;
    }
    if (Number(stock.quantity) < quantity) {
      alert(`Estoque insuficiente para "${stock.name}". Saldo atual: ${stock.quantity}.`);
      return false;
    }
  }

  materials.forEach((material) => {
    const stock = data.stockItems.find((item) => item.id === material.stockItemId);
    stock.quantity = Number(stock.quantity) - Number(material.quantity || 0);
  });
  record.materialsDeductedAt = new Date().toISOString();
  return true;
}

function setFormValues(form, values) {
  Array.from(form.elements).forEach((element) => {
    if (!element.name || element.type === "file") return;
    if (Object.hasOwn(values, element.name)) {
      element.value = values[element.name] ?? "";
    }
  });
}

function createEmptyPeripherals() {
  return CATEGORIES.reduce((acc, category) => {
    acc[category.id] = [];
    return acc;
  }, {});
}

function fileToDataUrl(file) {
  if (!file || file.size === 0) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderUploadPreview(targetId, photo) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) return;
  target.innerHTML = photo
    ? `<img src="${photo}" alt="Pré-visualização da imagem" /><span>Imagem carregada</span>`
    : `<span>Nenhuma imagem selecionada</span>`;
}

async function handlePhotoPreview(form, targetId) {
  const file = form.elements.photo.files?.[0];
  renderUploadPreview(targetId, await fileToDataUrl(file));
}

// ─── FORMAT ───────────────────────────────────────────────────────────────────
function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateTimeLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const user = data.users.find(
    (item) => item.username === formData.get("username").trim() && item.password === formData.get("password"),
  );
  if (!user) {
    loginError.textContent = "Usuário ou senha inválidos.";
    return;
  }
  loginError.textContent = "";
  state.currentUserId = user.id;
  sessionStorage.setItem(SESSION_KEY, user.id);
  boot();
});

document.querySelector("#sidebarLogoutBtn").addEventListener("click", () => {
  state.currentUserId = null;
  sessionStorage.removeItem(SESSION_KEY);
  loginForm.reset();
  boot();
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.currentView = button.dataset.view;
    render();
  });
});

document.querySelectorAll("#newEquipmentBtn").forEach((btn) => btn.addEventListener("click", openNewEquipment));
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeModal}`).close());
});
if (searchInput) searchInput.addEventListener("input", renderEquipmentList);
equipmentForm.addEventListener("submit", submitEquipment);
componentForm.addEventListener("submit", submitComponent);
stockForm.addEventListener("submit", submitStock);
preventiveForm.addEventListener("submit", submitPreventive);
correctiveForm.addEventListener("submit", submitCorrective);
engineeringForm.addEventListener("submit", submitEngineering);
userForm.addEventListener("submit", submitUser);
equipmentForm.elements.photo.addEventListener("change", () => handlePhotoPreview(equipmentForm, "equipmentPhotoPreview"));
componentForm.elements.photo.addEventListener("change", () => handlePhotoPreview(componentForm, "componentPhotoPreview"));
stockForm.elements.photo.addEventListener("change", () => handlePhotoPreview(stockForm, "stockPhotoPreview"));
stockForm.elements.equipmentId.addEventListener("input", () => {
  hydrateComponentSelect(stockForm.elements.componentId, stockForm.elements.equipmentId.value);
});
document.querySelector("[data-action='add-preventive-material']").addEventListener("click", () => {
  addMaterialRow(document.querySelector("#preventiveMaterials"));
});
document.querySelector("[data-action='add-corrective-material']").addEventListener("click", () => {
  addMaterialRow(document.querySelector("#correctiveMaterials"));
});

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  data = await loadData();
  boot();
}

init();

// ─── RELATÓRIOS (apenas admin) ────────────────────────────────────────────────

function renderReportsView() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  // ── Filtros de período ──────────────────────────────────────────────────────
  const periodEl = document.querySelector("#reportPeriod");
  const period = periodEl?.value || "month";
  const eqFilterEl = document.querySelector("#reportEquipment");
  const eqFilter = eqFilterEl?.value || "all";

  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month") return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    if (period === "quarter") {
      const q = Math.floor(thisMonth / 3);
      return d.getFullYear() === thisYear && Math.floor(d.getMonth() / 3) === q;
    }
    if (period === "year") return d.getFullYear() === thisYear;
    return true; // "all"
  }

  // ── Dados filtrados ─────────────────────────────────────────────────────────
  const prevs = data.preventives.filter(p =>
    inPeriod(p.dueDate) && (eqFilter === "all" || p.equipmentId === eqFilter)
  );
  const corrs = data.correctives.filter(c =>
    inPeriod(c.openedAt) && (eqFilter === "all" || c.equipmentId === eqFilter)
  );

  // Preventivas por status
  const prevDone    = prevs.filter(p => p.status === "Concluída").length;
  const prevPending = prevs.filter(p => p.status === "Pendente").length;
  const prevOngoing = prevs.filter(p => p.status === "Em andamento").length;

  // Corretivas por status
  const corrDone    = corrs.filter(c => c.status === "Concluída").length;
  const corrOpen    = corrs.filter(c => c.status === "Aberta").length;
  const corrOngoing = corrs.filter(c => c.status === "Em andamento").length;

  // Estoque crítico (quantidade <= mínimo)
  const lowStock = data.stockItems.filter(i =>
    eqFilter === "all" || i.equipmentId === eqFilter
  ).filter(i => Number(i.quantity) <= Number(i.minQuantity || 0));

  // Corretivas por equipamento (top 5)
  const corrByEq = {};
  data.correctives.forEach(c => {
    if (!inPeriod(c.openedAt)) return;
    const eq = data.equipments.find(e => e.id === c.equipmentId);
    const name = eq ? eq.name : "Desconhecido";
    corrByEq[name] = (corrByEq[name] || 0) + 1;
  });
  const topCorr = Object.entries(corrByEq).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxCorr = topCorr[0]?.[1] || 1;

  // Preventivas por mês (últimos 6 meses)
  const monthLabels = [];
  const monthPrevDone = [];
  const monthCorrOpen = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1);
    monthLabels.push(d.toLocaleString("pt-BR", { month: "short" }));
    monthPrevDone.push(data.preventives.filter(p =>
      p.status === "Concluída" &&
      new Date(p.dueDate).getFullYear() === d.getFullYear() &&
      new Date(p.dueDate).getMonth() === d.getMonth()
    ).length);
    monthCorrOpen.push(data.correctives.filter(c =>
      new Date(c.openedAt).getFullYear() === d.getFullYear() &&
      new Date(c.openedAt).getMonth() === d.getMonth()
    ).length);
  }

  const periodLabel = { month: "Este mês", quarter: "Este trimestre", year: "Este ano", all: "Todo o período" }[period];

  viewRoot.innerHTML = `
    <div class="view-stack" id="reportsRoot">
      <div class="view-header">
        <div>
          <p class="eyebrow">Administrador</p>
          <h2>📊 Relatórios</h2>
        </div>
        <div class="detail-actions">
          <select class="ghost small" id="reportPeriod" style="min-height:34px;padding:0 10px;">
            <option value="month"   ${period==="month"   ?"selected":""}>Este mês</option>
            <option value="quarter" ${period==="quarter" ?"selected":""}>Este trimestre</option>
            <option value="year"    ${period==="year"    ?"selected":""}>Este ano</option>
            <option value="all"     ${period==="all"     ?"selected":""}>Todo o período</option>
          </select>
          <select class="ghost small" id="reportEquipment" style="min-height:34px;padding:0 10px;">
            <option value="all">Todos os equipamentos</option>
            ${data.equipments.map(e=>`<option value="${e.id}" ${eqFilter===e.id?"selected":""}>${escapeHtml(e.name)}</option>`).join("")}
          </select>
          <button class="primary small" id="exportPdfBtn" type="button">⬇ Exportar PDF</button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="report-kpis">
        <div class="kpi-card kpi-green">
          <span class="kpi-icon">🔧</span>
          <strong class="kpi-value">${prevDone}</strong>
          <span class="kpi-label">Preventivas concluídas</span>
          <span class="kpi-sub">${periodLabel}</span>
        </div>
        <div class="kpi-card kpi-yellow">
          <span class="kpi-icon">⏳</span>
          <strong class="kpi-value">${prevPending + prevOngoing}</strong>
          <span class="kpi-label">Preventivas pendentes</span>
          <span class="kpi-sub">${prevPending} pendentes · ${prevOngoing} em andamento</span>
        </div>
        <div class="kpi-card kpi-red">
          <span class="kpi-icon">🚨</span>
          <strong class="kpi-value">${corrOpen + corrOngoing}</strong>
          <span class="kpi-label">Corretivas abertas</span>
          <span class="kpi-sub">${corrOpen} abertas · ${corrOngoing} em andamento</span>
        </div>
        <div class="kpi-card kpi-blue">
          <span class="kpi-icon">✅</span>
          <strong class="kpi-value">${corrDone}</strong>
          <span class="kpi-label">Corretivas concluídas</span>
          <span class="kpi-sub">${periodLabel}</span>
        </div>
        <div class="kpi-card ${lowStock.length > 0 ? "kpi-orange" : "kpi-green"}">
          <span class="kpi-icon">📦</span>
          <strong class="kpi-value">${lowStock.length}</strong>
          <span class="kpi-label">Itens em estoque crítico</span>
          <span class="kpi-sub">abaixo do mínimo</span>
        </div>
        <div class="kpi-card kpi-blue">
          <span class="kpi-icon">⚙️</span>
          <strong class="kpi-value">${data.equipments.length}</strong>
          <span class="kpi-label">Equipamentos cadastrados</span>
          <span class="kpi-sub">${data.users.length} usuários ativos</span>
        </div>
      </div>

      <!-- Gráficos -->
      <div class="report-charts">

        <!-- Tendência mensal -->
        <div class="report-card report-card-wide">
          <h3 class="report-card-title">📈 Tendência — últimos 6 meses</h3>
          <div class="chart-legend">
            <span class="legend-dot" style="background:#126c5b"></span> Preventivas concluídas &nbsp;
            <span class="legend-dot" style="background:#c0392b"></span> Corretivas abertas
          </div>
          <div class="bar-chart-wrap">
            ${monthLabels.map((label, i) => {
              const pVal = monthPrevDone[i];
              const cVal = monthCorrOpen[i];
              const maxVal = Math.max(...monthPrevDone, ...monthCorrOpen, 1);
              return `
                <div class="bar-group">
                  <div class="bar-pair">
                    <div class="bar bar-green" style="height:${Math.round((pVal/maxVal)*100)}%" title="${pVal} preventivas"></div>
                    <div class="bar bar-red"   style="height:${Math.round((cVal/maxVal)*100)}%" title="${cVal} corretivas"></div>
                  </div>
                  <span class="bar-label">${label}</span>
                </div>`;
            }).join("")}
          </div>
        </div>

        <!-- Equipamentos com mais corretivas -->
        <div class="report-card">
          <h3 class="report-card-title">🏭 Equipamentos com mais corretivas</h3>
          ${topCorr.length ? topCorr.map(([name, count]) => `
            <div class="horiz-bar-row">
              <span class="horiz-bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
              <div class="horiz-bar-track">
                <div class="horiz-bar-fill" style="width:${Math.round((count/maxCorr)*100)}%"></div>
              </div>
              <span class="horiz-bar-val">${count}</span>
            </div>`).join("") : '<p class="report-empty">Nenhuma corretiva no período</p>'}
        </div>

        <!-- Status preventivas -->
        <div class="report-card">
          <h3 class="report-card-title">🔧 Preventivas — distribuição</h3>
          ${renderDonut([
            { label: "Concluída", value: prevDone, color: "#126c5b" },
            { label: "Em andamento", value: prevOngoing, color: "#e67e22" },
            { label: "Pendente", value: prevPending, color: "#c0392b" },
          ])}
        </div>

        <!-- Status corretivas -->
        <div class="report-card">
          <h3 class="report-card-title">🚨 Corretivas — distribuição</h3>
          ${renderDonut([
            { label: "Concluída", value: corrDone, color: "#126c5b" },
            { label: "Em andamento", value: corrOngoing, color: "#e67e22" },
            { label: "Aberta", value: corrOpen, color: "#c0392b" },
          ])}
        </div>

      </div>

      <!-- Tabela estoque crítico -->
      ${lowStock.length ? `
      <div class="report-card report-card-full">
        <h3 class="report-card-title">⚠️ Itens em estoque crítico</h3>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Item</th><th>Equipamento</th><th>Local</th>
              <th>Qtd. atual</th><th>Qtd. mínima</th>
            </tr></thead>
            <tbody>
              ${lowStock.map(i => {
                const eq = data.equipments.find(e => e.id === i.equipmentId);
                return `<tr>
                  <td><strong>${escapeHtml(i.name)}</strong><br><small style="color:var(--muted)">${escapeHtml(i.manufacturer)} ${escapeHtml(i.model)}</small></td>
                  <td>${eq ? escapeHtml(eq.name) : "—"}</td>
                  <td>${escapeHtml(i.location || "—")}</td>
                  <td style="color:#c0392b;font-weight:700">${i.quantity}</td>
                  <td>${i.minQuantity || 0}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}

      <!-- Tabela preventivas vencidas/próximas -->
      <div class="report-card report-card-full">
        <h3 class="report-card-title">📅 Próximas preventivas (não concluídas)</h3>
        ${(() => {
          const upcoming = data.preventives
            .filter(p => p.status !== "Concluída")
            .sort((a,b) => String(a.dueDate).localeCompare(String(b.dueDate)))
            .slice(0, 10);
          if (!upcoming.length) return '<p class="report-empty">Nenhuma preventiva pendente.</p>';
          return `<div class="table-wrap"><table>
            <thead><tr><th>Título</th><th>Equipamento</th><th>Responsável</th><th>Vencimento</th><th>Status</th></tr></thead>
            <tbody>${upcoming.map(p => {
              const eq = data.equipments.find(e => e.id === p.equipmentId);
              const overdue = new Date(p.dueDate) < new Date() && p.status !== "Concluída";
              return `<tr>
                <td><strong>${escapeHtml(p.title)}</strong></td>
                <td>${eq ? escapeHtml(eq.name) : "—"}</td>
                <td>${escapeHtml(getPreventiveResponsibleName(p))}</td>
                <td style="${overdue ? "color:#c0392b;font-weight:700" : ""}">${formatDate(p.dueDate)}${overdue ? " ⚠️" : ""}</td>
                <td><span class="status-badge status-${p.status.toLowerCase().replace(/ /g,"-")}">${escapeHtml(p.status)}</span></td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>`;
        })()}
      </div>

    </div>
  `;

  // Filtros reativos
  document.querySelector("#reportPeriod")?.addEventListener("change", renderReportsView);
  document.querySelector("#reportEquipment")?.addEventListener("change", renderReportsView);

  // Exportar PDF
  document.querySelector("#exportPdfBtn")?.addEventListener("click", () => {
    const style = `<style>
      body{font-family:sans-serif;padding:24px;color:#18211f;}
      h1{font-size:1.4rem;margin-bottom:4px;}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0;}
      .kpi{border:1px solid #d9dfda;border-radius:8px;padding:12px;text-align:center;}
      .kpi strong{display:block;font-size:2rem;color:#126c5b;}
      .kpi span{font-size:0.82rem;color:#64706b;}
      table{border-collapse:collapse;width:100%;margin-top:16px;font-size:0.84rem;}
      th,td{border:1px solid #d9dfda;padding:8px;text-align:left;}
      th{background:#f5f8f5;}
      h2{font-size:1rem;margin:20px 0 8px;border-bottom:1px solid #d9dfda;padding-bottom:4px;}
      .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.76rem;font-weight:700;}
    </style>`;
    const periodLabelPdf = { month: "Este mês", quarter: "Este trimestre", year: "Este ano", all: "Todo o período" }[period];
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${style}</head><body>
      <h1>📊 Relatório CRM — ${periodLabelPdf}</h1>
      <p style="color:#64706b;font-size:0.86rem">Gerado em ${new Date().toLocaleString("pt-BR")} · Filtro: ${eqFilter === "all" ? "Todos os equipamentos" : (data.equipments.find(e=>e.id===eqFilter)?.name||"")}</p>
      <div class="kpis">
        <div class="kpi"><strong>${prevDone}</strong><span>Preventivas concluídas</span></div>
        <div class="kpi"><strong>${prevPending+prevOngoing}</strong><span>Preventivas pendentes</span></div>
        <div class="kpi"><strong>${corrOpen+corrOngoing}</strong><span>Corretivas abertas</span></div>
        <div class="kpi"><strong>${corrDone}</strong><span>Corretivas concluídas</span></div>
        <div class="kpi"><strong>${lowStock.length}</strong><span>Itens estoque crítico</span></div>
        <div class="kpi"><strong>${data.equipments.length}</strong><span>Equipamentos</span></div>
      </div>
      <h2>Equipamentos com mais corretivas</h2>
      <table><thead><tr><th>Equipamento</th><th>Corretivas</th></tr></thead><tbody>
        ${topCorr.map(([n,c])=>`<tr><td>${n}</td><td>${c}</td></tr>`).join("")}
      </tbody></table>
      ${lowStock.length ? `<h2>Estoque crítico</h2><table><thead><tr><th>Item</th><th>Equipamento</th><th>Qtd</th><th>Mínimo</th></tr></thead><tbody>
        ${lowStock.map(i=>{const eq=data.equipments.find(e=>e.id===i.equipmentId);return`<tr><td>${i.name}</td><td>${eq?.name||"—"}</td><td>${i.quantity}</td><td>${i.minQuantity||0}</td></tr>`;}).join("")}
      </tbody></table>` : ""}
      <h2>Próximas preventivas pendentes</h2>
      <table><thead><tr><th>Título</th><th>Equipamento</th><th>Responsável</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>
        ${data.preventives.filter(p=>p.status!=="Concluída").sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).slice(0,10).map(p=>{
          const eq=data.equipments.find(e=>e.id===p.equipmentId);
          const overdue=new Date(p.dueDate)<new Date();
          return`<tr><td>${p.title}</td><td>${eq?.name||"—"}</td><td>${getPreventiveResponsibleName(p)}</td><td style="${overdue?"color:#c0392b;font-weight:bold":""}">${formatDate(p.dueDate)}</td><td>${p.status}</td></tr>`;
        }).join("")}
      </tbody></table>
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); };
  });
}

function renderDonut(segments) {
  const total = segments.reduce((s, i) => s + i.value, 0);
  if (!total) return '<p class="report-empty">Sem dados no período.</p>';
  let offset = 0;
  const r = 54, cx = 64, cy = 64, stroke = 22;
  const circ = 2 * Math.PI * r;
  const arcs = segments.map(seg => {
    const pct = seg.value / total;
    const dash = pct * circ;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}"
      stroke-width="${stroke}" stroke-dasharray="${dash} ${circ - dash}"
      stroke-dashoffset="${-offset * circ}" transform="rotate(-90 ${cx} ${cy})"
      style="cursor:default" title="${seg.label}: ${seg.value}"/>`;
    offset += pct;
    return arc;
  }).join("");
  const legend = segments.map(seg => `
    <div class="donut-legend-item">
      <span class="legend-dot" style="background:${seg.color}"></span>
      <span>${escapeHtml(seg.label)}</span>
      <strong>${seg.value}</strong>
    </div>`).join("");
  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 128 128" width="128" height="128">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2ee" stroke-width="${stroke}"/>
        ${arcs}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          font-size="18" font-weight="700" fill="#18211f">${total}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}
