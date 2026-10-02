import { describe, it, expect } from 'vitest';
import { GraphicsControl } from '../../src/game/graphicsControl';
import { SETTINGS_KEY, type KeyValueStore } from '../../src/save/settingsStore';

function memory(initial?: object): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = initial ? { [SETTINGS_KEY]: JSON.stringify(initial) } : {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
const saved = (s: { data: Record<string, string> }) => JSON.parse(s.data[SETTINGS_KEY]);

/** Feeds `fps` every 100 ms from t0 for `ms`. Returns the time reached. */
function slow(g: GraphicsControl, t0: number, ms: number, fps: number): number {
  let t = t0;
  for (; t <= t0 + ms; t += 100) g.updateAuto(t, fps);
  return t;
}

describe('GraphicsControl', () => {
  it('starts on Auto at High with fresh storage', () => {
    const g = new GraphicsControl(memory(), null);
    expect(g.choice).toBe('auto');
    expect(g.active).toBe('high');
  });

  it('Auto starts from the saved autoSettled preset', () => {
    const g = new GraphicsControl(memory({ version: 1, graphics: 'auto', autoSettled: 'low' }), null);
    expect(g.active).toBe('low');
  });

  it('picking a preset turns Auto off and saves it', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    g.choose('ultra');
    expect(g.choice).toBe('ultra');
    expect(g.active).toBe('ultra');
    expect(saved(store)).toEqual({ version: 1, graphics: 'ultra', autoSettled: null });
    expect(slow(g, 0, 10_000, 5)).toBeGreaterThan(0);
    expect(g.active).toBe('ultra');
  });

  it('Auto steps down in crawl and saves where it settled', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    let changed = false;
    for (let t = 0; t <= 2000; t += 100) changed = g.updateAuto(t, 20) || changed;
    expect(changed).toBe(true);
    expect(g.active).toBe('medium');
    expect(saved(store).autoSettled).toBe('medium');
  });

  it('picking Auto again starts from autoSettled', () => {
    const store = memory({ version: 1, graphics: 'high', autoSettled: 'medium' });
    const g = new GraphicsControl(store, null);
    expect(g.active).toBe('high');
    g.choose('auto');
    expect(g.active).toBe('medium');
    expect(saved(store).graphics).toBe('auto');
  });

  it('a forced ?preset= wins, is never saved, and Auto stays still', () => {
    const store = memory({ version: 1, graphics: 'low', autoSettled: null });
    const g = new GraphicsControl(store, 'ultra');
    expect(g.choice).toBe('ultra');
    expect(g.active).toBe('ultra');
    slow(g, 0, 10_000, 5);
    expect(g.active).toBe('ultra');
    expect(saved(store).graphics).toBe('low');
  });

  it('a menu choice ends the forced preset', () => {
    const g = new GraphicsControl(memory(), 'ultra');
    g.choose('medium');
    expect(g.active).toBe('medium');
  });

  it('useRecommended saves the preset and turns Auto off', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    g.useRecommended('low');
    expect(g.choice).toBe('low');
    expect(saved(store)).toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('keeps working for the session when storage throws', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const g = new GraphicsControl(broken, null);
    g.choose('medium');
    expect(g.active).toBe('medium');
  });
});
