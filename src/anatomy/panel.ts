import { ANATOMY_PARTS, ANATOMY_UI, type AnatomyPartId } from '../content/anatomy';
import { shown, type Line } from '../content/text';
import { SYSTEMS, type AnatomyWorm, type SystemId, type WallMode } from './model';
import { VIEWS, type View } from './views';
import { anatomyIcon, type AnatomyIcon } from './icons';
import { icon } from '../ui/icons';

export const SYSTEM_NAMES: Record<SystemId, Line> = {
  skin: ANATOMY_UI.sysSkin,
  muscles: ANATOMY_UI.sysMuscles,
  gut: ANATOMY_UI.sysGut,
  blood: ANATOMY_UI.sysBlood,
  nerves: ANATOMY_UI.sysNerves,
  repro: ANATOMY_UI.sysRepro,
  nephridia: ANATOMY_UI.sysNephridia,
};
export const SYSTEM_ICONS: Record<SystemId, AnatomyIcon> = {
  skin: 'worm', muscles: 'muscles', gut: 'gut', blood: 'blood', nerves: 'nerves', repro: 'repro', nephridia: 'nephridia',
};
/** The views in the menu, each with its icon (the see-through view is the Body wall's job here). */
const VIEW_ICONS: Record<string, AnatomyIcon> = {
  outside: 'worm', head: 'head', saddle: 'saddle', tail: 'tail', belly: 'belly', inside: 'inside',
  gut: 'gut', blood: 'blood', nerves: 'nerves', repro: 'repro', muscles: 'muscles', nephridia: 'nephridia',
  bristles: 'bristles', crawl: 'crawl',
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
 * The viewer's side panel, laid out like a medical atlas in three tabs: Views (picture tiles for
 * the preset views, the body wall, labels), Layers (a peel-away slider, then one slider per body
 * system; tapping its name switches it on or off) and Parts (a search box over every part).
 * Every button has an icon and a word. Real buttons, sliders and a search field: on/off is a
 * tick or a circle, never colour alone. `sync` refreshes every
 * control after a change made elsewhere (a card's Hide, a view).
 */
export function buildPanel(worm: AnatomyWorm, hooks: PanelHooks): { el: HTMLElement; sync: () => void } {
  const panel = document.createElement('nav');
  panel.className = 'anatomy-panel';
  panel.setAttribute('aria-label', shown(ANATOMY_UI.title));
  const head = el('div', 'anatomy-panel-head');
  const title = el('h1', 'anatomy-title');
  title.append(icon('virtualWorm', 'anatomy-icon'), shown(ANATOMY_UI.title));
  const fold = button(shown(ANATOMY_UI.hidePanel), 'anatomy-btn anatomy-fold', 'fold');
  // Back to the game: the same page without ?anatomy (it may have opened in this tab on a phone).
  const home = el('a', 'anatomy-home');
  home.href = location.pathname;
  home.setAttribute('aria-label', shown(ANATOMY_UI.toGame));
  home.title = shown(ANATOMY_UI.toGame);
  home.append(icon('home', 'anatomy-icon'));
  const right = el('div', 'anatomy-head-btns');
  right.append(home, fold);
  head.append(title, right);
  const body = el('div', 'anatomy-panel-body');
  panel.append(head, body);
  fold.setAttribute('aria-expanded', 'true');
  fold.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    fold.lastChild!.textContent = shown(open ? ANATOMY_UI.hidePanel : ANATOMY_UI.showPanel);
    fold.classList.toggle('anatomy-fold-closed', !open);
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
  const TABS = [[ANATOMY_UI.tabViews, 'views'], [ANATOMY_UI.tabLayers, 'layers'], [ANATOMY_UI.tabParts, 'parts']] as const;
  for (const [i, [line, ic]] of TABS.entries()) {
    const t = button(shown(line), 'anatomy-tab', ic);
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
  const sliders: { r: HTMLInputElement; s: SystemId }[] = [];
  let peelLayers: SystemId[] = [];
  const peel = document.createElement('input');
  const reset = button(shown(ANATOMY_UI.reset), 'anatomy-btn anatomy-reset', 'reset');
  const sync = () => {
    for (const t of toggles) t.b.setAttribute('aria-pressed', String(t.on()));
    for (const { r, s } of sliders) r.value = String(Math.round(worm.fade(s) * 100));
    // The peel slider starts from what is showing now.
    peelLayers = PEEL.filter((s) => worm.isOn(s));
    peel.value = '0';
    peel.max = String(Math.max(1, peelLayers.length) * 100);
    reset.hidden = SYSTEMS.every((s) => worm.fade(s) === 1);
    hooks.changed();
  };

  // Views tab.
  const views = group(pages[0], '');
  views.classList.add('anatomy-tiles');
  for (const v of VIEWS) {
    const ic = VIEW_ICONS[v.id];
    if (!ic) continue;
    const b = button(shown(v.name), 'anatomy-tile', ic);
    b.addEventListener('click', () => { hooks.pick(v); sync(); });
    views.appendChild(b);
  }
  const wall = group(pages[0], shown(ANATOMY_UI.wall));
  wall.classList.add('anatomy-tiles');
  for (const w of WALLS) {
    const b = button(shown(ANATOMY_UI[w]), 'anatomy-tile anatomy-tile-small anatomy-toggle', w);
    b.addEventListener('click', () => { worm.setWall(w); sync(); });
    toggles.push({ b, on: () => worm.wall === w });
    wall.appendChild(b);
  }
  const lab = button(shown(ANATOMY_UI.labels), 'anatomy-btn anatomy-toggle', 'labels');
  lab.addEventListener('click', () => { hooks.labels.enabled = !hooks.labels.enabled; sync(); });
  toggles.push({ b: lab, on: () => hooks.labels.enabled });
  group(pages[0], '').appendChild(lab);

  // Layers tab: one slider peels skin, then muscles, then the food tube away.
  const peelRow = el('label', 'anatomy-slider anatomy-peel');
  const peelName = el('span', 'anatomy-slider-name');
  peelName.append(anatomyIcon('peel'), shown(ANATOMY_UI.peel));
  peelRow.append(peelName, peel);
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
    const b = button(shown(SYSTEM_NAMES[s]), 'anatomy-layer-name anatomy-toggle', SYSTEM_ICONS[s]);
    b.addEventListener('click', () => { worm.setSystem(s, !worm.isOn(s)); sync(); });
    toggles.push({ b, on: () => worm.isOn(s) });
    const r = document.createElement('input');
    r.type = 'range';
    r.min = '0';
    r.max = '100';
    r.step = '5';
    r.setAttribute('aria-label', `${shown(SYSTEM_NAMES[s])}, ${shown(ANATOMY_UI.howSolid)}`);
    r.addEventListener('input', () => { worm.setFade(s, Number(r.value) / 100); sync(); });
    sliders.push({ r, s });
    row.append(b, r);
    pages[1].appendChild(row);
  }
  reset.addEventListener('click', () => { hooks.reset(); sync(); });
  pages[1].appendChild(reset);

  // Parts tab: search, then every part under its system.
  const find = el('label', 'anatomy-find');
  const q = document.createElement('input');
  q.type = 'search';
  const findName = el('span', 'anatomy-slider-name');
  findName.append(anatomyIcon('parts'), shown(ANATOMY_UI.find));
  find.append(findName, q);
  pages[2].appendChild(find);
  const items: { b: HTMLButtonElement; text: string; box: HTMLDetailsElement }[] = [];
  for (const s of SYSTEMS) {
    const box = document.createElement('details');
    box.className = 'anatomy-tree';
    box.open = true;
    const sum = el('summary');
    sum.append(anatomyIcon(SYSTEM_ICONS[s]), shown(SYSTEM_NAMES[s]));
    box.appendChild(sum);
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

  show(0);
  // Every switch and slider starts from the model as it is.
  sync();
  return { el: panel, sync };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A button with an icon and its word (the word in its own span, so it can change). */
function button(text: string, cls: string, ic?: AnatomyIcon): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  if (ic) b.appendChild(anatomyIcon(ic));
  b.appendChild(el('span', 'anatomy-word', text));
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
