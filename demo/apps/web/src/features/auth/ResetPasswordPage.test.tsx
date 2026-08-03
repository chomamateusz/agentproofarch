import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { ResetPasswordPage, resetPasswordSearchSchema } from './ResetPasswordPage.js';

// The page reads the token off the route search, and a completed reset navigates
// to `/login`, so the test router carries both routes rather than a bare root.
const renderResetPasswordPage = async (search: string) => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const resetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/reset-password',
    component: ResetPasswordPage,
    validateSearch: resetPasswordSearchSchema,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>login form</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([resetRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: [`/reset-password${search}`] }),
  });
  await router.load();
  return renderWithProviders(<RouterProvider router={router} />);
};

const submitPasswords = async (next: string, repeat: string) => {
  await userEvent.type(screen.getByLabelText('new password'), next);
  await userEvent.type(screen.getByLabelText('repeat password'), repeat);
  await userEvent.click(screen.getByRole('button', { name: 'set new password' }));
};

describe('ResetPasswordPage', () => {
  it('renders the two labeled password inputs when the link carried a token', async () => {
    await renderResetPasswordPage('?token=reset-token');

    expect(screen.getByLabelText('new password')).toBeInTheDocument();
    expect(screen.getByLabelText('repeat password')).toBeInTheDocument();
  });

  it('refuses a link with no token and offers a fresh one', async () => {
    await renderResetPasswordPage('');

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    expect(screen.getByRole('link', { name: 'request a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('new password')).not.toBeInTheDocument();
  });

  it('treats the provider INVALID_TOKEN redirect as an expired link', async () => {
    await renderResetPasswordPage('?error=INVALID_TOKEN');

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });

  it('enforces the registration password policy before calling the server', async () => {
    let calls = 0;
    server.use(
      http.post('*', () => {
        calls += 1;
        return HttpResponse.json({ status: true });
      }),
    );

    await renderResetPasswordPage('?token=reset-token');
    await submitPasswords('short', 'short');

    expect(await screen.findByText('Use at least 12 characters')).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('flags a mismatched repeat without calling the server', async () => {
    let calls = 0;
    server.use(
      http.post('*', () => {
        calls += 1;
        return HttpResponse.json({ status: true });
      }),
    );

    await renderResetPasswordPage('?token=reset-token');
    await submitPasswords('new-password-1', 'new-password-2');

    expect(await screen.findByText('Both passwords must match')).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('sends the token with the new password and lands on the login form', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('*/reset-password', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ status: true });
      }),
    );

    await renderResetPasswordPage('?token=reset-token');
    await submitPasswords('new-password-1', 'new-password-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(/password updated/i);
    expect(bodies).toEqual([{ token: 'reset-token', newPassword: 'new-password-1' }]);
    expect(await screen.findByText('login form', undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('surfaces a rejected token as a form-level alert', async () => {
    server.use(
      http.post('*/reset-password', () =>
        HttpResponse.json({ message: 'Invalid token' }, { status: 400 }),
      ),
    );

    await renderResetPasswordPage('?token=stale-token');
    await submitPasswords('new-password-1', 'new-password-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid token');
  });

  it('disables submit while the reset is in flight', async () => {
    server.use(
      http.post('*', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    await renderResetPasswordPage('?token=reset-token');
    await submitPasswords('new-password-1', 'new-password-1');

    expect(await screen.findByRole('button', { name: 'saving…' })).toBeDisabled();
  });
});
