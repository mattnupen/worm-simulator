import { describe, it, expect } from 'vitest';
import { OPENINGS_KEY, markOpeningSeen, openingSeen } from '../../src/save/openingStore';
import type { KeyValueStore } from '../../src/save/settingsStore';

function fake(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe('openingStore', () => {
  it('nothing seen at first; seeing a version is remembered under its own key', () => {
    const s = fake();
    expect(openingSeen(s, 4)).toBe(false);
    markOpeningSeen(s, 4);
    expect(openingSeen(s, 4)).toBe(true);
    expect(openingSeen(s, 5)).toBe(false);
    expect(JSON.parse(s.data[OPENINGS_KEY])).toEqual({ version: 1, seen: [4] });
    expect(Object.keys(s.data)).toEqual([OPENINGS_KEY]);
  });

  it('keeps other versions and never doubles one', () => {
    const s = fake({ [OPENINGS_KEY]: JSON.stringify({ version: 1, seen: [3], later: true }) });
    markOpeningSeen(s, 4);
    markOpeningSeen(s, 4);
    expect(JSON.parse(s.data[OPENINGS_KEY]).seen).toEqual([3, 4]);
  });

  it('broken, unknown or blocked storage reads as not seen and never throws', () => {
    expect(openingSeen(fake({ [OPENINGS_KEY]: '{oops' }), 4)).toBe(false);
    expect(openingSeen(fake({ [OPENINGS_KEY]: JSON.stringify({ version: 2, seen: [4] }) }), 4)).toBe(false);
    expect(openingSeen(null, 4)).toBe(false);
    const blocked: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(openingSeen(blocked, 4)).toBe(false);
    expect(() => markOpeningSeen(blocked, 4)).not.toThrow();
    expect(() => markOpeningSeen(null, 4)).not.toThrow();
  });
});
