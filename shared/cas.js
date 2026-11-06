/**
 * Laço genérico de compare-and-swap (CAS).
 *
 * O estado da sala é lido com uma versão, mutado em memória e salvo apenas se
 * a versão ainda for a mesma. Em conflito, a mutação é executada de novo sobre
 * o estado mais recente. Isso é o coração da proteção contra race conditions.
 */

import { GameError } from './engine.js';

export async function compareAndSwap({
  load,
  save,
  remove = null,
  mutate,
  retries = 4,
  conflictMessage = 'A sala está muito movimentada. Tente novamente.',
}) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const loaded = await load();
    if (!loaded) {
      throw new GameError('ROOM_NOT_FOUND', 'Sala não encontrada.', 404);
    }

    const outcome = await mutate(loaded.value, loaded.version);
    if (!outcome || !outcome.changed) {
      return outcome?.value ?? null;
    }

    if (outcome.remove) {
      if (!remove) {
        throw new GameError('DELETE_UNSUPPORTED', 'Operação inválida.', 500);
      }
      const deleted = await remove(loaded.version);
      if (deleted) return outcome.value;
      continue;
    }

    const saved = await save(loaded.value, loaded.version);
    if (saved) return outcome.value;
  }

  throw new GameError('CONFLICT', conflictMessage, 409);
}
