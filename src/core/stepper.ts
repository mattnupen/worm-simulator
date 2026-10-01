export interface StepperState { accumulator: number; sinceRender: number }

const MAX_ELAPSED_MS = 250;
const RENDER_TOLERANCE_MS = 1;

export function createStepper(): StepperState {
  return { accumulator: 0, sinceRender: 0 };
}

/**
 * Advance game time by elapsedMs. Returns how many fixed update steps to run
 * and whether to render this frame. minFrameMs = 0 means no frame cap.
 */
export function advance(
  s: StepperState,
  elapsedMs: number,
  stepMs: number,
  minFrameMs: number,
  maxSteps = 5,
): { steps: number; render: boolean; alpha: number } {
  const raw = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const dt = Math.min(Math.max(raw, 0), MAX_ELAPSED_MS);
  s.accumulator += dt;
  s.sinceRender += dt;
  let steps = 0;
  while (s.accumulator >= stepMs && steps < maxSteps) {
    s.accumulator -= stepMs;
    steps++;
  }
  if (steps === maxSteps) s.accumulator = 0;
  const render = s.sinceRender >= minFrameMs - RENDER_TOLERANCE_MS;
  if (render) s.sinceRender = minFrameMs > 0 ? Math.min(s.sinceRender - minFrameMs, minFrameMs) : 0;
  const alpha = s.accumulator / stepMs;
  return { steps, render, alpha };
}
