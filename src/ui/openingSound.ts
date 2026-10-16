import { noise, playScheduled, thud } from './lessonSound';
import { BOX, BUS, KIDS, LID_ON, TUB } from '../opening/script';

/**
 * The opening scene's sounds, made on the device with Web Audio like the lesson's (no sound files):
 * the bus's engine rolling in from the left and its brakes, the door, boots and sneakers on the
 * leaves, the box and the tub landing, and the lid's click. Every one is also a caption or something
 * on screen, so a student with the sound off misses nothing. Settings' sound switch applies.
 */
export function playOpeningSound(): void {
  playScheduled((c, out, t) => {
    engine(c, out, t, BUS.stopAt + 0.6);
    hiss(c, out, t + BUS.stopAt - 0.1, 0.8);
    thud(c, out, t + BUS.doorOpen[0] + 0.05, 110, 0.18, 0.25);
    // The teacher's boots: two on the metal step, then on the leaves.
    for (const at of [2.3, 2.6]) thud(c, out, t + at, 240, 0.09, 0.22);
    for (const at of [2.95, 3.3, 3.65]) crunch(c, out, t + at, 0.28, -0.1);
    thud(c, out, t + BOX.dropped - 0.05, 90, 0.2, 0.4);
    // The tub hits the ground, bounces, and its lid rattles to a stop.
    const land = TUB[5][0];
    thud(c, out, t + land, 130, 0.22, 0.55);
    for (const at of [0.2, 0.33, 0.43]) thud(c, out, t + land + at, 520, 0.05, 0.12);
    // Sneakers running off to the right.
    for (const k of KIDS) for (let s = 0; s < 6; s++) crunch(c, out, t + k.at + 0.1 + s * 0.19, 0.2, 0.2 + s * 0.12);
    // Boots over to the tub, the lid's click, boots back to the bus.
    for (const at of [9.0, 9.3, 9.6]) crunch(c, out, t + at, 0.26, -0.2);
    click(c, out, t + LID_ON);
    for (const at of [12.0, 12.3, 12.95, 13.3, 13.65]) crunch(c, out, t + at, 0.24, 0.1);
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

/** A footstep in dry leaves: a short burst of crackly noise, placed left (-1) to right (1). */
function crunch(c: AudioContext, out: AudioNode, t: number, level: number, pan: number): void {
  const n = noise(c, 0.09);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  let node: AudioNode = n.connect(bp).connect(g);
  if (typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node = node.connect(p);
  }
  node.connect(out);
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
