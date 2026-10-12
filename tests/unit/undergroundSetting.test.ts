import { describe, it, expect } from 'vitest';
import {
  loadSettings, saveSettings, updateSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type KeyValueStore,
} from '../../src/save/settingsStore';
import { DEFAULT_UNDERGROUND_VIEW } from '../../src/underground/modeMachine';

function memoryStore(initial?: unknown): KeyValueStore & { raw(): Record<string, unknown> | null } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    raw: () => (data.has(SETTINGS_KEY) ? JSON.parse(data.get(SETTINGS_KEY)!) : null),
  };
}

describe('the underground camera setting (spec 7)', () => {
  it('reads as Wide when never chosen, including from V1 and Step 1a saves', () => {
    expect(DEFAULT_UNDERGROUND_VIEW).toBe('wide');
    expect(DEFAULT_SETTINGS.undergroundView).toBe('wide');
    expect(loadSettings(memoryStore()).undergroundView).toBe('wide');
    expect(loadSettings(null).undergroundView).toBe('wide');
    expect(loadSettings(memoryStore({ version: 1, graphics: 'low', autoSettled: null })).undergroundView).toBe('wide');
    const v1 = loadSettings(memoryStore({ version: 1, graphics: 'low', autoSettled: null, scale: 'hybrid' }));
    expect(v1).toEqual({ version: 1, graphics: 'low', autoSettled: null, undergroundView: 'wide', sound: true });
  });

  it('reads an unknown or garbage stored view as the default', () => {
    for (const bad of ['sideways', 'WIDE', '', 7, null, true, ['close'], { view: 'close' }]) {
      expect(loadSettings(memoryStore({ version: 1, graphics: 'low', autoSettled: null, undergroundView: bad })).undergroundView).toBe('wide');
    }
  });

  it('is stored only once the player switches it: a Graphics pick never pins the default', () => {
    const store = memoryStore({ version: 1, graphics: 'auto', autoSettled: null });
    updateSettings(store, { graphics: 'high' });
    expect(store.raw()).not.toHaveProperty('undergroundView');
    updateSettings(store, { autoSettled: 'low' });
    expect(store.raw()).not.toHaveProperty('undergroundView');
    const fresh = memoryStore();
    updateSettings(fresh, { graphics: 'low' });
    expect(fresh.raw()).not.toHaveProperty('undergroundView');
    updateSettings(store, { undergroundView: 'close' });
    expect(store.raw()?.undergroundView).toBe('close');
    expect(loadSettings(store).undergroundView).toBe('close');
    // Kept by later writes of other settings.
    updateSettings(store, { graphics: 'low' });
    expect(store.raw()?.undergroundView).toBe('close');
  });

  it('a pick back to Wide is a real pick: it is stored and kept', () => {
    const store = memoryStore({ version: 1, graphics: 'auto', autoSettled: null, undergroundView: 'close' });
    expect(updateSettings(store, { undergroundView: 'wide' }).undergroundView).toBe('wide');
    expect(store.raw()?.undergroundView).toBe('wide');
    updateSettings(store, { graphics: 'high' });
    expect(store.raw()?.undergroundView).toBe('wide');
  });

  it('keeps fields this build does not know, and a V1 world scale', () => {
    const store = memoryStore({ version: 1, graphics: 'auto', autoSettled: null, scale: 'classic', later: 7 });
    updateSettings(store, { undergroundView: 'wide' });
    expect(store.raw()).toMatchObject({ later: 7, scale: 'classic', undergroundView: 'wide' });
    updateSettings(store, { graphics: 'low' });
    expect(store.raw()).toMatchObject({ later: 7, scale: 'classic', undergroundView: 'wide' });
  });

  it('an undefined field in a patch changes nothing: the settings keep their values and type', () => {
    const store = memoryStore({ version: 1, graphics: 'low', autoSettled: 'medium', undergroundView: 'close' });
    const got = updateSettings(store, { graphics: undefined, undergroundView: undefined, autoSettled: undefined });
    expect(got).toEqual({ version: 1, graphics: 'low', autoSettled: 'medium', undergroundView: 'close', sound: true });
    expect(store.raw()).toMatchObject({ graphics: 'low', autoSettled: 'medium', undergroundView: 'close' });
    // Never pinned by an undefined view, and a null autoSettled is still a value.
    const fresh = memoryStore({ version: 1, graphics: 'auto', autoSettled: 'low' });
    expect(updateSettings(fresh, { undergroundView: undefined, autoSettled: null })).toEqual({
      version: 1, graphics: 'auto', autoSettled: null, undergroundView: 'wide', sound: true,
    });
    expect(fresh.raw()).not.toHaveProperty('undergroundView');
    expect(updateSettings(null, { graphics: undefined }).graphics).toBe(DEFAULT_SETTINGS.graphics);
  });

  it('saveSettings follows the same rule', () => {
    const store = memoryStore({ version: 1, graphics: 'auto', autoSettled: null, scale: 'true' });
    saveSettings(store, { ...loadSettings(store), graphics: 'low' });
    expect(store.raw()).toEqual({ version: 1, graphics: 'low', autoSettled: null, scale: 'true' });
    saveSettings(store, { ...loadSettings(store), undergroundView: 'close' });
    expect(store.raw()).toMatchObject({ scale: 'true', undergroundView: 'close' });
    saveSettings(store, { ...loadSettings(store), graphics: 'high' });
    expect(store.raw()).toMatchObject({ graphics: 'high', undergroundView: 'close' });
  });
});
