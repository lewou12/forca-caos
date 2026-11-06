/** Efeitos sonoros sintetizados (sem arquivos externos, sem autoplay). */

let context = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = Boolean(value);
}

export function isSoundEnabled() {
  return enabled;
}

function audio() {
  if (!enabled) return null;
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

function tone(frequency, duration, { type = 'sine', gain = 0.06, delay = 0 } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume);
  volume.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function sfx(kind) {
  switch (kind) {
    case 'correct':
      tone(660, 0.12, { type: 'triangle', gain: 0.05 });
      tone(880, 0.14, { type: 'triangle', gain: 0.04, delay: 0.07 });
      break;
    case 'wrong':
      tone(180, 0.22, { type: 'sawtooth', gain: 0.05 });
      break;
    case 'power':
      tone(520, 0.1, { type: 'square', gain: 0.035 });
      tone(780, 0.16, { type: 'square', gain: 0.03, delay: 0.06 });
      break;
    case 'attack':
      tone(300, 0.16, { type: 'sawtooth', gain: 0.045 });
      tone(150, 0.22, { type: 'sawtooth', gain: 0.04, delay: 0.08 });
      break;
    case 'round':
      tone(440, 0.12, { type: 'sine', gain: 0.04 });
      tone(554, 0.12, { type: 'sine', gain: 0.04, delay: 0.12 });
      tone(659, 0.2, { type: 'sine', gain: 0.045, delay: 0.24 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((frequency, index) => {
        tone(frequency, 0.22, { type: 'triangle', gain: 0.05, delay: index * 0.12 });
      });
      break;
    default:
      break;
  }
}
