# Deploy — Cloudflare Pages via GitHub Actions

O deploy de produção roda no GitHub Actions (`.github/workflows/deploy.yml`) a
cada push/merge na branch `main` (ou manualmente em **Run workflow**). O
workflow testa, garante o D1, aplica a migração, publica no Cloudflare Pages e
valida `https://forca-caos.pages.dev/api/health`.

## Por que o deploy falhou (erro 9109)

O token `CLOUDFLARE_API_TOKEN` foi criado com **Client IP Address Filtering**.
O runner do GitHub usa outro IP, então a API responde:

```
Cannot use the access token from location: ... [code: 9109]
```

Nenhuma chave vazou: o problema é só a restrição de IP do token. A correção é
criar um token novo **sem filtro de IP** com o menor escopo possível.

## 1. Criar o token novo (dashboard Cloudflare)

1. Acesse <https://dash.cloudflare.com/profile/api-tokens> → **Create Token**.
2. **Create Custom Token**.
3. Nome: `forca-caos-github-deploy`.
4. Permissões (mínimo necessário):
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Account** → **D1** → **Edit**
   - **Account** → **Account Settings** → **Read**
5. **Account Resources:** Include → conta `6de83c2e29576516d99ef9e486c81a59`.
6. **Client IP Address Filtering:** deixe **vazio** (Any IP). Este é o ponto
   que resolve o código 9109.
7. (Opcional) Defina expiração, por exemplo 1 ano.
8. **Continue to summary** → **Create Token** → copie o valor **uma vez**.

> Nunca cole o token no chat, em arquivos do repositório, em issues ou em
> comandos com histórico. O valor só deve existir no seu gerenciador de
> segredos e no secret do GitHub.

## 2. Atualizar o secret no GitHub (sem expor a chave)

### Opção A — GitHub CLI (recomendado)

No seu terminal local, dentro do repositório:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo lewou12/forca-caos
```

O comando abre um prompt e lê o valor sem ecoar na tela; ele não fica no
histórico do shell. Cole o token e confirme.

Confira que o secret existe (o valor não é exibido):

```bash
gh secret list --repo lewou12/forca-caos
```

Garanta também o account ID (não é segredo sensível):

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --repo lewou12/forca-caos --body 6de83c2e29576516d99ef9e486c81a59
```

### Opção B — Interface do GitHub

1. Repositório → **Settings** → **Secrets and variables** → **Actions**.
2. Em `CLOUDFLARE_API_TOKEN`, clique em **Update** e cole o token novo.
3. Salve. O GitHub mascara o valor em todos os logs.

## 3. Revogar o token antigo

Em <https://dash.cloudflare.com/profile/api-tokens>, localize o token antigo e
clique em **Delete**. Assim, mesmo que ele tenha sido exposto em algum lugar,
deixa de funcionar.

## 4. Disparar o deploy

Qualquer push na `main` dispara o workflow. Para rodar sem novo commit:

1. GitHub → **Actions** → **Deploy Cloudflare Pages** → **Run workflow**.
2. Acompanhe os passos: testes → D1 → migração → projeto Pages → binding D1 →
   deploy → health check.

Ou pela CLI:

```bash
gh workflow run "Deploy Cloudflare Pages" --repo lewou12/forca-caos
gh run list --repo lewou12/forca-caos --limit 1
```

## O que o workflow garante

- Roda `npm test` e `npm run check` antes de publicar.
- Cria o D1 `forca-caos-db` se não existir e injeta o `database_id` real no
  `wrangler.toml` do runner (nada é commitado).
- Aplica `migrations/0001_init.sql` no D1 remoto (idempotente).
- Cria o projeto Pages `forca-caos` se necessário.
- Fixa o binding `DB → forca-caos-db` no projeto via API.
- Publica `public/` e falha se `/api/health` não retornar `"db":"ok"`.

## Verificação manual

- `https://forca-caos.pages.dev/api/health` → `{"ok":true,"db":"ok"}`
- Abra `https://forca-caos.pages.dev` e crie uma sala.

## Desenvolvimento local

- `npm run dev` sobe o Pages local em `http://127.0.0.1:8788`.
- O `database_id` no `wrangler.toml` é um placeholder; em produção o workflow
  substitui pelo ID real apenas no runner, e o binding do projeto é fixado
  pela API.
- Nenhum token fica no repositório: o workflow lê apenas
  `secrets.CLOUDFLARE_API_TOKEN` e `secrets.CLOUDFLARE_ACCOUNT_ID`.

## Se o deploy falhar

| Sintoma | Causa provável | Correção |
|---|---|---|
| `code: 9109` | token com filtro de IP | criar token sem filtro (passo 1) |
| `code: 10000` / `Authentication error` | token inválido/revogado | repetir passos 1–2 |
| `Authentication error [code: 10000]` em Pages | permissão faltando | incluir `Cloudflare Pages: Edit` |
| `health` retorna 503 | binding `DB` ausente | verificar o passo "Fixar binding D1" |
| build falha por Node | versão do runner | workflow já fixa Node 22 |
