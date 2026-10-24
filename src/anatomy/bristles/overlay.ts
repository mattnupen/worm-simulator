import * as THREE from 'three';
import { ANATOMY_UI, BRISTLE_FACTS, BRISTLE_SPEEDS } from '../../content/anatomy';
import { SOURCES } from '../../content/sources';
import { shown } from '../../content/text';
import { icon } from '../../ui/icons';
import type { BristleScene } from './scene';

type Fact = keyof typeof BRISTLE_FACTS;
const PAIRS: Record<'close' | 'crawl', readonly [Fact, Fact]> = { close: ['grip', 'slide'], crawl: ['wedge', 'widen'] };
/** The slider's stops: Pause all the way left, then slowest to fastest (Matt, 2026-10-24). */
const STOPS = [{ rate: 0, name: ANATOMY_UI.pause }, ...BRISTLE_SPEEDS] as const;
const NORMAL = STOPS.findIndex((s) => s.rate === 1);

/**
 * The bristle views' words and controls: a label on a bristle (close-up) or on the head (digging),
 * the view's two facts with the one happening now marked (an arrow and bold, not colour alone),
 * one Sources button (a pop-up with every source), a speed slider that snaps from Pause through
 * 1/8 to 2x (Matt, 2026-10-24), and a 1 mm ruler on the picture so students see the real size.
 * Plain DOM over the 3D, like the viewer's labels.
 */
export class BristleOverlay {
  readonly root = document.createElement('div');
  /** How fast the animation runs (1 is normal, 0 paused). Paused at first when the computer asks for less motion. */
  speed = 1;
  get playing(): boolean {
    return this.speed > 0;
  }
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  private readonly dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  private readonly label = document.createElement('div');
  private readonly facts = document.createElement('ul');
  private readonly bar = document.createElement('div');
  private view: 'close' | 'crawl' = 'close';
  private now: Fact | null = null;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor(private readonly onChange: () => void) {
    this.root.className = 'bristle-ui';
    this.root.hidden = true;
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.classList.add('bristle-lines');
    this.dot.setAttribute('r', '4');
    this.svg.append(this.line, this.dot);
    this.label.className = 'anatomy-label bristle-label';
    const box = document.createElement('div');
    box.className = 'bristle-box';
    this.facts.className = 'bristle-facts';
    const row = document.createElement('div');
    row.className = 'bristle-row';
    // The ruler sits on the picture itself, not in the box.
    const ruler = document.createElement('div');
    ruler.className = 'bristle-ruler';
    this.bar.className = 'bristle-bar';
    ruler.append(this.bar, document.createTextNode(shown(ANATOMY_UI.oneMm)));
    const sources = document.createElement('button');
    sources.type = 'button';
    sources.className = 'anatomy-btn';
    sources.append(icon('book', 'anatomy-icon'), document.createTextNode(shown(ANATOMY_UI.sources)));
    const dialog = this.sourcesDialog();
    sources.addEventListener('click', () => dialog.showModal());
    row.append(this.speedSlider(), sources);
    box.append(this.facts, row);
    this.root.append(this.svg, this.label, ruler, box, dialog);
  }

  /** Shows the close-up or the digging view, or hides both. */
  show(view: 'close' | 'crawl' | null): void {
    this.root.hidden = view === null;
    if (!view) return;
    this.view = view;
    const close = view === 'close';
    this.label.innerHTML = close ? '<span class="anatomy-label-name"></span><span class="anatomy-label-sci">seta</span>' : '<span class="anatomy-label-name"></span>';
    this.label.querySelector('.anatomy-label-name')!.textContent = shown(close ? ANATOMY_UI.bristle : ANATOMY_UI.front);
    this.facts.replaceChildren(...PAIRS[view].map((id) => {
      const line = BRISTLE_FACTS[id];
      const li = document.createElement('li');
      li.dataset.fact = id;
      const mark = document.createElement('span');
      mark.className = 'bristle-now';
      mark.textContent = '▶';
      mark.setAttribute('aria-hidden', 'true');
      const words = document.createElement('span');
      words.className = 'bristle-words';
      words.textContent = shown(line);
      li.append(mark, words);
      return li;
    }));
    this.now = null;
  }

  /** Places the label and the 1 mm bar, and marks the fact for what the worm is doing now. */
  update(scene: BristleScene, camera: THREE.Camera, width: number, height: number): void {
    if (this.root.hidden) return;
    const px = (v: THREE.Vector3): [number, number] => {
      v.applyMatrix4(scene.group.matrixWorld).project(camera);
      return [(v.x + 1) / 2 * width, (1 - v.y) / 2 * height];
    };
    const close = this.view === 'close';
    const [x, y] = px(close ? scene.heroTip(this.a) : scene.headEnd(this.a));
    const lx = Math.min(width - 180, Math.max(8, x + (close ? -150 : 30)));
    const ly = Math.max(70, y + (close ? -170 : -120));
    this.label.style.transform = `translate(${lx}px, ${ly}px)`;
    this.line.setAttribute('x1', String(x));
    this.line.setAttribute('y1', String(y));
    this.line.setAttribute('x2', String(lx + 10));
    this.line.setAttribute('y2', String(ly + 24));
    this.dot.setAttribute('cx', String(x));
    this.dot.setAttribute('cy', String(y));
    // 1 mm, measured beside the close-up's segment.
    scene.heroTip(this.a);
    this.b.copy(this.a).x += 1;
    const [x0] = px(this.a);
    const [x1] = px(this.b);
    this.bar.style.width = `${Math.max(2, Math.abs(x1 - x0)).toFixed(1)}px`;
    const s = close ? scene.heroSqueeze() : scene.headSqueeze();
    const [fat, thin] = PAIRS[this.view];
    const want = s > 0.55 ? fat : s < 0.45 ? thin : this.now ?? fat;
    if (want === this.now) return;
    this.now = want;
    for (const li of this.facts.children) li.classList.toggle('bristle-fact-now', (li as HTMLElement).dataset.fact === want);
  }

  /** Every source the bristle views use, in one pop-up (Matt, 2026-10-24), each a link out in a new tab. */
  private sourcesDialog(): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.className = 'bristle-sources';
    const h = document.createElement('h2');
    h.id = 'bristle-sources-title';
    h.textContent = shown(ANATOMY_UI.sources);
    dialog.setAttribute('aria-labelledby', h.id);
    const list = document.createElement('ul');
    const ids = [...new Set(Object.values(BRISTLE_FACTS).map((f) => f.source))];
    for (const id of ids) {
      const src = SOURCES[id];
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = src.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = src.title;
      const by = document.createElement('span');
      by.textContent = src.publisher;
      li.append(link, by);
      list.append(li);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'anatomy-btn';
    close.append(icon('close', 'anatomy-icon'), document.createTextNode(shown(ANATOMY_UI.close)));
    close.addEventListener('click', () => dialog.close());
    // A click on the dimmed page around it closes it too.
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.append(h, list, close);
    return dialog;
  }

  /** Speed: a slider with six stops, Pause on the left, then slowest to fastest. */
  private speedSlider(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'bristle-speed';
    const id = 'bristle-speed';
    const name = document.createElement('label');
    name.htmlFor = id;
    name.className = 'bristle-speed-name';
    const value = document.createElement('output');
    value.htmlFor.add(id);
    name.append(icon('gauge', 'anatomy-icon'), document.createTextNode(shown(ANATOMY_UI.speed)), value);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = '0';
    input.max = String(STOPS.length - 1);
    input.step = '1';
    input.value = String(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : NORMAL);
    input.setAttribute('list', `${id}-stops`);
    const stops = document.createElement('datalist');
    stops.id = `${id}-stops`;
    const ticks = document.createElement('div');
    ticks.className = 'bristle-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    STOPS.forEach((sp, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      stops.append(o);
      const t = document.createElement('span');
      if (sp.rate === 0) t.append(icon('pause', 'bristle-tick-icon'));
      else t.textContent = shown(sp.name);
      ticks.append(t);
    });
    const set = (): void => {
      const sp = STOPS[Number(input.value)];
      this.speed = sp.rate;
      value.textContent = shown(sp.name);
      input.setAttribute('aria-valuetext', shown(sp.name));
      this.onChange();
    };
    input.addEventListener('input', set);
    set();
    wrap.append(name, input, stops, ticks);
    return wrap;
  }
}
