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

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const card = (page: Page) => page.getByRole('region', { name: `Lesson: ${lesson.title}` });

test.skip(!CURRENT_LESSON, 'this build has no lesson');

test('a new device: the lesson comes first, plays through by keyboard, and then Crawl comes first', async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const outside: string[] = [];
  // The game itself loads nothing from outside; only an opened "Tell me more" video does.
  page.on('request', (r) => {
    if (!/^(file|data|blob):/.test(r.url()) && r.frame() === page.mainFrame()) outside.push(r.url());
  });
  await context.setOffline(true);
  await page.goto(PAGE);
  await expect(button(page, LEARN)).toBeFocused();
  await page.keyboard.press('Enter');

  let zoomed = false;
  for (const [i, step] of lesson.steps.entries()) {
    await expect(card(page)).toHaveCount(1);
    await expect(page.locator('.pip.here')).toHaveCount(1);
    await expect(card(page).getByRole('heading', { name: step.title })).toHaveCount(1);
    const next = button(page, i === lesson.steps.length - 1 ? 'Start crawling' : 'Next');
    if (step.kind === 'sense') {
      // A scene: the card fades out, and the words show as captions over the black bar with Skip.
      await expect(page.locator(`.cue[data-cue="${step.cue}"]`)).toHaveCount(1);
      const captions = page.locator('.cue-captions');
      await expect(captions.getByText(step.cueText)).toBeVisible();
      await expect(card(page)).toBeHidden();
      await expect(button(page, 'Skip')).toBeFocused();
      // It plays to its end, then waits: Skip becomes Next, still focused.
      await expect(captions.getByRole('button', { name: 'Next' })).toBeFocused({ timeout: 15_000 });
      await expect(card(page)).toBeHidden();
      await page.keyboard.press('Enter');
      await expect(captions).toBeHidden();
      await expect(card(page).getByText(step.question)).toBeFocused();
    } else {
      await expect(card(page).getByRole('heading', { name: step.title })).toBeFocused();
    }
    if (step.kind === 'guess') {
      // Guess first: Next waits for a pick, and the pick reveals nothing yet.
      await expect(next).toBeDisabled();
      await expect(card(page).getByText('Pick an answer to go on.')).toBeVisible();
      await card(page).getByRole('radio', { name: step.options[(step.answer + 1) % step.options.length] }).check();
      await expect(next).toBeEnabled();
      await expect(card(page).getByText('You will find out at the end of Learn.', { exact: false })).toBeVisible();
      await expect(card(page).getByText('What scientists found')).toHaveCount(0);
      await expect(card(page).getByText('Correct')).toHaveCount(0);
    } else if (step.kind === 'mission' && lesson.steps[0].kind === 'guess') {
      // The mission shows the first guess beside what scientists found, for the form.
      const g = lesson.steps[0];
      await expect(card(page).getByText(`You guessed: ${g.options[(g.answer + 1) % g.options.length]}`)).toBeVisible();
      await expect(card(page).getByText(`Scientists found: ${g.options[g.answer]}`)).toBeVisible();
      const fact = g.reveal.find((l) => l.kind === 'fact');
      if (fact && fact.kind === 'fact') await expect(card(page).getByText(shown(fact))).toBeVisible();
      await expect(button(page, 'Sources')).toBeVisible();
    } else if (step.kind === 'predict' || step.kind === 'sense') {
      // Next is there but grayed out until a guess, and says so; any guess reveals what
      // scientists found.
      await expect(next).toBeDisabled();
      await expect(card(page).getByText('Pick an answer to go on.')).toBeVisible();
      const guess = step.answer === undefined ? 0 : (step.answer + 1) % step.options.length;
      await card(page).getByRole('radio', { name: step.options[guess] }).check();
      await expect(next).toBeEnabled();
      await expect(card(page).getByText('Pick an answer to go on.')).toBeHidden();
      await expect(card(page).getByText('Your guess')).toHaveCount(0);
      if (step.answer !== undefined) {
        // The option scientists found is marked, in words.
        await expect(card(page).locator('label.choice', { hasText: step.options[step.answer] }).getByText('Correct')).toBeVisible();
      }
      await expect(card(page).getByText('What scientists found')).toBeVisible();
      const fact = step.reveal.find((l) => l.kind === 'fact');
      if (fact && fact.kind === 'fact') {
        await expect(card(page).getByText(shown(fact))).toBeVisible();
        // Sources stay off the card: the Sources panel links each one, opening in a new tab,
        // with the photo credits.
        await expect(card(page).getByRole('link')).toHaveCount(0);
        await button(page, 'Sources').click();
        const list = page.getByRole('dialog', { name: 'Sources for this page' });
        const src = list.getByRole('link', { name: new RegExp(`^${escape(SOURCES[fact.source].title)}`) });
        await expect(src).toHaveAttribute('href', SOURCES[fact.source].url);
        await expect(src).toHaveAttribute('target', '_blank');
        if (step.photo) await expect(list.getByText(step.photo.credit, { exact: false })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(list).toHaveCount(0);
      }
      if (step.photo) {
        await expect(card(page).getByRole('img', { name: step.photo.alt })).toBeVisible();
        await expect(card(page).getByText(step.photo.credit)).toHaveCount(0);
      }
    } else if (step.kind === 'meet') {
      await expect(next).toBeDisabled();
      await expect(card(page).getByText(`Found 0 of ${step.cards.length}`)).toBeVisible();
      for (const c of step.cards) {
        await button(page, `Find out: ${c.name}`).click();
        await expect(card(page).getByText(shown(c.fact))).toBeVisible();
      }
      await expect(card(page).getByText(`Found ${step.cards.length} of ${step.cards.length}`)).toBeVisible();
      await expect(next).toBeEnabled();
    }
    // Any photo opens bigger, with its credit. Esc closes only that view, and so does a tap on
    // the big photo.
    const zoom = card(page).getByRole('button', { name: /^Show a bigger photo: / }).first();
    if (!zoomed && await zoom.count()) {
      zoomed = true;
      await zoom.click();
      const view = page.getByRole('dialog');
      await expect(view).toBeVisible();
      await expect(view.getByRole('img')).toBeVisible();
      await expect(view.getByText(/iNaturalist|Wikimedia|CC /).first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(view).toHaveCount(0);
      await expect(card(page)).toBeVisible();
      await expect(zoom).toBeFocused();
      await zoom.click();
      await view.getByRole('img').click();
      await expect(view).toHaveCount(0);
      await expect(zoom).toBeFocused();
    }
    if (step.more) {
      const tell = button(page, `Tell me more: ${step.more.title}`);
      await tell.click();
      const more = page.getByRole('dialog', { name: step.more.title });
      await expect(more).toBeVisible();
      await expect(button(page, 'Close')).toBeFocused();
      if (step.more.video) {
        // The video plays in the panel (YouTube's privacy-enhanced player), with a link as well.
        await expect(more.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]')).toHaveCount(1);
        await expect(more.getByRole('link', { name: new RegExp(`^Open on YouTube`) })).toHaveAttribute('target', '_blank');
      }
      await page.keyboard.press('Enter');
      await expect(more).toHaveCount(0);
      await expect(tell).toBeFocused();
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
  // Answer the opening guess, if there is one, to reach the first teaching question.
  if (lesson.steps[0].kind === 'guess') {
    await card(page).getByRole('radio', { name: lesson.steps[0].options[0] }).check();
  }
  const firstAsk = lesson.steps.findIndex((s) => s.kind === 'predict' || s.kind === 'sense');
  for (let i = 0; i < firstAsk; i++) await button(page, 'Next').click();
  const step = lesson.steps[firstAsk] as Extract<typeof lesson.steps[number], { kind: 'predict' | 'sense' }>;
  if (step.kind === 'sense') await button(page, 'Skip').click();
  await card(page).getByRole('radio', { name: step.options[1] }).check();
  await button(page, 'Next').click();
  if (lesson.steps[firstAsk + 1].kind === 'sense') await button(page, 'Skip').click();
  await button(page, 'Back').click();
  // The answer is kept, and a watched scene doesn't play again as a scene.
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('radio', { name: step.options[1] })).toBeChecked();
  await expect(button(page, 'Next')).toBeEnabled();
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
