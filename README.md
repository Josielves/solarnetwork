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
```

---

## 1 · Supabase

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
```

---

## Próximos passos sugeridos

- Adicionar **Supabase Auth** para login por e-mail/senha
- Proteger as API routes com verificação de JWT
- Criar `PATCH /api/leads/:id` para mover cards no kanban
- Adicionar **Realtime** do Supabase para atualizar o funil em tempo real
