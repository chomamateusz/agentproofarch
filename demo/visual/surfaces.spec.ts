import { expect, test, type Page } from '@playwright/test';

const DEMO_EMAIL = 'demo@agentproofarch.dev';
const DEMO_PASSWORD = 'demo-agentproof-1234';
const EMPTY_ME = {
  ok: true,
  data: {
    userId: 'u1',
    email: DEMO_EMAIL,
    name: 'Demo',
    emailVerified: true,
    tenant: null,
  },
};

const UNVERIFIED_ME = {
  ok: true,
  data: { ...EMPTY_ME.data, emailVerified: false },
};

// The login form renders a Google button only once /api/config answers; waiting
// for that response pins the screenshot to the settled form, not a half-built one.
const openLogin = async (page: Page): Promise<void> => {
  const config = page.waitForResponse('**/api/config');
  await page.goto('/login');
  await config;
  await expect(page.getByRole('heading', { name: 'agentproofarch' })).toBeVisible();
};

const submitSignIn = async (page: Page): Promise<void> => {
  await page.locator('#login-email').fill(DEMO_EMAIL);
  await page.locator('#login-password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
};

test('login page', async ({ page }) => {
  await openLogin(page);

  await expect(page).toHaveScreenshot('login.png', {
    fullPage: true,
    mask: [page.getByTestId('build-stamp')],
  });
});

test('login page with a rejected sign-in', async ({ page }) => {
  await openLogin(page);
  await page.locator('#login-email').fill(DEMO_EMAIL);
  await page.locator('#login-password').fill('wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await expect(page).toHaveScreenshot('login-error.png', {
    fullPage: true,
    mask: [page.getByTestId('build-stamp')],
  });
});

test('register page', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'create account' })).toBeVisible();

  await expect(page).toHaveScreenshot('register.png', { fullPage: true });
});

test('forgot-password page', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('button', { name: 'email me a reset link' })).toBeVisible();

  await expect(page).toHaveScreenshot('forgot-password.png', { fullPage: true });
});

test('reset-password page with a token', async ({ page }) => {
  await page.goto('/reset-password?token=visual-baseline-token');
  await expect(page.getByRole('button', { name: 'set new password' })).toBeVisible();

  await expect(page).toHaveScreenshot('reset-password.png', { fullPage: true });
});

test('reset-password page reached without a token', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toBeVisible();

  await expect(page).toHaveScreenshot('reset-password-invalid.png', { fullPage: true });
});

// The seeded ledger rows share one createdAt, so their order is a database tie
// and their rendered date is the day the seed ran: the list is not a stable
// surface. The shell chrome around it is fully determined by the seed.
test('authenticated app shell chrome', async ({ page }) => {
  await openLogin(page);
  await submitSignIn(page);

  const chrome = page.getByRole('banner');
  await expect(chrome.getByRole('button', { name: 'Switch tenant' })).toContainText('Acme Sp. z o.o.');

  await expect(chrome).toHaveScreenshot('app-shell-chrome.png', {
    mask: [page.getByTestId('build-stamp')],
  });
});

// A `me` request that never answers pins the boot state; the screenshot waits
// for the slow-start line so it captures one settled composition rather than
// racing the four-second threshold. The suite runs with reduced motion, so the
// indicator renders its static state.
test('boot splash while the session is unresolved', async ({ page }) => {
  await openLogin(page);
  await page.route('**/api/me', () => undefined);
  await submitSignIn(page);
  await expect(page.getByText('warming up the server…')).toBeVisible();

  await expect(page).toHaveScreenshot('boot-splash.png', {
    fullPage: true,
    mask: [page.getByTestId('build-stamp')],
  });
});

test('StatusView error inside AppShell', async ({ page }) => {
  await openLogin(page);
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'internal', message: 'visual status error' },
      }),
    });
  });
  await submitSignIn(page);
  await expect(page.getByRole('alert')).toContainText('visual status error');

  await expect(page).toHaveScreenshot('layout-status-view-error.png', {
    fullPage: true,
    mask: [page.getByTestId('build-stamp')],
  });
});

test('StatusView empty inside FocusCard', async ({ page }) => {
  await openLogin(page);
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_ME),
    });
  });
  await page.route('**/api/tenants', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { tenants: [], canCreateTenant: true } }),
    });
  });
  await submitSignIn(page);
  await expect(
    page.getByRole('heading', { name: 'no tenant here yet — create one to get started' }),
  ).toBeVisible();

  await expect(page).toHaveScreenshot('layout-status-view-empty.png', {
    fullPage: true,
    mask: [page.getByTestId('build-stamp')],
  });
});

// Soft email verification: the account is fully usable and the only visible
// consequence is this notice, so the baseline captures the quiet banner next to
// the onboarding card that no longer offers tenant creation.
test('unverified email banner on the tenant-less card', async ({ page }) => {
  await openLogin(page);
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(UNVERIFIED_ME),
    });
  });
  await page.route('**/api/tenants', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { tenants: [], canCreateTenant: false } }),
    });
  });
  await submitSignIn(page);
  await expect(page.getByRole('alert')).toContainText('is not confirmed yet');

  await expect(page).toHaveScreenshot('email-verification-banner.png', {
    fullPage: true,
    mask: [page.getByTestId('build-stamp')],
  });
});
