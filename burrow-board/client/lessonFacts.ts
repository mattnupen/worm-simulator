import { ALL_LESSONS } from '../../src/content/lessons/index';
import { lessonLines } from '../../src/content/lessons/lesson';
import { SOURCES } from '../../src/content/sources';
import type { Fact } from '../shared/model.ts';

/**
 * Every sourced fact in the game's lessons (src/content), for the teacher's fact-card picker. The
 * board reuses them word for word with their sources, so the science stays sourced (brief section 5).
 */
export const LESSON_FACTS: readonly { lesson: string; facts: Fact[] }[] = ALL_LESSONS.map((lesson) => {
  const seen = new Set<string>();
  const facts: Fact[] = [];
  for (const [where, line] of Object.entries(lessonLines(lesson))) {
    if (line.kind !== 'fact' || seen.has(line.text)) continue;
    seen.add(line.text);
    const src = SOURCES[line.source];
    facts.push({ id: `${lesson.id}:${where}`, text: line.text, sourceId: line.source, sourceTitle: `${src.title} (${src.publisher})`, url: src.url });
  }
  return { lesson: lesson.title, facts };
});
