import type { BodyPart } from '../content/lessons/lesson';
import type { Key } from '../opening/keys';

/**
 * The eating film's script (V4 lesson "Follow the leaf"; spec
 * docs/superpowers/specs/2026-10-22-v4-eating-3d-scene.md, Matt approved 2026-10-23). Pure data:
 * times in seconds from the start. Two places, shown one at a time:
 * - outside: a side cut through the soil at night. The burrow runs straight down at x = 0, the
 *   ground's top is y = 0, the cut face is z = 0 and the camera looks at it from +z. The worm is
 *   3.5 units long (as in the game).
 * - inside: one nightcrawler cut open lengthwise, mouth at x = 0 and tail toward +x, body radius 1
 *   (much bigger than life, so the parts can be seen). The near half is cut away, so the camera at
 *   +z looks into the far half.
 */

/** What the captions are about: the walk outside, each part of the body, then the midden. */
export type Beat = 'outside' | BodyPart | 'midden';

/** Each beat's start, in order; a beat lasts until the next one starts. */
export const BEATS: readonly (readonly [Beat, number])[] = [
  ['outside', 0],
  ['mouth', 11],
  ['pharynx', 16],
  ['crop', 22],
  ['gizzard', 27],
  ['intestine', 35],
  ['casts', 41],
  ['midden', 47],
];

/** The film ends here. */
export const FILM_END = 53;

/** The inside shots run from INSIDE_FROM to INSIDE_TO; outside before and after. */
export const INSIDE_FROM = 11;
export const INSIDE_TO = 47;

/** The black dip between the two places: it is fully dark at each switch, for this long in all. */
export const DIP = 0.8;

/** The beat at time `t`. */
export function beatAt(t: number): Beat {
  let beat: Beat = BEATS[0][0];
  for (const [b, from] of BEATS) if (t >= from) beat = b;
  return beat;
}

/** Which place shows at time `t`. */
export function insideAt(t: number): boolean {
  return t >= INSIDE_FROM && t < INSIDE_TO;
}

/** How dark the dip is at time `t`: 0 clear, 1 black (at each switch). */
export function dipAt(t: number): number {
  let d = 1;
  for (const at of [INSIDE_FROM, INSIDE_TO]) d = Math.min(d, Math.abs(t - at) / (DIP / 2));
  return 1 - Math.min(1, d);
}

// ---------- Outside ----------

/** The worm's bend over the burrow's lip, and how high its body lies on the leaves. */
export const LIP = 0.13;
/** The leaf the worm pulls in: its tip (the end nearest the burrow) and its length. */
export const LEAF_TIP_X = 1.0;
export const LEAF_LENGTH = 1.05;
/** The worm takes hold of the leaf here and lets go of nothing after. */
export const GRAB_AT = 7.2;

/**
 * How far the worm's head is past the burrow's mouth, along its body (negative: still inside):
 * it comes up, bends over onto the leaves, feels its way to the leaf, takes it, and pulls it into
 * the burrow's top. Then it stays there, holding it, for the last shot.
 */
export const REACH: readonly Key[] = [
  [0, -0.35],
  [2.5, 0.22],
  [4, 0.6],
  [5.6, 0.82],
  [6.6, 1.0 + LIP * (Math.PI / 2 - 1)],
  [GRAB_AT, 1.0 + LIP * (Math.PI / 2 - 1)],
  [9.6, -0.22],
];

/** The head's search, side to side, while it feels for food (0 still, 1 the widest). */
export const FEEL: readonly Key[] = [[3.4, 0], [4.2, 1], [6.2, 1], [6.8, 0]];

/** The outside camera: `[t, x, y, z, lookX, lookY, lookZ]`. It pushes in to the head before the dip. */
export const OUT_CAMERA: readonly Key[] = [
  [0, 0.7, 1.0, 3.1, 0.7, -0.35, -0.3],
  [8.6, 0.6, 0.9, 2.8, 0.6, -0.25, -0.3],
  [11, 0.08, 0.2, 1.0, 0.04, -0.12, -0.1],
  // The midden: from a little above, looking down at the pile around the burrow.
  [INSIDE_TO, 0.35, 1.3, 2.3, 0.25, 0, -0.4],
  [FILM_END, 0.3, 1.05, 1.9, 0.2, 0, -0.4],
];

/** How many casts lie around the burrow: a few already, more as the last shot plays. */
export const CASTS_BEFORE = 14;
export const CASTS_AFTER = 26;
export const CASTS: readonly Key[] = [[INSIDE_TO + 1, CASTS_BEFORE], [INSIDE_TO + 4.5, CASTS_AFTER]];

// ---------- Inside ----------

/** One segment's length, and how many there are (a big nightcrawler has well over 100). */
export const SEG = 0.32;
export const SEGMENTS = 150;
/** The tail end. */
export const TAIL = SEG * SEGMENTS;

/** Where each part sits along the body (x), front to back. */
export const PARTS = {
  pharynx: [0.3, 1.6],
  esophagus: [1.6, 4.8],
  crop: [4.8, 5.6],
  gizzard: [5.7, 6.7],
  intestine: [6.8, TAIL - 0.3],
  /** The five pairs of hearts, around the esophagus. */
  hearts: [2.1, 2.4, 2.7, 3.0, 3.3],
  /** The clitellum, a band about a third of the way back (segments 31 to 38). */
  clitellum: [SEG * 31, SEG * 38],
} as const;

/** The crop, middle of the gizzard. */
export const CROP_X = 5.2;
export const GIZZARD_X = 6.2;

/**
 * The leaf in front of the mouth: its edge, where the bite comes off (Matt, 2026-10-23: "how does
 * the worm get the small part off the leaf?"). The pharynx reaches out, grips the edge, tugs twice
 * (the leaf bends toward the mouth) and tears a bite off at TEAR_AT, leaving a notch.
 */
export const NOTCH_X = -1.08;
export const NOTCH_Y = 0.05;
export const BITE_R = 0.26;
export const TEAR_AT = 18.9;
/** How hard the pharynx pulls on the leaf (0 to 1): two tugs, then the bite tears off. */
export const TUG: readonly Key[] = [[17.4, 0], [17.8, 1], [18.1, 0.2], [18.6, 1], [TEAR_AT, 1], [19.15, 0]];
/** How far a full tug pulls the leaf's edge toward the mouth. */
export const TUG_X = 0.12;

/**
 * The bite once it is torn off: where it is along the body, `[t, x, y]`. The pharynx pulls it in,
 * it slides down to the crop, waits, goes on into the gizzard (where it is ground up), and leaves
 * it as crumbs that travel down the intestine. By `casts` the crumbs ride along with the camera to
 * the tail (a time-lapse), turn into casts and are pushed out of the back end one by one.
 */
export const FOOD: readonly Key[] = [
  [INSIDE_FROM, NOTCH_X + TUG_X, NOTCH_Y],
  [TEAR_AT, NOTCH_X + TUG_X, NOTCH_Y],
  [20.3, 0.75, 0],
  [22.2, 1.0, 0],
  [24.4, CROP_X, 0],
  [27, CROP_X, 0],
  [28, GIZZARD_X, 0],
  [34, GIZZARD_X, 0],
  [35, 7.4, 0],
  [41, 13, 0],
  [43.6, TAIL - 1.1, 0],
  [46.6, TAIL + 2.4, 0],
];

/** The pharynx: how far its front reaches out of the mouth (0 home, 1 out at the leaf's edge). */
export const PHARYNX_OUT: readonly Key[] = [[16.3, 0], [17.4, 1], [TEAR_AT, 1], [20.3, 0]];
/** The lobe over the mouth: 0 down (closing the mouth), 1 up, feeling around. */
export const LOBE_UP: readonly Key[] = [[11.6, 0], [12.6, 1], [14.6, 1], [15.4, 0.3], [17.4, 1], [20.4, 0]];
/** Spit: 0 none, 1 the bite is wet. */
export const SPIT: readonly Key[] = [[20.3, 0], [21.2, 1], [23.5, 1], [24.4, 0]];
/** The crop's swell while it holds the bite (0 to 1). */
export const CROP_FULL: readonly Key[] = [[23.6, 0], [24.6, 1], [26.6, 1], [27.8, 0]];
/** The gizzard grinds from here to here: it squeezes 0.8 times a second (far under 3). */
export const GRIND: readonly [number, number] = [28.2, 34];
export const SQUEEZE_HZ = 0.8;
/** How much of the bite is still whole (1), or crumbs (0). */
export const WHOLE: readonly Key[] = [[28.4, 1], [33.4, 0]];
/** Food soaks from the intestine into the blood: 0 none, 1 the dots' whole trip. */
export const SOAK: readonly Key[] = [[35.6, 0], [40.6, 1]];
/** The crumbs turn into casts by the end of the gut (0 crumbs, 1 casts). */
export const CASTING: readonly Key[] = [[41, 0], [43.6, 1]];
/** The casts pushed out of the back end, and the floor of the burrow they drop onto. */
export const CAST_N = 8;
export const CAST_GAP = 0.22;
export const FLOOR_Y = -1.0;

/**
 * The inside camera: `[t, focusX, distance, height]`. It looks at (focusX, 0, 0) from
 * (focusX + 0.4, height, distance): close for the mouth and the gizzard, back a little for the
 * travel, and a quick ride to the tail.
 */
export const IN_CAMERA: readonly Key[] = [
  [INSIDE_FROM, 2.4, 6.2, 0.6],
  [12.6, 0.1, 3.4, 0.4],
  [16, 0, 3.6, 0.4],
  [18, -0.5, 3.6, 0.4],
  [20, 0.8, 3.0, 0.35],
  [22, 1.2, 3.4, 0.4],
  [24.4, CROP_X, 3.2, 0.4],
  [27, CROP_X + 0.3, 3.0, 0.4],
  [28.4, GIZZARD_X, 2.3, 0.3],
  [34, GIZZARD_X, 2.3, 0.3],
  [36, 8.4, 3.6, 0.5],
  [41, 12.6, 3.6, 0.5],
  [43.6, TAIL - 1.2, 3.8, 0.5],
  [45, TAIL - 0.2, 3.6, 0.3],
  [INSIDE_TO, TAIL - 0.1, 3.6, 0.3],
];

/**
 * The parts' labels inside (Matt, 2026-10-23: label the parts with lines): each points at
 * (x, y) on the cut worm, from above (`side` 1) or below (-1). Those with a `part` are the stops
 * the captions name (the lesson's own name is shown); the rest are the other parts on the way.
 */
export interface PartLabel {
  readonly name: string;
  readonly part?: BodyPart;
  readonly x: number;
  readonly y: number;
  readonly side: 1 | -1;
}
export const LABELS: readonly PartLabel[] = [
  { name: 'Mouth', part: 'mouth', x: -0.02, y: -0.12, side: -1 },
  { name: 'Brain', x: 0.92, y: 0.66, side: 1 },
  { name: 'Pharynx', part: 'pharynx', x: 1.25, y: -0.22, side: -1 },
  { name: 'Hearts', x: 2.7, y: 0.6, side: 1 },
  { name: 'Esophagus', x: 4.1, y: -0.1, side: -1 },
  { name: 'Crop', part: 'crop', x: CROP_X, y: 0.3, side: 1 },
  { name: 'Gizzard', part: 'gizzard', x: GIZZARD_X, y: -0.35, side: -1 },
  { name: 'Intestine', part: 'intestine', x: 8.6, y: 0.32, side: 1 },
  { name: 'Blood vessel', x: 10.6, y: 0.74, side: 1 },
  { name: 'Nerve cord', x: 10.2, y: -0.84, side: -1 },
  { name: 'Back end', part: 'casts', x: TAIL - 0.08, y: 0.2, side: 1 },
];
/** Where the labels sit, above or below the worm's middle line. */
export const LABEL_Y = 1.22;
