/** Helpers de DOM. Tudo que vem do servidor entra como textContent. */

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        if (dataValue !== undefined && dataValue !== null) {
          node.dataset[dataKey] = String(dataValue);
        }
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * Desenha a forca com 6 partes. `reveal` = quantidade de erros (0..6).
 */
export function gallows(reveal, { className = 'gallows-svg', dead = false } = {}) {
  const svg = svgNode('svg', {
    viewBox: '0 0 200 220',
    class: className,
    role: 'img',
    'aria-label': `Forca com ${reveal} de 6 partes`,
  });

  const frame = [
    ['line', { x1: 30, y1: 205, x2: 170, y2: 205 }],
    ['line', { x1: 60, y1: 205, x2: 60, y2: 25 }],
    ['line', { x1: 58, y1: 25, x2: 135, y2: 25 }],
    ['line', { x1: 135, y1: 25, x2: 135, y2: 50 }],
  ];
  for (const [tag, attrs] of frame) {
    svg.append(svgNode(tag, { ...attrs, class: 'gallows-frame' }));
  }

  const parts = [
    ['circle', { cx: 135, cy: 68, r: 18 }],
    ['line', { x1: 135, y1: 86, x2: 135, y2: 140 }],
    ['line', { x1: 135, y1: 100, x2: 108, y2: 122 }],
    ['line', { x1: 135, y1: 100, x2: 162, y2: 122 }],
    ['line', { x1: 135, y1: 140, x2: 112, y2: 178 }],
    ['line', { x1: 135, y1: 140, x2: 158, y2: 178 }],
  ];

  parts.forEach(([tag, attrs], index) => {
    const node = svgNode(tag, {
      ...attrs,
      class: `gallows-part${index >= reveal ? ' hidden-part' : ''}${dead ? ' dead' : ''}`,
    });
    svg.append(node);
  });

  return svg;
}

export function maskSlots(mask, { totalLetters = 0, hidden = false, className = 'word-mask' } = {}) {
  const wrap = el('div', { class: className });
  const length = mask?.length || totalLetters;
  for (let index = 0; index < length; index += 1) {
    const letter = hidden ? null : mask?.[index] ?? null;
    wrap.append(
      el(
        'span',
        {
          class: `letter-slot ${letter ? 'revealed' : 'empty'}`,
          'aria-label': letter ? `Letra ${letter}` : 'Letra oculta',
        },
        letter ?? '·',
      ),
    );
  }
  return wrap;
}

export function compactMask(mask, { totalLetters = 0, hidden = false } = {}) {
  const wrap = el('div', { class: 'pano-mask' });
  const length = mask?.length || totalLetters;
  for (let index = 0; index < length; index += 1) {
    const letter = hidden ? null : mask?.[index] ?? null;
    wrap.append(el('span', { class: `pano-letter${letter ? ' on' : ''}` }, letter ?? ''));
  }
  return wrap;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `${seconds}s`;
}

export function plural(value, singular, pluralForm) {
  return value === 1 ? singular : pluralForm;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
