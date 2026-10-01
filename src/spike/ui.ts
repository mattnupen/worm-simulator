import { icon, type IconName } from './icons';

export interface SpikeUi {
  showStart(onStart: () => void): void;
  /** step/steps (1-based) drive the small progress pips; omit them to hide the pips. */
  showRunning(label: string, step?: number, steps?: number): void;
  /** `canDrive` false hides "Try driving the worm" (e.g. when there is no 3D to drive). */
  showResult(text: string, pass: boolean, canDrive?: boolean): void;
  /** True while the free-drive card is showing, so the worm should obey keys and joystick. */
  isDriving(): boolean;
  setFps(fps: number, tier: number): void;
}

/** Which card is showing. CSS places the card and shows the joystick from this. */
type UiState = 'start' | 'running' | 'result' | 'free';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, text = '', className = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

/** A button with a decorative icon. The accessible name is exactly `label`. */
function button(
  label: string, iconName: IconName, variant: 'primary' | 'secondary', onClick: () => void,
): { el: HTMLButtonElement; setLabel(text: string): void } {
  const b = el('button', '', `btn btn-${variant}`);
  b.type = 'button';
  const text = el('span', label, 'btn-label');
  b.append(icon(iconName, 'btn-icon'), text);
  b.addEventListener('click', onClick);
  return { el: b, setLabel: (t) => { text.textContent = t; } };
}

function leafList(items: string[]): HTMLUListElement {
  const ul = el('ul', '', 'leaf-list');
  for (const t of items) ul.appendChild(el('li', t));
  return ul;
}

export function createUi(root: HTMLElement): SpikeUi {
  const panel = el('div', '', 'panel');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Speed test');
  panel.setAttribute('aria-live', 'polite');
  // Focusable by script only, so focus has somewhere sensible to land in free drive.
  panel.tabIndex = -1;
  root.appendChild(panel);

  const fpsTag = el('div', '', 'fps');
  root.appendChild(fpsTag);
  let lastFpsUpdate = 0;
  let lastResult: { text: string; pass: boolean } | null = null;

  function setState(state: UiState): void {
    root.dataset.ui = state;
    panel.dataset.state = state;
    panel.hidden = false;
  }

  function backToResults(): void {
    if (lastResult) ui.showResult(lastResult.text, lastResult.pass);
  }

  // Escape returns to the results, but only while free driving.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat || panel.dataset.state !== 'free' || !lastResult) return;
    e.preventDefault();
    backToResults();
  });

  function showFree(): void {
    setState('free');
    const back = button('Back to results', 'back', 'secondary', backToResults);
    const hint = el('p', '', 'hint');
    hint.append(
      icon('drive', 'hint-icon'),
      el('span', 'Crawl with the arrow keys, W A S D, or the joystick. Press Esc or the button to go back.'),
    );
    panel.replaceChildren(hint, back.el);
    // The "Try driving" button just vanished: keep focus in the panel rather than lost on <body>.
    // Not on a button, so Space (a worm key) cannot press anything by accident.
    panel.focus({ preventScroll: true });
  }

  const ui: SpikeUi = {
    showStart(onStart) {
      setState('start');
      const seal = icon('leaf', 'seal');
      const titles = el('div', '', 'titles');
      titles.append(el('h1', 'Worm Simulator', 'title'), el('p', 'Chromebook speed test', 'eyebrow'));
      const head = el('div', '', 'card-head');
      head.append(seal, titles);
      const start = button('Start speed test', 'play', 'primary', onStart);
      panel.replaceChildren(
        head,
        el('p', 'This checks if the 3D forest runs smoothly on this computer.', 'lead'),
        leafList(['It takes about 30 seconds.', 'Please do not touch anything while it runs.']),
        start.el,
      );
      start.el.focus();
    },
    showRunning(label, step = 0, steps = 0) {
      setState('running');
      const p = el('p', label, 'running-label');
      p.dataset.testid = 'running';
      const children: HTMLElement[] = [el('p', 'Speed test running', 'eyebrow'), p];
      if (steps > 0) {
        // Decorative: the label already says "Test 1 of 2".
        const pips = el('div', '', 'pips');
        pips.setAttribute('aria-hidden', 'true');
        for (let i = 1; i <= steps; i++) {
          pips.appendChild(el('span', '', i < step ? 'pip done' : i === step ? 'pip now' : 'pip'));
        }
        children.push(pips);
      }
      children.push(el('p', 'Please wait. Hands off!', 'wait'));
      panel.replaceChildren(...children);
    },
    showResult(text, pass, canDrive = true) {
      setState('result');
      lastResult = { text, pass };
      const verdict = el('div', '', `verdict ${pass ? 'pass' : 'fail'}`);
      const words = el('div', '', 'verdict-words');
      words.append(
        el('h1', pass ? 'PASS' : 'FAIL', 'verdict-title'),
        el('p', pass
          ? 'This computer runs the forest smoothly.'
          : 'This computer had trouble keeping up. Please share these results with your teacher.',
        'verdict-note'),
      );
      verdict.append(icon(pass ? 'pass' : 'fail', 'verdict-icon'), words);

      const pre = el('pre', text, 'report');
      pre.dataset.testid = 'result';
      // Keyboard users can scroll the report when it is taller than the card.
      pre.tabIndex = 0;
      pre.setAttribute('role', 'region');
      pre.setAttribute('aria-label', 'Full results');
      // Keep arrow keys and Space here: the browser scrolls the report and the worm stays put.
      pre.addEventListener('keydown', (e) => e.stopPropagation());

      const copy = button('Copy results', 'copy', 'primary', async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.setLabel('Copied!');
        } catch {
          const range = document.createRange();
          range.selectNodeContents(pre);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
          copy.setLabel('Text selected. Press Ctrl + C.');
        }
      });
      const actions = el('div', '', 'actions');
      actions.append(copy.el);
      if (canDrive) actions.append(button('Try driving the worm', 'drive', 'secondary', showFree).el);
      panel.replaceChildren(verdict, pre, actions);
      copy.el.focus();
    },
    isDriving: () => panel.dataset.state === 'free',
    setFps(fps, tier) {
      const now = performance.now();
      if (now - lastFpsUpdate < 250) return;
      lastFpsUpdate = now;
      fpsTag.textContent = `${Math.round(fps)} fps, quality ${tier}`;
    },
  };
  return ui;
}
