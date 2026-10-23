import * as THREE from 'three';
import { ANATOMY_PARTS, ANATOMY_UI, type AnatomyPartId } from '../content/anatomy';
import { SOURCES, sourceName } from '../content/sources';
import { shown } from '../content/text';
import { ANCHORS } from './anchors';
import type { AnatomyWorm } from './model';

/**
 * Atlas-style labels: a name on a card, a thin leader line and a dot on the part. Tapping a label
 * opens a card with its one sourced fact and a link to the source (new tab). Labels are real
 * buttons, so they work with a keyboard and a screen reader as well as a mouse or a finger.
 */
export class LabelLayer {
  readonly root = document.createElement('div');
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly card = document.createElement('div');
  private readonly items = new Map<AnatomyPartId, { button: HTMLButtonElement; line: SVGLineElement; dot: SVGCircleElement; base: THREE.Vector3 }>();
  private shown: readonly AnatomyPartId[] = [];
  private readonly p = new THREE.Vector3();
  enabled = true;

  constructor(private readonly worm: AnatomyWorm, private readonly camera: THREE.Camera) {
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
      button.addEventListener('click', () => this.open(id));
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
    this.card.hidden = true;
  }

  /** Re-places every label for the current camera (call after each frame that moved). */
  update(width: number, height: number, left = 0): void {
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const visible: { id: AnatomyPartId; x: number; y: number }[] = [];
    for (const [id, it] of this.items) {
      const part = ANATOMY_PARTS[id];
      let on = this.enabled && this.shown.includes(id) && this.worm.isOn(part.system);
      if (on && ANCHORS[id].inside && this.worm.wall === 'solid' && part.system !== 'muscles') on = false;
      if (on) {
        this.worm.poseMap.point(it.base, this.p).project(this.camera);
        on = this.p.z < 1 && Math.abs(this.p.x) < 0.97 && Math.abs(this.p.y) < 0.95 && (this.p.x + 1) * 0.5 * width > left + 40;
      }
      it.button.hidden = !on;
      it.line.style.display = on ? '' : 'none';
      it.dot.style.display = on ? '' : 'none';
      if (on) visible.push({ id, x: (this.p.x + 1) * 0.5 * width, y: (1 - this.p.y) * 0.5 * height });
    }
    // Alternate above and below the body, left to right, so neighbours never overlap.
    visible.sort((a, b) => a.x - b.x);
    visible.forEach((v, i) => {
      const it = this.items.get(v.id)!;
      const up = i % 2 === 0;
      const reach = Math.min(170, height * 0.2) + (i % 4 >= 2 ? 44 : 0);
      const w = it.button.offsetWidth;
      const h = it.button.offsetHeight;
      const lx = Math.max(left + 8, Math.min(width - w - 8, v.x - w / 2));
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

  private open(id: AnatomyPartId): void {
    const part = ANATOMY_PARTS[id];
    const src = SOURCES[part.fact.source];
    this.card.innerHTML = '<h2></h2><p class="anatomy-card-sci"></p><p class="anatomy-card-fact"></p><p class="anatomy-card-src"><span></span> <a target="_blank" rel="noopener noreferrer"></a></p><button type="button" class="anatomy-btn"></button>';
    this.card.querySelector('h2')!.textContent = shown(part.name);
    this.card.querySelector('.anatomy-card-sci')!.textContent = part.science;
    this.card.querySelector('.anatomy-card-fact')!.textContent = shown(part.fact);
    this.card.querySelector('.anatomy-card-src span')!.textContent = shown(ANATOMY_UI.source);
    const a = this.card.querySelector('a')!;
    a.href = src.url;
    a.textContent = sourceName(part.fact.source);
    const close = this.card.querySelector('button')!;
    close.textContent = shown(ANATOMY_UI.close);
    close.addEventListener('click', () => {
      this.card.hidden = true;
      this.items.get(id)?.button.focus();
    });
    this.card.hidden = false;
    close.focus();
  }
}
