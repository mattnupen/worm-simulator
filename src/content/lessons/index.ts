import type { Lesson } from './lesson';
import { PREDATORS } from './predators';

/**
 * The lesson this build teaches: the topic students design for on this version's form (framework
 * P1). One line to change each version; null for a build with no lesson.
 */
export const CURRENT_LESSON: Lesson | null = PREDATORS;

/** Every lesson in the repo, current or not, so tests check them all. */
export const ALL_LESSONS: readonly Lesson[] = [PREDATORS];
