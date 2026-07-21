import { expect, test } from '@playwright/test';

// US-026 end to end over the real stack: a provisioned member (seeded
// `mag@example.com`, null userId in the acme tenant) requests a passwordless
// magic link from the login page. The dev email transport does not deliver — it
// captures the link, exposed on `/api/dev/magic-link` (dev/CI only) — so the
// test retrieves it, follows it, and lands authenticated with the member bound.
const PROVISIONED_MEMBER = 'mag@example.com';

test('magic link signs in a provisioned member and binds them to the tenant', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(PROVISIONED_MEMBER);
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();

  // Dev transport confirms the request without delivering.
  await expect(page.getByText(/no email is sent/i)).toBeVisible();

  // Retrieve the captured link (dev-only surface) and follow it to sign in.
  const captured = await page.request.get(
    `/api/dev/magic-link?email=${encodeURIComponent(PROVISIONED_MEMBER)}`,
  );
  expect(captured.ok()).toBe(true);
  const body = await captured.json();
  expect(body.ok).toBe(true);
  const link: string = body.data.link;
  expect(link).toContain('magic-link/verify');

  await page.goto(link);

  // The verify redirects to the app shell; localhost resolves to acme, and the
  // now-bound member sees the authenticated shell for that tenant (the switcher
  // shows the acme slug — a member is not staff, so it has no tenant-name roster).
  await expect(page.getByRole('button', { name: 'Switch tenant' })).toContainText(/acme/i);

  // The bound identity is the provisioned member's email (not the demo owner).
  const me = await page.request.get('/api/me');
  const meBody = await me.json();
  expect(meBody.ok).toBe(true);
  expect(meBody.data.email).toBe(PROVISIONED_MEMBER);
  expect(meBody.data.tenant.memberId).toBe('member-acme-mag');
});
