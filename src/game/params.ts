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
  /** `?lesson=1`: open straight on the in-game lesson (Matt's review, screenshots). */
  lesson: boolean;
  /**
   * `?opening=1`: the first Crawl plays the opening even on a device that has seen it (Matt's
   * review); `?opening=0`: never plays it (tests). `?openingAt=7.5` with it freezes the scene at
   * that second (screenshots of each shot).
   */
  opening: boolean | null;
  openingAt: number | null;
  /**
   * `?robin=1`: the V4 robin's preview loop in front of the worm while crawling (Matt's review).
   * `?robinAt=8` holds it at that second, `?robinTurn=90` turns it side-on, `?robinDist=6` sets how
   * far ahead it starts (world units), and `?robinCam=30` looks at it from that angle round it
   * instead of from the worm (model review).
   */
  robin: boolean;
  robinCam: number | null;
  robinAt: number | null;
  robinTurn: number;
  robinDist: number;
  /**
   * `?nest=1`: a "Watch the nest scene" button under the title on Start plays the V4 nest scene
   * (Matt's review: every cut scene gets a preview). `?nestAt=6` with it holds the scene at that
   * second (screenshots).
   */
  nest: boolean;
  nestAt: number | null;
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
    lesson: p.get('lesson') === '1',
    opening: p.get('opening') === '1' ? true : p.get('opening') === '0' ? false : null,
    openingAt: num(p, 'openingAt'),
    robin: p.get('robin') === '1',
    robinAt: num(p, 'robinAt'),
    robinCam: num(p, 'robinCam'),
    robinTurn: num(p, 'robinTurn') ?? 0,
    robinDist: num(p, 'robinDist') ?? 9,
    nest: p.get('nest') === '1',
    nestAt: num(p, 'nestAt'),
  };
}

/** A finite number from the query, or null. */
function num(p: URLSearchParams, key: string): number | null {
  return p.has(key) && Number.isFinite(Number(p.get(key))) ? Number(p.get(key)) : null;
}
