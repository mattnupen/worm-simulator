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

function freeOfProps(x: number, z: number, r: number): boolean {
  return logSegmentDistance(x, z) > heroLog().radius + r && rocks().every((k) => Math.hypot(x - k.x, z - k.z) > k.size + r);
}

/** Every kind of clutter gets at least this many items, where they fit. */
const MIN_EACH = 3;

/**
 * Ground clutter: mushroom clusters, sedge tufts and fern clumps (the mode's count and seed by
 * default). The first four are mushrooms growing beside the log; the rest are scattered in
 * random order, so any prefix (the density tiers draw a prefix) is an even thinning. In the big
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
  for (let k = 0; k < Math.min(4, count); k++) {
    const along = (k / 3 - 0.5) * stretch * 0.7 + (rng() - 0.5) * 0.3;
    const side = k % 2 === 0 ? 1 : -1;
    const off = log.radius + (0.12 + rng() * 0.1) * spec.mushroom;
    out.push({
      x: log.x + dx * along - dz * off * side,
      z: log.z + dz * along + dx * off * side,
      rot: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.4, kind: 'mushrooms',
    });
  }
  let guard = 0;
  while (out.length < count && guard++ < count * 200) {
    const x = (rng() * 2 - 1) * PLAY_HALF;
    const z = (rng() * 2 - 1) * PLAY_HALF;
    const pick = rng();
    const kind: ClutterKind = pick < 0.3 ? 'mushrooms' : pick < 0.72 ? 'sedge' : 'fern';
    const rot = rng() * Math.PI * 2;
    const scale = 0.7 + rng() * 0.6;
    const r = clutterRadius(kind, scale, spec);
    if (keepsClear(x, z, r) && freeOfProps(x, z, r)) out.push({ x, z, rot, scale, kind });
  }
  for (const kind of CLUTTER_KINDS) {
    for (let tries = 0; tries < 4000 && out.filter((c) => c.kind === kind).length < MIN_EACH; tries++) {
      const x = (rng() * 2 - 1) * PLAY_HALF;
      const z = (rng() * 2 - 1) * PLAY_HALF;
      const rot = rng() * Math.PI * 2;
      const scale = 0.7 + rng() * 0.6;
      const r = clutterRadius(kind, scale, spec);
      if (!keepsClear(x, z, r) || !freeOfProps(x, z, r)) continue;
      if (out.some((c) => c.kind === kind && Math.hypot(c.x - x, c.z - z) < r + clutterRadius(kind, c.scale, spec))) continue;
      const most = CLUTTER_KINDS.reduce((a, b) => (out.filter((c) => c.kind === b).length > out.filter((c) => c.kind === a).length ? b : a));
      let last = out.length - 1;
      while (last >= 4 && out[last].kind !== most) last--;
      if (last < 4) break;
      out[last] = { x, z, rot, scale, kind };
    }
  }
  return out;
}
