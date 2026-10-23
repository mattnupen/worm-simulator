import './nest.css';
import { el, button } from './dom';
import type { Shell } from './shell';
import { SOURCES } from '../content/sources';
import { TEXT, shown, type TextKey } from '../content/text';

export interface NestOverlay {
  /** This frame's caption (null: none) and darkness (0..1). Writes the page only when they change. */
  set(caption: TextKey | null, dark: number): void;
  /** The scene is over: the fact card, over the dark, with focus on its button. */
  showCard(): void;
}

/**
 * Over the nest scene (V4, src/predators/nestScene.ts): captions at the top like the opening's
 * (white on see-through black bars), the fade to dark, and at the end one fact card. No Skip button
 * (like the opening): Esc, Enter (main.ts) or a tap anywhere skips to the card, and its button
 * goes on. The panel is the shell's aria-live region, so captions and the card are read out.
 */
export function showNestScene(shell: Shell, onSkip: () => void, onContinue: () => void): NestOverlay {
  const caption = el('p', '', 'opening-caption nest-caption');
  const words = el('span', '', 'opening-words');
  words.dataset.sound = '';
  caption.append(words);
  const dark = el('div', '', 'nest-dark');
  dark.setAttribute('aria-hidden', 'true');
  shell.show('nest', shown(TEXT.nestLabel), [dark, caption]);
  const panel = shell.panel;
  delete panel.dataset.phase;
  // A tap or click anywhere skips (a touch screen has no Esc or Enter).
  const tap = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    e.preventDefault();
    onSkip();
  };
  panel.addEventListener('pointerdown', tap);
  let lastCaption: TextKey | null | undefined;
  let lastDark = -1;
  return {
    set(c, d) {
      if (c !== lastCaption) {
        lastCaption = c;
        words.textContent = c ? shown(TEXT[c]) : '';
      }
      // Two-decimal steps: smooth to the eye, and a style write only when it shows.
      const k = Math.round(d * 100) / 100;
      if (k !== lastDark) {
        lastDark = k;
        dark.style.opacity = String(k);
      }
    },
    showCard() {
      panel.removeEventListener('pointerdown', tap);
      panel.dataset.phase = 'card';
      dark.style.opacity = '1';
      words.textContent = '';
      panel.append(factCard(onContinue));
      panel.querySelector<HTMLButtonElement>('.nest-card .btn')?.focus();
    },
  };
}

/** The fact card: what the scene showed, and its source. */
function factCard(onContinue: () => void): HTMLElement {
  const card = el('div', '', 'nest-card');
  const fact = TEXT.nestFact;
  const factP = el('p', shown(fact), 'nest-fact');
  factP.dataset.source = fact.source;
  const source = SOURCES[fact.source];
  const from = el('p', `${shown(TEXT.nestSource)} `, 'nest-source');
  const link = el('a', source.short ?? source.publisher);
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(el('span', ' (opens in a new tab)', 'sr-only'));
  from.append(link);
  card.append(
    el('h1', shown(TEXT.nestTitle), 'screen-title'),
    factP,
    from,
    button(shown(TEXT.nestContinue), 'play', 'primary', onContinue).el,
  );
  return card;
}
