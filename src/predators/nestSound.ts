import { mulberry32 } from '../core/random';
import { noise, playScheduled, thud } from '../ui/lessonSound';
import { FLAP_HZ } from './robinDemo';
import { NEST_TIMES } from './nestScript';

/**
 * The nest scene's sounds, made on the device with Web Audio like the opening's (no sound files):
 * the robin's wingbeats as it takes off, flies and lands, its feet on the rim, and the nestlings'
 * thin, high begging cheeps. Each is also a caption, so a student with the sound off misses nothing.
 * Settings' sound switch applies (playScheduled), and stopCueSound stops it (Skip, a hidden tab).
 */
export function playNestSound(): void {
  playScheduled((c, out, t) => {
    const T = NEST_TIMES;
    wings(c, out, t + T.takeoff, t + T.land);
    thud(c, out, t + T.land, 260, 0.08, 0.25);
    cheeps(c, out, t + T.beg + 0.15, t + T.leanOut[1]);
  });
}

/**
 * Wingbeats: soft rushes of air, one a beat, in bursts with short glides between (a robin's
 * flight), loud at take-off and landing.
 */
function wings(c: AudioContext, out: AudioNode, from: number, to: number): void {
  const n = noise(c, to - from + 0.4);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 750;
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, from);
  const beat = 1 / FLAP_HZ;
  let i = 0;
  for (let at = from; at < to; at += beat, i++) {
    // Six beats, then a glide of three (except near take-off and landing, which flap hard).
    const edge = at - from < 0.5 || to - at < 0.6;
    if (!edge && i % 9 >= 6) continue;
    const level = edge ? 0.5 : 0.28;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + beat * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + beat * 0.9);
  }
  n.connect(bp).connect(g).connect(out);
  n.start(from);
}

/** The nestlings' begging: short, high, thin cheeps from three voices, overlapping. */
function cheeps(c: AudioContext, out: AudioNode, from: number, to: number): void {
  const rng = mulberry32(7);
  for (let voice = 0; voice < 3; voice++) {
    const pitch = 3300 + voice * 450;
    for (let at = from + rng() * 0.2; at < to; at += 0.22 + rng() * 0.25) {
      // The fed one goes quiet once it has the worm.
      if (voice === 0 && at > from + (NEST_TIMES.fed - NEST_TIMES.beg - 0.15)) break;
      const fade = Math.min(1, (to - at) / 0.8);
      cheep(c, out, at, pitch * (0.95 + rng() * 0.1), 0.07 + rng() * 0.04, 0.12 * fade);
    }
  }
}

function cheep(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, level: number): void {
  if (level <= 0.001) return;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f * 0.85, t);
  osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + dur * 0.4);
  osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
