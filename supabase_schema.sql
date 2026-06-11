-- ═══════════════════════════════════════════════════════════════════════════
-- iSolar v2 — Schema Multi-tenant
-- Execute no SQL Editor do Supabase (apague tudo antes se estiver recriando)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extensões ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Tenants (empresas na plataforma) ────────────────────────────────────────
create table if not exists tenants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text unique not null,
  role         text not null check (role in ('Integrador','Engenharia','Distribuidor','Admin')),
  city         text,
  state        char(2),
  logo_url     text,
  rating       numeric(2,1) default 5.0,
  initials     text not null default 'iS',
  comment      text,
  permissions  text[] default '{}',
  plan         text not null default 'free' check (plan in ('free','starter','pro','enterprise')),
  plan_expires_at timestamptz,
  created_at   timestamptz default now()
);

-- ─── Profiles (usuários ligados a um tenant via Supabase Auth) ───────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid references tenants(id) on delete cascade,
  name       text not null,
  email      text not null,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  avatar_url text,
  created_at timestamptz default now()
);

-- ─── Leads ───────────────────────────────────────────────────────────────────
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  name        text not null,
  city        text not null,
  state       char(2) not null,
  power       numeric(10,2) not null,
  stage       text not null default 'Novo'
                check (stage in ('Novo','Contato','Proposta','Negociação','Fechado','Perdido')),
  type        text not null default 'Outro',
  note        text,
  value_brl   numeric(12,2),
  contact_name  text,
  contact_phone text,
  contact_email text,
  assigned_to uuid references profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── Activities ──────────────────────────────────────────────────────────────
create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  title       text not null,
  detail      text,
  type        text default 'info' check (type in ('info','lead','kit','rating','partner','alert')),
  created_at  timestamptz default now()
);

-- ─── Kits ────────────────────────────────────────────────────────────────────
create table if not exists kits (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,
  title         text not null,
  distributor   text not null,
  city          text not null,
  state         char(2) not null,
  price_cents   integer not null,
  items         text[] default '{}',
  stock         integer default 0,
  active        boolean default true,
  created_at    timestamptz default now()
);

-- ─── Subscriptions ───────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  plan         text not null,
  status       text not null default 'active' check (status in ('active','canceled','past_due','trialing')),
  price_brl    numeric(10,2),
  started_at   timestamptz default now(),
  expires_at   timestamptz,
  stripe_sub_id text
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — Row Level Security (Multi-tenant isolation)
-- ═══════════════════════════════════════════════════════════════════════════

alter table tenants       enable row level security;
alter table profiles      enable row level security;
alter table leads         enable row level security;
alter table activities    enable row level security;
alter table kits          enable row level security;
alter table subscriptions enable row level security;

-- Helper: retorna o tenant_id do usuário logado
create or replace function auth_tenant_id()
returns uuid language sql stable as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- Tenants: cada usuário vê apenas o seu tenant
create policy "tenant: select own"  on tenants for select using (id = auth_tenant_id());
create policy "tenant: insert"      on tenants for insert with check (true); -- signup
create policy "tenant: update own"  on tenants for update using (id = auth_tenant_id());

-- Profiles: vê todos do mesmo tenant
create policy "profile: select same tenant" on profiles for select using (tenant_id = auth_tenant_id());
create policy "profile: insert own"         on profiles for insert with check (id = auth.uid());
create policy "profile: update own"         on profiles for update using (id = auth.uid());

-- Leads: isolado por tenant
create policy "leads: select" on leads for select using (tenant_id = auth_tenant_id());
create policy "leads: insert" on leads for insert with check (tenant_id = auth_tenant_id());
create policy "leads: update" on leads for update using (tenant_id = auth_tenant_id());
create policy "leads: delete" on leads for delete using (tenant_id = auth_tenant_id());

-- Activities: isolado por tenant
create policy "activities: select" on activities for select using (tenant_id = auth_tenant_id());
create policy "activities: insert" on activities for insert with check (tenant_id = auth_tenant_id());

-- Kits: leitura pública, escrita por tenant
create policy "kits: select all"  on kits for select using (true);
create policy "kits: insert own"  on kits for insert with check (tenant_id = auth_tenant_id());
create policy "kits: update own"  on kits for update using (tenant_id = auth_tenant_id());

-- Subscriptions: isolado por tenant
create policy "subs: select" on subscriptions for select using (tenant_id = auth_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger: cria profile automaticamente no signup
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, tenant_id, name, email)
  values (
    new.id,
    (new.raw_user_meta_data->>'tenant_id')::uuid,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: tenant demo para testes
-- ═══════════════════════════════════════════════════════════════════════════
insert into tenants (id, name, slug, role, city, state, rating, initials, comment, permissions, plan)
values (
  '00000000-0000-0000-0000-000000000001',
  'SolPrime Energia', 'solprime', 'Integrador', 'Campinas', 'SP',
  4.8, 'SP', 'Equipe rápida no atendimento e pós-venda organizado.',
  array['leads','kits','network'], 'pro'
) on conflict do nothing;

insert into kits (tenant_id, title, distributor, city, state, price_cents, items, stock)
values
  ('00000000-0000-0000-0000-000000000001','Kit Residencial 6,6 kWp','Brasil PV Supply','Ribeirao Preto','SP',1289000,array['12 módulos 550 W','Inversor 6 kW','String box CA/CC'],34),
  ('00000000-0000-0000-0000-000000000001','Kit Comercial 25 kWp','VoltSul Distribuidora','Curitiba','PR',5240000,array['46 módulos TOPCon','Inversor 25 kW','Estrutura metálica'],12),
  ('00000000-0000-0000-0000-000000000001','Kit Solo 75 kWp','Brasil PV Supply','Campinas','SP',16890000,array['136 módulos bifaciais','3 inversores 25 kW','Estrutura solo'],5)
on conflict do nothing;

insert into activities (tenant_id, title, detail, type)
values
  ('00000000-0000-0000-0000-000000000001','Lead novo recebido','Condomínio Vista Verde entrou no funil em Campinas, SP.','lead'),
  ('00000000-0000-0000-0000-000000000001','Kit atualizado','VoltSul publicou nova condição para 25 kWp.','kit'),
  ('00000000-0000-0000-0000-000000000001','Avaliação registrada','SolPrime recebeu 5 estrelas de um cliente final.','rating'),
  ('00000000-0000-0000-0000-000000000001','Parceria iniciada','Nexo Solar aceitou cotar projeto para Alfa FV.','partner')
on conflict do nothing;
<<<<<<< HEAD
=======

-- ═══════════════════════════════════════════════════════════════════════════
-- iSolar v3 — Adições: WhatsApp Sessions + Stripe
-- ═══════════════════════════════════════════════════════════════════════════

-- WhatsApp sessions por tenant
create table if not exists whatsapp_sessions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade unique,
  status       text not null default 'disconnected'
                 check (status in ('disconnected','connecting','connected','banned')),
  phone        text,
  qr_code      text,
  session_data text, -- JSON serializado do creds.json do Baileys
  connected_at timestamptz,
  updated_at   timestamptz default now()
);

-- Mensagens WhatsApp
create table if not exists whatsapp_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  lead_id      uuid references leads(id),
  direction    text not null check (direction in ('in','out')),
  from_jid     text,
  to_jid       text,
  body         text,
  media_url    text,
  status       text default 'sent',
  wa_msg_id    text,
  created_at   timestamptz default now()
);

-- Stripe: produtos e preços (sincronizados via webhook)
create table if not exists stripe_products (
  id           text primary key, -- stripe price_id
  name         text not null,
  plan         text not null,
  price_brl    numeric(10,2),
  interval     text,
  active       boolean default true
);

-- Atualizar subscriptions com stripe_id
alter table subscriptions add column if not exists stripe_customer_id text;
alter table subscriptions add column if not exists stripe_price_id    text;
alter table subscriptions add column if not exists cancel_at_period_end boolean default false;

-- RLS para novas tabelas
alter table whatsapp_sessions  enable row level security;
alter table whatsapp_messages  enable row level security;
alter table stripe_products    enable row level security;

create policy "wa_sessions: own"  on whatsapp_sessions for all using (tenant_id = auth_tenant_id());
create policy "wa_messages: own"  on whatsapp_messages for all using (tenant_id = auth_tenant_id());
create policy "stripe_products: read" on stripe_products for select using (true);

-- Seed Stripe products
insert into stripe_products (id, name, plan, price_brl, interval, active) values
  ('price_free',       'Free',          'free',       0,   'month', true),
  ('price_starter',    'Starter',       'starter',    97,  'month', true),
  ('price_pro',        'Integrator Pro','pro',        297, 'month', true),
  ('price_enterprise', 'Enterprise',    'enterprise', 897, 'month', true)
on conflict do nothing;
>>>>>>> edd916a (Atualização do sistema)
