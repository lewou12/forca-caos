/** Renderizacao das telas. Nenhum dado do servidor entra via innerHTML. */

import { POWERUPS, isAttack } from './powerups.js';
import { clear, compactMask, el, formatClock, gallows, maskSlots } from './dom.js';

const $ = (selector) => document.querySelector(selector);

const STATUS_TEXT = {
  blindUntil: 'Cego',
  inkUntil: 'Tinta',
  shieldUntil: 'Escudo',
  overchargeUntil: 'Sobrecarga',
};

export function showScreen(name) {
  for (const section of document.querySelectorAll('.screen')) {
    section.hidden = section.id !== `screen-${name}`;
  }
}

export function setTopbar({ inRoom }) {
  $('#leave-btn').hidden = !inRoom;
  $('#brand-link').href = '/';
}

export function renderHomeHint(session) {
  const hint = $('#session-hint');
  if (!session) {
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
  const resume = $('#resume-btn');
  resume.textContent = `Retomar sala ${session.code}`;
}

export function renderLobby(snap, ctx) {
  $('#copy-code').textContent = snap.code;
  const players = snap.players.filter((player) => !player.left);
  $('#lobby-count').textContent = `${players.length}/${snap.settings.maxPlayers}`;

  const list = $('#lobby-players');
  clear(list);
  for (const player of players) {
    list.append(
      el(
        'li',
        { class: 'player-chip' },
        el('span', { class: 'chip-color', style: `background:${player.color}` }),
        el('span', { class: 'chip-name', text: player.name }),
        el('span', { class: `chip-tag${player.isHost ? ' host' : ''}`, text: player.isHost ? 'Host' : 'Pronto' }),
      ),
    );
  }

  const config = $('#lobby-config');
  clear(config);
  const pills = [
    `${snap.settings.rounds} rodadas`,
    `${snap.settings.wordLength} letras`,
    `${snap.settings.roundSeconds}s por rodada`,
    `${snap.settings.maxErrors} erros eliminam`,
  ];
  for (const label of pills) config.append(el('span', { class: 'config-pill', text: label }));

  const isHost = snap.you.isHost;
  const enough = players.length >= 2;
  const startBtn = $('#start-btn');
  startBtn.hidden = !isHost;
  startBtn.disabled = !enough || ctx.busy;
  startBtn.textContent = enough ? 'Iniciar partida' : 'Aguardando mais jogadores';

  const waiting = $('#lobby-waiting');
  waiting.hidden = isHost;
  const hint = $('#lobby-hint');
  if (isHost) {
    hint.textContent = enough
      ? 'Todos prontos. Quando você iniciar, cada jogador recebe uma palavra secreta do mesmo tamanho.'
      : 'Compartilhe o código. É preciso pelo menos 2 jogadores para começar.';
  } else {
    hint.textContent = 'Você está pronto. O host inicia a partida quando todos estiverem na sala.';
  }
}

export function renderGame(snap, ctx) {
  const you = snap.you;
  const now = ctx.now;

  $('#round-label').textContent = `${snap.round}/${snap.settings.rounds}`;
  $('#score-label').textContent = String(you.score);

  const own = $('#own-card');
  own.classList.toggle('eliminated', you.eliminated);
  own.classList.toggle('solved', you.solved);

  $('#own-name').textContent = you.name;
  $('#own-status').textContent = ownStatus(you, now);

  const badges = $('#own-badges');
  clear(badges);
  if (you.effects.shieldUntil > now) badges.append(el('span', { class: 'badge shield', text: 'Escudo' }));
  if (you.effects.overchargeUntil > now) badges.append(el('span', { class: 'badge overcharge', text: '3×' }));
  if (you.effects.blindUntil > now) badges.append(el('span', { class: 'badge blind', text: 'Cego' }));

  const gallowsWrap = $('#own-gallows');
  clear(gallowsWrap);
  gallowsWrap.append(gallows(you.wrong, { dead: you.eliminated }));

  const mask = $('#own-mask');
  clear(mask);
  mask.append(maskSlots(you.mask, { totalLetters: you.totalLetters, hidden: you.maskHidden }));

  const wrong = $('#own-wrong');
  wrong.textContent = `${you.wrong} / ${you.maxErrors} erros`;
  wrong.classList.toggle('danger', you.wrong >= you.maxErrors - 1);

  const effects = $('#own-effects');
  const active = [];
  if (you.effects.shieldUntil > now) active.push(`Escudo por ${formatClock(you.effects.shieldUntil - now)}`);
  if (you.effects.overchargeUntil > now) active.push(`Próximo acerto 3× por ${formatClock(you.effects.overchargeUntil - now)}`);
  if (you.effects.inkUntil > now) active.push(`Tinta por ${formatClock(you.effects.inkUntil - now)}`);
  effects.hidden = active.length === 0;
  effects.textContent = active.join(' · ');

  $('#blind-overlay').hidden = !(you.effects.blindUntil > now);
  $('#ink-overlay').hidden = !(you.effects.inkUntil > now);

  renderKeyboard(snap, ctx);
  renderTray(snap, ctx);
  renderPanorama(snap, ctx);
  renderLog(snap);
}

function ownStatus(you, now) {
  if (you.solved) return 'Palavra resolvida! Aguarde a rodada.';
  if (you.eliminated) return 'Você completou a forca. Use Bênção para voltar.';
  if (you.effects.blindUntil > now) return 'Cegueira! Aguarde a tela voltar.';
  if (you.effects.inkUntil > now) return 'Tinta nas suas letras.';
  if (you.canAct) return 'Sua vez de chutar.';
  return 'Aguarde o início da rodada.';
}

function renderKeyboard(snap, ctx) {
  const you = snap.you;
  const keyboard = $('#keyboard');
  clear(keyboard);

  const guessed = new Set(you.maskHidden ? [] : you.guessed);
  const locked = ctx.busy || !you.canAct;

  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    const isGuessed = guessed.has(letter);
    const correct = isGuessed ? isLetterInMask(letter, you.mask) : false;
    const state = isGuessed ? (correct ? 'correct' : 'wrong') : '';
    keyboard.append(
      el('button', {
        type: 'button',
        class: `key ${state}`.trim(),
        text: letter,
        disabled: locked || isGuessed,
        'aria-label': `Letra ${letter}${isGuessed ? ' (já usada)' : ''}`,
        onclick: () => ctx.onGuess(letter),
      }),
    );
  }

  const hint = $('#keyboard-hint');
  if (you.solved) hint.textContent = 'Palavra resolvida. Aponte para os adversários no panorama.';
  else if (you.eliminated) hint.textContent = 'Eliminado. Uma Bênção pode te trazer de volta.';
  else if (you.effects.blindUntil > ctx.now) hint.textContent = 'Cegueira ativa: os chutes estão bloqueados.';
  else if (you.effects.inkUntil > ctx.now) hint.textContent = 'Suas letras estão cobertas por tinta.';
  else if (!you.canAct) hint.textContent = 'Aguarde o início da rodada.';
  else hint.textContent = 'Clique em uma letra ou use o teclado físico.';
}

function isLetterInMask(letter, mask) {
  return Array.isArray(mask) && mask.includes(letter);
}

function renderTray(snap, ctx) {
  const you = snap.you;
  const tray = $('#powerup-tray');
  clear(tray);

  const entries = Object.entries(you.powerups ?? {}).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  $('#tray-count').textContent = `${total} ${total === 1 ? 'carga' : 'cargas'}`;

  if (entries.length === 0) {
    tray.append(el('p', { class: 'tray-empty', text: 'Nenhuma carga ainda. Acertos seguidos e tempo trazem power-ups.' }));
  }

  for (const [id, count] of entries) {
    const meta = POWERUPS[id];
    if (!meta) continue;
    const needsTarget = isAttack(id);
    const usable = !ctx.busy && (you.canAct || (id === 'bencao' && you.eliminated));
    tray.append(
      el(
        'button',
        {
          type: 'button',
          class: 'power-card',
          style: `--card-color:${meta.color}`,
          title: `${meta.name}: ${meta.description}`,
          disabled: !usable,
          onclick: () => ctx.onPowerup(id, needsTarget),
        },
        el('span', { class: 'power-count', text: String(count) }),
        el('span', { class: 'power-glyph', 'aria-hidden': 'true', text: meta.glyph }),
        el('span', { class: 'power-name', text: meta.name }),
      ),
    );
  }

  const hint = $('#tray-hint');
  if (you.solved) hint.textContent = 'Você já resolveu a palavra nesta rodada.';
  else if (you.eliminated) hint.textContent = 'Eliminado: apenas Bênção pode ser usada.';
  else if (you.effects.blindUntil > ctx.now) hint.textContent = 'Cegueira bloqueia chutes, mas não power-ups.';
  else hint.textContent = 'Ganhe cargas a cada 3 acertos seguidos, ao resolver a palavra e a cada 30s.';
}

function renderPanorama(snap, ctx) {
  const grid = $('#pano-grid');
  clear(grid);
  const others = snap.players.filter((player) => !player.isYou && !player.left);
  $('#pano-count').textContent = `${others.length} ${others.length === 1 ? 'adversário' : 'adversários'}`;

  const attackSelected = ctx.selectedPowerup && isAttack(ctx.selectedPowerup);

  for (const player of snap.players) {
    if (player.left) continue;
    const selectable = attackSelected && canTarget(player, snap.you.id);
    const card = el('button', {
      type: 'button',
      class: [
        'pano-card',
        player.isYou ? 'you' : '',
        player.eliminated ? 'eliminated' : '',
        player.solved ? 'solved' : '',
        selectable ? 'selectable' : '',
      ]
        .filter(Boolean)
        .join(' '),
      disabled: attackSelected && !selectable,
      'aria-label': `${player.name}: ${player.revealedCount} de ${player.totalLetters} letras reveladas`,
      onclick: () => {
        if (selectable) ctx.onTarget(player.id);
      },
    });

    card.append(
      el(
        'div',
        { class: 'pano-top' },
        el('span', { class: 'pano-dot', style: `background:${player.color}` }),
        el('span', { class: 'pano-name', text: player.name }),
        player.isYou ? el('span', { class: 'pano-you', text: 'você' }) : null,
      ),
    );

    card.append(gallows(player.wrong, { className: 'pano-gallows', dead: player.eliminated }));
    card.append(compactMask(player.mask, { totalLetters: player.totalLetters, hidden: player.maskHidden }));

    const tags = el('div', { class: 'pano-tags' });
    if (player.solved) tags.append(el('span', { class: 'pano-tag shield', text: 'resolvida' }));
    if (player.eliminated) tags.append(el('span', { class: 'pano-tag blind', text: 'eliminado' }));
    if (player.effects.shieldUntil > ctx.now) tags.append(el('span', { class: 'pano-tag shield', text: 'escudo' }));
    if (player.effects.blindUntil > ctx.now) tags.append(el('span', { class: 'pano-tag blind', text: 'cego' }));
    if (player.maskHidden) tags.append(el('span', { class: 'pano-tag ink', text: 'tinta' }));
    if (!player.connected) tags.append(el('span', { class: 'pano-tag off', text: 'offline' }));

    card.append(
      el(
        'div',
        { class: 'pano-meta' },
        el('span', { text: `${player.revealedCount}/${player.totalLetters}` }),
        tags,
        el('span', { text: `${player.score} pts` }),
      ),
    );

    if (player.maskHidden) {
      card.append(el('div', { class: 'pano-ink', text: 'Tinta!' }));
    }

    grid.append(card);
  }
}

function canTarget(player, viewerId) {
  return (
    player.id !== viewerId &&
    !player.left &&
    !player.solved &&
    !player.eliminated
  );
}

function renderLog(snap) {
  const list = $('#event-log');
  clear(list);
  const events = [...snap.log].reverse();
  for (const event of events) {
    if (!event.message) continue;
    const kind = event.type === 'blocked' || event.type === 'eliminate' ? 'attack' : event.type === 'round_end' ? 'good' : '';
    list.append(el('li', { class: kind, text: event.message }));
  }
  if (!events.length) list.append(el('li', { text: 'Os acontecimentos aparecem aqui.' }));
}

export function renderTargets(snap, powerupId, onPick) {
  const meta = POWERUPS[powerupId];
  $('#target-title').textContent = meta ? meta.name : 'Escolha o alvo';
  $('#target-desc').textContent = meta ? `${meta.short} Escolha um adversário.` : 'Selecione um adversário.';

  const list = $('#target-list');
  clear(list);
  const candidates = snap.players
    .filter((player) => canTarget(player, snap.you.id))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  if (!candidates.length) {
    list.append(el('p', { class: 'muted small', text: 'Nenhum adversário disponível agora.' }));
    return;
  }

  for (const player of candidates) {
    list.append(
      el(
        'button',
        {
          type: 'button',
          class: 'target-btn',
          onclick: () => onPick(player.id),
        },
        el('span', { class: 'target-swatch', style: `background:${player.color}` }),
        el('span', { class: 'target-name', text: player.name }),
        el('span', {
          class: 'target-sub',
          text: `${player.revealedCount}/${player.totalLetters} letras · ${player.score} pts`,
        }),
      ),
    );
  }
}

export function renderRound(snap) {
  const summary = snap.roundSummary;
  const youId = snap.you.id;
  const reason = summary?.reason;
  $('#round-reason').textContent =
    reason === 'solved' ? 'Todos resolveram' : reason === 'wipeout' ? 'Todos caíram' : 'Tempo esgotado';
  $('#round-title').textContent = `Rodada ${summary?.round ?? snap.round} encerrada`;
  $('#round-winner').textContent = summary?.winnerName
    ? `${summary.winnerName} levou a rodada.`
    : 'Rodada encerrada.';

  const standings = $('#round-standings');
  clear(standings);
  for (const entry of summary?.standings ?? []) {
    standings.append(
      el(
        'li',
        { class: `standing place-${entry.rank}${entry.playerId === youId ? ' you' : ''}` },
        el('span', { class: 'standing-rank', text: String(entry.rank) }),
        el(
          'span',
          {},
          el('span', { class: 'standing-name', text: entry.name }),
          el('span', {
            class: 'standing-sub',
            text: entry.solved
              ? `Resolveu · ${entry.revealedCount} letras`
              : entry.eliminated
                ? `Eliminado · ${entry.wrong} erros`
                : `${entry.revealedCount} letras · ${entry.wrong} erros`,
          }),
        ),
        el('span', {
          class: 'standing-score',
          text: `${entry.score} pts${entry.placementPoints ? ` (+${entry.placementPoints})` : ''}`,
        }),
      ),
    );
  }

  const words = $('#round-words');
  clear(words);
  for (const entry of summary?.words ?? []) {
    words.append(
      el(
        'li',
        {},
        el('span', { text: entry.name }),
        el('span', { class: 'word', text: entry.word }),
      ),
    );
  }
}

export function renderFinished(snap) {
  const standings = snap.finalStandings ?? [];
  const youId = snap.you.id;
  const winner = standings[0];
  $('#finished-winner').textContent = winner
    ? `${winner.name} venceu com ${winner.score} pontos.`
    : 'Partida encerrada.';

  const podium = $('#podium');
  clear(podium);
  const order = [standings[1], standings[0], standings[2]];
  const medals = ['🥈', '🥇', '🥉'];
  order.forEach((entry, index) => {
    if (!entry) return;
    const place = index === 0 ? 2 : index === 1 ? 1 : 3;
    podium.append(
      el(
        'div',
        { class: `podium-step p${place}` },
        el('span', { class: 'podium-medal', text: medals[index] }),
        el('span', { class: 'podium-name', text: entry.name }),
        el('span', { class: 'podium-score', text: `${entry.score} pts` }),
      ),
    );
  });

  const list = $('#final-standings');
  clear(list);
  for (const entry of standings) {
    list.append(
      el(
        'li',
        { class: `standing place-${entry.rank}${entry.playerId === youId ? ' you' : ''}` },
        el('span', { class: 'standing-rank', text: String(entry.rank) }),
        el(
          'span',
          {},
          el('span', { class: 'standing-name', text: entry.name }),
          el('span', { class: 'standing-sub', text: `${entry.wins} ${entry.wins === 1 ? 'rodada vencida' : 'rodadas vencidas'}` }),
        ),
        el('span', { class: 'standing-score', text: `${entry.score} pts` }),
      ),
    );
  }

  const words = $('#final-words');
  clear(words);
  for (const entry of snap.finalWords ?? []) {
    words.append(
      el('li', {}, el('span', { text: entry.name }), el('span', { class: 'word', text: entry.word })),
    );
  }

  $('#rematch-btn').hidden = !snap.you.isHost;
}

export function updateTimer(snap, now) {
  const remaining = snap.roundEndsAt ? snap.roundEndsAt - now : 0;
  const label = $('#timer-label');
  label.textContent = snap.status === 'playing' ? formatClock(remaining) : '—';
  label.parentElement.classList.toggle('urgent', snap.status === 'playing' && remaining <= 10_000);

  if (snap.status === 'round_over') {
    const wait = snap.nextRoundAt ? snap.nextRoundAt - now : 0;
    $('#next-round-label').textContent =
      wait > 0 ? `Próxima rodada em ${formatClock(wait)}` : 'Iniciando próxima rodada…';
  }
}

export function renderPowerupOverlayState(selected) {
  const pano = $('#panorama');
  if (!pano) return;
  pano.classList.toggle('targeting', Boolean(selected));
}

export { STATUS_TEXT };
