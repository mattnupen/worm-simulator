/**
 * The opening's voices: a quick, pitched babble for each spoken caption, like the characters in
 * Animal Crossing (Matt, 2026-10-22: "character noises in place of talking for now"). Each letter of
 * the caption is one short blip, its vowel colour from the letter, so the babble rises and falls
 * with the words students are reading. Pure: src/ui/openingSound.ts plays the notes.
 */

/** One blip: when it starts (s from the scene's start), how long, its pitch and two vowel formants (Hz), and how loud (0..1). */
export interface BabbleNote { t: number; dur: number; pitch: number; f1: number; f2: number; peak: number }

/** A voice's middle pitch (Hz) and how many letters it says a second at most. */
export const VOICES = {
  kid: { pitch: 430, rate: 17 },
  teacher: { pitch: 255, rate: 15 },
} as const;

/** Formants (Hz) of the vowel each letter leans toward: a, e, i, o, u, and a neutral one. */
const VOWEL: Record<string, readonly [number, number]> = {
  a: [800, 1250], e: [450, 2100], i: [320, 2600], o: [520, 900], u: [370, 820], y: [330, 2400],
};
const NEUTRAL: readonly [number, number] = [550, 1600];

/**
 * The blips for `text`, said by `voice` between `from` and `to` (s): one per letter, a short gap at a
 * space, a longer one after a comma or full stop. It fits in the first 85% of the line (faster if it
 * must), rises at the end of a question and is a little louder for an exclamation.
 */
export function babbleNotes(text: string, from: number, to: number, voice: keyof typeof VOICES): BabbleNote[] {
  const v = VOICES[voice];
  const chars = [...text.toLowerCase()];
  // Time units: a letter is 1, a space 0.6, a pause after punctuation 2.
  const unit = (ch: string): number => (/[a-z]/.test(ch) ? 1 : ch === ' ' ? 0.6 : /[.,!?]/.test(ch) ? 2 : 0);
  const total = chars.reduce((n, ch) => n + unit(ch), 0);
  const step = Math.min(1 / v.rate, ((to - from) * 0.85) / Math.max(1, total));
  const question = text.trim().endsWith('?');
  const loud = text.includes('!') ? 1 : 0.8;
  const letters = chars.filter((ch) => /[a-z]/.test(ch)).length;
  const out: BabbleNote[] = [];
  let t = from;
  let n = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/[a-z]/.test(ch)) {
      // The next vowel this letter leads into colours it; the letter itself nudges the pitch.
      let vowel = NEUTRAL;
      for (let j = i; j < chars.length && /[a-z]/.test(chars[j]); j++) {
        if (VOWEL[chars[j]]) { vowel = VOWEL[chars[j]]; break; }
      }
      const wobble = (((ch.charCodeAt(0) * 37) % 7) - 3) / 3;
      const rise = question && n >= letters - 4 ? 1 + 0.09 * (n - (letters - 4) + 1) : 1;
      const fall = 1 - 0.08 * (n / Math.max(1, letters));
      out.push({ t, dur: step * 0.85, pitch: v.pitch * (1 + 0.12 * wobble) * rise * fall, f1: vowel[0], f2: vowel[1], peak: loud });
      n++;
    }
    t += unit(ch) * step;
  }
  return out;
}
