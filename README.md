<<<<<<< HEAD
# iSolar — Deploy na Vercel + Supabase

## Estrutura do projeto

```
isolar/
├── api/                      # Serverless functions (Vercel)
│   ├── leads.js              # GET /api/leads  |  POST /api/leads
│   ├── companies.js          # GET /api/companies
│   ├── kits.js               # GET /api/kits
│   ├── users.js              # GET /api/users
│   └── activities.js         # GET /api/activities
├── public/                   # Frontend estático
│   ├── index.html
│   ├── app.js                # Consome as API routes
│   └── styles.css
├── supabase_schema.sql       # Execute uma vez no SQL Editor do Supabase
├── vercel.json
├── package.json
└── .env.example
=======
# iSolar v3 — Deploy Completo

## Estrutura
```
isolar_v3/
├── frontend/          → deploy na Vercel
│   ├── index.html
│   ├── app.js         ← configure SUPABASE_ANON_KEY e BACKEND_URL
│   └── styles.css
├── backend/           → deploy no Railway
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/    (leads, whatsapp, stripe)
│   │   ├── services/  (supabase, whatsapp, stripe)
│   │   └── middleware/(auth)
│   ├── package.json
│   └── railway.toml
└── supabase_schema.sql
>>>>>>> edd916a (Atualização do sistema)
```

---

## 1 · Supabase

<<<<<<< HEAD
1. Crie um projeto em [supabase.com](https://supabase.com)
2. Acesse **SQL Editor** e execute o conteúdo de `supabase_schema.sql`
   — isso cria as tabelas, RLS e já insere os dados de exemplo.
3. Anote:
   - **Project URL** → `Settings > API > Project URL`
   - **service_role key** → `Settings > API > Project API keys > service_role` _(secret)_

---

## 2 · Vercel

### Via Vercel CLI (recomendado)

```bash
npm i -g vercel
vercel login
vercel          # na raiz do projeto — responde às perguntas
```

### Variáveis de ambiente

No dashboard da Vercel, vá em **Project > Settings > Environment Variables** e adicione:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | `https://SEU_ID.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` |

> Para dev local crie `.env.local` com os mesmos valores e rode `vercel dev`.

### Via GitHub

1. Suba o projeto para um repositório GitHub
2. No dashboard da Vercel clique **Add New Project** e importe o repositório
3. Adicione as variáveis de ambiente acima
4. Clique **Deploy** ✓

---

## 3 · Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencha com suas chaves
vercel dev                    # sobe frontend + API routes em localhost:3000
=======
1. Crie projeto em [supabase.com](https://supabase.com)
2. **SQL Editor** → cole e execute `supabase_schema.sql`
3. Anote:
   - **Project URL** → Settings > API > Project URL
   - **anon key** → Settings > API > anon/public
   - **service_role key** → Settings > API > service_role
   - **JWT Secret** → Settings > API > JWT Settings

---

## 2 · Backend no Railway

1. Crie conta em [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub repo** (suba a pasta `backend/` num repo)
3. **Variables** → adicione:

```
PORT=3000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
FRONTEND_URL=https://solarnetwork-kappa.vercel.app
```

4. Railway gera uma URL tipo `https://isolar-backend.up.railway.app`

---

## 3 · Stripe

1. Crie conta em [stripe.com](https://stripe.com)
2. **Products** → crie 3 produtos com preços recorrentes:
   - Starter R$97/mês
   - Integrator Pro R$297/mês
   - Enterprise R$897/mês
3. Copie os `price_id` de cada um para as env vars do Railway
4. **Webhooks** → adicione endpoint: `https://SEU-BACKEND.railway.app/api/stripe/webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
5. Copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET`

---

## 4 · Frontend na Vercel

1. Abra `frontend/app.js` e configure linhas 5-6:
```js
const SUPABASE_ANON_KEY = "sb_publishable_...";  // anon key do Supabase
const BACKEND_URL       = "https://isolar-backend.up.railway.app"; // URL do Railway
```
2. Suba os 3 arquivos (`index.html`, `app.js`, `styles.css`) no GitHub
3. **Vercel** → Import → seleciona o repo → Deploy

---

## 5 · Criar admin

No **Supabase → SQL Editor**:
```sql
-- Substitua os valores
INSERT INTO tenants (name, slug, role, initials, plan)
VALUES ('iSolar Admin', 'isolar-admin', 'Admin', 'iS', 'enterprise');

-- Depois crie usuário em Authentication > Users, então:
INSERT INTO profiles (id, tenant_id, name, email, role)
SELECT u.id, t.id, 'Admin', u.email, 'owner'
FROM auth.users u, tenants t
WHERE u.email = 'SEU_EMAIL' AND t.slug = 'isolar-admin';
>>>>>>> edd916a (Atualização do sistema)
```

---

<<<<<<< HEAD
## Próximos passos sugeridos

- Adicionar **Supabase Auth** para login por e-mail/senha
- Proteger as API routes com verificação de JWT
- Criar `PATCH /api/leads/:id` para mover cards no kanban
- Adicionar **Realtime** do Supabase para atualizar o funil em tempo real
=======
## Funcionalidades por módulo

| Módulo | Status | Depende de |
|--------|--------|-----------|
| Auth (login/signup) | ✅ Completo | Supabase |
| Multi-tenant | ✅ Completo | Supabase RLS |
| Dashboard + Gráficos | ✅ Completo | Backend |
| Pipeline Kanban | ✅ Completo | Backend |
| Network | ✅ Completo | Backend |
| Marketplace de Kits | ✅ Completo | Backend |
| WhatsApp (QR + mensagens) | ✅ Completo | Railway + Baileys |
| Assinatura (Stripe) | ✅ Completo | Stripe + Railway |
| Admin (usuários + config) | ✅ Completo | Supabase |
| Dark Mode | ✅ Completo | – |
>>>>>>> edd916a (Atualização do sistema)
