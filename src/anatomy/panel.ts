import { ANATOMY_UI } from '../content/anatomy';
import { shown, type Line } from '../content/text';
import { SYSTEMS, type AnatomyWorm, type SystemId, type WallMode } from './model';
import { VIEWS, type View } from './views';

const SYSTEM_NAMES: Record<SystemId, Line> = {
  skin: ANATOMY_UI.sysSkin,
  muscles: ANATOMY_UI.sysMuscles,
  gut: ANATOMY_UI.sysGut,
  blood: ANATOMY_UI.sysBlood,
  nerves: ANATOMY_UI.sysNerves,
  repro: ANATOMY_UI.sysRepro,
  nephridia: ANATOMY_UI.sysNephridia,
};
const WALLS: readonly WallMode[] = ['solid', 'cut', 'ghost'];

/**
 * The viewer's buttons: preset views, a switch per body system, and how the wall is shown. Real
 * buttons with aria-pressed and a tick (on/off never shown by colour alone). Calls `changed`
 * after every change so the viewer redraws.
 */
export function buildPanel(worm: AnatomyWorm, pick: (v: View) => void, changed: () => void, labels: { enabled: boolean }): HTMLElement {
  const panel = document.createElement('nav');
  panel.className = 'anatomy-panel';
  panel.setAttribute('aria-label', shown(ANATOMY_UI.title));
  const head = document.createElement('div');
  head.className = 'anatomy-panel-head';
  const title = document.createElement('h1');
  title.textContent = shown(ANATOMY_UI.title);
  const fold = button(shown(ANATOMY_UI.hidePanel), 'anatomy-btn anatomy-fold');
  head.append(title, fold);
  const body = document.createElement('div');
  body.className = 'anatomy-panel-body';
  panel.append(head, body);
  fold.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    fold.textContent = shown(open ? ANATOMY_UI.hidePanel : ANATOMY_UI.showPanel);
    fold.setAttribute('aria-expanded', String(open));
  });
  fold.setAttribute('aria-expanded', 'true');

  const toggles: { b: HTMLButtonElement; on: () => boolean }[] = [];
  const sync = () => {
    for (const t of toggles) t.b.setAttribute('aria-pressed', String(t.on()));
    changed();
  };

  const views = group(body, shown(ANATOMY_UI.views));
  for (const v of VIEWS) {
    const b = button(shown(v.name), 'anatomy-btn');
    b.addEventListener('click', () => {
      pick(v);
      sync();
    });
    views.appendChild(b);
  }
  const systems = group(body, shown(ANATOMY_UI.systems));
  for (const s of SYSTEMS) {
    const b = button(shown(SYSTEM_NAMES[s]), 'anatomy-btn anatomy-toggle');
    b.addEventListener('click', () => {
      worm.setSystem(s, !worm.isOn(s));
      sync();
    });
    toggles.push({ b, on: () => worm.isOn(s) });
    systems.appendChild(b);
  }
  const wall = group(body, shown(ANATOMY_UI.wall));
  for (const w of WALLS) {
    const b = button(shown(ANATOMY_UI[w]), 'anatomy-btn anatomy-toggle');
    b.addEventListener('click', () => {
      worm.setWall(w);
      sync();
    });
    toggles.push({ b, on: () => worm.wall === w });
    wall.appendChild(b);
  }
  const lab = button(shown(ANATOMY_UI.labels), 'anatomy-btn anatomy-toggle');
  lab.addEventListener('click', () => {
    labels.enabled = !labels.enabled;
    sync();
  });
  toggles.push({ b: lab, on: () => labels.enabled });
  group(body, '').appendChild(lab);
  const hint = document.createElement('p');
  hint.className = 'anatomy-hint';
  hint.textContent = shown(ANATOMY_UI.hint);
  body.appendChild(hint);
  for (const t of toggles) t.b.setAttribute('aria-pressed', String(t.on()));
  return panel;
}

function button(text: string, cls: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  return b;
}

function group(parent: HTMLElement, heading: string): HTMLElement {
  const g = document.createElement('section');
  g.className = 'anatomy-group';
  if (heading) {
    const h = document.createElement('h2');
    h.textContent = heading;
    g.appendChild(h);
  }
  const row = document.createElement('div');
  row.className = 'anatomy-row';
  g.appendChild(row);
  parent.appendChild(g);
  return row;
}
