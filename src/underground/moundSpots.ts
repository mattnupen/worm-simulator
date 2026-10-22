/**
 * Where the casting mounds stand: [x, z, ...] in world units, baked from moundScatter.ts
 * (scatterMounds(): seeded, each on a spot where the worm can dig down, at least MOUND_GAP apart).
 * tests/unit/moundScatter.test.ts runs the scatter again and prints a new table if the world
 * changed. Never edit by hand.
 */
export const MOUND_SPOTS: readonly number[] = [
  15.37, 9.7, 5.47, -0.12, -15.96, -12.44, -2, 8.86, -10.04, -3.37,
  -5.17, -14.71, -13.24, 11.6, 12.02, 2.52, -11.5, 3.53, -3.39, -5.65,
];
