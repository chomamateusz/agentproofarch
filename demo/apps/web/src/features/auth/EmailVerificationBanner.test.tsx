import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { EmailVerificationBanner } from './EmailVerificationBanner.js';

const resendBodySchema = z.object({ email: z.string(), callbackURL: z.string() });

const renderBanner = (emailVerified: boolean) =>
  renderWithProviders(
    <EmailVerificationBanner account={{ email: 'unconfirmed@example.com', emailVerified }} />,
  );

describe('EmailVerificationBanner', () => {
  it('stays out of the way once the address is confirmed', () => {
    renderBanner(true);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing at all when the session could not be read', () => {
    renderWithProviders(<EmailVerificationBanner account={null} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the unconfirmed address and says the account still works', async () => {
    renderBanner(false);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('unconfirmed@example.com is not confirmed yet');
    expect(banner).toHaveTextContent('Everything here works without it');
  });

  it('resends the confirmation link for that address and confirms the send', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post('*/send-verification-email', async ({ request }) => {
        sent.push(resendBodySchema.parse(await request.json()));
        return HttpResponse.json({ status: true });
      }),
    );
    renderBanner(false);

    await userEvent.click(await screen.findByRole('button', { name: 'resend link' }));

    expect(await screen.findByText(/Link sent/i)).toBeInTheDocument();
    expect(sent).toEqual([
      { email: 'unconfirmed@example.com', callbackURL: `${window.location.origin}/app` },
    ]);
  });

  it('surfaces a failed resend instead of pretending it went out', async () => {
    server.use(
      http.post('*/send-verification-email', () =>
        HttpResponse.json({ message: 'Too many requests' }, { status: 429 }),
      ),
    );
    renderBanner(false);

    await userEvent.click(await screen.findByRole('button', { name: 'resend link' }));

    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
  });
});
