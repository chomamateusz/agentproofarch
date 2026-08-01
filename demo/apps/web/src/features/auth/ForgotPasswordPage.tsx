import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Link,
  OutlinedInput,
  Paper,
  Stack,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { ApiError } from '#core/client/index.js';

import { actions } from '../../api.js';
import { Eyebrow, FinePrint, Wordmark } from '../../theme.js';

const emailSchema = z.string().trim().pipe(z.email('Enter a valid email'));

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);

  const requestReset = useMutation(actions.requestPasswordReset);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Enter a valid email');
      return;
    }
    setEmailError(undefined);
    requestReset.mutate({
      email: parsed.data,
      redirectTo: `${window.location.origin}/reset-password`,
    });
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: '1.5rem' }}>
      <Paper
        variant="outlined"
        component="form"
        onSubmit={submit}
        noValidate
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
          reset password · tenant {window.location.hostname}
        </Eyebrow>
        <Stack useFlexGap spacing="1rem">
          <FormControl fullWidth error={Boolean(emailError)}>
            <FormLabel htmlFor="forgot-email">email</FormLabel>
            <OutlinedInput
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            {emailError ? <FormHelperText>{emailError}</FormHelperText> : null}
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={requestReset.isPending}
            sx={{ mt: '0.4rem' }}
          >
            {requestReset.isPending ? 'sending link…' : 'email me a reset link'}
          </Button>
        </Stack>
        {requestReset.isSuccess ? (
          <Alert severity="success" sx={{ mt: '0.6rem' }}>
            If that address has an account, a reset link is on its way. In dev the send is captured
            by Mailpit — open its inbox to follow the link.
          </Alert>
        ) : null}
        {requestReset.isError ? (
          <Alert sx={{ mt: '0.6rem' }}>
            {requestReset.error instanceof ApiError
              ? requestReset.error.appError.message
              : requestReset.error.message}
          </Alert>
        ) : null}
        <Divider sx={{ mt: '1.4rem', mb: '0.9rem' }} />
        <FinePrint variant="caption" component="p">
          the link expires in an hour and can be used once.
        </FinePrint>
        <Eyebrow variant="caption" component="p" sx={{ mt: '0.9rem' }}>
          remembered it? <Link href="/login">sign in</Link>
        </Eyebrow>
      </Paper>
    </Box>
  );
};
