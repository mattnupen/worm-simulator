import { describe, it, expect } from 'vitest';
import {
  loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type KeyValueStore,
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
    expect(saveSettings(store, { version: 1, graphics: 'ultra', autoSettled: 'medium' })).toBe(true);
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'ultra', autoSettled: 'medium' });
    expect(loadSettings(store)).toEqual({ version: 1, graphics: 'ultra', autoSettled: 'medium' });
  });

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '[1,2]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on a wrong version', () => {
    const raw = JSON.stringify({ version: 2, graphics: 'low', autoSettled: 'low' });
    expect(loadSettings(memory({ [SETTINGS_KEY]: raw }))).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces unknown field values with their defaults', () => {
    const raw = JSON.stringify({ version: 1, graphics: 'extreme', autoSettled: 'ultra' });
    expect(loadSettings(memory({ [SETTINGS_KEY]: raw }))).toEqual(DEFAULT_SETTINGS);
    const raw2 = JSON.stringify({ version: 1, graphics: 'low', autoSettled: 42 });
    expect(loadSettings(memory({ [SETTINGS_KEY]: raw2 }))).toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('survives storage that throws, on read and on write', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, { version: 1, graphics: 'low', autoSettled: null })).toBe(false);
    expect(saveSettings(null, { version: 1, graphics: 'low', autoSettled: null })).toBe(false);
  });
});
