import { el } from './dom';
import { icon } from './icons';
import { TEXT, shown } from '../content/text';
import { GRIP, type GripState } from '../predators/grip';

/**
 * The grip mini-game's only HUD (V4, Matt 2026-10-22: "Remove instructions"): the Energy bar, real
 * DOM over the side view. A bolt icon and the word "Energy", and a bar (role=meter, 0 to 100) that
 * shrinks with each tap and grows back with rest. Low energy shows in the bar's length, a dashed
 * marker at the low line, and a striped fill once at or under it, never colour alone. Nothing
 * flashes: the bar only changes length. A visually hidden live region tells screen readers "Robin
 * pulls!" as each pull starts (once a pull).
 *
 * update() writes the DOM only when something it shows changes, from strings made at load, so it
 * allocates nothing. `data-phase` ('pull' or 'regrip') is for tests and screenshots.
 */
export interface HuntEnergy {
  /** The panel (a tap on it is a tap in the mini-game). */
  readonly el: HTMLElement;
  /** The screen-reader announcer. */
  readonly live: HTMLElement;
  /** Shows `g` (the grab's grip), or hides the panel (null). */
  update(g: GripState | null): void;
  /** A pull has just started: tells screen readers. */
  pulled(): void;
}

const STEPS = 100;
/** The fill's transform and the meter's values, one per whole percent, made once. */
const SCALE = Array.from({ length: STEPS + 1 }, (_, i) => `scaleX(${i / STEPS})`);
const NOW = Array.from({ length: STEPS + 1 }, (_, i) => String(i));
const low = shown(TEXT.huntEnergyLow);
const VALUE = Array.from({ length: STEPS + 1 }, (_, i) => (i <= GRIP.low * STEPS ? `${i}% (${low})` : `${i}%`));
/** "Robin pulls!", and the same with a trailing no-break space: a change each pull, so it is read again. */
const PULLS = [shown(TEXT.huntPulls), `${shown(TEXT.huntPulls)} `];

export function createHuntEnergy(): HuntEnergy {
  const panel = el('div', '', 'hunt-energy');
  panel.hidden = true;
  const word = el('span', shown(TEXT.huntEnergy), 'hunt-energy-word');
  word.id = 'hunt-energy-word';
  const bar = el('div', '', 'hunt-energy-bar');
  bar.setAttribute('role', 'meter');
  bar.setAttribute('aria-labelledby', word.id);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(STEPS));
  const fill = el('div', '', 'hunt-energy-fill');
  const mark = el('div', '', 'hunt-energy-mark');
  mark.style.left = `${GRIP.low * 100}%`;
  bar.append(fill, mark);
  panel.append(icon('energy', 'hunt-energy-icon'), word, bar);

  const live = el('p', '', 'sr-only');
  live.setAttribute('aria-live', 'assertive');

  let on = false;
  let at = -1;
  let isLow = false;
  let phase = '';
  let said = 0;

  return {
    el: panel,
    live,
    update(g) {
      const show = g !== null;
      if (show !== on) {
        on = show;
        panel.hidden = !show;
        if (!show) live.textContent = '';
      }
      if (!g) return;
      const n = Math.max(0, Math.min(STEPS, Math.round(g.energy * STEPS)));
      if (n !== at) {
        at = n;
        fill.style.transform = SCALE[n];
        bar.setAttribute('aria-valuenow', NOW[n]);
        bar.setAttribute('aria-valuetext', VALUE[n]);
        const l = n <= GRIP.low * STEPS;
        if (l !== isLow) {
          isLow = l;
          panel.classList.toggle('is-low', l);
        }
      }
      if (g.phase !== phase) {
        phase = g.phase;
        panel.dataset.phase = phase;
      }
    },
    pulled() {
      said ^= 1;
      live.textContent = PULLS[said];
    },
  };
}
