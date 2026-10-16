import { noise, playScheduled, thud } from './lessonSound';
import { BOX, BUS, LID_ON, TUB } from '../opening/script';

/**
 * The opening scene's sounds, made on the device with Web Audio like the lesson's (no sound files):
 * the bus's engine rolling in from the left and its brakes, the door, the box and the tub landing,
 * and the lid's click. No footsteps (Matt, 2026-10-16). Every one is also a caption or something
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
  });
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
