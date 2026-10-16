import * as THREE from 'three';
import { createPropMaterial } from '../render/propMaterial';
import { leafShape } from '../surface/leafShapes';
import type { MeshWriter } from '../surface/meshWriter';
import { box, cylinder, heap, tube, wheel, withGain, writer } from './shapes';
import { CUP, KIDS, LEAF } from './script';

/**
 * The opening's props, built once at load and hidden (src/opening/opening.ts poses them). Three
 * draws while the scene plays: the bus (one static mesh it moves), the big maple leaf the worm
 * hides under, and everything else that moves (people's legs and hands, the box, the tub, its lid,
 * the soil, the door) as parts of one mesh whose vertices are rewritten each frame. They share the
 * forest props' painted material (the same program as the ground props: nothing new compiles), and
 * the scene's colours are this file's. Allocates nothing per frame.
 */

const M = 23.33; // world units per metre

// Colours (sRGB hex; shapes.ts converts them to linear).
const BUS_YELLOW = 0xf5a80c;
const BUS_BLACK = 0x26231f;
const GLASS = 0x3c4448;
const STEEL = 0x9a9890;
const TYRE = 0x242220;
const HUB = 0x8d8a82;
const PANTS = 0x41546b;
const BOOT = 0x6b4a2c;
const SOLE = 0x2f2620;
const SKIN = 0xd9a582;
const SLEEVE = 0x8a3f33;
const BOX_GREEN = 0x3f7a62;
const BOX_LID = 0x356a54;
const HANDLE = 0x2b2a27;
const CUP_WHITE = 0xdfe9ea;
const LID_TEAL = 0x2aa9c4;
const LID_TEAL_LIGHT = 0x4fbdd2;
const LID_PRINT = 0x1d6f86;
const SOIL_DARK = 0x3a2b1f;
const SOIL_MID = 0x4d3a29;
const BAIT = 0xb8705a;
const MAPLE = 0xd2582f;
const WHITE = 0xe9e6de;

/** One moving piece: its vertices in the shared buffer, its rest shape, where it is this frame. */
export interface Part {
  readonly start: number;
  readonly count: number;
  /** Local to world (or to the bus, for a part with `onBus`). */
  readonly matrix: THREE.Matrix4;
  visible: boolean;
  /** Moves with the bus (the door). */
  readonly onBus: boolean;
}

export interface OpeningActors {
  readonly bus: THREE.Mesh;
  readonly leaf: THREE.Mesh;
  readonly moving: THREE.Mesh;
  readonly teacher: { readonly legs: readonly [Part, Part]; readonly boots: readonly [Part, Part] };
  readonly kids: readonly { readonly legs: readonly [Part, Part]; readonly shoes: readonly [Part, Part] }[];
  readonly hands: readonly [Part, Part];
  readonly box: Part;
  readonly tub: Part;
  readonly lid: Part;
  readonly soil: Part;
  readonly doors: readonly [Part, Part];
  /** Rewrites the moving parts' vertices from their matrices (and the bus's, for door parts). */
  update(): void;
  /** Shows or hides all three meshes. */
  show(on: boolean): void;
}

/**
 * The bus, in its own frame: front-centre at ground level, facing +z, its right (door) side at
 * x = -29. A flat-fronted school bus about 12 m long and 3.2 m tall; only its lower side, the
 * wheels, the door and the front corner ever show from the worm's height.
 */
function buildBus(): THREE.BufferGeometry {
  const w = writer();
  const half = 1.25 * M; // 2.5 m wide
  const len = 12 * M;
  // Body and black skirt.
  withGain(2.2, () => box(w, -half, 0.55 * M, -len, half, 3.2 * M, 0, BUS_YELLOW));
  box(w, -half - 0.3, 0.38 * M, -len + 10, half + 0.3, 0.62 * M, -2, BUS_BLACK);
  // Rub rails and the window band along the door side and the front.
  for (const y of [1.02, 1.55]) box(w, -half - 0.5, y * M, -len, -half + 2, y * M + 0.9, -1, BUS_BLACK);
  box(w, -half - 0.4, 2.15 * M, -len + 20, -half + 2, 2.8 * M, -2.4 * M, GLASS);
  // Front bumper and the front face's grille.
  box(w, -half - 1, 0.32 * M, -1, half + 1, 0.62 * M, 3, BUS_BLACK);
  box(w, -0.6 * M, 0.8 * M, -0.5, 0.6 * M, 1.3 * M, 0.6, BUS_BLACK);
  // The doorway (dark inside, two steps), behind the folding door panels (parts).
  const d0 = -1.15 * M;
  const d1 = -0.3 * M;
  box(w, -half - 0.6, 0.6 * M, d0, -half + 0.4, 2.9 * M, d1, 0x1d1b19);
  box(w, -half - 1.6, 0.36 * M, d0 + 0.5, -half + 6, 0.42 * M, d1 - 0.5, STEEL);
  box(w, -half + 4, 0.72 * M, d0 + 0.5, -half + 12, 0.78 * M, d1 - 0.5, STEEL);
  // Wheels (front and rear, both sides) in dark wheel wells.
  for (const z of [-1.7 * M, -9 * M]) {
    box(w, -half - 0.35, 0.3 * M, z - 0.62 * M, half + 0.35, 1.08 * M, z + 0.62 * M, 0x1a1816);
    wheel(w, -half + 4, 0.5 * M, z, 0.5 * M, 0.32 * M, -1, TYRE, HUB);
    wheel(w, half - 4, 0.5 * M, z, 0.5 * M, 0.32 * M, 1, TYRE, HUB);
  }
  // Undercarriage, shadowed.
  box(w, -half + 6, 0.12 * M, -len + 20, half - 6, 0.56 * M, -0.6 * M, 0x1b1a18);
  return w.toGeometry();
}

/** The big leaf: the maple silhouette, gently cupped, lying on the litter. */
function buildLeaf(): THREE.BufferGeometry {
  const w = writer();
  const s = leafShape('maple');
  const c = new THREE.Color(MAPLE);
  const n = s.points.length / 2;
  for (let i = 0; i < n; i++) {
    const x = s.points[i * 2] * LEAF.size;
    const z = s.points[i * 2 + 1] * LEAF.size;
    const r2 = (x * x + z * z) / ((LEAF.size / 2) ** 2);
    // Cupped up at the edges a little, veins a shade darker.
    const y = 0.12 + 0.18 * r2;
    const dark = 1 - 0.18 * s.vein[i];
    w.vertex(x, y, z, 0, 1, 0, [c.r * dark, c.g * dark, c.b * dark, 2.4]);
  }
  for (let i = 0; i < s.indices.length; i += 3) w.triFacing(s.indices[i], s.indices[i + 1], s.indices[i + 2], 0, 1, 0);
  w.smoothNormals(0, 0);
  return w.toGeometry();
}

/** Collects parts into one buffer: each written at its rest pose, then posed per frame. */
class PartWriter {
  readonly w: MeshWriter = writer();
  readonly parts: Part[] = [];

  part(build: (w: MeshWriter) => void, onBus = false): Part {
    const start = this.w.vertexCount;
    build(this.w);
    const p: Part = { start, count: this.w.vertexCount - start, matrix: new THREE.Matrix4(), visible: false, onBus };
    this.parts.push(p);
    return p;
  }
}

/** A leg: a tapered cylinder from the ankle (y = 0) up `length`, its colour `hex`. */
const leg = (length: number, r: number, hex: number) => (w: MeshWriter): void => {
  cylinder(w, 0, 0, 0, length, r, 8, hex, { top: true, bottom: true }, r * 1.3);
};

/** A shoe or boot, toe toward +z, sole on y = 0: `l` long, `wd` wide, `h` high. */
const shoe = (l: number, wd: number, h: number, upper: number, sole: number, trim?: number) => (w: MeshWriter): void => {
  box(w, -wd / 2, 0, -l * 0.35, wd / 2, h * 0.25, l * 0.65, sole);
  box(w, -wd / 2 + 0.05, h * 0.25, -l * 0.35, wd / 2 - 0.05, h, l * 0.15, upper);
  box(w, -wd / 2 + 0.1, h * 0.25, l * 0.15, wd / 2 - 0.1, h * 0.62, l * 0.62, trim ?? upper);
};

/** A hand reaching down (fingers toward -y from the wrist at the origin) and its sleeve above. */
const hand = (w: MeshWriter): void => {
  box(w, -0.95, -4.2, -0.4, 0.95, 0, 0.4, SKIN);
  box(w, -1.15, -2.2, -0.2, -0.75, -0.4, 0.5, SKIN); // thumb
  cylinder(w, 0, 0, 0.4, 24, 1.15, 8, SLEEVE);
};

export function buildOpeningActors(): OpeningActors {
  const material = createPropMaterial();
  const bus = new THREE.Mesh(buildBus(), material);
  bus.name = 'openingBus';
  const leaf = new THREE.Mesh(buildLeaf(), material);
  leaf.name = 'openingLeaf';

  const pw = new PartWriter();
  const teacherLegs: [Part, Part] = [pw.part(leg(0.92 * M, 1.6, PANTS)), pw.part(leg(0.92 * M, 1.6, PANTS))];
  const teacherBoots: [Part, Part] = [
    pw.part(shoe(6.4, 2.6, 2.9, BOOT, SOLE)),
    pw.part(shoe(6.4, 2.6, 2.9, BOOT, SOLE)),
  ];
  const kids = KIDS.map((k) => ({
    legs: [pw.part(leg(0.72 * M, 1.15, k.pants)), pw.part(leg(0.72 * M, 1.15, k.pants))] as [Part, Part],
    shoes: [pw.part(shoe(5.4, 2.1, 2.2, k.shoe, WHITE, WHITE)), pw.part(shoe(5.4, 2.1, 2.2, k.shoe, WHITE, WHITE))] as [Part, Part],
  }));
  const hands: [Part, Part] = [pw.part(hand), pw.part(hand)];
  // The tackle box: centred on its middle at the bottom, 9.3 long (z), 4.7 wide and tall.
  const tackle = pw.part((w) => {
    box(w, -2.35, 0, -4.65, 2.35, 3.3, 4.65, BOX_GREEN);
    box(w, -2.4, 3.3, -4.7, 2.4, 4.7, 4.7, BOX_LID);
    box(w, -0.3, 4.7, -2.2, 0.3, 6.1, -1.7, HANDLE);
    box(w, -0.3, 4.7, 1.7, 0.3, 6.1, 2.2, HANDLE);
    box(w, -0.3, 5.7, -2.2, 0.3, 6.3, 2.2, HANDLE);
    box(w, -2.45, 2.6, -0.6, -2.35, 3.6, 0.6, STEEL); // the latch
  });
  // The night crawler cup (CUP: milky white, a turquoise snap-on lid), centred on its middle, axis y,
  // open end at +y. Some soil stays inside after the spill.
  const tub = pw.part((w) => {
    cylinder(w, 0, 0, CUP.bottom, CUP.top, CUP.rBottom, 20, CUP_WHITE, { bottom: true, top: false }, CUP.rTop);
    // The stacking ridge just under the rim.
    cylinder(w, 0, 0, CUP.top - 0.2, CUP.top - 0.05, CUP.rTop + 0.06, 20, CUP_WHITE, { bottom: false, top: false });
    // The soil still inside, sunk below the rim.
    cylinder(w, 0, 0, CUP.bottom + 0.02, CUP.top - 0.45, CUP.rBottom - 0.04, 20, SOIL_DARK, { top: true, bottom: false }, CUP.rTop - 0.12);
  });
  const lid = pw.part((w) => {
    cylinder(w, 0, 0, -CUP.lidHalf, CUP.lidHalf, CUP.lidR, 20, LID_TEAL);
    // The raised middle, the round print on it and its white barcode label.
    cylinder(w, 0, 0, CUP.lidHalf, CUP.lidHalf + 0.06, CUP.lidR - 0.32, 20, LID_TEAL_LIGHT);
    cylinder(w, -0.55, 0.45, CUP.lidHalf + 0.06, CUP.lidHalf + 0.075, 0.38, 12, LID_PRINT);
    box(w, 0.05, CUP.lidHalf + 0.06, -0.35, 0.75, CUP.lidHalf + 0.08, 0.05, WHITE);
  });
  // The spilled pile, centred on SOIL (it grows and shrinks from there): a big mound against the
  // cup's mouth (at local z -0.85, the cup lying just behind it), tumbling out into smaller lumps and
  // crumbs toward +z, with bait worms on it.
  const soil = pw.part((w) => {
    heap(w, 1.3, 0.95, 1.0, SOIL_DARK, 1.7, 0, -0.85);
    heap(w, 1.05, 0.9, 0.6, SOIL_MID, 0.4, 0.2, 0.3);
    heap(w, 0.85, 0.7, 0.34, SOIL_DARK, 2.9, -0.25, 1.2);
    heap(w, 0.32, 0.28, 0.22, SOIL_MID, 3.3, 0.95, 1.65);
    heap(w, 0.26, 0.24, 0.18, SOIL_DARK, 4.1, -0.95, 0.75);
    heap(w, 0.22, 0.2, 0.14, SOIL_MID, 5.2, 0.45, 2.15);
    heap(w, 0.18, 0.16, 0.12, SOIL_DARK, 6.0, -0.6, 2.0);
    tube(w, [[-1.0, -0.9], [-0.85, -0.5], [-1.05, -0.15], [-0.9, 0.2]], 0.42, 0.11, BAIT);
    tube(w, [[0.55, 0.5], [0.75, 0.8], [0.6, 1.1], [0.85, 1.35]], 0.32, 0.1, BAIT);
    tube(w, [[-0.5, 1.45], [-0.75, 1.7], [-0.6, 2.0]], 0.08, 0.09, BAIT);
  });
  // The two folding door panels, on the bus, hinged at their outer edges.
  const doorPanel = (w: MeshWriter): void => {
    box(w, -0.5, 0, 0, 0.5, 2.3 * M, 0.425 * M, GLASS);
    box(w, -0.6, 0, 0, 0.6, 2.3 * M, 1.2, BUS_BLACK);
    box(w, -0.6, 1.1 * M, 0, 0.6, 1.1 * M + 1, 0.425 * M, BUS_BLACK);
  };
  const doors: [Part, Part] = [pw.part(doorPanel, true), pw.part(doorPanel, true)];

  const geometry = pw.w.toGeometry();
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const nor = geometry.getAttribute('normal') as THREE.BufferAttribute;
  pos.setUsage(THREE.DynamicDrawUsage);
  nor.setUsage(THREE.DynamicDrawUsage);
  const restPos = Float32Array.from(pos.array as Float32Array);
  const restNor = Float32Array.from(nor.array as Float32Array);
  const moving = new THREE.Mesh(geometry, material);
  moving.name = 'openingActors';
  // Its vertices are written in world space each frame; it is never culled as a whole.
  moving.frustumCulled = false;
  bus.frustumCulled = false;
  for (const m of [bus, leaf, moving]) m.visible = false;

  const full = new THREE.Matrix4();
  const normal = new THREE.Matrix3();
  const v = new THREE.Vector3();

  return {
    bus, leaf, moving,
    teacher: { legs: teacherLegs, boots: teacherBoots },
    kids, hands, box: tackle, tub, lid, soil, doors,
    update() {
      bus.updateMatrixWorld();
      const P = pos.array as Float32Array;
      const N = nor.array as Float32Array;
      for (const p of pw.parts) {
        const end = (p.start + p.count) * 3;
        if (!p.visible) {
          // Collapsed to one point: nothing to draw, nothing to shade.
          P.fill(0, p.start * 3, end);
          continue;
        }
        if (p.onBus) full.multiplyMatrices(bus.matrixWorld, p.matrix);
        else full.copy(p.matrix);
        normal.getNormalMatrix(full);
        for (let i = p.start * 3; i < end; i += 3) {
          v.set(restPos[i], restPos[i + 1], restPos[i + 2]).applyMatrix4(full);
          P[i] = v.x; P[i + 1] = v.y; P[i + 2] = v.z;
          v.set(restNor[i], restNor[i + 1], restNor[i + 2]).applyMatrix3(normal).normalize();
          N[i] = v.x; N[i + 1] = v.y; N[i + 2] = v.z;
        }
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
    },
    show(on) {
      bus.visible = on;
      leaf.visible = on;
      moving.visible = on;
    },
  };
}
