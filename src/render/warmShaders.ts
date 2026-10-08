import type * as THREE from 'three';
import type { World } from '../game/world';

/**
 * Compiles every eagerly built program once, now, while the Start card is up (moved from
 * main.ts). On Low the atmosphere (light shafts, motes, falling leaves) is hidden, so without this
 * three would compile those programs on the first switch up from Low and the game would hitch once.
 * three r186's renderer.compile prepares hidden objects too, so the hidden near litter chunks'
 * plain program and the hidden underground (the cut face, its props, the burrow openings: V2) are
 * compiled here as well; showing the atmosphere for the call only keeps this from depending on
 * that. The lazily built layers (detail leaves, Ultra's near clutter) are deliberately not built
 * here: their one-time build and compile on first show is accepted (main.ts applySpec). Nor is
 * the litter's reacting (active) program, which no chunk wears yet: it compiles on the first frame
 * a chunk reacts.
 */
export function warmShaders(renderer: Pick<THREE.WebGLRenderer, 'compile'>, world: World, camera: THREE.Camera): void {
  const group = world.atmosphere.group;
  const wasVisible = group.visible;
  group.visible = true;
  try {
    renderer.compile(world.scene, camera);
  } finally {
    group.visible = wasVisible;
  }
}
