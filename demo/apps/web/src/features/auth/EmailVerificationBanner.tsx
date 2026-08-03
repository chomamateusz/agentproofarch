import { Alert, Button } from '@mui/material';
import { useMutation } from '@tanstack/react-query';

import { ApiError } from '#core/client/index.js';

import { actions } from '../../api.js';
import { FinePrint } from '../../theme.js';

export interface Account {
  email: string;
  emailVerified: boolean;
}

const errorText = (error: unknown): string =>
  error instanceof ApiError
    ? error.appError.message
    : error instanceof Error
      ? error.message
      : 'Could not send the link';

/**
 * Soft email verification made visible: an unconfirmed account is fully usable,
 * so this is a quiet notice in the login card's language rather than a wall. It
 * renders nothing once the address is confirmed, which is why the shell can mount
 * it unconditionally.
 *
 * The account arrives as a prop rather than from a second `me` observer: a failed
 * `/api/me` carries no data, so a mounting observer would refetch, flip the shared
 * query back to `pending`, unmount the branch that renders this banner, and start
 * over — an endless boot splash on a forbidden tenant host.
 */
export const EmailVerificationBanner = ({ account }: { account: Account | null }) => {
  const resend = useMutation(actions.sendVerificationEmail);

  if (account === null || account.emailVerified) return null;

  return (
    <Alert
      severity="info"
      variant="outlined"
      icon={false}
      sx={{ mt: '1.5rem' }}
      action={
        <Button
          size="small"
          variant="outlined"
          disabled={resend.isPending}
          onClick={() =>
            resend.mutate({
              email: account.email,
              callbackURL: `${window.location.origin}/app`,
            })
          }
        >
          {resend.isPending ? 'sending…' : 'resend link'}
        </Button>
      }
    >
      <FinePrint variant="caption" component="p">
        {account.email} is not confirmed yet. Everything here works without it — confirming only
        unlocks creating your own tenant.
      </FinePrint>
      {resend.isSuccess ? (
        <FinePrint variant="caption" component="p" sx={{ mt: '0.4rem' }}>
          Link sent. In dev the send is captured by Mailpit — open its inbox to follow it.
        </FinePrint>
      ) : null}
      {resend.isError ? (
        <FinePrint variant="caption" component="p" sx={{ mt: '0.4rem' }}>
          {errorText(resend.error)}
        </FinePrint>
      ) : null}
    </Alert>
  );
};
