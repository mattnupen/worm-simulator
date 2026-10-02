import { el, button, cardHead, leafList, menu } from './dom';
import { icon } from './icons';
import { CHOICE_LABELS, type PresetId } from '../render/graphics';
import type { Shell } from './shell';

/** The Step 0 speed-test card, plus a way back to the start. */
export function showTestIntro(shell: Shell, onStart: () => void, onBack: () => void): void {
  const start = button('Start speed test', 'play', 'primary', onStart);
  shell.show('speedTest', 'Speed test', [
    cardHead('Chromebook speed test'),
    el('p', 'This checks if the 3D forest runs smoothly on this computer.', 'lead'),
    leafList(['It takes about 30 seconds.', 'Please do not touch anything while it runs.']),
    menu(start, button('Back to start', 'home', 'secondary', onBack)),
  ]);
  start.el.focus();
}

/** step/steps (1-based) drive the small progress pips. */
export function showRunning(shell: Shell, label: string, step: number, steps: number): void {
  const p = el('p', label, 'running-label');
  p.dataset.testid = 'running';
  // Decorative: the label already says "Test 1 of 2".
  const pips = el('div', '', 'pips');
  pips.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= steps; i++) {
    pips.appendChild(el('span', '', i < step ? 'pip done' : i === step ? 'pip now' : 'pip'));
  }
  shell.show('running', 'Speed test', [
    el('p', 'Speed test running', 'eyebrow'), p, pips, el('p', 'Please wait. Hands off!', 'wait'),
  ]);
  // Whatever button held focus is gone: rest it on the card, as the Crawl card does.
  shell.panel.focus({ preventScroll: true });
}

export interface ResultOptions {
  /** Replaces the default sentence under PASS or FAIL. */
  summary?: string;
  /** The preset to offer with "Use recommended setting"; null or absent hides it. */
  recommended?: PresetId | null;
  /** The recommendation was already saved: say so instead of offering it. */
  applied?: boolean;
  onUseRecommended?: () => void;
  /** "Back to start"; absent when there is no 3D to go back to. */
  onBack?: () => void;
}

export function showResult(shell: Shell, text: string, pass: boolean, o: ResultOptions = {}): void {
  const verdict = el('div', '', `verdict ${pass ? 'pass' : 'fail'}`);
  const words = el('div', '', 'verdict-words');
  words.append(
    el('h1', pass ? 'PASS' : 'FAIL', 'verdict-title'),
    el('p', o.summary ?? (pass
      ? 'This computer runs the forest smoothly.'
      : 'This computer had trouble keeping up. Please share these results with your teacher.'),
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
  const children: HTMLElement[] = [verdict, pre];
  if (o.recommended && o.applied) {
    const saved = el('p', '', 'saved');
    saved.append(icon('check', 'saved-icon'),
      el('span', `Saved: ${CHOICE_LABELS[o.recommended]} graphics.`));
    children.push(saved);
  } else if (o.recommended && o.onUseRecommended) {
    actions.append(button(`Use recommended setting (${CHOICE_LABELS[o.recommended]})`, 'check', 'secondary',
      o.onUseRecommended).el);
  }
  let back: HTMLButtonElement | null = null;
  if (o.onBack) {
    back = button('Back to start', 'home', 'secondary', o.onBack).el;
    actions.append(back);
  }
  children.push(actions);
  shell.show('results', 'Speed test results', children);
  // After saving, the button that was pressed is gone: land on Back to start instead.
  (o.applied && back ? back : copy.el).focus();
}
