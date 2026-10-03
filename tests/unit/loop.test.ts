import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startLoop } from '../../src/core/loop';

/** A hand-cranked requestAnimationFrame: tick() runs the one queued callback. */
let queued: ((now: number) => void) | null = null;
let now = 0;
const tick = (): void => {
  const cb = queued;
  queued = null;
  now += 1000 / 60;
  cb?.(now);
};

beforeEach(() => {
  queued = null;
  now = 0;
  // The loop's clock starts at 0, the same as the fake frame times below.
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', (cb: (n: number) => void) => { queued = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => { queued = null; });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('startLoop', () => {
  it('keeps running while update and render behave', () => {
    const update = vi.fn();
    const render = vi.fn();
    startLoop(update, render, { maxFps: 60 });
    for (let i = 0; i < 5; i++) tick();
    expect(update).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
    expect(queued).not.toBeNull();
  });

  it('stops the chain, logs once and reports the error when update throws', () => {
    const boom = new Error('update broke');
    const update = vi.fn(() => { throw boom; });
    const render = vi.fn();
    const onError = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    startLoop(update, render, { maxFps: 60, onError });
    tick();
    expect(queued).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(boom);
    expect(onError).toHaveBeenCalledExactlyOnceWith(boom);
    log.mockRestore();
  });

  it('stops the chain the same way when render throws', () => {
    const boom = new Error('render broke');
    const onError = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    startLoop(() => {}, () => { throw boom; }, { maxFps: 60, onError });
    tick();
    expect(queued).toBeNull();
    expect(onError).toHaveBeenCalledExactlyOnceWith(boom);
    log.mockRestore();
  });

  it('does not run again after a crash even if a stale frame fires', () => {
    const update = vi.fn(() => { throw new Error('x'); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cb = (() => { startLoop(update, () => {}, { maxFps: 60 }); return queued!; })();
    cb(now + 17);
    cb(now + 34);
    expect(update).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('works without onError (the error is still logged)', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    startLoop(() => { throw new Error('y'); }, () => {}, { maxFps: 60 });
    expect(() => tick()).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
