const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Tracks which keys (by KeyboardEvent.code) are held down. */
export class KeyboardInput {
  readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Ignore browser shortcuts (Ctrl/Cmd/Alt combinations).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ignore keys in editable controls (except buttons).
      if (e.target instanceof Element && e.target.closest('input,select,textarea,[contenteditable]')) return;
      // Let Space/Enter still press a focused button.
      if (SCROLL_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.down.clear();
    });
  }
}
