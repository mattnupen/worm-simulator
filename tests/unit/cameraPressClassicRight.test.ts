import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';
import { pressAndTurn } from './cameraPress';

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('classic: the camera never snaps or shakes against a prop', () => {
  beforeAll(() => { setScale('classic'); });

  it('pressing into every prop (straight or off-centre), then turning on the spot to the right', () => {
    // A hard turn alone changes the camera's step by about 0.004; easing in past a trunk, a few
    // hundredths. Snapping along its line to the head reached 1.9 in Classic.
    const { jerk, inside } = pressAndTurn(1);
    expect(jerk).toBeLessThan(0.06);
    expect(inside).toBe(0);
  }, 120_000);
});
