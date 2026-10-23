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

  it('every catch, the robin gets the whole worm (Matt, 2026-10-23), whatever the roll or length', () => {
    expect(WHOLE_WORM_CHANCE).toBe(1);
    for (const roll of [0, 0.25, 0.5, 0.9999]) {
      for (const length of [1, 0.8, 0.6]) expect(huntOutcome('pulledOut', roll, length)).toBe('taken');
    }
  });

  it('lengths go 1 → 0.8 → 0.6, and a break at 0.6 is too short (start again)', () => {
    expect(BREAK_LENGTHS).toEqual([1, 0.8, 0.6]);
    // Kept for tuning: with WHOLE_WORM_CHANCE at 1 no catch breaks the worm.
    let length: number | null = 1;
    const seen: number[] = [];
    while (length !== null) {
      seen.push(length);
      length = nextLength(length);
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

  it('the notes carry their lines, the fact with its source, and no "Game choice" label', () => {
    expect(HUNT_NOTES.broke).toContain(TEXT.huntBroke.text);
    expect(HUNT_NOTES.broke).toContain('Earthworm Society of Britain');
    for (const note of Object.values(HUNT_NOTES)) expect(note).not.toMatch(/game choice|energy bar|new life/i);
    expect(HUNT_NOTES.grip).toContain('Journey North');
  });
});
