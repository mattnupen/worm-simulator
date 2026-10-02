import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { createPropMaterial } from '../render/propMaterial';
import { MeshWriter } from './meshWriter';
import { writeMushrooms, writeSedge } from './propGeometry';

/** Extra clutter items around the worm on Ultra. */
export const NEAR_CLUTTER_COUNT = 40;

/** The items stand on flat ground at the origin: the shader lays each vertex on the real ground. */
const FLAT = (): number => 0;

/**
 * Ultra's "extra clutter near the worm": small sedge tufts and mushroom clusters written once
 * in local space (on flat ground at the origin), each with a home in the wrap tile (aWrap). The
 * prop shader's WRAP path places the copy nearest the worm on the rendered ground, shrinks it
 * away from 3.5 to 4.5 m and from the worm's body, so the CPU does nothing as the worm moves.
 * One draw; hidden below Ultra.
 */
export function buildNearClutter(count = NEAR_CLUTTER_COUNT, seed = 41): THREE.Mesh {
  const w = new MeshWriter('aProp', 4);
  const rng = mulberry32(seed);
  const homes: number[] = [];
  for (let k = 0; k < count; k++) {
    const first = w.vertexCount;
    const scale = 0.5 + rng() * 0.4;
    if (rng() < 0.7) writeSedge(w, 0, 0, scale, rng, FLAT);
    else writeMushrooms(w, 0, 0, scale, rng, FLAT);
    const hx = rng();
    const hz = rng();
    for (let v = first; v < w.vertexCount; v++) homes.push(hx, hz);
  }
  const g = w.toGeometry();
  g.setAttribute('aWrap', new THREE.Float32BufferAttribute(homes, 2));
  const mesh = new THREE.Mesh(g, createPropMaterial(true));
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = 'nearClutter';
  return mesh;
}

/** The near clutter as the world holds it: built only when a preset first draws it. */
export interface NearClutterLayer {
  /** Always in the scene; holds the mesh once it is built. */
  readonly group: THREE.Group;
  /** The built mesh, or null until the first show(true). */
  readonly built: THREE.Mesh | null;
  /** Shows or hides the clutter, building it on the first show(true). */
  show(on: boolean): void;
  readonly visible: boolean;
}

/**
 * The near clutter, built lazily: on Low, Medium and High neither the mesh, its material, nor the
 * baked litter and ground textures it reads are ever made. Switching up to Ultra builds it then (a
 * one-time hitch while its shader compiles), as the detail layer does.
 */
export function buildNearClutterLayer(count = NEAR_CLUTTER_COUNT, seed = 41): NearClutterLayer {
  const group = new THREE.Group();
  group.name = 'nearClutterLayer';
  let built: THREE.Mesh | null = null;
  return {
    group,
    get built() {
      return built;
    },
    get visible() {
      return built !== null && built.visible;
    },
    show(on: boolean) {
      if (!built) {
        if (!on) return;
        built = buildNearClutter(count, seed);
        group.add(built);
      }
      built.visible = on;
    },
  };
}
