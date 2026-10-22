import { el } from './dom';

/** Which card is showing. CSS places the card and shows the joystick from it. */
export type UiState =
  | 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'running' | 'results' | 'lost' | 'lesson' | 'vote' | 'opening' | 'nest';

export interface Shell {
  readonly root: HTMLElement;
  /** The one aria-live card every screen draws into. */
  readonly panel: HTMLDivElement;
  /** Replaces the card's content. `label` names the region for screen readers. */
  show(state: UiState, label: string, children: HTMLElement[]): void;
  /**
   * Updates the fps tag (at most 4 times a second). Shown with ?fps=1, and always mid-test.
   * Shows `label` (the graphics choice), or "quality N" when a speed-test `tier` is given. The
   * text is only built when the tag really updates, so calling this every frame costs nothing.
   */
  setFps(fps: number, label: string, tier?: number): void;
}

export function createShell(root: HTMLElement, showFps: boolean): Shell {
  const panel = el('div', '', 'panel');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-live', 'polite');
  // Focusable by script only, so focus has somewhere sensible to land while crawling.
  panel.tabIndex = -1;
  const fpsTag = el('div', '', 'fps');
  // No Pause button (Matt, 2026-10-22: it crowded phone screens). Esc or P still pauses.
  root.append(panel, fpsTag);
  let lastFps = 0;

  return {
    root,
    panel,
    show(state, label, children) {
      root.dataset.ui = state;
      panel.dataset.state = state;
      panel.setAttribute('aria-label', label);
      panel.hidden = false;
      // A new card starts in its own place (the hint card underground moves: hintPlace.ts).
      delete panel.dataset.card;
      delete panel.dataset.at;
      delete panel.dataset.folded;
      panel.replaceChildren(...children);
    },
    setFps(fps, label, tier) {
      const visible = showFps || root.dataset.ui === 'running';
      if (!visible) {
        if (fpsTag.textContent) fpsTag.textContent = '';
        return;
      }
      const now = performance.now();
      if (now - lastFps < 250) return;
      lastFps = now;
      fpsTag.textContent = `${Math.round(fps)} fps, ${tier === undefined ? label : `quality ${tier}`}`;
    },
  };
}
