import { el, button } from './dom';
import { icon } from './icons';
import { shown, type Line } from '../content/text';
import type { LessonStep } from '../content/lessons/lesson';
import { LABELS, type Beat } from '../eatingFilm/script';

/** What main.ts gives the lesson to play the eating film (src/eatingFilm/) over the whole screen. */
export interface LessonFilm {
  /** Starts the film from the beginning (Replay too); `view` hears where it is each drawn frame. */
  play(view: FilmView): void;
  setPaused(paused: boolean): void;
  /** Jumps to second `t` (the timeline). */
  seek(t: number): void;
  /** The film's length, in seconds. */
  readonly length: number;
  /** The forest shows again. */
  stop(): void;
}

/** The lesson's side of the film: main.ts calls `set` each drawn frame and reads `inset`. */
export interface FilmView {
  /** `labels`: where each part's label goes on screen (EatingFilm.labels). */
  set(beat: Beat, dark: number, done: boolean, t: number, labels: Float32Array): void;
  /** How many pixels at the bottom of the screen the card covers (the shot centres above it). */
  readonly inset: number;
}

/** The film's veil and part labels live on the root, over the scene: gone when the step is. */
export function closeFilm(root: HTMLElement): void {
  for (const e of root.querySelectorAll(':scope > .film-veil, :scope > .film-parts')) e.remove();
}

const SVG = 'http://www.w3.org/2000/svg';
/** Labels closer than this (px) on one side stack: the next sits a row further out. */
const LABEL_GAP = 8;
const LABEL_ROW = 30;

/**
 * The `body` step as a film: the 3D scene fills the screen and the card sits at the bottom as a
 * caption bar. The caption is the beat's fact (each part's name in bold). Inside the worm, each
 * part in the shot is labelled, with a line to it (the one the caption is about stands out);
 * a timeline (Play/Pause and a slider) to pause, go back or skip ahead (Matt removed the
 * "Read the whole trip" list, 2026-10-23). Once
 * it has played to the end, `onDone` (Next wakes up). Without a film (no WebGL path, tests of the
 * card alone) it is just the list.
 */
export function filmBody(
  root: HTMLElement, step: Extract<LessonStep, { kind: 'body' }>, film: LessonFilm | undefined, onDone: () => void,
): HTMLElement[] {
  const intro = el('p', step.intro, 'lead lesson-question');
  if (!film) {
    // No film (no WebGL path, tests of the card alone): its captions as a list.
    const list = el('ol', '', 'body-stops');
    const item = (name: string | null, l: Line): HTMLLIElement => {
      const li = el('li', '', 'body-stop');
      if (name) li.append(el('p', name, 'meet-name'));
      li.append(el('p', shown(l), 'lesson-line'));
      return li;
    };
    list.append(item(null, step.outside), ...step.stops.map((s) => item(s.name, s.fact)), item(null, step.midden));
    onDone();
    return [intro, list];
  }

  closeFilm(root);
  const veil = el('div', '', 'film-veil');
  veil.setAttribute('aria-hidden', 'true');
  // The part labels: a line from each name to its part (the caption says the same in words).
  const parts = el('div', '', 'film-parts');
  parts.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG, 'svg');
  parts.append(svg);
  const tags = LABELS.map((l) => {
    const line = document.createElementNS(SVG, 'line');
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('r', '4');
    svg.append(line, dot);
    const name = l.part ? step.stops.find((s) => s.part === l.part)?.name ?? l.name : l.name;
    const tag = el('span', name, 'film-part');
    tag.hidden = true;
    parts.append(tag);
    return { line, dot, tag, part: l.part, side: l.side, on: false, w: 0 };
  });
  root.append(veil, parts);
  let current = '';
  const placeLabels = (at: Float32Array): void => {
    // Each side's labels left to right; one too close to the last moves a row further out.
    const ends = [-Infinity, -Infinity, -Infinity];
    const endsLow = [-Infinity, -Infinity, -Infinity];
    tags.forEach((g, i) => {
      const o = i * 5;
      const on = at[o + 4] > 0;
      if (on !== g.on) {
        g.on = on;
        g.tag.hidden = !on;
        g.line.style.display = g.dot.style.display = on ? '' : 'none';
        if (on) g.w = g.tag.offsetWidth;
      }
      if (!on) return;
      const rows = g.side > 0 ? ends : endsLow;
      const left = Math.max(4, Math.min(window.innerWidth - g.w - 4, at[o + 2] - g.w / 2));
      let row = rows.findIndex((end) => left > end + LABEL_GAP);
      if (row < 0) row = rows.length - 1;
      rows[row] = left + g.w;
      // Kept on the shot, above the card.
      const y = Math.max(16, Math.min(window.innerHeight - view.inset - 16, at[o + 3] - g.side * row * LABEL_ROW));
      g.tag.style.transform = `translate(${left}px, ${y}px) translateY(-50%)`;
      g.line.setAttribute('x1', String(at[o + 2]));
      g.line.setAttribute('y1', String(y + g.side * 12));
      g.line.setAttribute('x2', String(at[o]));
      g.line.setAttribute('y2', String(at[o + 1]));
      g.dot.setAttribute('cx', String(at[o]));
      g.dot.setAttribute('cy', String(at[o + 1]));
    });
  };

  const caption = el('div', '', 'film-caption');
  caption.setAttribute('aria-live', 'polite');
  const name = el('p', '', 'meet-name');
  const fact = el('p', '', 'lesson-line');
  caption.append(name, fact);

  // The timeline: one small Play/Pause button (Replay at the end) and a slider to scrub through
  // the film (Matt, 2026-10-23: "a slider timeline, simple and clean"). Dragging holds the film
  // still; it plays on from there once let go, unless it was paused.
  let paused = false;
  let ended = false;
  let scrubbing = false;
  const toggle = button('Pause', 'pause', 'secondary', () => {
    if (ended) {
      setPaused(false);
      film.play(view);
    } else setPaused(!paused);
  });
  toggle.el.classList.add('film-toggle');
  const showToggle = (): void => {
    const [text, mark] = ended ? ['Replay', 'replay'] as const : paused ? ['Play', 'play'] as const : ['Pause', 'pause'] as const;
    toggle.setLabel(text);
    toggle.el.querySelector('.btn-icon')?.replaceWith(icon(mark, 'btn-icon'));
  };
  const setPaused = (p: boolean): void => {
    paused = p;
    film.setPaused(p || scrubbing);
    showToggle();
  };
  const slider = el('input', '', 'film-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(film.length);
  slider.step = '0.1';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Timeline');
  const fill = (t: number): void => slider.style.setProperty('--p', `${(t / film.length) * 100}%`);
  slider.addEventListener('input', () => {
    const t = Number(slider.value);
    film.seek(t);
    fill(t);
  });
  const hold = (on: boolean): void => {
    scrubbing = on;
    film.setPaused(paused || on);
  };
  slider.addEventListener('pointerdown', () => hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'change'] as const) slider.addEventListener(ev, () => hold(false));
  const timeline = el('div', '', 'film-timeline');
  timeline.append(toggle.el, slider);
  const controls = el('div', '', 'film-controls');
  controls.append(timeline);

  let beat: Beat | null = null;
  let dark = -1;
  let shownT = -1;
  let spoken = -1;
  const view = {
    inset: 0,
    set(b: Beat, d: number, done: boolean, t: number, at: Float32Array): void {
      if (b !== beat) {
        beat = b;
        const stop = step.stops.find((s) => s.part === b);
        const l = b === 'outside' ? step.outside : b === 'midden' ? step.midden : stop?.fact;
        name.textContent = stop?.name ?? '';
        name.hidden = !stop;
        fact.textContent = l ? shown(l) : '';
        if (l?.kind === 'fact') fact.dataset.source = l.source;
        current = stop?.name ?? '';
        for (const g of tags) g.tag.classList.toggle('now', g.part === b);
      }
      placeLabels(at);
      // The black dip between outside and inside (slow: under a second each way, never a flash).
      const dd = Math.round(d * 20) / 20;
      if (dd !== dark) {
        dark = dd;
        veil.style.opacity = String(dd);
      }
      const tt = Math.round(t * 10) / 10;
      if (tt !== shownT && !scrubbing) {
        shownT = tt;
        slider.value = String(tt);
        fill(tt);
      }
      const sec = Math.floor(t);
      if (sec !== spoken) {
        spoken = sec;
        slider.setAttribute('aria-valuetext', `${sec} of ${Math.round(film.length)} seconds${current ? `: ${current}` : ''}`);
      }
      if (done !== ended) {
        ended = done;
        showToggle();
        if (done) onDone();
      }
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
