import * as THREE from 'three';
import { createMaterials, type AnatomyMaterials } from './materials';
import type { Mesher } from './mesher';
import { buildCutWall, buildSetae, buildSkin } from './skin';
import { buildGut } from './gut';
import { buildBlood } from './blood';
import { buildNerves } from './nerves';
import { buildRepro } from './repro';
import { buildNephridia } from './nephridia';
import { buildMuscles } from './muscles';
import { buildSection } from './section';
import { PoseMap, STRAIGHT, applyPose, type Pose } from './pose';

/** The body systems a learner can show or hide (each one is its own group of draws). */
export const SYSTEMS = ['skin', 'muscles', 'gut', 'blood', 'nerves', 'repro', 'nephridia'] as const;
export type SystemId = (typeof SYSTEMS)[number];

/**
 * How the body wall is shown: whole, cut open along its length (the near half removed from the
 * head to segment 31, like a dissection), or see-through.
 */
export type WallMode = 'solid' | 'cut' | 'ghost';

/**
 * - `far`/`near`: the two halves of the cutaway region (near is hidden while cut);
 * - `rest`: behind the cutaway; `all`: everywhere, not split;
 * - `cut`: only while cut (the cut faces).
 * `patch` parts (the skin over the muscle peel) hide while the muscles show.
 */
type Part = 'far' | 'near' | 'rest' | 'all' | 'cut';

interface Entry {
  mesh: THREE.Mesh;
  system: SystemId;
  part: Part;
  patch: boolean;
  /** Fine per-segment branches, hidden in the see-through view so the main lines read. */
  fine: boolean;
}

/** Level of detail: `full` for lessons and the viewer, `game` for the outside only, light. */
export type Detail = 'full' | 'game';

/**
 * The nightcrawler anatomy model: every system built once, at load, as merged meshes, then
 * shown, hidden, cut open or ghosted by visibility and material swaps only (no rebuilds).
 */
export class AnatomyWorm {
  readonly group = new THREE.Group();
  readonly materials: AnatomyMaterials;
  private readonly entries: Entry[] = [];
  private readonly on = new Map<SystemId, boolean>();
  private mode: WallMode = 'solid';

  constructor(readonly detail: Detail = 'full') {
    this.materials = createMaterials();
    const mat = this.materials;
    const full = detail === 'full';
    const skin = buildSkin(full ? 112 : 24, (n) => (full ? (n < 60 ? 14 : 10) : 3));
    if (!full) {
      // The game's worm: the outside only, merged into one mesh and one plain material (one draw).
      for (const part of [skin.near, skin.rest, skin.patch]) skin.far.append(part);
      this.add('skin', 'all', skin.far, mat.skinGame);
    } else {
      this.add('skin', 'far', skin.far, mat.skin);
      this.add('skin', 'near', skin.near, mat.skin);
      this.add('skin', 'rest', skin.rest, mat.skin);
      this.add('skin', 'rest', skin.patch, mat.skin, true);
      const setae = buildSetae();
      this.add('skin', 'far', setae.far, mat.setae);
      this.add('skin', 'near', setae.near, mat.setae);
      this.add('skin', 'rest', setae.rest, mat.setae);
      this.add('skin', 'rest', setae.patch, mat.setae, true);
      this.add('skin', 'cut', buildCutWall(skin.xs), mat.wall);
      this.add('skin', 'cut', skin.caps, mat.wall);
      const mu = buildMuscles();
      this.add('muscles', 'far', mu.far, mat.muscle);
      this.add('muscles', 'near', mu.near, mat.muscle);
      this.add('muscles', 'rest', mu.rest, mat.muscle);
      this.add('muscles', 'far', mu.septaFar, mat.septa);
      this.add('muscles', 'near', mu.septaNear, mat.septa);
      this.add('muscles', 'rest', mu.septaRest, mat.septa);
      this.add('muscles', 'far', mu.strandsFar, mat.muscle);
      this.add('muscles', 'near', mu.strandsNear, mat.muscle);
      const sec = buildSection();
      this.add('skin', 'cut', sec.cavity, mat.wall);
      this.add('gut', 'cut', sec.gut, mat.gut);
      this.add('blood', 'cut', sec.blood, mat.blood);
      this.add('nerves', 'cut', sec.nerves, mat.nerve);
      const gut = buildGut(48, 0.08, 0.3);
      this.add('gut', 'all', gut.all, mat.gut);
      this.add('gut', 'far', gut.far, mat.gut);
      this.add('gut', 'near', gut.near, mat.gut);
      this.add('gut', 'cut', gut.cut, mat.gut);
      const blood = buildBlood();
      this.add('blood', 'all', blood.inner, mat.blood);
      this.add('blood', 'all', blood.fine, mat.blood, false, true);
      this.add('blood', 'near', blood.fineNear, mat.blood, false, true);
      // The hearts stay whole in the cutaway: only the body wall is cut.
      this.add('blood', 'all', blood.heartsFar, mat.blood);
      this.add('blood', 'all', blood.heartsNear, mat.blood);
      this.add('blood', 'far', blood.far, mat.blood, false, true);
      this.add('blood', 'near', blood.near, mat.blood, false, true);
      this.add('blood', 'rest', blood.rest, mat.blood, false, true);
      const nerves = buildNerves();
      this.add('nerves', 'all', nerves.inner, mat.nerve);
      this.add('nerves', 'far', nerves.far, mat.nerve, false, true);
      this.add('nerves', 'near', nerves.near, mat.nerve, false, true);
      this.add('nerves', 'rest', nerves.rest, mat.nerve, false, true);
      const repro = buildRepro();
      this.add('repro', 'all', repro.inner, mat.repro);
      this.add('repro', 'far', repro.innerFar, mat.repro);
      this.add('repro', 'near', repro.innerNear, mat.repro);
      this.add('repro', 'all', repro.sacs, mat.reproSac);
      this.add('repro', 'far', repro.far, mat.repro);
      this.add('repro', 'near', repro.near, mat.repro);
      const neph = buildNephridia();
      this.add('nephridia', 'far', neph.far, mat.nephridia);
      this.add('nephridia', 'near', neph.near, mat.nephridia);
      this.add('nephridia', 'rest', neph.rest, mat.nephridia);
    }
    for (const s of SYSTEMS) this.on.set(s, true);
    this.group.name = 'anatomyWorm';
    this.refresh();
  }

  private add(system: SystemId, part: Part, m: Mesher, material: THREE.Material, patch = false, fine = false): void {
    if (m.vertexCount === 0) return;
    const mesh = new THREE.Mesh(m.build(), material);
    mesh.name = `${system}:${part}`;
    if (material.transparent) mesh.renderOrder = 2;
    this.entries.push({ mesh, system, part, patch, fine });
    this.group.add(mesh);
  }

  setSystem(system: SystemId, on: boolean): void {
    this.on.set(system, on);
    this.refresh();
  }

  isOn(system: SystemId): boolean {
    return this.on.get(system) ?? false;
  }

  setWall(mode: WallMode): void {
    this.mode = mode;
    this.refresh();
  }

  get wall(): WallMode {
    return this.mode;
  }

  /** Bends every mesh along a pose (src/anatomy/pose.ts); the straight build is kept. */
  pose(p: Pose): void {
    this.poseMap = new PoseMap(p);
    for (const e of this.entries) applyPose(e.mesh.geometry, this.poseMap);
  }

  /** The current pose, for placing labels on the posed body. */
  poseMap = new PoseMap(STRAIGHT);

  /** Vertices and draws, for the perf budget. */
  stats(): { vertices: number; draws: number } {
    let vertices = 0;
    let draws = 0;
    for (const e of this.entries) {
      if (!e.mesh.visible) continue;
      draws++;
      vertices += e.mesh.geometry.getAttribute('position').count;
    }
    return { vertices, draws };
  }

  private refresh(): void {
    const cut = this.mode === 'cut';
    const ghost = this.mode === 'ghost';
    for (const e of this.entries) {
      let v = this.isOn(e.system);
      if (e.part === 'near') v &&= !cut;
      if (e.part === 'cut') v &&= cut;
      if (e.patch) v &&= !this.isOn('muscles') || ghost;
      if (e.fine) v &&= !ghost;
      e.mesh.visible = v;
      if (e.system === 'skin' && e.part !== 'cut' && this.detail === 'full') {
        if (e.mesh.userData.setae || e.mesh.material === this.materials.setae) {
          e.mesh.userData.setae = true;
          e.mesh.visible = v && !ghost;
        } else {
          e.mesh.material = ghost ? this.materials.skinGhost : this.materials.skin;
          e.mesh.renderOrder = ghost ? 3 : 0;
        }
      }
    }
  }
}
