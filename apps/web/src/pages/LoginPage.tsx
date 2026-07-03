import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  OutlinedInput,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { authClient } from '../api.js';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn({ email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await queryClient.invalidateQueries();
    await navigate({ to: '/' });
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: '1.5rem' }}>
      <Paper
        variant="outlined"
        component="form"
        onSubmit={(event: React.FormEvent) => void submit(event)}
        sx={{
          width: '100%',
          maxWidth: '23rem',
          px: '1.8rem',
          pt: '2rem',
          pb: '1.6rem',
          animation: 'settle 0.45s ease-out both',
        }}
      >
        <Typography variant="h1" sx={{ fontSize: '1.6rem', letterSpacing: 'normal', mb: '0.2rem' }}>
          agentproofarch
        </Typography>
        <Typography variant="overline" component="p" sx={{ fontSize: '0.78rem', mb: '1.6rem' }}>
          sign in · tenant {window.location.hostname}
        </Typography>
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
          <Button type="submit" variant="contained" fullWidth disabled={pending} sx={{ mt: '0.4rem' }}>
            {pending ? 'signing in…' : 'sign in'}
          </Button>
        </Stack>
        {error ? <Alert sx={{ mt: '0.6rem' }}>{error}</Alert> : null}
        <Divider sx={{ mt: '1.4rem', mb: '0.9rem' }} />
        <Typography variant="caption" component="p" sx={{ fontSize: '0.75rem', mb: '1em' }}>
          demo account:{' '}
          <Box component="code" sx={{ color: 'primary.dark' }}>
            demo@agentproofarch.dev
          </Box>{' '}
          /{' '}
          <Box component="code" sx={{ color: 'primary.dark' }}>
            demo1234
          </Box>
        </Typography>
      </Paper>
    </Box>
  );
};
