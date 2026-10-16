import './opening.css';
import { el, button } from './dom';
import type { Shell } from './shell';
import { TEXT, shown } from '../content/text';
import type { Caption } from '../opening/script';

export interface OpeningCaptions {
  /** Shows this caption (null: none). Writes the page only when the caption changes. */
  set(c: Caption | null): void;
}

/**
 * The opening scene's strip at the top (clear of the worm, low in the shot): the caption now (who speaks, and the words; a sound in
 * brackets and italics) and a real Skip button, with its keys named. The card is the shell's
 * aria-live region, so each new caption is read out too.
 */
export function showOpening(shell: Shell, onSkip: () => void): OpeningCaptions {
  const caption = el('p', '', 'opening-caption');
  const who = el('span', '', 'opening-who');
  const words = el('span', '', 'opening-words');
  caption.append(who, words);
  const skip = button(shown(TEXT.openingSkip), 'play', 'secondary', onSkip);
  const side = el('div', '', 'opening-skip');
  side.append(skip.el, el('span', shown(TEXT.openingSkipKeys), 'opening-keys'));
  shell.show('opening', 'Opening', [caption, side]);
  delete shell.panel.dataset.phase;
  skip.el.focus({ preventScroll: true });
  let last: Caption | null = null;
  return {
    set(c) {
      if (c === last) return;
      last = c;
      who.textContent = c?.who === 'kid' ? shown(TEXT.openingKid) : c?.who === 'teacher' ? shown(TEXT.openingTeacher) : '';
      const line = c ? TEXT[c.line] : null;
      words.textContent = line ? shown(line) : '';
      if (c && !c.who) words.dataset.sound = '';
      else delete words.dataset.sound;
      // The teacher's science lines are sourced facts (src/content/text.ts).
      if (line?.kind === 'fact') words.dataset.source = line.source;
      else delete words.dataset.source;
    },
  };
}
