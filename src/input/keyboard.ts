const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Tracks which keys (by KeyboardEvent.code) are held down. A key released since the last game step
 * stays in `down` until endStep(), so a press shorter than a step (or than a slow frame, when
 * several steps run together) still shows for one step: one tap of Space is always one Action
 * press, with no timing to get right.
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
      // Ignore keys in editable controls (except buttons).
      if (e.target instanceof Element && e.target.closest('input,select,textarea,[contenteditable]')) return;
      // Let Space/Enter still press a focused button.
      if (SCROLL_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.down.add(e.code);
      this.released.delete(e.code);
    });
    target.addEventListener('keyup', (e) => { if (this.down.has(e.code)) this.released.add(e.code); });
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
