import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { fetchPasswordResetLink } from '../scripts/mailpit.js';

// The forgot-password round trip over the real stack: a fresh account asks for a
// reset from the login page, the real smtp transport delivers to the dev/CI
// Mailpit, the captured link is followed as a human would follow it from the
// inbox, and the new password is what signs the account back in. The account is
// registered in this run so no shared credential (the seeded demo login) is ever
// mutated by the gate.
const MAILPIT_API_URL = 'http://localhost:47980';
const OLD_PASSWORD = 'old-password-1';
const NEW_PASSWORD = 'new-password-1';

test('a reset link sets a new password and the old one stops working', async ({ page }) => {
  const email = `reset-${randomUUID()}@example.com`;

  await page.goto('/register');
  await page.locator('#register-name').fill('Reset Subject');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'create account' }).click();
  // `localhost` is a custom domain of the seeded acme tenant, so a brand-new
  // account lands on the onboarding card with no create form: soft verification
  // withholds `tenant:create` until the address is confirmed.
  const onboarding = page.getByRole('heading', {
    name: 'no tenant is available on this host',
  });
  await expect(onboarding).toBeVisible();

  await page.getByRole('button', { name: 'sign out' }).click();
  await expect(page.getByRole('button', { name: 'sign in' })).toBeVisible();

  await page.getByRole('link', { name: 'forgot password?' }).click();
  await page.locator('#forgot-email').fill(email);
  await page.getByRole('button', { name: 'email me a reset link' }).click();

  // The confirmation says nothing about whether the address has an account.
  await expect(page.getByText(/if that address has an account/i)).toBeVisible();

  // Recover the captured link from Mailpit; following it lands on the app's own
  // reset form with the token on the query string.
  const link = await fetchPasswordResetLink(MAILPIT_API_URL, email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?token=/);

  await page.locator('#reset-password').fill(NEW_PASSWORD);
  await page.locator('#reset-password-confirm').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'set new password' }).click();
  await expect(page.getByText(/password updated/i)).toBeVisible();

  // The success state hands the visitor to the login form by itself.
  await expect(page.getByRole('button', { name: 'sign in' })).toBeVisible();

  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.locator('#login-password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'sign in' }).click();
  await expect(onboarding).toBeVisible();
});

test('a reset link that carries no token is refused, not silently accepted', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i);
  await expect(page.getByRole('link', { name: 'request a new link' })).toBeVisible();
});
