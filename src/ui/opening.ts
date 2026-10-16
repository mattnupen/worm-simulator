import './opening.css';
import { el } from './dom';
import type { Shell } from './shell';
import { TEXT, shown } from '../content/text';
import type { Caption } from '../opening/script';

export interface OpeningCaptions {
  /** Shows this caption (null: none). Writes the page only when the caption changes. */
  set(c: Caption | null): void;
}

/**
 * The opening scene's captions at the top (clear of the worm, low in the shot): who speaks, and the
 * words (a sound in brackets and italics), white on see-through black bars. There is no button (Matt
 * 2026-10-16); Esc or Enter skips (main.ts). The panel is the shell's aria-live region, so each new
 * caption is read out too.
 */
export function showOpening(shell: Shell): OpeningCaptions {
  const caption = el('p', '', 'opening-caption');
  const who = el('span', '', 'opening-who');
  const words = el('span', '', 'opening-words');
  caption.append(who, words);
  shell.show('opening', 'Opening', [caption]);
  delete shell.panel.dataset.phase;
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
