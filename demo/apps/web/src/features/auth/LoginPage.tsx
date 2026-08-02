import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Link,
  OutlinedInput,
  Paper,
  Stack,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { ApiError } from '#core/client/index.js';

import { actions } from '../../api.js';
import { BuildStamp } from '../../components/ui/BuildStamp.js';
import { DemoValue, Eyebrow, FinePrint, Wordmark } from '../../theme.js';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(
    new URLSearchParams(window.location.search).get('twoFactor') === 'required',
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const config = useQuery(actions.config);

  const finishSignIn = async () => {
    await queryClient.invalidateQueries();
    await navigate({ to: '/app' });
  };

  const signIn = useMutation({
    ...actions.signIn,
    onSuccess: async (result) => {
      if (result.twoFactorRedirect) {
        setTwoFactorRequired(true);
        return;
      }
      await finishSignIn();
    },
  });

  const magicLink = useMutation(actions.requestMagicLink);

  const passkey = useMutation({
    ...actions.signInPasskey,
    onSuccess: async (result) => {
      if (result.twoFactorRedirect) {
        setTwoFactorRequired(true);
        return;
      }
      await finishSignIn();
    },
  });

  const verifyTotp = useMutation({
    ...actions.verifyTotp,
    onSuccess: finishSignIn,
  });

  const verifyBackupCode = useMutation({
    ...actions.verifyBackupCode,
    onSuccess: finishSignIn,
  });

  const google = useMutation({
    ...actions.signInSocial,
    onSuccess: (result) => {
      if (result.url) window.location.assign(result.url);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (twoFactorRequired) {
      verifyTotp.mutate({ code: twoFactorCode });
      return;
    }
    signIn.mutate({ email, password });
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: '1.5rem' }}>
      <Paper
        variant="outlined"
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: '23rem',
          px: '1.8rem',
          pt: '2rem',
          pb: '1.6rem',
          animation: 'settle 0.45s ease-out both',
        }}
      >
        <Wordmark variant="h1" sx={{ mb: '0.2rem' }}>
          agentproofarch
        </Wordmark>
        <Eyebrow variant="overline" component="p" sx={{ mb: '1.6rem' }}>
          sign in · tenant {window.location.hostname}
        </Eyebrow>
        {twoFactorRequired ? (
          <Stack useFlexGap spacing="1rem">
            <Alert severity="info">Enter an authenticator code or one of your one-use backup codes.</Alert>
            <FormControl fullWidth>
              <FormLabel htmlFor="two-factor-code">two-factor code</FormLabel>
              <OutlinedInput
                id="two-factor-code"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </FormControl>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={verifyTotp.isPending || verifyBackupCode.isPending || twoFactorCode.length === 0}
            >
              {verifyTotp.isPending ? 'verifying…' : 'verify authenticator code'}
            </Button>
            <Button
              type="button"
              variant="outlined"
              fullWidth
              disabled={verifyTotp.isPending || verifyBackupCode.isPending || twoFactorCode.length === 0}
              onClick={() => verifyBackupCode.mutate({ code: twoFactorCode })}
            >
              {verifyBackupCode.isPending ? 'verifying…' : 'use backup code'}
            </Button>
          </Stack>
        ) : (
          <>
            <Stack useFlexGap spacing="1rem">
              <FormControl fullWidth>
                <FormLabel htmlFor="login-email">email</FormLabel>
                <OutlinedInput
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </FormControl>
              <FormControl fullWidth>
                <FormLabel htmlFor="login-password">password</FormLabel>
                <OutlinedInput
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </FormControl>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={signIn.isPending}
                sx={{ mt: '0.4rem' }}
              >
                {signIn.isPending ? 'signing in…' : 'sign in'}
              </Button>
              <Button
                type="button"
                variant="outlined"
                fullWidth
                disabled={magicLink.isPending || email.length === 0}
                onClick={() => magicLink.mutate({ email, callbackURL: `${window.location.origin}/app` })}
              >
                {magicLink.isPending ? 'sending link…' : 'email me a sign-in link'}
              </Button>
              <Button
                type="button"
                variant="outlined"
                fullWidth
                disabled={passkey.isPending}
                onClick={() => passkey.mutate()}
              >
                {passkey.isPending ? 'waiting for passkey…' : 'continue with a passkey'}
              </Button>
              {config.data?.googleEnabled ? (
                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  disabled={google.isPending}
                  onClick={() => google.mutate({ provider: 'google', callbackURL: `${window.location.origin}/app` })}
                >
                  continue with Google
                </Button>
              ) : null}
            </Stack>
            <Eyebrow variant="caption" component="p" sx={{ mt: '0.9rem' }}>
              <Link href="/forgot-password">forgot password?</Link>
            </Eyebrow>
            {magicLink.isSuccess ? (
              <Alert severity="success" sx={{ mt: '0.6rem' }}>
                Check your email for a sign-in link. In dev the send is captured by Mailpit — open its inbox to follow the link.
              </Alert>
            ) : null}
          </>
        )}
        {signIn.isError ? (
          <Alert sx={{ mt: '0.6rem' }}>
            {signIn.error instanceof ApiError ? signIn.error.appError.message : signIn.error.message}
          </Alert>
        ) : null}
        {passkey.isError ? (
          <Alert sx={{ mt: '0.6rem' }}>
            {passkey.error instanceof ApiError ? passkey.error.appError.message : passkey.error.message}
          </Alert>
        ) : null}
        {verifyTotp.isError ? (
          <Alert sx={{ mt: '0.6rem' }}>
            {verifyTotp.error instanceof ApiError ? verifyTotp.error.appError.message : verifyTotp.error.message}
          </Alert>
        ) : null}
        {verifyBackupCode.isError ? (
          <Alert sx={{ mt: '0.6rem' }}>
            {verifyBackupCode.error instanceof ApiError
              ? verifyBackupCode.error.appError.message
              : verifyBackupCode.error.message}
          </Alert>
        ) : null}
        <Divider sx={{ mt: '1.4rem', mb: '0.9rem' }} />
        <FinePrint variant="caption" component="p" sx={{ mb: '1em' }}>
          demo account: <DemoValue>demo@agentproofarch.dev</DemoValue> /{' '}
          <DemoValue>demo1234</DemoValue>
        </FinePrint>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: '1.2rem' }}>
          <BuildStamp />
        </Box>
      </Paper>
    </Box>
  );
};
