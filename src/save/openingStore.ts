import type { KeyValueStore } from './settingsStore';

/**
 * Which versions' openings this device has seen, so the scene plays on a version's first Crawl and
 * then only when asked for (Start's "Watch the opening"). Its own key, never a field of another
 * (CLAUDE.md, "One origin, shared saves"): older builds never read it, and other versions' numbers
 * are kept on every write. Broken or blocked storage reads as "not seen" (so the scene plays, and
 * Skip is always there) and a failed write is ignored.
 */
export const OPENINGS_KEY = 'wormsim.openings';

interface Stored { version: 1; seen: number[] }

function read(store: KeyValueStore): Stored {
  try {
    const v: unknown = JSON.parse(store.getItem(OPENINGS_KEY) ?? 'null');
    if (typeof v === 'object' && v !== null && (v as Stored).version === 1 && Array.isArray((v as Stored).seen)) {
      return { version: 1, seen: (v as Stored).seen.filter((n): n is number => typeof n === 'number') };
    }
  } catch {
    // fall through to "none seen"
  }
  return { version: 1, seen: [] };
}

export function openingSeen(store: KeyValueStore | null, version: number): boolean {
  return store ? read(store).seen.includes(version) : false;
}

export function markOpeningSeen(store: KeyValueStore | null, version: number): void {
  if (!store) return;
  try {
    const s = read(store);
    if (!s.seen.includes(version)) store.setItem(OPENINGS_KEY, JSON.stringify({ version: 1, seen: [...s.seen, version] }));
  } catch {
    // Blocked storage: the opening plays again next time.
  }
}
