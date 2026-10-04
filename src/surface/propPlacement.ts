import { mulberry32 } from '../core/random';
import { PLAY_HALF } from './terrain';
import { treeSites, trunkFootOf } from './treeSites';
import { clearOfPaths } from './wormPaths';
import { scaleSpec, type LogSite, type RockSite, type ScaleSpec } from './worldScale';

/**
 * Where the forest-floor props go, in the active scale mode (worldScale.ts). Pure apart from
 * reading the active spec. Everything stays out of the worm's way: the straight run ahead of the
 * spawn and the speed test's auto-drive loop (wormPaths.ts), the trailing camera, and the trunks.
 */
const TRUNK_CLEAR = 1.0;

/** True when a prop of `radius` at (x, z) is clear of the worm paths, trunks and world edge. */
export function keepsClear(x: number, z: number, radius: number): boolean {
  if (!clearOfPaths(x, z, radius)) return false;
  if (Math.abs(x) > PLAY_HALF - radius || Math.abs(z) > PLAY_HALF - radius) return false;
  // Classic's trunks keep TRUNK_CLEAR; a bigger trunk keeps its whole footprint.
  return treeSites().every((t) => Math.hypot(x - t.x, z - t.z) > Math.max(TRUNK_CLEAR, trunkFootOf(t)) + radius);
}

/** A drawn rock reaches about this much past its size at ground level (its lumpy, wide flank). */
export const ROCK_FOOT = 1.2;
/** The drawn log is this much wider than its radius (bark lumps), at the height of the worm... */
export const LOG_FOOT = 1.15;
/** ...and its jagged broken ends reach this far past its length, per unit of its grow (writeLog). */
export const LOG_END = 0.18;

/** How far the log's broken ends reach past its length in `spec`'s mode (LOG_END times its grow). */
export function logEnd(spec: ScaleSpec = scaleSpec()): number {
  return LOG_END * spec.log;
}

/** The hero prop, a mossy fallen paper birch, in `spec`'s mode: its radius and length scaled. */
export function heroLog(spec: ScaleSpec = scaleSpec()): LogSite {
  const s = spec.logSite;
  return { x: s.x, z: s.z, yaw: s.yaw, length: s.length * spec.log, radius: s.radius * spec.log };
}

/** Distance from (x, z) to the log's centre line. */
export function logSegmentDistance(x: number, z: number): number {
  const log = heroLog();
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  const t = Math.max(-log.length / 2, Math.min(log.length / 2, (x - log.x) * dx + (z - log.z) * dz));
  return Math.hypot(x - (log.x + dx * t), z - (log.z + dz * t));
}

let rockCache: { spec: ScaleSpec; rocks: readonly RockSite[] } | null = null;

/** Lichen-spotted granite boulders (glacial erratics) in the active mode, at their drawn size. */
export function rocks(): readonly RockSite[] {
  const spec = scaleSpec();
  if (rockCache?.spec !== spec) {
    rockCache = { spec, rocks: spec.rocks.map((r) => ({ x: r.x, z: r.z, size: r.size * spec.rock })) };
  }
  return rockCache.rocks;
}

export type ClutterKind = 'mushrooms' | 'sedge' | 'fern';
export const CLUTTER_KINDS: readonly ClutterKind[] = ['mushrooms', 'sedge', 'fern'];

export interface ClutterItem { x: number; z: number; rot: number; scale: number; kind: ClutterKind }

/** How much bigger than Classic a clutter kind is drawn in `spec`'s mode. */
export function clutterGrow(kind: ClutterKind, spec: ScaleSpec = scaleSpec()): number {
  return kind === 'mushrooms' ? spec.mushroom : kind === 'fern' ? spec.fern : spec.sedge;
}

/** How far a clutter item of `kind` and `scale` reaches from its centre, as drawn in `spec`'s mode. */
export function clutterRadius(kind: ClutterKind, scale: number, spec: ScaleSpec = scaleSpec()): number {
  return (kind === 'fern' ? 0.6 : 0.3) * scale * clutterGrow(kind, spec);
}

/**
 * How far a grown clutter item's base reaches from its centre, per unit of scale times grow: all
 * it draws below a tenth of its height, measured from propGeometry's writers over many seeds (a
 * fern's frond roots and drooping tips 0.47, a sedge tuft's blade roots 0.05). A mushroom cluster
 * is low, so it counts whole (0.65). Fronds and blades above the base may lean over a prop.
 */
export const CLUTTER_BASE: Readonly<Record<ClutterKind, number>> = { fern: 0.5, sedge: 0.1, mushrooms: 0.7 };

/** How far a clutter item's base reaches in `spec`'s mode (CLUTTER_BASE). */
export function clutterBase(kind: ClutterKind, scale: number, spec: ScaleSpec = scaleSpec()): number {
  return CLUTTER_BASE[kind] * scale * clutterGrow(kind, spec);
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

/** True when `c`'s base, as drawn in the active mode, stands off every rock and the log (their drawn footprints). */
export function clutterBaseClear(c: ClutterItem): boolean {
  const r = clutterBase(c.kind, c.scale);
  return logEndsDistance(c.x, c.z) > heroLog().radius * LOG_FOOT + r
    && rocks().every((k) => Math.hypot(c.x - k.x, c.z - k.z) > k.size * ROCK_FOOT + r);
}

/**
 * True when a clutter item at (x, z) keeps off the log and the rocks. Classic keeps Step 1a's rule
 * (its spacing radius against the log's radius and the rocks' size; its layout is pinned). Grown
 * clutter keeps its base off the drawn footprints (clutterBaseClear).
 */
function freeOfProps(x: number, z: number, kind: ClutterKind, scale: number, grown: boolean): boolean {
  if (grown) return clutterBaseClear({ x, z, rot: 0, scale, kind });
  const r = clutterRadius(kind, scale);
  return logSegmentDistance(x, z) > heroLog().radius + r && rocks().every((k) => Math.hypot(x - k.x, z - k.z) > k.size + r);
}

/**
 * A grown mushroom cluster beside the log gets this many seeded tries (alternating sides) to fit;
 * if none fits it is skipped, and the scatter fills its place.
 */
const LOG_MUSHROOM_TRIES = 40;

/** Every kind of clutter gets at least this many items, where they fit. */
const MIN_EACH = 3;

/**
 * Ground clutter: mushroom clusters, sedge tufts and fern clumps (the mode's count and seed by
 * default). The first four are mushrooms growing beside the log (grown, only those that fit
 * apart: a wide cluster that cannot find a spot in LOG_MUSHROOM_TRIES is skipped, so True has two
 * and Hybrid three); the rest are scattered in random order, so any prefix (the density tiers
 * draw a prefix) is an even thinning. In the big
 * modes a fern needs so much room that random spots rarely fit one, so a kind with fewer than
 * MIN_EACH items then takes over the last items of the commonest kind (Classic never needs this).
 */
export function placeClutter(count = scaleSpec().clutter, seed = scaleSpec().clutterSeed): ClutterItem[] {
  const spec = scaleSpec();
  const log = heroLog(spec);
  const rng = mulberry32(seed);
  const out: ClutterItem[] = [];
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  // Along the log's middle stretch: a log longer than Classic's runs off into the distance.
  const stretch = Math.min(log.length, 8);
  // The big modes grow their clutter and keep its base off the drawn props (Classic: Step 1a).
  const grown = CLUTTER_KINDS.some((k) => clutterGrow(k, spec) > 1);
  for (let k = 0; k < Math.min(4, count); k++) {
    for (let tries = 0; tries < (grown ? LOG_MUSHROOM_TRIES : 1); tries++) {
      // Grown, the clusters wander along the log and stand off it by varied gaps, so they do not
      // read as a staged row (the same draws as Classic, so Classic is unchanged).
      const along = (k / 3 - 0.5) * stretch * 0.7 + (rng() - 0.5) * (grown ? stretch * 0.3 : 0.3);
      const side = (k + tries) % 2 === 0 ? 1 : -1;
      const gap = rng() * (grown ? 0.6 : 0.1);
      const rot = rng() * Math.PI * 2;
      const scale = 0.8 + rng() * 0.4;
      // Grown, the whole cluster stands just off the drawn log, inside the world and off the rocks.
      const off = grown
        ? log.radius * LOG_FOOT + clutterBase('mushrooms', scale, spec) + gap * spec.mushroom
        : log.radius + (0.12 + gap) * spec.mushroom;
      const c: ClutterItem = {
        x: log.x + dx * along - dz * off * side,
        z: log.z + dz * along + dx * off * side,
        rot, scale, kind: 'mushrooms',
      };
      if (grown && !(keepsClear(c.x, c.z, clutterBase('mushrooms', scale, spec)) && clutterBaseClear(c))) continue;
      // Grown clusters are wide: one that would merge into an earlier one tries another spot.
      if (grown && out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < clutterBase('mushrooms', o.scale, spec) + clutterBase('mushrooms', scale, spec))) continue;
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
    const r = clutterRadius(kind, scale, spec);
    if (keepsClear(x, z, r) && freeOfProps(x, z, kind, scale, grown)) out.push({ x, z, rot, scale, kind });
  }
  for (const kind of CLUTTER_KINDS) {
    for (let tries = 0; tries < 4000 && out.filter((c) => c.kind === kind).length < MIN_EACH; tries++) {
      const x = (rng() * 2 - 1) * PLAY_HALF;
      const z = (rng() * 2 - 1) * PLAY_HALF;
      const rot = rng() * Math.PI * 2;
      const scale = 0.7 + rng() * 0.6;
      const r = clutterRadius(kind, scale, spec);
      if (!keepsClear(x, z, r) || !freeOfProps(x, z, kind, scale, grown)) continue;
      if (out.some((c) => c.kind === kind && Math.hypot(c.x - x, c.z - z) < r + clutterRadius(kind, c.scale, spec))) continue;
      const most = CLUTTER_KINDS.reduce((a, b) => (out.filter((c) => c.kind === b).length > out.filter((c) => c.kind === a).length ? b : a));
      let last = out.length - 1;
      while (last >= byLog && out[last].kind !== most) last--;
      if (last < byLog) break;
      out[last] = { x, z, rot, scale, kind };
    }
  }
  return out;
}
