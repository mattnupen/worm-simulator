import { isPresetId, type PresetId } from '../render/graphics';
import { ACTION_KINDS, type ActionKind } from '../ui/actionPrompt';

export interface GameParams {
  /** `?preset=low|medium|high|ultra`: forces a preset for this session (benchmarks). Not saved. */
  preset: PresetId | null;
  /** `?fps=1`: show the fps tag while crawling. */
  fps: boolean;
  /** `?quick=1`: a short speed test (automated tests). */
  quick: boolean;
  /** `?speedtest=1`: open straight on the speed test screen (Chromebook checks, benchmarks). */
  speedTest: boolean;
  /**
   * `?prompt=digDown|comeUp|viewWide|viewClose`: shows the Action prompt with that kind while
   * crawling, and counts Action presses on the page (data-action-presses). For tests and
   * screenshots only; the game itself sets the prompt from where the worm is.
   */
  prompt: ActionKind | null;
  /** `?dig=1`: the speed test digs underground instead of crawling (V2 perf gates). */
  dig: boolean;
}

export function parseParams(search: string): GameParams {
  const p = new URLSearchParams(search);
  const preset = p.get('preset');
  const prompt = p.get('prompt');
  return {
    preset: isPresetId(preset) ? preset : null,
    fps: p.get('fps') === '1',
    quick: p.get('quick') === '1',
    speedTest: p.get('speedtest') === '1',
    prompt: prompt !== null && (ACTION_KINDS as readonly string[]).includes(prompt) ? (prompt as ActionKind) : null,
    dig: p.get('dig') === '1',
  };
}
