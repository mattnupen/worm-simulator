import { describe, it, expect } from 'vitest';
import {
  loadSettings, saveSettings, updateSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type KeyValueStore,
} from '../../src/save/settingsStore';
import { DEFAULT_SCALE } from '../../src/surface/worldScale';

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

  it('defaults to Auto with nothing settled, at the default world scale', () => {
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, graphics: 'auto', autoSettled: null, scale: DEFAULT_SCALE });
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips what it saves', () => {
    const store = memory();
    const s = { version: 1, graphics: 'ultra', autoSettled: 'medium', scale: 'hybrid' } as const;
    expect(saveSettings(store, s)).toBe(true);
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual(s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('reads a Step 1a save (no scale) as the default scale, keeping its graphics', () => {
    expect(loadSettings(stored({ version: 1, graphics: 'high', autoSettled: 'medium' })))
      .toEqual({ version: 1, graphics: 'high', autoSettled: 'medium', scale: DEFAULT_SCALE });
  });

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '[1,2]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on a wrong version', () => {
    expect(loadSettings(stored({ version: 2, graphics: 'low', autoSettled: 'low', scale: 'true' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces unknown field values with their defaults', () => {
    expect(loadSettings(stored({ version: 1, graphics: 'extreme', autoSettled: 'ultra', scale: 'giant' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ version: 1, graphics: 'low', autoSettled: 42, scale: 7 })))
      .toEqual({ version: 1, graphics: 'low', autoSettled: null, scale: DEFAULT_SCALE });
  });

  it('keeps fields it does not know when it saves (a later version\'s)', () => {
    const store = stored({ version: 1, graphics: 'low', autoSettled: null, scale: 'true', moisture: { muted: true } });
    saveSettings(store, { ...loadSettings(store), graphics: 'high' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({
      version: 1, graphics: 'high', autoSettled: null, scale: 'true', moisture: { muted: true },
    });
  });

  it('updateSettings changes only what it is given', () => {
    const store = stored({ version: 1, graphics: 'low', autoSettled: 'medium', scale: 'classic', later: 1 });
    expect(updateSettings(store, { scale: 'true' })).toEqual({ version: 1, graphics: 'low', autoSettled: 'medium', scale: 'true' });
    expect(updateSettings(store, { graphics: 'ultra' }).scale).toBe('true');
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({
      version: 1, graphics: 'ultra', autoSettled: 'medium', scale: 'true', later: 1,
    });
  });

  it('survives storage that throws, on read and on write', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, { ...DEFAULT_SETTINGS, graphics: 'low' })).toBe(false);
    expect(saveSettings(null, { ...DEFAULT_SETTINGS, graphics: 'low' })).toBe(false);
    expect(updateSettings(throwing, { scale: 'hybrid' }).scale).toBe('hybrid');
  });
});
