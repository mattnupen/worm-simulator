import { icon, type IconName } from './icons';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, text = '', className = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

export interface Button { el: HTMLButtonElement; setLabel(text: string): void }

/** A button with a decorative icon. The accessible name is exactly `label`. */
export function button(
  label: string, iconName: IconName, variant: 'primary' | 'secondary', onClick: () => void,
): Button {
  const b = el('button', '', `btn btn-${variant}`);
  b.type = 'button';
  const text = el('span', label, 'btn-label');
  b.append(icon(iconName, 'btn-icon'), text);
  b.addEventListener('click', onClick);
  return { el: b, setLabel: (t) => { text.textContent = t; } };
}

export function leafList(items: string[]): HTMLUListElement {
  const ul = el('ul', '', 'leaf-list');
  for (const t of items) ul.appendChild(el('li', t));
  return ul;
}

/** The title-card heading: leaf seal, game title and a small eyebrow line. */
export function cardHead(eyebrow: string): HTMLDivElement {
  const titles = el('div', '', 'titles');
  titles.append(el('h1', 'Worm Simulator', 'title'), el('p', eyebrow, 'eyebrow'));
  const head = el('div', '', 'card-head');
  head.append(icon('leaf', 'seal'), titles);
  return head;
}

/** A vertical stack of menu buttons. */
export function menu(...buttons: Button[]): HTMLDivElement {
  const m = el('div', '', 'menu');
  m.append(...buttons.map((b) => b.el));
  return m;
}
