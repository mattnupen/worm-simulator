import { el, button } from './dom';

/** Which card is showing. CSS places the card and shows the joystick and Pause button from it. */
export type UiState =
  | 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'running' | 'results' | 'lost';

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

export function createShell(root: HTMLElement, showFps: boolean, onPause: () => void): Shell {
  const panel = el('div', '', 'panel');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-live', 'polite');
  // Focusable by script only, so focus has somewhere sensible to land while crawling.
  panel.tabIndex = -1;
  const fpsTag = el('div', '', 'fps');
  const pause = button('Pause', 'pause', 'secondary', onPause);
  pause.el.classList.add('pause-btn');
  root.append(panel, fpsTag, pause.el);
  let lastFps = 0;

  return {
    root,
    panel,
    show(state, label, children) {
      root.dataset.ui = state;
      panel.dataset.state = state;
      panel.setAttribute('aria-label', label);
      panel.hidden = false;
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
