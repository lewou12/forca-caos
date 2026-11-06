/** Utilidades de aleatoriedade e identificadores (Workers + Node 20+). */

import { CODE_ALPHABET, CODE_LENGTH } from './constants.js';

export function secureRandom() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 0x100000000;
}

export function randomInt(max, rng = Math.random) {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(max - 1, Math.floor(rng() * max));
}

export function randomChoice(items, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items[randomInt(items.length, rng)];
}

export function secureInt(max) {
  return randomInt(max, secureRandom);
}

export function makeId(prefix = 'p') {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateCode(rng = secureRandom) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length, rng)];
  }
  return code;
}

export function shuffle(items, rng = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1, rng);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Comparação de tokens em tempo (quase) constante. */
export function tokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
