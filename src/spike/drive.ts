import { NO_COMMANDS, type Commands } from '../input/commands';
import type { LocomotionOptions } from '../worm/locomotion';
import { PLAY_HALF } from '../surface/terrain';

/**
 * What the speed test does and how the worm moves. Kept free of side effects (no DOM, no
 * WebGL) so the prop placement tests can simulate the exact path the test drives.
 */
export const AUTO_DRIVE_MOVE: Commands = { ...NO_COMMANDS, move: { x: 0.35, y: 1 } };

export const LOCOMOTION: LocomotionOptions = {
  speed: 1.6,
  turnRate: 2.2,
  halfSize: PLAY_HALF,
  minTurnRadius: 1.0,
  pivotZone: 0.15,
};
