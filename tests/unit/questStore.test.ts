import { describe, it, expect } from 'vitest';
import { QUESTS_KEY, loadRound, saveRound } from '../../src/save/questStore';
import type { KeyValueStore } from '../../src/save/settingsStore';

function fake(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe('questStore', () => {
  it('nothing done at first; a round\'s progress is kept under its own key', () => {
    const s = fake();
    expect(loadRound(s, 3)).toEqual({ playSeconds: 0, voted: false });
    saveRound(s, 3, { playSeconds: 61.4, voted: true });
    expect(loadRound(s, 3)).toEqual({ playSeconds: 61, voted: true });
    expect(loadRound(s, 4)).toEqual({ playSeconds: 0, voted: false });
    expect(JSON.parse(s.data[QUESTS_KEY])).toEqual({ version: 1, rounds: { 3: { playSeconds: 61, voted: true } } });
  });

  it('keeps other rounds, including ones this build does not know', () => {
    const s = fake({ [QUESTS_KEY]: JSON.stringify({ version: 1, rounds: { 9: { playSeconds: 300, voted: true, later: 1 } } }) });
    saveRound(s, 3, { playSeconds: 10, voted: false });
    expect(JSON.parse(s.data[QUESTS_KEY]).rounds[9]).toEqual({ playSeconds: 300, voted: true, later: 1 });
  });

  it('broken, odd or blocked storage reads as nothing done and never throws', () => {
    expect(loadRound(fake({ [QUESTS_KEY]: '{oops' }), 3)).toEqual({ playSeconds: 0, voted: false });
    expect(loadRound(fake({ [QUESTS_KEY]: JSON.stringify({ version: 1, rounds: { 3: { playSeconds: 'x', voted: 'yes' } } }) }), 3))
      .toEqual({ playSeconds: 0, voted: false });
    expect(loadRound(null, 3)).toEqual({ playSeconds: 0, voted: false });
    const blocked: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadRound(blocked, 3)).toEqual({ playSeconds: 0, voted: false });
    expect(() => saveRound(blocked, 3, { playSeconds: 1, voted: true })).not.toThrow();
  });
});
