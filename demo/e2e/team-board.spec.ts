import { expect, test, type Page } from '@playwright/test';

const DEMO_EMAIL = 'demo@agentproofarch.dev';
const DEMO_PASSWORD = 'demo1234';

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/login');
  await page.locator('#login-email').fill(DEMO_EMAIL);
  await page.locator('#login-password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Acme Sp. z o.o.' })).toBeVisible();
};

const column = (page: Page, name: string) => page.locator(`section[aria-label="${name}"]`);

// Card titles render as the only <p> elements inside a column section; filter to
// this test's own cards so retries (leftover rows) cannot break order assertions.
const titlesIn = async (page: Page, columnName: string, mine: string[]): Promise<string[]> => {
  const texts = await column(page, columnName).locator('p').allTextContents();
  return texts.filter((text) => mine.includes(text));
};

const addCard = async (page: Page, columnName: string, title: string): Promise<void> => {
  await column(page, columnName).getByLabel(`New card in ${columnName}`).fill(title);
  await column(page, columnName).getByRole('button', { name: 'add' }).click();
  await expect(column(page, columnName).getByText(title)).toBeVisible();
};

const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('section[aria-label] [aria-busy="true"]')).toHaveCount(0);
};

test('team board: legal chain clicks through, illegal move is visibly refused, verdicts survive reload', async ({
  page,
}) => {
  const stamp = Date.now();
  const walker = `e2e team walker ${stamp}`;
  const dropped = `e2e team dropped ${stamp}`;
  const mine = [walker, dropped];

  await signIn(page);
  await page.goto('/team-board');
  await expect(page.getByRole('heading', { name: 'Team board' })).toBeVisible();

  // One card that will walk the full legal path, and one created straight in
  // `done` — it has never visited in-dev, so its only move (left, into review)
  // must be refused by the review-requires-in-dev guard.
  await addCard(page, 'todo', walker);
  await addCard(page, 'done', dropped);
  await settled(page);

  // The illegal move is a real button, visibly DISABLED, with the rejecting
  // rule in its accessible name and in the card's caption — not a hidden option.
  const blockedMove = page.getByRole('button', {
    name: `Move ${dropped} to review (blocked: review-requires-in-dev)`,
  });
  await expect(blockedMove).toBeVisible();
  await expect(blockedMove).toBeDisabled();
  await expect(
    column(page, 'done').getByText('blocked: review-requires-in-dev').first(),
  ).toBeVisible();

  // The legal chain: todo -> in-dev -> review -> done, each step an enabled
  // button (the oracle allows it) that lands the card in the next column.
  await page.getByRole('button', { name: `Move ${walker} to in-dev` }).click();
  await expect.poll(() => titlesIn(page, 'in-dev', mine)).toEqual([walker]);
  await page.getByRole('button', { name: `Move ${walker} to review` }).click();
  await expect.poll(() => titlesIn(page, 'review', mine)).toEqual([walker]);
  await page.getByRole('button', { name: `Move ${walker} to done` }).click();
  await expect.poll(() => titlesIn(page, 'done', mine)).toEqual([dropped, walker]);
  await settled(page);

  // Reload: the island store dies, the server truth does not — positions AND
  // the verdicts, because `visited` history is recorded server-side. The
  // dropped card is still blocked from review; the walker, whose persisted
  // history includes in-dev, may go back.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Team board' })).toBeVisible();
  await expect.poll(() => titlesIn(page, 'done', mine)).toEqual([dropped, walker]);
  await expect(
    page.getByRole('button', {
      name: `Move ${dropped} to review (blocked: review-requires-in-dev)`,
    }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: `Move ${walker} to review` })).toBeEnabled();
});
