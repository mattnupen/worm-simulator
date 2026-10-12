import type { KeyValueStore } from './settingsStore';

/**
 * This device's progress on each round's Play and Vote quests (src/game/quests.ts), keyed by version
 * number, so V4 starts fresh while V3's progress stays. Learn's progress is the lesson's own
 * (lessonStore.ts). Its own key, never a field of another: older builds never read it, and rounds
 * this build does not know are kept on every write (CLAUDE.md, "One origin, shared saves"). Every
 * read and write is guarded: broken or blocked storage reads as nothing done.
 */
export const QUESTS_KEY = 'wormsim.quests';

export interface RoundProgress { playSeconds: number; voted: boolean }

const NONE: RoundProgress = { playSeconds: 0, voted: false };

function readAll(store: KeyValueStore): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(store.getItem(QUESTS_KEY) ?? 'null');
    if (typeof v === 'object' && v !== null && (v as { version?: unknown }).version === 1) {
      const rounds = (v as { rounds?: unknown }).rounds;
      if (typeof rounds === 'object' && rounds !== null && !Array.isArray(rounds)) return rounds as Record<string, unknown>;
    }
  } catch {
    // fall through: nothing done
  }
  return {};
}

export function loadRound(store: KeyValueStore | null, round: number): RoundProgress {
  if (!store) return { ...NONE };
  const r = readAll(store)[String(round)];
  if (typeof r !== 'object' || r === null) return { ...NONE };
  const o = r as Record<string, unknown>;
  const s = typeof o.playSeconds === 'number' && Number.isFinite(o.playSeconds) && o.playSeconds > 0 ? o.playSeconds : 0;
  return { playSeconds: s, voted: o.voted === true };
}

/** Writes this round's progress, keeping every other round. Ignores a failed write. */
export function saveRound(store: KeyValueStore | null, round: number, p: RoundProgress): void {
  if (!store) return;
  try {
    const rounds = readAll(store);
    store.setItem(QUESTS_KEY, JSON.stringify({ version: 1, rounds: { ...rounds, [String(round)]: { playSeconds: Math.round(p.playSeconds), voted: p.voted } } }));
  } catch {
    // Blocked storage: progress lasts for this session only.
  }
}
