import { el, button, menu } from './dom';
import { SCALE_MODES, SCALE_LABELS, SCALE_DESCRIPTIONS, type ScaleMode } from '../surface/worldScale';
import type { Shell } from './shell';

/** What the World scale screen says under its choices (the card is the aria-live region). */
export type ScaleStatus = 'idle' | 'building' | 'ready';

export const BUILDING_TEXT = 'Building the forest…';

/**
 * The World scale screen (Step 1b spec 4.3): three real radio buttons (Classic, Hybrid, True), each
 * with its one line, and Back. A pick is the caller's to save and build; `status` says what the
 * forest is doing (setScaleStatus updates it). Focus rests on the checked choice (or Back), so redrawing keeps the player's place.
 */
export function showScale(
  shell: Shell, current: ScaleMode, status: ScaleStatus,
  onChoose: (m: ScaleMode) => void, onBack: () => void,
): void {
  const set = el('fieldset', '', 'choices');
  set.append(el('legend', 'World scale', 'screen-title'));
  set.append(el('p', 'How big is the forest next to the worm?', 'lead'));
  let checked: HTMLInputElement | null = null;
  for (const m of SCALE_MODES) {
    const id = `scale-${m}`;
    const input = el('input');
    input.type = 'radio';
    input.name = 'scale';
    input.id = id;
    input.value = m;
    input.checked = m === current;
    input.setAttribute('aria-labelledby', `${id}-name`);
    input.setAttribute('aria-describedby', `${id}-desc`);
    input.addEventListener('change', () => { if (input.checked) onChoose(m); });
    if (input.checked) checked = input;
    const label = el('label', '', 'choice');
    label.htmlFor = id;
    const words = el('span', '', 'choice-words');
    const desc = el('span', SCALE_DESCRIPTIONS[m], 'choice-desc');
    desc.id = `${id}-desc`;
    const name = el('span', SCALE_LABELS[m], 'choice-name');
    name.id = `${id}-name`;
    words.append(name, desc);
    label.append(input, words);
    set.append(label);
  }
  const note = el('p', statusText(status, current), 'scale-status');
  const back = button('Back', 'back', 'secondary', onBack);
  shell.show('scale', 'World scale', [set, note, menu(back)]);
  (checked ?? back.el).focus();
}

/**
 * Updates the showing World scale screen's status line in place. No redraw: the card does not
 * replay its entrance (it would blank for a moment), focus stays on the player's choice, and
 * the card's aria-live region reads out only the new line.
 */
export function setScaleStatus(shell: Shell, status: ScaleStatus, mode: ScaleMode): void {
  const note = shell.panel.querySelector('.scale-status');
  if (note) note.textContent = statusText(status, mode);
}

function statusText(status: ScaleStatus, mode: ScaleMode): string {
  return status === 'building' ? BUILDING_TEXT
    : status === 'ready' ? `The forest is ready: ${SCALE_LABELS[mode]}.` : '';
}
