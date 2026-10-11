import { describe, it, expect } from 'vitest';
import { LESSONS_KEY, lessonDone, markLessonDone } from '../../src/save/lessonStore';
import type { KeyValueStore } from '../../src/save/settingsStore';

function fake(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe('lessonStore', () => {
  it('nothing finished at first; finishing is remembered under its own key', () => {
    const s = fake();
    expect(lessonDone(s, 'predators')).toBe(false);
    markLessonDone(s, 'predators');
    expect(lessonDone(s, 'predators')).toBe(true);
    expect(JSON.parse(s.data[LESSONS_KEY])).toEqual({ version: 1, done: ['predators'] });
    expect(s.data['wormsim.settings']).toBeUndefined();
  });

  it('keeps other versions\' lessons and never doubles one', () => {
    const s = fake({ [LESSONS_KEY]: JSON.stringify({ version: 1, done: ['frost'], later: true }) });
    markLessonDone(s, 'predators');
    markLessonDone(s, 'predators');
    expect(JSON.parse(s.data[LESSONS_KEY]).done).toEqual(['frost', 'predators']);
  });

  it('broken, unknown or blocked storage reads as nothing finished and never throws', () => {
    expect(lessonDone(fake({ [LESSONS_KEY]: '{oops' }), 'predators')).toBe(false);
    expect(lessonDone(fake({ [LESSONS_KEY]: JSON.stringify({ version: 2, done: ['predators'] }) }), 'predators')).toBe(false);
    expect(lessonDone(null, 'predators')).toBe(false);
    const blocked: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(lessonDone(blocked, 'predators')).toBe(false);
    expect(() => markLessonDone(blocked, 'predators')).not.toThrow();
    expect(() => markLessonDone(null, 'predators')).not.toThrow();
  });
});
