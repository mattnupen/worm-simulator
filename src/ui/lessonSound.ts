import type { Cue } from '../content/lessons/lesson';

/**
 * Sound effects for the lesson's cues, made on the device with Web Audio (no sound files to load
 * or bundle). A thump is a low, short drum hit; a passing
 * shadow is a soft rush of air that moves from right to left; the robin's hops are light taps.
 * The timings match the animations in lesson.css. Sound only adds to a cue: its words are always
 * on screen, so a student with the sound off misses nothing.
 */
let ctx: AudioContext | null = null;
let current: GainNode | null = null;
let enabled = true;

/** Sound on or off, from Settings (main.ts). Off stops a cue's sound at once. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopCueSound();
}

/** Plays the cue's sounds from now. Quietly does nothing where Web Audio is missing or blocked. */
export function playCueSound(cue: Cue): void {
  stopCueSound();
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  const out = c.createGain();
  out.gain.value = 0.7;
  out.connect(c.destination);
  current = out;
  const t = c.currentTime + 0.05;
  switch (cue) {
    case 'thump':
      // Matches the rings: 0, 1 and 2 s.
      for (const at of [0, 1, 2]) thud(c, out, t + at, 62, 0.42, 1);
      break;
    case 'shadow':
      whoosh(c, out, t + 0.3, 4.4);
      break;
    case 'robin':
      whoosh(c, out, t + 0.1, 3.4);
      // Three hops, landing at the end of each 0.9 s hop after 3.6 s.
      for (const k of [1, 2, 3]) thud(c, out, t + 3.6 + 0.9 * k - 0.05, 150, 0.16, 0.45);
      break;
  }
}

export function stopCueSound(): void {
  if (!current) return;
  try { current.disconnect(); } catch { /* already gone */ }
  current = null;
}

function audio(): AudioContext | null {
  if (!ctx) {
    const Ctor = typeof AudioContext === 'undefined' ? null : AudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** A drum-like hit: a sine that drops in pitch, with a short burst of muffled noise. */
function thud(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, level: number): void {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);

  const n = noise(c, 0.12);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(level * 0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  n.connect(lp).connect(ng).connect(out);
  n.start(t);
}

/** Air rushing past: filtered noise that swells and fades, panning right to left. */
function whoosh(c: AudioContext, out: AudioNode, t: number, dur: number): void {
  const n = noise(c, dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(1100, t + dur * 0.5);
  bp.frequency.exponentialRampToValueAtTime(300, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = n.connect(bp).connect(g);
  if (typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(0.9, t);
    p.pan.linearRampToValueAtTime(-0.9, t + dur);
    node = node.connect(p);
  }
  node.connect(out);
  n.start(t);
}

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}
