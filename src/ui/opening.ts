import './opening.css';
import { el, button, menu } from './dom';
import type { Shell } from './shell';
import { SOURCES } from '../content/sources';
import { TEXT, shown } from '../content/text';
import type { Caption } from '../opening/script';

export interface OpeningCaptions {
  /** Shows this caption (null: none). Writes the page only when the caption changes. */
  set(c: Caption | null): void;
}

/**
 * The opening scene's strip at the bottom: the caption now (who speaks, and the words; a sound in
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
      words.textContent = c ? shown(TEXT[c.line]) : '';
      if (c && !c.who) words.dataset.sound = '';
      else delete words.dataset.sound;
    },
  };
}

/**
 * After the scene: the bait-worm fact with its source (a link, new tab), then Start crawling.
 * `onReplay` (the preview link) adds "Watch again".
 */
export function showOpeningFact(shell: Shell, onStart: () => void, onReplay?: () => void): void {
  const src = SOURCES[TEXT.openingFact.source];
  const link = el('a', src.title);
  link.href = src.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(el('span', ' (opens in a new tab)', 'sr-only'));
  const source = el('p', 'Source: ', 'opening-source');
  source.append(link, ` (${src.publisher})`);
  const fact = el('p', shown(TEXT.openingFact), 'opening-fact');
  fact.dataset.source = TEXT.openingFact.source;
  const tip = el('p', shown(TEXT.openingTip), 'opening-fact');
  tip.dataset.source = TEXT.openingTip.source;
  const start = button(shown(TEXT.openingStart), 'play', 'primary', onStart);
  shell.show('opening', shown(TEXT.openingFactTitle), [
    el('h1', shown(TEXT.openingFactTitle), 'screen-title'), fact, tip, source,
    menu(start, ...(onReplay ? [button(shown(TEXT.openingReplay), 'eye', 'secondary', onReplay)] : [])),
  ]);
  // Cleared again by the next screen that is not the opening (main.ts).
  shell.panel.dataset.phase = 'fact';
  start.el.focus();
}
