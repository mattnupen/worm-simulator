import type { KeyValueStore } from './settingsStore';

/**
 * Which in-game lessons this device has finished, so the Start screen can lead with an unfinished
 * one and step back once it is done. Its own key, never a field of wormsim.settings: older builds
 * on the same origin never read it, and it is never repurposed (CLAUDE.md, "One origin, shared
 * saves"). Lesson ids from other versions are kept on every write. Every read and write is
 * guarded: broken or blocked storage reads as "none finished" and a failed write is ignored.
 */
export const LESSONS_KEY = 'wormsim.lessons';

interface Stored { version: 1; done: string[] }

function read(store: KeyValueStore): Stored {
  try {
    const v: unknown = JSON.parse(store.getItem(LESSONS_KEY) ?? 'null');
    if (typeof v === 'object' && v !== null && (v as Stored).version === 1 && Array.isArray((v as Stored).done)) {
      return { version: 1, done: (v as Stored).done.filter((d): d is string => typeof d === 'string') };
    }
  } catch {
    // fall through to "none finished"
  }
  return { version: 1, done: [] };
}

export function lessonDone(store: KeyValueStore | null, id: string): boolean {
  return store ? read(store).done.includes(id) : false;
}

export function markLessonDone(store: KeyValueStore | null, id: string): void {
  if (!store) return;
  try {
    const s = read(store);
    if (!s.done.includes(id)) store.setItem(LESSONS_KEY, JSON.stringify({ version: 1, done: [...s.done, id] }));
  } catch {
    // Blocked storage: the lesson just stays first on Start.
  }
}
