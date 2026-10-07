const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
/** Keys that press a focused button or link (Crawl, Resume): on one, they are never game keys. */
const ACTIVATE_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);
const EDITABLE = 'input,select,textarea,[contenteditable]';
const INTERACTIVE = 'button,a[href],' + EDITABLE;

const inside = (t: EventTarget | null, selector: string): boolean =>
  t instanceof Element && t.closest(selector) !== null;

/**
 * Tracks which keys (by KeyboardEvent.code) are held down. A key released since the last game step
 * stays in `down` until endStep(), so a press shorter than a step (or than a slow frame, when
 * several steps run together) still shows for one step: one tap of Space is always one Action
 * press, with no timing to get right.
 *
 * Space or Enter on a focused control (Space on Crawl or Resume) presses that control only, and a
 * key let go on a control leaves `down` at once rather than latching: starting or resuming with
 * Space is never also an Action press on the first step.
 */
export class KeyboardInput {
  readonly down = new Set<string>();
  /** Keys let go since the last endStep(). */
  private readonly released = new Set<string>();
  private readonly drop = (code: string): void => { this.down.delete(code); };

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Ignore browser shortcuts (Ctrl/Cmd/Alt combinations).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ignore keys in editable controls, and the keys that press a focused button or link.
      if (inside(e.target, EDITABLE)) return;
      if (ACTIVATE_KEYS.has(e.code) && inside(e.target, INTERACTIVE)) return;
      if (SCROLL_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.down.add(e.code);
      this.released.delete(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (!this.down.has(e.code)) return;
      if (inside(e.target, INTERACTIVE)) {
        // Let go on a control (focus moved there while held): drop it now, never latch it.
        this.down.delete(e.code);
        this.released.delete(e.code);
      } else {
        this.released.add(e.code);
      }
    });
    target.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  /** After each game step: keys let go since the last one leave `down`. Allocates nothing. */
  endStep(): void {
    if (this.released.size === 0) return;
    this.released.forEach(this.drop);
    this.released.clear();
  }

  private clear(): void {
    this.down.clear();
    this.released.clear();
  }
}
