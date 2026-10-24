import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ANATOMY_UI } from '../content/anatomy';
import { shown } from '../content/text';
import { icon } from '../ui/icons';

/** The slider's middle is the view as framed; each end is 4 times nearer or farther. */
const STEPS = 100;
const PER_DOUBLING = 25;

/**
 * A vertical zoom bar at the top right (Matt, 2026-10-24): + at the top, - at the bottom, a slider
 * between. It moves the camera along its line to the target, so it works with the mouse wheel and a
 * pinch too: those move the slider to match.
 */
export class ZoomBar {
  readonly el = document.createElement('div');
  private readonly input = document.createElement('input');
  private base = 1;
  private setting = false;
  private readonly d = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera, private readonly controls: OrbitControls, private readonly onChange: () => void) {
    this.el.className = 'anatomy-zoom';
    const input = this.input;
    input.type = 'range';
    input.min = '0';
    input.max = String(STEPS);
    input.step = '1';
    input.setAttribute('aria-label', shown(ANATOMY_UI.zoom));
    input.addEventListener('input', () => this.apply());
    const step = (by: number, label: string, name: 'zoomIn' | 'zoomOut'): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'anatomy-zoom-btn';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.append(icon(name, 'anatomy-icon'));
      b.addEventListener('click', () => {
        input.value = String(Number(input.value) + by);
        this.apply();
      });
      return b;
    };
    this.el.append(step(10, shown(ANATOMY_UI.zoomIn), 'zoomIn'), input, step(-10, shown(ANATOMY_UI.zoomOut), 'zoomOut'));
    controls.addEventListener('change', () => this.follow());
    this.reset();
  }

  /** The view as it is now is the middle of the bar (after a view is picked). */
  reset(): void {
    this.base = Math.max(1e-3, this.distance());
    this.input.value = String(STEPS / 2);
  }

  private distance(): number {
    return this.d.copy(this.camera.position).sub(this.controls.target).length();
  }

  private apply(): void {
    const v = Number(this.input.value);
    const dist = this.base * 2 ** ((STEPS / 2 - v) / PER_DOUBLING);
    this.d.copy(this.camera.position).sub(this.controls.target).setLength(dist);
    this.setting = true;
    this.camera.position.copy(this.controls.target).add(this.d);
    this.controls.update();
    this.setting = false;
    this.onChange();
  }

  /** The wheel or a pinch zoomed: move the slider to match. */
  private follow(): void {
    if (this.setting) return;
    const v = STEPS / 2 - Math.log2(this.distance() / this.base) * PER_DOUBLING;
    this.input.value = String(Math.round(Math.min(STEPS, Math.max(0, v))));
  }
}
