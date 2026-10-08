import '../ui/underground.css';
import type { Crawl } from '../game/crawl';
import type { World } from '../game/world';
import { loadSettings, updateSettings, type KeyValueStore } from '../save/settingsStore';
import { BurrowGame } from './burrowGame';
import { createCutScene, type CutHud, type CutScene } from './cutScene';
import { createLayerLabels } from './layerLabels';

/**
 * The underground, ready for main.ts: the game (with the player's saved view, saved again only
 * when they switch it, and prefers-reduced-motion read as each move starts) and its renderer,
 * whose meshes join the world's scene now, so warmShaders compiles them with everything else.
 * Over the canvas: the layer names, the reduced-motion dip (`.cut-fade`) and `#app[data-place]`
 * (surface, diggingDown, underground or comingUp: for tests and screenshots only).
 */
export function createBurrowing(
  crawl: Crawl, world: World, root: HTMLElement, store: KeyValueStore | null,
): { game: BurrowGame; cut: CutScene } {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const game = new BurrowGame(crawl, {
    reducedMotion: () => reduceMotion.matches,
    saveView: (v) => { updateSettings(store, { undergroundView: v }); },
  }, loadSettings(store).undergroundView);
  return { game, cut: createCutScene(game, world, crawl, createHud(root)) };
}

function createHud(root: HTMLElement): CutHud {
  const labels = createLayerLabels(root);
  const fade = document.createElement('div');
  fade.className = 'cut-fade';
  fade.hidden = true;
  root.appendChild(fade);
  /** The dip as last written, in steps of 1/50 (a style is written only when it changes). */
  let shown = 0;
  return {
    place(mode) {
      root.dataset.place = mode;
    },
    dip(o) {
      const q = Math.round(o * 50) / 50;
      if (q === shown) return;
      shown = q;
      fade.hidden = q === 0;
      fade.style.opacity = String(q);
    },
    labels: (camera, s, show, width, height) => labels.update(camera, s, show, width, height),
  };
}
