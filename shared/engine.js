/**
 * Engine autoritativo do FORCA//CAOS.
 *
 * Funções puras: recebem `now` e `rng`, mutam o objeto `room` (que é sempre um
 * draft carregado do D1) e retornam `{ changed }`. Nenhuma palavra secreta
 * entra no snapshot do cliente antes do resumo/fim.
 */

import {
  ATTACK_COOLDOWN_MS,
  ATTACK_IMMUNITY_MS,
  DEFAULT_WORD_LENGTH,
  DISCONNECT_MS,
  EFFECT_KEYS,
  GUESS_COOLDOWN_MS,
  MAX_ERRORS,
  MAX_INVENTORY,
  MAX_LOG,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  PLACEMENT_POINTS,
  POWERUP_COOLDOWN_MS,
  ROUND_INTRO_MS,
  ROUND_OVER_MS,
  ROUND_SECONDS,
  ROUNDS,
  SNAPSHOT_LOG,
  STARTING_POWERUP,
  STATUS,
  TIME_BONUS_CAP,
  TIMED_AWARD_MS,
} from './constants.js';
import {
  POWERUPS,
  POWERUP_IDS,
  addPowerup,
  isAttack,
  isPowerupId,
  normalizeInventory,
  randomPowerupId,
  removePowerup,
  totalPowerups,
} from './powerups.js';
import { generateCode, makeId, makeToken, randomChoice, randomInt, shuffle, tokenEquals } from './random.js';
import {
  isValidActionId,
  isValidCode,
  isValidPlayerId,
  isValidToken,
  isValidWordLength,
  normalizeCode,
  normalizeLetter,
  sanitizeName,
} from './validate.js';
import { WORDS_BY_LENGTH } from './words.js';

export class GameError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status = 400) {
  throw new GameError(code, message, status);
}

function emptyEffects() {
  return {
    blindUntil: 0,
    inkUntil: 0,
    shieldUntil: 0,
    overchargeUntil: 0,
  };
}

function createPlayer(name, now, color) {
  return {
    id: makeId('p'),
    token: makeToken(),
    name,
    color,
    isHost: false,
    joinedAt: now,
    lastSeen: now,
    left: false,
    score: 0,
    roundScore: 0,
    wins: 0,
    word: null,
    guessed: [],
    wrong: 0,
    solved: false,
    solvedAt: null,
    eliminated: false,
    streak: 0,
    powerups: {},
    effects: emptyEffects(),
    lastAction: null,
    lastActionAt: 0,
    lastGuessAt: 0,
    lastPowerupAt: 0,
    lastAttackAt: 0,
    lastAwardAt: 0,
    attackedAt: 0,
    actionIds: [],
  };
}

function nextColor(room) {
  const used = new Set(room.players.map((p) => p.color));
  return PLAYER_COLORS.find((color) => !used.has(color)) ?? PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
}

function pushEvent(room, type, data, now) {
  room.eventSeq = (room.eventSeq ?? 0) + 1;
  const actor = data.actorId ? room.players.find((p) => p.id === data.actorId) : null;
  const target = data.targetId ? room.players.find((p) => p.id === data.targetId) : null;
  const event = {
    id: room.eventSeq,
    type,
    at: now,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    targetId: target?.id ?? null,
    targetName: target?.name ?? null,
    powerupId: data.powerupId ?? null,
    message: String(data.message ?? ''),
  };
  room.log.push(event);
  if (room.log.length > MAX_LOG) room.log.splice(0, room.log.length - MAX_LOG);
  return event;
}

function activePlayers(room) {
  return room.players.filter((p) => !p.left);
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) ?? null;
}

export function requireSession(room, playerId, token) {
  if (!isValidPlayerId(playerId) || !isValidToken(token)) {
    fail('INVALID_SESSION', 'Sessão inválida. Volte ao lobby.', 401);
  }
  const player = findPlayer(room, playerId);
  if (!player || !tokenEquals(player.token, token)) {
    fail('INVALID_SESSION', 'Sessão inválida. Volte ao lobby.', 401);
  }
  return player;
}

export function createRoom({
  name,
  wordLength = DEFAULT_WORD_LENGTH,
  now = Date.now(),
  code = generateCode(),
  rng = Math.random,
} = {}) {
  const cleanName = sanitizeName(name);
  if (!cleanName) fail('INVALID_NAME', 'Escolha um nome de 2 a 16 caracteres.', 400);
  if (!isValidWordLength(wordLength)) fail('INVALID_WORD_LENGTH', 'Escolha entre 5 e 8 letras.', 400);
  const normalizedCode = normalizeCode(code);
  if (!isValidCode(normalizedCode)) fail('INVALID_CODE', 'Código de sala inválido.', 400);

  const host = createPlayer(cleanName, now, PLAYER_COLORS[0]);
  host.isHost = true;

  const room = {
    schema: 1,
    code: normalizedCode,
    version: 0,
    status: STATUS.LOBBY,
    createdAt: now,
    updatedAt: now,
    hostId: host.id,
    settings: {
      rounds: ROUNDS,
      wordLength,
      roundSeconds: ROUND_SECONDS,
      maxErrors: MAX_ERRORS,
      maxPlayers: MAX_PLAYERS,
    },
    round: 0,
    roundStartedAt: null,
    roundEndsAt: null,
    nextRoundAt: null,
    eventSeq: 0,
    players: [host],
    usedWords: [],
    log: [],
    roundSummary: null,
    winnerId: null,
    matchComplete: false,
  };

  pushEvent(room, 'create', { actorId: host.id, message: `${cleanName} criou a sala.` }, now);
  return { room, playerId: host.id, token: host.token };
}

export function joinRoom(room, { name, playerId, token, now = Date.now() } = {}) {
  // Reconexão explícita (refresh, troca de aba, link com sessão salva).
  if (playerId && token) {
    const existing = findPlayer(room, playerId);
    if (existing && tokenEquals(existing.token, token)) {
      existing.lastSeen = now;
      existing.left = false;
      return { changed: true, player: existing, token: existing.token, rejoin: true };
    }
    fail('INVALID_SESSION', 'Sessão inválida. Volte ao lobby.', 401);
  }

  if (room.status !== STATUS.LOBBY) {
    fail('MATCH_STARTED', 'A partida já começou. Use o link da sala para voltar.', 409);
  }

  const cleanName = sanitizeName(name);
  if (!cleanName) fail('INVALID_NAME', 'Escolha um nome de 2 a 16 caracteres.', 400);
  if (room.players.some((p) => !p.left && p.name.toLocaleLowerCase('pt-BR') === cleanName.toLocaleLowerCase('pt-BR'))) {
    fail('NAME_TAKEN', 'Já existe um jogador com esse nome nesta sala.', 409);
  }
  if (activePlayers(room).length >= MAX_PLAYERS) {
    fail('ROOM_FULL', 'A sala está cheia (máximo de 6 jogadores).', 409);
  }

  const player = createPlayer(cleanName, now, nextColor(room));
  room.players.push(player);
  pushEvent(room, 'join', { actorId: player.id, message: `${cleanName} entrou na sala.` }, now);
  return { changed: true, player, token: player.token, rejoin: false };
}

function pickWords(count, length, usedWords, rng) {
  const used = new Set(usedWords);
  const pool = (WORDS_BY_LENGTH[length] ?? []).filter((word) => !used.has(word));
  if (pool.length < count) {
    fail('DICTIONARY_EXHAUSTED', 'O dicionário desta rodada se esgotou. Abra uma nova sala.', 500);
  }
  return shuffle(pool, rng).slice(0, count);
}

function resetRoundPlayer(player) {
  player.word = null;
  player.guessed = [];
  player.wrong = 0;
  player.solved = false;
  player.solvedAt = null;
  player.eliminated = false;
  player.streak = 0;
  player.roundScore = 0;
  player.effects = emptyEffects();
  player.lastAction = null;
  player.lastActionAt = 0;
  player.lastGuessAt = 0;
  player.lastPowerupAt = 0;
  player.lastAttackAt = 0;
  player.lastAwardAt = 0;
  player.attackedAt = 0;
  player.actionIds = [];
}

function beginRound(room, now, rng) {
  room.round += 1;
  room.status = STATUS.PLAYING;
  room.roundStartedAt = now;
  room.roundEndsAt = now + room.settings.roundSeconds * 1000;
  room.nextRoundAt = null;
  room.roundSummary = null;

  const active = activePlayers(room);
  for (const player of room.players) resetRoundPlayer(player);

  const words = pickWords(active.length, room.settings.wordLength, room.usedWords, rng);
  active.forEach((player, index) => {
    player.word = words[index];
    player.lastAwardAt = now;
    room.usedWords.push(words[index]);
  });

  pushEvent(room, 'round_start', {
    message: `Rodada ${room.round} de ${room.settings.rounds} começou.`,
  }, now);
}

export function startMatch(room, actorId, now = Date.now(), rng = Math.random) {
  const actor = findPlayer(room, actorId);
  if (!actor) fail('PLAYER_NOT_FOUND', 'Jogador não encontrado.', 404);
  if (room.hostId !== actorId) fail('HOST_ONLY', 'Apenas o host pode iniciar a partida.', 403);
  if (room.status !== STATUS.LOBBY && room.status !== STATUS.FINISHED) {
    fail('WRONG_STATUS', 'A partida já está em andamento.', 409);
  }
  if (activePlayers(room).length < MIN_PLAYERS) {
    fail('NOT_ENOUGH_PLAYERS', 'São necessários pelo menos 2 jogadores.', 409);
  }

  const isRematch = room.status === STATUS.FINISHED;
  room.round = 0;
  room.usedWords = [];
  room.roundSummary = null;
  room.winnerId = null;
  room.matchComplete = false;
  room.nextRoundAt = null;
  room.roundEndsAt = null;

  for (const player of room.players) {
    player.score = 0;
    player.roundScore = 0;
    player.wins = 0;
    player.powerups = {};
    resetRoundPlayer(player);
    if (!player.left) {
      addPowerup(player.powerups, STARTING_POWERUP, 1);
      player.lastSeen = now;
    }
  }

  if (isRematch) {
    room.log = [];
    pushEvent(room, 'rematch', { actorId, message: `${actor.name} iniciou uma revanche.` }, now);
  }
  pushEvent(room, 'match_start', { actorId, message: 'A partida começou! Boa sorte.' }, now);

  beginRound(room, now, rng);
  return { changed: true };
}

function isWordSolved(player) {
  if (!player.word) return false;
  return [...player.word].every((letter) => player.guessed.includes(letter));
}

function revealedLetters(player) {
  if (!player.word) return [];
  return [...new Set([...player.word].filter((letter) => player.guessed.includes(letter)))];
}

function revealedCount(player) {
  return revealedLetters(player).length;
}

function awardRandomPowerup(player, rng) {
  if (totalPowerups(player.powerups) >= MAX_INVENTORY) return null;
  const id = randomPowerupId(rng);
  addPowerup(player.powerups, id, 1);
  return id;
}

function completeWord(room, player, now, { bonus = true, rng = Math.random } = {}) {
  if (player.solved || !player.word) return false;
  player.solved = true;
  player.solvedAt = now;
  if (bonus) {
    const remainingSeconds = Math.max(0, Math.floor((room.roundEndsAt - now) / 1000));
    const speedBonus = Math.min(TIME_BONUS_CAP, Math.floor(remainingSeconds / 2));
    const points = 60 + speedBonus;
    player.score += points;
    player.roundScore += points;
  }
  awardRandomPowerup(player, rng);
  pushEvent(room, 'solve', {
    actorId: player.id,
    message: `${player.name} resolveu a palavra!`,
  }, now);
  return true;
}

function recordAction(player, actionId, now) {
  if (!isValidActionId(actionId)) {
    fail('INVALID_ACTION', 'Identificador de ação inválido.', 400);
  }
  if (player.actionIds.includes(actionId)) {
    return false;
  }
  player.actionIds.push(actionId);
  if (player.actionIds.length > 12) {
    player.actionIds.splice(0, player.actionIds.length - 12);
  }
  player.lastActionAt = now;
  return true;
}

export function applyGuess(room, actorId, letterInput, actionId, now = Date.now(), rng = Math.random) {
  const player = findPlayer(room, actorId);
  if (!player) fail('PLAYER_NOT_FOUND', 'Jogador não encontrado.', 404);
  if (room.status !== STATUS.PLAYING) fail('WRONG_STATUS', 'A rodada não está ativa.', 409);
  if (player.left) fail('PLAYER_LEFT', 'Você saiu desta partida.', 403);
  if (player.solved) fail('ALREADY_SOLVED', 'Você já resolveu esta palavra.', 409);
  if (player.eliminated) fail('ELIMINATED', 'Você completou a forca e não pode mais chutar.', 403);
  if (player.effects.blindUntil > now) fail('BLINDED', 'Cegueira! Aguarde a tela voltar.', 403);

  if (!isValidActionId(actionId)) fail('INVALID_ACTION', 'Identificador de ação inválido.', 400);
  if (player.actionIds.includes(actionId)) {
    return { changed: false, duplicate: true };
  }
  if (player.lastGuessAt && now - player.lastGuessAt < GUESS_COOLDOWN_MS) {
    fail('RATE_LIMIT', 'Calma! Aguarde um instante antes de chutar outra letra.', 429);
  }

  const letter = normalizeLetter(letterInput);
  if (!letter) fail('INVALID_LETTER', 'Chute uma única letra de A a Z.', 400);
  if (player.guessed.includes(letter)) {
    return { changed: false, duplicateLetter: true };
  }

  recordAction(player, actionId, now);
  player.lastGuessAt = now;
  const correct = player.word.includes(letter);
  player.guessed.push(letter);
  player.lastAction = { type: 'guess', letter, correct, at: now };

  if (!correct) {
    player.wrong += 1;
    player.streak = 0;
    if (player.wrong >= room.settings.maxErrors) {
      player.eliminated = true;
      pushEvent(room, 'eliminate', {
        actorId: player.id,
        message: `${player.name} completou a forca e caiu.`,
      }, now);
    }
    return { changed: true, correct: false };
  }

  player.streak += 1;
  let gain = 10 + Math.min((player.streak - 1) * 2, 10);
  if (player.effects.overchargeUntil > now) {
    gain *= 3;
    player.effects.overchargeUntil = 0;
  }
  player.score += gain;
  player.roundScore += gain;

  if (isWordSolved(player)) {
    completeWord(room, player, now, { bonus: true, rng });
  } else if (player.streak > 0 && player.streak % 3 === 0) {
    awardRandomPowerup(player, rng);
  }

  return { changed: true, correct: true, gain };
}

function validatePowerupTarget(room, attacker, targetId, powerupId, now) {
  if (!isAttack(powerupId)) return null;
  if (!targetId) fail('TARGET_REQUIRED', 'Escolha um adversário para este poder.', 400);
  if (targetId === attacker.id) fail('INVALID_TARGET', 'Você não pode atacar a si mesmo.', 400);
  const target = findPlayer(room, targetId);
  if (!target) fail('TARGET_NOT_FOUND', 'Adversário não encontrado.', 404);
  if (target.left) fail('INVALID_TARGET', 'Esse jogador saiu da partida.', 409);
  if (target.solved) fail('INVALID_TARGET', 'Esse jogador já resolveu a palavra.', 409);
  if (target.eliminated) fail('INVALID_TARGET', 'Esse jogador já foi eliminado.', 409);
  if (now < room.roundStartedAt + ROUND_INTRO_MS) {
    fail('ROUND_INTRO', 'Aguarde os primeiros segundos da rodada.', 409);
  }
  if (target.attackedAt + ATTACK_IMMUNITY_MS > now) {
    fail('TARGET_IMMUNE', 'Esse alvo acabou de ser atacado. Escolha outro.', 409);
  }
  return target;
}

export function applyPowerup(room, actorId, powerupId, targetId, actionId, now = Date.now(), rng = Math.random) {
  const player = findPlayer(room, actorId);
  if (!player) fail('PLAYER_NOT_FOUND', 'Jogador não encontrado.', 404);
  if (room.status !== STATUS.PLAYING) fail('WRONG_STATUS', 'A rodada não está ativa.', 409);
  if (player.left) fail('PLAYER_LEFT', 'Você saiu desta partida.', 403);
  if (player.solved) fail('ALREADY_SOLVED', 'Você já resolveu esta palavra.', 409);
  if (player.eliminated && powerupId !== 'bencao') {
    fail('ELIMINATED', 'Você completou a forca e não pode usar poderes.', 403);
  }
  if (!isPowerupId(powerupId)) fail('INVALID_POWERUP', 'Power-up desconhecido.', 400);
  if (!isValidActionId(actionId)) fail('INVALID_ACTION', 'Identificador de ação inválido.', 400);
  if (player.actionIds.includes(actionId)) {
    return { changed: false, duplicate: true };
  }
  if (player.lastPowerupAt && now - player.lastPowerupAt < POWERUP_COOLDOWN_MS) {
    fail('RATE_LIMIT', 'Aguarde um instante entre poderes.', 429);
  }

  const inventory = normalizeInventory(player.powerups);
  player.powerups = inventory;
  if (!inventory[powerupId] || inventory[powerupId] < 1) {
    fail('NO_CHARGE', 'Você não tem essa carga.', 409);
  }

  let target = null;
  if (isAttack(powerupId)) {
    target = validatePowerupTarget(room, player, targetId, powerupId, now);
    if (now - player.lastAttackAt < ATTACK_COOLDOWN_MS) {
      fail('ATTACK_COOLDOWN', 'Seu próximo ataque estará pronto em instantes.', 429);
    }
    if (powerupId === 'vendaval' && revealedLetters(target).length === 0) {
      fail('INVALID_TARGET', 'Esse alvo ainda não revelou nenhuma letra.', 409);
    }
    if (powerupId === 'roubo' && totalPowerups(target.powerups) === 0) {
      fail('INVALID_TARGET', 'Esse alvo não tem cargas para roubar.', 409);
    }
    if (powerupId === 'sanguessuga' && target.score <= 0) {
      fail('INVALID_TARGET', 'Esse alvo não tem pontos para drenar.', 409);
    }
  }
  if (powerupId === 'bencao' && player.wrong <= 0 && !player.eliminated) {
    fail('INVALID_POWERUP', 'Você não tem erros para remover.', 409);
  }
  if (powerupId === 'oraculo' && revealedLetters(player).length >= new Set([...player.word]).size) {
    fail('INVALID_POWERUP', 'Sua palavra já está totalmente revelada.', 409);
  }

  recordAction(player, actionId, now);

  // Escudo tem prioridade e consome o ataque (e a carga do atacante).
  if (target && target.effects.shieldUntil > now) {
    target.effects.shieldUntil = 0;
    target.attackedAt = now;
    removePowerup(player.powerups, powerupId, 1);
    player.lastPowerupAt = now;
    player.lastAttackAt = now;
    pushEvent(room, 'blocked', {
      actorId: player.id,
      targetId: target.id,
      powerupId,
      message: `O Escudo de ${target.name} bloqueou ${POWERUPS[powerupId].name} de ${player.name}.`,
    }, now);
    return { changed: true, blocked: true };
  }

  removePowerup(player.powerups, powerupId, 1);
  player.lastPowerupAt = now;
  if (target) {
    player.lastAttackAt = now;
    target.attackedAt = now;
    target.lastAction = { type: 'attacked', powerupId, at: now };
  }

  switch (powerupId) {
    case 'oraculo': {
      const unrevealed = [...new Set([...player.word])].filter((letter) => !player.guessed.includes(letter));
      const consonants = unrevealed.filter((letter) => !'AEIOU'.includes(letter));
      const chosen = randomChoice(consonants.length ? consonants : unrevealed, rng);
      if (chosen) {
        player.guessed.push(chosen);
        player.lastAction = { type: 'powerup', powerupId, at: now };
        if (isWordSolved(player)) completeWord(room, player, now, { bonus: true, rng });
        pushEvent(room, 'powerup', {
          actorId: player.id,
          powerupId,
          message: `${player.name} usou Oráculo e revelou uma letra.`,
        }, now);
      }
      break;
    }
    case 'vendaval': {
      const revealed = revealedLetters(target);
      const chosen = randomChoice(revealed, rng);
      target.guessed = target.guessed.filter((letter) => letter !== chosen);
      target.streak = 0;
      pushEvent(room, 'powerup', {
        actorId: player.id,
        targetId: target.id,
        powerupId,
        message: `${player.name} usou Vendaval e apagou uma letra de ${target.name}.`,
      }, now);
      break;
    }
    case 'cegueira': {
      target.effects.blindUntil = Math.max(target.effects.blindUntil, now + POWERUPS.cegueira.durationMs);
      pushEvent(room, 'powerup', {
        actorId: player.id,
        targetId: target.id,
        powerupId,
        message: `${player.name} cegou ${target.name} por 3 segundos.`,
      }, now);
      break;
    }
    case 'tinta': {
      target.effects.inkUntil = Math.max(target.effects.inkUntil, now + POWERUPS.tinta.durationMs);
      pushEvent(room, 'powerup', {
        actorId: player.id,
        targetId: target.id,
        powerupId,
        message: `${player.name} jogou tinta nas letras de ${target.name}.`,
      }, now);
      break;
    }
    case 'trovao': {
      target.wrong += 1;
      target.streak = 0;
      if (target.wrong >= room.settings.maxErrors && !target.eliminated) {
        target.eliminated = true;
        pushEvent(room, 'eliminate', {
          actorId: target.id,
          message: `${target.name} completou a forca e caiu.`,
        }, now);
      }
      pushEvent(room, 'powerup', {
        actorId: player.id,
        targetId: target.id,
        powerupId,
        message: `${player.name} lançou Trovão em ${target.name}.`,
      }, now);
      break;
    }
    case 'sanguessuga': {
      const transfer = Math.min(20, target.score);
      target.score -= transfer;
      target.roundScore = Math.max(0, target.roundScore - transfer);
      player.score += transfer;
      player.roundScore += transfer;
      pushEvent(room, 'powerup', {
        actorId: player.id,
        targetId: target.id,
        powerupId,
        message: `${player.name} drenou ${transfer} pontos de ${target.name}.`,
      }, now);
      break;
    }
    case 'roubo': {
      const options = POWERUP_IDS.filter((id) => target.powerups[id] > 0);
      const stolen = randomChoice(options, rng);
      removePowerup(target.powerups, stolen, 1);
      addPowerup(player.powerups, stolen, 1);
      pushEvent(room, 'powerup', {
        actorId: player.id,
        targetId: target.id,
        powerupId,
        message: `${player.name} roubou uma carga de ${target.name}.`,
      }, now);
      break;
    }
    case 'escudo': {
      player.effects.shieldUntil = now + POWERUPS.escudo.durationMs;
      pushEvent(room, 'powerup', {
        actorId: player.id,
        powerupId,
        message: `${player.name} ativou um Escudo.`,
      }, now);
      break;
    }
    case 'bencao': {
      const wasEliminated = player.eliminated;
      player.wrong = Math.max(0, player.wrong - 1);
      player.eliminated = player.wrong >= room.settings.maxErrors;
      pushEvent(room, 'powerup', {
        actorId: player.id,
        powerupId,
        message: wasEliminated
          ? `${player.name} usou Bênção e voltou à rodada.`
          : `${player.name} usou Bênção e removeu um erro.`,
      }, now);
      break;
    }
    case 'sobrecarga': {
      player.effects.overchargeUntil = now + POWERUPS.sobrecarga.durationMs;
      pushEvent(room, 'powerup', {
        actorId: player.id,
        powerupId,
        message: `${player.name} ativou Sobrecarga.`,
      }, now);
      break;
    }
    case 'chuva': {
      let count = 0;
      for (const other of room.players) {
        if (other.left || other.solved || other.eliminated || !other.word) continue;
        const unrevealed = [...new Set([...other.word])].filter((letter) => !other.guessed.includes(letter));
        if (!unrevealed.length) continue;
        const chosen = randomChoice(unrevealed, rng);
        other.guessed.push(chosen);
        count += 1;
        if (isWordSolved(other)) completeWord(room, other, now, { bonus: true, rng });
      }
      pushEvent(room, 'powerup', {
        actorId: player.id,
        powerupId,
        message: `${player.name} chamou a Chuva de Letras: ${count} jogador(es) revelaram uma letra.`,
      }, now);
      break;
    }
    default:
      fail('INVALID_POWERUP', 'Power-up desconhecido.', 400);
  }

  return { changed: true, powerupId, targetId: target?.id ?? null };
}

function rankRound(room) {
  return [...room.players].sort((a, b) => {
    if (a.left !== b.left) return a.left ? 1 : -1;
    if (a.solved !== b.solved) return a.solved ? -1 : 1;
    if (a.solved && b.solved) return (a.solvedAt ?? 0) - (b.solvedAt ?? 0);
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    const revealedDiff = revealedCount(b) - revealedCount(a);
    if (revealedDiff !== 0) return revealedDiff;
    if (a.wrong !== b.wrong) return a.wrong - b.wrong;
    return a.joinedAt - b.joinedAt;
  });
}

function rankMatch(room) {
  return [...room.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.joinedAt - b.joinedAt;
  });
}

function endRound(room, now) {
  if (room.status !== STATUS.PLAYING) return false;
  const ranked = rankRound(room);
  const placementById = new Map();
  let placeIndex = 0;
  for (const player of ranked) {
    if (player.left || player.eliminated) continue;
    if (placeIndex >= PLACEMENT_POINTS.length) break;
    const points = PLACEMENT_POINTS[placeIndex];
    player.score += points;
    player.roundScore += points;
    placementById.set(player.id, points);
    placeIndex += 1;
  }

  const everyoneDone = room.players.every((p) => p.left || p.solved || p.eliminated);
  const alive = room.players.filter((p) => !p.left);
  const allSolved = alive.length > 0 && alive.every((p) => p.solved);
  const reason = now >= room.roundEndsAt ? 'time' : everyoneDone && allSolved ? 'solved' : 'wipeout';

  const winner = ranked.find((p) => !p.left && !p.eliminated) ?? ranked.find((p) => !p.left) ?? ranked[0];
  if (winner) winner.wins += 1;

  room.status = STATUS.ROUND_OVER;
  room.roundEndsAt = now;
  room.nextRoundAt = now + ROUND_OVER_MS;
  room.roundSummary = {
    round: room.round,
    reason,
    endedAt: now,
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? null,
    standings: ranked.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      color: player.color,
      rank: index + 1,
      score: player.score,
      roundScore: player.roundScore,
      solved: player.solved,
      eliminated: player.eliminated,
      left: player.left,
      wrong: player.wrong,
      revealedCount: revealedCount(player),
      placementPoints: placementById.get(player.id) ?? 0,
    })),
    words: room.players
      .filter((player) => player.word)
      .map((player) => ({ playerId: player.id, name: player.name, word: player.word })),
  };

  if (winner) {
    pushEvent(room, 'round_end', {
      actorId: winner.id,
      message: `Rodada ${room.round} encerrada. ${winner.name} levou a melhor.`,
    }, now);
  }
  return true;
}

function finishMatch(room, now) {
  if (room.status === STATUS.FINISHED) return false;
  const ranked = rankMatch(room);
  const winner = ranked[0] ?? null;
  room.status = STATUS.FINISHED;
  room.winnerId = winner?.id ?? null;
  room.matchComplete = true;
  room.nextRoundAt = null;
  room.roundEndsAt = null;
  if (winner) {
    pushEvent(room, 'match_end', {
      actorId: winner.id,
      message: `${winner.name} venceu a partida!`,
    }, now);
  }
  return true;
}

export function advance(room, now = Date.now(), rng = Math.random) {
  let changed = false;

  if (room.status === STATUS.PLAYING) {
    for (const player of room.players) {
      if (player.left || player.solved || player.eliminated) continue;
      const lastAward = player.lastAwardAt || room.roundStartedAt || now;
      if (now - lastAward >= TIMED_AWARD_MS) {
        player.lastAwardAt = now;
        changed = true;
        if (totalPowerups(player.powerups) < MAX_INVENTORY) {
          awardRandomPowerup(player, rng);
        }
      }
    }

    const everyoneDone = room.players.every((p) => p.left || p.solved || p.eliminated);
    if (everyoneDone || now >= room.roundEndsAt) {
      changed = endRound(room, now) || changed;
    }
  } else if (room.status === STATUS.ROUND_OVER) {
    if (now >= room.nextRoundAt) {
      if (room.round >= room.settings.rounds || activePlayers(room).length === 0) {
        changed = finishMatch(room, now) || changed;
      } else {
        beginRound(room, now, rng);
        changed = true;
      }
    }
  }

  return changed;
}

export function leaveRoom(room, actorId, now = Date.now()) {
  const player = findPlayer(room, actorId);
  if (!player) fail('PLAYER_NOT_FOUND', 'Jogador não encontrado.', 404);

  if (room.status === STATUS.LOBBY) {
    room.players = room.players.filter((p) => p.id !== actorId);
    player.left = true;
    pushEvent(room, 'leave', { actorId: player.id, message: `${player.name} saiu da sala.` }, now);
    if (room.players.length === 0) {
      return { changed: true, deleteRoom: true };
    }
    if (room.hostId === actorId) {
      room.hostId = activePlayers(room)[0]?.id ?? room.players[0].id;
      const host = findPlayer(room, room.hostId);
      if (host) host.isHost = true;
    }
    return { changed: true };
  }

  player.left = true;
  player.lastSeen = now;
  pushEvent(room, 'leave', { actorId: player.id, message: `${player.name} saiu da partida.` }, now);
  if (room.hostId === actorId) {
    const nextHost = activePlayers(room)[0];
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.isHost = true;
      player.isHost = false;
    }
  }
  if (activePlayers(room).length === 0) {
    return { changed: true, deleteRoom: true };
  }
  return { changed: true };
}

function publicEffects(player, now) {
  const effects = {};
  for (const key of EFFECT_KEYS) {
    effects[key] = Math.max(0, player.effects?.[key] ?? 0);
  }
  return effects;
}

function buildMask(player, now, { forOwner }) {
  if (!player.word) return { mask: null, maskHidden: false, totalLetters: 0 };
  const totalLetters = [...player.word].length;
  if (player.solved) {
    return { mask: [...player.word], maskHidden: false, totalLetters };
  }
  const hiddenByBlind = forOwner && player.effects.blindUntil > now;
  const hiddenByInk = player.effects.inkUntil > now;
  if (hiddenByBlind || hiddenByInk) {
    return { mask: Array(totalLetters).fill(null), maskHidden: true, totalLetters };
  }
  return {
    mask: [...player.word].map((letter) => (player.guessed.includes(letter) ? letter : null)),
    maskHidden: false,
    totalLetters,
  };
}

function publicLastAction(player, hidden = false) {
  const action = player.lastAction;
  if (!action || typeof action !== 'object') return null;
  return {
    type: String(action.type ?? ''),
    letter: !hidden && typeof action.letter === 'string' ? action.letter : null,
    correct: Boolean(action.correct),
    powerupId: isPowerupId(action.powerupId) ? action.powerupId : null,
    at: Number(action.at) || 0,
  };
}

export function snapshot(room, viewerId, now = Date.now()) {
  const viewer = findPlayer(room, viewerId);
  if (!viewer) fail('PLAYER_NOT_FOUND', 'Jogador não encontrado.', 404);

  const rankedMatch = rankMatch(room);
  const rankById = new Map(rankedMatch.map((player, index) => [player.id, index + 1]));
  const connected = (player) => !player.left && now - player.lastSeen < DISCONNECT_MS;
  const totalLetters = room.settings.wordLength;

  const players = room.players.map((player) => {
    const { mask, maskHidden, totalLetters: letters } = buildMask(player, now, { forOwner: false });
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      isHost: player.id === room.hostId,
      isYou: player.id === viewer.id,
      score: player.score,
      roundScore: player.roundScore,
      wins: player.wins,
      rank: rankById.get(player.id) ?? null,
      connected: connected(player),
      left: Boolean(player.left),
      wordLength: player.word ? [...player.word].length : totalLetters,
      mask,
      maskHidden,
      revealedCount: revealedCount(player),
      totalLetters: letters || totalLetters,
      wrong: player.wrong,
      maxErrors: room.settings.maxErrors,
      solved: player.solved,
      eliminated: player.eliminated,
      streak: player.streak,
      powerupCount: totalPowerups(player.powerups),
      effects: publicEffects(player, now),
      lastAction: publicLastAction(player, maskHidden),
    };
  });

  const ownMask = buildMask(viewer, now, { forOwner: true });
  const canAct = room.status === STATUS.PLAYING
    && !viewer.left
    && !viewer.solved
    && !viewer.eliminated
    && viewer.effects.blindUntil <= now;

  const you = {
    id: viewer.id,
    name: viewer.name,
    color: viewer.color,
    isHost: viewer.id === room.hostId,
    score: viewer.score,
    roundScore: viewer.roundScore,
    wins: viewer.wins,
    rank: rankById.get(viewer.id) ?? null,
    connected: connected(viewer),
    left: Boolean(viewer.left),
    wordLength: viewer.word ? [...viewer.word].length : totalLetters,
    mask: ownMask.mask,
    maskHidden: ownMask.maskHidden,
    revealedCount: revealedCount(viewer),
    totalLetters: ownMask.totalLetters || totalLetters,
    guessed: ownMask.maskHidden ? [] : [...viewer.guessed],
    wrong: viewer.wrong,
    maxErrors: room.settings.maxErrors,
    solved: viewer.solved,
    eliminated: viewer.eliminated,
    streak: viewer.streak,
    powerups: normalizeInventory(viewer.powerups),
    effects: publicEffects(viewer, now),
    lastAction: publicLastAction(viewer, ownMask.maskHidden),
    canAct,
  };

  const log = room.log.slice(-SNAPSHOT_LOG).map((event) => ({
    id: event.id,
    type: event.type,
    at: event.at,
    actorId: event.actorId,
    actorName: event.actorName,
    targetId: event.targetId,
    targetName: event.targetName,
    powerupId: event.powerupId,
    message: event.message,
  }));

  const result = {
    code: room.code,
    status: room.status,
    version: room.version,
    serverNow: now,
    settings: { ...room.settings },
    round: room.round,
    roundStartedAt: room.roundStartedAt,
    roundEndsAt: room.roundEndsAt,
    nextRoundAt: room.nextRoundAt,
    hostId: room.hostId,
    you,
    players,
    log,
    roundSummary: room.roundSummary ? JSON.parse(JSON.stringify(room.roundSummary)) : null,
    winnerId: room.winnerId,
  };

  if (room.status === STATUS.FINISHED) {
    result.finalStandings = rankedMatch.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      color: player.color,
      rank: index + 1,
      score: player.score,
      wins: player.wins,
      left: player.left,
    }));
    result.finalWords = room.players
      .filter((player) => player.word)
      .map((player) => ({ playerId: player.id, name: player.name, word: player.word }));
  }

  return result;
}

export { emptyEffects, isWordSolved, revealedLetters, revealedCount, activePlayers };
