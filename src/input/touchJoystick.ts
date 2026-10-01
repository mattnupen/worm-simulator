import type { Vec2 } from '../core/vec';
import { dragToMove } from './commands';

/** On-screen joystick. Pointer events cover touch, trackpad and mouse. */
export class TouchJoystick {
  readonly el: HTMLDivElement;
  value: Vec2 = { x: 0, y: 0 };
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;

  constructor(parent: HTMLElement, private readonly radius = 60) {
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.el.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.el.appendChild(this.knob);
    parent.appendChild(this.el);

    this.el.addEventListener('pointerdown', (e) => {
      this.pointerId = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      this.track(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.track(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.value = { x: 0, y: 0 };
      this.knob.style.transform = '';
    };
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointercancel', release);
  }

  private track(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    this.value = dragToMove(dx, dy, this.radius);
    this.knob.style.transform =
      `translate(${this.value.x * this.radius}px, ${-this.value.y * this.radius}px)`;
  }
}
