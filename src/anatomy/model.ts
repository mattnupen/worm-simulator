import * as THREE from 'three';
import { createMaterials, type AnatomyMaterials } from './materials';
import { Mesher } from './mesher';
import { PoseMap, STRAIGHT, applyPose, type Pose } from './pose';
import { HIGHLIGHT, addHighlight, setHighlight } from './highlight';
import { addMotion } from './motion';
import { assemble } from './assemble';

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
 * - `cut`: only while cut (the cut faces);
 * - `shut`: the near half of the front gut, hidden while cut with the gut open (`openGut`);
 *   `open`: its lining, shown only then.
 * `patch` parts (the skin over the muscle peel) hide while the muscles show.
 */
export type Part = 'far' | 'near' | 'rest' | 'all' | 'cut' | 'shut' | 'open';

interface Entry {
  mesh: THREE.Mesh;
  system: SystemId;
  part: Part;
  patch: boolean;
  /** Fine per-segment branches, hidden in the see-through view so the main lines read. */
  fine: boolean;
}

/**
 * Level of detail: `full` for the viewer; `lesson` the same parts at a lighter resolution, for
 * films and simulations on school computers; `game` the outside only, lightest.
 */
export type Detail = 'full' | 'lesson' | 'game';
/** How finely `lesson` builds every surface, against `full`. */
const LESSON_DETAIL = 0.42;

/**
 * The nightcrawler anatomy model: every system built once, at load, as merged meshes, then
 * shown, hidden, cut open or ghosted by visibility and material swaps only (no rebuilds).
 */
export class AnatomyWorm {
  readonly group = new THREE.Group();
  materials!: AnatomyMaterials;
  private readonly entries: Entry[] = [];
  private readonly on = new Map<SystemId, boolean>();
  private readonly fades = new Map<SystemId, number>();
  /** A see-through twin of each material, built at load, for fading a system. */
  private readonly twins = new Map<THREE.Material, THREE.Material>();
  private mode: WallMode = 'solid';
  private lit: SystemId | null = null;
  /** While cut, the front gut (pharynx to gizzard) is opened too, so food can be seen inside it. */
  private gutOpen = false;

  constructor(detail: Detail = 'full') {
    this.detail = detail === 'game' ? 'game' : 'full';
    Mesher.detail = detail === 'lesson' ? LESSON_DETAIL : 1;
    try {
      this.build(detail === 'lesson');
    } finally {
      Mesher.detail = 1;
    }
  }

  /** `full` for both the viewer and lessons (they differ only in resolution), or `game`. */
  readonly detail: 'full' | 'game';

  private build(light: boolean): void {
    this.materials = createMaterials();
    if (light) {
      // The skin's rainbow sheen and velvet edge cost the most per pixel and hardly show at a
      // lesson's distance; everything else looks the same.
      this.materials.skin.iridescence = 0;
      this.materials.skin.sheen = 0;
    }
    const mat = this.materials;
    const full = this.detail === 'full';
    assemble((...args) => this.add(...args), mat, full);
    for (const s of SYSTEMS) {
      this.on.set(s, true);
      this.fades.set(s, 1);
    }
    this.group.name = 'anatomyWorm';
    this.refresh();
  }

  private add(system: SystemId, part: Part, m: Mesher, material: THREE.Material, patch = false, fine = false): void {
    if (m.vertexCount === 0) return;
    if (this.detail === 'full' && !material.userData.hlOn) {
      const mat = this.materials;
      const moves = material === mat.gut ? 'gut' : [mat.skin, mat.wall, mat.setae].includes(material as THREE.MeshPhysicalMaterial) ? 'head' : null;
      if (moves) addMotion(material, moves);
      if (material === mat.skin) addMotion(mat.skinGhost, 'head');
      addHighlight(material);
      if (material === mat.skin) addHighlight(mat.skinGhost);
    }
    if (this.detail === 'full' && !this.twins.has(material)) {
      const twin = material.clone();
      twin.onBeforeCompile = material.onBeforeCompile;
      twin.customProgramCacheKey = material.customProgramCacheKey;
      twin.userData = material.userData;
      twin.transparent = true;
      twin.depthWrite = false;
      this.twins.set(material, twin);
    }
    const mesh = new THREE.Mesh(m.build(), material);
    mesh.name = `${system}:${part}`;
    if (material.transparent) mesh.renderOrder = 2;
    this.entries.push({ mesh, system, part, patch, fine });
    this.group.add(mesh);
  }

  setSystem(system: SystemId, on: boolean): void {
    this.on.set(system, on);
    if (on && (this.fades.get(system) ?? 1) <= 0) this.fades.set(system, 1);
    this.refresh();
  }

  /** How solid a system is drawn: 1 solid, 0 hidden, in between see-through (a slider). */
  setFade(system: SystemId, f: number): void {
    const v = Math.min(1, Math.max(0, f));
    this.fades.set(system, v);
    this.on.set(system, v > 0);
    this.refresh();
  }

  fade(system: SystemId): number {
    return this.isOn(system) ? (this.fades.get(system) ?? 1) : 0;
  }

  /** Lights up the part of `system` within `radius` mm of the line a to b (world), or nothing. */
  highlight(system: SystemId | null, a?: THREE.Vector3, b?: THREE.Vector3, radius = 1): void {
    this.lit = system;
    if (a) HIGHLIGHT.hlA.value.copy(a);
    if (b ?? a) HIGHLIGHT.hlB.value.copy((b ?? a)!);
    HIGHLIGHT.hlRadius.value = radius;
    this.refresh();
  }

  /** The system a drawn mesh belongs to (for tapping a part). */
  systemOf(mesh: THREE.Object3D): SystemId | null {
    return this.entries.find((e) => e.mesh === mesh)?.system ?? null;
  }

  /** Compiles every material and its see-through twin now, so a slider never stalls. */
  precompile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const saved = this.entries.map((e) => [e.mesh.material, e.mesh.visible] as const);
    for (const pass of [0, 1]) {
      for (const e of this.entries) {
        const base = e.mesh.material as THREE.Material;
        e.mesh.material = pass ? (this.twins.get(base) ?? base) : base;
        e.mesh.visible = true;
      }
      renderer.compile(scene, camera);
    }
    this.entries.forEach((e, i) => {
      e.mesh.material = saved[i][0];
      e.mesh.visible = saved[i][1];
    });
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

  /** Soft reflections from `env` for a scene that has no environment of its own (films). */
  useEnvironment(env: THREE.Texture, intensity: number): void {
    for (const m of [...Object.values(this.materials), ...this.twins.values()]) {
      const p = m as THREE.MeshStandardMaterial;
      p.envMap = env;
      p.envMapIntensity = intensity;
    }
  }

  /** Opens the front gut while cut (see `gutOpen`). */
  openGut(on: boolean): void {
    this.gutOpen = on;
    this.refresh();
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
      if (e.part === 'shut') v &&= !(cut && this.gutOpen);
      if (e.part === 'open') v &&= cut && this.gutOpen;
      if (e.patch) v &&= !this.isOn('muscles') || ghost;
      if (e.fine) v &&= !ghost;
      e.mesh.visible = v;
      if (this.detail !== 'full') continue;
      const base = (e.mesh.userData.base ??= e.mesh.material) as THREE.Material;
      let mat = base;
      if (e.system === 'skin' && e.part !== 'cut') {
        if (base === this.materials.setae) e.mesh.visible = v && !ghost;
        else if (ghost) mat = this.materials.skinGhost;
      }
      const f = this.fades.get(e.system) ?? 1;
      if (f < 1 && mat !== this.materials.skinGhost) {
        const twin = this.twins.get(base)!;
        twin.opacity = (base.transparent ? base.opacity : 1) * f;
        mat = twin;
      }
      e.mesh.material = mat;
      e.mesh.renderOrder = mat === this.materials.skinGhost ? 3 : mat.transparent ? 2 : 0;
      setHighlight(mat, this.lit === e.system);
    }
  }
}
