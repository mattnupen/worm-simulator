const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Tracks which keys (by KeyboardEvent.code) are held down. */
export class KeyboardInput {
  readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Let Space/Enter still press a focused button.
      if (SCROLL_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }
}
