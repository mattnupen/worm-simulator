/**
 * Commands.action is a held level (src/input/commands.ts): a consumer that acts once per press
 * keeps one of these and feeds it the level every step. update() is true only on the step the
 * level goes from up to down, so holding Space (or the touch Action button) acts once. No
 * allocation per call.
 */
export function createPressEdge(): { update(level: boolean): boolean } {
  let was = false;
  return {
    update(level: boolean): boolean {
      const pressed = level && !was;
      was = level;
      return pressed;
    },
  };
}
