import './hunt.css';
import { el } from './dom';
import { icon } from './icons';
import { TEXT, shown } from '../content/text';
import type { RhythmState } from '../predators/rhythm';
import { createHuntRing } from './huntRing';

/**
 * The robin hunt's HUD (V4 spec 1, revision 1), real DOM over the game:
 * - the warning, top right: a bird icon and "Robin!", with what to do ("Dig down to hide.", or
 *   underground "Dig deeper to hide."); read out once by screen readers when it appears. Words and
 *   an icon, never colour alone, and it never flashes;
 * - the grip mini-game's panel (huntRing.ts): the timing ring, the beat's call, the pips;
 * - a short note at the top (the first grab's fact, how the hunt ended).
 * Each call writes the DOM only when something it shows changes, and allocates nothing.
 */
export interface HuntHud {
  /** The warning: shown while a robin is about and the worm isn't held; `under`: the worm is underground. */
  warn(on: boolean, under: boolean): void;
  /** The mini-game panel: the rhythm while the robin holds the worm, null otherwise. */
  grip(rhythm: RhythmState | null, touch: boolean): void;
  /** A short line after the mini-game ("You got away!"), or null to clear it. */
  note(text: string | null): void;
  /** The grip panel (a tap on it is a tap in the mini-game). */
  readonly panel: HTMLElement;
  dispose(): void;
}

export function createHuntHud(root: HTMLElement): HuntHud {
  const warning = el('div', '', 'hunt-warning');
  warning.setAttribute('role', 'status');
  warning.hidden = true;
  const warnWord = el('strong', shown(TEXT.huntRobin), 'hunt-warning-word');
  const warnDo = el('span', shown(TEXT.huntHide), 'hunt-warning-do');
  warning.append(icon('bird', 'hunt-warning-icon'), warnWord, warnDo);

  const ring = createHuntRing();

  const note = el('p', '', 'hunt-note');
  note.setAttribute('role', 'status');
  note.hidden = true;
  root.append(warning, ring.el, note);

  let warnOn = false;
  let warnUnder = false;
  let noteText: string | null = null;
  const hide = shown(TEXT.huntHide);
  const hideDeeper = shown(TEXT.huntHideDeeper);

  return {
    panel: ring.el,
    warn(on, under) {
      if (on === warnOn && (!on || under === warnUnder)) return;
      warnOn = on;
      warnUnder = under;
      warning.hidden = !on;
      // Written as it appears, so screen readers announce it (a region that is only un-hidden often isn't read).
      warnWord.textContent = on ? shown(TEXT.huntRobin) : '';
      warnDo.textContent = on ? (under ? hideDeeper : hide) : '';
    },
    grip(rhythm, touch) {
      ring.update(rhythm, touch);
    },
    note(text) {
      if (text === noteText) return;
      noteText = text;
      note.hidden = text === null;
      note.textContent = text ?? '';
    },
    dispose() {
      warning.remove();
      ring.el.remove();
      note.remove();
    },
  };
}
