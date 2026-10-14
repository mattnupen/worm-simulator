import { randomInt, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Student logins made by the teacher (Matt, 2026-10-14): no Google sign-in, no emails. The teacher
 * makes a batch of usernames like "bluehawk32" with simple passwords, downloads them as a CSV, and
 * hands them out. Only the teacher's CSV links a username to a student; the board never stores
 * real names. Passwords are kept only as scrypt hashes, so a lost one is reset, not looked up.
 */
const COLORS = ['blue', 'red', 'green', 'gold', 'silver', 'orange', 'purple', 'teal', 'amber', 'coral', 'jade', 'ruby', 'sky', 'lime', 'rusty', 'misty', 'sunny', 'stormy', 'swift', 'brave'];
const ANIMALS = ['hawk', 'fox', 'otter', 'moose', 'loon', 'owl', 'wolf', 'lynx', 'heron', 'badger', 'beaver', 'turtle', 'robin', 'crane', 'bear', 'mink', 'finch', 'toad', 'trout', 'eagle'];
const WORDS = ['maple', 'birch', 'pine', 'fern', 'moss', 'acorn', 'river', 'lake', 'stone', 'cloud', 'leaf', 'creek', 'cedar', 'berry', 'pebble', 'meadow', 'willow', 'aspen', 'trail', 'canoe'];

const pick = <T>(a: readonly T[]) => a[randomInt(a.length)];

/** A username such as "bluehawk32" that isn't in `taken`. */
export function makeUsername(taken: Set<string>): string {
  for (let i = 0; i < 1000; i++) {
    const u = `${pick(COLORS)}${pick(ANIMALS)}${randomInt(10, 100)}`;
    if (!taken.has(u)) { taken.add(u); return u; }
  }
  throw new Error('Ran out of usernames');
}

/** A password a 6th grader can type, such as "maple-river-58". */
export function makePassword(): string {
  let b = pick(WORDS);
  const a = pick(WORDS);
  while (b === a) b = pick(WORDS);
  return `${a}-${b}-${randomInt(10, 100)}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const got = scryptSync(password, Buffer.from(salt, 'hex'), 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
