import * as THREE from 'three';
import { ANATOMY_PARTS, ANATOMY_UI, type AnatomyPartId } from '../content/anatomy';
import { SOURCES, sourceName } from '../content/sources';
import { shown } from '../content/text';
import { ANCHORS } from './anchors';
import { anatomyIcon, type AnatomyIcon } from './icons';
import type { AnatomyWorm } from './model';

/**
 * Atlas-style labels: a name on a card, a thin leader line and a dot on the part. Tapping a label
 * selects the part (`onPick`); the selected part's card holds its one sourced fact, a link to the
 * source (new tab) and actions. Labels are real buttons, so they work with a keyboard and a screen
 * reader as well as a mouse or a finger.
 */
/** A card button: a short word and an icon on screen, the full action for screen readers. */
export interface CardAction { text: string; label: string; icon: AnatomyIcon; run: () => void }

export class LabelLayer {
  readonly root = document.createElement('div');
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly card = document.createElement('div');
  private readonly items = new Map<AnatomyPartId, { button: HTMLButtonElement; line: SVGLineElement; dot: SVGCircleElement; base: THREE.Vector3 }>();
  private shown: readonly AnatomyPartId[] = [];
  private readonly p = new THREE.Vector3();
  enabled = true;
  /** The selected part: its label always shows (while its system does) and is marked. */
  selected: AnatomyPartId | null = null;
  /** Where the selected part's leader points, if not its usual place (a tapped point). */
  selectedAt: THREE.Vector3 | null = null;

  constructor(private readonly worm: AnatomyWorm, private readonly camera: THREE.Camera, private readonly onPick: (id: AnatomyPartId) => void) {
    this.root.className = 'anatomy-labels';
    this.svg.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.svg);
    for (const id of Object.keys(ANATOMY_PARTS) as AnatomyPartId[]) {
      const part = ANATOMY_PARTS[id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'anatomy-label';
      button.innerHTML = `<span class="anatomy-label-name"></span>${part.science ? '<span class="anatomy-label-sci"></span>' : ''}`;
      button.querySelector('.anatomy-label-name')!.textContent = shown(part.name);
      const sci = button.querySelector('.anatomy-label-sci');
      if (sci) sci.textContent = part.science;
      button.addEventListener('click', () => this.onPick(id));
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '4');
      this.svg.append(line, dot);
      this.root.appendChild(button);
      this.items.set(id, { button, line, dot, base: ANCHORS[id].at() });
    }
    this.card.className = 'anatomy-card';
    this.card.hidden = true;
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.card);
  }

  /** The parts this view labels; only those whose system is showing are drawn. */
  set(ids: readonly AnatomyPartId[]): void {
    this.shown = ids;
  }

  /** Re-places every label for the current camera (call after each frame that moved). */
  update(width: number, height: number, left = 0): void {
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const visible: { id: AnatomyPartId; x: number; y: number }[] = [];
    for (const [id, it] of this.items) {
      const part = ANATOMY_PARTS[id];
      const sel = this.selected === id;
      it.button.setAttribute('aria-current', String(sel));
      let on = ((this.enabled && this.shown.includes(id)) || sel) && this.worm.isOn(part.system);
      if (on && !sel && ANCHORS[id].inside && this.worm.wall === 'solid' && part.system !== 'muscles') on = false;
      if (on) {
        if (sel && this.selectedAt) this.p.copy(this.selectedAt);
        else this.worm.poseMap.point(it.base, this.p);
        this.p.project(this.camera);
        on = this.p.z < 1 && Math.abs(this.p.x) < 0.97 && Math.abs(this.p.y) < 0.95 && (this.p.x + 1) * 0.5 * width > left + 40;
      }
      it.button.hidden = !on;
      it.line.style.display = on ? '' : 'none';
      it.dot.style.display = on ? '' : 'none';
      if (on) visible.push({ id, x: (this.p.x + 1) * 0.5 * width, y: (1 - this.p.y) * 0.5 * height });
    }
    // A label goes above the body for a part in its upper half and below for one in its lower half,
    // so leader lines never cross the body to reach it. Neighbours on the same side that would
    // overlap step further out instead.
    visible.sort((a, b) => a.x - b.x);
    const midY = visible.reduce((s, v) => s + v.y, 0) / Math.max(1, visible.length);
    const lastRight = { up: [] as number[], down: [] as number[] };
    visible.forEach((v, i) => {
      const it = this.items.get(v.id)!;
      const up = Math.abs(v.y - midY) < 6 ? i % 2 === 0 : v.y < midY;
      const w = it.button.offsetWidth;
      const h = it.button.offsetHeight;
      const lx = Math.max(left + 8, Math.min(width - w - 8, v.x - w / 2));
      const rows = lastRight[up ? 'up' : 'down'];
      let row = 0;
      while (row < rows.length && rows[row] > lx - 12) row++;
      rows[row] = lx + w;
      const reach = Math.min(150, height * 0.17) + row * (h + 10);
      const ly = Math.max(8, Math.min(height - h - 8, up ? v.y - reach - h : v.y + reach));
      it.button.style.transform = `translate(${lx}px, ${ly}px)`;
      it.line.setAttribute('x1', String(v.x));
      it.line.setAttribute('y1', String(v.y));
      it.line.setAttribute('x2', String(Math.max(lx + 12, Math.min(lx + w - 12, v.x))));
      it.line.setAttribute('y2', String(up ? ly + h : ly));
      it.dot.setAttribute('cx', String(v.x));
      it.dot.setAttribute('cy', String(v.y));
    });
  }

  close(): void {
    this.card.hidden = true;
  }

  /** Opens the part's card, with buttons for `actions` (hide, fade, only this). */
  open(id: AnatomyPartId, actions: readonly CardAction[], onClose: () => void, system?: { icon: AnatomyIcon; name: string }): void {
    const part = ANATOMY_PARTS[id];
    const src = SOURCES[part.fact.source];
    this.card.innerHTML = '<h2></h2><p class="anatomy-card-sci"></p><p class="anatomy-card-fact"></p><p class="anatomy-card-src"><span></span> <a target="_blank" rel="noopener noreferrer"></a></p><div class="anatomy-row anatomy-card-acts"></div>';
    this.card.querySelector('h2')!.textContent = shown(part.name);
    this.card.querySelector('.anatomy-card-sci')!.textContent = part.science;
    this.card.querySelector('.anatomy-card-fact')!.textContent = shown(part.fact);
    this.card.querySelector('.anatomy-card-src span')!.textContent = shown(ANATOMY_UI.source);
    const a = this.card.querySelector('a')!;
    a.href = src.url;
    a.textContent = sourceName(part.fact.source);
    const row = this.card.querySelector('.anatomy-card-acts')!;
    if (system) {
      // Which body system the buttons act on, as a small tag.
      const tag = document.createElement('span');
      tag.className = 'anatomy-card-system';
      tag.append(anatomyIcon(system.icon), system.name);
      row.before(tag);
    }
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'anatomy-btn';
      b.setAttribute('aria-label', a.label);
      b.append(anatomyIcon(a.icon), a.text);
      b.addEventListener('click', a.run);
      row.appendChild(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'anatomy-card-close';
    close.setAttribute('aria-label', shown(ANATOMY_UI.close));
    close.append(anatomyIcon('close'));
    close.addEventListener('click', () => {
      this.card.hidden = true;
      onClose();
      this.items.get(id)?.button.focus();
    });
    this.card.prepend(close);
    this.card.hidden = false;
  }
}
