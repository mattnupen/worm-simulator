/**
 * The round's quest list (Matt, 2026-10-12): 1 Learn, 2 Play, 3 Vote. Learn and Play are both open
 * from the start, so a student can just start playing (Matt, 2026-10-23); Vote opens once both are
 * done, because the form asks about the lesson and the game. Pure, so the Start screen and the
 * tests share one rule.
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

export interface Quest {
  readonly id: QuestId;
  readonly state: QuestState;
  /** For a locked quest: the quests still to finish before it opens. */
  readonly waitsOn?: readonly QuestId[];
}

export function playDone(p: QuestProgress): boolean {
  return p.playSeconds >= PLAY_GOAL_SECONDS;
}

/** The three quests in order: Learn and Play always open, Vote locked until both are done. */
export function quests(p: QuestProgress): readonly Quest[] {
  const played = playDone(p);
  const waitsOn: QuestId[] = [];
  if (!p.learned) waitsOn.push('learn');
  if (!played) waitsOn.push('play');
  const vote: Quest = p.learned && played
    ? { id: 'vote', state: p.voted ? 'done' : 'next' }
    : { id: 'vote', state: 'locked', waitsOn };
  return [
    { id: 'learn', state: p.learned ? 'done' : 'next' },
    { id: 'play', state: played ? 'done' : 'next' },
    vote,
  ];
}

/** Whole minutes played toward the goal, for "2 of 5 minutes". */
export function playMinutes(p: QuestProgress): number {
  return Math.floor(Math.min(PLAY_GOAL_SECONDS, p.playSeconds) / 60);
}
