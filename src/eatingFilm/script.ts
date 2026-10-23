import type { BodyPart } from '../content/lessons/lesson';
import type { AnatomyPartId } from '../content/anatomy';
import type { Key } from '../opening/keys';
import { ANCHORS } from '../anatomy/anchors';
import { sampleBody } from '../anatomy/body';
import { gutCentreY } from '../anatomy/gut';
import { LENGTH, ORGANS, halfWidth, segStart } from '../anatomy/layout';
import { CUT_END } from '../anatomy/skin';

/**
 * The eating film's script (V4 lesson "Follow the leaf"; spec
 * docs/superpowers/specs/2026-10-22-v4-eating-3d-scene.md, Matt approved 2026-10-23). Data, with
 * the places inside taken from the anatomy model's layout; times in seconds from the start. Two
 * places, shown one at a time:
 * - outside: a side cut through the soil at night. The burrow runs straight down at x = 0, the
 *   ground's top is y = 0, the cut face is z = 0 and the camera looks at it from +z. The worm is
 *   3.5 units long (as in the game).
 * - inside: the anatomy model's nightcrawler cut open lengthwise, mouth at x = 0 and tail toward
 *   +x, body radius about 1 (much bigger than life, so the parts can be seen). The near half is cut
 *   away, so the camera at +z looks into the far half.
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

/**
 * Inside is the project's anatomy model (src/anatomy/), so every change to it shows here too:
 * its millimetres times MM are the film's units (the body's radius is about 1). Every place along
 * the body below comes from the model's own layout.
 */
export const MM = 1 / halfWidth(20);
const seg = (n: number): number => segStart(n) * MM;
/** The tail end. */
export const TAIL = LENGTH * MM;

/** Where each part sits along the body (x), front to back. */
export const PARTS = {
  pharynx: [seg(ORGANS.pharynx[0]), seg(ORGANS.pharynx[1] + 1)],
  esophagus: [seg(ORGANS.esophagus[0]), seg(ORGANS.esophagus[1] + 1)],
  crop: [seg(ORGANS.crop[0]), seg(ORGANS.crop[1] + 1)],
  gizzard: [seg(ORGANS.gizzard[0]), seg(ORGANS.gizzard[1] + 1)],
  intestine: [seg(ORGANS.intestineFrom), TAIL - 0.3],
} as const;

/** The crop, middle of the gizzard. */
export const CROP_X = (PARTS.crop[0] + PARTS.crop[1]) / 2;
export const GIZZARD_X = (PARTS.gizzard[0] + PARTS.gizzard[1]) / 2;
/** Where the body is cut open to (the model's cutaway); behind it the wall is whole. */
export const OPEN_TO = seg(CUT_END);
/** The mouth's height: the front of the gut, under the prostomium. */
export const MOUTH_Y = gutCentreY(0.1, sampleBody(0.1, { s: 0, w: 0, h: 0, yc: 0 })) * MM;

/**
 * The leaf in front of the mouth: its edge, where the bite comes off (Matt, 2026-10-23: "how does
 * the worm get the small part off the leaf?"). The pharynx reaches out, grips the edge, tugs twice
 * (the leaf bends toward the mouth) and tears a bite off at TEAR_AT, leaving a notch.
 */
export const NOTCH_X = -1.08;
export const NOTCH_Y = MOUTH_Y + 0.05;
export const BITE_R = 0.26;
export const TEAR_AT = 18.9;
/** How hard the pharynx pulls on the leaf (0 to 1): two tugs, then the bite tears off. */
export const TUG: readonly Key[] = [[17.4, 0], [17.8, 1], [18.1, 0.2], [18.6, 1], [TEAR_AT, 1], [19.15, 0]];
/** How far a full tug pulls the leaf's edge toward the mouth. */
export const TUG_X = 0.12;

/**
 * The bite once it is torn off: where it is along the body, `[t, x, y]`, y above the gut's middle. The pharynx pulls it in,
 * it slides down to the crop, waits, goes on into the gizzard (where it is ground up), and leaves
 * it as crumbs that travel down the intestine. By `casts` the crumbs ride along with the camera to
 * the tail (a time-lapse), turn into casts and are pushed out of the back end one by one.
 */
export const FOOD: readonly Key[] = [
  [INSIDE_FROM, NOTCH_X + TUG_X, 0.05],
  [TEAR_AT, NOTCH_X + TUG_X, 0.05],
  [20.3, PARTS.pharynx[0] + 0.3, 0],
  [22.2, PARTS.pharynx[1] - 0.2, 0],
  [24.4, CROP_X, 0],
  [27, CROP_X, 0],
  [28, GIZZARD_X, 0],
  [34, GIZZARD_X, 0],
  [35, PARTS.intestine[0] + 0.6, 0],
  [41, OPEN_TO - 0.4, 0],
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
  [36, PARTS.intestine[0] + 1.6, 3.6, 0.5],
  [41, OPEN_TO - 0.8, 3.6, 0.5],
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
const at = (id: AnatomyPartId): [number, number] => {
  const p = ANCHORS[id].at();
  return [p.x * MM, p.y * MM];
};
const label = (name: string, id: AnatomyPartId, side: 1 | -1, part?: BodyPart): PartLabel => {
  const [x, y] = at(id);
  return { name, part, x, y, side };
};
export const LABELS: readonly PartLabel[] = [
  { name: 'Mouth', part: 'mouth', x: 0.02, y: MOUTH_Y, side: -1 },
  label('Brain', 'brain', 1),
  label('Pharynx', 'pharynx', -1, 'pharynx'),
  label('Hearts', 'hearts', 1),
  label('Esophagus', 'esophagus', -1),
  label('Crop', 'crop', 1, 'crop'),
  label('Gizzard', 'gizzard', -1, 'gizzard'),
  label('Intestine', 'intestine', 1, 'intestine'),
  label('Blood vessel', 'dorsalVessel', 1),
  label('Nerve cord', 'nerveCord', -1),
  { name: 'Back end', part: 'casts', x: TAIL - 0.08, y: 0, side: 1 },
];
/** Where the labels sit, above or below the worm's middle line. */
export const LABEL_Y = 1.22;
