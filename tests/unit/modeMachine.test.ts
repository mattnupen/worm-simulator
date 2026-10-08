import { describe, it, expect } from 'vitest';
import {
  createModeMachine, createModeState, moveDuration, bodyProgress, cameraProgress, dipDarkness, promptKind,
  DEFAULT_UNDERGROUND_VIEW, SINK_S, SWING_S, FADE_S, DIP_IN, DIP_OUT, RISE_S, OUT_S,
  type ModeEvent, type ModeMachine,
} from '../../src/underground/modeMachine';

const DT = 1 / 60;

/** Press and release once on a settled machine (two steps), returning the press step's event. */
function tap(m: ModeMachine, canDig = true, nearTop = false): ModeEvent {
  const e = m.step(true, canDig, nearTop, false, DT);
  m.step(false, canDig, nearTop, false, DT);
  return e;
}

/** Step with the given held level until the mode changes; returns the events seen and the steps taken. */
function runMove(m: ModeMachine, held: boolean, canDig = true, nearTop = false) {
  const events: ModeEvent[] = [];
  let n = 0;
  const from = m.state.mode;
  while (m.state.mode === from && n < 1000) {
    const e = m.step(held, canDig, nearTop, false, DT);
    if (e !== 'none') events.push(e);
    n++;
  }
  return { events, n };
}

/** A machine settled underground (dug down, press released). */
function undergroundMachine(): ModeMachine {
  const m = createModeMachine();
  tap(m);
  runMove(m, false);
  return m;
}

describe('the surface / underground state machine (spec 4, 10)', () => {
  it('starts on the surface and the default view is Wide', () => {
    const m = createModeMachine();
    expect(m.state.mode).toBe('surface');
    expect(DEFAULT_UNDERGROUND_VIEW).toBe('wide');
  });

  it('digs down on one Action press where allowed, and nowhere else', () => {
    const m = createModeMachine();
    expect(tap(m, false)).toBe('none');
    expect(m.state.mode).toBe('surface');
    expect(m.step(false, true, false, false, DT)).toBe('none');
    expect(m.step(true, true, false, false, DT)).toBe('startDig');
    expect(m.state.mode).toBe('diggingDown');
  });

  it('sinks for about 1 s, swings the camera for about 1.5 s, then is underground', () => {
    const m = createModeMachine();
    m.step(true, true, false, false, DT);
    const s = m.state;
    expect(moveDuration(s)).toBeCloseTo(SINK_S + SWING_S, 9);
    let lastCam = 0;
    let lastBody = 0;
    let arrive = 0;
    let n = 0;
    while (s.mode === 'diggingDown' && n++ < 1000) {
      // a fresh press every other step: presses are ignored mid-move
      const e = m.step(n % 2 === 0, true, true, false, DT);
      if (e === 'arrive') arrive++;
      else expect(e).toBe('none');
      expect(cameraProgress(s)).toBeGreaterThanOrEqual(lastCam);
      expect(bodyProgress(s)).toBeGreaterThanOrEqual(lastBody);
      if (s.mode === 'diggingDown' && s.t < SINK_S) expect(cameraProgress(s)).toBe(0);
      lastCam = cameraProgress(s);
      lastBody = bodyProgress(s);
    }
    expect(arrive).toBe(1);
    expect(s.mode).toBe('underground');
    expect(cameraProgress(s)).toBe(1);
    expect(bodyProgress(s)).toBe(1);
    expect(Math.abs(n * DT - (SINK_S + SWING_S))).toBeLessThan(2 * DT);
  });

  it('underground: Action near the top comes up, deeper it switches the view', () => {
    const m = undergroundMachine();
    expect(tap(m, false, false)).toBe('switchView');
    expect(m.state.mode).toBe('underground');
    expect(m.step(false, false, true, false, DT)).toBe('none');
    expect(m.step(true, false, true, false, DT)).toBe('startUp');
    const s = m.state;
    expect(s.mode).toBe('comingUp');
    expect(moveDuration(s)).toBeCloseTo(RISE_S + Math.max(OUT_S, SWING_S), 9);
    expect(cameraProgress(s)).toBe(1);
    expect(bodyProgress(s)).toBe(0);
    const { events } = runMove(m, true, false, true);
    expect(events).toEqual(['emerge']);
    expect(s.mode).toBe('surface');
    expect(cameraProgress(s)).toBe(0);
    expect(bodyProgress(s)).toBe(0);
  });

  it('the camera swings back after the rise, and the body is out when the move ends', () => {
    const m = undergroundMachine();
    m.step(true, false, true, false, DT);
    const s = m.state;
    let lastCam = 1;
    let lastBody = 0;
    while (s.mode === 'comingUp') {
      m.step(false, false, true, false, DT);
      if (s.mode !== 'comingUp') break;
      expect(cameraProgress(s)).toBeLessThanOrEqual(lastCam);
      expect(bodyProgress(s)).toBeGreaterThanOrEqual(lastBody);
      if (s.t < RISE_S) expect(cameraProgress(s)).toBe(1);
      lastCam = cameraProgress(s);
      lastBody = bodyProgress(s);
    }
    expect(lastBody).toBeGreaterThan(0.95);
    expect(lastCam).toBeLessThan(0.05);
  });

  it('reduced motion uses the short dip, read when the move starts', () => {
    const m = createModeMachine();
    m.step(true, true, false, true, DT);
    expect(m.state.reduced).toBe(true);
    expect(moveDuration(m.state)).toBeCloseTo(FADE_S, 9);
    // the setting changing mid-move does not change the move that started
    m.step(false, true, false, false, DT);
    expect(m.state.reduced).toBe(true);
    expect(moveDuration(m.state)).toBeCloseTo(FADE_S, 9);
    runMove(m, false);
    expect(m.state.mode).toBe('underground');
    expect(m.state.reduced).toBe(true);
    // coming up reads it afresh
    m.step(true, false, true, false, DT);
    expect(m.state.reduced).toBe(false);
    expect(moveDuration(m.state)).toBeCloseTo(RISE_S + Math.max(OUT_S, SWING_S), 9);
    runMove(m, false, false, true);
    m.step(false, true, false, true, DT);
    m.step(true, true, false, true, DT);
    expect(m.state.reduced).toBe(true);
    runMove(m, false);
    m.step(true, false, true, true, DT);
    expect(moveDuration(m.state)).toBeCloseTo(FADE_S, 9);
  });

  it('reduced motion, both ways: dark over DIP_IN, the worm and the camera cut to the end there, clear over DIP_OUT (spec 4.1)', () => {
    // About 0.7 s each way, however long the worm's own move would take.
    expect(FADE_S).toBeCloseTo(0.7, 9);
    expect(DIP_IN).toBeCloseTo(0.3, 9);
    expect(DIP_OUT).toBeCloseTo(0.35, 9);
    for (const down of [true, false]) {
      const m = down ? createModeMachine() : undergroundMachine();
      m.step(true, down, !down, true, DT);
      m.setMoveTime(4.5);
      const s = m.state;
      expect(moveDuration(s)).toBeCloseTo(FADE_S, 9);
      const atStart = down ? 0 : 1;
      let cuts = 0;
      let lastDark = 0;
      let n = 0;
      let cam = cameraProgress(s);
      while (s.mode === (down ? 'diggingDown' : 'comingUp') && n++ < 1000) {
        const dark = dipDarkness(s);
        const c = cameraProgress(s);
        if (c !== cam) {
          // One cut, at DIP_IN, fully dark; the worm's move ends there too.
          cuts++;
          expect(dark).toBe(1);
          expect(s.t).toBeGreaterThanOrEqual(DIP_IN);
          expect(s.t).toBeLessThan(DIP_IN + DT + 1e-9);
          expect(bodyProgress(s)).toBe(1);
          cam = c;
        }
        if (s.t < DIP_IN) {
          // Going dark, the worm just starting its move (at its own pace), the camera still.
          expect(dark).toBeGreaterThanOrEqual(lastDark);
          expect(c).toBe(atStart);
          expect(bodyProgress(s)).toBeCloseTo(s.t / 4.5, 9);
        } else if (s.t <= FADE_S - DIP_OUT) expect(dark).toBe(1);
        else expect(dark).toBeLessThan(lastDark);
        lastDark = dark;
        m.step(false, true, false, true, DT);
      }
      expect(cuts).toBe(1);
      expect(Math.abs(n * DT - FADE_S)).toBeLessThan(2 * DT);
      expect(s.mode).toBe(down ? 'underground' : 'surface');
      expect(dipDarkness(s)).toBe(0);
      expect(cameraProgress(s)).toBe(1 - atStart);
    }
  });

  it('pins the spec timings (4.1, 4.2) in seconds', () => {
    // Digging down 2.5 s: the camera holds for the first 1.0 s while the worm's move runs through all of it.
    const m = createModeMachine();
    m.step(true, true, false, false, DT);
    expect(moveDuration(m.state)).toBeCloseTo(2.5, 9);
    m.state.t = 0.999;
    expect(cameraProgress(m.state)).toBe(0);
    expect(bodyProgress(m.state)).toBeCloseTo(0.999 / 2.5, 9);
    m.state.t = 2.5;
    expect(cameraProgress(m.state)).toBe(1);
    expect(bodyProgress(m.state)).toBe(1);
    m.state.t = 0;
    runMove(m, false);
    // Coming up 2.5 s: the camera holds through the 1.0 s rise, then swings back with the crawl out.
    m.step(true, false, true, false, DT);
    expect(moveDuration(m.state)).toBeCloseTo(2.5, 9);
    m.state.t = 1.0;
    expect(cameraProgress(m.state)).toBe(1);
    m.state.t = 2.5;
    expect(cameraProgress(m.state)).toBeCloseTo(0, 9);
    m.state.t = 2.1;
    expect(bodyProgress(m.state)).toBe(1);
  });

  it('coming up takes the length the game sets; the swing ends with the worm\'s move', () => {
    const m = undergroundMachine();
    m.setMoveTime(9); // not coming up: ignored
    m.step(true, false, true, false, DT);
    expect(m.state.moveS).toBe(RISE_S + OUT_S);
    m.setMoveTime(NaN);
    m.setMoveTime(1.5); // never shorter than the rise and the crawl out
    expect(m.state.moveS).toBe(RISE_S + OUT_S);
    m.setMoveTime(4.6);
    const s = m.state;
    expect(moveDuration(s)).toBeCloseTo(4.6, 9);
    s.t = 3.1;
    expect(cameraProgress(s)).toBeCloseTo(1, 9);
    s.t = 3;
    expect(cameraProgress(s)).toBe(1);
    s.t = 2.3;
    expect(bodyProgress(s)).toBeCloseTo(0.5, 9);
    s.t = 3.1 + SWING_S;
    expect(cameraProgress(s)).toBeCloseTo(0, 9);
    s.t = 0;
    const { n } = runMove(m, false, false, true);
    expect(Math.abs(n * DT - 4.6)).toBeLessThan(2 * DT);
    // The next coming up starts from the default again.
    tap(m);
    runMove(m, false);
    m.step(true, false, true, false, DT);
    expect(moveDuration(s)).toBeCloseTo(RISE_S + SWING_S, 9);
  });

  it('digging down takes the length the game sets for a big turn; the swing ends with it', () => {
    const m = createModeMachine();
    m.setMoveTime(9); // settled: ignored
    m.step(true, true, false, false, DT);
    const s = m.state;
    m.setMoveTime(1.2); // never shorter than the hold and the camera's move
    expect(s.moveS).toBe(SINK_S + SWING_S);
    m.setMoveTime(4);
    expect(moveDuration(s)).toBe(4);
    s.t = 2;
    expect(bodyProgress(s)).toBeCloseTo(0.5, 9);
    s.t = 4 - SWING_S;
    expect(cameraProgress(s)).toBe(0);
    s.t = 4;
    expect(cameraProgress(s)).toBe(1);
    s.t = 0;
    const { n } = runMove(m, false);
    expect(Math.abs(n * DT - 4)).toBeLessThan(2 * DT);
  });

  describe('edge cases', () => {
    it('a held press does not fire again through the move or after it', () => {
      const m = createModeMachine();
      // Space held from the dig press right through the sink, swing and 2 s underground
      expect(m.step(true, true, false, false, DT)).toBe('startDig');
      const { events } = runMove(m, true);
      expect(events).toEqual(['arrive']);
      for (let k = 0; k < 120; k++) expect(m.step(true, true, true, false, DT)).toBe('none');
      expect(m.state.mode).toBe('underground');
      // only a new press acts
      m.step(false, false, true, false, DT);
      expect(m.step(true, false, true, false, DT)).toBe('startUp');
    });

    it('a press held while the spot turns diggable is spent: only a new press digs', () => {
      const m = createModeMachine();
      // blocked spot: the press is spent even though nothing happens; walking onto a legal spot
      // while still holding does not dig
      expect(m.step(true, false, false, false, DT)).toBe('none');
      expect(m.step(true, true, false, false, DT)).toBe('none');
      expect(m.step(true, true, false, false, DT)).toBe('none');
      expect(m.state.mode).toBe('surface');
      m.step(false, true, false, false, DT);
      expect(m.step(true, true, false, false, DT)).toBe('startDig');
    });

    it('a press on the exact step a move ends is dropped, and a hold through it does not fire', () => {
      const m = createModeMachine();
      const Q = 0.25;
      m.step(true, true, false, false, Q); // dig, then release
      // a step of 0.25 s is exact in binary, so the move (2.5 s) ends on exactly the 10th step
      // after the dig press: release until then, and press fresh on that step
      for (let k = 0; k < 9; k++) m.step(false, true, true, false, Q);
      expect(m.state.mode).toBe('diggingDown');
      const ended = m.step(true, true, true, false, Q);
      expect(ended).toBe('arrive');
      expect(m.state.mode).toBe('underground');
      // still held on the next steps: nothing (no switchView, no startUp)
      for (let j = 0; j < 30; j++) expect(m.step(true, true, true, false, Q)).toBe('none');
      expect(m.state.mode).toBe('underground');
      // let go and press again: now it acts
      m.step(false, true, true, false, Q);
      expect(m.step(true, true, true, false, Q)).toBe('startUp');
    });

    it('a press the very next step after the move ends acts', () => {
      const m = createModeMachine();
      m.step(true, true, false, false, DT);
      const { events } = runMove(m, false);
      expect(events).toEqual(['arrive']);
      expect(m.step(true, true, false, false, DT)).toBe('switchView');
    });

    it('coming up ends on the surface and a press right after digs again where allowed', () => {
      const m = undergroundMachine();
      m.step(true, false, true, false, DT);
      runMove(m, false, false, true);
      expect(m.state.mode).toBe('surface');
      expect(m.step(true, true, false, false, DT)).toBe('startDig');
    });

    it('pause in the middle of a move: the clock stands still and resumes', () => {
      const m = createModeMachine();
      m.step(true, true, false, false, DT);
      for (let k = 0; k < 40; k++) m.step(false, true, false, false, DT);
      const t = m.state.t;
      const cam = cameraProgress(m.state);
      for (let k = 0; k < 300; k++) m.hold(false);
      expect(m.state.t).toBe(t);
      expect(m.state.mode).toBe('diggingDown');
      expect(cameraProgress(m.state)).toBe(cam);
      for (let k = 0; k < 40; k++) m.step(false, true, false, false, 0); // a zero-length step too
      expect(m.state.t).toBe(t);
      const { events, n } = runMove(m, false);
      expect(events).toEqual(['arrive']);
      // the whole move still took its full length of stepped time: the pause added none
      expect(Math.abs((40 + n) * DT - (SINK_S + SWING_S))).toBeLessThan(2 * DT);
    });

    it('a press made while paused and held on is not a new press on resuming', () => {
      const m = createModeMachine();
      m.hold(true); // Space goes down on the pause screen...
      expect(m.step(true, true, false, false, DT)).toBe('none'); // ...and is still down on resuming
      expect(m.state.mode).toBe('surface');
      m.step(false, true, false, false, DT);
      expect(m.step(true, true, false, false, DT)).toBe('startDig');
    });

    it('a press held when the game pauses and let go meanwhile does not fire on resuming', () => {
      const m = undergroundMachine();
      m.step(true, false, false, false, DT); // switchView, held
      m.hold(false); // released during the pause
      expect(m.step(false, false, false, false, DT)).toBe('none');
    });

    it('ignores a bad dt', () => {
      const m = createModeMachine();
      m.step(true, true, false, false, DT);
      for (const bad of [-1, NaN, 0]) {
        m.step(false, true, false, false, bad);
        expect(m.state.t).toBe(0);
        expect(Number.isFinite(m.state.t)).toBe(true);
      }
    });

    it('the view toggles while underground, any number of times, and never leaves underground', () => {
      const m = undergroundMachine();
      const seen: string[] = [];
      let view: 'wide' | 'close' = 'wide';
      for (let k = 0; k < 6; k++) {
        expect(promptKind(m.state, false, false, view)).toBe(view === 'wide' ? 'viewClose' : 'viewWide');
        const e = tap(m, false, false);
        seen.push(e);
        if (e === 'switchView') view = view === 'wide' ? 'close' : 'wide';
        expect(m.state.mode).toBe('underground');
        expect(m.state.t).toBe(0);
      }
      expect(seen).toEqual(Array(6).fill('switchView'));
      expect(view).toBe('wide');
    });

    it('rising to nearTop mid-press changes what the press does only on the next press', () => {
      const m = undergroundMachine();
      // the press goes down deep (switchView), the head drifts to the top while it is held
      expect(m.step(true, false, false, false, DT)).toBe('switchView');
      expect(m.step(true, false, true, false, DT)).toBe('none');
      expect(m.state.mode).toBe('underground');
    });

    it('does nothing during a move when canDig or nearTop change', () => {
      const m = createModeMachine();
      m.step(true, true, false, false, DT);
      for (let k = 0; k < 20; k++) {
        m.step(false, false, true, false, DT);
        m.step(true, true, false, false, DT);
        m.step(false, true, true, false, DT);
      }
      expect(m.state.mode).toBe('diggingDown');
    });
  });

  it('the prompt shows what Action will do now', () => {
    const s = createModeState();
    expect(promptKind(s, true, false, 'wide')).toBe('digDown');
    expect(promptKind(s, false, false, 'wide')).toBeNull();
    expect(promptKind(s, false, true, 'wide')).toBeNull();
    s.mode = 'diggingDown';
    expect(promptKind(s, true, true, 'wide')).toBeNull();
    s.mode = 'underground';
    expect(promptKind(s, false, true, 'wide')).toBe('comeUp');
    expect(promptKind(s, false, true, 'close')).toBe('comeUp');
    expect(promptKind(s, true, false, 'wide')).toBe('viewClose');
    expect(promptKind(s, false, false, 'close')).toBe('viewWide');
    s.mode = 'comingUp';
    expect(promptKind(s, false, true, 'close')).toBeNull();
  });

  it('the prompt always matches what a press does (every mode, every flag)', () => {
    for (const canDig of [false, true]) {
      for (const nearTop of [false, true]) {
        for (const view of ['wide', 'close'] as const) {
          for (const where of ['surface', 'underground'] as const) {
            const m = where === 'surface' ? createModeMachine() : undergroundMachine();
            const kind = promptKind(m.state, canDig, nearTop, view);
            const ev = m.step(true, canDig, nearTop, false, DT);
            const expected = { digDown: 'startDig', comeUp: 'startUp', viewWide: 'switchView', viewClose: 'switchView' } as const;
            expect(ev).toBe(kind === null ? 'none' : expected[kind]);
          }
        }
      }
    }
  });

  it('reset brings it back to the surface, settled, and a press held through it does not fire', () => {
    const m = createModeMachine();
    m.step(true, true, false, false, DT);
    m.step(true, true, false, false, DT);
    expect(m.state.mode).toBe('diggingDown');
    m.reset();
    expect(m.state.mode).toBe('surface');
    expect(m.state.t).toBe(0);
    expect(bodyProgress(m.state)).toBe(0);
    expect(m.step(true, true, false, false, DT)).toBe('none');
    m.step(false, true, false, false, DT);
    expect(m.step(true, true, false, false, DT)).toBe('startDig');
    expect(moveDuration(m.state)).toBeCloseTo(SINK_S + SWING_S, 9);
  });
});
