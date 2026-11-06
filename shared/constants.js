/**
 * Constantes compartilhadas entre servidor (Pages Functions) e testes.
 * Nada aqui pode depender de APIs de Node ou de browser.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const ROUNDS = 3;
export const ROUND_SECONDS = 90;
export const MAX_ERRORS = 6;
export const MAX_INVENTORY = 5;

export const ROUND_OVER_MS = 7000;
export const ROUND_INTRO_MS = 5000;
export const ATTACK_IMMUNITY_MS = 2000;
export const ATTACK_COOLDOWN_MS = 4000;
export const POWERUP_COOLDOWN_MS = 600;
export const GUESS_COOLDOWN_MS = 250;
export const TIMED_AWARD_MS = 30000;
export const PRESENCE_UPDATE_MS = 8000;
export const DISCONNECT_MS = 45000;
export const TIME_BONUS_CAP = 45;

export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_LOG = 40;
export const SNAPSHOT_LOG = 30;
export const MAX_ACTION_IDS = 12;

export const CODE_LENGTH = 5;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

export const NAME_MIN = 2;
export const NAME_MAX = 16;

export const WORD_LENGTHS = [5, 6, 7, 8];
export const DEFAULT_WORD_LENGTH = 6;

export const STARTING_POWERUP = 'oraculo';

export const PLAYER_COLORS = [
  '#7C5CFF',
  '#55D6FF',
  '#3DDC97',
  '#FFC857',
  '#FF6B6B',
  '#FF7AD9',
];

export const PLACEMENT_POINTS = [30, 20, 10];

export const STATUS = Object.freeze({
  LOBBY: 'lobby',
  PLAYING: 'playing',
  ROUND_OVER: 'round_over',
  FINISHED: 'finished',
});

export const MAX_BODY_BYTES = 4096;

export const RATE_LIMITS = Object.freeze({
  create: { max: 12, windowMs: 60 * 60 * 1000 },
  join: { max: 45, windowMs: 60 * 1000 },
});

export const EFFECT_KEYS = Object.freeze([
  'blindUntil',
  'inkUntil',
  'shieldUntil',
  'overchargeUntil',
]);
