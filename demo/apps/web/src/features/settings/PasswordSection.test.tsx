import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { PasswordSection } from './PasswordSection.js';

describe('PasswordSection', () => {
  it('changes the password and forwards the other-session choice', async () => {
    let requestBody: unknown;
    server.use(
      http.post('*/change-password', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ status: true });
      }),
    );

    renderWithProviders(<PasswordSection />);

    await userEvent.type(screen.getByLabelText('current password'), 'demo1234');
    await userEvent.type(screen.getByLabelText('new password'), 'changed1234');
    await userEvent.click(screen.getByLabelText('sign out other sessions'));
    await userEvent.click(screen.getByRole('button', { name: 'change password' }));

    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    expect(requestBody).toEqual({
      currentPassword: 'demo1234',
      newPassword: 'changed1234',
      revokeOtherSessions: true,
    });
  });

  it('reuses the registration password policy', async () => {
    renderWithProviders(<PasswordSection />);

    await userEvent.type(screen.getByLabelText('current password'), 'demo1234');
    await userEvent.type(screen.getByLabelText('new password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'change password' }));

    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
  });

  it('surfaces a wrong-password error', async () => {
    server.use(
      http.post('*/change-password', () => HttpResponse.json({ message: 'Invalid password' }, { status: 400 })),
    );

    renderWithProviders(<PasswordSection />);
    await userEvent.type(screen.getByLabelText('current password'), 'wrong-password');
    await userEvent.type(screen.getByLabelText('new password'), 'changed1234');
    await userEvent.click(screen.getByRole('button', { name: 'change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid password/i);
  });
});
