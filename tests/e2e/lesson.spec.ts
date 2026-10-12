import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CURRENT_LESSON } from '../../src/content/lessons';
import { SOURCES } from '../../src/content/sources';
import { shown } from '../../src/content/text';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;
const lesson = CURRENT_LESSON!;
const LEARN = `Learn: ${lesson.title}`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const card = (page: Page) => page.getByRole('region', { name: `Lesson: ${lesson.title}` });

test.skip(!CURRENT_LESSON, 'this build has no lesson');

test('a new device: the lesson comes first, plays through by keyboard, and then Crawl comes first', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await context.setOffline(true);
  await page.goto(PAGE);
  await expect(button(page, LEARN)).toBeFocused();
  await page.keyboard.press('Enter');

  for (const [i, step] of lesson.steps.entries()) {
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText(`Step ${i + 1} of ${lesson.steps.length}`)).toBeVisible();
    await expect(card(page).getByRole('heading', { name: step.title })).toBeFocused();
    const next = button(page, i === lesson.steps.length - 1 ? 'Start crawling' : 'Next');
    if (step.kind === 'predict' || step.kind === 'sense') {
      // Next waits for a guess; any guess reveals what scientists found, with its source.
      await expect(next).toBeHidden();
      if (step.kind === 'sense') {
        await expect(page.locator(`.cue[data-cue="${step.cue}"]`)).toHaveCount(1);
        await expect(card(page).getByText(step.cueText)).toBeVisible();
      }
      await button(page, step.options[0]).click();
      await expect(button(page, `${step.options[0]} (your guess)`)).toHaveAttribute('aria-pressed', 'true');
      await expect(card(page).getByText('What scientists found')).toBeVisible();
      const fact = step.reveal.find((l) => l.kind === 'fact');
      if (fact && fact.kind === 'fact') {
        await expect(card(page).getByText(shown(fact))).toBeVisible();
        await expect(card(page).getByText(`Source: ${SOURCES[fact.source].publisher}`).first()).toBeVisible();
      }
    } else if (step.kind === 'sort') {
      await expect(next).toBeHidden();
      for (const c of step.cards) {
        await button(page, `${c.name}: ${step.groups[0]}`).click();
        await expect(card(page).getByText(shown(c.fact))).toBeVisible();
      }
    }
    await expect(next).toBeVisible();
    await next.focus();
    await page.keyboard.press('Enter');
  }

  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await expect(page.locator('.cue[data-cue]')).toHaveCount(0);
  await page.reload();
  // Finished: Crawl is first again, and the lesson stays on Start to replay.
  await expect(button(page, 'Crawl')).toBeFocused();
  await expect(button(page, LEARN)).toBeVisible();
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('Back returns to the last step with its answer kept; Esc and Back to start leave the lesson', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE + '?lesson=1');
  await expect(card(page)).toBeVisible();
  const firstAsk = lesson.steps.findIndex((s) => s.kind === 'predict' || s.kind === 'sense');
  for (const s of lesson.steps.slice(0, firstAsk)) {
    if (s.kind === 'sort') for (const c of s.cards) await button(page, `${c.name}: ${s.groups[c.group]}`).click();
    await button(page, 'Next').click();
  }
  const step = lesson.steps[firstAsk] as Extract<typeof lesson.steps[number], { kind: 'predict' | 'sense' }>;
  await button(page, step.options[1]).click();
  await button(page, 'Next').click();
  await button(page, 'Back').click();
  // The answer is kept: Next shows and the reveal is open.
  await expect(button(page, 'Next')).toBeVisible();
  await expect(card(page).getByText('What scientists found')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button(page, LEARN)).toBeFocused();
  await expect(page.locator('.cue[data-cue]')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await button(page, 'Back to start').click();
  await expect(button(page, LEARN)).toBeFocused();
  expect(errors).toEqual([]);
});

test('the quests open in order: Learn, then Play, then Vote; "I voted" finishes the round', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  // A new device: only Learn is open. Play (Crawl) and Vote are locked, and say why.
  await expect(button(page, LEARN)).toBeFocused();
  await expect(button(page, 'Crawl')).toBeDisabled();
  await expect(button(page, 'Vote')).toBeDisabled();
  await expect(page.getByText('Locked: finish Learn first')).toBeVisible();
  await expect(page.getByText('Locked: finish Play first')).toBeVisible();

  // Learn done, 5 minutes played: Vote is next.
  await page.evaluate(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] }));
    localStorage.setItem('wormsim.quests', JSON.stringify({ version: 1, rounds: { 3: { playSeconds: 300, voted: false } } }));
  });
  await page.reload();
  await expect(button(page, 'Vote')).toBeFocused();
  await expect(button(page, 'Crawl')).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Vote' })).toBeVisible();
  await expect(button(page, 'I voted')).toBeFocused();
  await page.keyboard.press('Enter');
  // All done: Crawl leads again, and the vote is remembered.
  await expect(button(page, 'Crawl')).toBeFocused();
  await expect(page.getByText('Done. Thanks for voting!')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.quests') ?? 'null'));
  expect(saved.rounds['3']).toEqual({ playSeconds: 300, voted: true });
  expect(errors).toEqual([]);
});

test('Play counts real crawling toward its 5 minutes, and keeps it when paused', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] })));
  await page.goto(PAGE);
  await expect(page.getByText('0 of 5 minutes played')).toBeVisible();
  await button(page, 'Crawl').click();
  await page.waitForTimeout(7000);
  await page.keyboard.press('Escape');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.quests') ?? 'null'));
  // Game time, not wall time: a slow software renderer runs fewer steps than 7 s of play.
  expect(saved.rounds['3'].playSeconds).toBeGreaterThanOrEqual(2);
  expect(saved.rounds['3'].playSeconds).toBeLessThan(10);
  expect(saved.rounds['3'].voted).toBe(false);
});
