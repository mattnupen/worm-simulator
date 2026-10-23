import { describe, it, expect } from 'vitest';
import { PLAY_GOAL_SECONDS, playMinutes, quests } from '../../src/game/quests';

const states = (learned: boolean, playSeconds: number, voted: boolean) =>
  quests({ learned, playSeconds, voted }).map((q) => `${q.id}:${q.state}`);

describe('the round\'s quests: Learn, Play, Vote', () => {
  it('a new device: Learn and Play are both open, Vote waits on both (Matt, 2026-10-23)', () => {
    expect(states(false, 0, false)).toEqual(['learn:next', 'play:next', 'vote:locked']);
    expect(quests({ learned: false, playSeconds: 0, voted: false })[2].waitsOn).toEqual(['learn', 'play']);
  });

  it('playing first counts: Play can be done before Learn, and Vote then waits on Learn only', () => {
    expect(states(false, PLAY_GOAL_SECONDS, false)).toEqual(['learn:next', 'play:done', 'vote:locked']);
    expect(quests({ learned: false, playSeconds: PLAY_GOAL_SECONDS, voted: false })[2].waitsOn).toEqual(['learn']);
  });

  it('Vote opens once Learn and Play are both done', () => {
    expect(states(true, 0, false)).toEqual(['learn:done', 'play:next', 'vote:locked']);
    expect(quests({ learned: true, playSeconds: 0, voted: false })[2].waitsOn).toEqual(['play']);
    expect(states(true, PLAY_GOAL_SECONDS - 1, false)).toEqual(['learn:done', 'play:next', 'vote:locked']);
    expect(states(true, PLAY_GOAL_SECONDS, false)).toEqual(['learn:done', 'play:done', 'vote:next']);
    expect(states(true, PLAY_GOAL_SECONDS, true)).toEqual(['learn:done', 'play:done', 'vote:done']);
  });

  it('a vote before Learn is done does not count yet', () => {
    expect(states(false, PLAY_GOAL_SECONDS, true)).toEqual(['learn:next', 'play:done', 'vote:locked']);
  });

  it('the goal is 5 minutes, shown in whole minutes', () => {
    expect(PLAY_GOAL_SECONDS).toBe(300);
    expect(playMinutes({ learned: true, playSeconds: 179, voted: false })).toBe(2);
    expect(playMinutes({ learned: true, playSeconds: 9999, voted: false })).toBe(5);
  });
});
