import { noise, playScheduled, thud } from './lessonSound';
import { BOX, BUS, CAPTIONS, LID_ON, TUB } from '../opening/script';
import { babbleNotes, type BabbleNote } from '../opening/babble';
import { TEXT, shown } from '../content/text';

/**
 * The opening scene's sounds, made on the device with Web Audio like the lesson's (no sound files):
 * the bus's engine rolling in from the left and its brakes, the door, the box and the tub landing,
 * the lid's click, and a babble for each spoken line (babble.ts). No footsteps (Matt, 2026-10-16). Every one is also a caption or something
 * on screen, so a student with the sound off misses nothing. Settings' sound switch applies.
 */
export function playOpeningSound(): void {
  playScheduled((c, out, t) => {
    engine(c, out, t, BUS.stopAt + 0.6);
    hiss(c, out, t + BUS.stopAt - 0.1, 0.8);
    thud(c, out, t + BUS.doorOpen[0] + 0.05, 110, 0.18, 0.25);
    thud(c, out, t + BOX.dropped - 0.05, 90, 0.2, 0.4);
    // The tub hits the ground, bounces, and its lid rattles to a stop.
    const land = TUB[5][0];
    thud(c, out, t + land, 130, 0.22, 0.55);
    for (const at of [0.2, 0.33, 0.43]) thud(c, out, t + land + at, 520, 0.05, 0.12);
    // The lid's click.
    click(c, out, t + LID_ON);
    thud(c, out, t + BUS.doorClose[1], 110, 0.18, 0.22);
    for (const line of CAPTIONS) {
      if (line.who) voice(c, out, t, babbleNotes(shown(TEXT[line.line]), line.from, line.to, line.who));
    }
  });
}

/**
 * One spoken line's babble: a single buzzy voice (one oscillator through two vowel filters) whose
 * pitch, vowel and loudness jump letter by letter, so a whole line costs a handful of audio nodes.
 */
function voice(c: AudioContext, out: AudioNode, t0: number, notes: readonly BabbleNote[]): void {
  if (!notes.length) return;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  const mix = c.createGain();
  // The narrow vowel filters keep only a little of the buzz: brought back up to speaking level.
  mix.gain.value = 1.3;
  const formants = [c.createBiquadFilter(), c.createBiquadFilter()];
  for (const f of formants) {
    f.type = 'bandpass';
    f.Q.value = 6;
    osc.connect(f).connect(mix);
  }
  mix.connect(env).connect(out);
  for (const n of notes) {
    const at = t0 + n.t;
    osc.frequency.setValueAtTime(n.pitch, at);
    // A little scoop up into each blip, like a syllable.
    osc.frequency.linearRampToValueAtTime(n.pitch * 1.06, at + n.dur * 0.5);
    formants[0].frequency.setValueAtTime(n.f1, at);
    formants[1].frequency.setValueAtTime(n.f2, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(0.55 * n.peak, at + Math.min(0.012, n.dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, at + n.dur);
  }
  const last = notes[notes.length - 1];
  osc.start(t0 + notes[0].t);
  osc.stop(t0 + last.t + last.dur + 0.05);
}

/** A diesel idle: a low buzz under rumbling noise, panning in from the left and dying away. */
function engine(c: AudioContext, out: AudioNode, t: number, dur: number): void {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(52, t);
  osc.frequency.linearRampToValueAtTime(38, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  osc.connect(lp).connect(g);
  const n = noise(c, dur + 0.7);
  const nlp = c.createBiquadFilter();
  nlp.type = 'lowpass';
  nlp.frequency.value = 160;
  const ng = c.createGain();
  ng.gain.value = 0.6;
  n.connect(nlp).connect(ng).connect(g);
  let node: AudioNode = g;
  if (typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(-0.9, t);
    p.pan.linearRampToValueAtTime(0.4, t + dur);
    node = g.connect(p);
  }
  node.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.7);
  n.start(t);
}

/** Air brakes: a bright hiss that fades. */
function hiss(c: AudioContext, out: AudioNode, t: number, dur: number): void {
  const n = noise(c, dur);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2600;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(hp).connect(g).connect(out);
  n.start(t);
}

/** The lid snapping on: a short, hard click. */
function click(c: AudioContext, out: AudioNode, t: number): void {
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 1700;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.06);
}
