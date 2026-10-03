import { describe, it, expect } from 'vitest';
import { GraphicsControl } from '../../src/game/graphicsControl';
import { SETTINGS_KEY, updateSettings, type KeyValueStore } from '../../src/save/settingsStore';
import type { GraphicsChoice } from '../../src/render/graphics';

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

  it('a new session starts Auto one step above the saved autoSettled (never Ultra)', () => {
    const at = (autoSettled: string) =>
      new GraphicsControl(memory({ version: 1, graphics: 'auto', autoSettled }), null).active;
    expect(at('low')).toBe('medium');
    expect(at('medium')).toBe('high');
    expect(at('high')).toBe('high');
  });

  it('steps back down within seconds when the raised start is still too slow', () => {
    const store = memory({ version: 1, graphics: 'auto', autoSettled: 'low' });
    const g = new GraphicsControl(store, null);
    expect(g.active).toBe('medium');
    slow(g, 0, 2000, 20);
    expect(g.active).toBe('low');
    expect(saved(store).autoSettled).toBe('low');
  });

  it('a raised start that runs fine does not rewrite autoSettled', () => {
    const store = memory({ version: 1, graphics: 'auto', autoSettled: 'low' });
    const g = new GraphicsControl(store, null);
    slow(g, 0, 10_000, 30);
    expect(g.active).toBe('medium');
    expect(saved(store).autoSettled).toBe('low');
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

  it('re-choosing Auto mid-session starts at autoSettled itself, without the session step', () => {
    const store = memory({ version: 1, graphics: 'auto', autoSettled: 'low' });
    const g = new GraphicsControl(store, null);
    g.choose('high');
    g.choose('auto');
    expect(g.active).toBe('low');
  });

  it('choose() ignores values that are not a graphics choice', () => {
    const store = memory({ version: 1, graphics: 'medium', autoSettled: null });
    const g = new GraphicsControl(store, null);
    for (const bad of ['bogus', '', null, undefined, 3, 'ULTRA']) g.choose(bad as unknown as GraphicsChoice);
    expect(g.choice).toBe('medium');
    expect(g.active).toBe('medium');
    expect(saved(store).graphics).toBe('medium');
    const forced = new GraphicsControl(memory(), 'ultra');
    forced.choose('nope' as unknown as GraphicsChoice);
    expect(forced.active).toBe('ultra');
  });

  it('interruptAuto(now) forgets a slow streak and ignores fps until the meter window has refilled', () => {
    const g = new GraphicsControl(memory(), null);
    slow(g, 0, 1500, 20);
    g.interruptAuto(1500);
    // Samples inside the window still mix in frames from before the interruption: ignored.
    expect(g.updateAuto(2400, 5)).toBe(false);
    // From 2500 on the samples count, and a fresh 2 s streak is needed.
    slow(g, 2500, 1900, 20);
    expect(g.active).toBe('high');
    expect(g.updateAuto(4500, 20)).toBe(true);
    expect(g.active).toBe('medium');
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

  it('a Graphics choice on a fresh device stores no world scale', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    g.choose('medium');
    expect(saved(store)).not.toHaveProperty('scale');
    expect(g.active).toBe('medium');
  });

  it('never overwrites a world scale picked after it loaded (choice and Auto step-down)', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    updateSettings(store, { scale: 'true' }); // the World scale panel, later in the session
    g.choose('auto');
    expect(saved(store).scale).toBe('true');
    expect(slow(g, 0, 10_000, 5)).toBeGreaterThan(0);
    expect(saved(store).autoSettled).not.toBeNull(); // Auto did step down and save
    expect(saved(store).scale).toBe('true');
    g.choose('low');
    expect(saved(store).scale).toBe('true');
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
