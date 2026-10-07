import { mulberry32 } from '../core/random';
import * as THREE from 'three';
import { createPropMaterial } from '../render/propMaterial';
import { MeshWriter } from './meshWriter';
import { clutterGrow, heroLog, rocks, placeClutter, type ClutterItem } from './propPlacement';
import { writeFern, writeMushrooms, writeRock, writeSedge } from './propGeometry';
import { meshGroundHeight } from './terrainMesh';
import { terrainHeight } from './terrain';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';
import { BARK, writeLog } from './trunkGeometry';
import { REAL_SCALE } from './realScale';

/**
 * One clutter item, at real size. Clutter rests on the terrain mesh exactly as
 * drawn (soil plus litter mound), so the mound under deep piles never buries it; rocks and the log
 * stay on the soil.
 */
export function writeClutterItem(w: MeshWriter, c: ClutterItem, rng: () => number): void {
  const grow = clutterGrow(c.kind);
  if (c.kind === 'mushrooms') writeMushrooms(w, c.x, c.z, c.scale, rng, meshGroundHeight, grow);
  else if (c.kind === 'sedge') writeSedge(w, c.x, c.z, c.scale, rng, meshGroundHeight, grow);
  else writeFern(w, c.x, c.z, c.scale, rng, meshGroundHeight, grow);
}

export interface GroundProps {
  mesh: THREE.Mesh;
  /** Keeps the rocks and the first `fraction` of the clutter (random order: an even thinning). */
  setDensity(fraction: number): void;
}

/**
 * Rocks, mushroom clusters, sedge tufts and fern clumps merged into one mesh (one draw), at real
 * size. Rocks come first and always stay; density tiers trim the clutter after them.
 */
export function buildGroundProps(): GroundProps {
  const w = new MeshWriter('aProp', 4);
  const rng = mulberry32(31);
  rocks().forEach((r, i) => writeRock(w, r.x, r.z, r.size, (i * 0.37 + 0.11) % 1));
  const rockIndices = w.idx.length;
  const ends: number[] = [];
  for (const c of placeClutter()) {
    writeClutterItem(w, c, rng);
    ends.push(w.idx.length);
  }
  // Long trunk shadows, baked into the colours.
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  for (let v = 0; v < w.vertexCount; v++) {
    const s = shadeAt(w.pos[v * 3], w.pos[v * 3 + 2]);
    for (let k = 0; k < 3; k++) w.extra[v * 4 + k] *= s;
  }
  const g = w.toGeometry();
  const mesh = new THREE.Mesh(g, createPropMaterial());
  mesh.name = 'groundProps';
  return {
    mesh,
    setDensity(fraction: number) {
      const k = Math.max(0, Math.min(ends.length, Math.floor(ends.length * fraction)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : rockIndices);
    },
  };
}

/** The hero fallen birch log, written into the shared bark mesh (no extra draw). */
export function writeHeroLog(w: MeshWriter): void {
  const log = heroLog();
  writeLog(w, log.x, log.z, log.yaw, log.length, log.radius, BARK.birch, 1.62, terrainHeight, REAL_SCALE.log);
}
