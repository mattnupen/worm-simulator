import './lesson.css';
import { el, button, menu, type Button } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { SOURCES, sourceName } from '../content/sources';
import { GAME_CHOICE_PREFIX, shown, type Line } from '../content/text';
import type { Cue, Lesson, LessonStep, More, Photo } from '../content/lessons/lesson';
import { PHOTO_URLS } from '../content/lessons/photos';
import { playCueSound, setSoundEnabled, soundEnabled, stopCueSound } from './lessonSound';

/**
 * Whether a lesson may show links that open a page in a new browser tab (sources and "Tell me
 * more" videos). Off: the game shows no links at all ("Canvas holds all links", CLAUDE.md). Matt
 * decides; the game itself never loads anything either way.
 */
export const LESSON_LINKS = false;

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
 * forest, with Back and Next. Interactive steps (predict, sense, meet) show Next once answered;
 * nothing is graded and nothing is stored but "finished". Focus moves to each step's heading so a
 * screen reader reads it, and the panel is aria-live like every other card.
 *
 * A `sense` step plays like a film shot: the card fades out, black bars close in at the top and
 * bottom, the cue plays over the open forest with its sound, and the scene's words show as
 * captions in the bottom bar. Then the card fades back with the question. "Skip" ends it at once,
 * and "Play it again" replays it. No flashing: one slow shadow, or thumps under 3 a second. Under
 * reduced motion the card stays and the cue is a still picture.
 *
 * Questions are real radio buttons (like the Graphics menu). Once a guess is in, the option
 * scientists found is marked "Correct", with a tick, and the guess "Your guess" (never by colour
 * alone). Photos open bigger when tapped; "Tell me more" opens a panel with more to read.
 */
export function showLesson(shell: Shell, lesson: Lesson, a: LessonActions): void {
  const cue = cueLayer(shell.root);
  const reader = readAloud();
  const answered = new Set<number>();
  /** Each question's pick, so Back shows it again. */
  const picks = new Map<number, number>();
  /** Each meet step's opened cards. */
  const opened = new Map<number, Set<number>>();
  /** Sense steps already watched: going Back to one shows its question straight away. */
  const watched = new Set<number>();
  let at = 0;
  let sceneTimer = 0;
  /** The step whose scene is playing, so its end can focus that step's question. */
  let watchedAt = -1;

  const go = (i: number): void => {
    at = i;
    draw();
  };

  function draw(): void {
    endScene();
    reader.stop();
    const step = lesson.steps[at];
    const last = at === lesson.steps.length - 1;
    if (last) a.onFinish();
    const heading = el('h1', step.title, 'screen-title lesson-title');
    heading.tabIndex = -1;
    readable(heading);
    const next = button(last ? 'Start crawling' : 'Next', 'play', 'primary', () => (last ? leave(a.onCrawl) : go(at + 1)));
    const here = at;
    const moreBtn = step.kind !== 'mission' && step.more ? moreButton(shell.root, step.more) : null;
    const onAnswer = (): void => {
      // First answer on this step: Next (and Tell me more) appear. Focus stays put, so the
      // reveal can be read.
      if (answered.has(here)) return;
      answered.add(here);
      next.el.hidden = false;
      if (moreBtn) moreBtn.hidden = false;
      next.el.scrollIntoView?.({ block: 'nearest' });
    };
    const ctx: BodyCtx = {
      root: shell.root, at, onAnswer, replay: () => startScene(true),
      picks, opened: opened.get(at) ?? new Set(), answered: answered.has(at),
    };
    opened.set(at, ctx.opened);
    const body = stepBody(step, ctx);
    const waits = !last && interactive(step) && !answered.has(at);
    next.el.hidden = waits;
    if (moreBtn) moreBtn.hidden = waits;
    const nav: Button[] = [next];
    if (at > 0) nav.push(button('Back', 'back', 'secondary', () => go(at - 1)));

    const tools = el('div', '', 'lesson-tools');
    if (reader.available()) {
      const read = button('Read aloud', 'speaker', 'secondary', () => reader.toggle(heading.closest('.panel'), read));
      read.el.classList.add('btn-small');
      tools.append(read.el);
    }
    if (step.kind === 'sense') {
      const snd = button(soundEnabled() ? 'Sound on' : 'Sound off', soundEnabled() ? 'speaker' : 'mute', 'secondary', () => {
        setSoundEnabled(!soundEnabled());
        snd.setLabel(soundEnabled() ? 'Sound on' : 'Sound off');
        snd.el.querySelector('.btn-icon')?.replaceWith(icon(soundEnabled() ? 'speaker' : 'mute', 'btn-icon'));
        snd.el.setAttribute('aria-pressed', String(soundEnabled()));
      });
      snd.el.setAttribute('aria-pressed', String(soundEnabled()));
      snd.el.classList.add('btn-small');
      tools.append(snd.el);
    }
    const exit = button('Back to start', 'home', 'secondary', () => leave(a.onStart));
    exit.el.classList.add('btn-small');
    tools.append(exit.el);

    shell.show('lesson', `Lesson: ${lesson.title}`, [
      progress(lesson, at),
      heading,
      ...body,
      ...(moreBtn ? [moreBtn] : []),
      menu(...nav),
      tools,
    ]);
    if (step.kind === 'sense') startScene(!watched.has(at));
    else cue.clear();
    if (!(step.kind === 'sense' && cue.watching())) heading.focus({ preventScroll: true });
  }

  /**
   * Plays the step's cue. As a scene (`watch`), the card fades out while it plays and comes back
   * when it ends; otherwise (Back to a watched step, or reduced motion) it plays beside the card.
   */
  function startScene(watch: boolean): void {
    const step = lesson.steps[at];
    if (step.kind !== 'sense') return;
    endScene();
    playCueSound(step.cue);
    const asScene = watch && !reducedMotion();
    cue.play(step.cue, asScene ? captions(step) : null, () => endScene());
    if (!asScene) {
      watched.add(at);
      return;
    }
    const here = at;
    panel()?.setAttribute('data-phase', 'watch');
    sceneTimer = window.setTimeout(() => endScene(), cueMs(step.cue));
    // While the card is hidden, the caption bar holds focus (its Skip button).
    cue.focusSkip();
    watchedAt = here;
  }

  /** The scene is over (or skipped): the card fades back and focus goes to the question. */
  function endScene(): void {
    clearTimeout(sceneTimer);
    const wasWatching = cue.watching();
    cue.endWatch();
    const p = panel();
    if (!p?.hasAttribute('data-phase')) return;
    p.removeAttribute('data-phase');
    if (wasWatching && watchedAt === at) {
      watched.add(at);
      const q = p.querySelector<HTMLElement>('.lesson-question');
      if (q) {
        q.tabIndex = -1;
        q.focus({ preventScroll: true });
        q.scrollIntoView?.({ block: 'nearest' });
      }
    }
  }

  const panel = (): HTMLElement | null => shell.root.querySelector<HTMLElement>('.panel[data-state="lesson"]');

  /** main.ts closes the lesson (closeLesson) on the screen change. */
  const leave = (then: () => void): void => {
    clearTimeout(sceneTimer);
    reader.stop();
    then();
  };

  draw();
}

/** Leaving the lesson (main.ts, on any screen change): cues, sound, reading and panels stop. */
export function closeLesson(root: HTMLElement): void {
  stopSpeaking();
  stopCueSound();
  root.querySelector<HTMLElement>('.panel[data-phase]')?.removeAttribute('data-phase');
  for (const d of root.querySelectorAll<HTMLDialogElement>('dialog.lesson-dialog')) d.remove();
  const layer = root.querySelector<HTMLElement>(':scope > .cue');
  if (layer) {
    delete layer.dataset.cue;
    delete layer.dataset.watch;
  }
  root.querySelector<HTMLElement>(':scope > .cue-captions')?.setAttribute('hidden', '');
}

function interactive(step: LessonStep): boolean {
  return step.kind === 'predict' || step.kind === 'sense' || step.kind === 'meet';
}

/** Leaf pips for the steps; the words ("Step 2 of 8") are for screen readers only. */
function progress(lesson: Lesson, at: number): HTMLElement {
  const row = el('div', '', 'lesson-progress');
  row.append(el('p', `Step ${at + 1} of ${lesson.steps.length}`, 'sr-only'));
  const pips = el('div', '', 'pips');
  pips.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < lesson.steps.length; i++) {
    pips.append(el('span', '', i < at ? 'pip done' : i === at ? 'pip here' : 'pip'));
  }
  row.append(pips);
  return row;
}

interface BodyCtx {
  readonly root: HTMLElement;
  readonly at: number;
  readonly onAnswer: () => void;
  readonly replay: () => void;
  readonly picks: Map<number, number>;
  readonly opened: Set<number>;
  readonly answered: boolean;
}

function stepBody(step: LessonStep, c: BodyCtx): HTMLElement[] {
  switch (step.kind) {
    case 'story':
      return [...step.lines.map((l) => line(l, 'lead')), ...(step.photo ? [photo(c.root, step.photo)] : [])];
    case 'predict':
      return [
        ...(step.photo ? [photo(c.root, step.photo)] : []),
        ...choose(step, c),
      ];
    case 'sense': {
      const out: HTMLElement[] = [];
      if (step.scene) out.push(readable(el('p', step.scene, 'lead scene-line')));
      const caption = el('p', '', 'cue-caption');
      caption.append(icon(step.cue === 'shadow' ? 'shadow' : 'thump', 'cue-icon'), readable(el('span', step.cueText)));
      const again = button('Play it again', 'play', 'secondary', c.replay);
      again.el.classList.add('btn-small');
      out.push(caption, again.el, ...choose(step, c));
      return out;
    }
    case 'meet':
      return meet(step, c);
    case 'mission': {
      const notice = el('p', '', 'mission-line');
      notice.append(icon('eye', 'mission-icon'), readable(el('span', shown(step.notice))));
      const reminder = el('p', '', 'mission-line');
      reminder.append(icon('form', 'mission-icon'), readable(el('span', shown(step.reminder))));
      return [notice, reminder];
    }
  }
}

/**
 * A question as a set of radio buttons. Any pick reveals what scientists found; then the option
 * scientists found is marked "Correct" and the pick "Your guess". A new pick moves "Your guess".
 */
function choose(step: Extract<LessonStep, { kind: 'predict' | 'sense' }>, c: BodyCtx): HTMLElement[] {
  const set = el('fieldset', '', 'choices lesson-choices');
  const legend = el('legend', step.question, 'lead lesson-question');
  readable(legend);
  set.append(legend);
  const found = el('div', '', 'reveal');
  const head = readable(el('p', 'What scientists found', 'reveal-head'));
  found.append(head, ...(step.kind === 'sense' && step.photo ? [photo(c.root, step.photo)] : []), ...step.reveal.map((l) => line(l)));
  const labels: HTMLLabelElement[] = [];
  const mark = (pick: number): void => {
    labels.forEach((lab, i) => {
      const tags = lab.querySelector('.choice-tags') as HTMLElement;
      tags.replaceChildren();
      if (i === step.answer) {
        const t = el('span', '', 'choice-tag correct');
        t.append(icon('check', 'tag-icon'), el('span', 'Correct'));
        tags.append(t);
      }
      if (i === pick) tags.append(el('span', 'Your guess', 'choice-tag guess'));
    });
    found.hidden = false;
  };
  step.options.forEach((o, i) => {
    const lab = el('label', '', 'choice');
    const input = el('input');
    input.type = 'radio';
    input.name = `lesson-q-${c.at}`;
    input.value = String(i);
    input.addEventListener('change', () => {
      c.picks.set(c.at, i);
      mark(i);
      c.onAnswer();
    });
    const words = el('span', '', 'choice-words');
    words.append(readable(el('span', o, 'choice-name')), el('span', '', 'choice-tags'));
    lab.append(input, words);
    labels.push(lab);
    set.append(lab);
  });
  const pick = c.picks.get(c.at);
  if (pick !== undefined) {
    (labels[pick].querySelector('input') as HTMLInputElement).checked = true;
    mark(pick);
  } else {
    found.hidden = true;
  }
  return [set, found];
}

/** Photo cards: tap "Find out" on each to read its fact. Next shows once every card is open. */
function meet(step: Extract<LessonStep, { kind: 'meet' }>, c: BodyCtx): HTMLElement[] {
  const intro = readable(el('p', step.intro, 'lead lesson-question'));
  const list = el('ul', '', 'meet-list');
  step.cards.forEach((card, i) => {
    const li = el('li', '', 'meet-card');
    const name = readable(el('p', card.name, 'meet-name'));
    const fact = line(card.fact);
    const open = (): void => {
      c.opened.add(i);
      find.el.hidden = true;
      fact.hidden = false;
      if (c.opened.size === step.cards.length) c.onAnswer();
    };
    const find = button('Find out', 'leaf', 'secondary', open);
    find.el.classList.add('btn-small');
    find.el.setAttribute('aria-label', `Find out: ${card.name}`);
    const isOpen = c.opened.has(i);
    find.el.hidden = isOpen;
    fact.hidden = !isOpen;
    li.append(photo(c.root, card.photo, true), name, find.el, fact);
    list.append(li);
  });
  return [intro, list];
}

/** One line as the player sees it; a fact names its source underneath, a game choice is labelled. */
function line(l: Line, className = ''): HTMLElement {
  const p = el('p', '', `lesson-line ${className}`.trim());
  if (l.kind === 'gameChoice') p.append(el('strong', GAME_CHOICE_PREFIX.trimEnd()), ' ', l.text);
  else p.textContent = shown(l);
  readable(p);
  if (l.kind !== 'fact') return p;
  const wrap = el('div', '', 'fact');
  const src = el('p', '', 'source');
  src.append(el('span', 'Source: ', 'sr-only'));
  if (LESSON_LINKS) {
    const link = el('a', sourceName(l.source));
    link.href = SOURCES[l.source].url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(el('span', ' (opens in a new tab)', 'sr-only'));
    src.append(link);
  } else {
    src.append(sourceName(l.source));
  }
  wrap.append(p, src);
  return wrap;
}

/**
 * A real photo with its credit underneath (the license asks for the credit). Tapping it opens a
 * bigger view. `compact` leaves the name off (a card that already shows it).
 */
function photo(root: HTMLElement, p: Photo, compact = false): HTMLElement {
  const fig = el('figure', '', 'lesson-photo');
  const zoom = el('button', '', 'photo-zoom');
  zoom.type = 'button';
  zoom.setAttribute('aria-label', `Show a bigger photo: ${p.name}`);
  const img = document.createElement('img');
  img.src = PHOTO_URLS[p.file];
  img.alt = p.alt;
  img.decoding = 'async';
  zoom.append(img, icon('viewClose', 'zoom-icon'));
  zoom.addEventListener('click', () => {
    const big = document.createElement('img');
    big.src = PHOTO_URLS[p.file];
    big.alt = p.alt;
    const cap = el('p', p.credit, 'photo-credit');
    openDialog(root, 'photo-dialog', p.name, [big, cap], zoom);
  });
  const cap = el('figcaption', '');
  if (!compact) cap.append(el('span', p.name, 'photo-name'));
  cap.append(el('span', p.credit, 'photo-credit'));
  fig.append(zoom, cap);
  return fig;
}

/** "Tell me more": opens a panel with more to read (and a video, where links are on). */
function moreButton(root: HTMLElement, more: More): HTMLButtonElement {
  const b = button('Tell me more', 'book', 'secondary', () => {
    const body: HTMLElement[] = more.lines.map((l) => line(l));
    if (LESSON_LINKS && more.video) {
      const v = el('a', '', 'more-video');
      v.href = more.video.url;
      v.target = '_blank';
      v.rel = 'noopener noreferrer';
      v.append(icon('external', 'tag-icon'), el('span', `Watch: ${more.video.title} (${more.video.channel})`),
        el('span', ' (opens in a new tab)', 'sr-only'));
      body.push(v);
    }
    openDialog(root, 'more-dialog', more.title, body, b.el);
  });
  b.el.classList.add('btn-small', 'more-btn');
  return b.el;
}

/**
 * A modal panel over the lesson (a real <dialog>: Esc and Close shut it, focus stays inside, and
 * goes back to the button that opened it). main.ts ignores Esc while one is open.
 */
function openDialog(root: HTMLElement, kind: string, title: string, children: HTMLElement[], from: HTMLElement): void {
  const d = el('dialog', '', `lesson-dialog ${kind}`);
  const h = el('h2', title, 'dialog-title');
  h.id = `lesson-dialog-${Date.now()}`;
  d.setAttribute('aria-labelledby', h.id);
  const close = button('Close', 'close', 'secondary', () => d.close());
  close.el.classList.add('btn-small', 'dialog-close');
  const head = el('div', '', 'dialog-head');
  head.append(h, close.el);
  const body = el('div', '', 'dialog-body');
  body.append(...children);
  d.append(head, body);
  d.addEventListener('close', () => {
    d.remove();
    from.focus({ preventScroll: true });
  });
  // A tap on the dark backdrop (outside the panel) closes it too.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  root.append(d);
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
  close.el.focus();
}

// ---------- The cue layer ----------

interface CueLayer {
  /** Plays a cue. With caption lines it runs as a scene: black bars, captions and Skip. */
  play(c: Cue, captionLines: readonly string[] | null, onSkip: () => void): void;
  watching(): boolean;
  focusSkip(): void;
  /** Ends the scene: bars and captions go; the cue picture stays for the rest of the step. */
  endWatch(): void;
  clear(): void;
}

function captions(step: Extract<LessonStep, { kind: 'sense' }>): string[] {
  return step.scene ? [step.scene, step.cueText] : [step.cueText];
}

/**
 * One full-screen layer under the card for the cue's picture, and a caption bar over the bottom
 * black bar. The picture is decorative (aria-hidden); the caption bar is a live region with the
 * same words, and its Skip button holds focus while the card is hidden.
 */
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
  let bar = root.querySelector<HTMLDivElement>(':scope > .cue-captions');
  if (!bar) {
    bar = el('div', '', 'cue-captions');
    bar.setAttribute('role', 'status');
    bar.hidden = true;
    root.append(bar);
  }
  const l = layer;
  const b = bar;
  let skip: HTMLButtonElement | null = null;
  return {
    play(c, lines, onSkip) {
      delete l.dataset.cue;
      void l.offsetWidth; // restart the CSS animation
      l.dataset.cue = c;
      if (!lines) return;
      l.dataset.watch = '';
      const words = el('div', '', 'cue-words');
      lines.forEach((t, i) => words.append(el('p', t, i === lines.length - 1 ? 'cue-line now' : 'cue-line')));
      const s = button('Skip', 'play', 'secondary', onSkip);
      s.el.classList.add('btn-small', 'cue-skip');
      skip = s.el;
      b.replaceChildren(words, s.el);
      b.hidden = false;
    },
    watching: () => l.dataset.watch !== undefined,
    focusSkip() { skip?.focus({ preventScroll: true }); },
    endWatch() {
      delete l.dataset.watch;
      b.hidden = true;
      b.replaceChildren();
      skip = null;
    },
    clear() {
      delete l.dataset.cue;
      delete l.dataset.watch;
      b.hidden = true;
      b.replaceChildren();
      stopCueSound();
    },
  };
}

/** How long each cue plays as a scene (lesson.css), so the card waits for its end. */
function cueMs(c: Cue): number {
  return c === 'robin' ? 6400 : c === 'shadow' ? 3800 : 3000;
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

/** Marks an element as part of what Read aloud reads, in page order. */
function readable<T extends HTMLElement>(e: T): T {
  e.dataset.read = '';
  return e;
}

interface Reader {
  available(): boolean;
  toggle(panel: Element | null, b: Button): void;
  stop(): void;
}

/**
 * Read aloud, karaoke style: it reads the card's visible words in order, lights up the line it is
 * on, and the word it is saying where the browser can (the CSS Highlight API and word events). Its
 * button becomes "Stop" while it reads. Only a voice that runs on the device is used, so reading
 * aloud sends nothing anywhere (no network at runtime, CLAUDE.md).
 */
function readAloud(): Reader {
  let run = 0;
  let btn: Button | null = null;
  const reset = (): void => {
    for (const e of document.querySelectorAll('.reading')) e.classList.remove('reading');
    clearWord();
    if (btn) {
      btn.setLabel('Read aloud');
      btn.el.querySelector('.btn-icon')?.replaceWith(icon('speaker', 'btn-icon'));
    }
    btn = null;
  };
  const stop = (): void => {
    run++;
    stopSpeaking();
    reset();
  };
  return {
    available: () => localVoice() !== null,
    stop,
    toggle(panel, b) {
      if (btn) { stop(); return; }
      const voice = localVoice();
      if (!voice || !panel) return;
      stop();
      const id = ++run;
      btn = b;
      b.setLabel('Stop');
      b.el.querySelector('.btn-icon')?.replaceWith(icon('stop', 'btn-icon'));
      const parts = [...panel.querySelectorAll<HTMLElement>('[data-read]')].filter((e) => e.getClientRects().length > 0);
      const say = (i: number): void => {
        if (id !== run) return;
        for (const e of document.querySelectorAll('.reading')) e.classList.remove('reading');
        clearWord();
        if (i >= parts.length) { reset(); return; }
        const part = parts[i];
        const text = part.textContent ?? '';
        if (!text.trim()) { say(i + 1); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.rate = 0.95;
        u.onstart = () => { if (id === run) part.classList.add('reading'); };
        u.onboundary = (e) => { if (id === run && e.name === 'word') highlightWord(part, e.charIndex, e.charLength); };
        u.onend = () => say(i + 1);
        u.onerror = () => { if (id === run) reset(); };
        speechSynthesis.speak(u);
      };
      say(0);
    },
  };
}

interface HighlightRegistry { set(name: string, h: unknown): void; delete(name: string): void }
const highlights = (): HighlightRegistry | null =>
  (typeof CSS !== 'undefined' && (CSS as unknown as { highlights?: HighlightRegistry }).highlights) || null;

/** Lights up one word inside `part` (from the voice's word event). */
function highlightWord(part: HTMLElement, start: number, length: number | undefined): void {
  const reg = highlights();
  const H = (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight;
  if (!reg || !H) return;
  const text = part.textContent ?? '';
  const len = length && length > 0 ? length : (/^\S+/.exec(text.slice(start))?.[0].length ?? 0);
  if (!len) return;
  const range = document.createRange();
  let pos = 0;
  let set = 0;
  const walk = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const size = n.textContent?.length ?? 0;
    if (!(set & 1) && start < pos + size) { range.setStart(n, start - pos); set |= 1; }
    if (!(set & 2) && start + len <= pos + size) { range.setEnd(n, start + len - pos); set |= 2; break; }
    pos += size;
  }
  if (set === 3) reg.set('lesson-word', new H(range));
}

function clearWord(): void {
  highlights()?.delete('lesson-word');
}

/**
 * An English voice that runs on the device (localService), or null. Network voices are never
 * used. The button only appears when such a voice exists; voices can load late, so a later step
 * may show it.
 */
function localVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  return speechSynthesis.getVoices().find((v) => v.localService && v.lang.startsWith('en')) ?? null;
}

function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
