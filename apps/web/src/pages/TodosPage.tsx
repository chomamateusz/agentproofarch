import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  InputBase,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  ThemeProvider,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { meQuery, orgsQuery, todosQuery, unwrap, ApiError } from '@core/client/index.js';

import { api, authClient, tenantHue, tenantUrl } from '../api.js';
import { createAppTheme } from '../theme.js';

export const TodosPage = () => {
  const navigate = useNavigate();
  const me = useQuery(meQuery(api));

  const unauthorized =
    me.error instanceof ApiError && me.error.appError.code === 'unauthorized';

  useEffect(() => {
    if (unauthorized) void navigate({ to: '/login' });
  }, [unauthorized, navigate]);

  if (me.isPending) {
    return (
      <Container sx={{ maxWidth: '44rem' }}>
        <Typography variant="h2" component="p" sx={{ py: 6 }}>
          opening the logbook…
        </Typography>
      </Container>
    );
  }
  if (unauthorized) return null;
  if (me.isError) {
    return (
      <Container sx={{ maxWidth: '44rem' }}>
        <Alert sx={{ mt: 4 }}>{me.error.message}</Alert>
      </Container>
    );
  }

  return me.data.tenant ? (
    <TenantLedger tenant={me.data.tenant} email={me.data.email} />
  ) : (
    <PickTenant />
  );
};

const PickTenant = () => {
  const orgs = useQuery(orgsQuery(api));
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: '23rem', px: 3.5, py: 4 }}>
        <Typography variant="h1">Choose a tenant</Typography>
        <Typography variant="overline" component="p">
          every tenant lives on its own domain
        </Typography>
        {orgs.isPending ? (
          <Typography variant="h2" component="p" sx={{ py: 2 }}>
            loading…
          </Typography>
        ) : null}
        <List sx={{ mt: 1 }}>
          {orgs.data?.organizations.map((m) => (
            <ListItem key={m.tenant.id} disablePadding divider>
              <ListItemButton component="a" href={tenantUrl(m.tenant.slug)}>
                <ListItemText
                  primary={m.tenant.name}
                  secondary={tenantUrl(m.tenant.slug)}
                  slotProps={{ primary: { sx: { fontWeight: 700 } }, secondary: { variant: 'caption' } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

const TenantLedger = ({
  tenant,
  email,
}: {
  tenant: { id: string; slug: string; name: string; role: string };
  email: string;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const todos = useQuery(todosQuery(api));
  const orgs = useQuery(orgsQuery(api));
  const [title, setTitle] = useState('');
  const theme = useMemo(() => createAppTheme(tenantHue(tenant.slug)), [tenant.slug]);

  const addTodo = useMutation({
    mutationFn: async (newTitle: string) => unwrap(await api.addTodo({ title: newTitle })),
    onSuccess: async () => {
      setTitle('');
      await queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  const signOut = async () => {
    await authClient.signOut();
    await queryClient.invalidateQueries();
    await navigate({ to: '/login' });
  };

  return (
    <ThemeProvider theme={theme}>
      <Container disableGutters sx={{ maxWidth: '44rem !important', px: 2.5, pb: 12 }}>
        <Box
          component="header"
          sx={{ borderBottom: 3, borderColor: 'text.secondary', borderBottomStyle: 'double', pt: 4.5, pb: 1.5, animation: 'settle 0.5s ease-out both' }}
        >
          <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "baseline" }}>
            <Box
              aria-hidden
              sx={{
                width: '0.85rem',
                height: '0.85rem',
                bgcolor: 'primary.main',
                boxShadow: (t) => `0.3rem 0.3rem 0 ${alpha(t.palette.primary.main, 0.09)}`,
                transform: 'translateY(1px)',
              }}
            />
            <Typography variant="h1">{tenant.name}</Typography>
            <Typography variant="overline">{window.location.hostname}</Typography>
            <Box sx={{ flex: 1 }} />
            <Chip variant="outlined" label={tenant.role} />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", mt: 1 }}>
            <Typography variant="caption" sx={{ letterSpacing: '0.04em', wordBreak: 'break-all' }}>
              {email}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button variant="text" onClick={() => void signOut()}>
              sign out
            </Button>
          </Stack>
        </Box>

        <Stack
          component="nav"
          direction="row"
          useFlexGap
          spacing={2.5}
          sx={{
            flexWrap: 'wrap',
            alignItems: 'baseline',
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            animation: 'settle 0.5s 0.08s ease-out both',
          }}
        >
          <Typography variant="overline">your tenants →</Typography>
          {orgs.data?.organizations.map((m) => {
            const active = m.tenant.id === tenant.id;
            return (
              <Link
                key={m.tenant.id}
                href={tenantUrl(m.tenant.slug)}
                variant="body2"
                aria-current={active}
                sx={
                  active
                    ? {
                        color: 'primary.dark',
                        fontWeight: 700,
                        borderBottom: 2,
                        borderColor: 'primary.main',
                        borderBottomStyle: 'solid',
                      }
                    : undefined
                }
              >
                {m.tenant.slug}
              </Link>
            );
          })}
        </Stack>

        <Box component="section" sx={{ mt: 5, animation: 'settle 0.5s 0.16s ease-out both' }}>
          <Typography variant="h2" component="h2" sx={{ mb: 1.5 }}>
            Entries in this tenant's ledger
          </Typography>
          {todos.isPending ? (
            <Typography variant="h2" component="p" sx={{ py: 2 }}>
              reading entries…
            </Typography>
          ) : null}
          {todos.isError ? <Alert>{todos.error.message}</Alert> : null}
          {todos.data ? (
            todos.data.todos.length === 0 ? (
              <Typography variant="h2" component="p" sx={{ py: 3 }}>
                — no entries yet; this tenant's page is blank —
              </Typography>
            ) : (
              <List disablePadding>
                {todos.data.todos.map((todo, index) => (
                  <ListItem key={todo.id} disableGutters sx={{ px: 0.5 }}>
                    <Typography variant="body2" sx={{ color: 'primary.dark', minWidth: '1.7rem' }}>
                      {String(index + 1).padStart(2, '0')}
                    </Typography>
                    <ListItemText primary={todo.title} sx={{ m: 0 }} />
                    <Typography
                      variant="caption"
                      component="time"
                      dateTime={todo.createdAt}
                      sx={{ ml: 'auto', whiteSpace: 'nowrap', pl: 2 }}
                    >
                      {new Date(todo.createdAt).toLocaleDateString()}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            )
          ) : null}

          <Paper
            variant="outlined"
            component="form"
            onSubmit={(event: React.FormEvent) => {
              event.preventDefault();
              if (title.trim()) addTodo.mutate(title);
            }}
            sx={{ mt: 3, display: 'flex' }}
          >
            <InputBase
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`new entry for ${tenant.name}…`}
              inputProps={{ 'aria-label': 'New todo title' }}
              sx={{ flex: 1, px: 1.5, py: 0.5 }}
            />
            <Button type="submit" variant="contained" disabled={addTodo.isPending}>
              {addTodo.isPending ? 'adding…' : 'add ↵'}
            </Button>
          </Paper>
          {addTodo.isError ? <Alert sx={{ mt: 1 }}>{addTodo.error.message}</Alert> : null}
        </Box>
      </Container>
    </ThemeProvider>
  );
};
