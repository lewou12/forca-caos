# Estado da Esteira — FORCA//CAOS

> Projeto: Jogo da Forca Multiplayer Competitivo com Power-Ups
> Repositório: https://github.com/lewou12/forca-caos
> Deploy: Cloudflare Pages + D1 (CI/CD via GitHub Actions)

## Status atual

| Fase | Persona | Status | Entregável |
|---|---|---|---|
| 1 — Ideação | Visionário Pé no Chão | ✅ Concluída | `debate_log.md` (core loop) |
| 2 — Design & UX | Game Designer Sênior | ✅ Concluída | `GDD.md` |
| 3 — Arquitetura & Código | Engenheiro Veterano | ✅ Concluída | Frontend + Functions + D1 |
| 4 — QA & Automação | QA Implacável | ✅ Concluída | 49 testes + smoke + workflows |
| 5 — Segurança | Analista Paranoico | ✅ Concluída | Auditoria + patches |
| 6 — DevOps | Mestre Git/Cloudflare | 🔄 Em andamento | Push + deploy Pages |

## Decisões-chave

- **Stack:** Vanilla JS (ES Modules) + CSS artesanal + Cloudflare Pages Functions + D1.
- **Tempo real:** polling versionado (~700 ms) com snapshots autoritativos; D1 como fonte da verdade.
- **Anti-cheat:** 100% da validação no backend; palavras nunca saem do servidor antes do fim da rodada.
- **Concorrência:** estado da sala em JSON único + CAS (`WHERE version = ?`) com retry.
- **XSS:** construção de DOM + `textContent`, sanitização de nomes por allowlist e CSP estrita.
- **Sem build de frontend:** `public/` é servido direto pelo Pages.
- **Sem dependências de runtime:** apenas `vitest` e `wrangler` em devDependencies.

## Entregas por fase

### Fase 3 — Arquitetura & Código

- `shared/`: constantes, dicionário (121/103/149/100 palavras por tamanho), engine puro, CAS, store D1, HTTP, rate limit e validação.
- `functions/`: middleware e rotas `health`, `rooms` (create), `join`, `state`, `start`, `guess`, `powerup`, `leave`.
- `public/`: Home, Lobby, Jogo, Panorama, Resultado da rodada, Pódio, seletor de alvo, overlays de Cegueira/Tinta, toasts, som sintetizado e layout mobile-first.
- `migrations/0001_init.sql`: tabelas `rooms` e `rate_limits`.
- Identidade visual "caos neon", forca em SVG desenhada por partes, teclado físico e virtual.

### Fase 4 — QA & Automação

- `tests/engine.test.js` — 24 testes de regras, rodadas, pontuação, power-ups e anti-cheat.
- `tests/security.test.js` — 16 testes de sanitização, vazamento de segredos, máscaras e poluição de protótipo.
- `tests/race.test.js` — 9 testes de concorrência no CAS e no consumo de cargas/chutes.
- `scripts/smoke.mjs` — 32 verificações ponta a ponta contra Pages local/remoto.
- `scripts/check.mjs` — 39 verificações estáticas (sintaxe, arquivos, CSP, invariantes).
- `.github/workflows/test.yml` — `npm ci`, testes, checagem, D1 local e smoke no CI.

### Fase 5 — Segurança

- Nomes por allowlist Unicode; controles, tags e zero-width removidos.
- Snapshot por allowlist: sem `word`, sem `token`, sem `guessed` de terceiros.
- Tinta/Cegueira também apagam `lastAction.letter` (correção de vazamento).
- Tokens de 32 bytes comparados em tempo constante; `playerId` público.
- `actionId` validado e limitado a 12 por jogador (idempotência contra replay).
- Power-ups validados no engine: carga, alvo, cooldown, imunidade e protótipo.
- CSP, `nosniff`, `DENY` de frame, `Referrer-Policy` e `Permissions-Policy`.
- `_routes.json` expõe Functions apenas em `/api/*`.
- Rate limit por IP anonimizado (SHA-256) em criação/entrada; cooldowns por ação.

## Log de execução

- 2026-11-05 — Esteira iniciada. Ambiente verificado: Node 26, Git 2.55, GitHub CLI autenticado (`lewou12`), conta Cloudflare identificada (`6de83c2e…`). Token Cloudflare local bloqueado por restrição de IP (código 9109) — deploy será executado via GitHub Actions com secrets.
- 2026-11-05 — Fases 1 e 2 concluídas (`debate_log.md`, `GDD.md`).
- 2026-11-05 — Fase 3 concluída: engine, Functions, D1 e frontend completos.
- 2026-11-05 — Fase 4 concluída: 49 testes unitários, 32 checagens de smoke e 39 verificações estáticas passando; fluxo completo validado no navegador (criar → entrar → jogar → 3 rodadas → pódio → revanche → sair).
- 2026-11-05 — Fase 5 concluída: auditoria aplicada e vazamento de `lastAction` corrigido.
- 2026-11-05 — Fase 6 em andamento: repositório, secrets e deploy.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Latência D1 no polling | payload pequeno; `no-store`; polling adaptativo |
| Custo de leituras D1 | 700 ms apenas com aba visível; pausa em background |
| Token em localStorage | CSP + sanitização + token restrito à sala |
| Dicionário pequeno | 100–149 palavras por tamanho; teste automatizado |
| Jogador fecha o navegador | assento preservado; reconexão por token |
| Sala órfã | TTL de 6 h + remoção quando todos saem |
| Token CF sem permissão/IP | deploy via GitHub Actions; diagnóstico no CI |
