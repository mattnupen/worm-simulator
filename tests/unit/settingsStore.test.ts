import { describe, it, expect } from 'vitest';
import {
  loadSettings, saveSettings, updateSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type KeyValueStore,
} from '../../src/save/settingsStore';

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

const throwing: KeyValueStore = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

const stored = (raw: object) => memory({ [SETTINGS_KEY]: JSON.stringify(raw) });

describe('settings store', () => {
  it('uses the wormsim.settings key', () => {
    expect(SETTINGS_KEY).toBe('wormsim.settings');
  });

  it('defaults to Auto with nothing settled', () => {
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, graphics: 'auto', autoSettled: null });
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips what it saves', () => {
    const store = memory();
    const s = { version: 1, graphics: 'ultra', autoSettled: 'medium' } as const;
    expect(saveSettings(store, s)).toBe(true);
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual(s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('reads a Step 1a save, keeping its graphics', () => {
    expect(loadSettings(stored({ version: 1, graphics: 'high', autoSettled: 'medium' })))
      .toEqual({ version: 1, graphics: 'high', autoSettled: 'medium' });
  });

  it('reads a V1 save with a World scale: the scale is ignored (V2 is real size only)', () => {
    for (const scale of ['classic', 'hybrid', 'true', 'giant', 7]) {
      expect(loadSettings(stored({ version: 1, graphics: 'low', autoSettled: 'low', scale })))
        .toEqual({ version: 1, graphics: 'low', autoSettled: 'low' });
    }
  });

  it('keeps a V1 World scale on every write, so V1 at /v1/ still finds it', () => {
    const store = stored({ version: 1, graphics: 'auto', autoSettled: null, scale: 'classic' });
    updateSettings(store, { graphics: 'low' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'low', autoSettled: null, scale: 'classic' });
    saveSettings(store, { ...loadSettings(store), autoSettled: 'medium' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'low', autoSettled: 'medium', scale: 'classic' });
  });

  it('never writes a scale itself (a fresh device stays unpinned)', () => {
    const fresh = memory();
    updateSettings(fresh, { graphics: 'low' });
    expect(JSON.parse(fresh.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '[1,2]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on a wrong version', () => {
    expect(loadSettings(stored({ version: 2, graphics: 'low', autoSettled: 'low' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces unknown field values with their defaults', () => {
    expect(loadSettings(stored({ version: 1, graphics: 'extreme', autoSettled: 'ultra' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ version: 1, graphics: 'low', autoSettled: 42 })))
      .toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('keeps fields it does not know when it saves (a later version\'s)', () => {
    const store = stored({ version: 1, graphics: 'low', autoSettled: null, moisture: { muted: true } });
    saveSettings(store, { ...loadSettings(store), graphics: 'high' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({
      version: 1, graphics: 'high', autoSettled: null, moisture: { muted: true },
    });
  });

  it('updateSettings changes only what it is given', () => {
    const store = stored({ version: 1, graphics: 'low', autoSettled: 'medium', later: 1 });
    expect(updateSettings(store, { graphics: 'ultra' })).toEqual({ version: 1, graphics: 'ultra', autoSettled: 'medium' });
    expect(updateSettings(store, { autoSettled: 'low' }).graphics).toBe('ultra');
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({
      version: 1, graphics: 'ultra', autoSettled: 'low', later: 1,
    });
  });

  it('survives storage that throws, on read and on write', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, { ...DEFAULT_SETTINGS, graphics: 'low' })).toBe(false);
    expect(saveSettings(null, { ...DEFAULT_SETTINGS, graphics: 'low' })).toBe(false);
    expect(updateSettings(throwing, { graphics: 'high' }).graphics).toBe('high');
    // Reads fail but writes work: no blind write that could drop a later version's fields.
    const writes: string[] = [];
    const unreadable: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: (_k, v) => { writes.push(v); } };
    expect(updateSettings(unreadable, { graphics: 'low' }).graphics).toBe('low');
    expect(writes).toEqual([]);
  });
});
