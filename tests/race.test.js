import { describe, expect, it } from 'vitest';
import { compareAndSwap } from '../shared/cas.js';
import { applyGuess, applyPowerup } from '../shared/engine.js';
import { actionId, makeRoom } from './helpers.js';

const pause = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Store em memoria com a mesma semantica do D1: save/remove so vencem se a
 * versao esperada ainda for a atual. O `await pause()` força intercalacao real.
 */
function createStore(initial) {
  let state = structuredClone(initial);
  let version = 0;
  const stats = { loads: 0, saves: 0, conflicts: 0, removes: 0 };

  return {
    stats,
    get state() {
      return state === null ? null : structuredClone(state);
    },
    get version() {
      return version;
    },
    async load() {
      stats.loads += 1;
      await pause();
      return { value: state === null ? null : structuredClone(state), version };
    },
    async save(next, expected) {
      await pause();
      if (expected !== version) {
        stats.conflicts += 1;
        return false;
      }
      state = structuredClone(next);
      version += 1;
      stats.saves += 1;
      return true;
    },
    async remove(expected) {
      await pause();
      if (expected !== version) {
        stats.conflicts += 1;
        return false;
      }
      state = null;
      version += 1;
      stats.removes += 1;
      return true;
    },
  };
}

function casOptions(store) {
  return {
    load: () => store.load(),
    save: (next, expected) => store.save(next, expected),
    remove: (expected) => store.remove(expected),
  };
}

describe('CAS contra corridas', () => {
  it('25 incrementos concorrentes nao perdem atualizacao', async () => {
    const store = createStore({ count: 0 });

    await Promise.all(
      Array.from({ length: 25 }, () =>
        compareAndSwap({
          ...casOptions(store),
          retries: 200,
          mutate: (view) => {
            view.count += 1;
            return { changed: true, value: view.count };
          },
        }),
      ),
    );

    expect(store.state.count).toBe(25);
    expect(store.version).toBe(25);
    expect(store.stats.saves).toBe(25);
    expect(store.stats.conflicts).toBeGreaterThan(0);
  });

  it('mutacao sem mudanca nao grava nem incrementa versao', async () => {
    const store = createStore({ count: 0 });
    const result = await compareAndSwap({
      ...casOptions(store),
      mutate: () => ({ changed: false, value: 'sem-mudanca' }),
    });

    expect(result).toBe('sem-mudanca');
    expect(store.version).toBe(0);
    expect(store.stats.saves).toBe(0);
  });

  it('esgotar tentativas gera CONFLICT sem gravar', async () => {
    const store = createStore({ count: 0 });
    const error = await compareAndSwap({
      load: () => store.load(),
      save: async () => false,
      retries: 3,
      mutate: (view) => {
        view.count += 1;
        return { changed: true, value: view.count };
      },
    }).catch((failure) => failure);

    expect(error?.code).toBe('CONFLICT');
    expect(store.version).toBe(0);
  });

  it('sala inexistente gera ROOM_NOT_FOUND', async () => {
    const error = await compareAndSwap({
      load: async () => null,
      save: async () => true,
      mutate: () => ({ changed: true }),
    }).catch((failure) => failure);

    expect(error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('remove so vence com a versao correta', async () => {
    const store = createStore({ room: 'abc' });
    const result = await compareAndSwap({
      ...casOptions(store),
      mutate: () => ({ changed: true, remove: true, value: { deleted: true } }),
    });

    expect(result).toEqual({ deleted: true });
    expect(store.state).toBeNull();
    expect(store.stats.removes).toBe(1);
  });
});

describe('corridas de jogo', () => {
  it('duas cargas simultaneas nao gastam o mesmo power-up duas vezes', async () => {
    const { room, host } = makeRoom();
    host.powerups = { oraculo: 1 };
    let clock = room.roundStartedAt + 10_000;
    const nextNow = () => {
      clock += 700;
      return clock;
    };
    const before = host.guessed.length;
    const store = createStore(room);

    const attempt = (id) =>
      compareAndSwap({
        ...casOptions(store),
        retries: 8,
        mutate: (state) => {
          const result = applyPowerup(state, host.id, 'oraculo', null, id, nextNow());
          return { changed: result.changed, value: result };
        },
      });

    const outcomes = await Promise.allSettled([attempt(actionId()), attempt(actionId())]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason?.code).toBe('NO_CHARGE');
    expect(store.state.players[0].powerups.oraculo).toBeUndefined();
    expect(store.state.players[0].guessed.length).toBe(before + 1);
  });

  it('mesmo actionId concorrente consome apenas uma carga', async () => {
    const { room, host } = makeRoom();
    host.powerups = { oraculo: 1 };
    let clock = room.roundStartedAt + 10_000;
    const nextNow = () => {
      clock += 700;
      return clock;
    };
    const before = host.guessed.length;
    const id = actionId();
    const store = createStore(room);

    const attempt = () =>
      compareAndSwap({
        ...casOptions(store),
        retries: 8,
        mutate: (state) => {
          const result = applyPowerup(state, host.id, 'oraculo', null, id, nextNow());
          return { changed: result.changed, value: result };
        },
      });

    const results = await Promise.all([attempt(), attempt()]);
    const created = results.filter((result) => result?.changed === true);
    const duplicates = results.filter((result) => result?.duplicate === true);

    expect(created).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(store.state.players[0].powerups.oraculo).toBeUndefined();
    expect(store.state.players[0].guessed.length).toBe(before + 1);
  });

  it('chutes simultaneos da mesma letra contam uma vez so', async () => {
    const { room, host } = makeRoom({ wordLength: 8 });
    const letter = [...new Set([...host.word])][0];
    let clock = room.roundStartedAt + 1000;
    const nextNow = () => {
      clock += 300;
      return clock;
    };
    const store = createStore(room);

    const attempt = () =>
      compareAndSwap({
        ...casOptions(store),
        retries: 8,
        mutate: (state) => {
          const result = applyGuess(state, host.id, letter, actionId(), nextNow());
          return { changed: result.changed, value: result };
        },
      });

    const results = await Promise.all([attempt(), attempt()]);
    const changed = results.filter((result) => result?.changed === true);
    const duplicates = results.filter((result) => result?.duplicateLetter === true);

    expect(changed).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    const finalPlayer = store.state.players[0];
    expect(finalPlayer.guessed.filter((guessed) => guessed === letter)).toHaveLength(1);
    expect(finalPlayer.streak).toBe(1);
    expect(finalPlayer.score).toBe(10);
  });

  it('chutes simultaneos de letras diferentes somam pontos', async () => {
    const { room, host } = makeRoom({ wordLength: 8 });
    const letters = [...new Set([...host.word])].slice(0, 2);
    expect(letters).toHaveLength(2);
    let clock = room.roundStartedAt + 1000;
    const nextNow = () => {
      clock += 300;
      return clock;
    };
    const store = createStore(room);

    const attempt = (letter) =>
      compareAndSwap({
        ...casOptions(store),
        retries: 8,
        mutate: (state) => {
          const result = applyGuess(state, host.id, letter, actionId(), nextNow());
          return { changed: result.changed, value: result };
        },
      });

    await Promise.all(letters.map((letter) => attempt(letter)));
    const finalPlayer = store.state.players[0];
    expect(finalPlayer.guessed).toEqual(expect.arrayContaining(letters));
    expect(finalPlayer.streak).toBe(2);
    expect(finalPlayer.score).toBe(22);
  });
});
