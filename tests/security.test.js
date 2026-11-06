import { describe, expect, it } from 'vitest';
import {
  applyGuess,
  applyPowerup,
  createRoom,
  joinRoom,
  snapshot,
} from '../shared/engine.js';
import { normalizeInventory, totalPowerups } from '../shared/powerups.js';
import {
  isValidActionId,
  isValidCode,
  isValidPlayerId,
  isValidToken,
  normalizeLetter,
  sanitizeName,
} from '../shared/validate.js';
import { actionId, expectCode, makeRoom } from './helpers.js';

const FORBIDDEN_IN_NAME = /[<>"'`()=/\\\u0000-\u001f\u200b-\u200f]/;

describe('sanitizacao de nomes', () => {
  it('remove tags, aspas, parenteses e caracteres de controle', () => {
    const samples = [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      'A\u200bna\u200f',
      'nome\u0000com\u0007controle',
      "Robert'); DROP TABLE rooms;--",
    ];
    for (const sample of samples) {
      const clean = sanitizeName(sample);
      expect(clean).not.toMatch(FORBIDDEN_IN_NAME);
      expect(clean.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('preserva acentos e limita a 16 caracteres', () => {
    expect(sanitizeName('José')).toBe('José');
    expect(sanitizeName('Ação')).toBe('Ação');
    const long = sanitizeName('A'.repeat(40));
    expect([...long]).toHaveLength(16);
  });

  it('rejeita nomes vazios ou sem letras', () => {
    expect(sanitizeName('')).toBe('');
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('<>')).toBe('');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName(null)).toBe('');
  });

  it('joinRoom armazena apenas nome sanitizado', () => {
    const { room } = createRoom({ name: 'Ana', now: 1000 });
    const joined = joinRoom(room, { name: '<b>Bia</b>', now: 1200 });
    expect(joined.player.name).toBe('bBiab');
    expect(joined.player.name).not.toMatch(/[<>/]/);
  });
});

describe('validacao de identificadores', () => {
  it('aceita apenas actionIds seguros e curtos', () => {
    expect(isValidActionId(actionId())).toBe(true);
    expect(isValidActionId('abc')).toBe(false);
    expect(isValidActionId('a'.repeat(65))).toBe(false);
    expect(isValidActionId('../etc/passwd')).toBe(false);
    expect(isValidActionId('<script>alert(1)</script>')).toBe(false);
    expect(isValidActionId(null)).toBe(false);
  });

  it('valida codigo, playerId e token com formatos estritos', () => {
    expect(isValidCode('ABC23')).toBe(true);
    expect(isValidCode('abc23')).toBe(true);
    expect(isValidCode('ABC1O')).toBe(false);
    expect(isValidCode('ABCD')).toBe(false);
    expect(isValidPlayerId('p_0123456789abcdef')).toBe(true);
    expect(isValidPlayerId('p_xyz')).toBe(false);
    expect(isValidToken('a'.repeat(64))).toBe(true);
    expect(isValidToken('a'.repeat(63))).toBe(false);
    expect(isValidToken('g'.repeat(64))).toBe(false);
  });

  it('normaliza letras para A-Z maiusculo', () => {
    expect(normalizeLetter(' a ')).toBe('A');
    expect(normalizeLetter('ç')).toBeNull();
    expect(normalizeLetter('AB')).toBeNull();
    expect(normalizeLetter(7)).toBeNull();
  });
});

describe('anti-vazamento no snapshot', () => {
  it('nao expoe palavra, token nem historico oculto do adversario', () => {
    const { room, credentials } = makeRoom({ playerCount: 3, wordLength: 7 });
    const viewerId = credentials[0].playerId;
    applyGuess(room, viewerId, 'A', actionId(), room.roundStartedAt + 1000);
    const snap = snapshot(room, viewerId, room.roundStartedAt + 2000);
    const json = JSON.stringify(snap);

    for (const player of room.players) {
      expect(player.word).toBeTruthy();
      expect(json).not.toContain(player.word);
      expect(json).not.toContain(player.token);
    }
    expect(Object.keys(snap.players[0])).not.toContain('token');
    expect(Object.keys(snap.players[0])).not.toContain('word');
    expect(Object.keys(snap.players[0])).not.toContain('guessed');
  });

  it('palavra so aparece no resumo da rodada e no final', () => {
    const { room } = makeRoom({ playerCount: 2 });
    const snapBefore = snapshot(room, room.hostId, room.roundStartedAt + 1000);
    expect(snapBefore.finalWords).toBeUndefined();
    expect(snapBefore.roundSummary).toBeNull();

    room.status = 'finished';
    const snapAfter = snapshot(room, room.hostId, room.roundStartedAt + 99_000);
    expect(snapAfter.finalWords).toHaveLength(2);
    expect(snapAfter.finalWords.every((entry) => entry.word.length > 0)).toBe(true);
  });

  it('Cegueira esconde a propria mascara e libera depois', () => {
    const { room, host, t0 } = makeRoom();
    host.effects.blindUntil = t0 + 3000;
    const blind = snapshot(room, host.id, t0);
    expect(blind.you.maskHidden).toBe(true);
    expect(blind.you.mask.every((letter) => letter === null)).toBe(true);
    expect(blind.you.guessed).toEqual([]);
    expect(blind.you.canAct).toBe(false);

    const after = snapshot(room, host.id, t0 + 4000);
    expect(after.you.maskHidden).toBe(false);
    expect(after.you.mask.some((letter) => letter === null)).toBe(true);
  });

  it('Tinta esconde a mascara para o dono e para os adversarios', () => {
    const { room, host, target, t0 } = makeRoom();
    const letter = [...new Set([...target.word])][0];
    applyGuess(room, target.id, letter, actionId(), room.roundStartedAt + 1000);
    target.effects.inkUntil = t0 + 6000;
    const own = snapshot(room, target.id, t0 + 1000);
    expect(own.you.maskHidden).toBe(true);
    expect(own.you.lastAction.letter).toBeNull();
    expect(own.players.find((player) => player.id === target.id).maskHidden).toBe(true);

    const other = snapshot(room, host.id, t0 + 1000).players.find((player) => player.id === target.id);
    expect(other.maskHidden).toBe(true);
    expect(other.mask.every((maskLetter) => maskLetter === null)).toBe(true);
    expect(other.lastAction.letter).toBeNull();
  });
});

describe('anti-cheat de power-ups', () => {
  it('rejeita id desconhecido e poluicao de prototipo', () => {
    const { room, host, t0 } = makeRoom();
    const before = JSON.stringify(host);
    expectCode(() => applyPowerup(room, host.id, '__proto__', null, actionId(), t0), 'INVALID_POWERUP');
    expectCode(() => applyPowerup(room, host.id, 'constructor', null, actionId(), t0), 'INVALID_POWERUP');
    expect(Object.prototype.oraculo).toBeUndefined();
    expect(JSON.stringify(host)).toBe(before);
  });

  it('normalizeInventory ignora chaves herdadas e valores invalidos', () => {
    const polluted = JSON.parse('{"__proto__":{"oraculo":99},"tinta":2,"vendaval":-1,"roubo":"3"}');
    const inventory = normalizeInventory(polluted);
    expect(inventory).toEqual({ tinta: 2 });
    expect(totalPowerups(inventory)).toBe(2);
    expect({}.oraculo).toBeUndefined();
  });

  it('actionId invalido nao altera o estado', () => {
    const { room, host, t0 } = makeRoom();
    const before = JSON.stringify(host);
    expectCode(() => applyPowerup(room, host.id, 'oraculo', null, 'x', t0), 'INVALID_ACTION');
    expect(JSON.stringify(host)).toBe(before);
  });

  it('nao aceita alvo de outra sala', () => {
    const first = makeRoom();
    const second = makeRoom();
    const alien = second.room.players[1];
    first.host.powerups = { vendaval: 1 };
    expectCode(
      () => applyPowerup(first.room, first.host.id, 'vendaval', alien.id, actionId(), first.t0),
      'TARGET_NOT_FOUND',
    );
  });

  it('remover jogador nao permite atacar quem saiu', () => {
    const { room, host, target, t0 } = makeRoom();
    target.left = true;
    host.powerups = { vendaval: 1 };
    expectCode(
      () => applyPowerup(room, host.id, 'vendaval', target.id, actionId(), t0),
      'INVALID_TARGET',
    );
  });
});
