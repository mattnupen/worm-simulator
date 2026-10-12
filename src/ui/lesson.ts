import './lesson.css';
import { el, button, menu, type Button } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { SOURCES } from '../content/sources';
import { GAME_CHOICE_PREFIX, shown, type Line } from '../content/text';
import type { Cue, Lesson, LessonStep, Photo } from '../content/lessons/lesson';
import { PHOTO_URLS } from '../content/lessons/photos';

export interface LessonActions {
  /** The last step's "Start crawling". */
  onCrawl(): void;
  /** "Back to start" (any step), or Esc (main.ts). */
  onStart(): void;
  /** The player reached the last step: the lesson counts as finished. */
  onFinish(): void;
}

/**
 * The in-game lesson (content/lessons/lesson.ts): one parchment card per step over the live
 * forest, with Back and Next. Interactive steps (predict, sense, sort) show Next once answered;
 * nothing is graded and nothing is stored but "finished". Focus moves to each step's heading so a
 * screen reader reads it, and the panel is aria-live like every other card. A `sense` step plays
 * its cue on a full-screen layer under the card (no flashing: one slow shadow, or thumps under
 * 3 a second; a still picture under reduced motion), and its words say what happened.
 *
 * A `sense` step with a `scene` opens like a film shot: the card shrinks to the scene's words, black
 * bars close in at the top and bottom, and the cue plays across the open forest. When it ends (at
 * once under reduced motion) the question appears in the same card. Nothing is taken away, so
 * there is nothing to catch in time; "Play it again" replays it.
 */
export function showLesson(shell: Shell, lesson: Lesson, a: LessonActions): void {
  const cue = cueLayer(shell.root);
  const answered = new Set<number>();
  /** Scene steps already watched: going Back to one shows its question straight away. */
  const watched = new Set<number>();
  let at = 0;
  let sceneTimer = 0;

  const go = (i: number): void => {
    at = i;
    stopSpeaking();
    draw();
  };

  function draw(): void {
    clearTimeout(sceneTimer);
    const step = lesson.steps[at];
    const last = at === lesson.steps.length - 1;
    if (last) a.onFinish();
    const heading = el('h1', step.title, 'screen-title lesson-title');
    heading.tabIndex = -1;
    const nav: Button[] = [];
    const next = button(last ? 'Start crawling' : 'Next', 'play', 'primary', () => (last ? leave(a.onCrawl) : go(at + 1)));
    const body = stepBody(step, at, answered, () => {
      // First answer on this step: Next appears (focus stays put, so the reveal can be read).
      answered.add(at);
      next.el.hidden = false;
      // The reveal sits just above Next: bring both into view on a short screen.
      next.el.scrollIntoView?.({ block: 'nearest' });
    }, cue);
    next.el.hidden = !last && interactive(step) && !answered.has(at);
    nav.push(next);
    if (at > 0) nav.push(button('Back', 'back', 'secondary', () => go(at - 1)));
    const voice = localVoice();
    const tools = el('div', '', 'lesson-tools');
    if (voice) {
      const read = button('Read aloud', 'speaker', 'secondary', () => speak(voice, readText(step, answered.has(at))));
      read.el.classList.add('btn-small');
      tools.append(read.el);
    }
    const exit = button('Back to start', 'home', 'secondary', () => leave(a.onStart));
    exit.el.classList.add('btn-small');
    tools.append(exit.el);

    const navMenu = menu(...nav);
    shell.show('lesson', `Lesson: ${lesson.title}`, [
      progress(lesson, at),
      heading,
      ...body,
      navMenu,
      tools,
    ]);
    if (step.kind === 'sense') cue.play(step.cue); else cue.clear();
    if (step.kind === 'sense' && step.scene && !watched.has(at)) {
      // Watch first: only the scene and the cue's words show, then the question joins them.
      const panel = heading.closest<HTMLElement>('.panel');
      const later = body.slice(2);
      // Only what shows now (the reveal stays hidden until a guess).
      const hideDuring = [...later, navMenu].filter((e) => !e.hidden);
      for (const e of hideDuring) e.hidden = true;
      panel?.setAttribute('data-phase', 'watch');
      const here = at;
      sceneTimer = window.setTimeout(() => {
        watched.add(here);
        panel?.removeAttribute('data-phase');
        for (const e of hideDuring) e.hidden = false;
        // The cue's words stay; focus moves to the question so a screen reader reads it next.
        const q = later.find((e) => e.classList.contains('lesson-question'));
        if (q) {
          q.tabIndex = -1;
          q.focus({ preventScroll: true });
          q.scrollIntoView?.({ block: 'nearest' });
        }
      }, reducedMotion() ? 0 : cueMs(step.cue));
    } else {
      heading.closest<HTMLElement>('.panel')?.removeAttribute('data-phase');
    }
    heading.focus({ preventScroll: true });
  }

  /** main.ts closes the lesson (closeLesson) on the screen change. */
  const leave = (then: () => void): void => { clearTimeout(sceneTimer); then(); };

  draw();
}

/** Leaving the lesson (main.ts, on any screen change): the cue layer clears and reading stops. */
export function closeLesson(root: HTMLElement): void {
  stopSpeaking();
  root.querySelector<HTMLElement>('.panel[data-phase]')?.removeAttribute('data-phase');
  const layer = root.querySelector<HTMLElement>(':scope > .cue');
  if (layer) delete layer.dataset.cue;
}

function interactive(step: LessonStep): boolean {
  return step.kind === 'predict' || step.kind === 'sense' || step.kind === 'sort';
}

/** "Learn · Step 2 of 6" in words, with leaf pips beside it (decorative). */
function progress(lesson: Lesson, at: number): HTMLElement {
  const row = el('div', '', 'lesson-progress');
  row.append(el('p', `Learn · Step ${at + 1} of ${lesson.steps.length}`, 'eyebrow'));
  const pips = el('div', '', 'pips');
  pips.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < lesson.steps.length; i++) {
    pips.append(el('span', '', i < at ? 'pip done' : i === at ? 'pip here' : 'pip'));
  }
  row.append(pips);
  return row;
}

function stepBody(
  step: LessonStep, at: number, answered: Set<number>, onAnswer: () => void, cue: CueLayer,
): HTMLElement[] {
  switch (step.kind) {
    case 'story':
      return [...step.lines.map((l) => line(l, 'lead')), ...(step.photo ? [photo(step.photo)] : [])];
    case 'predict':
      return [
        ...(step.photo ? [photo(step.photo)] : []),
        ...choose(step.question, step.options, step.reveal, answered.has(at), onAnswer),
      ];
    case 'sense': {
      const scene = el('p', step.scene ?? '', 'lead scene-line');
      const caption = el('p', '', 'cue-caption');
      caption.append(icon(step.cue === 'shadow' ? 'shadow' : 'thump', 'cue-icon'), el('span', step.cueText));
      const again = button('Play it again', 'play', 'secondary', () => cue.play(step.cue));
      again.el.classList.add('btn-small');
      const asked = choose(step.question, step.options, step.reveal, answered.has(at), onAnswer, step.photo);
      // The first two are the scene's words (shown while it plays); the rest join after.
      return step.scene ? [scene, caption, again.el, ...asked] : [caption, again.el, ...asked];
    }
    case 'sort':
      return sort(step, answered.has(at), onAnswer);
    case 'mission': {
      const notice = el('p', '', 'mission-line');
      notice.append(icon('eye', 'mission-icon'), el('span', shown(step.notice)));
      const reminder = el('p', '', 'mission-line');
      reminder.append(icon('form', 'mission-icon'), el('span', shown(step.reminder)));
      return [notice, reminder];
    }
  }
}

/** A question with option buttons. Any pick reveals what scientists found; the pick stays marked. */
function choose(
  question: string, options: readonly string[], reveal: readonly Line[], already: boolean, onAnswer: () => void,
  shot?: Photo,
): HTMLElement[] {
  const q = el('p', question, 'lead lesson-question');
  const list = el('div', '', 'lesson-options');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', question);
  const found = el('div', '', 'reveal');
  found.hidden = !already;
  found.append(el('p', 'What scientists found', 'reveal-head'), ...(shot ? [photo(shot)] : []), ...reveal.map((l) => line(l)));
  for (const o of options) {
    const b = button(o, 'leaf', 'secondary', () => {
      for (const other of list.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
      b.el.setAttribute('aria-pressed', 'true');
      b.setLabel(`${o} (your guess)`);
      found.hidden = false;
      onAnswer();
    });
    b.el.setAttribute('aria-pressed', 'false');
    b.el.classList.add('option');
    list.append(b.el);
  }
  return [q, list, found];
}

/** Each card gets two buttons, one per group; once placed it says where it belongs and why. */
function sort(step: Extract<LessonStep, { kind: 'sort' }>, already: boolean, onAnswer: () => void): HTMLElement[] {
  const q = el('p', step.question, 'lead lesson-question');
  const list = el('ul', '', 'sort-list');
  let placed = already ? step.cards.length : 0;
  for (const c of step.cards) {
    const li = el('li', '', 'sort-card');
    const name = el('p', c.name, 'sort-name');
    const picks = el('div', '', 'sort-picks');
    const result = el('div', '', 'sort-result');
    const place = (pick: 0 | 1): void => {
      picks.hidden = true;
      result.replaceChildren(
        el('p', `${pick === c.group ? 'Yes' : 'Look again'}: it belongs in "${step.groups[c.group]}".`, 'sort-verdict'),
        line(c.fact),
      );
      result.prepend(icon(pick === c.group ? 'check' : 'turn', 'sort-icon'));
      result.hidden = false;
      if (++placed === step.cards.length) onAnswer();
    };
    step.groups.forEach((g, gi) => {
      const b = button(g, gi === 0 ? 'up' : 'down', 'secondary', () => place(gi as 0 | 1));
      b.el.classList.add('btn-small');
      b.el.setAttribute('aria-label', `${c.name}: ${g}`);
      picks.append(b.el);
    });
    if (already) {
      picks.hidden = true;
      result.append(el('p', `It belongs in "${step.groups[c.group]}".`, 'sort-verdict'), line(c.fact));
    } else {
      result.hidden = true;
    }
    li.append(...(c.photo ? [photo(c.photo)] : []), name, picks, result);
    list.append(li);
  }
  return [q, list];
}

/** One line as the player sees it; a fact names its source underneath, a game choice is labelled. */
function line(l: Line, className = ''): HTMLElement {
  const p = el('p', '', `lesson-line ${className}`.trim());
  if (l.kind === 'gameChoice') p.append(el('strong', GAME_CHOICE_PREFIX.trimEnd()), ' ', l.text);
  else p.textContent = shown(l);
  if (l.kind !== 'fact') return p;
  const wrap = el('div', '', 'fact');
  wrap.append(p, el('p', `Source: ${SOURCES[l.source].publisher}`, 'source'));
  return wrap;
}

/** A real photo with its name and credit underneath (the license asks for the credit). */
function photo(p: Photo): HTMLElement {
  const fig = el('figure', '', 'lesson-photo');
  const img = document.createElement('img');
  img.src = PHOTO_URLS[p.file];
  img.alt = p.alt;
  img.decoding = 'async';
  const cap = el('figcaption', '');
  cap.append(el('span', p.name, 'photo-name'), el('span', p.credit, 'photo-credit'));
  fig.append(img, cap);
  return fig;
}

// ---------- The cue layer ----------

interface CueLayer { play(c: Cue): void; clear(): void }

/** One full-screen layer under the card. play() restarts its animation; clear() hides it. */
function cueLayer(root: HTMLElement): CueLayer {
  let layer = root.querySelector<HTMLDivElement>(':scope > .cue');
  if (!layer) {
    layer = el('div', '', 'cue');
    layer.setAttribute('aria-hidden', 'true');
    layer.append(el('div', '', 'cue-shadow'), el('div', '', 'cue-ring'), el('div', '', 'cue-ring'), el('div', '', 'cue-ring'));
    const robin = el('div', '', 'cue-robin');
    robin.innerHTML = ROBIN_SVG;
    layer.append(robin);
    root.append(layer);
  }
  const l = layer;
  return {
    play(c) {
      delete l.dataset.cue;
      void l.offsetWidth; // restart the CSS animation
      l.dataset.cue = c;
    },
    clear() { delete l.dataset.cue; },
  };
}

/** How long each cue plays (lesson.css), so a scene's question waits for its end. */
function cueMs(c: Cue): number {
  return c === 'robin' ? 6200 : c === 'shadow' ? 3400 : 2800;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The robin as the worm sees it: a game-drawn side view (in-game art, not a teaching picture; the
 * real photo comes with the reveal). The head is its own group so it can tip to one side.
 */
const ROBIN_SVG = `<svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 108 L2 92 L8 104 L0 112 L34 122 Z" fill="#2b2622"/>
  <ellipse cx="96" cy="118" rx="66" ry="46" fill="#3a3430"/>
  <path d="M120 84 C160 92 172 128 150 156 C132 170 104 166 92 152 C116 140 126 112 120 84 Z" fill="#c8612a"/>
  <path d="M52 96 C78 82 110 86 128 104 C104 104 74 110 52 96 Z" fill="#4a423c"/>
  <path d="M98 160 L94 194 M94 194 L84 198 M94 194 L104 198 M122 158 L126 194 M126 194 L116 198 M126 194 L136 198"
    stroke="#8a6a3a" stroke-width="5" stroke-linecap="round" fill="none"/>
  <g class="robin-head">
    <circle cx="146" cy="66" r="30" fill="#2b2622"/>
    <path d="M172 60 L208 70 L172 76 Z" fill="#e8b23a"/>
    <circle cx="156" cy="60" r="7" fill="#f6f1e6"/>
    <circle cx="157" cy="60" r="3.6" fill="#0d0b0a"/>
  </g>
</svg>`;

// ---------- Read aloud ----------

/**
 * An English voice that runs on the device (localService), or null. Network voices are never
 * used, so reading aloud sends nothing anywhere (no network at runtime, CLAUDE.md). The button only
 * appears when such a voice exists; voices can load late, so a later step may show it.
 */
function localVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  return speechSynthesis.getVoices().find((v) => v.localService && v.lang.startsWith('en')) ?? null;
}

function speak(voice: SpeechSynthesisVoice, text: string): void {
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** The step's words in reading order; once answered, what scientists found too. */
function readText(step: LessonStep, answered: boolean): string {
  const parts: string[] = [step.title];
  switch (step.kind) {
    case 'story': parts.push(...step.lines.map(shown)); break;
    case 'sense': parts.push(...(step.scene ? [step.scene] : []), step.cueText);
    // falls through
    case 'predict':
      parts.push(step.question, ...step.options);
      if (answered) parts.push('What scientists found', ...step.reveal.map(shown));
      break;
    case 'sort':
      parts.push(step.question, ...step.cards.map((c) => (answered ? `${c.name}. ${shown(c.fact)}` : c.name)));
      break;
    case 'mission': parts.push(shown(step.notice), shown(step.reminder)); break;
  }
  return parts.join('. ');
}
