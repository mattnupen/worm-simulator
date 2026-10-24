import { el } from './dom';
import { icon } from './icons';
import { TEXT, shown } from '../content/text';

/**
 * The virtual worm: the 3D anatomy model (src/anatomy/, `?anatomy=1`), opened in a new tab from
 * this same page, so it works in every frozen version and the game keeps its place. `view` opens
 * one of the model's views (src/anatomy/views.ts), such as `gut` for the eating lesson.
 */
export function virtualWormHref(view?: string): string {
  return `?anatomy=1${view ? `&view=${encodeURIComponent(view)}` : ''}`;
}

/** A link styled as the game's buttons: its icon and the words "Virtual worm". */
export function virtualWormLink(className: string, view?: string): HTMLAnchorElement {
  const a = el('a', '', className);
  a.href = virtualWormHref(view);
  a.target = '_blank';
  a.rel = 'noopener';
  a.append(icon('virtualWorm', 'btn-icon'), el('span', shown(TEXT.virtualWorm), 'btn-label'));
  return a;
}

