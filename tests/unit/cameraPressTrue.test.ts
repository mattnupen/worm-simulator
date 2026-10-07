import { describe, it, expect } from 'vitest';
import { pressAndTurn } from './cameraPress';

describe('the camera never snaps or shakes against a prop', () => {
  it('pressing into every prop (straight or off-centre), then turning on the spot either way', () => {
    // A hard turn alone changes the camera's step by about 0.004; easing in past a trunk, a few
    // hundredths. Snapping along its line to the head reached 0.2 at real size.
    for (const turn of [1, -1]) {
      const { jerk, rotation, inside } = pressAndTurn(turn);
      expect(jerk).toBeLessThan(0.06);
      // Craned right over the head, aiming with the sky as up spun the view (0.4 rad in one step here).
      expect(rotation).toBeLessThan(0.1);
      expect(inside).toBe(0);
    }
  }, 120_000);
});
