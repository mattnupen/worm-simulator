import './hunt.css';
import { el } from './dom';
import { icon } from './icons';
import { TEXT, shown } from '../content/text';
import { TUG, type TugState } from '../predators/tug';

/**
 * The robin hunt's HUD (V4 spec 1 and 2), real DOM over the game:
 * - the warning, top right: a bird icon and "Robin!", with what to do ("Dig down to hide.");
 *   read out once by screen readers when it appears. Words and an icon, never colour alone, and
 *   it never flashes;
 * - the grip mini-game's panel, left: the "Pull" bar from Burrow (bottom) to Robin (top) with a
 *   worm marker, the Stretch meter with "Careful!" when it's nearly full, and one line saying what
 *   to do now ("Hold Space to pull back in." / "It tugs! Let go!").
 * update() writes the DOM only when something it shows changes, and allocates nothing.
 */
export interface HuntHud {
  /** The warning: shown while a robin is about and the worm isn't held. */
  warn(on: boolean): void;
  /** The mini-game panel: `tug` while the robin holds the worm, null otherwise. */
  grip(tug: TugState | null, touch: boolean): void;
  /** A short line after the mini-game ("You got away!"), or null to clear it. */
  note(text: string | null): void;
  dispose(): void;
}

export function createHuntHud(root: HTMLElement): HuntHud {
  const warning = el('div', '', 'hunt-warning');
  warning.setAttribute('role', 'status');
  warning.hidden = true;
  const warnWord = el('strong', shown(TEXT.huntRobin), 'hunt-warning-word');
  const warnDo = el('span', shown(TEXT.huntHide), 'hunt-warning-do');
  warning.append(icon('bird', 'hunt-warning-icon'), warnWord, warnDo);

  const panel = el('div', '', 'hunt-grip');
  panel.hidden = true;
  const title = el('p', shown(TEXT.huntGrabbed), 'hunt-grip-title');
  const bar = el('div', '', 'hunt-bar');
  bar.setAttribute('role', 'meter');
  bar.setAttribute('aria-label', shown(TEXT.huntBarLabel));
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  const top = el('span', shown(TEXT.huntBarTop), 'hunt-bar-end hunt-bar-top');
  top.prepend(icon('bird', 'hunt-bar-icon'));
  const track = el('div', '', 'hunt-bar-track');
  const marker = el('div', '', 'hunt-bar-marker');
  track.append(marker);
  const bottom = el('span', shown(TEXT.huntBarBottom), 'hunt-bar-end hunt-bar-bottom');
  bottom.prepend(icon('digDown', 'hunt-bar-icon'));
  bar.append(top, track, bottom);

  const stretch = el('div', '', 'hunt-stretch');
  stretch.setAttribute('role', 'meter');
  stretch.setAttribute('aria-label', shown(TEXT.huntStretch));
  stretch.setAttribute('aria-valuemin', '0');
  stretch.setAttribute('aria-valuemax', '100');
  const stretchWord = el('span', shown(TEXT.huntStretch), 'hunt-stretch-word');
  const stretchTrack = el('div', '', 'hunt-stretch-track');
  const stretchFill = el('div', '', 'hunt-stretch-fill');
  stretchTrack.append(stretchFill);
  const careful = el('span', shown(TEXT.huntCareful), 'hunt-careful');
  careful.prepend(icon('careful', 'hunt-careful-icon'));
  careful.hidden = true;
  stretch.append(stretchWord, stretchTrack, careful);

  const say = el('p', '', 'hunt-say');
  say.setAttribute('aria-live', 'polite');
  panel.append(title, bar, stretch, say);

  const note = el('p', '', 'hunt-note');
  note.setAttribute('role', 'status');
  note.hidden = true;
  root.append(warning, panel, note);

  // What's on screen now, so update() only writes changes (whole percent steps).
  let warnOn = false;
  let gripOn = false;
  let pos = -1;
  let str = -1;
  let carefulOn = false;
  let line = '';
  let noteText: string | null = null;

  return {
    warn(on) {
      if (on === warnOn) return;
      warnOn = on;
      warning.hidden = !on;
    },
    grip(tug, touch) {
      const on = tug !== null;
      if (on !== gripOn) {
        gripOn = on;
        panel.hidden = !on;
      }
      if (!tug) return;
      const p = Math.round(tug.pos * 100);
      if (p !== pos) {
        pos = p;
        // The marker's top edge, from the track's top (Robin, 100) to its bottom (Burrow, 0).
        marker.style.top = `${100 - p}%`;
        bar.setAttribute('aria-valuenow', String(p));
      }
      const s = Math.round(tug.stretch * 100);
      if (s !== str) {
        str = s;
        stretchFill.style.width = `${s}%`;
        stretch.setAttribute('aria-valuenow', String(s));
      }
      const c = tug.stretch >= TUG.careful;
      if (c !== carefulOn) {
        carefulOn = c;
        careful.hidden = !c;
      }
      const next = tug.phase === 'calm' ? shown(touch ? TEXT.huntPullTouch : TEXT.huntPull) : shown(TEXT.huntLetGo);
      if (next !== line) {
        line = next;
        say.textContent = next;
      }
    },
    note(text) {
      if (text === noteText) return;
      noteText = text;
      note.hidden = text === null;
      note.textContent = text ?? '';
    },
    dispose() {
      warning.remove();
      panel.remove();
      note.remove();
    },
  };
}
