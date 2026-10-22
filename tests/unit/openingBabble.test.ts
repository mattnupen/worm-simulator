import { describe, it, expect } from 'vitest';
import { babbleNotes, VOICES } from '../../src/opening/babble';
import { CAPTIONS } from '../../src/opening/script';
import { TEXT, shown } from '../../src/content/text';
import { pileLift } from '../../src/opening/opening';
import { PILE, SOIL } from '../../src/opening/script';

describe('the opening babble', () => {
  it('gives every spoken caption one blip per letter, inside its caption', () => {
    for (const c of CAPTIONS) {
      if (!c.who) continue;
      const text = shown(TEXT[c.line]);
      const notes = babbleNotes(text, c.from, c.to, c.who);
      expect(notes.length).toBe((text.match(/[a-z]/gi) ?? []).length);
      expect(notes[0].t).toBeGreaterThanOrEqual(c.from);
      const last = notes[notes.length - 1];
      expect(last.t + last.dur).toBeLessThanOrEqual(c.to);
    }
  });

  it('pitches the kid above the teacher and rises at the end of a question', () => {
    expect(VOICES.kid.pitch).toBeGreaterThan(VOICES.teacher.pitch);
    const q = babbleNotes('Is that the lake?', 0, 3, 'kid');
    const s = babbleNotes('Is that the lake.', 0, 3, 'kid');
    expect(q[q.length - 1].pitch).toBeGreaterThan(s[s.length - 1].pitch);
  });
});

describe('the spilled pile under the worm', () => {
  it('lifts the worm onto the big mound, and not at all away from it or before the spill', () => {
    const [, , h] = PILE[0];
    // The big mound's middle: local (0, -0.85) turned by SOIL.yaw into the world.
    const c = Math.cos(SOIL.yaw);
    const s = Math.sin(SOIL.yaw);
    const x = SOIL.x + (0 * c + -0.85 * s);
    const z = SOIL.z + (-0 * s + -0.85 * c);
    expect(pileLift(x, z, 1)).toBeGreaterThan(h * 0.95);
    expect(pileLift(x + 20, z + 20, 1)).toBe(0);
    expect(pileLift(x, z, 0)).toBe(0);
  });
});
