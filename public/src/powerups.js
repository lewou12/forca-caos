/** Catalogo de apresentacao dos power-ups (o servidor valida tudo). */

export const POWERUPS = Object.freeze({
  oraculo: {
    id: 'oraculo',
    name: 'Oráculo',
    kind: 'self',
    short: 'Revela uma consoante sua.',
    description: 'Revela uma consoante correta ainda oculta da sua palavra.',
    color: '#55D6FF',
    glyph: '◉',
  },
  vendaval: {
    id: 'vendaval',
    name: 'Vendaval',
    kind: 'attack',
    short: 'Apaga uma letra do alvo.',
    description: 'Escolhe uma letra já descoberta do adversário e a apaga.',
    color: '#7C5CFF',
    glyph: '≋',
  },
  cegueira: {
    id: 'cegueira',
    name: 'Cegueira',
    kind: 'attack',
    short: 'Cega o alvo por 3s.',
    description: 'Cobre a tela do alvo e bloqueia os chutes dele por 3 segundos.',
    color: '#FF6B6B',
    glyph: '◍',
  },
  tinta: {
    id: 'tinta',
    name: 'Bomba de Tinta',
    kind: 'attack',
    short: 'Esconde as letras do alvo.',
    description: 'Uma mancha cobre as letras do alvo para toda a sala por 6 segundos.',
    color: '#9B7BFF',
    glyph: '✸',
  },
  escudo: {
    id: 'escudo',
    name: 'Escudo',
    kind: 'self',
    short: 'Bloqueia o próximo ataque.',
    description: 'Barreira de 15 segundos que anula o próximo ataque recebido.',
    color: '#3DDC97',
    glyph: '⬢',
  },
  bencao: {
    id: 'bencao',
    name: 'Bênção',
    kind: 'self',
    short: 'Remove um erro seu.',
    description: 'Apaga um segmento do seu boneco. Se estava eliminado, volta com 5 erros.',
    color: '#3DDC97',
    glyph: '✦',
  },
  sobrecarga: {
    id: 'sobrecarga',
    name: 'Sobrecarga',
    kind: 'self',
    short: 'Próximo acerto vale 3×.',
    description: 'Seu próximo acerto de letra vale o triplo de pontos.',
    color: '#FFC857',
    glyph: '⚡',
  },
  sanguessuga: {
    id: 'sanguessuga',
    name: 'Sanguessuga',
    kind: 'attack',
    short: 'Rouba 20 pontos do alvo.',
    description: 'Transfere 20 pontos do placar do alvo para o seu.',
    color: '#FF6B6B',
    glyph: '❥',
  },
  roubo: {
    id: 'roubo',
    name: 'Roubo de Carga',
    kind: 'attack',
    short: 'Rouba um power-up do alvo.',
    description: 'Rouba uma carga aleatória do adversário e adiciona ao seu inventário.',
    color: '#FF7AD9',
    glyph: '✋',
  },
  trovao: {
    id: 'trovao',
    name: 'Trovão',
    kind: 'attack',
    short: 'Força um erro no alvo.',
    description: 'Um raio marca um segmento do boneco do adversário. Pode eliminar.',
    color: '#FFC857',
    glyph: '⚡',
  },
  chuva: {
    id: 'chuva',
    name: 'Chuva de Letras',
    kind: 'global',
    short: 'Revela uma letra para todos.',
    description: 'Revela uma letra aleatória para cada jogador ativo — inclusive os adversários.',
    color: '#55D6FF',
    glyph: '☂',
  },
});

export const POWERUP_IDS = Object.freeze(Object.keys(POWERUPS));
export const ATTACK_IDS = Object.freeze(
  POWERUP_IDS.filter((id) => POWERUPS[id].kind === 'attack'),
);

export function isAttack(id) {
  return ATTACK_IDS.includes(id);
}
