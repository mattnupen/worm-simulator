/**
 * The round's quest list (Matt, 2026-10-12): 1 Learn, 2 Play, 3 Vote, done in order. A quest opens
 * only once the one before it is done, so a student can't jump ahead. Pure, so the Start screen
 * and the tests share one rule.
 */
export type QuestId = 'learn' | 'play' | 'vote';
export type QuestState = 'done' | 'next' | 'locked';

/** How long the Play quest asks for: 5 minutes of real crawling or digging (not paused). */
export const PLAY_GOAL_SECONDS = 300;

export interface QuestProgress {
  readonly learned: boolean;
  /** Seconds played this round, paused time and menus not counted. */
  readonly playSeconds: number;
  readonly voted: boolean;
}

export interface Quest { readonly id: QuestId; readonly state: QuestState }

export function playDone(p: QuestProgress): boolean {
  return p.playSeconds >= PLAY_GOAL_SECONDS;
}

/** The three quests in order. Each one is done, next (the first not done), or locked behind it. */
export function quests(p: QuestProgress): readonly Quest[] {
  const done: Record<QuestId, boolean> = { learn: p.learned, play: p.learned && playDone(p), vote: p.learned && playDone(p) && p.voted };
  let open = true;
  return (['learn', 'play', 'vote'] as const).map((id) => {
    const state: QuestState = done[id] ? 'done' : open ? 'next' : 'locked';
    if (!done[id]) open = false;
    return { id, state };
  });
}

/** Whole minutes played toward the goal, for "2 of 5 minutes". */
export function playMinutes(p: QuestProgress): number {
  return Math.floor(Math.min(PLAY_GOAL_SECONDS, p.playSeconds) / 60);
}
