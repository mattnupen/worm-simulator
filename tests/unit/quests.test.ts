import { describe, it, expect } from 'vitest';
import { PLAY_GOAL_SECONDS, playMinutes, quests } from '../../src/game/quests';

const states = (learned: boolean, playSeconds: number, voted: boolean) =>
  quests({ learned, playSeconds, voted }).map((q) => `${q.id}:${q.state}`);

describe('the round\'s quests: Learn, Play, Vote, in order', () => {
  it('a new device: Learn is next, the rest locked', () => {
    expect(states(false, 0, false)).toEqual(['learn:next', 'play:locked', 'vote:locked']);
  });

  it('each quest opens only when the one before is done', () => {
    expect(states(true, 0, false)).toEqual(['learn:done', 'play:next', 'vote:locked']);
    expect(states(true, PLAY_GOAL_SECONDS - 1, false)).toEqual(['learn:done', 'play:next', 'vote:locked']);
    expect(states(true, PLAY_GOAL_SECONDS, false)).toEqual(['learn:done', 'play:done', 'vote:next']);
    expect(states(true, PLAY_GOAL_SECONDS, true)).toEqual(['learn:done', 'play:done', 'vote:done']);
  });

  it('no jumping ahead: play time or a vote before Learn counts for nothing yet', () => {
    expect(states(false, PLAY_GOAL_SECONDS, true)).toEqual(['learn:next', 'play:locked', 'vote:locked']);
  });

  it('the goal is 5 minutes, shown in whole minutes', () => {
    expect(PLAY_GOAL_SECONDS).toBe(300);
    expect(playMinutes({ learned: true, playSeconds: 179, voted: false })).toBe(2);
    expect(playMinutes({ learned: true, playSeconds: 9999, voted: false })).toBe(5);
  });
});
