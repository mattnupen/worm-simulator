import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ANATOMY_PARTS, ANATOMY_UI, type AnatomyPartId } from '../content/anatomy';
import { shown } from '../content/text';
import { ANCHORS } from './anchors';
import type { CardAction, LabelLayer } from './labels';
import { SYSTEMS, type AnatomyWorm } from './model';
import { SYSTEM_ICONS, SYSTEM_NAMES } from './panel';
import type { AnatomyIcon } from './icons';
import { glowFor, pickPart } from './picking';

/**
 * Selecting a part, as in a medical atlas: tap the model (or a label, or a name in the parts list)
 * and the part glows yellow, its label shows and its card opens with Hide, Fade and Only actions
 * for its body system. A name in the list also flies the camera to the part.
 */
export class Selection {
  private readonly ray = new THREE.Raycaster();
  private fly: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;
  /** Runs after anything here changes what is shown (the panel resyncs, the frame redraws). */
  changed = (): void => {};

  constructor(
    private readonly worm: AnatomyWorm,
    private readonly labels: LabelLayer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
  ) {}

  /** A tap on the canvas at client (x, y): selects the part there, or clears on empty space. */
  tap(x: number, y: number, el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    // See-through layers let taps pass to what is behind them.
    const meshes = this.worm.group.children.filter((m) => m.visible && !((m as THREE.Mesh).material as THREE.Material).transparent);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    const system = hit && this.worm.systemOf(hit.object);
    const id = system && pickPart(system, hit.point, this.worm.poseMap);
    if (id) this.select(id, hit.point);
    else this.clear();
  }

  select(id: AnatomyPartId, hit?: THREE.Vector3, flyTo = false): void {
    const part = ANATOMY_PARTS[id];
    if (!this.worm.isOn(part.system)) this.worm.setFade(part.system, 1);
    const g = glowFor(id, this.worm.poseMap, hit);
    this.worm.highlight(part.system, g.a, g.b, g.radius);
    this.labels.selected = id;
    this.labels.selectedAt = hit?.clone() ?? null;
    const name = shown(SYSTEM_NAMES[part.system]);
    const act = (line: typeof ANATOMY_UI.actHide, icon: AnatomyIcon, run: () => void): CardAction =>
      ({ text: shown(line), label: `${shown(line)} ${name.toLowerCase()}`, icon, run: () => { run(); this.changed(); } });
    this.labels.open(id, [
      act(ANATOMY_UI.actHide, 'hide', () => { this.worm.setFade(part.system, 0); this.clear(); }),
      act(ANATOMY_UI.actFade, 'fade', () => this.worm.setFade(part.system, 0.3)),
      act(ANATOMY_UI.actOnly, 'only', () => { for (const s of SYSTEMS) if (s !== part.system && s !== 'skin') this.worm.setFade(s, 0); this.worm.setFade('skin', Math.min(this.worm.fade('skin'), 0.25)); }),
    ], () => this.clear(), { icon: SYSTEM_ICONS[part.system], name });
    if (flyTo) this.flyTo(id);
    this.changed();
  }

  clear(): void {
    this.worm.highlight(null);
    this.labels.selected = null;
    this.labels.selectedAt = null;
    this.labels.close();
    this.changed();
  }

  /** Turns the camera to look at the part from closer in, over half a second. */
  private flyTo(id: AnatomyPartId): void {
    const to = this.worm.poseMap.point(ANCHORS[id].at(), new THREE.Vector3());
    const dir = this.camera.position.clone().sub(this.controls.target);
    const dist = Math.min(dir.length(), 28);
    const camTo = to.clone().addScaledVector(dir.normalize(), dist);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.controls.target.copy(to);
      this.camera.position.copy(camTo);
      return;
    }
    this.fly = { from: this.controls.target.clone(), to, camFrom: this.camera.position.clone(), camTo, t: 0 };
  }

  /** Moves a flight on by `dt` seconds; true while flying (the frame must redraw). */
  tick(dt: number): boolean {
    if (!this.fly) return false;
    const f = this.fly;
    f.t = Math.min(1, f.t + dt / 0.5);
    const e = f.t * f.t * (3 - 2 * f.t);
    this.controls.target.lerpVectors(f.from, f.to, e);
    this.camera.position.lerpVectors(f.camFrom, f.camTo, e);
    if (f.t >= 1) this.fly = null;
    return true;
  }
}

