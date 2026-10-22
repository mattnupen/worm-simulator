import { el } from './dom';
import { icon } from './icons';
import { TEXT, shown } from '../content/text';
import { RHYTHM, inWindow, toTarget, type RhythmState } from '../predators/rhythm';

/**
 * The grip mini-game's panel (V4 spec revision 1), real DOM over the side view: the timing ring (an
 * SVG in the page: a dot, a dashed circle where the ring meets it, and the ring shrinking onto it),
 * "Tap!" while a tap is on time, "Good!" or "Missed" (with "Too early" or "Too late") after each
 * beat, a row of 5 pips for good taps and 3 for misses (filled shapes, read out as "Good taps: 2 of
 * 5"), and one line saying what to do. Words and shapes carry the meaning, never colour alone, and
 * nothing flashes: each word changes at most once a beat. With reduced motion the ring still shrinks
 * (it is the timing), and nothing else moves.
 *
 * update() writes the DOM only when something it shows changes, from strings made at load, so it
 * allocates nothing. `data-to-target` (ms until the ring meets the dot, in 10 ms steps) and
 * `data-phase` are for tests and screenshots.
 */
export interface HuntRing {
  readonly el: HTMLElement;
  /** Shows `r` (the grab's rhythm), or hides the panel (null). */
  update(r: RhythmState | null, touch: boolean): void;
}

const SVGNS = 'http://www.w3.org/2000/svg';
/** The ring's radius (SVG units, a 200 box): as it appears, and where it touches the dot. */
const R_START = 92;
const R_HIT = 30;
const R_DOT = 21;
/** Radii as strings, made once (the ring's r is written only when it changes by a whole unit). */
const R_TEXT = Array.from({ length: R_START + 1 }, (_, i) => String(i));
/** data-to-target in 10 ms steps, from -500 ms to 2000 ms, made once. */
const MS_LO = -50;
const MS_HI = 200;
const MS_TEXT = Array.from({ length: MS_HI - MS_LO + 1 }, (_, i) => String((i + MS_LO) * 10));

function count(line: string, n: number, of: number): string {
  return line.replace('{n}', String(n)).replace('{of}', String(of));
}

function circle(r: number, cls: string): SVGCircleElement {
  const c = document.createElementNS(SVGNS, 'circle');
  c.setAttribute('cx', '100');
  c.setAttribute('cy', '100');
  c.setAttribute('r', String(r));
  c.setAttribute('class', cls);
  return c;
}

function pips(n: number, cls: string): { row: HTMLElement; list: HTMLElement[] } {
  const row = el('span', '', 'hunt-pip-row');
  row.setAttribute('role', 'img');
  const list: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const p = el('span', '', `hunt-pip ${cls}`);
    row.append(p);
    list.push(p);
  }
  return { row, list };
}

export function createHuntRing(): HuntRing {
  const panel = el('div', '', 'hunt-grip');
  panel.hidden = true;
  const title = el('p', shown(TEXT.huntGrabbed), 'hunt-grip-title');

  const ring = el('div', '', 'hunt-ring');
  ring.setAttribute('role', 'img');
  ring.setAttribute('aria-label', shown(TEXT.huntRingLabel));
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('aria-hidden', 'true');
  const guide = circle(R_HIT, 'hunt-ring-guide');
  const dot = circle(R_DOT, 'hunt-ring-dot');
  const shrink = circle(R_START, 'hunt-ring-shrink');
  svg.append(guide, dot, shrink);
  const now = el('span', shown(TEXT.huntTapNow), 'hunt-ring-now');
  now.hidden = true;
  ring.append(svg, now);

  const call = el('p', '', 'hunt-call');
  call.setAttribute('aria-live', 'polite');
  const good = icon('check', 'hunt-call-icon');
  const miss = icon('close', 'hunt-call-icon');
  const callWord = el('strong', '', 'hunt-call-word');
  const callWhy = el('span', '', 'hunt-call-why');
  call.append(good, miss, callWord, callWhy);

  const goods = pips(RHYTHM.goods, 'hunt-pip-good');
  const misses = pips(RHYTHM.misses, 'hunt-pip-miss');
  const rows = el('div', '', 'hunt-pips');
  rows.append(
    el('span', shown(TEXT.huntGoodsRow), 'hunt-pip-label'), goods.row,
    el('span', shown(TEXT.huntMissesRow), 'hunt-pip-label'), misses.row,
  );
  const goodsText = Array.from({ length: RHYTHM.goods + 1 }, (_, n) => count(shown(TEXT.huntGoodsCount), n, RHYTHM.goods));
  const missesText = Array.from({ length: RHYTHM.misses + 1 }, (_, n) => count(shown(TEXT.huntMissesCount), n, RHYTHM.misses));

  const say = el('p', '', 'hunt-say');
  panel.append(title, ring, call, rows, say);

  // What's on screen now, so update() only writes changes.
  let on = false;
  let phase = '';
  let r = -1;
  let ms = 0;
  let nowOn = false;
  let shownCall = -2;
  let g = -1;
  let m = -1;
  let line = '';
  const words = [shown(TEXT.huntGood), shown(TEXT.huntMissed)];
  const whys = ['', shown(TEXT.huntEarly), shown(TEXT.huntLate)];

  function setCall(k: number, s: RhythmState): void {
    // -1 none (lead or ringing), 0 good, 1 too early, 2 too late.
    if (k === shownCall) return;
    shownCall = k;
    call.hidden = k < 0;
    good.hidden = k !== 0;
    miss.hidden = k <= 0;
    callWord.textContent = k < 0 ? '' : words[k === 0 ? 0 : 1];
    callWhy.textContent = k < 0 ? '' : whys[k];
    call.dataset.call = k < 0 ? '' : s.call;
  }

  return {
    el: panel,
    update(s, touch) {
      const show = s !== null;
      if (show !== on) {
        on = show;
        panel.hidden = !show;
      }
      if (!s) return;
      if (s.phase !== phase) {
        phase = s.phase;
        ring.dataset.phase = phase;
        shrink.style.visibility = phase === 'ring' ? 'visible' : 'hidden';
      }
      if (s.phase === 'ring') {
        const to = toTarget(s);
        // Shrinking evenly onto the dot, then a little into it while a late tap still counts.
        const k = to >= 0 ? to / s.shrink : to / RHYTHM.late;
        const rr = Math.max(R_DOT - 6, Math.min(R_START, Math.round(R_HIT + (k >= 0 ? (R_START - R_HIT) * k : 8 * k))));
        if (rr !== r) {
          r = rr;
          shrink.setAttribute('r', R_TEXT[rr]);
        }
        const q = Math.max(MS_LO, Math.min(MS_HI, Math.round(to * 100)));
        if (q !== ms || ring.dataset.toTarget === undefined) {
          ms = q;
          ring.dataset.toTarget = MS_TEXT[q - MS_LO];
        }
      } else if (ring.dataset.toTarget !== undefined) {
        delete ring.dataset.toTarget;
      }
      const n = inWindow(s);
      if (n !== nowOn) {
        nowOn = n;
        now.hidden = !n;
        ring.classList.toggle('is-now', n);
      }
      setCall(s.phase !== 'regrip' ? -1 : s.call === 'good' ? 0 : s.call === 'early' ? 1 : 2, s);
      if (s.goods !== g) {
        g = s.goods;
        for (let i = 0; i < goods.list.length; i++) goods.list[i].classList.toggle('is-on', i < g);
        goods.row.setAttribute('aria-label', goodsText[Math.min(g, RHYTHM.goods)]);
      }
      if (s.misses !== m) {
        m = s.misses;
        for (let i = 0; i < misses.list.length; i++) misses.list[i].classList.toggle('is-on', i < m);
        misses.row.setAttribute('aria-label', missesText[Math.min(m, RHYTHM.misses)]);
      }
      const next = shown(touch ? TEXT.huntTapTouch : TEXT.huntTapKeys);
      if (next !== line) {
        line = next;
        say.textContent = next;
      }
    },
  };
}
