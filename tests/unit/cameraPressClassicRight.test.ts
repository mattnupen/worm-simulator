import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';
import { pressAndTurn } from './cameraPress';

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('classic: the camera never snaps or shakes against a prop', () => {
  beforeAll(() => { setScale('classic'); });

  it('pressing into every prop (straight or off-centre), then turning on the spot to the right', () => {
    // A hard turn alone changes the camera's step by about 0.004; easing in past a trunk, a few
    // hundredths. Snapping along its line to the head reached 1.9 in Classic.
    const { jerk, rotation, inside } = pressAndTurn(1);
    expect(jerk).toBeLessThan(0.06);
    // Craned right over the head, aiming with the sky as up spun the view (2.4 rad in one step).
    expect(rotation).toBeLessThan(0.1);
    expect(inside).toBe(0);
  }, 120_000);
});
