import { el, button } from './dom';
import { icon } from './icons';
import { shown, type Line } from '../content/text';
import type { LessonStep } from '../content/lessons/lesson';
import type { Beat } from '../eatingFilm/script';

/** What main.ts gives the lesson to play the eating film (src/eatingFilm/) over the whole screen. */
export interface LessonFilm {
  /** Starts the film from the beginning (Replay too); `view` hears where it is each drawn frame. */
  play(view: FilmView): void;
  setPaused(paused: boolean): void;
  /** The forest shows again. */
  stop(): void;
}

/** The lesson's side of the film: main.ts calls `set` each drawn frame and reads `inset`. */
export interface FilmView {
  set(beat: Beat, dark: number, done: boolean): void;
  /** How many pixels at the bottom of the screen the card covers (the shot centres above it). */
  readonly inset: number;
}

/** The film's veil and big part name live on the root, over the scene: gone when the step is. */
export function closeFilm(root: HTMLElement): void {
  for (const e of root.querySelectorAll(':scope > .film-veil, :scope > .film-label')) e.remove();
}

/**
 * The `body` step as a film: the 3D scene fills the screen and the card sits at the bottom as a
 * caption bar. The caption is the beat's fact (each part's name in bold, and big over the scene);
 * Pause and Replay; "Read the whole trip" has every caption as a list, to read at any pace. Once
 * it has played to the end, `onDone` (Next wakes up). Without a film (no WebGL path, tests of the
 * card alone) it is just the list.
 */
export function filmBody(
  root: HTMLElement, step: Extract<LessonStep, { kind: 'body' }>, film: LessonFilm | undefined, onDone: () => void,
): HTMLElement[] {
  const intro = el('p', step.intro, 'lead lesson-question');
  const trip = el('details', '', 'film-trip');
  const list = el('ol', '', 'body-stops');
  const item = (name: string | null, l: Line): HTMLLIElement => {
    const li = el('li', '', 'body-stop');
    if (name) li.append(el('p', name, 'meet-name'));
    li.append(el('p', shown(l), 'lesson-line'));
    return li;
  };
  list.append(item(null, step.outside), ...step.stops.map((s) => item(s.name, s.fact)), item(null, step.midden));
  trip.append(el('summary', 'Read the whole trip'), list);
  if (!film) {
    trip.open = true;
    onDone();
    return [intro, trip];
  }

  closeFilm(root);
  const veil = el('div', '', 'film-veil');
  veil.setAttribute('aria-hidden', 'true');
  const label = el('p', '', 'film-label');
  label.setAttribute('aria-hidden', 'true');
  root.append(veil, label);

  const caption = el('div', '', 'film-caption');
  caption.setAttribute('aria-live', 'polite');
  const name = el('p', '', 'meet-name');
  const fact = el('p', '', 'lesson-line');
  caption.append(name, fact);

  let paused = false;
  const pause = button('Pause', 'pause', 'secondary', () => setPaused(!paused));
  pause.el.classList.add('btn-small');
  const setPaused = (p: boolean): void => {
    paused = p;
    film.setPaused(p);
    pause.setLabel(p ? 'Play' : 'Pause');
    pause.el.querySelector('.btn-icon')?.replaceWith(icon(p ? 'play' : 'pause', 'btn-icon'));
  };
  const replay = button('Replay', 'back', 'secondary', () => {
    setPaused(false);
    pause.el.hidden = false;
    film.play(view);
  });
  replay.el.classList.add('btn-small');
  const controls = el('div', '', 'film-controls');
  controls.append(pause.el, replay.el, trip);

  let beat: Beat | null = null;
  let dark = -1;
  let ended = false;
  const view = {
    inset: 0,
    set(b: Beat, d: number, done: boolean): void {
      if (b !== beat) {
        beat = b;
        const stop = step.stops.find((s) => s.part === b);
        const l = b === 'outside' ? step.outside : b === 'midden' ? step.midden : stop?.fact;
        name.textContent = stop?.name ?? '';
        name.hidden = !stop;
        fact.textContent = l ? shown(l) : '';
        label.textContent = stop?.name ?? '';
        label.hidden = !stop;
      }
      // The black dip between outside and inside (slow: under a second each way, never a flash).
      const dd = Math.round(d * 20) / 20;
      if (dd !== dark) {
        dark = dd;
        veil.style.opacity = String(dd);
      }
      if (done && !ended) {
        ended = true;
        pause.el.hidden = true;
        onDone();
      } else if (!done) ended = false;
    },
  };
  // The card's height, for where the shot centres; kept up to date as the card changes size.
  const bar = el('div', '', 'lesson-film');
  bar.append(caption, controls);
  const measure = (): void => {
    const panel = bar.closest<HTMLElement>('.panel');
    view.inset = panel ? Math.max(0, window.innerHeight - panel.getBoundingClientRect().top) : 0;
  };
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!bar.isConnected) return ro.disconnect();
      measure();
    });
    queueMicrotask(() => {
      const panel = bar.closest<HTMLElement>('.panel');
      if (panel) ro.observe(panel);
      measure();
    });
  }
  // Space pauses and plays (unless a button or link has focus: there Space presses it).
  const onKey = (e: KeyboardEvent): void => {
    if (!bar.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.code !== 'Space' || e.repeat || ended) return;
    if ((e.target as HTMLElement | null)?.closest?.('button, a, input, summary, select, textarea, dialog')) return;
    e.preventDefault();
    setPaused(!paused);
  };
  document.addEventListener('keydown', onKey);
  film.play(view);
  return [intro, bar];
}
