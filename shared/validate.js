/** Validação e sanitização de entradas. Nenhum dado de usuário vira HTML. */

import { NAME_MAX, NAME_MIN, WORD_LENGTHS, CODE_RE } from './constants.js';

const DISALLOWED = /[^\p{L}\p{M}\p{N} ._-]/gu;
const CONTROL = /\p{C}/gu;
const MULTI_SPACE = /\s+/gu;
const HAS_ALNUM = /[\p{L}\p{N}]/u;

/**
 * Allowlist: letras Unicode, marcas, números, espaço, ponto, hífen e underline.
 * Remove tags, quotes, parênteses, controles e zero-width. Retorna '' se
 * o resultado não for um nome utilizável.
 */
export function sanitizeName(input) {
  if (typeof input !== 'string') return '';
  let name = input.normalize('NFKC');
  name = name.replace(CONTROL, '');
  name = name.replace(DISALLOWED, '');
  name = name.replace(MULTI_SPACE, ' ').trim();
  if (!HAS_ALNUM.test(name)) return '';
  const chars = [...name];
  if (chars.length > NAME_MAX) name = chars.slice(0, NAME_MAX).join('').trim();
  if ([...name].length < NAME_MIN) return '';
  return name;
}

export function isValidCode(code) {
  return typeof code === 'string' && CODE_RE.test(code.trim().toUpperCase());
}

export function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function normalizeLetter(input) {
  if (typeof input !== 'string') return null;
  const letter = input.trim().toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : null;
}

export function isValidWordLength(value) {
  return Number.isInteger(value) && WORD_LENGTHS.includes(value);
}

export function isValidActionId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export function isValidPlayerId(value) {
  return typeof value === 'string' && /^p_[a-f0-9]{16,32}$/.test(value);
}

export function isValidToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
