import { describe, it, expect } from 'vitest';
import { BREAK_LENGTHS, WHOLE_WORM_CHANCE, huntOutcome, nextLength } from '../../src/predators/huntOutcome';
import { HUNT_NOTES } from '../../src/predators/huntNotes';
import { TEXT } from '../../src/content/text';

describe('what happens when the grip mini-game ends (V4 spec 3)', () => {
  it('nothing while it runs; getting back in is always an escape, whatever the roll', () => {
    expect(huntOutcome('none', 0, 1)).toBeNull();
    expect(huntOutcome('escaped', 0, 1)).toBe('escaped');
    expect(huntOutcome('escaped', 0.99, 0.6)).toBe('escaped');
  });

  it('1 catch in 4 the robin gets the whole worm (a Game choice); otherwise the worm breaks', () => {
    expect(WHOLE_WORM_CHANCE).toBe(0.25);
    expect(huntOutcome('pulledOut', 0, 1)).toBe('taken');
    expect(huntOutcome('pulledOut', 0.2499, 0.8)).toBe('taken');
    expect(huntOutcome('pulledOut', 0.25, 1)).toBe('broke');
    expect(huntOutcome('pulledOut', 0.9, 0.6)).toBe('tooShort');
  });

  it('lengths go 1 → 0.8 → 0.6, and a break at 0.6 is too short (start again)', () => {
    expect(BREAK_LENGTHS).toEqual([1, 0.8, 0.6]);
    let length = 1;
    const seen: number[] = [length];
    for (;;) {
      const out = huntOutcome('pulledOut', 0.5, length);
      if (out === 'tooShort') break;
      expect(out).toBe('broke');
      length = nextLength(length)!;
      seen.push(length);
    }
    expect(seen).toEqual([1, 0.8, 0.6]);
    expect(nextLength(0.6)).toBeNull();
  });

  it('an odd length (the ?wormLength= link) breaks to the next one down, or is too short', () => {
    expect(nextLength(0.9)).toBe(0.8);
    expect(nextLength(0.7)).toBe(0.6);
    expect(nextLength(0.5)).toBeNull();
    expect(nextLength(0.8000001)).toBe(0.6);
  });

  it('the notes carry their lines, the fact with its source and the game choices labelled', () => {
    expect(HUNT_NOTES.broke).toContain(TEXT.huntBroke.text);
    expect(HUNT_NOTES.broke).toContain('Earthworm Society of Britain');
    expect(HUNT_NOTES.tooShort).toContain('Game choice: ');
    expect(HUNT_NOTES.grip).toContain('Game choice: ');
    expect(HUNT_NOTES.grip).toContain('Journey North');
  });
});
