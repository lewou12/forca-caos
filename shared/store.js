/** Adaptador D1 + orquestração de uma mutação de sala com CAS. */

import { compareAndSwap } from './cas.js';
import {
  PRESENCE_UPDATE_MS,
  ROOM_TTL_MS,
} from './constants.js';
import {
  GameError,
  advance,
  requireSession,
  snapshot,
} from './engine.js';

function db(env) {
  if (!env?.DB) {
    throw new GameError('DB_UNAVAILABLE', 'Banco de dados indisponível.', 503);
  }
  return env.DB;
}

export async function loadRoom(env, code) {
  const row = await db(env)
    .prepare('SELECT state, version FROM rooms WHERE code = ?')
    .bind(code)
    .first();

  if (!row) return null;

  let room;
  try {
    room = JSON.parse(row.state);
  } catch {
    throw new GameError('CORRUPT_ROOM', 'O estado da sala está corrompido.', 500);
  }
  room.version = row.version;
  return { value: room, version: row.version };
}

export async function insertRoom(env, room, now = Date.now()) {
  const result = await db(env)
    .prepare(
      'INSERT OR IGNORE INTO rooms (code, state, version, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(room.code, JSON.stringify(room), 0, now, now + ROOM_TTL_MS)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function saveRoom(env, room, expectedVersion) {
  const now = Date.now();
  const version = expectedVersion + 1;
  room.version = version;
  const result = await db(env)
    .prepare(
      'UPDATE rooms SET state = ?, version = ?, updated_at = ?, expires_at = ? WHERE code = ? AND version = ?',
    )
    .bind(JSON.stringify(room), version, now, now + ROOM_TTL_MS, room.code, expectedVersion)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function removeRoom(env, code, expectedVersion) {
  const result = await db(env)
    .prepare('DELETE FROM rooms WHERE code = ? AND version = ?')
    .bind(code, expectedVersion)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function deleteExpiredRooms(env, now = Date.now()) {
  await db(env)
    .prepare('DELETE FROM rooms WHERE expires_at < ?')
    .bind(now)
    .run();
}

/**
 * Executa uma ação sobre uma sala com autenticação opcional, advance() de
 * timers, presença e CAS. Retorna `{ snapshot, result, deleted }`.
 */
export async function withRoom(
  env,
  code,
  {
    playerId = null,
    token = null,
    mutate = null,
    now = () => Date.now(),
    rng = Math.random,
    retries = 4,
  } = {},
) {
  const value = await compareAndSwap({
    retries,
    load: () => loadRoom(env, code),
    save: (room, expectedVersion) => saveRoom(env, room, expectedVersion),
    remove: (expectedVersion) => removeRoom(env, code, expectedVersion),
    mutate: (room, rowVersion) => {
      room.version = rowVersion;
      const currentTime = now();

      let viewer = null;
      if (playerId || token) {
        viewer = requireSession(room, playerId, token);
      }

      let changed = advance(room, currentTime, rng);

      if (viewer && currentTime - viewer.lastSeen > PRESENCE_UPDATE_MS) {
        viewer.lastSeen = currentTime;
        changed = true;
      }

      let actionResult = null;
      let actionError = null;
      if (mutate) {
        try {
          actionResult = mutate(room, currentTime, viewer);
        } catch (error) {
          actionError = error;
        }
      }

      if (!actionError) {
        // A ação pode ter resolvido a última palavra ou esgotado o tempo.
        changed = advance(room, currentTime, rng) || changed;
      }

      if (actionResult?.changed) changed = true;

      if (actionResult?.deleteRoom) {
        return {
          changed: true,
          remove: true,
          value: { deleted: true, result: actionResult.result ?? null, snapshot: null },
        };
      }

      let payload = null;
      let snapshotValue = null;
      if (changed) room.version = rowVersion + 1;

      const viewerId = actionResult?.viewerId ?? viewer?.id ?? null;
      if (viewerId && room.players.some((player) => player.id === viewerId)) {
        snapshotValue = snapshot(room, viewerId, currentTime);
      }

      payload = {
        snapshot: snapshotValue,
        result: actionResult?.result ?? null,
        error: actionError,
      };

      if (actionError && !changed) {
        // Nada foi alterado: não grava, apenas propaga o erro.
        return { changed: false, value: payload };
      }

      return { changed, value: payload };
    },
  });

  if (value?.error) throw value.error;
  return value;
}

export async function pingDatabase(env) {
  await db(env).prepare('SELECT COUNT(*) AS total FROM rooms').first();
  return true;
}
