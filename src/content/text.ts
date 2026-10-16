import { SOURCES, type SourceId } from './sources';

/**
 * Every line the game shows a student (science honesty, CLAUDE.md; V2 spec 2b). A line is one of:
 * - `ui`: a label or instruction, no claim about the world;
 * - `fact`: a claim about real worms or forests: it names its source (src/content/sources.ts)
 *   and is `verified: true` once someone has checked the source says it;
 * - `gameChoice`: something the game does that real worms do not; shown with "Game choice: ".
 * The types reject a fact without a source or with `verified` other than true, and
 * tests/unit/content.test.ts checks the same at run time (lineProblems).
 */
export type Line =
  | { readonly kind: 'ui'; readonly text: string }
  | { readonly kind: 'fact'; readonly text: string; readonly source: SourceId; readonly verified: true }
  | { readonly kind: 'gameChoice'; readonly text: string };

/** Shown before every game-choice line. */
export const GAME_CHOICE_PREFIX = 'Game choice: ';

export const TEXT = {
  /** The crawl card's controls line (Matt, 2026-10-12: short). Arrow keys and Esc still work too. */
  crawlHint: { kind: 'ui', text: 'Move with the W A S D keys. P to pause.' },
  crawlHintTouch: { kind: 'ui', text: 'Move with the joystick. Tap Pause to stop.' },
  digDown: { kind: 'ui', text: 'Dig down' },
  comeUp: { kind: 'ui', text: 'Come up' },
  viewWide: { kind: 'ui', text: 'Wide view' },
  viewClose: { kind: 'ui', text: 'Close view' },
  layerLitter: { kind: 'ui', text: 'Leaf litter' },
  layerOld: { kind: 'ui', text: 'Old leaves' },
  layerHumus: { kind: 'ui', text: 'Humus' },
  layerTopsoil: { kind: 'ui', text: 'Topsoil' },
  layerSubsoil: { kind: 'ui', text: 'Subsoil' },
  undergroundHint: {
    kind: 'ui',
    text: 'Point the way to dig with the arrow keys, W A S D, or the joystick. Space: switch view, or come up near the top. Esc or P: pause.',
  },
  undergroundHintTouch: {
    kind: 'ui',
    text: 'Point the way to dig with the joystick. Tap the button to switch view, or to come up near the top.',
  },
  layerListLabel: { kind: 'ui', text: 'Soil layers' },
  burrowFact: {
    kind: 'fact',
    text: 'Real nightcrawlers dig one burrow that goes straight down, as deep as 2 meters.',
    source: 'wormwatch-ecogroups',
    verified: true,
  },
  burrowChoice: { kind: 'gameChoice', text: 'In the game you can dig any way you like.' },
  // The opening scene (src/opening/script.ts; Matt's storyboard, 2026-10-16).
  openingBus: { kind: 'ui', text: '[A school bus pulls up]' },
  openingDoor: { kind: 'ui', text: '[Brakes hiss. The door opens]' },
  openingThud: { kind: 'ui', text: '[Thud!]' },
  openingKidLine: { kind: 'ui', text: 'Is that the lake?' },
  openingKidFish: { kind: 'ui', text: "I'm going to catch the biggest fish!" },
  openingPoles: { kind: 'ui', text: 'Everybody grab a fishing pole!' },
  openingOops: { kind: 'ui', text: 'Oops! I dropped the worms!' },
  // The teacher's warning (Matt, 2026-10-16: say how they are invasive and why one getting loose is
  // bad). MN DNR: "All of the terrestrial earthworms in Minnesota are non-native, invasive species
  // from Europe and Asia"; "Invading earthworms eat the leaves that create the duff layer"; "This
  // duff layer is the natural growing environment for native woodland wildflowers."
  openingInvasive: {
    kind: 'fact',
    text: "These worms aren't from here. They came from Europe and Asia.",
    source: 'mndnr-earthworms',
    verified: true,
  },
  openingLoose: {
    kind: 'fact',
    text: 'If one gets loose, it eats the leaves that wildflowers need.',
    source: 'mndnr-earthworms',
    verified: true,
  },
  openingKid: { kind: 'ui', text: 'Kid' },
  openingTeacher: { kind: 'ui', text: 'Teacher' },
  openingSkip: { kind: 'ui', text: 'Skip' },
  openingSkipKeys: { kind: 'ui', text: 'Esc or Enter skips' },
  openingWatch: { kind: 'ui', text: 'Watch the opening' },
} as const satisfies Record<string, Line>;

export type TextKey = keyof typeof TEXT;

/** The string the player sees: a game-choice line is labelled "Game choice: ". */
export function shown(line: Line): string {
  return line.kind === 'gameChoice' ? GAME_CHOICE_PREFIX + line.text : line.text;
}

/**
 * Everything wrong with `lines` (empty: all fine): a fact whose source is not in SOURCES or that
 * is not verified, any empty line, and a game-choice line that already starts with the prefix.
 * The build's guard (tests/unit/content.test.ts) runs it over TEXT.
 */
export function lineProblems(lines: Readonly<Record<string, Line>>): string[] {
  const out: string[] = [];
  for (const [key, line] of Object.entries(lines)) {
    if (!String(line.text ?? '').trim()) out.push(`${key}: empty`);
    if (line.kind === 'fact') {
      if (!Object.prototype.hasOwnProperty.call(SOURCES, line.source)) out.push(`${key}: unknown source "${String(line.source)}"`);
      if (line.verified !== true) out.push(`${key}: not verified`);
    } else if (line.kind === 'gameChoice') {
      if (String(line.text ?? '').toLowerCase().startsWith(GAME_CHOICE_PREFIX.trim().toLowerCase())) out.push(`${key}: has the game-choice prefix twice`);
    } else if (line.kind !== 'ui') {
      // Unreachable by the types; catches a cast or JSON import with a kind we do not show.
      out.push(`${key}: unknown kind`);
    }
  }
  return out;
}
