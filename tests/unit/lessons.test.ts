import { describe, it, expect } from 'vitest';
import { ALL_LESSONS, CURRENT_LESSON } from '../../src/content/lessons';
import { lessonLines, youTubeId, type Lesson } from '../../src/content/lessons/lesson';
import { lineProblems } from '../../src/content/text';

describe('in-game lessons: science honesty and shape', () => {
  it('every line of every lesson is labelled, and every fact is sourced and verified', () => {
    for (const l of ALL_LESSONS) expect(lineProblems(lessonLines(l)), l.id).toEqual([]);
  });

  it('ids are unique, and the current lesson is one of them', () => {
    const ids = ALL_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    if (CURRENT_LESSON) expect(ALL_LESSONS).toContain(CURRENT_LESSON);
  });

  it('each lesson is short, ends on its mission, and teaches with at least one sourced fact', () => {
    for (const l of ALL_LESSONS) {
      // The opening "Guess first!" doesn't count toward the 3 to 8 teaching steps.
      const teaching = l.steps.filter((s) => s.kind !== 'guess');
      expect(teaching.length, l.id).toBeGreaterThanOrEqual(3);
      expect(teaching.length, l.id).toBeLessThanOrEqual(8);
      expect(l.steps[l.steps.length - 1].kind, l.id).toBe('mission');
      expect(l.steps.filter((s) => s.kind === 'mission'), l.id).toHaveLength(1);
      const facts = Object.values(lessonLines(l)).filter((x) => x.kind === 'fact');
      expect(facts.length, l.id).toBeGreaterThan(0);
    }
  });

  it('questions have 2 to 4 options, a reveal, and an answer that is one of them; meets have 2 to 6 cards', () => {
    for (const l of ALL_LESSONS) {
      for (const s of l.steps) {
        if (s.kind === 'guess' || s.kind === 'predict' || s.kind === 'sense') {
          expect(s.options.length).toBeGreaterThanOrEqual(2);
          expect(s.options.length).toBeLessThanOrEqual(4);
          expect(s.reveal.length).toBeGreaterThan(0);
          if (s.answer !== undefined) {
            expect(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < s.options.length, s.title).toBe(true);
          }
        }
        if (s.kind === 'meet') {
          expect(s.cards.length).toBeGreaterThanOrEqual(2);
          expect(s.cards.length).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('a "Guess first!" step comes first, at most once, with a sourced reveal for the mission', () => {
    for (const l of ALL_LESSONS) {
      const at = l.steps.flatMap((s, i) => (s.kind === 'guess' ? [i] : []));
      expect(at.length, l.id).toBeLessThanOrEqual(1);
      if (!at.length) continue;
      expect(at[0], l.id).toBe(0);
      const g = l.steps[0];
      if (g.kind !== 'guess') continue;
      expect(Number.isInteger(g.answer) && g.answer >= 0 && g.answer < g.options.length).toBe(true);
      expect(g.reveal.some((x) => x.kind === 'fact'), l.id).toBe(true);
    }
  });

  it('"Tell me more" panels hold at least one sourced fact', () => {
    for (const l of ALL_LESSONS) {
      for (const s of l.steps) {
        if (s.kind === 'mission' || !s.more) continue;
        expect(s.more.lines.some((x) => x.kind === 'fact'), `${l.id}: ${s.title}`).toBe(true);
        // A video must be a YouTube page the panel can embed.
        if (s.more.video) expect(youTubeId(s.more.video.url), s.more.video.url).toMatch(/^[\w-]{11}$/);
      }
    }
  });

  it('lessonLines catches an unsourced claim anywhere in a lesson', () => {
    const bad = {
      id: 'bad',
      title: 'Bad',
      steps: [
        { kind: 'predict', title: 'Q', question: 'Q?', options: ['a', 'b'], reveal: [{ kind: 'fact', text: 'Robins eat worms.', source: 'my-blog', verified: true }] },
        { kind: 'mission', title: 'M', notice: { kind: 'ui', text: 'n' }, reminder: { kind: 'ui', text: '' } },
      ],
    } as unknown as Lesson;
    expect(lineProblems(lessonLines(bad))).toEqual(['0.reveal.0: unknown source "my-blog"', '1.reminder: empty']);
  });

  it('youTubeId reads watch and short links, and nothing else', () => {
    expect(youTubeId('https://www.youtube.com/watch?v=RDA64eUoxag')).toBe('RDA64eUoxag');
    expect(youTubeId('https://www.youtube.com/watch?list=x&v=RDA64eUoxag')).toBe('RDA64eUoxag');
    expect(youTubeId('https://youtu.be/RDA64eUoxag')).toBe('RDA64eUoxag');
    expect(youTubeId('https://evil.example/watch?v=RDA64eUoxag')).toBeNull();
  });
});
