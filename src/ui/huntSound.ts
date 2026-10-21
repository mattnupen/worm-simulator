import { noise, playScheduled, thud } from './lessonSound';

/**
 * The robin hunt's sounds (V4 spec 1 and 2), made on the device with Web Audio like the lesson's
 * cues, on the same output and Settings switch (lessonSound.ts). Sound only adds to the warning:
 * its words and icon are always on screen.
 * - arrive: wingbeats as it flies in and lands, then its call;
 * - tug: a hard pull on the worm;
 * - escape: the worm sliding back down into the soil;
 * - leave: wingbeats as it flies off.
 */
export type HuntSound = 'arrive' | 'tug' | 'escape' | 'leave';

/** Wingbeats a second (robinDemo.ts FLAP_HZ: a Game choice). */
const BEATS = 9;

export function playHuntSound(kind: HuntSound): void {
  playScheduled((c, out, t) => {
    switch (kind) {
      case 'arrive':
        wings(c, out, t, 1.2, true);
        thud(c, out, t + 1.2, 180, 0.12, 0.35);
        // The robin's sharp call: a few quick "tuk" notes.
        for (const at of [1.6, 1.85, 2.1]) chirp(c, out, t + at, 2600, 1900, 0.07, 0.25);
        break;
      case 'tug':
        scrape(c, out, t, 0.35, 0.45);
        break;
      case 'escape':
        scrape(c, out, t, 0.6, 0.3);
        thud(c, out, t + 0.5, 70, 0.3, 0.5);
        break;
      case 'leave':
        wings(c, out, t, 1.3, false);
        break;
    }
  });
}

/** Wingbeats: short bursts of soft noise, getting louder (landing) or quieter (flying off). */
function wings(c: AudioContext, out: AudioNode, t: number, dur: number, coming: boolean): void {
  const n = Math.round(dur * BEATS);
  for (let i = 0; i < n; i++) {
    const at = t + i / BEATS;
    const k = coming ? (i + 1) / n : 1 - i / n;
    const src = noise(c, 0.08);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05 + 0.4 * k, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    src.connect(bp).connect(g).connect(out);
    src.start(at);
  }
}

/** A short bird note sliding from `from` to `to` Hz. */
function chirp(c: AudioContext, out: AudioNode, t: number, from: number, to: number, dur: number, level: number): void {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Soil scraping: low, rough noise that swells and fades. */
function scrape(c: AudioContext, out: AudioNode, t: number, dur: number, level: number): void {
  const src = noise(c, dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(250, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp).connect(g).connect(out);
  src.start(t);
}
