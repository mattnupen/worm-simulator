import * as THREE from 'three';
import { ANATOMY_UI, BRISTLE_FACTS } from '../../content/anatomy';
import { SOURCES } from '../../content/sources';
import { shown, type Line } from '../../content/text';
import { icon } from '../../ui/icons';
import type { BristleScene } from './scene';

type Fact = keyof typeof BRISTLE_FACTS;

/**
 * The bristle views' words and controls: a label on a bristle (close-up) or on the head end
 * (crawling), the fact that matches what the worm is doing, Pause and Slow motion, and a 1 mm bar
 * so students see the real size. Plain DOM over the 3D, like the viewer's labels.
 */
export class BristleOverlay {
  readonly root = document.createElement('div');
  /** True while the animation runs. Starts paused when the computer asks for less motion. */
  playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  slow = false;
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  private readonly dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  private readonly label = document.createElement('div');
  private readonly fact = document.createElement('p');
  private readonly source = document.createElement('a');
  private readonly play = document.createElement('button');
  private readonly slowBtn = document.createElement('button');
  private readonly bar = document.createElement('div');
  private shownFact: Fact | null = null;
  private close = true;
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
    this.fact.className = 'bristle-fact';
    this.source.className = 'bristle-source';
    this.source.target = '_blank';
    this.source.rel = 'noopener noreferrer';
    const row = document.createElement('div');
    row.className = 'bristle-row';
    this.play.type = this.slowBtn.type = 'button';
    this.play.className = this.slowBtn.className = 'anatomy-btn';
    this.slowBtn.append(icon('gauge', 'anatomy-icon'), document.createTextNode(shown(ANATOMY_UI.slow)));
    this.play.addEventListener('click', () => { this.playing = !this.playing; this.sync(); this.onChange(); });
    this.slowBtn.addEventListener('click', () => { this.slow = !this.slow; this.sync(); this.onChange(); });
    const scale = document.createElement('div');
    scale.className = 'bristle-scale';
    this.bar.className = 'bristle-bar';
    scale.append(this.bar, document.createTextNode(shown(ANATOMY_UI.oneMm)));
    row.append(this.play, this.slowBtn, scale);
    box.append(this.fact, this.source, row);
    this.root.append(this.svg, this.label, box);
    this.sync();
  }

  /** Shows the close-up (`close`) or the crawling view, or hides both. */
  show(view: 'close' | 'crawl' | null): void {
    this.root.hidden = view === null;
    this.close = view === 'close';
    this.label.innerHTML = this.close ? '<span class="anatomy-label-name"></span><span class="anatomy-label-sci">seta</span>' : '<span class="anatomy-label-name"></span>';
    this.label.querySelector('.anatomy-label-name')!.textContent = shown(this.close ? ANATOMY_UI.bristle : ANATOMY_UI.front);
    this.shownFact = null;
  }

  /** Places the label and the 1 mm bar, and picks the fact for what the worm is doing now. */
  update(scene: BristleScene, camera: THREE.Camera, width: number, height: number): void {
    if (this.root.hidden) return;
    const px = (v: THREE.Vector3): [number, number] => {
      v.applyMatrix4(scene.group.matrixWorld).project(camera);
      return [(v.x + 1) / 2 * width, (1 - v.y) / 2 * height];
    };
    const [x, y] = px(this.close ? scene.heroTip(this.a) : scene.headEnd(this.a));
    const lx = Math.min(width - 180, Math.max(8, x + (this.close ? -150 : 40)));
    const ly = Math.max(70, y + (this.close ? -170 : -110));
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
    const s = scene.heroSqueeze();
    const want: Fact = !this.close ? 'turns' : s > 0.55 ? 'grip' : s < 0.45 ? 'slide' : this.shownFact ?? 'grip';
    if (want !== this.shownFact) this.setFact(want);
  }

  private setFact(id: Fact): void {
    this.shownFact = id;
    const line: Line = BRISTLE_FACTS[id];
    this.fact.textContent = shown(line);
    const src = line.kind === 'fact' ? SOURCES[line.source] : null;
    this.source.hidden = !src;
    if (src) {
      this.source.href = src.url;
      this.source.textContent = `${shown(ANATOMY_UI.source)} ${src.short ?? src.publisher}`;
    }
  }

  private sync(): void {
    const word = shown(this.playing ? ANATOMY_UI.pause : ANATOMY_UI.play);
    this.play.replaceChildren(icon(this.playing ? 'pause' : 'play', 'anatomy-icon'), document.createTextNode(word));
    this.slowBtn.setAttribute('aria-pressed', String(this.slow));
  }
}
