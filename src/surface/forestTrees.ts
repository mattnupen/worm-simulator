import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import type { Vec3 } from '../core/vec';
import { createBarkMaterial } from '../render/barkMaterial';
import { createCanopyMaterial } from '../render/canopyMaterial';
import { MeshWriter, icosphere } from './meshWriter';
import { terrainHeight } from './terrain';
import { treeSites } from './treeSites';
import { scaleSpec } from './worldScale';
import { trunkRadius } from './trunkShape';
import { BARK, writeCurl, writeLimb, writeTrunk, type TrunkSpec } from './trunkGeometry';

const BIRCH_CROWN = ['#e8b830', '#d9a020', '#f0c848', '#c89a28', '#b8a83a'];
const MAPLE_CROWN = ['#e0602a', '#d4402a', '#ec8a2a', '#c83a24', '#e89a30'];

/**
 * One stem: `scale` makes a clump's second stem smaller; `grow` is the scale mode's size for the
 * species (worldScale.ts), applied to girth, height, lean and the root collar alike.
 */
function trunkSpec(x: number, z: number, birch: boolean, rng: () => number, scale = 1, grow = 1): TrunkSpec {
  const lean = (birch ? 0.9 : 0.45) * rng() * scale * grow;
  const la = rng() * Math.PI * 2;
  const collar = 0.4 * grow;
  return {
    x, z, ground: terrainHeight(x, z),
    params: birch
      ? { height: (11 + rng() * 3) * scale * grow, radius: (0.24 + rng() * 0.09) * scale * grow, taper: 0.45, flare: 0.45, buttress: 0.3, lobes: 4, phase: rng() * 6, collar }
      : { height: (13 + rng() * 2.5) * grow, radius: (0.38 + rng() * 0.12) * grow, taper: 0.45, flare: 0.75, buttress: 0.6, lobes: 5, phase: rng() * 6, collar },
    leanX: Math.cos(la) * lean,
    leanZ: Math.sin(la) * lean,
    species: birch ? BARK.birch : BARK.maple,
    seed: rng(),
    grow,
  };
}

/** Limbs reaching up into the crown, and peeling curls low on the birches; `grow` as trunkSpec. */
function writeDetails(w: MeshWriter, t: TrunkSpec, birch: boolean, rng: () => number, grow: number): void {
  const H = t.params.height;
  const start: Vec3 = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 4; k++) {
    const h = H * (0.55 + 0.3 * rng());
    const a = rng() * Math.PI * 2;
    const tt = h / H;
    start.x = t.x + t.leanX * tt * tt;
    start.y = t.ground + h;
    start.z = t.z + t.leanZ * tt * tt;
    const up = birch ? 1.3 : 0.9;
    const l = Math.hypot(Math.cos(a), up);
    const r0 = trunkRadius(h, a, t.params) * 0.55;
    writeLimb(w, start, { x: Math.cos(a) / l, y: up / l, z: Math.sin(a) / l }, (2.5 + rng() * 1.8) * grow, r0, r0 * 0.35, t.species, t.seed, h, grow);
  }
  if (!birch) return;
  for (let k = 0; k < 4; k++) {
    writeCurl(w, t, rng() * Math.PI * 2, (0.9 + rng() * 2.6) * grow, (0.14 + rng() * 0.12) * grow, 0.3 + rng() * 0.25, grow);
  }
}

/** A crown of soft, lumpy foliage masses around (cx, cy, cz). */
function writeCrown(w: MeshWriter, cx: number, cy: number, cz: number, R: number, birch: boolean, rng: () => number): void {
  const { pos, index } = icosphere();
  const palette = birch ? BIRCH_CROWN : MAPLE_CROWN;
  const col = new THREE.Color();
  const blobs = 7;
  for (let b = 0; b < blobs; b++) {
    const a = (b / (blobs - 1)) * Math.PI * 2 + rng() * 0.6;
    const ring = b === 0 ? 0 : 0.55 + rng() * 0.2;
    const bx = cx + Math.cos(a) * R * ring;
    const by = cy + (b === 0 ? R * 0.35 : (rng() - 0.6) * R * 0.7);
    const bz = cz + Math.sin(a) * R * ring;
    const br = R * (b === 0 ? 0.7 : 0.45 + rng() * 0.18) * (birch ? 0.9 : 1);
    col.set(palette[Math.floor(rng() * palette.length)]).multiplyScalar(0.85 + rng() * 0.25);
    const phase = rng();
    const seed = rng() * 10;
    const first = w.vertexCount;
    for (let i = 0; i < pos.length; i += 3) {
      const dx = pos[i];
      const dy = pos[i + 1];
      const dz = pos[i + 2];
      const lump = 1 + 0.2 * Math.sin(3.1 * dx + 2.3 * dy + seed) * Math.cos(2.7 * dz + seed * 2);
      const x = bx + dx * br * lump;
      const y = by + dy * br * lump * 0.8;
      const z = bz + dz * br * lump;
      // Soft volume: blend each blob's normal with the whole crown's.
      const ox = x - cx;
      const oy = y - cy;
      const oz = z - cz;
      const ol = Math.hypot(ox, oy, oz) || 1;
      w.vertex(x, y, z, dx * 0.45 + (ox / ol) * 0.55, dy * 0.45 + (oy / ol) * 0.55, dz * 0.45 + (oz / ol) * 0.55,
        [col.r, col.g, col.b, phase]);
    }
    for (let i = 0; i < index.length; i += 3) w.tri(first + index[i], first + index[i + 1], first + index[i + 2]);
  }
}

/**
 * Near forest of the active scale mode: paper birches (some in clumps) and sugar maples with
 * bark-detailed, flared, leaning trunks and limbs (one merged draw), and soft autumn crowns (one
 * merged draw). `addBark` lets other props (the fallen log) share the trunk draw.
 */
export function buildForestTrees(addBark?: (w: MeshWriter) => void): THREE.Group {
  const spec = scaleSpec();
  const bark = new MeshWriter('aBark', 4);
  const crowns = new MeshWriter('aCanopy', 4);
  const rng = mulberry32(77);
  treeSites().forEach(({ x, z, birch, clump }) => {
    const grow = birch ? spec.birch : spec.maple;
    const stems = [trunkSpec(x, z, birch, rng, 1, grow)];
    if (clump) {
      const a = rng() * Math.PI * 2;
      const s = trunkSpec(x + Math.cos(a) * 0.5 * grow, z + Math.sin(a) * 0.5 * grow, true, rng, 0.8, grow);
      s.leanX = Math.cos(a) * 1.4 * grow;
      s.leanZ = Math.sin(a) * 1.4 * grow;
      stems.push(s);
    }
    for (const t of stems) {
      writeTrunk(bark, t);
      writeDetails(bark, t, birch, rng, grow);
      const H = t.params.height;
      writeCrown(crowns, t.x + t.leanX, t.ground + H * 0.86, t.z + t.leanZ, (birch ? 2.6 : 3.3) * grow, birch, rng);
    }
  });
  addBark?.(bark);

  const group = new THREE.Group();
  group.name = 'forestTrees';
  const trunks = new THREE.Mesh(bark.toGeometry(), createBarkMaterial());
  trunks.name = 'trunks';
  const canopy = new THREE.Mesh(crowns.toGeometry(), createCanopyMaterial());
  canopy.name = 'canopy';
  group.add(trunks, canopy);
  return group;
}
