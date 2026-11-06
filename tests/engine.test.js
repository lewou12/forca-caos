import { describe, expect, it } from 'vitest';
import {
  advance,
  applyGuess,
  applyPowerup,
  createRoom,
  joinRoom,
  leaveRoom,
  snapshot,
  startMatch,
} from '../shared/engine.js';
import { totalPowerups } from '../shared/powerups.js';
import { actionId, expectCode, makeRoom } from './helpers.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function wrongLetters(word, count = 6) {
  return ALPHABET.filter((letter) => !word.includes(letter)).slice(0, count);
}

function uniqueLetters(word) {
  return [...new Set([...word])];
}

function give(player, inventory) {
  player.powerups = { ...inventory };
}

describe('sala, lobby e inicio', () => {
  it('cria sala no lobby sem vazar palavra ou token', () => {
    const { room, playerId, token } = createRoom({ name: 'Ana', wordLength: 6, now: 1000 });
    expect(room.status).toBe('lobby');
    expect(room.hostId).toBe(playerId);
    expect(room.players).toHaveLength(1);
    expect(room.settings.wordLength).toBe(6);
    expect(token).toHaveLength(64);

    const snap = snapshot(room, playerId, 1000);
    expect(snap.status).toBe('lobby');
    expect(snap.you.name).toBe('Ana');
    expect(snap.you.mask).toBeNull();
    expect(JSON.stringify(snap)).not.toContain(token);
    expect(JSON.stringify(snap)).not.toContain('"word"');
  });

  it('rejeita nomes invalidos, duplicados e sala cheia', () => {
    const { room } = createRoom({ name: 'Ana', now: 1000 });
    expectCode(() => joinRoom(room, { name: '<>&', now: 1100 }), 'INVALID_NAME');
    joinRoom(room, { name: 'Bia', now: 1200 });
    expectCode(() => joinRoom(room, { name: 'bia', now: 1300 }), 'NAME_TAKEN');
    for (let i = 0; i < 4; i += 1) joinRoom(room, { name: `Jogador${i}`, now: 1400 + i });
    expect(room.players).toHaveLength(6);
    expectCode(() => joinRoom(room, { name: 'Sete', now: 1500 }), 'ROOM_FULL');
  });

  it('so o host inicia e exige 2 jogadores', () => {
    const { room, playerId } = createRoom({ name: 'Ana', now: 1000 });
    expectCode(() => startMatch(room, playerId, 2000), 'NOT_ENOUGH_PLAYERS');
    const joined = joinRoom(room, { name: 'Bia', now: 1100 });
    expectCode(() => startMatch(room, joined.player.id, 2000), 'HOST_ONLY');
    startMatch(room, playerId, 3000);
    expect(room.status).toBe('playing');
    expect(room.round).toBe(1);
  });

  it('distribui palavras diferentes com mesmo tamanho', () => {
    const { room } = makeRoom({ playerCount: 6, wordLength: 5 });
    const words = room.players.map((player) => player.word);
    expect(new Set(words).size).toBe(6);
    expect(words.every((word) => word.length === 5)).toBe(true);
  });

  it('nao vaza palavra nem token durante a partida', () => {
    const { room, credentials } = makeRoom({ playerCount: 3, wordLength: 7 });
    const snap = snapshot(room, credentials[0].playerId, room.roundStartedAt + 1000);
    const json = JSON.stringify(snap);
    for (const player of room.players) {
      expect(json).not.toContain(player.word);
      expect(json).not.toContain(player.token);
    }
    expect(json).not.toContain('"word"');
    expect(snap.you.powerups.oraculo).toBe(1);
  });
});

describe('chutes, pontuacao e erros', () => {
  it('revela letra, pontua e e idempotente', () => {
    const { room, host } = makeRoom();
    const letter = uniqueLetters(host.word)[0];
    const now = room.roundStartedAt + 1000;
    const result = applyGuess(room, host.id, letter.toLowerCase(), actionId(), now);
    expect(result.correct).toBe(true);
    expect(host.guessed).toContain(letter);
    expect(host.score).toBeGreaterThanOrEqual(10);
    const score = host.score;
    const duplicate = applyGuess(room, host.id, letter, actionId(), now + 300);
    expect(duplicate.changed).toBe(false);
    expect(host.score).toBe(score);
  });

  it('marca erro, zera combo e elimina no sexto erro', () => {
    const { room, host } = makeRoom();
    const letters = wrongLetters(host.word, 6);
    let now = room.roundStartedAt + 1000;
    for (let i = 0; i < 6; i += 1) {
      applyGuess(room, host.id, letters[i], actionId(), now);
      now += 300;
    }
    expect(host.wrong).toBe(6);
    expect(host.eliminated).toBe(true);
    expectCode(() => applyGuess(room, host.id, 'Z', actionId(), now), 'ELIMINATED');
  });

  it('respeita rate limit, valida letra e bloqueia cegueira', () => {
    const { room, host } = makeRoom();
    const now = room.roundStartedAt + 1000;
    applyGuess(room, host.id, uniqueLetters(host.word)[0], actionId(), now);
    expectCode(
      () => applyGuess(room, host.id, uniqueLetters(host.word)[1], actionId(), now + 100),
      'RATE_LIMIT',
    );
    expectCode(() => applyGuess(room, host.id, '1', actionId(), now + 1000), 'INVALID_LETTER');
    host.effects.blindUntil = now + 5000;
    expectCode(
      () => applyGuess(room, host.id, uniqueLetters(host.word)[1], actionId(), now + 3000),
      'BLINDED',
    );
  });

  it('resolver a palavra da bonus e power-up', () => {
    const { room, host } = makeRoom();
    const before = totalPowerups(host.powerups);
    let now = room.roundStartedAt + 1000;
    for (const letter of uniqueLetters(host.word)) {
      applyGuess(room, host.id, letter, actionId(), now);
      now += 300;
    }
    expect(host.solved).toBe(true);
    expect(host.score).toBeGreaterThan(60);
    expect(totalPowerups(host.powerups)).toBeGreaterThan(before);
  });

  it('da power-up a cada tres acertos e por tempo', () => {
    const { room, host } = makeRoom({ wordLength: 8 });
    const letters = uniqueLetters(host.word).slice(0, 3);
    expect(letters).toHaveLength(3);
    let now = room.roundStartedAt + 1000;
    for (const letter of letters) {
      applyGuess(room, host.id, letter, actionId(), now);
      now += 300;
    }
    expect(host.streak).toBe(3);
    expect(totalPowerups(host.powerups)).toBe(2);
    const before = totalPowerups(host.powerups);
    const changed = advance(room, room.roundStartedAt + 30_000);
    expect(changed).toBe(true);
    expect(totalPowerups(host.powerups)).toBeGreaterThanOrEqual(before);
  });
});

describe('power-ups', () => {
  it('Oraculo revela letra e consome carga', () => {
    const { room, host, t0 } = makeRoom();
    give(host, { oraculo: 1 });
    const before = host.guessed.length;
    const result = applyPowerup(room, host.id, 'oraculo', null, actionId(), t0);
    expect(result.changed).toBe(true);
    expect(host.guessed.length).toBe(before + 1);
    expect(host.powerups.oraculo).toBeUndefined();
  });

  it('Vendaval apaga letra revelada', () => {
    const { room, host, target, t0 } = makeRoom();
    const letter = uniqueLetters(target.word)[0];
    applyGuess(room, target.id, letter, actionId(), room.roundStartedAt + 1000);
    give(host, { vendaval: 1 });
    const result = applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0);
    expect(result.changed).toBe(true);
    expect(target.guessed).not.toContain(letter);
    expect(host.powerups.vendaval).toBeUndefined();
  });

  it('Escudo bloqueia ataque e ambos perdem carga', () => {
    const { room, host, target, t0 } = makeRoom();
    applyGuess(room, target.id, uniqueLetters(target.word)[0], actionId(), room.roundStartedAt + 1000);
    give(host, { vendaval: 1 });
    target.effects.shieldUntil = t0 + 10_000;
    const result = applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0);
    expect(result.blocked).toBe(true);
    expect(target.effects.shieldUntil).toBe(0);
    expect(host.powerups.vendaval).toBeUndefined();
    expect(room.log.some((event) => event.type === 'blocked')).toBe(true);
  });

  it('Cegueira bloqueia chute e Tinta esconde mascara', () => {
    const { room, host, target, t0 } = makeRoom();
    give(host, { cegueira: 1 });
    applyPowerup(room, host.id, 'cegueira', target.id, actionId(), t0);
    expect(target.effects.blindUntil).toBeGreaterThan(t0);
    expectCode(
      () => applyGuess(room, target.id, uniqueLetters(target.word)[0], actionId(), t0 + 500),
      'BLINDED',
    );
    target.effects.blindUntil = 0;
    target.effects.inkUntil = t0 + 6000;
    const snap = snapshot(room, host.id, t0 + 1000);
    expect(snap.players.find((player) => player.id === target.id).maskHidden).toBe(true);
  });

  it('Sobrecarga triplica o proximo acerto', () => {
    const { room, host, t0 } = makeRoom();
    give(host, { sobrecarga: 1 });
    host.score = 0;
    host.roundScore = 0;
    applyPowerup(room, host.id, 'sobrecarga', null, actionId(), t0);
    applyGuess(room, host.id, uniqueLetters(host.word)[0], actionId(), t0 + 700);
    expect(host.score).toBe(30);
    expect(host.effects.overchargeUntil).toBe(0);
  });

  it('Bencao remove erro e revive eliminado', () => {
    const { room, host, t0 } = makeRoom();
    give(host, { bencao: 2 });
    host.wrong = 2;
    applyPowerup(room, host.id, 'bencao', null, actionId(), t0);
    expect(host.wrong).toBe(1);
    host.wrong = 6;
    host.eliminated = true;
    applyPowerup(room, host.id, 'bencao', null, actionId(), t0 + 1000);
    expect(host.wrong).toBe(5);
    expect(host.eliminated).toBe(false);
  });

  it('Sanguessuga e Roubo transferem recursos', () => {
    const { room, host, target, t0 } = makeRoom();
    host.score = 0;
    target.score = 50;
    give(host, { sanguessuga: 1, roubo: 1 });
    target.powerups = { oraculo: 1 };
    applyPowerup(room, host.id, 'sanguessuga', target.id, actionId(), t0);
    expect(target.score).toBe(30);
    expect(host.score).toBe(20);
    target.attackedAt = 0;
    applyPowerup(room, host.id, 'roubo', target.id, actionId(), t0 + 5000);
    expect(target.powerups.oraculo).toBeUndefined();
    expect(host.powerups.oraculo).toBe(1);
  });

  it('Trovao forca um erro e Chuva revela para todos', () => {
    const { room, host, target, t0 } = makeRoom({ playerCount: 3 });
    give(host, { trovao: 1, chuva: 1 });
    applyPowerup(room, host.id, 'trovao', target.id, actionId(), t0);
    expect(target.wrong).toBe(1);
    target.attackedAt = 0;
    const before = room.players.map((player) => player.guessed.length);
    applyPowerup(room, host.id, 'chuva', null, actionId(), t0 + 1000);
    room.players.forEach((player, index) => {
      expect(player.guessed.length).toBe(before[index] + 1);
    });
  });

  it('rejeita poder desconhecido, sem carga, alvo proprio e __proto__', () => {
    const { room, host, target, t0 } = makeRoom();
    give(host, { oraculo: 1 });
    expectCode(() => applyPowerup(room, host.id, '__proto__', null, actionId(), t0), 'INVALID_POWERUP');
    expectCode(() => applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0), 'NO_CHARGE');
    give(host, { vendaval: 1 });
    expectCode(() => applyPowerup(room, host.id, 'vendaval', host.id, actionId(), t0), 'INVALID_TARGET');
  });

  it('acao repetida nao consome duas cargas', () => {
    const { room, host, t0 } = makeRoom();
    give(host, { oraculo: 1 });
    const id = actionId();
    applyPowerup(room, host.id, 'oraculo', null, id, t0);
    const guessedAfter = host.guessed.length;
    const duplicate = applyPowerup(room, host.id, 'oraculo', null, id, t0 + 1000);
    expect(duplicate.changed).toBe(false);
    expect(host.guessed.length).toBe(guessedAfter);
  });

  it('respeita intro, imunidade e cooldown de ataque', () => {
    const { room, host, target, startedAt, t0 } = makeRoom({ playerCount: 3 });
    const third = room.players[2];
    applyGuess(room, target.id, uniqueLetters(target.word)[0], actionId(), room.roundStartedAt + 1000);
    give(host, { vendaval: 2 });
    expectCode(
      () => applyPowerup(room, host.id, 'vendaval', target.id, actionId(), startedAt + 1000),
      'ROUND_INTRO',
    );
    applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0);
    expectCode(
      () => applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0 + 1000),
      'TARGET_IMMUNE',
    );
    target.attackedAt = 0;
    expectCode(
      () => applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0 + 2000),
      'ATTACK_COOLDOWN',
    );
    expectCode(
      () => applyPowerup(room, third.id, 'vendaval', target.id, actionId(), t0 + 5000),
      'NO_CHARGE',
    );
  });
});

describe('ciclo de rodadas', () => {
  it('encerra rodada, resume e inicia a proxima com palavras novas', () => {
    const { room } = makeRoom({ playerCount: 2, wordLength: 6 });
    const firstWords = room.players.map((player) => player.word);
    expect(advance(room, room.roundEndsAt)).toBe(true);
    expect(room.status).toBe('round_over');
    expect(room.roundSummary.words).toHaveLength(2);
    expect(room.roundSummary.standings.length).toBe(2);
    advance(room, room.nextRoundAt);
    expect(room.status).toBe('playing');
    expect(room.round).toBe(2);
    for (const player of room.players) {
      expect(firstWords).not.toContain(player.word);
      expect(player.word.length).toBe(6);
    }
  });

  it('termina o match apos tres rodadas e permite revanche', () => {
    const { room } = makeRoom({ playerCount: 2 });
    for (let round = 1; round <= 3; round += 1) {
      advance(room, room.roundEndsAt);
      expect(room.status).toBe('round_over');
      advance(room, room.nextRoundAt);
      if (round < 3) expect(room.status).toBe('playing');
    }
    expect(room.status).toBe('finished');
    expect(room.winnerId).toBeTruthy();
    const snap = snapshot(room, room.hostId, Date.now());
    expect(snap.finalStandings.length).toBe(2);
    expect(snap.finalWords.length).toBe(2);
    startMatch(room, room.hostId, Date.now() + 1000);
    expect(room.status).toBe('playing');
    expect(room.round).toBe(1);
    expect(room.players.every((player) => player.score === 0)).toBe(true);
  });

  it('remove jogador do lobby e transfere host', () => {
    const { room, host } = makeRoom({ playerCount: 2 });
    room.status = 'lobby';
    const second = room.players[1];
    leaveRoom(room, host.id, room.roundStartedAt + 1000);
    expect(room.players).toHaveLength(1);
    expect(room.hostId).toBe(second.id);
  });
});
