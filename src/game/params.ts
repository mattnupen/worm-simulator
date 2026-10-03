import { isPresetId, type PresetId } from '../render/graphics';
import { isScaleMode, type ScaleMode } from '../surface/worldScale';

export interface GameParams {
  /** `?preset=low|medium|high|ultra`: forces a preset for this session (benchmarks). Not saved. */
  preset: PresetId | null;
  /** `?scale=classic|hybrid|true`: forces a world scale for this visit (tests, gates). Not saved. */
  scale: ScaleMode | null;
  /** `?fps=1`: show the fps tag while crawling. */
  fps: boolean;
  /** `?quick=1`: a short speed test (automated tests). */
  quick: boolean;
  /** `?speedtest=1`: open straight on the speed test screen (Chromebook checks, benchmarks). */
  speedTest: boolean;
}

export function parseParams(search: string): GameParams {
  const p = new URLSearchParams(search);
  const preset = p.get('preset');
  const scale = p.get('scale');
  return {
    preset: isPresetId(preset) ? preset : null,
    scale: isScaleMode(scale) ? scale : null,
    fps: p.get('fps') === '1',
    quick: p.get('quick') === '1',
    speedTest: p.get('speedtest') === '1',
  };
}
