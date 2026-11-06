# Deploy — Cloudflare Pages (integração Git)

O deploy de produção é feito **pela própria Cloudflare Pages**, conectada ao
repositório GitHub. Todo push/merge na branch `main` dispara um novo build e
publica em `https://forca-caos.pages.dev`. Não existe deploy via GitHub Actions.

## Pré-requisitos

- Repositório: `https://github.com/lewou12/forca-caos`
- Conta Cloudflare com acesso a Workers & Pages e D1

## 1. Criar o banco D1

1. Cloudflare Dashboard → **Workers & Pages** → **D1** → **Create database**.
2. Nome: `forca-caos-db`.
3. Guarde o **Database ID** (não é necessário colar no repositório).

## 2. Criar o projeto Pages conectado ao GitHub

1. **Workers & Pages** → **Create application** → aba **Pages** →
   **Connect to Git** (ou **Import an existing Git repository**).
2. Autorize o GitHub e selecione `lewou12/forca-caos`.
3. Preencha:

| Campo | Valor |
|---|---|
| Project name | `forca-caos` |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `exit 0` |
| Build output directory | `public` |
| Root directory | `/` (padrão) |
| Environment variable | `NODE_VERSION=22` (opcional, recomendado) |

> Não é necessário build: o site é HTML/CSS/JS estático em `public/` e as
> Functions ficam em `functions/` na raiz do repositório.

## 3. Adicionar o binding D1

1. Projeto Pages → **Settings** → **Bindings** → **Add** →
   **D1 database**.
2. Variable name: `DB`.
3. D1 database: `forca-caos-db`.
4. Salve e faça um novo deploy (push na `main` ou **Retry deployment**).

## 4. Aplicar a migração no banco remoto

Opção A — pelo dashboard: **D1** → `forca-caos-db` → **Console** e execute o
conteúdo de `migrations/0001_init.sql`.

Opção B — via Wrangler, com um token Cloudflare válido:

```bash
npx wrangler d1 execute forca-caos-db --remote --file=migrations/0001_init.sql
```

## 5. Verificar

- `https://forca-caos.pages.dev/api/health` deve retornar
  `{"ok":true,"db":"ok"}`.
- Abra `https://forca-caos.pages.dev` e crie uma sala.

## Como funciona daqui em diante

- Push/merge na `main` → build + deploy de produção automático.
- Pull requests → preview deployments com URL própria.
- Os testes continuam no GitHub Actions (`.github/workflows/test.yml`), que é
  independente do deploy.

## Observações

- O `wrangler.toml` **não** versiona `database_id`; o binding de produção é
  definido no dashboard (passo 3).
- Para desenvolvimento local, `npm run dev` usa
  `--d1=DB=forca-caos-db` e o banco local em `.wrangler/state`.
- Se o build falhar por versão de Node, confirme a variável `NODE_VERSION=22`.
