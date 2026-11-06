# Debate Log — FORCA//CAOS

> Registro vivo das decisões do estúdio. Cada fase adiciona uma sessão de revisão por pares.
> Formato: proposta → críticas → consenso.

---

## FASE 1 — Ideação (Visionário Pé no Chão × Equipe)

### 1.1 O pitch

**Forca de salão não tem tensão entre jogadores.** Cada um resolve o próprio quebra-cabeça, em silêncio, e o "multiplayer" é só decorativo. A proposta é transformar a forca em uma **corrida de sobrevivência assimétrica**: todos começam ao mesmo tempo, com palavras diferentes do mesmo tamanho, e podem mexer no tabuleiro uns dos outros.

**Hook:** *"Você não perde só porque errou. Você perde porque alguém viu você prestes a ganhar."*

### 1.2 Core loop (30–90 segundos por rodada)

1. **Lobby (código de 5 letras):** 2 a 6 jogadores entram pelo código ou link.
2. **Contagem:** o host inicia; cada jogador recebe uma palavra secreta diferente, todas com a mesma quantidade de letras.
3. **Corrida:** acerte letras para revelar sua palavra e encher a barra de combo.
4. **Caos:** a cada 3 acertos seguidos, ao completar a palavra e por tempo, você ganha power-ups. Escolha entre acelerar a si mesmo ou atrasar um adversário.
5. **Virada:** a "Visão Panorâmica" mostra, em tempo real, o boneco e as letras descobertas de todos. Dá para ver quem está a uma letra de vencer — e retaliar.
6. **Fim da rodada:** quem resolve primeiro (ou fica em melhor posição quando o tempo acaba) leva pontos de colocação. São 3 rodadas; a maior pontuação leva o match.

**Condições de vitória:** maior pontuação acumulada após 3 rodadas. Empate desempata por rodadas vencidas e, depois, por letras reveladas na última rodada.

**Condições de derrota:** completar o boneco (6 erros) elimina você da rodada — mas não do match. Você continua vendo o panorama e pode torcer/atrapalhar com power-ups? **Não.** Decisão: eliminado não age, para não premiar quem errou. A tensão de assistir é suficiente.

### 1.3 O que torna a forca divertida (e o que não torna)

- **Divertido:** revelar letras em sequência, ver o adversário a uma letra do fim, sacar um Vendaval no momento exato, sobreviver com o boneco quase completo.
- **Não divertido:** esperar 8 segundos por um turno que não é seu; digitar letras sem feedback; ataques que impedem jogar por muito tempo; aleatoriedade que anula estratégia.

**Regra de ouro:** nenhum power-up pode tirar o controle do jogador por mais de 4 segundos. Ataques devem criar decisões, não pausas.

### 1.4 Catálogo inicial de power-ups

Ataques (alvo: um adversário vivo e não resolvido):

| Power-up | Efeito | Duração/Custo | Contra-jogo |
|---|---|---|---|
| **Vendaval** | Apaga uma letra já descoberta do alvo (a letra volta a ficar oculta e pode ser re-chutada). | instantâneo | Escudo; re-acertar a letra |
| **Cegueira** | Cobre a tela do alvo com uma tempestade e bloqueia novos chutes. | 3 s | Escudo; usar power-up de suporte antes |
| **Bomba de Tinta** | Esconde os espaços de letras do alvo de todos os jogadores. | 6 s | Escudo; o alvo ainda pode digitar |
| **Trovão** | Força um erro no alvo (um segmento do boneco). | instantâneo | Escudo; Bênção |
| **Sanguessuga** | Transfere 20 pontos do alvo para você. | instantâneo | Escudo; correr atrás |
| **Roubo de Carga** | Rouba 1 carga de power-up aleatória do alvo. | instantâneo | Escudo; não acumular tudo |

Suporte/defesa (alvo: você):

| Power-up | Efeito | Duração | Nota de design |
|---|---|---|---|
| **Oráculo** | Revela uma consoante correta da sua palavra. | instantâneo | Pode completar a palavra; garante momento de virada |
| **Escudo** | Bloqueia o próximo ataque recebido. | 15 s | Mostrado publicamente para dissuadir ataques |
| **Bênção** | Remove um erro do seu boneco (revive se estava eliminado). | instantâneo | Contrapeso ao Trovão; raro |
| **Sobrecarga** | O próximo acerto vale 3× pontos. | 20 s | Recompensa leitura de risco |
| **Chuva de Letras** | Revela uma letra aleatória para **todos** os jogadores, inclusive você. | instantâneo | Power-up de caos: pode entregar a vitória ao rival |

**Raridade e aquisição:**
- Começa com 1 Oráculo (tutorial silencioso, sem tela de tutorial).
- A cada 3 acertos consecutivos: 1 power-up aleatório (peso maior para comuns).
- Ao resolver a palavra: +1 power-up.
- A cada 30 s de rodada: +1 power-up (máximo de 5 cargas totais).
- Inventário máximo: 5 cargas. Sem compra, sem loja, sem pay-to-win.

**Por que não inventar mais?** O catálogo cobre ataque direto, ataque de informação, defesa, economia de pontos, recuperação e caos global. Onze opções já geram combinações suficientes. Mais que isso dilui o reconhecimento visual e a leitura estratégica.

### 1.5 Críticas da equipe

**Game Designer:** "Cegueira + Trovão no mesmo alvo em 3 segundos é cruel. Preciso de um **tempo de graça** de 1,5 s após receber um ataque, e o Escudo precisa ser visível. Também quero que o alvo saiba quem o atacou — drama social é o ponto."

**Programador:** "Vendaval removendo a letra do `guessed` é o único jeito de permitir re-chute. Se eu só apagar da máscara, o jogador fica travado. Precisa estar explícito no contrato do engine."

**QA:** "Cegueira que bloqueia input no servidor é boa para anti-cheat, mas se o cliente perder a conexão por 3 s, o jogador pode achar que travou. O overlay precisa de countdown e a reconexão precisa ser automática."

**Segurança:** "Se o servidor enviar a palavra para o cliente antes do fim, qualquer um abre o DevTools. A máscara tem que ser montada no servidor e a palavra só aparece no resumo/fim. Nome de jogador é vetor de XSS clássico: allowlist, não escape."

**Visionário (resposta):** aceito tudo. Ajustes: (a) ataque não pode ser aplicado no mesmo alvo por 2 s; (b) Cegueira 3 s com contagem visível; (c) palavras nunca saem antes do resumo; (d) eliminado não age; (e) o feed de eventos é a "voz" da sala.

### 1.6 Consenso da Fase 1

- 3 rodadas de 90 s, 2–6 jogadores, palavras de 5–8 letras (mesmo tamanho para todos na sala).
- 6 erros completam a forca e eliminam da rodada.
- 11 power-ups, inventário de 5, aquisição por combo/tempo/solução, 1 Oráculo inicial.
- Visão Panorâmica é requisito de produto, não enfeite: é a fonte de informação para escolher alvos.
- Ataques têm cooldown de 4 s por atacante e 2 s de invulnerabilidade por alvo.
- Nenhum estado de jogo é confiado ao cliente.

**Status:** aprovado para a Fase 2 (Design & UX).

---

## FASE 2 — Design & UX (Game Designer Sênior × Equipe)

### 2.1 Proposta visual

**"Tempestade Neon":** fundo azul-noite (#070B16), painéis de vidro, acentos violeta (#7C5CFF), mint para acerto, coral para erro, âmbar para poder. Tipografia display pesada e monoespaçada para dados. Nada de clip-art de forca: o boneco é um SVG desenhado com traço de 8 px e animação de traço.

**Por que não usar Tailwind?** O jogo tem uma tela dominante e um design system pequeno. CSS autoral com variáveis produz menos bytes, zero build e controle total das animações. Tailwind exigiria build e não pagaria o custo.

### 2.2 Decisão de layout: panorama lateral, não inferior

Testamos mentalmente os dois:

- **Inferior:** funciona no mobile, mas no desktop obriga a rolar para ver os rivais. O requisito é "visão panorâmica"; rolar mata a leitura.
- **Lateral:** no desktop, sua forca fica grande à esquerda e os rivais à direita, sempre visíveis. No mobile, vira scroll horizontal logo abaixo dos power-ups.

**Consenso:** grid de duas colunas no desktop (`minmax(0,1.75fr) minmax(320px,.9fr)`), uma coluna no mobile. O panorama nunca fica abaixo da dobra no desktop.

### 2.3 Críticas

**Programador:** "Se o snapshot for grande, 700 ms de polling vai custar caro. Preciso de máscaras compactas (arrays de letras/nulls) e log limitado a 30 eventos. Nada de enviar o dicionário."

**QA:** "Cegueira no servidor é ótima, mas a máscara do próprio jogador precisa vir oculta, senão ele lê no DevTools. O teste de segurança deve verificar isso."

**Segurança:** "Aceito CSP com `style-src 'unsafe-inline'` só porque manipulamos `style` para barras e countdown. `script-src 'self'` sem exceções. Nenhum `innerHTML` com dado de usuário."

**Designer (resposta):** "A máscara oculta na Cegueira é obrigatória. O overlay cobre a tela e o countdown vem do `serverNow`, não do relógio local. O feed usa `textContent` e `aria-live`."

### 2.4 Ajustes de balanceamento

- Ataque não pode ser usado nos primeiros **5 s** da rodada (evita "spawn kill").
- Alvo fica **2 s** imune a novos ataques após receber um.
- Atacante tem cooldown de **4 s** entre power-ups ofensivos.
- Cegueira: **3 s** (não 4) para respeitar a regra de ouro.
- Tinta: **6 s**, mas não bloqueia input.
- Escudo: **15 s**; visível publicamente para dissuadir.
- Bênção: rara; revive com 5 erros (não zera o boneco).
- Chuva de Letras: rara e global; pode beneficiar rivais — é o preço do caos.
- Inventário máximo 5; sem conversão de cargas em pontos (evita snowball).

### 2.5 Critérios de UX

- Um jogador novo entende o jogo sem tutorial: "Chute uma letra" no teclado + tooltip dos poderes.
- O código da sala é o elemento mais copiável da tela.
- 360 px: nada de scroll horizontal na página (apenas no carrossel de rivais).
- Oponente a uma letra do fim recebe badge "QUASE LÁ" e borda âmbar pulsante.
- Eliminado vê "Você caiu. Assista à virada." e o panorama.
- Fim de rodada: 7 s de resumo, sem botão obrigatório.
- Revanche: host inicia; demais veem "O host está preparando a revanche".

### 2.6 Consenso da Fase 2

- Layout de duas colunas no desktop, mobile-first com carrossel.
- Design system "Tempestade Neon" com variáveis CSS e SVG autoral.
- Polling 700 ms + `serverNow`, sem WebSocket na v1.
- Cegueira oculta a máscara no servidor; palavras só no resumo/fim.
- Balanceamento com cooldowns e invulnerabilidade.
- Critérios de aceite da seção 12 do GDD são vinculantes.

**Status:** aprovado para a Fase 3 (Arquitetura & Código).

---

## FASE 3 — Arquitetura (Engenheiro Veterano × Equipe)

### 3.1 O problema central: tempo real sem WebSocket

**Proposta inicial:** Durable Objects com WebSocket, um por sala (`idFromName(code)`).

**Programador:** "Durable Objects resolvem presença e broadcast com elegância, mas exigem um Worker separado ou um projeto Workers com assets. O requisito é Cloudflare Pages, e o deploy precisa acontecer por push na `main`. Introduzir um segundo deploy (Worker) e um binding de serviço aumenta o número de partes móveis e de permissões de token. Para 2–6 jogadores e partidas de 4 minutos, polling de 700 ms em D1 é suficiente e muito mais simples de testar."

**QA:** "Polling pode gerar corrida: dois clientes leem o mesmo estado e salvam por cima. Preciso de uma garantia formal."

**Programador:** "Estado inteiro da sala em **uma linha JSON** (`rooms.state`) com `version`. Toda mutação é `UPDATE rooms SET state=?, version=version+1 WHERE code=? AND version=?`. Só um escritor vence; o perdedor recarrega, revalida e reaplica (até 4 tentativas). Não existe update parcial, então não existe estado meio-escrito."

**Segurança:** "E se o cliente mandar a mesma ação duas vezes por retry?"

**Programador:** "Cada ação carrega `actionId`. O servidor guarda os últimos 12 IDs por jogador. Retry idempotente devolve o snapshot atual sem aplicar de novo. Chute repetido de letra também é idempotente."

**Designer:** "700 ms é perceptível?"

**Programador:** "Para letras e ataques, a resposta da própria ação é imediata (o POST devolve o snapshot). O polling só serve para ver os rivais. 700 ms com animação de 500 ms parece "ao vivo"; e o custo é uma leitura D1 por sala a cada 700 ms."

**Consenso:** polling versionado + D1; sem Durable Objects na v1. Documentar a troca: WebSocket fica como evolução, não como dependência.

### 3.2 Modelo de dados

```sql
CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL,      -- JSON completo e autoritativo
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER);
```

**Por que JSON único e não tabelas normalizadas?** A sala é uma unidade de consistência. Normalizar `players`, `events`, `words` exigiria transação multi-linha; D1 não tem `SELECT ... FOR UPDATE`. O JSON permite CAS atômico de uma linha e torna o engine 100% testável em Node puro.

**Crítica do QA:** "JSON grande pode estourar o limite de linha." Resposta: máscaras compactas, log de 40 eventos, 6 jogadores, ações limitadas a 12 por jogador. O estado fica abaixo de 20 KB.

### 3.3 Engine puro e adaptadores

- `shared/engine.js`: funções puras (`createRoom`, `joinRoom`, `startMatch`, `applyGuess`, `applyPowerup`, `advance`, `snapshot`). Sem D1, sem `fetch`, sem `Date.now()` implícito (recebe `now`).
- `shared/mutate.js`: laço CAS genérico, testável com store em memória.
- `shared/store.js`: adaptador D1 (`load`, `save`, `delete`).
- `functions/api/*`: handlers finos, autenticação e HTTP.
- `shared/words.js` e `shared/powerups.js`: conteúdo e metadados.

**Benefício:** testes de regra e de corrida sem subir servidor; smoke test cobre o adaptador.

### 3.4 Contrato de autenticação

- `playerId` público (`p_...`), `token` secreto de 32 bytes.
- Token só aparece na resposta de criação/join para o próprio jogador.
- Snapshot é montado por allowlist; nunca faz spread do jogador.
- Toda ação verifica `playerId + token` com comparação de tempo constante.
- Sem cookies → CSRF não se aplica. Exigir `Content-Type: application/json`.

**Segurança:** "LocalStorage pode ser lido por XSS." Resposta: CSP `script-src 'self'`, zero `innerHTML` com dados, sanitização por allowlist. O token é de sessão de sala, não de conta; o dano máximo é sabotar a própria partida.

### 3.5 Decisões de implementação

- **Sem build de frontend.** HTML + ES Modules + CSS; deploy direto de `public/`.
- **Dicionário de 5–8 letras** apenas no bundle do servidor; teste garante ≥ 24 palavras por tamanho.
- **Sem dependências de runtime.** Só devDependencies (`vitest`, `wrangler`).
- **Timers preguiçosos.** `advance()` roda em toda leitura/escrita; não há cron. Um jogador que volta após 2 min encontra o estado correto.
- **Presença** atualizada no máximo a cada 8 s para não transformar polling em write storm.
- **Erros** com códigos estáveis (`ROOM_NOT_FOUND`, `INVALID_TOKEN`, `RATE_LIMIT`, `ROUND_OVER`…).

### 3.6 Riscos aceitos

| Risco | Mitigação |
|---|---|
| Latência D1 no polling | payload pequeno; cache-control no-store; polling adaptativo |
| Custo de leituras D1 | 700 ms só com aba visível; pausa em background |
| Token em localStorage | CSP + sanitização + tokens de sala |
| Dicionário pequeno | ≥ 24 palavras/tamanho; teste automatizado |
| Jogador fecha o navegador | assento preservado; reconexão por token |
| Sala órfã | TTL de 6 h + limpeza na criação |

**Status:** aprovado para implementação. A Fase 4 auditará o código contra este contrato.

---

## Sessão 4 — Fase 3: arquitetura em produção

**Data:** 2026-11-05
**Personas:** Engenheiro Veterano, Game Designer Sênior, QA

### Implementação

- **Engine puro** em `shared/engine.js`: toda regra recebe `now` e `rng`, sem D1/browser. Isso permitiu testar 24 cenários sem servidor.
- **Frontend sem build**: `public/` com ES Modules nativos. O catálogo visual dos 11 power-ups foi duplicado em `public/src/powerups.js` (apenas apresentação); nenhuma regra foi duplicada — o servidor continua sendo a única fonte da verdade.
- **Polling versionado**: o cliente só re-renderiza quando `version` muda; o relógio local usa `serverNow - Date.now()` para timer e Cegueira sem drift.
- **Reconexão**: sessão em `localStorage` (`code`, `playerId`, `token`), retomada automática e link `?sala=CODIGO`.
- **Layout**: mobile-first; panorama vira bottom sheet em telas pequenas; galeria de forcas em SVG construída por DOM, sem HTML dinâmico.

### Validação real

Fluxo exercitado no navegador contra `wrangler pages dev`:

1. Criar sala (Ana, 6 letras) → lobby.
2. Entrar com Bia via API → lobby atualiza por polling.
3. Host inicia → rodada 1.
4. Chute pelo teclado físico → letra marcada, pontuação sobe.
5. Oráculo pela bandeja → letra revelada e carga consumida.
6. Panorama reflete a letra revelada de Bia.
7. Rodadas avançam por tempo até o pódio.
8. Revanche reinicia com palavras novas.
9. Modal de alvo do Vendaval lista apenas adversários válidos.
10. Sair limpa a sessão e a sala é apagada quando o último jogador sai.

**Resultado:** zero erros de console; layout validado em desktop e viewport móvel.

---

## Sessão 5 — Fase 4: QA e automação

**Data:** 2026-11-05
**Persona:** QA Implacável

### Suíte

| Arquivo | Testes | Cobertura |
|---|---|---|
| `tests/engine.test.js` | 24 | lobby, palavras, chutes, erros, streak, 11 power-ups, rodadas, revanche |
| `tests/security.test.js` | 16 | nomes, identificadores, vazamentos, máscaras, protótipo, alvo alienígena |
| `tests/race.test.js` | 9 | CAS, 25 incrementos concorrentes, duplo gasto, actionId repetido, chutes simultâneos |
| **Total** | **49** | |

- `scripts/smoke.mjs`: 32 verificações HTTP contra Pages local, incluindo headers, idempotência, sessão forjada e limpeza de sala.
- `scripts/check.mjs`: 39 verificações estáticas, incluindo "cliente sem `innerHTML`/`eval`" e CSP sem script inline.
- `.github/workflows/test.yml`: roda tudo acima no GitHub Actions com D1 local e Pages dev.

### Achados e correções

1. **Sala órfã ao sair em partida** — `leaveRoom` não sinalizava `deleteRoom` fora do lobby. Corrigido: quando não restam jogadores ativos, a sala é removida.
2. **Bênção com jogador eliminado** — a ordem de validação bloqueava o único uso que revivia o jogador. Corrigido: `bencao` é a exceção explícita.
3. **Ordem de imunidade vs. cooldown** — alvo recém-atacado deve responder `TARGET_IMMUNE` antes de `ATTACK_COOLDOWN`; teste ajustado para refletir a regra.
4. **Creditamento de pontos** — teste de chutes simultâneos de letras diferentes confirmou soma determinística (10 + 12 = 22) após retry do CAS.

**Critério de saída:** 49/49 testes, 32/32 smoke, 39/39 estáticos.

---

## Sessão 6 — Fase 5: auditoria de segurança

**Data:** 2026-11-05
**Persona:** Analista Paranoico

### Modelo de ameaça

| Ameaça | Controle |
|---|---|
| XSS em nome/chat/log | allowlist Unicode, `textContent`, CSP `script-src 'self'` |
| CSRF | headers `x-player-id`/`x-player-token` + JSON obrigatório; sem cookies |
| Roubo de token | 32 bytes aleatórios, comparação em tempo constante, nunca no snapshot |
| Trapaça em power-up | validação integral no engine (carga, alvo, cooldown, imunidade, status) |
| Replay de ação | `actionId` validado, memorizado (máx. 12) e idempotente |
| Poluição de protótipo | `isPowerupId` via `Object.hasOwn`, inventário normalizado por allowlist |
| SQL injection | 100% prepared statements com bind |
| Força bruta de código | 31^5 combinações + rate limit 45/min por IP |
| Abuso de payload | limite de 4 KB, nomes de 16 chars, log e inventário limitados |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Vazamento entre jogadores | snapshot por allowlist; palavras só no resumo/final |

### Achado crítico corrigido

**`lastAction.letter` vazava a última letra durante Tinta/Cegueira.** O snapshot escondia a máscara, mas o campo `lastAction` continuava expondo a letra recém-chutada — permitindo inferir informação que a Tinta deveria esconder. Correção: `publicLastAction(player, hidden)` zera `letter` quando `maskHidden` é verdadeiro, tanto para o dono quanto para os adversários. Coberto por teste em `tests/security.test.js`.

### Riscos residuais aceitos

- `style-src 'unsafe-inline'` é necessário para cores dinâmicas dos jogadores; não há script inline.
- Nomes homoglifos (cirílico) podem se parecer com latinos; não há impacto financeiro, apenas confusão visual.
- Rate limit local usa a chave `local` (sem `cf-connecting-ip`); em produção o header é fornecido pela Cloudflare.
- Actions usam tags móveis (`@v4`); pinagem por SHA fica como endurecimento futuro.

**Parecer:** aprovado para deploy, com as mitigações acima.
