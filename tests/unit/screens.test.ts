import { describe, it, expect } from 'vitest';
import { initialScreens, transition, type ScreenEvent, type ScreenState } from '../../src/game/screens';

const run = (s: ScreenState, ...events: ScreenEvent[]) => events.reduce(transition, s);
const start = initialScreens();

describe('screens', () => {
  it('opens on Start, or straight on the speed test when asked', () => {
    expect(start).toEqual({ screen: 'start', graphicsFrom: 'start', recommended: null, applied: false });
    expect(initialScreens(true).screen).toBe('speedTest');
  });

  it('start -> Crawl -> crawl', () => {
    expect(run(start, { type: 'crawl' }).screen).toBe('crawl');
  });

  it('crawl -> Esc/P/Pause -> pause -> Resume -> crawl', () => {
    const paused = run(start, { type: 'crawl' }, { type: 'pause' });
    expect(paused.screen).toBe('pause');
    expect(run(paused, { type: 'resume' }).screen).toBe('crawl');
  });

  it('pauses when the tab is hidden during crawl', () => {
    expect(run(start, { type: 'crawl' }, { type: 'hidden' }).screen).toBe('pause');
  });

  it('a hidden tab changes nothing outside crawl', () => {
    for (const s of [start, run(start, { type: 'speedTest' }), run(start, { type: 'graphics' })]) {
      expect(transition(s, { type: 'hidden' })).toBe(s);
    }
  });

  it('start -> Graphics -> graphics -> Back -> start', () => {
    const g = run(start, { type: 'graphics' });
    expect(g.screen).toBe('graphics');
    expect(g.graphicsFrom).toBe('start');
    expect(run(g, { type: 'back' }).screen).toBe('start');
  });

  it('pause -> Graphics -> graphics -> Back -> pause', () => {
    const g = run(start, { type: 'crawl' }, { type: 'pause' }, { type: 'graphics' });
    expect(g.screen).toBe('graphics');
    expect(g.graphicsFrom).toBe('pause');
    expect(run(g, { type: 'back' }).screen).toBe('pause');
  });

  it('pause -> Back to start -> start', () => {
    expect(run(start, { type: 'crawl' }, { type: 'pause' }, { type: 'toStart' }).screen).toBe('start');
  });

  it('start -> Speed test -> speedTest -> done -> results -> Back to start -> start', () => {
    const t = run(start, { type: 'speedTest' });
    expect(t.screen).toBe('speedTest');
    const r = run(t, { type: 'testDone', recommended: 'medium' });
    expect(r).toMatchObject({ screen: 'results', recommended: 'medium', applied: false });
    expect(run(r, { type: 'toStart' }).screen).toBe('start');
  });

  it('the speed test intro can go back to start', () => {
    expect(run(start, { type: 'speedTest' }, { type: 'toStart' }).screen).toBe('start');
  });

  it('Use recommended setting marks the result applied, once', () => {
    const r = run(start, { type: 'speedTest' }, { type: 'testDone', recommended: 'low' });
    const used = run(r, { type: 'useRecommended' });
    expect(used).toMatchObject({ screen: 'results', recommended: 'low', applied: true });
    expect(transition(used, { type: 'useRecommended' })).toBe(used);
  });

  it('Use recommended setting does nothing without a recommendation (a FAIL report)', () => {
    const r = run(start, { type: 'speedTest' }, { type: 'testDone', recommended: null });
    expect(transition(r, { type: 'useRecommended' })).toBe(r);
  });

  it('a new speed test forgets the previous recommendation', () => {
    const used = run(start, { type: 'speedTest' }, { type: 'testDone', recommended: 'low' }, { type: 'useRecommended' }, { type: 'toStart' });
    expect(run(used, { type: 'speedTest' })).toMatchObject({ recommended: null, applied: false });
  });

  it('ignores events that do not apply to the current screen (same object back)', () => {
    const cases: [ScreenState, ScreenEvent][] = [
      [start, { type: 'pause' }], [start, { type: 'resume' }], [start, { type: 'back' }],
      [start, { type: 'toStart' }], [start, { type: 'testDone', recommended: 'high' }],
      [run(start, { type: 'crawl' }), { type: 'graphics' }],
      [run(start, { type: 'crawl' }), { type: 'speedTest' }],
      [run(start, { type: 'speedTest' }), { type: 'crawl' }],
      [run(start, { type: 'graphics' }), { type: 'crawl' }],
    ];
    for (const [s, e] of cases) expect(transition(s, e)).toBe(s);
  });
});
