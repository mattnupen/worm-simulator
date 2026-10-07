import { mulberry32 } from '../core/random';
import { PLAY_HALF } from './terrain';
import { treeSites, trunkFootOf } from './treeSites';
import { clearOfPaths } from './wormPaths';
import { REAL_SCALE, type LogSite, type RockSite } from './realScale';

/**
 * Where the forest-floor props go, at real size (realScale.ts). Pure. Everything stays out of the worm's way: the straight run ahead of the
 * spawn and the speed test's auto-drive loop (wormPaths.ts), the trailing camera, and the trunks.
 */
const TRUNK_CLEAR = 1.0;

/** True when a prop of `radius` at (x, z) is clear of the worm paths, trunks and world edge. */
export function keepsClear(x: number, z: number, radius: number): boolean {
  if (!clearOfPaths(x, z, radius)) return false;
  if (Math.abs(x) > PLAY_HALF - radius || Math.abs(z) > PLAY_HALF - radius) return false;
  // Each trunk keeps the larger of TRUNK_CLEAR and its footprint.
  return treeSites().every((t) => Math.hypot(x - t.x, z - t.z) > Math.max(TRUNK_CLEAR, trunkFootOf(t)) + radius);
}

/** A drawn rock reaches about this much past its size at ground level (its lumpy, wide flank). */
export const ROCK_FOOT = 1.2;
/** The drawn log is this much wider than its radius (bark lumps), at the height of the worm... */
export const LOG_FOOT = 1.15;
/** ...and its jagged broken ends reach this far past its length, per unit of its grow (writeLog). */
export const LOG_END = 0.18;

/** How far the log's broken ends reach past its length (LOG_END times its grow). */
export function logEnd(): number {
  return LOG_END * REAL_SCALE.log;
}

/** The hero prop, a mossy fallen paper birch: its radius and length at real size. */
export function heroLog(): LogSite {
  const s = REAL_SCALE.logSite;
  return { x: s.x, z: s.z, yaw: s.yaw, length: s.length * REAL_SCALE.log, radius: s.radius * REAL_SCALE.log };
}

/** Distance from (x, z) to the log's centre line. */
export function logSegmentDistance(x: number, z: number): number {
  const log = heroLog();
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  const t = Math.max(-log.length / 2, Math.min(log.length / 2, (x - log.x) * dx + (z - log.z) * dz));
  return Math.hypot(x - (log.x + dx * t), z - (log.z + dz * t));
}

let rockCache: readonly RockSite[] | null = null;

/** Lichen-spotted granite boulders (glacial erratics), at their drawn size. */
export function rocks(): readonly RockSite[] {
  rockCache ??= REAL_SCALE.rocks.map((r) => ({ x: r.x, z: r.z, size: r.size * REAL_SCALE.rock }));
  return rockCache;
}

export type ClutterKind = 'mushrooms' | 'sedge' | 'fern';
export const CLUTTER_KINDS: readonly ClutterKind[] = ['mushrooms', 'sedge', 'fern'];

export interface ClutterItem { x: number; z: number; rot: number; scale: number; kind: ClutterKind }

/** How much bigger than its base size a clutter kind is drawn. */
export function clutterGrow(kind: ClutterKind): number {
  return kind === 'mushrooms' ? REAL_SCALE.mushroom : kind === 'fern' ? REAL_SCALE.fern : REAL_SCALE.sedge;
}

/** How far a clutter item of `kind` and `scale` reaches from its centre, as drawn. */
export function clutterRadius(kind: ClutterKind, scale: number): number {
  return (kind === 'fern' ? 0.6 : 0.3) * scale * clutterGrow(kind);
}

/**
 * How far a grown clutter item's base reaches from its centre, per unit of scale times grow: all
 * it draws below a tenth of its height, measured from propGeometry's writers over many seeds (a
 * fern's frond roots and drooping tips 0.47, a sedge tuft's blade roots 0.05). A mushroom cluster
 * is low, so it counts whole (0.65). Fronds and blades above the base may lean over a prop.
 */
export const CLUTTER_BASE: Readonly<Record<ClutterKind, number>> = { fern: 0.5, sedge: 0.1, mushrooms: 0.7 };

/** How far a clutter item's base reaches (CLUTTER_BASE). */
export function clutterBase(kind: ClutterKind, scale: number): number {
  return CLUTTER_BASE[kind] * scale * clutterGrow(kind);
}

/** Distance from (x, z) to the log's centre line, its broken ends included (as obstacles.ts). */
function logEndsDistance(x: number, z: number): number {
  const log = heroLog();
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  const half = log.length / 2 + logEnd();
  const t = Math.max(-half, Math.min(half, (x - log.x) * dx + (z - log.z) * dz));
  return Math.hypot(x - (log.x + dx * t), z - (log.z + dz * t));
}

/** True when `c`'s base, as drawn, stands off every rock and the log (their drawn footprints). */
export function clutterBaseClear(c: ClutterItem): boolean {
  const r = clutterBase(c.kind, c.scale);
  return logEndsDistance(c.x, c.z) > heroLog().radius * LOG_FOOT + r
    && rocks().every((k) => Math.hypot(c.x - k.x, c.z - k.z) > k.size * ROCK_FOOT + r);
}

/**
 * A grown mushroom cluster beside the log gets this many seeded tries (alternating sides) to fit;
 * if none fits it is skipped, and the scatter fills its place.
 */
const LOG_MUSHROOM_TRIES = 40;

/** Every kind of clutter gets at least this many items, where they fit. */
const MIN_EACH = 3;

/**
 * Ground clutter: mushroom clusters, sedge tufts and fern clumps (REAL_SCALE's count and seed by
 * default). The first four are mushrooms growing beside the log (only those that fit apart: a
 * wide cluster that cannot find a spot in LOG_MUSHROOM_TRIES is skipped, so two remain); the rest
 * are scattered in random order, so any prefix (the density tiers draw a prefix) is an even
 * thinning. Each item keeps its base off the drawn rocks and log (clutterBaseClear). A fern needs
 * so much room that random spots rarely fit one, so a kind with fewer than MIN_EACH items then
 * takes over the last items of the commonest kind.
 */
export function placeClutter(count = REAL_SCALE.clutter, seed = REAL_SCALE.clutterSeed): ClutterItem[] {
  const log = heroLog();
  const rng = mulberry32(seed);
  const out: ClutterItem[] = [];
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  // Along the log's middle stretch: the long log runs off into the distance.
  const stretch = Math.min(log.length, 8);
  for (let k = 0; k < Math.min(4, count); k++) {
    for (let tries = 0; tries < LOG_MUSHROOM_TRIES; tries++) {
      // The clusters wander along the log and stand off it by varied gaps, so they do not read as
      // a staged row.
      const along = (k / 3 - 0.5) * stretch * 0.7 + (rng() - 0.5) * stretch * 0.3;
      const side = (k + tries) % 2 === 0 ? 1 : -1;
      const gap = rng() * 0.6;
      const rot = rng() * Math.PI * 2;
      const scale = 0.8 + rng() * 0.4;
      // The whole cluster stands just off the drawn log, inside the world and off the rocks.
      const off = log.radius * LOG_FOOT + clutterBase('mushrooms', scale) + gap * REAL_SCALE.mushroom;
      const c: ClutterItem = {
        x: log.x + dx * along - dz * off * side,
        z: log.z + dz * along + dx * off * side,
        rot, scale, kind: 'mushrooms',
      };
      if (!(keepsClear(c.x, c.z, clutterBase('mushrooms', scale)) && clutterBaseClear(c))) continue;
      // The clusters are wide: one that would merge into an earlier one tries another spot.
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < clutterBase('mushrooms', o.scale) + clutterBase('mushrooms', scale))) continue;
      out.push(c);
      break;
    }
  }
  const byLog = out.length;
  // A grown item's base must also stay inside the world (WORLD_HALF). keepsClear only holds its
  // spacing radius inside PLAY_HALF, and a mushroom's base is wider than that, so the world-edge
  // limit on bases is enforced by test only (propPlacement.test.ts, "inside the world").
  let guard = 0;
  while (out.length < count && guard++ < count * 200) {
    const x = (rng() * 2 - 1) * PLAY_HALF;
    const z = (rng() * 2 - 1) * PLAY_HALF;
    const pick = rng();
    const kind: ClutterKind = pick < 0.3 ? 'mushrooms' : pick < 0.72 ? 'sedge' : 'fern';
    const rot = rng() * Math.PI * 2;
    const scale = 0.7 + rng() * 0.6;
    const r = clutterRadius(kind, scale);
    if (keepsClear(x, z, r) && clutterBaseClear({ x, z, rot, scale, kind })) out.push({ x, z, rot, scale, kind });
  }
  for (const kind of CLUTTER_KINDS) {
    for (let tries = 0; tries < 4000 && out.filter((c) => c.kind === kind).length < MIN_EACH; tries++) {
      const x = (rng() * 2 - 1) * PLAY_HALF;
      const z = (rng() * 2 - 1) * PLAY_HALF;
      const rot = rng() * Math.PI * 2;
      const scale = 0.7 + rng() * 0.6;
      const r = clutterRadius(kind, scale);
      if (!keepsClear(x, z, r) || !clutterBaseClear({ x, z, rot, scale, kind })) continue;
      if (out.some((c) => c.kind === kind && Math.hypot(c.x - x, c.z - z) < r + clutterRadius(kind, c.scale))) continue;
      const most = CLUTTER_KINDS.reduce((a, b) => (out.filter((c) => c.kind === b).length > out.filter((c) => c.kind === a).length ? b : a));
      let last = out.length - 1;
      while (last >= byLog && out[last].kind !== most) last--;
      if (last < byLog) break;
      out[last] = { x, z, rot, scale, kind };
    }
  }
  return out;
}
