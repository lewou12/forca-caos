import { createRoom, joinRoom, startMatch } from '../shared/engine.js';

let counter = 0;

export function actionId() {
  counter += 1;
  return `action_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeRoom({ playerCount = 2, wordLength = 6, now = 1_000_000 } = {}) {
  const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Enzo', 'Fabi'];
  const { room, playerId, token } = createRoom({ name: names[0], wordLength, now });
  const credentials = [{ playerId, token, name: names[0] }];

  for (let index = 1; index < playerCount; index += 1) {
    const joined = joinRoom(room, { name: names[index], now: now + index * 100 });
    credentials.push({
      playerId: joined.player.id,
      token: joined.token,
      name: names[index],
    });
  }

  const startedAt = now + 5000;
  startMatch(room, playerId, startedAt);

  return {
    room,
    credentials,
    host: room.players[0],
    target: room.players[1],
    startedAt,
    t0: startedAt + 6000,
  };
}

export function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    if (error?.code !== code) {
      throw new Error(`Esperava ${code}, recebi ${error?.code}: ${error?.message}`);
    }
    return error;
  }
  throw new Error(`Esperava que lançasse ${code}, mas não lançou.`);
}

export async function expectCodeAsync(fn, code) {
  try {
    await fn();
  } catch (error) {
    if (error?.code !== code) {
      throw new Error(`Esperava ${code}, recebi ${error?.code}: ${error?.message}`);
    }
    return error;
  }
  throw new Error(`Esperava que lançasse ${code}, mas não lançou.`);
}
