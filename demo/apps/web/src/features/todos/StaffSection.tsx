import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputBase,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { actions } from '../../api.js';

/**
 * The owner-only staff area on the ledger (FR-8): the tenant's owner/admin roster
 * plus grant-by-email and revoke. Rendered only when the caller is an owner —
 * `staff:grant`/`staff:revoke` are owner-only, so an admin sees the roster nowhere
 * here (they use the CLI's staff-readable `list` if they need it). It talks to the
 * bound `actions` gateway like the rest of this page; no island machinery.
 */
export const StaffSection = () => {
  const queryClient = useQueryClient();
  const staff = useQuery(actions.staff);
  const [email, setEmail] = useState('');

  const invalidate = () => queryClient.invalidateQueries(actions.staffInvalidates());

  const grant = useMutation({
    ...actions.grantStaff,
    onSuccess: () => setEmail(''),
    onSettled: invalidate,
  });
  const revoke = useMutation({ ...actions.revokeStaff, onSettled: invalidate });

  return (
    <Box component="section" sx={{ mt: '48px', animation: 'settle 0.5s 0.24s ease-out both' }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', columnGap: '1rem', mb: '24px' }}>
        <Typography variant="h2" component="h2">
          Staff
        </Typography>
        <Typography variant="overline">owners grant &amp; revoke admin access</Typography>
      </Stack>

      {staff.isPending ? (
        <Typography variant="h2" component="p" sx={{ py: 2 }}>
          reading the roster…
        </Typography>
      ) : null}
      {staff.isError ? <Alert>{staff.error.message}</Alert> : null}
      {staff.data ? (
        <List disablePadding>
          {staff.data.staff.map((member) => (
            <ListItem key={member.id} disableGutters sx={{ px: '0.2rem', gap: '0.6rem' }}>
              <ListItemText
                primary={member.name || member.email}
                secondary={member.email}
                slotProps={{ secondary: { variant: 'caption' } }}
              />
              <Chip size="small" variant="outlined" label={member.role} />
              <Button
                variant="text"
                size="small"
                disabled={member.role === 'owner' || revoke.isPending}
                onClick={() => revoke.mutate({ userId: member.userId })}
              >
                revoke
              </Button>
            </ListItem>
          ))}
        </List>
      ) : null}

      <Paper
        component="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (email.trim()) grant.mutate({ email });
        }}
        sx={{ mt: '24px', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', p: '0.4rem' }}
      >
        <InputBase
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="grant admin to registered email…"
          inputProps={{ 'aria-label': 'Grant admin email', type: 'email' }}
          sx={{ flex: '2 1 12rem', '& input': { p: '11px 0.9rem' } }}
        />
        <Button type="submit" variant="contained" disabled={grant.isPending}>
          {grant.isPending ? 'granting…' : 'grant ↵'}
        </Button>
      </Paper>
      {grant.isError ? <Alert sx={{ mt: '0.6rem' }}>{grant.error.message}</Alert> : null}
      {revoke.isError ? <Alert sx={{ mt: '0.6rem' }}>{revoke.error.message}</Alert> : null}
    </Box>
  );
};
