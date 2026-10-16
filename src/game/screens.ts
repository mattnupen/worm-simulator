import type { PresetId } from '../render/graphics';

/**
 * The game's screens as a small pure state machine (spec 3.1). The DOM for each screen lives
 * in src/ui/; src/main.ts dispatches events here and draws whatever screen comes back.
 *
 *   start --Crawl--> crawl --Esc/P/Pause/tab hidden--> pause --Resume--> crawl
 *   start --Graphics--> graphics --Back--> (the screen it came from)
 *   pause --Graphics--> graphics
 *   pause --Back to start--> start
 *   start --Speed test--> speedTest --done--> results --Back to start--> start
 *   start --Learn--> lesson --Start crawling--> crawl
 *   lesson --Back to start/Esc--> start
 *   start --Vote--> vote --I voted/Back to start/Esc--> start
 *   start/lesson --Crawl (first time this version), Watch the opening--> opening --done/Skip--> crawl
 */
export type Screen = 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'results' | 'lesson' | 'vote' | 'opening';

export type ScreenEvent =
  | { type: 'crawl' }
  | { type: 'opening' }
  | { type: 'openingDone' }
  | { type: 'lesson' }
  | { type: 'vote' }
  | { type: 'pause' }
  | { type: 'hidden' }
  | { type: 'resume' }
  | { type: 'graphics' }
  | { type: 'back' }
  | { type: 'toStart' }
  | { type: 'speedTest' }
  | { type: 'testDone'; recommended: PresetId | null }
  | { type: 'useRecommended' };

export interface ScreenState {
  readonly screen: Screen;
  /** Where Graphics goes back to. */
  readonly graphicsFrom: 'start' | 'pause';
  /** The preset the last speed test recommends; null for a FAIL with no 3D (nothing to save). */
  readonly recommended: PresetId | null;
  /** "Use recommended setting" was pressed for this result. */
  readonly applied: boolean;
}

/** `openLesson`: ?lesson=1, straight into the lesson (previews and screenshots). */
export function initialScreens(openSpeedTest = false, openLesson = false): ScreenState {
  const screen: Screen = openSpeedTest ? 'speedTest' : openLesson ? 'lesson' : 'start';
  return { screen, graphicsFrom: 'start', recommended: null, applied: false };
}

/** The next state, or `s` itself (same object) when the event does not apply. */
export function transition(s: ScreenState, e: ScreenEvent): ScreenState {
  switch (e.type) {
    case 'crawl':
      return s.screen === 'start' || s.screen === 'lesson' ? { ...s, screen: 'crawl' } : s;
    case 'opening':
      // From Pause only on the preview link (main.ts offers it there).
      return s.screen === 'start' || s.screen === 'lesson' || s.screen === 'pause' ? { ...s, screen: 'opening' } : s;
    case 'openingDone':
      return s.screen === 'opening' ? { ...s, screen: 'crawl' } : s;
    case 'lesson':
      return s.screen === 'start' ? { ...s, screen: 'lesson' } : s;
    case 'vote':
      return s.screen === 'start' ? { ...s, screen: 'vote' } : s;
    case 'pause':
    case 'hidden':
      return s.screen === 'crawl' ? { ...s, screen: 'pause' } : s;
    case 'resume':
      return s.screen === 'pause' ? { ...s, screen: 'crawl' } : s;
    case 'graphics':
      return s.screen === 'start' || s.screen === 'pause'
        ? { ...s, screen: 'graphics', graphicsFrom: s.screen }
        : s;
    case 'back':
      return s.screen === 'graphics' ? { ...s, screen: s.graphicsFrom } : s;
    case 'toStart':
      return s.screen === 'pause' || s.screen === 'results' || s.screen === 'speedTest' || s.screen === 'lesson'
        || s.screen === 'vote'
        ? { ...s, screen: 'start' }
        : s;
    case 'speedTest':
      return s.screen === 'start' ? { ...s, screen: 'speedTest', recommended: null, applied: false } : s;
    case 'testDone':
      return s.screen === 'speedTest' ? { ...s, screen: 'results', recommended: e.recommended, applied: false } : s;
    case 'useRecommended':
      return s.screen === 'results' && s.recommended !== null && !s.applied ? { ...s, applied: true } : s;
  }
}
