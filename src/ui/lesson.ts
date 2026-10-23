import './lesson.css';
import { el, button, menu, type Button } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { SOURCES, type SourceId } from '../content/sources';
import { shown, type Line } from '../content/text';
import type { Cue, Lesson, LessonStep, More, Photo, Video } from '../content/lessons/lesson';
import { PHOTO_URLS } from '../content/lessons/photos';
import { youTubeId } from '../content/lessons/lesson';
import { playCueSound, stopCueSound } from './lessonSound';
import { closeFilm, filmBody, type LessonFilm } from './lessonFilm';

/**
 * Whether lessons show sources as links (new tab) and play "Tell me more" videos in the panel
 * (YouTube's privacy-enhanced player, youtube-nocookie.com, which the CSP allows as a frame). Matt
 * turned these on (2026-10-12) when he dropped the offline rule. Off: no links and no video.
 */
export const LESSON_LINKS = true;

export interface LessonActions {
  /** The last step's "Start crawling". */
  onCrawl(): void;
  /** "Back to start" (any step), or Esc (main.ts). */
  onStart(): void;
  /** The player reached the last step: the lesson counts as finished. */
  onFinish(): void;
  /** Plays the eating film for a `body` step (main.ts); without it the step is the film's words. */
  film?: LessonFilm;
}

/**
 * The in-game lesson (content/lessons/lesson.ts): one parchment card per step over the live
 * forest, with Back and Next. Interactive steps (predict, sense, meet) show Next once answered;
 * nothing is graded and nothing is stored but "finished". Focus moves to each step's heading so a
 * screen reader reads it, and the panel is aria-live like every other card.
 *
 * A `sense` step plays like a film shot: the card fades out, black bars close in at the top and
 * bottom, the cue plays over the open forest with its sound, and the scene's words show as
 * captions in the bottom bar. When it ends, the bar's "Skip" becomes "Next" and waits for the
 * student; then the card fades back with the question. "Play it again" replays it. No flashing:
 * one slow shadow, or thumps under 3 a second. Under reduced motion the card stays and the cue is
 * a still picture.
 *
 * Next is always there, so students know where to go; on a step that asks something it is grayed
 * out until they answer, with a line that says what to do first (never colour alone).
 *
 * A lesson may open with "Guess first!" (a `guess` step): the pick shows nothing yet, and the
 * mission step shows it beside what scientists found, so students can report their first guess on
 * the round's form. The guess lives only on this card, like every other pick.
 *
 * Questions are real radio buttons (like the Graphics menu); the pick keeps its thick outline and
 * filled dot. Once a guess is in, the option scientists found is marked "Correct", with a tick.
 * Photos open bigger when tapped; "Tell me more" opens a panel with more to read. Sources stay off
 * the card: one "Sources" button lists, as links, where this page's facts and photos come from.
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

  /** The opening guess and the student's pick, for the mission step's recap. */
  const guessed = (): BodyCtx['guess'] => {
    const i = lesson.steps.findIndex((s) => s.kind === 'guess');
    const step = lesson.steps[i];
    return step?.kind === 'guess' ? { step, pick: picks.get(i) } : undefined;
  };

  const go = (i: number): void => {
    at = i;
    draw();
  };

  function draw(): void {
    endScene();
    a.film?.stop();
    closeFilm(shell.root);
    reader.stop();
    const step = lesson.steps[at];
    const last = at === lesson.steps.length - 1;
    if (last) a.onFinish();
    const heading = el('h1', step.title, 'screen-title lesson-title');
    heading.tabIndex = -1;
    readable(heading);
    const next = button(last ? 'Start crawling' : 'Next', 'play', 'primary', () => (last ? leave(a.onCrawl) : go(at + 1)));
    const here = at;
    const moreBtn = step.more ? moreButton(shell.root, step.more) : null;
    const hint = el('p', waitHint(step), 'next-hint');
    hint.hidden = !hint.textContent;
    const onAnswer = (): void => {
      // First answer on this step: Next wakes up, and Tell me more appears. Focus stays put, so
      // the reveal can be read.
      if (answered.has(here)) return;
      answered.add(here);
      next.el.disabled = false;
      hint.hidden = true;
      if (moreBtn) moreBtn.hidden = false;
    };
    const ctx: BodyCtx = {
      root: shell.root, at, onAnswer, replay: () => startScene(true), film: a.film,
      picks, opened: opened.get(at) ?? new Set(), answered: answered.has(at), guess: guessed(),
    };
    opened.set(at, ctx.opened);
    const body = stepBody(step, ctx);
    const waits = !last && interactive(step) && !answered.has(at);
    next.el.disabled = waits;
    hint.hidden = !waits;
    if (moreBtn) moreBtn.hidden = waits;
    const nav: Button[] = [next];
    if (at > 0) nav.push(button('Back', 'back', 'secondary', () => go(at - 1)));
    // Next and Back stay in view at the bottom of the card, with the line saying why Next waits.
    const foot = el('div', '', 'lesson-foot');
    foot.append(hint, menu(...nav));

    const tools = el('div', '', 'lesson-tools');
    if (reader.available()) {
      const read = button('Read aloud', 'speaker', 'secondary', () => reader.toggle(heading.closest('.panel'), read));
      read.el.classList.add('btn-small');
      tools.append(read.el);
    }
    if (step.kind !== 'mission' || ctx.guess) {
      const src = button('Sources', 'external', 'secondary', () => sourcesDialog(shell.root, panel(), src.el));
      src.el.classList.add('btn-small');
      tools.append(src.el);
    }
    const exit = button('Back to start', 'home', 'secondary', () => leave(a.onStart));
    exit.el.classList.add('btn-small');
    tools.append(exit.el);

    shell.show('lesson', `Lesson: ${lesson.title}`, [
      progress(lesson, at),
      heading,
      ...body,
      ...(moreBtn ? [moreBtn] : []),
      tools,
      foot,
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
    // The scene waits for the student: when it ends, Skip becomes Next.
    sceneTimer = window.setTimeout(() => cue.done(), cueMs(step.cue));
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
    a.film?.stop();
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
  closeFilm(root);
  for (const d of root.querySelectorAll<HTMLDialogElement>('dialog.lesson-dialog')) d.remove();
  const layer = root.querySelector<HTMLElement>(':scope > .cue');
  if (layer) {
    delete layer.dataset.cue;
    delete layer.dataset.watch;
  }
  root.querySelector<HTMLElement>(':scope > .cue-captions')?.setAttribute('hidden', '');
}

function interactive(step: LessonStep): boolean {
  return step.kind === 'guess' || step.kind === 'predict' || step.kind === 'sense' || step.kind === 'meet' || step.kind === 'body';
}

/** Beside a grayed-out Next: what to do first, in words. None on the film (Matt, 2026-10-23). */
function waitHint(step: LessonStep): string {
  if (step.kind === 'meet') return `Tap Find out on all ${step.cards.length} to go on.`;
  if (step.kind === 'body') return '';
  return 'Pick an answer to go on.';
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
  readonly film?: LessonFilm;
  readonly picks: Map<number, number>;
  readonly opened: Set<number>;
  readonly answered: boolean;
  /** The lesson's opening guess, if it has one, and the student's pick (shown on the mission). */
  readonly guess?: { readonly step: Extract<LessonStep, { kind: 'guess' }>; readonly pick: number | undefined };
}

function stepBody(step: LessonStep, c: BodyCtx): HTMLElement[] {
  switch (step.kind) {
    case 'guess':
      return guessBody(step, c);
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
    case 'body':
      return filmBody(c.root, step, c.film, c.onAnswer);
    case 'mission': {
      const notice = el('p', '', 'mission-line');
      notice.append(icon('flag', 'mission-icon'), readable(el('span', shown(step.notice))));
      const reminder = el('p', '', 'mission-line');
      reminder.append(icon('form', 'mission-icon'), readable(el('span', shown(step.reminder))));
      return [...(c.guess ? [recap(c.guess)] : []), notice, reminder];
    }
  }
}

/**
 * A question as a set of radio buttons. Any pick reveals what scientists found, and the option
 * scientists found is marked "Correct". The pick shows by its outline and filled dot.
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
  const mark = (): void => {
    labels.forEach((lab, i) => {
      const tags = lab.querySelector('.choice-tags') as HTMLElement;
      if (i === step.answer && !tags.childElementCount) {
        const t = el('span', '', 'choice-tag correct');
        t.append(icon('check', 'tag-icon'), el('span', 'Correct'));
        tags.append(t);
      }
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
      mark();
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
    mark();
  } else {
    found.hidden = true;
  }
  return [set, found];
}

/**
 * "Guess first!": the same radio buttons as any question, but a pick reveals nothing yet. The
 * answer waits for the mission step, after the lesson has taught it.
 */
function guessBody(step: Extract<LessonStep, { kind: 'guess' }>, c: BodyCtx): HTMLElement[] {
  const set = el('fieldset', '', 'choices lesson-choices');
  const legend = el('legend', step.question, 'lead lesson-question');
  readable(legend);
  set.append(legend);
  const later = readable(el('p', 'Got it! You will find out at the end of Learn.', 'guess-later'));
  later.setAttribute('aria-live', 'polite');
  step.options.forEach((o, i) => {
    const lab = el('label', '', 'choice');
    const input = el('input');
    input.type = 'radio';
    input.name = `lesson-q-${c.at}`;
    input.value = String(i);
    input.checked = c.picks.get(c.at) === i;
    input.addEventListener('change', () => {
      c.picks.set(c.at, i);
      later.hidden = false;
      c.onAnswer();
    });
    const words = el('span', '', 'choice-words');
    words.append(readable(el('span', o, 'choice-name')));
    lab.append(input, words);
    set.append(lab);
  });
  later.hidden = !c.picks.has(c.at);
  const hint = readable(el('p', 'Just guess. Nobody sees your answer.', 'guess-hint'));
  return [hint, set, later];
}

/** On the mission: the student's first guess, then what scientists found, with its facts. */
function recap(g: NonNullable<BodyCtx['guess']>): HTMLElement {
  const box = el('div', '', 'reveal guess-recap');
  box.append(readable(el('p', 'Your first guess', 'reveal-head')));
  box.append(readable(el('p', `You guessed: ${g.pick === undefined ? 'no guess' : g.step.options[g.pick]}`, 'guess-pick')));
  const found = el('p', '', 'guess-answer');
  found.append(icon('check', 'tag-icon'), readable(el('span', `Scientists found: ${g.step.options[g.step.answer]}`)));
  box.append(found, ...g.step.reveal.map((l) => line(l)));
  box.append(readable(el('p', 'The form will ask what you guessed first.', 'guess-form')));
  return box;
}

/**
 * One row per animal: a small photo, its name, and "Find out", which shows its fact in place. A
 * count says how many are found; Next wakes up once every card is open.
 */
function meet(step: Extract<LessonStep, { kind: 'meet' }>, c: BodyCtx): HTMLElement[] {
  const intro = readable(el('p', step.intro, 'lead lesson-question'));
  const count = el('p', '', 'meet-count');
  count.setAttribute('aria-live', 'polite');
  const tally = (): void => { count.textContent = `Found ${c.opened.size} of ${step.cards.length}`; };
  tally();
  const list = el('ul', '', 'meet-list');
  step.cards.forEach((card, i) => {
    const li = el('li', '', 'meet-card');
    const name = readable(el('p', card.name, 'meet-name'));
    const fact = line(card.fact);
    const open = (): void => {
      c.opened.add(i);
      find.el.hidden = true;
      fact.hidden = false;
      li.classList.add('found');
      tally();
      if (c.opened.size === step.cards.length) c.onAnswer();
    };
    const find = button('Find out', 'leaf', 'secondary', open);
    find.el.classList.add('btn-small');
    find.el.setAttribute('aria-label', `Find out: ${card.name}`);
    const isOpen = c.opened.has(i);
    find.el.hidden = isOpen;
    fact.hidden = !isOpen;
    li.classList.toggle('found', isOpen);
    const words = el('div', '', 'meet-words');
    words.append(name, find.el, fact);
    li.append(photo(c.root, card.photo, true), words);
    list.append(li);
  });
  return [intro, count, list];
}

/**
 * One line as the player sees it (never labelled "Game choice"). A fact carries its source id, and the
 * Sources list (sourcesDialog) names every source shown on the page, so the card stays clean.
 */
function line(l: Line, className = ''): HTMLElement {
  const p = el('p', '', `lesson-line ${className}`.trim());
  p.textContent = shown(l);
  readable(p);
  if (l.kind === 'fact') p.dataset.source = l.source;
  return p;
}

/** A source as a link to its page (a new tab), or its name where links are off. */
function sourceLink(id: SourceId): HTMLElement {
  const s = SOURCES[id];
  if (!LESSON_LINKS) return el('span', `${s.title} (${s.publisher})`);
  const link = el('a', s.title);
  link.href = s.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(el('span', ' (opens in a new tab)', 'sr-only'));
  const out = el('span');
  out.append(link, ` (${s.publisher})`);
  return out;
}

/** The sources of the facts, and the credits of the photos, that `scope` shows right now. */
function shownSources(scope: Element): { facts: SourceId[]; credits: string[] } {
  const visible = (e: Element): boolean => e.getClientRects().length > 0;
  const facts = new Set<SourceId>();
  for (const e of scope.querySelectorAll<HTMLElement>('[data-source]')) if (visible(e)) facts.add(e.dataset.source as SourceId);
  const credits = new Set<string>();
  for (const e of scope.querySelectorAll<HTMLElement>('[data-credit]')) if (visible(e)) credits.add(e.dataset.credit ?? '');
  return { facts: [...facts], credits: [...credits] };
}

/** A short list of sources (and photo credits), as at the end of a book. */
function sourceList(facts: readonly SourceId[], credits: readonly string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (facts.length) {
    const ul = el('ul', '', 'source-list');
    for (const id of facts) {
      const li = el('li');
      li.append(sourceLink(id));
      ul.append(li);
    }
    out.push(el('p', 'Where the facts come from', 'source-head'), ul);
  }
  if (credits.length) {
    const ul = el('ul', '', 'source-list');
    for (const t of credits) ul.append(el('li', t));
    out.push(el('p', 'Photos', 'source-head'), ul);
  }
  return out;
}

/** "Sources": every source and photo credit on the page as the student sees it now. */
function sourcesDialog(root: HTMLElement, panel: HTMLElement | null, from: HTMLElement): void {
  const { facts, credits } = panel ? shownSources(panel) : { facts: [], credits: [] };
  const body = sourceList(facts, credits);
  if (!facts.length) body.unshift(el('p', 'Answer the question first: the sources come with what scientists found.'));
  openDialog(root, 'sources-dialog', 'Sources for this page', body, from);
}

/**
 * A real photo with the animal's name underneath. Tapping it opens a bigger view with its credit.
 * `compact` leaves the name off (a card that already shows it).
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
    // Tapping the big photo closes it too, like tapping outside the panel.
    big.addEventListener('click', () => big.closest('dialog')?.close());
    const cap = el('p', p.credit, 'photo-credit');
    openDialog(root, 'photo-dialog', p.name, [big, cap], zoom);
  });
  // The credit its license asks for is in the bigger view and in Sources, not on the card.
  fig.dataset.credit = `${p.name}: ${p.credit}`;
  fig.append(zoom);
  if (!compact) fig.append(el('figcaption', p.name, 'photo-name'));
  return fig;
}

/**
 * "Tell me more: <its title>": opens a panel with more to read, a video where links are on, and
 * the panel's sources at the end.
 */
function moreButton(root: HTMLElement, more: More): HTMLButtonElement {
  const b = button(`Tell me more: ${more.title}`, 'book', 'secondary', () => {
    const body: HTMLElement[] = more.lines.map((l) => line(l));
    if (LESSON_LINKS && more.video) body.push(video(more.video));
    const facts = [...new Set(more.lines.flatMap((l) => (l.kind === 'fact' ? [l.source] : [])))];
    const end = el('div', '', 'more-sources');
    end.append(...sourceList(facts, []));
    body.push(end);
    openDialog(root, 'more-dialog', more.title, body, b.el);
  });
  b.el.classList.add('btn-small', 'more-btn');
  return b.el;
}

/**
 * A YouTube video in the panel, through the privacy-enhanced player (no cookies until it plays). It
 * loads only when the panel opens, and closing the panel removes it, so it stops. A plain link
 * opens it on YouTube too, for a school network or browser that blocks the player.
 */
function video(v: Video): HTMLElement {
  const wrap = el('div', '', 'more-video');
  const id = youTubeId(v.url);
  if (id) {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    frame.title = `Video: ${v.title}`;
    frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.loading = 'lazy';
    const box = el('div', '', 'video-box');
    box.append(frame);
    wrap.append(box);
  }
  const link = el('a', '', 'video-link');
  link.href = v.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(icon('external', 'tag-icon'), el('span', `Open on YouTube: ${v.title} (${v.channel})`),
    el('span', ' (opens in a new tab)', 'sr-only'));
  wrap.append(link);
  return wrap;
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
  /** The cue has played: Skip becomes Next, and the scene waits for it. */
  done(): void;
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
  let skip: Button | null = null;
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
      skip = s;
      b.replaceChildren(words, s.el);
      b.hidden = false;
    },
    watching: () => l.dataset.watch !== undefined,
    focusSkip() { skip?.el.focus({ preventScroll: true }); },
    done() {
      if (!skip) return;
      skip.setLabel('Next');
      skip.el.classList.replace('btn-secondary', 'btn-primary');
    },
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

/** How long each cue plays as a scene (lesson.css, lessonSound.ts), so Skip turns to Next at its end. */
function cueMs(c: Cue): number {
  return c === 'robin' ? 8200 : c === 'shadow' ? 5600 : 4200;
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
