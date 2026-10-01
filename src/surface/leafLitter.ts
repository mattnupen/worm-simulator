import { mulberry32 } from '../core/random';

export type LeafKind = 'ash' | 'basswood' | 'aspen' | 'maple' | 'oak';
export const LEAF_KINDS: readonly LeafKind[] = ['ash', 'basswood', 'aspen', 'maple', 'oak'];

/** Fall colors, for art only. Meaning never depends on these. */
export const LEAF_COLORS: Record<LeafKind, string> = {
  ash: '#b8a03a',
  basswood: '#d9b23a',
  aspen: '#f2c230',
  maple: '#e0582a',
  oak: '#8a5a2b',
};

export interface LeafPlacement {
  x: number; y: number; z: number;
  rotY: number; tilt: number; scale: number;
  kind: LeafKind;
}

export function placeLeaves(count: number, halfSize: number, seed = 1): LeafPlacement[] {
  const r = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: (r() * 2 - 1) * halfSize,
    y: r() * 0.079,
    z: (r() * 2 - 1) * halfSize,
    rotY: r() * Math.PI * 2,
    tilt: (r() - 0.5) * 0.5,
    scale: 0.6 + r() * 0.6,
    kind: LEAF_KINDS[Math.floor(r() * LEAF_KINDS.length)],
  }));
}
