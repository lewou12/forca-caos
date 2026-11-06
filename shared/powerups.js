/**
 * Catálogo de power-ups. Metadados puros, usados pelo servidor (regras e
 * sorteio) e pelo cliente (apresentação). Nenhuma regra de efeito mora aqui:
 * o engine é a única fonte da verdade.
 */

export const POWERUPS = Object.freeze({
  oraculo: {
    id: 'oraculo',
    name: 'Oráculo',
    icon: 'oraculo',
    kind: 'self',
    rarity: 'comum',
    color: '#55D6FF',
    short: 'Revela uma consoante da sua palavra.',
    description: 'Revela uma consoante correta ainda oculta. Se não houver consoante, revela qualquer letra.',
    weight: 20,
  },
  vendaval: {
    id: 'vendaval',
    name: 'Vendaval',
    icon: 'vendaval',
    kind: 'attack',
    rarity: 'comum',
    color: '#7C5CFF',
    short: 'Apaga uma letra revelada do alvo.',
    description: 'Escolhe uma letra já descoberta do adversário e a apaga. Ele precisará chutá-la novamente.',
    weight: 18,
  },
  cegueira: {
    id: 'cegueira',
    name: 'Cegueira',
    icon: 'cegueira',
    kind: 'attack',
    rarity: 'comum',
    color: '#FF6B6B',
    short: 'Cega o alvo por 3 segundos.',
    description: 'Cobre a tela do alvo e bloqueia novos chutes por 3 segundos.',
    weight: 16,
    durationMs: 3000,
  },
  tinta: {
    id: 'tinta',
    name: 'Bomba de Tinta',
    icon: 'tinta',
    kind: 'attack',
    rarity: 'comum',
    color: '#9B7BFF',
    short: 'Esconde as letras do alvo por 6 segundos.',
    description: 'Uma mancha cobre os espaços de letras do alvo para toda a sala por 6 segundos.',
    weight: 14,
    durationMs: 6000,
  },
  escudo: {
    id: 'escudo',
    name: 'Escudo',
    icon: 'escudo',
    kind: 'self',
    rarity: 'incomum',
    color: '#3DDC97',
    short: 'Bloqueia o próximo ataque.',
    description: 'Cria uma barreira por 15 segundos que anula o próximo ataque recebido.',
    weight: 10,
    durationMs: 15000,
  },
  bencao: {
    id: 'bencao',
    name: 'Bênção',
    icon: 'bencao',
    kind: 'self',
    rarity: 'incomum',
    color: '#3DDC97',
    short: 'Remove um erro do seu boneco.',
    description: 'Apaga um segmento do seu boneco. Se você estava eliminado, volta com 5 erros.',
    weight: 8,
  },
  sobrecarga: {
    id: 'sobrecarga',
    name: 'Sobrecarga',
    icon: 'sobrecarga',
    kind: 'self',
    rarity: 'incomum',
    color: '#FFC857',
    short: 'O próximo acerto vale 3×.',
    description: 'Seu próximo acerto de letra vale o triplo de pontos. Vale por 20 segundos.',
    weight: 6,
    durationMs: 20000,
  },
  sanguessuga: {
    id: 'sanguessuga',
    name: 'Sanguessuga',
    icon: 'sanguessuga',
    kind: 'attack',
    rarity: 'raro',
    color: '#FF6B6B',
    short: 'Rouba 20 pontos do alvo.',
    description: 'Transfere 20 pontos do placar do alvo para o seu.',
    weight: 5,
  },
  roubo: {
    id: 'roubo',
    name: 'Roubo de Carga',
    icon: 'roubo',
    kind: 'attack',
    rarity: 'raro',
    color: '#FF7AD9',
    short: 'Rouba um power-up do alvo.',
    description: 'Rouba uma carga de power-up aleatória do adversário e adiciona ao seu inventário.',
    weight: 4,
  },
  trovao: {
    id: 'trovao',
    name: 'Trovão',
    icon: 'trovao',
    kind: 'attack',
    rarity: 'raro',
    color: '#FFC857',
    short: 'Força um erro no alvo.',
    description: 'Um raio marca um segmento do boneco do adversário. Pode eliminar.',
    weight: 3,
  },
  chuva: {
    id: 'chuva',
    name: 'Chuva de Letras',
    icon: 'chuva',
    kind: 'global',
    rarity: 'raro',
    color: '#55D6FF',
    short: 'Revela uma letra para todos.',
    description: 'Revela uma letra aleatória para cada jogador ativo — inclusive para os adversários.',
    weight: 4,
  },
});

export const POWERUP_IDS = Object.freeze(Object.keys(POWERUPS));

export const ATTACK_IDS = Object.freeze(
  POWERUP_IDS.filter((id) => POWERUPS[id].kind === 'attack'),
);

const ATTACK_SET = new Set(ATTACK_IDS);

export function isPowerupId(id) {
  return typeof id === 'string' && Object.hasOwn(POWERUPS, id);
}

export function isAttack(id) {
  return ATTACK_SET.has(id);
}

export function totalPowerups(inventory) {
  if (!inventory || typeof inventory !== 'object') return 0;
  let total = 0;
  for (const id of POWERUP_IDS) {
    if (Object.hasOwn(inventory, id)) {
      const count = inventory[id];
      if (Number.isInteger(count) && count > 0) total += count;
    }
  }
  return total;
}

export function addPowerup(inventory, id, amount = 1) {
  if (!isPowerupId(id)) return inventory;
  const current = Number.isInteger(inventory[id]) ? inventory[id] : 0;
  inventory[id] = Math.max(0, current + amount);
  if (inventory[id] === 0) delete inventory[id];
  return inventory;
}

export function removePowerup(inventory, id, amount = 1) {
  if (!isPowerupId(id)) return false;
  const current = Number.isInteger(inventory[id]) ? inventory[id] : 0;
  if (current < amount) return false;
  const next = current - amount;
  if (next <= 0) delete inventory[id];
  else inventory[id] = next;
  return true;
}

export function normalizeInventory(value) {
  const inventory = {};
  if (!value || typeof value !== 'object') return inventory;
  for (const id of POWERUP_IDS) {
    if (!Object.hasOwn(value, id)) continue;
    const count = value[id];
    if (Number.isInteger(count) && count > 0) inventory[id] = count;
  }
  return inventory;
}

export function randomPowerupId(rng = Math.random, exclude = null) {
  const pool = POWERUP_IDS.filter((id) => !exclude || !exclude.has(id));
  const total = pool.reduce((sum, id) => sum + POWERUPS[id].weight, 0);
  let roll = rng() * total;
  for (const id of pool) {
    roll -= POWERUPS[id].weight;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1] ?? 'oraculo';
}
