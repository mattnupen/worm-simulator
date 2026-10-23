import './hintCard.css';
import { el } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { TEXT, shown } from '../content/text';

/** A touch screen with no hover (the Action prompt's own test, hud.css): the touch controls line. */
const TOUCH = '(hover: none) and (pointer: coarse)';

/**
 * The crawl card underground (V2 spec 6). On the session's first visit (`card`, for about 12 s
 * once the camera has swung to the cut: BurrowGame.hintShowing) a hint card in place of the crawl
 * card: the controls (the touch line on a touch screen), then the real burrow fact (no "Game
 * choice" line for digging any way: Matt, 2026-10-23). No "look, don't eat" line while playing (Matt, 2026-10-12). It is compact and sits at the top or the bottom, whichever is away from the worm's
 * head (hintPlace.ts). Later, and on later visits, the panel is hidden so the cut stays clear (the
 * Action prompt still says what Space does). Focus rests on the panel, as while crawling, so Space
 * and the arrows press no button.
 */
export function showUnderground(shell: Shell, card: boolean): void {
  const touch = typeof matchMedia === 'function' && matchMedia(TOUCH).matches;
  const hint = el('p', '', 'hint');
  hint.append(icon('drive', 'hint-icon'), el('span', shown(touch ? TEXT.undergroundHintTouch : TEXT.undergroundHint)));
  shell.show('crawl', 'Underground', card
    ? [hint, el('p', shown(TEXT.burrowFact), 'hint-fact')]
    : []);
  if (card) shell.panel.dataset.card = 'hint';
  shell.panel.focus({ preventScroll: true });
  shell.panel.hidden = !card;
}
