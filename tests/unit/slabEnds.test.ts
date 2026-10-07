import { describe, it, expect } from 'vitest';
import { createSlab, cutSpans, FACE_END_ROOM } from '../../src/underground/slab';
import { canDigAt, cutHeading, ENTRY_ROOM } from '../../src/underground/digSpot';
import { faceEndRoom } from '../../src/underground/cutFrame';
import { mulberry32 } from '../../src/core/random';

// The playable slab keeps clear of the drawn face's ends (where the world's edge clips the face),
// so Wide can show the head at the end with the layer names beyond it; a dig needs room each side.

describe("the playable slab and the face's ends", () => {
  it('the playable range stays FACE_END_ROOM inside the face, the room Wide needs on 9:16 to 16:9 screens', () => {
    expect(FACE_END_ROOM).toBeCloseTo(Math.max(faceEndRoom(16 / 9), faceEndRoom(9 / 16)), 9);
    expect(FACE_END_ROOM).toBeGreaterThan(faceEndRoom(3 / 2));
    // Wider screens show no more along the cut than 16:9 (cutFrame.ts WIDEST).
    for (const aspect of [1366 / 640, 1366 / 600, 1920 / 800]) expect(faceEndRoom(aspect)).toBeCloseTo(faceEndRoom(16 / 9), 9);
    const rand = mulberry32(5);
    const out: [number, number, number, number] = [0, 0, 0, 0];
    for (let k = 0; k < 2000; k++) {
      const x = rand() * 36 - 18;
      const z = rand() * 36 - 18;
      const h = rand() * 7;
      const s = createSlab(x, z, h, 1, k);
      expect(s.playHi).toBeLessThanOrEqual(s.faceHi - FACE_END_ROOM + 1e-9);
      expect(s.playLo).toBeGreaterThanOrEqual(s.faceLo + FACE_END_ROOM - 1e-9);
      cutSpans(x, z, s.tx, s.tz, out);
      expect(out).toEqual([s.playLo, s.playHi, s.faceLo, s.faceHi]);
    }
  });

  it('a dig near the world edge takes a cut with room each side of the entry; every dig allowed has it', () => {
    const rand = mulberry32(9);
    let allowed = 0;
    let turned = 0;
    for (let k = 0; k < 600; k++) {
      // Near an edge or a corner, heading anywhere (often straight out).
      const edge = 12 + rand() * 4.5;
      const x = rand() < 0.5 ? edge * (rand() < 0.5 ? -1 : 1) : rand() * 33 - 16.5;
      const z = Math.abs(x) >= 12 && rand() < 0.5 ? rand() * 33 - 16.5 : edge * (rand() < 0.5 ? -1 : 1);
      const heading = rand() * 2 * Math.PI;
      if (!canDigAt(x, z, heading)) continue;
      allowed++;
      const cut = cutHeading(x, z, heading)!;
      if (Math.abs(cut - heading) > 0.01) turned++;
      const s = createSlab(x, z, cut, 1, k);
      expect(s.playLo).toBeLessThanOrEqual(-ENTRY_ROOM);
      expect(s.playHi).toBeGreaterThanOrEqual(ENTRY_ROOM);
    }
    expect(allowed).toBeGreaterThan(40);
    expect(turned).toBeGreaterThan(0);
  });
});
