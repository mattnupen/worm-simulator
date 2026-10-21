import type { Lesson } from './lesson';
import { PREDATORS } from './predators';
import { EATING } from './eating';

/**
 * The lesson this build teaches: the topic students design for on this version's form (framework
 * P1). One line to change each version; null for a build with no lesson.
 */
export const CURRENT_LESSON: Lesson | null = PREDATORS;

/** Every lesson in the repo, current or not, so tests check them all. */
export const ALL_LESSONS: readonly Lesson[] = [PREDATORS, EATING];

/**
 * The lesson this page shows: `?lesson=<id>` previews any lesson in the repo (Matt's review of the
 * next round's lesson, before it becomes CURRENT_LESSON); otherwise CURRENT_LESSON.
 */
export function lessonFor(search: string): Lesson | null {
  const id = new URLSearchParams(search).get('lesson');
  return ALL_LESSONS.find((l) => l.id === id) ?? CURRENT_LESSON;
}
