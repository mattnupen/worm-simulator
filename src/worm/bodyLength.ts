import { WAVES, wormLength } from './wormMesh';

/**
 * How long the worm is (V4 spec 3): when a robin's tug breaks it, the front end lives on shorter,
 * full, then about 80%, then about 60%; a new life is full length. The body always has the same 16
 * points (every typed array keeps its size); only the gap between them changes. The body keeps its
 * thickness: a shorter worm lost its tail end, it is not a shrunk worm (the drawn tube tapers to a
 * tail over whatever spine it is given: wormMesh.ts).
 *
 * This is the one place that holds the length. The surface crawl eases its own gap toward
 * `wormBody.spacing` (crawl.ts) and the burrowing body's links ease toward it as the head moves
 * (bodyTrail.ts), so a change at any moment pulls the tail in smoothly. The checks that ask where
 * a whole body fits (digging down, coming up, the hints) stay at full length on purpose: a shorter
 * worm always fits where a full one does.
 */
export const WORM_SEGMENTS = 16;
/** The gap between body points at full length. */
export const FULL_SPACING = 0.22;
/** No shorter than this share of full length (a safety net for odd values, such as a URL param). */
const SHORTEST = 0.3;

/**
 * The length now: its share of full length (`factor`), the gap between body points it gives
 * (`spacing`), and the peristalsis waves per unit moved for a body that long (`wavesPerUnit`: the
 * drawn body always holds WAVES waves, so a shorter body's waves are shorter, and the wave runs
 * faster per unit moved: its thick segments stay planted, and the worm never crawls in slow motion).
 * Read, never written, outside this file. The fields start as fractions: a field that first held
 * a whole number had V8 box every fractional value written to it later (burrower.ts).
 */
export const wormBody = { factor: 0.5, spacing: 0.5, wavesPerUnit: 0.5 };

/** Sets the worm's length as a share of full length (1 full; the game uses 0.8 and 0.6). */
export function setBodyLength(f: number): void {
  const factor = Number.isFinite(f) ? Math.min(1, Math.max(SHORTEST, f)) : 1;
  wormBody.factor = factor;
  wormBody.spacing = FULL_SPACING * factor;
  wormBody.wavesPerUnit = WAVES / wormLength(WORM_SEGMENTS, wormBody.spacing);
}

setBodyLength(1);
