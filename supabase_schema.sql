-- iSolar – Schema Supabase
-- Execute no SQL Editor do seu projeto Supabase

-- ─── Leads ───────────────────────────────────────────────────────────────────
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text not null,
  state       char(2) not null,
  power       numeric(10,2) not null,
  stage       text not null default 'Novo'
                check (stage in ('Novo','Em disputa','Com proposta')),
  type        text not null default 'Outro',
  note        text,
  created_at  timestamptz default now()
);

-- ─── Companies (Rede) ────────────────────────────────────────────────────────
create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text not null
                check (role in ('Integrador','Engenharia','Distribuidor')),
  city        text not null,
  state       char(2) not null,
  rating      numeric(2,1) default 5.0,
  initials    char(2) not null,
  comment     text,
  permissions text[] default '{}',
  created_at  timestamptz default now()
);

-- ─── Kits ────────────────────────────────────────────────────────────────────
create table if not exists kits (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  distributor text not null,
  city        text not null,
  state       char(2) not null,
  price_cents integer not null,
  items       text[] default '{}',
  stock       integer default 0,
  created_at  timestamptz default now()
);

-- ─── Users ───────────────────────────────────────────────────────────────────
create table if not exists platform_users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique not null,
  role        text not null default 'Integrador',
  status      text not null default 'Ativo',
  created_at  timestamptz default now()
);

-- ─── Activities ──────────────────────────────────────────────────────────────
create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  detail      text,
  created_at  timestamptz default now()
);

-- ─── Row Level Security (leitura pública para MVP) ───────────────────────────
alter table leads           enable row level security;
alter table companies       enable row level security;
alter table kits            enable row level security;
alter table platform_users  enable row level security;
alter table activities      enable row level security;

-- Políticas de leitura anônima (ajuste conforme auth depois)
create policy "read leads"      on leads          for select using (true);
create policy "insert leads"    on leads          for insert with check (true);
create policy "read companies"  on companies      for select using (true);
create policy "read kits"       on kits           for select using (true);
create policy "read users"      on platform_users for select using (true);
create policy "read activities" on activities     for select using (true);

-- ─── Seed data ───────────────────────────────────────────────────────────────
insert into leads (name, city, state, power, stage, type, note) values
  ('Condominio Vista Verde', 'Campinas',      'SP', 42,  'Novo',         'Residencial coletivo', 'Busca reducao de conta e financiamento em 60x.'),
  ('Mercado Estrela',        'Ribeirao Preto','SP', 68,  'Em disputa',   'Comercial',            'Telhado metalico, decisao prevista para esta semana.'),
  ('Fazenda Boa Luz',        'Uberlandia',    'MG', 115, 'Com proposta', 'Rural',                'Precisa de estudo de solo e estrutura de solo.'),
  ('Padaria Sol Nascente',   'Curitiba',      'PR', 18,  'Novo',         'Comercial',            'Cliente quer payback menor que 4 anos.'),
  ('Clínica Amaral',         'Goiania',       'GO', 26,  'Em disputa',   'Saude',                'Tem demanda por backup para cargas criticas.'),
  ('Galpao Jatoba',          'Fortaleza',     'CE', 91,  'Com proposta', 'Industrial',           'Precisa comparar kit string e microinversor.');

insert into companies (name, role, city, state, rating, initials, comment, permissions) values
  ('SolPrime Energia',    'Integrador',  'Campinas',       'SP', 4.8, 'SP', 'Equipe rapida no atendimento e pos-venda organizado.',          array['leads','kits','network']),
  ('Nexo Solar Projetos', 'Engenharia',  'Belo Horizonte', 'MG', 4.9, 'NS', 'Memoriais e homologacoes sem retrabalho.',                      array['network','projects']),
  ('VoltSul Distribuidora','Distribuidor','Curitiba',       'PR', 4.7, 'VS', 'Boa disponibilidade de inversores e entrega previsivel.',        array['kits','network']),
  ('Alfa FV Instalacoes', 'Integrador',  'Goiania',        'GO', 4.5, 'AF', 'Atua bem em projetos comerciais de medio porte.',               array['leads','kits','network']),
  ('EngSol Consultoria',  'Engenharia',  'Fortaleza',      'CE', 4.6, 'ES', 'Especialistas em usinas de solo e laudos tecnicos.',             array['network','projects']),
  ('Brasil PV Supply',    'Distribuidor','Ribeirao Preto', 'SP', 4.4, 'BP', 'Kits competitivos para residenciais e pequenos comercios.',      array['kits','network']);

insert into kits (title, distributor, city, state, price_cents, items, stock) values
  ('Kit Residencial 6,6 kWp', 'Brasil PV Supply',    'Ribeirao Preto', 'SP', 1289000, array['12 modulos 550 W','Inversor 6 kW','String box CA/CC'],          34),
  ('Kit Comercial 25 kWp',    'VoltSul Distribuidora','Curitiba',       'PR', 5240000, array['46 modulos TOPCon','Inversor 25 kW','Estrutura metalica'],       12),
  ('Kit Solo 75 kWp',         'Brasil PV Supply',    'Campinas',       'SP',16890000, array['136 modulos bifaciais','3 inversores 25 kW','Estrutura solo'],    5);

insert into platform_users (name, email, role, status) values
  ('Marina Costa',   'admin@isolar.com',       'Administrador', 'Ativo'),
  ('Rafael Lima',    'rafael@solprime.com',    'Integrador',    'Assinante'),
  ('Bianca Torres',  'bianca@nexosolar.com',   'Engenharia',    'Ativo'),
  ('Eduardo Reis',   'eduardo@voltsul.com',    'Distribuidor',  'Pendente');

insert into activities (title, detail) values
  ('Lead novo recebido', 'Condominio Vista Verde entrou no funil em Campinas, SP.'),
  ('Kit atualizado',     'VoltSul publicou nova condicao para 25 kWp.'),
  ('Avaliacao registrada','SolPrime recebeu 5 estrelas de um cliente final.'),
  ('Parceria iniciada',  'Nexo Solar aceitou cotar projeto para Alfa FV.');
