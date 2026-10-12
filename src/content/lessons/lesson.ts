import { type Line } from '../text';

/**
 * An in-game lesson: the "learn first" step of a round (framework P1), played inside the game
 * instead of on slides. One file per topic in this folder holds the whole script as data, so a
 * new topic is a new file and no new code (docs/codev/in-game-lessons.md). Every line a student
 * reads is a `Line`, so a claim about real animals must name a verified source, the same as the
 * rest of the game's text (tests/unit/lessons.test.ts runs lineProblems over every lesson).
 *
 * The steps, in the order a lesson usually uses them:
 * - `story`: one big idea, two or three short lines.
 * - `predict`: a question first, then what scientists found. Every guess is welcome: the reveal
 *   never says "wrong", it says what is true and why (P12: positive wording). When one option is
 *   what scientists found (`answer`), it is marked once the player has guessed.
 * - `sense`: a worm's-eye moment over the live forest. A cue plays (a shadow passes, the ground
 *   thumps), the player picks what the worm does, then the reveal. The cue is always also told in
 *   words, so it never relies on sight or motion alone (accessibility).
 * - `meet`: a few animals as photo cards; tap "Find out" on each to read its fact. No sorting and
 *   no trick question (Matt, 2026-10-12: the sort felt like a quiz with an obvious answer).
 * Any step but the mission can have `more`: a "Tell me more" panel with extra sourced facts for
 * students who want to read on. Nothing in it is needed for the round.
 * - `mission`: what to notice while playing, and the reminder to vote on the form in Canvas. The
 *   game never links to the form (no network at runtime, CLAUDE.md).
 */
export type LessonStep =
  | {
    readonly kind: 'story';
    readonly title: string;
    readonly lines: readonly Line[];
    readonly photo?: Photo;
    readonly more?: More;
  }
  | {
    readonly kind: 'predict';
    readonly title: string;
    readonly question: string;
    readonly options: readonly string[];
    /** The option scientists found, if one is (an index into `options`). */
    readonly answer?: number;
    readonly reveal: readonly Line[];
    readonly more?: More;
    /** Shown above the question (the guess is about the animal, so students see it first). */
    readonly photo?: Photo;
  }
  | {
    readonly kind: 'sense';
    readonly title: string;
    readonly cue: Cue;
    /**
     * The scene's opening words. Every sense step plays like a film shot: the card fades out, black
     * bars close in, and the scene and cue words show as captions in the bottom bar while the cue
     * plays; then the card fades back with the question. The words are always shown, so nothing
     * relies on watching the animation or hearing the sound.
     */
    readonly scene?: string;
    /** What happened, in words (shown and read with the cue). */
    readonly cueText: string;
    readonly question: string;
    readonly options: readonly string[];
    /** The option scientists found, if one is (an index into `options`). */
    readonly answer?: number;
    readonly reveal: readonly Line[];
    readonly more?: More;
    /** Shown with the reveal: the real animal. */
    readonly photo?: Photo;
  }
  | {
    readonly kind: 'meet';
    readonly title: string;
    readonly intro: string;
    readonly cards: readonly MeetCard[];
    readonly more?: More;
  }
  | {
    readonly kind: 'mission';
    readonly title: string;
    readonly notice: Line;
    readonly reminder: Line;
  };

/**
 * What a `sense` step plays over the forest: a shadow passing, the ground thumping, or the robin
 * scene (its shadow passes, it hops in with a thump on each landing, then tips its head to look).
 */
export type Cue = 'shadow' | 'thump' | 'robin';

/**
 * A real photograph (never AI-made: Matt, 2026-10-12), bundled into the build (no network). `file`
 * names a jpg in ./photos/ (photos.ts turns it into the image, so lesson data stays plain data that
 * tests can load); `credit` is the photographer and license as the source asks.
 */
export type PhotoFile = 'robin' | 'woodcock' | 'mole' | 'shrew' | 'garter-snake' | 'toad' | 'salamander';

export interface Photo {
  readonly file: PhotoFile;
  /** Shown under the photo: what it is ("American woodcock"). Makes no claim. */
  readonly name: string;
  /** What the photo shows, for screen readers. */
  readonly alt: string;
  readonly credit: string;
}

export interface MeetCard {
  readonly name: string;
  readonly photo: Photo;
  /** Shown when the player taps "Find out". */
  readonly fact: Line;
}

/**
 * "Tell me more": a bigger panel to read on. Lines follow the same rules as the step (every claim
 * sourced). `video` is a suggested video page; it is shown only where the build allows outside
 * links (see docs/codev/in-game-lessons.md).
 */
export interface More {
  readonly title: string;
  readonly lines: readonly Line[];
  readonly video?: Video;
}

export interface Video {
  readonly title: string;
  readonly channel: string;
  /** The video's YouTube page (youtube.com/watch?v=… or youtu.be/…). */
  readonly url: string;
}

/** The video id from a youtube.com/watch?v= or youtu.be/ link, or null. */
export function youTubeId(url: string): string | null {
  const m = /^https:\/\/(?:www\.youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

export interface Lesson {
  /** Stable id, stored once the lesson is finished (src/save/lessonStore.ts). Never reuse one. */
  readonly id: string;
  /** Short, on the Start button: "Learn: Who eats worms?" */
  readonly title: string;
  readonly steps: readonly LessonStep[];
}

const ui = (text: string): Line => ({ kind: 'ui', text });

/**
 * Every line in `lesson` keyed by where it sits ("3.reveal.1"), for lineProblems. Questions,
 * options, titles and group names are plain `ui` text: write them so they make no claim (a claim
 * belongs in a fact line with its source).
 */
export function lessonLines(lesson: Lesson): Record<string, Line> {
  const out: Record<string, Line> = { title: ui(lesson.title) };
  lesson.steps.forEach((s, i) => {
    const at = (k: string, l: Line): void => { out[`${i}.${k}`] = l; };
    at('title', ui(s.title));
    switch (s.kind) {
      case 'story':
        s.lines.forEach((l, j) => at(`line.${j}`, l));
        if (s.photo) at('photo', ui(s.photo.name));
        break;
      case 'sense':
        at('cueText', ui(s.cueText));
        if (s.scene) at('scene', ui(s.scene));
        // falls through: a sense step also has a question, options and a reveal
      case 'predict':
        at('question', ui(s.question));
        s.options.forEach((o, j) => at(`option.${j}`, ui(o)));
        s.reveal.forEach((l, j) => at(`reveal.${j}`, l));
        if (s.photo) at('photo', ui(s.photo.name));
        break;
      case 'meet':
        at('intro', ui(s.intro));
        s.cards.forEach((c, j) => {
          at(`card.${j}`, ui(c.name));
          at(`card.${j}.fact`, c.fact);
          at(`card.${j}.photo`, ui(c.photo.name));
        });
        break;
      case 'mission':
        at('notice', s.notice);
        at('reminder', s.reminder);
        break;
    }
    if (s.kind !== 'mission' && s.more) {
      at('more.title', ui(s.more.title));
      s.more.lines.forEach((l, j) => at(`more.${j}`, l));
      if (s.more.video) at('more.video', ui(s.more.video.title));
    }
  });
  return out;
}
