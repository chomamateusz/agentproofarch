import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { ForgotPasswordPage } from './ForgotPasswordPage.js';

const renderForgotPasswordPage = async () => {
  const rootRoute = createRootRoute({ component: ForgotPasswordPage });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/forgot-password'] }),
  });
  await router.load();
  return renderWithProviders(<RouterProvider router={router} />);
};

const requestFor = async (email: string) => {
  await userEvent.type(screen.getByLabelText('email'), email);
  await userEvent.click(screen.getByRole('button', { name: 'email me a reset link' }));
};

describe('ForgotPasswordPage', () => {
  it('renders the labeled email input and nothing else to fill in', async () => {
    await renderForgotPasswordPage();

    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.queryByLabelText('password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'email me a reset link' })).toBeInTheDocument();
  });

  it('rejects a malformed email before calling the server', async () => {
    let calls = 0;
    server.use(
      http.post('*', () => {
        calls += 1;
        return HttpResponse.json({ status: true });
      }),
    );

    await renderForgotPasswordPage();
    await requestFor('not-an-email');

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('confirms the send without revealing whether the account exists', async () => {
    server.use(
      http.post('*/request-password-reset', () =>
        HttpResponse.json({
          status: true,
          message: 'If this email exists in our system, check your email for the reset link',
        }),
      ),
    );

    await renderForgotPasswordPage();
    await requestFor('someone@example.com');

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument();
  });

  it('gives an unknown address the same answer as a known one (no enumeration oracle)', async () => {
    const requested: unknown[] = [];
    server.use(
      http.post('*/request-password-reset', async ({ request }) => {
        requested.push(await request.json());
        return HttpResponse.json({
          status: true,
          message: 'If this email exists in our system, check your email for the reset link',
        });
      }),
    );

    const known = await renderForgotPasswordPage();
    await requestFor('demo@agentproofarch.dev');
    const knownMessage = (await screen.findByRole('alert')).textContent;
    known.unmount();

    await renderForgotPasswordPage();
    await requestFor('nobody@example.com');
    const unknownMessage = (await screen.findByRole('alert')).textContent;

    expect(unknownMessage).toBe(knownMessage);
    expect(requested).toHaveLength(2);
  });

  it('disables submit while the request is in flight', async () => {
    server.use(
      http.post('*', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    await renderForgotPasswordPage();
    await requestFor('demo@agentproofarch.dev');

    expect(await screen.findByRole('button', { name: 'sending link…' })).toBeDisabled();
  });
});
