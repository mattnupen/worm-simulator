import { isPresetId, type PresetId } from '../render/graphics';

export interface GameParams {
  /** `?preset=low|medium|high|ultra`: forces a preset for this session (benchmarks). Not saved. */
  preset: PresetId | null;
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
  return {
    preset: isPresetId(preset) ? preset : null,
    fps: p.get('fps') === '1',
    quick: p.get('quick') === '1',
    speedTest: p.get('speedtest') === '1',
  };
}
