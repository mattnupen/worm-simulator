import type { TextKey } from '../content/text';
import type { Key } from './keys';

/**
 * The opening scene's script (Matt approved the storyboard, 2026-10-16: one fixed camera on the
 * ground, the bus pulls in, the teacher sets down a tackle box, the bait tub falls off it, the worm
 * crawls out as the kids run past, the teacher scoops up the rest, and the camera eases into play).
 * Pure data: times in seconds from the start, places in world units (1 m is about 23.3 units; the
 * worm is 3.5 long). The worm spawns at the origin facing +z; the camera sits to its left looking
 * +x, so +z runs to the right of the screen. A key's `y` is its height above the litter top under it
 * (the bus's, above the bare ground), so the props sit on the leaves wherever the floor rolls.
 */

/** When the scene hands over to play: the camera has eased into the game's view by now. */
export const OPENING_END = 14.4;
/** The camera holds still until here, then eases into the game's follow camera by EASE_END. */
export const EASE_START = 11.8;
export const EASE_END = 14.0;

/**
 * The fixed camera: low on the leaves behind the worm's left, clear of the sedge and ferns, looking
 * across at the bus's door, with the tub in the middle and the big leaf to the right.
 */
export const CAMERA = { x: -8, y: 1.3, z: -6, lookX: 24, lookY: 3.5, lookZ: 6 } as const;

/** The worm: hidden in the bait tub until it spills, then crawling forward out of the soil. */
export const WORM = {
  /** It shows (under the spilled soil) when the tub lands. */
  showAt: 5.0,
  /** It starts crawling, and how hard it is pushed forward (move.y: 1 is full speed). */
  crawlAt: 5.4,
  push: 0.7,
  /** It stops once its head is this far along +z: just out from under the big leaf. */
  stopZ: 7.8,
} as const;

/** The big sugar maple leaf it hides under: centre, size (longest side) and turn. */
export const LEAF = { x: 0.15, z: 5.6, size: 3.8, yaw: 1.2 } as const;

/**
 * The bus: its front-centre at ground level moves along a curve from behind the camera's left
 * (off screen) to where it parks broadside, its door side facing the camera, easing to a stop.
 */
export const BUS = {
  /** Start, bend and stop of its path (x, z), and when it stops. */
  from: { x: 36, z: -190 },
  via: { x: 53, z: -70 },
  to: { x: 53, z: 22 },
  stopAt: 2.0,
  /** The door folds open over this time. */
  doorOpen: [2.0, 2.35] as const,
  /** The door closes behind the teacher. */
  doorClose: [14.0, 14.3] as const,
  /** Height of the bottom step above the ground (about 40 cm). */
  stepY: 9,
} as const;

/** Where the bottom step is when the bus has stopped: people step on and off here. */
export const STEP = { x: 22.6, z: 6 } as const;

/** The tackle box set down on the leaves (its middle; it is 9.3 long along z, 4.7 wide and tall). */
export const BOX = { x: 4.85, z: -8.5, dropAt: 3.9, dropped: 4.25, liftAt: 12.55, lifted: 12.8 } as const;

/**
 * The teacher's feet (their middle, on the ground), walked at a steady speed between keys:
 * down the bus step, over to set the box down, across to the spilled tub, back for the box and up
 * into the bus.
 */
export const TEACHER_PATH: readonly Key[] = [
  [2.2, STEP.x, BUS.stepY, STEP.z],
  [2.65, 19.5, 0, 5],
  [3.9, 9.9, 0, -8.5],
  [8.9, 9.9, 0, -8.5],
  [9.7, 4.3, 0, -1.8],
  [11.9, 4.3, 0, -1.8],
  [12.5, 9.9, 0, -6.2],
  [12.8, 9.9, 0, -6.2],
  [13.9, 20.5, 0, 5.5],
  [14.2, STEP.x, BUS.stepY, STEP.z],
];
/** Which way the teacher faces (yaw: 0 is +z, -pi/2 is toward the camera). */
export const TEACHER_YAW: readonly Key[] = [
  [2.2, -Math.PI / 2],
  [2.7, -2.53],
  [3.9, -2.53],
  [4.2, -Math.PI],
  [6.8, -Math.PI],
  [7.2, -0.3],
  [8.9, -0.3],
  [9.2, -0.7],
  [9.7, -Math.PI / 2],
  [11.9, -Math.PI / 2],
  [12.15, -4.08],
  [12.8, -4.08],
  [13.0, -5.53],
  [14.2, -5.53],
];
/** The teacher shows from stepping out (before, inside the bus) until back inside. */
export const TEACHER_SHOWN = [2.1, 14.3] as const;

/**
 * The kids: each steps off the bottom step at its time and runs off the right of the screen. Only
 * shoes and legs show.
 */
export const KIDS: readonly { at: number; endX: number; endZ: number; shoe: number; pants: number }[] = [
  { at: 5.3, endX: 11, endZ: 44, shoe: 0x4f86c6, pants: 0x3b4f7a },
  { at: 5.75, endX: 13.5, endZ: 46, shoe: 0xd0573f, pants: 0x2f2f33 },
  { at: 6.15, endX: 10, endZ: 45, shoe: 0x8a6fc2, pants: 0x9a8a68 },
  { at: 6.6, endX: 12.5, endZ: 47, shoe: 0x5e9e4c, pants: 0x55606b },
  { at: 7.0, endX: 11.5, endZ: 44, shoe: 0xe0b33a, pants: 0x3b4f7a },
];
/** A kid's path: the step, the ground just off it, then a run off screen. */
export function kidPath(k: { at: number; endX: number; endZ: number }): Key[] {
  return [
    [k.at, STEP.x, BUS.stepY, STEP.z],
    [k.at + 0.25, 19.5, 0, 7.5],
    [k.at + 1.25, k.endX, 0, k.endZ],
  ];
}

/**
 * How the fallen cup lies: turned so its mouth faces the camera's side, so the camera sees
 * the soil inside and the pile tumbling out. It lands behind the worm's spawn, so the pile's front
 * lumps lie over the worm (at the origin).
 */
export const LIE_YAW = -1.1;

/**
 * The bait tub: [t, x, y, z, tip about x, roll about z, turn about y]. It rides on the box, rocks, tips off its
 * end, lands on its side with its open end toward +z (the lid pops off) and lies there until the
 * teacher stands it up and lifts it away. Sampled at a steady rate, so the fall speeds up.
 */
export const TUB: readonly Key[] = [
  [4.3, 3.9, 5.4, -5.7, 0, 0, 0],
  [4.5, 3.9, 5.4, -5.7, 0.12, 0, 0],
  [4.62, 3.9, 5.4, -5.7, -0.05, 0, 0],
  [4.75, 3.6, 5.3, -5.1, 0.6, 0.1, 0],
  [4.92, 1.6, 2.6, -3.9, 1.35, 0.25, 0],
  [5.0, 2.49, 1.45, -1.27, Math.PI / 2, 0, LIE_YAW],
  [5.1, 2.49, 1.7, -1.27, 1.5, 0.05, LIE_YAW],
  [5.22, 2.49, 1.45, -1.27, Math.PI / 2, 0, LIE_YAW],
  [11.0, 2.49, 1.45, -1.27, Math.PI / 2, 0, LIE_YAW],
  [11.3, 0.9, 4.0, -2.4, 0, 0, 0],
  [11.6, 0.9, 4.0, -2.4, 0, 0, 0],
  [12.0, 1.5, 32, -2.2, 0, 0, 0],
];
/** Where the tub sits on the box, in the box's frame (it is set down turned half round): it rides along until it falls. */
export const TUB_ON_BOX = { x: 0.95, y: 3.05, z: -2.8 } as const;

/**
 * The lid: [t, x, y, z, turn about x]. It flies off at the landing, back toward the camera's left
 * (clear of the worm's way out), and is pressed back on.
 */
export const LID: readonly Key[] = [
  [5.0, 1.8, 1.45, -0.92, Math.PI / 2],
  [5.2, -1.2, 3.4, -4.6, 3.5],
  [5.45, -2.4, 0.15, -6.8, 2 * Math.PI],
  [11.15, -2.4, 0.15, -6.8, 2 * Math.PI],
  [11.45, 0.9, 4.77, -2.4, 2 * Math.PI],
  [11.6, 0.9, 4.77, -2.4, 2 * Math.PI],
  [12.0, 1.5, 32.77, -2.2, 2 * Math.PI],
];
/** The lid snaps on here (the click). */
export const LID_ON = 11.45;

/**
 * The bait cup (Matt's photo, 2026-10-16: a round, squat night crawler cup, milky white with a
 * turquoise snap-on lid), in its own frame: axis y, open end at +y, its middle at the origin.
 * About 12 cm across and 6 cm deep.
 */
export const CUP = { bottom: -0.7, top: 0.65, rBottom: 1.35, rTop: 1.55, lidR: 1.68, lidHalf: 0.12 } as const;

/**
 * The spilled soil: a pile tumbling out of the cup's mouth and spreading the way it faces, its middle
 * here (it grows and shrinks from there). It covers the worm until it crawls out.
 */
export const SOIL = { x: 1.07, z: -0.55, yaw: LIE_YAW } as const;
/** [t, size 0..1] of the spilled pile. */
export const SOIL_SIZE: readonly Key[] = [
  [5.0, 0], [5.25, 1], [9.95, 1], [10.95, 0],
];

/** The teacher's hands, [t, x, y, z]: down from above to scoop the soil, stand the tub up, lid on. */
export const RIGHT_HAND: readonly Key[] = [
  [9.6, 2.5, 26, -2],
  [9.95, 0.9, 1.2, -0.4],
  [10.4, 0.4, 1.0, -2.0],
  [10.55, 1.5, 2.6, -1.0],
  [10.7, 0.9, 1.1, -0.2],
  [10.95, 0.4, 1.0, -2.0],
  [11.05, 0.7, 2.0, -3.2],
  [11.3, 2.3, 4.0, -2.4],
  [11.6, 2.3, 4.0, -2.4],
  [12.0, 2.9, 32, -2.2],
];
export const LEFT_HAND: readonly Key[] = [
  [9.6, 2.0, 26, -4.5],
  [10.0, 2.6, 7, -4.6],
  [10.9, 2.6, 7, -4.6],
  [11.15, -2.4, 0.7, -6.8],
  [11.45, 0.9, 5.6, -2.4],
  [11.6, 0.9, 5.6, -2.4],
  [12.0, 0.9, 33.3, -2.4],
];
/** The hands show while they are near the ground. */
export const HANDS_SHOWN = [9.6, 12.0] as const;

/** A line on screen: who says it (none: a sound, in brackets), and when. Its words are in TEXT. */
export interface Caption { from: number; to: number; who: 'kid' | 'teacher' | null; line: TextKey }

/**
 * Everything the scene says or sounds like, in order, always on screen (captions carry it all;
 * sound only adds). Simple words for 6th graders. Each spoken line stays up long enough to read.
 */
export const CAPTIONS: readonly Caption[] = [
  { from: 0.3, to: 1.9, who: null, line: 'openingBus' },
  { from: 1.9, to: 3.4, who: null, line: 'openingDoor' },
  { from: 5.0, to: 5.5, who: null, line: 'openingThud' },
  { from: 5.5, to: 7.4, who: 'kid', line: 'openingKidLine' },
  { from: 7.4, to: 9.1, who: 'teacher', line: 'openingPoles' },
  { from: 9.1, to: 12.9, who: 'teacher', line: 'openingOops' },
];

/** The caption showing at `t`, or null between lines. */
export function captionAt(t: number): Caption | null {
  for (const c of CAPTIONS) if (t >= c.from && t < c.to) return c;
  return null;
}

/**
 * The worm's push this step: nothing until it crawls, then forward until its head reaches
 * WORM.stopZ (it travels straight along +z from the spawn), then still.
 */
export function wormPush(t: number, headZ: number): number {
  return t >= WORM.crawlAt && headZ < WORM.stopZ ? WORM.push : 0;
}
