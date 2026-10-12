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
 *   never says "wrong", it says what is true and why (P12: positive wording).
 * - `sense`: a worm's-eye moment over the live forest. A cue plays (a shadow passes, the ground
 *   thumps), the player picks what the worm does, then the reveal. The cue is always also told in
 *   words, so it never relies on sight or motion alone (accessibility).
 * - `sort`: tap each card into one of two groups; each card then shows its fact.
 * - `mission`: what to notice while playing, and the reminder to vote on the form in Canvas. The
 *   game never links to the form (no network at runtime, CLAUDE.md).
 */
export type LessonStep =
  | { readonly kind: 'story'; readonly title: string; readonly lines: readonly Line[]; readonly photo?: Photo }
  | {
    readonly kind: 'predict';
    readonly title: string;
    readonly question: string;
    readonly options: readonly string[];
    readonly reveal: readonly Line[];
    /** Shown above the question (the guess is about the animal, so students see it first). */
    readonly photo?: Photo;
  }
  | {
    readonly kind: 'sense';
    readonly title: string;
    readonly cue: Cue;
    /**
     * A cinematic opening: the card steps aside for a caption strip and letterbox bars while the
     * cue plays, then the card comes back with the question. The words of the scene and the cue
     * are always on screen, so nothing relies on watching the animation.
     */
    readonly scene?: string;
    /** What happened, in words (shown and read with the cue). */
    readonly cueText: string;
    readonly question: string;
    readonly options: readonly string[];
    readonly reveal: readonly Line[];
    /** Shown with the reveal: the real animal. */
    readonly photo?: Photo;
  }
  | {
    readonly kind: 'sort';
    readonly title: string;
    readonly question: string;
    readonly groups: readonly [string, string];
    readonly cards: readonly SortCard[];
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

export interface SortCard {
  readonly name: string;
  readonly photo?: Photo;
  /** Which of the step's two groups it belongs in. */
  readonly group: 0 | 1;
  /** Shown once the card is placed, whichever group was picked. */
  readonly fact: Line;
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
      case 'sort':
        at('question', ui(s.question));
        s.groups.forEach((g, j) => at(`group.${j}`, ui(g)));
        s.cards.forEach((c, j) => {
          at(`card.${j}`, ui(c.name));
          at(`card.${j}.fact`, c.fact);
          if (c.photo) at(`card.${j}.photo`, ui(c.photo.name));
        });
        break;
      case 'mission':
        at('notice', s.notice);
        at('reminder', s.reminder);
        break;
    }
  });
  return out;
}
