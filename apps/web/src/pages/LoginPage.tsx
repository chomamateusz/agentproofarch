import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper
        variant="outlined"
        component="form"
        onSubmit={(event: React.FormEvent) => void submit(event)}
        sx={{ width: '100%', maxWidth: '23rem', px: 3.5, pt: 4, pb: 3, animation: 'settle 0.45s ease-out both' }}
      >
        <Typography variant="h1">agentproofarch</Typography>
        <Typography variant="overline" component="p" sx={{ mb: 3 }}>
          sign in · tenant {window.location.hostname}
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <TextField
            label="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <Button type="submit" variant="contained" fullWidth disabled={pending}>
            {pending ? 'signing in…' : 'sign in'}
          </Button>
        </Stack>
        {error ? <Alert sx={{ mt: 1.5 }}>{error}</Alert> : null}
        <Divider sx={{ mt: 3, mb: 1.5 }} />
        <Typography variant="caption" component="p">
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
