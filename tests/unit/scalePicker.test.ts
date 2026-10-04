import { describe, it, expect } from 'vitest';
import { ScalePicker, SCALE_SETTLE_MS, type ScaleStatus, type Timers } from '../../src/game/scalePicker';
import { SETTINGS_KEY, type KeyValueStore } from '../../src/save/settingsStore';
import type { ScaleMode } from '../../src/surface/worldScale';

function memory(initial?: object): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = initial ? { [SETTINGS_KEY]: JSON.stringify(initial) } : {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
const saved = (s: { data: Record<string, string> }) => (SETTINGS_KEY in s.data ? JSON.parse(s.data[SETTINGS_KEY]) : null);

/** A hand-wound clock: tick(ms) fires whatever is due. */
function fakeTimers(): Timers & { tick(ms: number): void; pending(): number } {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) { const id = next++; due.set(id, { at: now + ms, fn }); return id; },
    clear(h) { due.delete(h as number); },
    tick(ms) {
      now += ms;
      for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && due.delete(id)) t.fn();
      }
    },
    pending: () => due.size,
  };
}

function setup(start: ScaleMode = 'classic', store = memory(), opts: { failOn?: ScaleMode } = {}) {
  let mode = start;
  const builds: ScaleMode[] = [];
  const shown: string[] = [];
  const failures: unknown[] = [];
  const timers = fakeTimers();
  const picker = new ScalePicker({
    current: () => mode,
    build: (m) => {
      if (m === opts.failOn) throw new Error('test: rebuild failed');
      builds.push(m);
      mode = m;
    },
    show: (s: ScaleStatus, m) => { shown.push(`${s}:${m}`); },
    failed: (e) => { failures.push(e); },
  }, store, timers);
  picker.open();
  return { picker, builds, shown, failures, timers, store, mode: () => mode };
}

describe('ScalePicker', () => {
  it('builds a pick once the picking settles, and says so', () => {
    const t = setup();
    t.picker.choose('hybrid');
    expect(t.shown).toEqual(['building:hybrid']);
    expect(t.picker.status).toBe('building');
    expect(t.picker.shown).toBe('hybrid');
    t.timers.tick(SCALE_SETTLE_MS - 1);
    expect(t.builds).toEqual([]);
    t.timers.tick(1);
    expect(t.builds).toEqual(['hybrid']);
    expect(t.shown).toEqual(['building:hybrid', 'ready:hybrid']);
    expect(t.picker.status).toBe('ready');
    expect(t.picker.waiting).toBe(false);
  });

  it('arrowing through several choices builds only the last, once', () => {
    const t = setup();
    t.picker.choose('hybrid');
    t.timers.tick(100);
    t.picker.choose('true');
    t.timers.tick(SCALE_SETTLE_MS - 1);
    expect(t.builds).toEqual([]);
    t.timers.tick(1);
    expect(t.builds).toEqual(['true']);
    // "Building" is said once, not once per arrow.
    expect(t.shown).toEqual(['building:hybrid', 'ready:true']);
  });

  it('away and back before it settles builds nothing', () => {
    const t = setup();
    t.picker.choose('hybrid');
    t.timers.tick(100);
    t.picker.choose('classic');
    t.timers.tick(SCALE_SETTLE_MS);
    expect(t.builds).toEqual([]);
    expect(t.shown[t.shown.length - 1]).toBe('ready:classic');
  });

  it('leaving the screen builds a waiting pick at once (flush), and the timer then does nothing', () => {
    const t = setup();
    t.picker.choose('true');
    expect(t.picker.flush()).toBe(true);
    expect(t.builds).toEqual(['true']);
    expect(t.timers.pending()).toBe(0);
    t.timers.tick(SCALE_SETTLE_MS);
    expect(t.builds).toEqual(['true']);
    expect(t.picker.flush()).toBe(true); // nothing waiting
    expect(t.builds).toEqual(['true']);
  });

  it('a real change is saved', () => {
    const t = setup();
    t.picker.choose('true');
    expect(saved(t.store)).toBeNull(); // not on the arrow, only once it settles
    t.timers.tick(SCALE_SETTLE_MS);
    expect(saved(t.store)).toEqual({ version: 1, graphics: 'auto', autoSettled: null, scale: 'true' });
  });

  it('leaving on the mode in effect when the screen opened stores no scale (the default can still change)', () => {
    const t = setup('classic', memory({ version: 1, graphics: 'low', autoSettled: null }));
    t.picker.choose('hybrid');
    t.timers.tick(100);
    t.picker.choose('classic');
    t.picker.flush();
    expect(saved(t.store)).toEqual({ version: 1, graphics: 'low', autoSettled: null });
    // Nor does opening and closing the screen.
    const u = setup('classic');
    u.picker.flush();
    expect(saved(u.store)).toBeNull();
  });

  it('once a scale is stored, coming back to the opening mode is saved too', () => {
    const t = setup('classic', memory({ version: 1, graphics: 'auto', autoSettled: null, scale: 'classic' }));
    t.picker.choose('true');
    t.timers.tick(SCALE_SETTLE_MS);
    expect(saved(t.store).scale).toBe('true');
    t.picker.choose('classic');
    t.timers.tick(SCALE_SETTLE_MS);
    expect(t.builds).toEqual(['true', 'classic']);
    expect(saved(t.store).scale).toBe('classic');
  });

  it('compares with the mode in effect at each opening of the screen', () => {
    const t = setup();
    t.picker.choose('true');
    t.picker.flush();
    t.picker.open(); // later visit: True is in effect (and stored)
    expect(t.picker.status).toBe('idle');
    expect(t.picker.shown).toBe('true');
  });

  it('a build that throws is reported once, saves nothing, and stops the picker', () => {
    const t = setup('classic', memory(), { failOn: 'true' });
    t.picker.choose('true');
    t.timers.tick(SCALE_SETTLE_MS);
    expect(t.failures).toHaveLength(1);
    expect(saved(t.store)).toBeNull();
    expect(t.shown).toEqual(['building:true']);
    // Stopped: later picks and flushes do nothing.
    t.picker.choose('hybrid');
    expect(t.timers.pending()).toBe(0);
    expect(t.picker.flush()).toBe(false);
    expect(t.builds).toEqual([]);
  });

  it('a build that throws on leaving reports it and flush says so', () => {
    const t = setup('classic', memory(), { failOn: 'hybrid' });
    t.picker.choose('hybrid');
    expect(t.picker.flush()).toBe(false);
    expect(t.failures).toHaveLength(1);
    t.timers.tick(SCALE_SETTLE_MS);
    expect(t.failures).toHaveLength(1);
  });

  it('stop() drops a waiting pick (the game was lost)', () => {
    const t = setup();
    t.picker.choose('true');
    t.picker.stop();
    t.timers.tick(SCALE_SETTLE_MS);
    expect(t.builds).toEqual([]);
    expect(saved(t.store)).toBeNull();
  });
});
