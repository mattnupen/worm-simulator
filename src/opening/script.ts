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

/**
 * The action was blocked out at 14.4 s; Matt asked for it a little slower, at 20 s (2026-10-16).
 * Action times below are written as blocked out and stretched by SLOW; the captions and the worm's
 * moves are written in real seconds.
 */
const SLOW = 20 / 14.4;
const at = (t: number): number => t * SLOW;
const slow = (keys: readonly Key[]): Key[] => keys.map(([t, ...v]) => [t * SLOW, ...v]);

/** When the scene hands over to play: the camera has eased into the game's view by now. */
export const OPENING_END = 20;
/** The camera holds still until here, then eases into the game's follow camera by EASE_END. */
export const EASE_START = at(11.8);
export const EASE_END = at(14.0);

/**
 * The fixed camera: low on the leaves behind the worm's left, clear of the sedge and ferns, looking
 * across at the bus's door, with the tub in the middle and the big leaf to the right.
 */
export const CAMERA = { x: -5, y: 1.2, z: -4.6, lookX: 24, lookY: 0.8, lookZ: 12 } as const;

/**
 * The worm: hidden in the bait tub until it spills, then working its way out of the soil (Matt:
 * "better animation of the worm crawling from the dirt"): it inches out, stops and swings its head
 * one way and the other as if feeling around, then crawls off with a slight wiggle toward the big
 * leaf. `moves` are [from (s), forward push 0..1 (move.y), turn (move.x: + is right)].
 */
export const WORM = {
  /** It shows (curled in the cup's soil, see wormStart) when the cup lands. */
  showAt: at(5.0),
  /**
   * Out of the cup's mouth (facing LIE_YAW), slowly through the pile, a look left and right (turns
   * in place), then a curve left round toward the big leaf, and on with a wiggle. A negative turn is
   * left: from the mouth's heading, left swings the worm toward +z, the leaf.
   */
  moves: [
    [7.4, 0.3, 0],
    [9.4, 0.5, 0],
    [10.4, 0.1, -0.55],
    [11.0, 0.1, 0.55],
    [11.6, 0.6, -0.45],
    [12.8, 0.75, 0],
  ] as readonly (readonly [number, number, number])[],
  /** While crawling off, the turn sways this much either way, this many times a second. */
  wiggle: 0.18,
  wiggleHz: 0.9,
  /** It stops once its head is this far along +z: just out from under the big leaf. */
  stopZ: 7.8,
} as const;

/**
 * Where the worm starts (`count` points `spacing` apart, head first, x and z): curled in a U in the
 * fallen cup, its head just inside the mouth, facing out (LIE_YAW). Hidden until the cup lands, then
 * the cup's soil and the pile cover it until it crawls out.
 */
export function wormStart(count: number, spacing: number): { x: number; z: number }[] {
  const dx = Math.sin(LIE_YAW);
  const dz = Math.cos(LIE_YAW);
  // Across the mouth (a quarter turn from the facing).
  const px = dz;
  const pz = -dx;
  const mouth = 0.55;
  const back = 0.85;
  const r = 0.4;
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = i * spacing;
    // Down into the cup, round the bend, and back toward the mouth beside itself.
    let a: number; // along the facing, from the cup's middle
    let c: number; // across
    if (d <= back) {
      a = mouth - d;
      c = 0;
    } else if (d <= back + Math.PI * r) {
      const th = (d - back) / r;
      a = mouth - back - Math.sin(th) * r;
      c = r - Math.cos(th) * r;
    } else {
      a = mouth - back + (d - back - Math.PI * r);
      c = 2 * r;
    }
    out.push({ x: CUP_AT.x + dx * a + px * c, z: CUP_AT.z + dz * a + pz * c });
  }
  return out;
}

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
  stopAt: at(2.0),
  /** The door folds open over this time. */
  doorOpen: [at(2.0), at(2.35)] as const,
  /** The door closes behind the teacher. */
  doorClose: [at(14.0), at(14.3)] as const,
  /** Height of the bottom step above the ground (about 40 cm). */
  stepY: 9,
} as const;

/** Where the bottom step is when the bus has stopped: people step on and off here. */
export const STEP = { x: 22.6, z: 6 } as const;

/** The tackle box set down on the leaves (its middle; it is 9.3 long along z, 4.7 wide and tall). */
export const BOX = { x: 4.85, z: -8.5, dropAt: at(3.9), dropped: at(4.25), liftAt: at(12.55), lifted: at(12.8) } as const;

/**
 * The teacher's feet (their middle, on the ground), walked at a steady speed between keys:
 * down the bus step, over to set the box down, across to the spilled tub, back for the box and up
 * into the bus.
 */
export const TEACHER_PATH: readonly Key[] = slow([
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
]);
/** Which way the teacher faces (yaw: 0 is +z, -pi/2 is toward the camera). */
export const TEACHER_YAW: readonly Key[] = slow([
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
]);
/** The teacher shows from stepping out (before, inside the bus) until back inside. */
export const TEACHER_SHOWN = [at(2.1), at(14.3)] as const;

/**
 * The kids: each steps off the bottom step at its time and runs off the right of the screen. Only
 * shoes and legs show.
 */
export const KIDS: readonly { at: number; endX: number; endZ: number; shoe: number; pants: number }[] = [
  { at: at(5.3), endX: 11, endZ: 44, shoe: 0x4f86c6, pants: 0x3b4f7a },
  { at: at(5.75), endX: 13.5, endZ: 46, shoe: 0xd0573f, pants: 0x2f2f33 },
  { at: at(6.15), endX: 10, endZ: 45, shoe: 0x8a6fc2, pants: 0x9a8a68 },
  { at: at(6.6), endX: 12.5, endZ: 47, shoe: 0x5e9e4c, pants: 0x55606b },
  { at: at(7.0), endX: 11.5, endZ: 44, shoe: 0xe0b33a, pants: 0x3b4f7a },
];
/** A kid's path: the step, the ground just off it, then a run off screen. */
export function kidPath(k: { at: number; endX: number; endZ: number }): Key[] {
  return [
    [k.at, STEP.x, BUS.stepY, STEP.z],
    [k.at + at(0.25), 19.5, 0, 7.5],
    [k.at + at(1.25), k.endX, 0, k.endZ],
  ];
}

/**
 * How the fallen cup lies: turned so its mouth faces the camera's side, so the camera sees
 * the soil inside and the pile tumbling out. It lands behind the worm's spawn, so the pile's front
 * lumps lie over the worm (at the origin).
 */
export const LIE_YAW = -1.1;
/** Where the fallen cup's middle lies. */
export const CUP_AT = { x: 2.49, z: -1.27 } as const;

/**
 * The bait tub: [t, x, y, z, tip about x, roll about z, turn about y]. It rides on the box, rocks, tips off its
 * end, lands on its side with its open end toward +z (the lid pops off) and lies there until the
 * teacher stands it up and lifts it away. Sampled at a steady rate, so the fall speeds up.
 */
export const TUB: readonly Key[] = slow([
  [4.3, 3.9, 5.4, -5.7, 0, 0, 0],
  [4.5, 3.9, 5.4, -5.7, 0.12, 0, 0],
  [4.62, 3.9, 5.4, -5.7, -0.05, 0, 0],
  [4.75, 3.6, 5.3, -5.1, 0.6, 0.1, 0],
  [4.92, 1.6, 2.6, -3.9, 1.35, 0.25, 0],
  [5.0, CUP_AT.x, 1.45, CUP_AT.z, Math.PI / 2, 0, LIE_YAW],
  [5.1, CUP_AT.x, 1.7, CUP_AT.z, 1.5, 0.05, LIE_YAW],
  [5.22, CUP_AT.x, 1.45, CUP_AT.z, Math.PI / 2, 0, LIE_YAW],
  [11.0, CUP_AT.x, 1.45, CUP_AT.z, Math.PI / 2, 0, LIE_YAW],
  [11.3, 0.9, 4.0, -2.4, 0, 0, 0],
  [11.6, 0.9, 4.0, -2.4, 0, 0, 0],
  [12.0, 1.5, 32, -2.2, 0, 0, 0],
]);
/** Where the tub sits on the box, in the box's frame (it is set down turned half round): it rides along until it falls. */
export const TUB_ON_BOX = { x: 0.95, y: 3.05, z: -2.8 } as const;

/**
 * The lid: [t, x, y, z, turn about x]. It flies off at the landing, back toward the camera's left
 * (clear of the worm's way out), and is pressed back on.
 */
export const LID: readonly Key[] = slow([
  [5.0, 1.8, 1.45, -0.92, Math.PI / 2],
  [5.2, 2.0, 3.0, -4.0, 3.5],
  [5.45, 2.2, 0.15, -6.2, 2 * Math.PI],
  [11.15, 2.2, 0.15, -6.2, 2 * Math.PI],
  [11.45, 0.9, 4.77, -2.4, 2 * Math.PI],
  [11.6, 0.9, 4.77, -2.4, 2 * Math.PI],
  [12.0, 1.5, 32.77, -2.2, 2 * Math.PI],
]);
/** The lid snaps on here (the click). */
export const LID_ON = at(11.45);

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
export const SOIL_SIZE: readonly Key[] = slow([
  [5.0, 0], [5.25, 1], [9.95, 1], [10.95, 0],
]);

/** The teacher's hands, [t, x, y, z]: down from above to scoop the soil, stand the tub up, lid on. */
export const RIGHT_HAND: readonly Key[] = slow([
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
]);
export const LEFT_HAND: readonly Key[] = slow([
  [9.6, 2.0, 26, -4.5],
  [10.0, 3.0, 7, -6.2],
  [10.9, 3.0, 7, -6.2],
  [11.15, 2.2, 0.7, -6.2],
  [11.45, 0.9, 5.6, -2.4],
  [11.6, 0.9, 5.6, -2.4],
  [12.0, 0.9, 33.3, -2.4],
]);
/** The hands show while they are near the ground. */
export const HANDS_SHOWN = [at(9.6), at(12.0)] as const;

/** A line on screen: who says it (none: a sound, in brackets), and when. Its words are in TEXT. */
export interface Caption { from: number; to: number; who: 'kid' | 'teacher' | null; line: TextKey }

/**
 * Everything the scene says or sounds like, in order, always on screen (captions carry it all;
 * sound only adds), in real seconds. Simple words for 6th graders. Each spoken line stays up long
 * enough to read. The first kid speaks from the bus, before the kids get off.
 */
export const CAPTIONS: readonly Caption[] = [
  { from: 0.3, to: 2.7, who: null, line: 'openingBus' },
  { from: 2.7, to: 4.6, who: null, line: 'openingDoor' },
  { from: 4.6, to: 6.9, who: 'kid', line: 'openingKidLine' },
  { from: 6.9, to: 7.3, who: null, line: 'openingThud' },
  { from: 7.3, to: 9.5, who: 'kid', line: 'openingKidFish' },
  { from: 9.5, to: 11.1, who: 'teacher', line: 'openingPoles' },
  { from: 11.1, to: 12.7, who: 'teacher', line: 'openingOops' },
  { from: 12.7, to: 16.2, who: 'teacher', line: 'openingInvasive' },
  { from: 16.2, to: 19.8, who: 'teacher', line: 'openingLoose' },
];

/** The caption showing at `t`, or null between lines. */
export function captionAt(t: number): Caption | null {
  for (const c of CAPTIONS) if (t >= c.from && t < c.to) return c;
  return null;
}

/**
 * The worm's move this step (WORM.moves), written into `out`: still until it starts, then its
 * moves in turn, the last with a gentle wiggle, until its head reaches WORM.stopZ (by then it
 * heads along +z); then still.
 */
export function wormMove(t: number, headZ: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = out.y = 0;
  if (headZ >= WORM.stopZ) return out;
  const moves = WORM.moves;
  for (let i = moves.length - 1; i >= 0; i--) {
    if (t < moves[i][0]) continue;
    out.y = moves[i][1];
    out.x = moves[i][2];
    if (i === moves.length - 1) out.x += WORM.wiggle * Math.sin((t - moves[i][0]) * Math.PI * 2 * WORM.wiggleHz);
    break;
  }
  return out;
}
