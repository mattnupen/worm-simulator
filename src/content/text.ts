import { SOURCES, type SourceId } from './sources';

/**
 * Every line the game shows a student (science honesty, CLAUDE.md; V2 spec 2b). A line is one of:
 * - `ui`: a label or instruction, no claim about the world;
 * - `fact`: a claim about real worms or forests: it names its source (src/content/sources.ts)
 *   and is `verified: true` once someone has checked the source says it;
 * - `gameChoice`: something the game does that real worms do not. It is the record that the game
 *   bends the truth here, and it is never shown in the game (Matt, 2026-10-23: no "Game choice"
 *   labels on screen). A fact is still never bent: anything stated as true is a sourced `fact`.
 * The types reject a fact without a source or with `verified` other than true, and
 * tests/unit/content.test.ts checks the same at run time (lineProblems).
 */
export type Line =
  | { readonly kind: 'ui'; readonly text: string }
  | { readonly kind: 'fact'; readonly text: string; readonly source: SourceId; readonly verified: true }
  | { readonly kind: 'gameChoice'; readonly text: string };

export const TEXT = {
  digDown: { kind: 'ui', text: 'Dig down' },
  comeUp: { kind: 'ui', text: 'Come up' },
  viewWide: { kind: 'ui', text: 'Wide view' },
  viewClose: { kind: 'ui', text: 'Close view' },
  // The Action button while the robin holds the worm (touch screens; each tap is one press).
  grip: { kind: 'ui', text: 'Tap!' },
  // The robin hunt (V4 spec 1, revision 1; src/ui/huntHud.ts).
  huntRobin: { kind: 'ui', text: 'Robin!' },
  huntHide: { kind: 'ui', text: 'Dig down to hide.' },
  huntHideDeeper: { kind: 'ui', text: 'Dig deeper to hide.' },
  // The grab's energy bar, and what screen readers hear as each pull starts (src/ui/huntEnergy.ts).
  huntEnergy: { kind: 'ui', text: 'Energy' },
  huntEnergyLow: { kind: 'ui', text: 'low' },
  huntPulls: { kind: 'ui', text: 'Robin pulls!' },
  huntTired: { kind: 'ui', text: 'Out of energy!' },
  huntEscaped: { kind: 'ui', text: 'You got away!' },
  huntGripFact: {
    kind: 'fact',
    text: 'A worm grips the soil with tiny bristles called setae, so a robin has to tug hard.',
    source: 'journeynorth-robin-tug',
    verified: true,
  },
  // Game choices: the record of what the game bends, never shown (Matt, 2026-10-23).
  huntEnergyChoice: { kind: 'gameChoice', text: 'Real worms don\'t have an energy bar. It\'s just for the game.' },
  // V4 revision 4 (Matt, 2026-10-24): the robin digs for a worm in the top two layers (src/predators/huntPose.ts digPose).
  huntDigChoice: {
    kind: 'gameChoice',
    text: 'Real robins mostly flick leaves aside with their bills and pull worms that are near the surface. The game\'s robin also scratches with its feet and digs down a little to reach a worm.',
  },
  // What happens when the robin wins (V4 spec 3; src/predators/huntGame.ts).
  huntBroke: {
    kind: 'fact',
    text: 'Your worm broke! The front end can live and may grow a new tail.',
    source: 'esb-cut-in-two',
    verified: true,
  },
  huntTooShort: { kind: 'ui', text: 'Too short! Start again in your burrow.' },
  huntNewLife: { kind: 'gameChoice', text: 'A new life is a full-length worm.' },
  huntTaken: { kind: 'ui', text: 'The robin got your whole worm! Start again in your burrow.' },
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
  /** V4 hot fix (burrowOut.ts): at the top, Action always comes up, heading out first where it must. */
  comeUpChoice: {
    kind: 'gameChoice',
    text: 'In the game a worm comes up only where its whole body can lie out on open ground, so beside a rock, log or tree it first crawls under the leaves to an open spot.',
  },
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
  openingWatch: { kind: 'ui', text: 'Watch the opening' },
  // The nest scene (V4, src/predators/nestScene.ts): when the robin gets the whole worm.
  nestWatch: { kind: 'ui', text: 'Watch the nest scene' },
  nestLabel: { kind: 'ui', text: 'Nest scene' },
  nestWings: { kind: 'ui', text: '[Wings flap]' },
  nestCheep: { kind: 'ui', text: '[The baby robins cheep]' },
  nestTitle: { kind: 'ui', text: 'Food for the nest' },
  nestFact: {
    kind: 'fact',
    text: 'Robins feed earthworms to their babies.',
    source: 'cornell-robin-nestcam',
    verified: true,
  },
  // Minnesota Breeding Bird Atlas: robins breed in "the summer's breeding season". The game is in fall.
  nestSeason: { kind: 'gameChoice', text: 'real robins raise their babies in spring and summer, not in fall.' },
  // Wiggling free on the way to the nest (V4 hot fix; src/predators/nestWiggle.ts). Nothing on
  // screen tells the player they can; this line only shows after they do.
  nestWiggledFree: { kind: 'ui', text: 'You wiggled free!' },
  nestWiggleChoice: { kind: 'gameChoice', text: 'A worm a bird is carrying rarely gets away like this. The chance to wiggle free is just for the game.' },
  nestSource: { kind: 'ui', text: 'Source:' },
  nestContinue: { kind: 'ui', text: 'Keep going' },
  // The game menu (src/ui/gameMenu.ts; Matt, 2026-10-23): one tab, an icon column, a small card.
  menuOpen: { kind: 'ui', text: 'Open the menu' },
  menuClose: { kind: 'ui', text: 'Close the menu' },
  menuMission: { kind: 'ui', text: 'Mission' },
  menuRounds: { kind: 'ui', text: 'Rounds' },
  menuSettings: { kind: 'ui', text: 'Settings' },
  menuAbout: { kind: 'ui', text: 'About' },
  menuPause: { kind: 'ui', text: 'Pause' },
  menuResume: { kind: 'ui', text: 'Resume' },
  menuToStart: { kind: 'ui', text: 'Back to start' },
  roundsOpening: { kind: 'ui', text: 'Watch the opening again' },
  // The virtual worm: the 3D anatomy model (src/anatomy/), opened in a new tab.
  virtualWorm: { kind: 'ui', text: 'Virtual worm' },
  roundsHere: { kind: 'ui', text: "You're playing this one" },
  roundsPlay: { kind: 'ui', text: 'Play' },
  roundsSoon: { kind: 'ui', text: 'Coming soon' },
  roundsChanges: { kind: 'ui', text: 'What changed in each round' },
  aboutMade: { kind: 'ui', text: '6th graders help make this game. Each round they learn about worms, play, and vote on what to build next.' },
  aboutPrivate: { kind: 'ui', text: 'No accounts. No tracking.' },
  aboutSource: { kind: 'ui', text: 'Source:' },
  paused: { kind: 'ui', text: 'Paused' },
} as const satisfies Record<string, Line>;

export type TextKey = keyof typeof TEXT;

/** The string the player sees. (Game-choice lines are records, never put on screen.) */
export function shown(line: Line): string {
  return line.text;
}

/**
 * Everything wrong with `lines` (empty: all fine): a fact whose source is not in SOURCES or that
 * is not verified, any empty line, and a game-choice line labelled "Game choice".
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
      if (String(line.text ?? '').toLowerCase().startsWith('game choice')) out.push(`${key}: labelled "Game choice"`);
    } else if (line.kind !== 'ui') {
      // Unreachable by the types; catches a cast or JSON import with a kind we do not show.
      out.push(`${key}: unknown kind`);
    }
  }
  return out;
}
