import { el } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { TEXT, GAME_CHOICE_PREFIX, shown } from '../content/text';

/**
 * The crawl card underground (V2 spec 6). On the session's first visit (`card`, for about 12 s:
 * BurrowGame.hintShowing) a hint card in place of the crawl card: the controls, then the real
 * burrow fact, then the Game choice line for digging any way (science honesty: the fact first,
 * the game's exaggeration labelled). Later, and on later visits, the panel is hidden so the cut
 * stays clear (the Action prompt still says what Space does). The card sits top left, clear of
 * the Action prompt (bottom right). Focus rests on the panel, as while crawling, so Space and the
 * arrows press no button.
 */
export function showUnderground(shell: Shell, card: boolean): void {
  const hint = el('p', '', 'hint');
  hint.append(icon('drive', 'hint-icon'), el('span', shown(TEXT.undergroundHint)));
  shell.show('crawl', 'Underground', card ? [hint, el('p', shown(TEXT.burrowFact), 'hint-fact'), choiceLine()] : []);
  shell.panel.focus({ preventScroll: true });
  shell.panel.hidden = !card;
}

/** shown(TEXT.burrowChoice), its "Game choice:" label in bold so it stands apart from the fact. */
function choiceLine(): HTMLParagraphElement {
  const text = shown(TEXT.burrowChoice);
  const p = el('p', '', 'hint-note');
  const label = GAME_CHOICE_PREFIX.trimEnd();
  if (text.startsWith(label)) p.append(el('strong', label), text.slice(label.length));
  else p.textContent = text;
  return p;
}
