# GDD — FORCA//CAOS
### Jogo da Forca Multiplayer Competitivo com Power-Ups

**Versão:** 1.0
**Data:** 2026-11-05
**Plataforma:** Web (mobile-first, desktop aprimorado)
**Stack:** Vanilla JS + CSS + Cloudflare Pages Functions + Cloudflare D1
**Partidas:** 2–6 jogadores, 3 rodadas de 90 s

---

## 1. Visão

**Forca//Caos** é uma forca de salão transformada em corrida competitiva. Todos recebem palavras diferentes do mesmo tamanho, começam juntos e veem, em tempo real, o progresso dos rivais. Power-ups permitem acelerar, sabotar e retaliar. A pergunta central de cada rodada não é "qual é a palavra?", mas **"quanto eu arrisco revelar antes de virar alvo?"**.

### Pilares

1. **Corrida visível:** você sempre sabe quem está perto de vencer.
2. **Caos legível:** todo ataque é anunciado, tem dono, alvo e contra-jogo.
3. **Mérito:** o servidor valida tudo; não existe vantagem por editar o cliente.
4. **Partidas curtas:** 4–6 minutos no total; revanche em um clique.
5. **Acessível:** funciona em celular antigo, teclado físico ou virtual, com movimento reduzido.

### Anti-pilares

- Não é um jogo de palavras solo com placar.
- Não tem turnos, loja, loot box ou compra de vantagem.
- Não pune o jogador com telas de espera longas.
- Não expõe a palavra secreta no cliente antes do fim da rodada.

---

## 2. Core loop

```
CRIAR/ENTRAR (código) → LOBBY (2–6) → RODADA 1 → RESUMO → RODADA 2 → RESUMO → RODADA 3 → PODIUM → REVANCHE
```

### 2.1 Fluxo detalhado

1. **Home:** nome + criar sala (tamanho da palavra) ou entrar com código/link.
2. **Lobby:** código grande e copiável, lista de jogadores, configurações, botão "Iniciar" (host).
3. **Início:** servidor sorteia palavras únicas do mesmo tamanho para cada jogador.
4. **Rodada (90 s):**
   - Chute uma letra por vez (A–Z). Acertos revelam todas as ocorrências.
   - 6 erros completam o boneco → eliminação na rodada.
   - Combo: acertos consecutivos. A cada 3, ganha power-up.
   - Tempo: a cada 30 s, ganha power-up (se tiver < 5 cargas).
   - Resolver a palavra: bônus + poder.
5. **Fim da rodada:** quando todos resolvem/eliminam ou o tempo zera. Resumo por 7 s com palavras reveladas.
6. **Próxima rodada:** palavras novas, mesmo tamanho, erros/combo resetados; placar e power-ups permanecem.
7. **Fim do match:** após 3 rodadas, maior pontuação vence. Revanche reinicia o match no mesmo lobby.

### 2.2 Condições de fim

| Evento | Condição | Resultado |
|---|---|---|
| Rodada encerra | Todos resolveram ou foram eliminados | Resumo imediato |
| Rodada encerra | `agora >= roundEndsAt` | Resumo |
| Jogador elimina | 6 erros | Fica espectador da rodada, não age |
| Match encerra | 3 rodadas concluídas | Pódio e vencedor |
| Sala vazia | Todos saem | Sala é removida |
| Sala expira | 6 h sem movimento | Removida na próxima criação |

---

## 3. Regras

### 3.1 Sala

- Código de 5 caracteres `A–Z, 2–9` (sem I, O, 0, 1 para evitar confusão).
- 2 a 6 jogadores. Host é quem cria; se o host sair no lobby, o próximo jogador vira host.
- Nome: 2–16 caracteres, allowlist Unicode de letras/números/espaço/`.`/`_`/`-`. Sem HTML, sem caracteres de controle.
- Configuração do host no lobby: tamanho da palavra (5, 6, 7 ou 8). Rodadas fixas em 3, duração 90 s.
- Link compartilhável: `/?sala=ABCDE` (pré-preenche o código).

### 3.2 Palavras

- Dicionário embutido no servidor, apenas A–Z (sem acentos, para teclado universal).
- **Mesma quantidade de letras para todos; palavras diferentes entre jogadores e entre rodadas.**
- Nunca repetir palavra já usada na sala.
- Máscara calculada no servidor. O cliente recebe apenas letras já reveladas.
- No resumo/fim, as palavras são reveladas.

### 3.3 Chutes

- Uma letra `A–Z` por ação; acentos são normalizados no cliente.
- Repetir letra já chutada não penaliza e não pontua (idempotente).
- Acerto: +10 pontos + bônus de combo (até +10). Revela todas as ocorrências.
- Erro: +1 segmento no boneco; combo zera; sem perda de pontos.
- Resolver: +60 + bônus de tempo (`⌊segundos restantes / 2⌋`, máx. 45) + 1 power-up.
- Eliminado: 6 erros; não pode chutar nem usar power-ups até o fim da rodada.
- Cegueira bloqueia chutes por 3 s no servidor (não é só visual).

### 3.4 Pontuação

| Ação | Pontos |
|---|---|
| Letra correta | 10 + min(combo × 2, 10) |
| Resolver a palavra | 60 + bônus de tempo |
| 1º / 2º / 3º na rodada | 30 / 20 / 10 |
| Sanguessuga | transfere 20 do alvo |
| Sobrecarga | próximo acerto ×3 |
| Erro | 0 (mas perde combo e ganha boneco) |

**Ranking da rodada:** resolvidos primeiro (por horário de solução), depois não resolvidos por letras reveladas (desc) e erros (asc). Eliminados ficam ao fim.

**Desempate do match:** pontos totais → rodadas vencidas → letras reveladas na última rodada → ordem de entrada.

### 3.5 Power-ups

Inventário máximo: **5 cargas**. Começa com 1 **Oráculo**. Aquisição:
- a cada 3 acertos consecutivos;
- ao resolver a palavra;
- a cada 30 s de rodada (se < 5 cargas).

Ataques exigem alvo válido (vivo, não resolvido, ≠ você). Cooldown do atacante: 4 s. Invulnerabilidade do alvo: 2 s após receber um ataque (não bloqueia, apenas impede novo ataque imediato). Escudo bloqueia o próximo ataque e é consumido.

| ID | Nome | Tipo | Efeito | Duração | Raridade |
|---|---|---|---|---|---|
| `oraculo` | Oráculo | Suporte | Revela 1 consoante correta não revelada (fallback: qualquer letra). | — | Comum |
| `vendaval` | Vendaval | Ataque | Remove 1 letra revelada do alvo; ela volta a ser chutável. | — | Comum |
| `cegueira` | Cegueira | Ataque | Bloqueia chutes do alvo e oculta a máscara dele para ele. | 3 s | Comum |
| `tinta` | Bomba de Tinta | Ataque | Oculta os slots de letras do alvo para a sala. | 6 s | Comum |
| `escudo` | Escudo | Defesa | Bloqueia o próximo ataque recebido; visível na sala. | 15 s | Incomum |
| `bencao` | Bênção | Defesa | Remove 1 erro; revive eliminado com 5 erros. | — | Incomum |
| `sobrecarga` | Sobrecarga | Buff | Próximo acerto vale 3×. | 20 s | Incomum |
| `sanguessuga` | Sanguessuga | Ataque | Transfere 20 pontos do alvo para você. | — | Raro |
| `roubo` | Roubo de Carga | Ataque | Rouba 1 carga aleatória do alvo. | — | Raro |
| `trovao` | Trovão | Ataque | Força 1 erro no alvo. | — | Raro |
| `chuva` | Chuva de Letras | Global | Revela 1 letra aleatória para cada jogador ativo (inclusive você). | — | Raro |

**Regras de resolução:**
- Escudo tem prioridade: consome o ataque e o escudo; o atacante perde a carga.
- Vendaval só é válido se o alvo tem letra revelada.
- Roubo só é válido se o alvo tem carga.
- Sanguessuga só é válido se o alvo tem pontos.
- Cegueira/Tinta não empilham: renovam para o maior timestamp.
- Bênção reduz 1 erro (mínimo 0) e remove o estado eliminado.
- Ataques em alvo com invulnerabilidade ativa são rejeitados no servidor.

### 3.6 Tempo real e presença

- Snapshot autoritativo a cada **700 ms** durante a partida e **1.200 ms** no lobby (visível).
- Cliente pausa polling com a aba oculta e retoma ao voltar.
- `serverNow` no snapshot corrige relógio; contagens regressivas são locais.
- Se o polling falhar: backoff exponencial (1 s → 8 s), banner "reconectando", retomada automática.
- Jogador é considerado desconectado após 45 s sem polling/ação; o assento é preservado.
- Refresh reconecta via `playerId + token` no `localStorage`.

---

## 4. Visão Panorâmica (requisito central)

### 4.1 Objetivo

Responder em menos de 1 segundo: **quem está perto de vencer, quem está prestes a morrer e quem está vulnerável a um ataque?**

### 4.2 Conteúdo por adversário

- Nome, cor de identidade, badge de host, indicador online.
- Score total e posição ao vivo (1º, 2º…), com coroa no líder.
- Mini-forca SVG com 0–6 segmentos visíveis.
- Slots de letras: letras descobertas visíveis; ocultas como `•` (nunca a palavra).
- Contador `reveladas / total` e barra de progresso.
- Erros `x/6` e estado "eliminado" / "resolveu".
- Efeitos públicos: Escudo, Cegueira, Tinta, Sobrecarga (com countdown).
- Última ação resumida (ex.: "chutou A", "usou Vendaval em você").
- Alvo clicável quando um power-up de ataque está selecionado.

### 4.3 Layout desktop (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ FORCA//CAOS   SALA ABCDE [copiar]     RODADA 2/3      ⏱ 01:12        │
├───────────────────────────────────────────────┬──────────────────────┤
│  SUA FORCA                                    │  PANORAMA DA SALA    │
│  ┌──────────┐  P A L _ V R A                  │  ┌────┐ ┌────┐      │
│  │  boneco  │  █ █ █ ░ █ █ █                  │  │mini│ │mini│      │
│  │   SVG    │  erros ●●○○○○   combo x4         │  │forca│ │forca│     │
│  └──────────┘                                 │  └────┘ └────┘      │
│  [A][B][C][D][E][F][G][H][I][J][K][L][M]      │  ┌────┐ ┌────┐      │
│  [N][O][P][Q][R][S][T][U][V][W][X][Y][Z]      │  │mini│ │mini│      │
│                                               │  └────┘ └────┘      │
│  POWER-UPS   [Oráculo x1] [Vendaval x2] ...   │  ─────────────────   │
│                                               │  FEED DA SALA        │
│                                               │  ⚡ Ana usou Trovão  │
│                                               │  🏆 Léo resolveu!    │
└───────────────────────────────────────────────┴──────────────────────┘
```

- Coluna esquerda: 65% (forca grande, teclado, power-ups).
- Coluna direita: 35% (panorama em grid 2×N + feed).
- Header fixo com timer e código.

### 4.4 Layout mobile (< 768 px)

```
┌─────────────────────────┐
│ FORCA//CAOS  ABCDE  ⏱   │
├─────────────────────────┤
│ SUA FORCA               │
│  ┌────┐ P A L _ V R A   │
│  │SVG │ ●●○○○○  combo x4│
│  └────┘                 │
│  [teclado 7 colunas]    │
│  [power-ups scroll →]   │
├─────────────────────────┤
│ PANORAMA (scroll →)     │
│ [card] [card] [card]    │
├─────────────────────────┤
│ FEED (últimas 3)        │
└─────────────────────────┘
```

- Ordem mobile-first: sua forca → power-ups → panorama → feed.
- Teclado com alvos de 44×44 px; letras usadas ficam desabilitadas.
- Cards de adversário com largura 150–170 px em scroll horizontal com snap.
- Header compacto; código permanece copiável.

### 4.5 Atualizações e animações

- Letra revelada: flip 3D de 180 ms + brilho.
- Segmento do boneco: `stroke-dashoffset` 250 ms.
- Card de adversário: pulso de borda 500 ms quando o snapshot muda.
- Ataque recebido: shake de 220 ms + flash vermelho; respeita `prefers-reduced-motion`.
- Cegueira: overlay de tempestade com countdown 3…2…1.
- Tinta: mancha SVG sobre os slots do alvo por 6 s.
- Feed: entra com fade/slide; `aria-live="polite"`.
- Sem animações que bloqueiem input; nada pisca mais de 3 vezes/s.

### 4.6 Hierarquia visual

1. Sua palavra e seu boneco (maior contraste).
2. Timer da rodada.
3. Power-ups disponíveis.
4. Adversário mais próximo de vencer (destaque "quase lá").
5. Feed e detalhes secundários.

---

## 5. Design System

### 5.1 Paleta — "Tempestade Neon"

| Token | Hex | Uso |
|---|---|---|
| `--ink-900` | `#070B16` | fundo profundo |
| `--ink-800` | `#0C1224` | fundo de seção |
| `--ink-700` | `#131B33` | cards |
| `--line` | `#263154` | bordas |
| `--text` | `#EEF2FF` | texto principal |
| `--muted` | `#9AA8C7` | texto secundário |
| `--violet` | `#7C5CFF` | marca / foco / ações |
| `--mint` | `#3DDC97` | acerto / sucesso |
| `--coral` | `#FF6B6B` | erro / ataque |
| `--amber` | `#FFC857` | power-ups / líder |
| `--cyan` | `#55D6FF` | tempo real / links |

Contraste mínimo AA: texto principal 13:1; muted 6.4:1; cores de estado sempre acompanhadas de ícone/texto (nunca só cor).

### 5.2 Tipografia

- **Display:** `"Arial Black", "Segoe UI", system-ui` — títulos em caixa alta, tracking negativo, 700–900.
- **Corpo:** `"Segoe UI", system-ui, -apple-system, sans-serif` — 15–17 px, altura 1.5.
- **Dados:** `ui-monospace, "Cascadia Code", Consolas` — código da sala, timer, placar.
- Sem fontes externas (performance, privacidade, CSP e funcionamento offline).

### 5.3 Espaçamento, raios e sombras

- Grid base 4 px; espaçamentos 8/12/16/24/32/48.
- Raios: 10 px (botões), 18 px (cards), 28 px (painéis), 999 px (pills).
- Sombra: `0 18px 50px rgba(0,0,0,.35)`; brilho de foco `0 0 0 3px rgba(124,92,255,.45)`.
- Bordas de 1 px com gradiente sutil nos painéis principais.

### 5.4 Componentes

- **Botão primário:** gradiente violeta→azul, texto branco, altura 48 px.
- **Botão secundário:** fundo transparente, borda `--line`.
- **Pill de status:** fundo 12% da cor + texto da cor.
- **Card de power-up:** ícone 28 px, nome, contagem, raridade; estado selecionado com borda âmbar.
- **Teclado:** teclas 44 px, estados `available`, `correct` (mint), `wrong` (coral), `disabled`.
- **Timer:** anel SVG 56 px; muda para coral nos últimos 10 s.
- **Toast:** canto inferior, 3.5 s, fecha ao clicar, `role="status"`.

---

## 6. Telas e estados

### 6.1 Home

- Logo, tagline, formulário de nome.
- Duas colunas: **Criar sala** (tamanho da palavra) e **Entrar** (código).
- Se `?sala=` estiver na URL, pré-preenche e foca o botão entrar.
- Erros inline: nome inválido, sala cheia, sala inexistente, partida em andamento.
- Botão "Como jogar" abre um painel com 4 passos e a lista de power-ups.

### 6.2 Lobby

- Código em destaque + botão copiar + link.
- Lista de jogadores com cor, host, status; vaga vazia pontilhada.
- Config: tamanho 5–8 (host); texto "3 rodadas · 90 s cada".
- Host: "Iniciar partida" (habilitado com ≥ 2). Não host: "Aguardando o host…".
- Sair da sala.

### 6.3 Partida

- Layout da seção 4.
- Header: sala, rodada, timer, botão de som, botão sair.
- Overlay de Cegueira.
- Modal de seleção de alvo (ataques).
- Painel "Como jogar" acessível a qualquer momento.

### 6.4 Resumo de rodada

- Overlay central: "Rodada 2 encerrada", vencedor, tabela de posições/pontos.
- Palavras da rodada reveladas.
- Countdown para a próxima rodada ou botão "Ver resultado" no fim.

### 6.5 Pódio

- Top 3 com alturas diferentes, coroa no vencedor.
- Placar completo, palavras finais, botão "Revanche" (host) e "Sair".
- Compartilhar resultado via `navigator.share` (fallback: copiar texto).

### 6.6 Estados de erro

| Situação | UI | Ação |
|---|---|---|
| Sem conexão | Banner persistente "Reconectando…" | retry com backoff |
| 401 token inválido | Modal "Sessão expirada" | voltar ao lobby/home |
| 404 sala | Tela "Sala não encontrada" | voltar à home |
| 409 conflito | silencioso (retry automático) | nova tentativa |
| 429 rate limit | toast "Calma! Aguarde um instante" | reabilitar após 1 s |
| Erro 5xx | banner "Servidor instável" | retry |

---

## 7. Arquitetura técnica (resumo para o Programador)

- **Frontend:** HTML único + ES Modules, sem framework e sem build. CSS autoral.
- **Backend:** Cloudflare Pages Functions (`/functions/api`) + D1.
- **Estado da sala:** um único JSON em `rooms.state` + `version` (CAS). Toda mutação lê, valida, aplica e salva com `UPDATE … WHERE version = ?`; em conflito, recarrega e reaplica (até 4 tentativas).
- **Timers:** transições preguiçosas no servidor (`advance()`), executadas em toda leitura/escrita. Não depende de cron.
- **Polling:** `GET /api/rooms/:code/state`, 700 ms. Payload pequeno (sem palavras).
- **Anti-cheat:** tokens de jogador, validação de letra/estado/tempo/inventário, dedupe por `actionId`, rate limit, palavras somente no servidor.
- **Banco:** tabela `rooms` (code, state, version, updated_at, expires_at) + `rate_limits`.
- **Palavras:** módulo compartilhado apenas no bundle do servidor; nunca referenciado pelo cliente.

### 7.1 Contrato de API

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/api/rooms` | `{name, wordLength}` | `{code, playerId, token, snapshot}` |
| POST | `/api/rooms/:code/join` | `{name}` ou `{name, playerId, token}` | credenciais + snapshot |
| GET | `/api/rooms/:code/state` | headers de sessão | `{snapshot}` |
| POST | `/api/rooms/:code/start` | `{}` | snapshot |
| POST | `/api/rooms/:code/guess` | `{letter, actionId}` | snapshot |
| POST | `/api/rooms/:code/powerup` | `{powerupId, targetId?, actionId}` | snapshot |
| POST | `/api/rooms/:code/leave` | `{}` | `{ok}` |
| GET | `/api/health` | — | `{ok, db}` |

Headers de sessão: `X-Player-Id`, `X-Player-Token`, `Content-Type: application/json`.

### 7.2 Snapshot (cliente)

```jsonc
{
  "code": "ABCDE",
  "status": "playing",
  "version": 42,
  "serverNow": 1793910000000,
  "settings": { "rounds": 3, "wordLength": 6, "roundSeconds": 90, "maxErrors": 6, "maxPlayers": 6 },
  "round": 2,
  "roundEndsAt": 1793910090000,
  "nextRoundAt": null,
  "hostId": "p_...",
  "you": {
    "id": "p_...", "name": "Ana", "score": 180, "roundScore": 70,
    "mask": ["P", null, "L", null, "V", null, "A"], "guessed": ["P","L","V","A"],
    "wrong": 2, "maxErrors": 6, "solved": false, "eliminated": false,
    "streak": 2, "powerups": { "oraculo": 1, "vendaval": 1 },
    "effects": { "blindUntil": 0, "inkUntil": 0, "shieldUntil": 0, "overchargeUntil": 0 },
    "maskHidden": false, "canAct": true
  },
  "players": [
    {
      "id": "p_...", "name": "Léo", "color": "#55D6FF", "isHost": true,
      "score": 210, "roundScore": 90, "wins": 1, "rank": 1, "connected": true,
      "wordLength": 6, "mask": ["C", null, null, null, null, null],
      "revealedCount": 1, "totalLetters": 6, "wrong": 1, "maxErrors": 6,
      "solved": false, "eliminated": false, "streak": 3, "powerupCount": 2,
      "effects": { "blindUntil": 0, "inkUntil": 0, "shieldUntil": 0, "overchargeUntil": 0 }
    }
  ],
  "log": [
    { "id": 12, "type": "powerup", "actorName": "Ana", "targetName": "Léo", "powerupId": "vendaval", "message": "Ana usou Vendaval em Léo.", "at": 1793909990000 }
  ],
  "roundSummary": null,
  "winnerId": null
}
```

**Regras de privacidade:** `players[].mask` só contém letras reveladas; `you.mask` fica todo `null` durante Cegueira (`maskHidden: true`); `you.powerups` só aparece para o dono; `token` e `word` jamais aparecem no snapshot, exceto palavras no resumo/fim.

---

## 8. Acessibilidade

- Navegação por teclado: Tab por teclas, Enter/Espaço aciona; atalhos A–Z quando o foco não está em input.
- Foco visível de 3 px; `aria-label` em ícones e teclas; estado `aria-pressed` nos power-ups.
- Feed com `aria-live="polite"` e resumo de ataques.
- Cegueira nunca remove o foco; o overlay tem `role="alert"` e countdown textual.
- Cores de estado sempre com ícone e texto ("certa", "errada").
- `prefers-reduced-motion`: desativa flip/shake/aurora; mantém transições de opacidade curtas.
- Zoom 200% sem quebra; alvos ≥ 44 px; contraste AA.
- Timer não é a única informação: texto "1:12 restantes" e barra.

---

## 9. Conteúdo e tom de voz

- Tom: competitivo, brincalhão, sem toxicidade. Verbos curtos: "Chute", "Use", "Segure".
- Mensagens de ataque: "Ana chamou o Vendaval em Léo." / "Escudo de Léo segurou o Trovão."
- Nunca usar dados do usuário em HTML; nomes entram como texto.
- Vocabulário de Power-Ups sempre com ícone + nome; tooltip com descrição curta.

---

## 10. Métricas de sucesso (pós-lançamento)

- ≥ 70% das partidas chegam à rodada 3.
- Tempo médio de lobby < 60 s.
- ≥ 1 power-up usado por jogador por partida.
- < 2% de erros 5xx; p95 do polling < 400 ms.
- Nenhuma palavra vazada em snapshot (teste automatizado).

---

## 11. Fora de escopo (v1)

- Contas, login social, ranking global persistente.
- Chat de texto livre (moderação e XSS).
- Power-ups compráveis, cosméticos, battle pass.
- WebSockets/Durable Objects (ver debate arquitetural; polling atende e reduz custo).
- Espectadores, torneios, matchmaking aleatório.

---

## 12. Critérios de aceite (release)

1. Duas pessoas criam/entram em uma sala pelo código e jogam 3 rodadas.
2. Todos os jogadores recebem palavras diferentes do mesmo tamanho.
3. O panorama mostra boneco e letras descobertas/ocultas em tempo real.
4. Todos os 11 power-ups funcionam e são validados no servidor.
5. Chute duplicado, letra inválida, ação fora do turno/tempo e inventário negativo são rejeitados.
6. Nome com `<script>` é neutralizado e renderizado como texto.
7. Nenhum snapshot contém palavra secreta ou token.
8. `npm test` e o smoke test de integração passam no GitHub Actions.
9. Push na `main` dispara deploy no Cloudflare Pages.
10. Layout utilizável em 360 px e 1440 px, com movimento reduzido.

---

*Documento aprovado pelo Game Designer. Próxima fase: arquitetura e implementação.*
