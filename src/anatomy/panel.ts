import { ANATOMY_PARTS, ANATOMY_UI, type AnatomyPartId } from '../content/anatomy';
import { shown, type Line } from '../content/text';
import { SYSTEMS, type AnatomyWorm, type SystemId, type WallMode } from './model';
import { VIEWS, type View } from './views';

export const SYSTEM_NAMES: Record<SystemId, Line> = {
  skin: ANATOMY_UI.sysSkin,
  muscles: ANATOMY_UI.sysMuscles,
  gut: ANATOMY_UI.sysGut,
  blood: ANATOMY_UI.sysBlood,
  nerves: ANATOMY_UI.sysNerves,
  repro: ANATOMY_UI.sysRepro,
  nephridia: ANATOMY_UI.sysNephridia,
};
const WALLS: readonly WallMode[] = ['solid', 'cut', 'ghost'];
/** The peel slider takes these off in turn, outside in. */
const PEEL: readonly SystemId[] = ['skin', 'muscles', 'gut'];

export interface PanelHooks {
  pick: (v: View) => void;
  select: (id: AnatomyPartId) => void;
  reset: () => void;
  changed: () => void;
  labels: { enabled: boolean };
}

/**
 * The viewer's side panel, laid out like a medical atlas in three tabs: Views (preset views, the
 * body wall, labels), Layers (a peel-away slider, then a switch and a how-solid slider for each
 * body system) and Parts (a search box over every part, grouped by system). Real buttons, sliders
 * and a search field: on/off is a tick or a circle, never colour alone. `sync` refreshes every
 * control after a change made elsewhere (a card's Hide, a view).
 */
export function buildPanel(worm: AnatomyWorm, hooks: PanelHooks): { el: HTMLElement; sync: () => void } {
  const panel = document.createElement('nav');
  panel.className = 'anatomy-panel';
  panel.setAttribute('aria-label', shown(ANATOMY_UI.title));
  const head = el('div', 'anatomy-panel-head');
  const title = el('h1', '', shown(ANATOMY_UI.title));
  const fold = button(shown(ANATOMY_UI.hidePanel), 'anatomy-btn anatomy-fold');
  head.append(title, fold);
  const body = el('div', 'anatomy-panel-body');
  panel.append(head, body);
  fold.setAttribute('aria-expanded', 'true');
  fold.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    fold.textContent = shown(open ? ANATOMY_UI.hidePanel : ANATOMY_UI.showPanel);
    fold.setAttribute('aria-expanded', String(open));
  });

  // Tabs.
  const tabs = el('div', 'anatomy-tabs');
  tabs.setAttribute('role', 'tablist');
  body.appendChild(tabs);
  const pages: HTMLElement[] = [];
  const tabButtons: HTMLButtonElement[] = [];
  const show = (i: number) => pages.forEach((p, k) => {
    p.hidden = k !== i;
    tabButtons[k].setAttribute('aria-selected', String(k === i));
    tabButtons[k].tabIndex = k === i ? 0 : -1;
  });
  for (const [i, line] of [ANATOMY_UI.tabViews, ANATOMY_UI.tabLayers, ANATOMY_UI.tabParts].entries()) {
    const t = button(shown(line), 'anatomy-tab');
    t.setAttribute('role', 'tab');
    t.id = `anatomy-tab-${i}`;
    t.addEventListener('click', () => show(i));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const k = (i + d + 3) % 3;
      show(k);
      tabButtons[k].focus();
    });
    tabs.appendChild(t);
    tabButtons.push(t);
    const page = el('div', 'anatomy-page');
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', t.id);
    body.appendChild(page);
    pages.push(page);
  }

  const toggles: { b: HTMLButtonElement; on: () => boolean }[] = [];
  const sliders: { r: HTMLInputElement; out: HTMLElement; s: SystemId }[] = [];
  let peelLayers: SystemId[] = [];
  const peel = document.createElement('input');
  const reset = button(shown(ANATOMY_UI.reset), 'anatomy-btn anatomy-reset');
  const sync = () => {
    for (const t of toggles) t.b.setAttribute('aria-pressed', String(t.on()));
    for (const { r, out, s } of sliders) {
      const v = Math.round(worm.fade(s) * 100);
      r.value = String(v);
      out.textContent = `${v}%`;
    }
    // The peel slider starts from what is showing now.
    peelLayers = PEEL.filter((s) => worm.isOn(s));
    peel.value = '0';
    peel.max = String(Math.max(1, peelLayers.length) * 100);
    reset.hidden = SYSTEMS.every((s) => worm.fade(s) === 1);
    hooks.changed();
  };

  // Views tab.
  const views = group(pages[0], '');
  for (const v of VIEWS) {
    const b = button(shown(v.name), 'anatomy-btn');
    b.addEventListener('click', () => { hooks.pick(v); sync(); });
    views.appendChild(b);
  }
  const wall = group(pages[0], shown(ANATOMY_UI.wall));
  for (const w of WALLS) {
    const b = button(shown(ANATOMY_UI[w]), 'anatomy-btn anatomy-toggle');
    b.addEventListener('click', () => { worm.setWall(w); sync(); });
    toggles.push({ b, on: () => worm.wall === w });
    wall.appendChild(b);
  }
  const lab = button(shown(ANATOMY_UI.labels), 'anatomy-btn anatomy-toggle');
  lab.addEventListener('click', () => { hooks.labels.enabled = !hooks.labels.enabled; sync(); });
  toggles.push({ b: lab, on: () => hooks.labels.enabled });
  group(pages[0], '').appendChild(lab);

  // Layers tab: one slider peels skin, then muscles, then the food tube away.
  const peelRow = el('label', 'anatomy-slider anatomy-peel');
  peelRow.append(el('span', 'anatomy-slider-name', shown(ANATOMY_UI.peel)), peel);
  peel.type = 'range';
  peel.min = '0';
  peel.step = '5';
  peel.addEventListener('input', () => {
    const v = Number(peel.value) / 100;
    peelLayers.forEach((s, i) => worm.setFade(s, 1 - Math.min(1, Math.max(0, v - i))));
    const keep = peelLayers;
    sync();
    peelLayers = keep;
    peel.value = String(v * 100);
    peel.max = String(Math.max(1, keep.length) * 100);
  });
  pages[1].appendChild(peelRow);
  for (const s of SYSTEMS) {
    const row = el('div', 'anatomy-layer');
    const b = button(shown(SYSTEM_NAMES[s]), 'anatomy-btn anatomy-toggle');
    b.addEventListener('click', () => { worm.setSystem(s, !worm.isOn(s)); sync(); });
    toggles.push({ b, on: () => worm.isOn(s) });
    const r = document.createElement('input');
    r.type = 'range';
    r.min = '0';
    r.max = '100';
    r.step = '5';
    r.setAttribute('aria-label', `${shown(SYSTEM_NAMES[s])}, ${shown(ANATOMY_UI.howSolid)}`);
    const out = el('output', 'anatomy-slider-value');
    r.addEventListener('input', () => { worm.setFade(s, Number(r.value) / 100); sync(); });
    sliders.push({ r, out, s });
    row.append(b, r, out);
    pages[1].appendChild(row);
  }
  reset.addEventListener('click', () => { hooks.reset(); sync(); });
  pages[1].appendChild(reset);

  // Parts tab: search, then every part under its system.
  const find = el('label', 'anatomy-find');
  const q = document.createElement('input');
  q.type = 'search';
  find.append(el('span', 'anatomy-slider-name', shown(ANATOMY_UI.find)), q);
  pages[2].appendChild(find);
  const items: { b: HTMLButtonElement; text: string; box: HTMLDetailsElement }[] = [];
  for (const s of SYSTEMS) {
    const box = document.createElement('details');
    box.className = 'anatomy-tree';
    box.open = true;
    box.appendChild(el('summary', '', shown(SYSTEM_NAMES[s])));
    const list = el('div', 'anatomy-row');
    box.appendChild(list);
    for (const [id, p] of Object.entries(ANATOMY_PARTS) as [AnatomyPartId, (typeof ANATOMY_PARTS)[AnatomyPartId]][]) {
      if (p.system !== s) continue;
      const b = button(shown(p.name), 'anatomy-btn');
      b.addEventListener('click', () => hooks.select(id));
      items.push({ b, text: `${shown(p.name)} ${p.science}`.toLowerCase(), box });
      list.appendChild(b);
    }
    pages[2].appendChild(box);
  }
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    for (const it of items) it.b.hidden = !!t && !it.text.includes(t);
    for (const box of new Set(items.map((i) => i.box))) box.hidden = items.every((i) => i.box !== box || i.b.hidden);
  });

  const hint = el('p', 'anatomy-hint', shown(ANATOMY_UI.hint));
  body.appendChild(hint);
  show(0);
  for (const t of toggles) t.b.setAttribute('aria-pressed', String(t.on()));
  return { el: panel, sync };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, cls: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function group(parent: HTMLElement, heading: string): HTMLElement {
  const g = el('section', 'anatomy-group');
  if (heading) g.appendChild(el('h2', '', heading));
  const row = el('div', 'anatomy-row');
  g.appendChild(row);
  parent.appendChild(g);
  return row;
}
