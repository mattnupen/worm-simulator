import { advance, createStepper } from './stepper';

export interface LoopHandle {
  stop(): void;
  /** Use Infinity for no cap. */
  setMaxFps(fps: number): void;
}

export function startLoop(
  update: (dtSec: number) => void,
  render: (nowMs: number) => void,
  opts: { stepHz?: number; maxFps?: number } = {},
): LoopHandle {
  const stepMs = 1000 / (opts.stepHz ?? 60);
  let minFrameMs = 1000 / (opts.maxFps ?? 30);
  const state = createStepper();
  let last = performance.now();
  let running = true;
  let id = 0;

  const frame = (now: number) => {
    if (!running) return;
    const r = advance(state, now - last, stepMs, minFrameMs);
    last = now;
    for (let i = 0; i < r.steps; i++) update(stepMs / 1000);
    if (r.render) render(now);
    id = requestAnimationFrame(frame);
  };
  id = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(id);
    },
    setMaxFps(fps: number) {
      minFrameMs = 1000 / fps;
    },
  };
}
