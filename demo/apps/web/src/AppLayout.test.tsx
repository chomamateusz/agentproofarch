import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { renderWithProviders } from './test/render.js';
import { server } from './test/server.js';
import { AppLayout } from './AppLayout.js';
import { MembersPage } from './features/members/MembersPage.js';

const meAcme = {
  userId: 'u1',
  email: 'demo@agentproofarch.dev',
  name: 'Demo',
  emailVerified: true,
  tenant: { id: 't1', slug: 'acme', name: 'Acme Inc', staffRole: 'owner', memberId: null },
};
const acme = { tenant: { id: 't1', slug: 'acme', name: 'Acme Inc' }, staffRole: 'owner' };
const globex = { tenant: { id: 't2', slug: 'globex', name: 'Globex Inc' }, staffRole: 'admin' };

const renderApp = async (initial = '/app') => {
  const rootRoute = createRootRoute({});
  const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: () => <p>login page</p> });
  const layout = createRoute({ getParentRoute: () => rootRoute, path: '/app', component: AppLayout });
  const index = createRoute({ getParentRoute: () => layout, path: '/', component: () => <p>ledger content</p> });
  const settings = createRoute({ getParentRoute: () => layout, path: 'settings', component: () => <p>settings page</p> });
  const board = createRoute({ getParentRoute: () => layout, path: 'board', component: () => <p>board page</p> });
  const teamBoard = createRoute({ getParentRoute: () => layout, path: 'team-board', component: () => <p>team page</p> });
  const members = createRoute({ getParentRoute: () => layout, path: 'members', component: () => <p>members page</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      loginRoute,
      layout.addChildren([index, settings, board, teamBoard, members]),
    ]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  return renderWithProviders(<RouterProvider router={router} />);
};

describe('AppLayout', () => {
  it('renders the boot splash and no navigation while the session is unresolved', async () => {
    server.use(
      http.get('/api/me', async () => {
        await delay('infinite');
        return HttpResponse.json({ ok: true, data: meAcme });
      }),
    );

    await renderApp();

    expect(await screen.findByRole('status', { name: 'opening agentproofarch' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ledger' })).not.toBeInTheDocument();
    expect(screen.queryByText('ledger content')).not.toBeInTheDocument();
  });

  it('renders the active child and a tenant switcher listing my tenants', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json({ ok: true, data: meAcme })),
      http.get('/api/tenants', () =>
        HttpResponse.json({ ok: true, data: { tenants: [acme, globex], canCreateTenant: true } }),
      ),
    );

    await renderApp();

    expect(await screen.findByText('ledger content')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Switch tenant' }));
    expect(await screen.findByText('Globex Inc')).toBeInTheDocument();
  });

  it('shows the create-tenant onboarding when the caller has no tenant on this host', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json({ ok: true, data: { ...meAcme, tenant: null } })),
      http.get('/api/tenants', () =>
        HttpResponse.json({ ok: true, data: { tenants: [], canCreateTenant: true } }),
      ),
    );

    await renderApp();

    expect(await screen.findByLabelText('New tenant name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'create tenant' })).toBeInTheDocument();
    expect(screen.queryByText('ledger content')).not.toBeInTheDocument();
  });

  it('does not offer tenant creation when the server authorization decision denies it', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json({ ok: true, data: { ...meAcme, tenant: null } })),
      http.get('/api/tenants', () =>
        HttpResponse.json({ ok: true, data: { tenants: [], canCreateTenant: false } }),
      ),
    );

    await renderApp();

    expect(await screen.findByText('no tenant is available on this host')).toBeInTheDocument();
    expect(screen.queryByLabelText('New tenant name')).not.toBeInTheDocument();
  });

  it('treats a forbidden tenant host as onboarding, not an error', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ ok: false, error: { code: 'forbidden', message: 'no access' } }, { status: 403 }),
      ),
      http.get('/api/tenants', () =>
        HttpResponse.json({ ok: true, data: { tenants: [acme], canCreateTenant: true } }),
      ),
    );

    await renderApp();

    expect(await screen.findByLabelText('New tenant name')).toBeInTheDocument();
  });

  it('onboarding lists my existing tenants as switch links', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json({ ok: true, data: { ...meAcme, tenant: null } })),
      http.get('/api/tenants', () =>
        HttpResponse.json({ ok: true, data: { tenants: [globex], canCreateTenant: true } }),
      ),
    );

    await renderApp();

    expect(await screen.findByRole('link', { name: /Globex Inc/ })).toBeInTheDocument();
  });

  it('surfaces an unexpected error rather than onboarding when me fails internally', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ ok: false, error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );

    await renderApp();

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByLabelText('New tenant name')).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor to /login', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ ok: false, error: { code: 'unauthorized', message: 'login' } }, { status: 401 }),
      ),
    );

    await renderApp();

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('ledger content')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });
});

interface TestMember {
  id: string;
  tenantId: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  tags: string[];
  marketingConsents: never[];
  externalCustomerIds: never[];
  createdAt: string;
  lastSeenAt: string | null;
}

const member: TestMember = {
  id: 'member-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  email: 'alice@example.com',
  displayName: 'Alice Example',
  tags: ['vip'],
  marketingConsents: [],
  externalCustomerIds: [],
  createdAt: '2026-07-28T00:00:00.000Z',
  lastSeenAt: null,
};

describe('MembersPage states and mutations', () => {
  it('renders the loading state while the roster request is pending', () => {
    server.use(
      http.get('/api/members', async () => {
        await delay('infinite');
        return HttpResponse.json({ ok: true, data: { members: [] } });
      }),
    );

    renderWithProviders(<MembersPage />);

    expect(screen.getByText('reading the roster…')).toBeInTheDocument();
  });

  it('renders roster errors', async () => {
    server.use(
      http.get('/api/members', () =>
        HttpResponse.json(
          { ok: false, error: { code: 'internal', message: 'Roster unavailable' } },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<MembersPage />);

    expect(await screen.findByText('Roster unavailable')).toBeInTheDocument();
  });

  it('renders empty and populated rosters', async () => {
    let members = [member];
    server.use(
      http.get('/api/members', () => HttpResponse.json({ ok: true, data: { members } })),
    );
    const populated = renderWithProviders(<MembersPage />);

    expect(await screen.findByText('Alice Example')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('vip')).toBeInTheDocument();

    populated.unmount();
    members = [];
    renderWithProviders(<MembersPage />);

    expect(await screen.findByText('— no members yet —')).toBeInTheDocument();
  });

  it('clears the form and invalidates the roster after a successful ensure', async () => {
    const members = [member];
    let listCalls = 0;
    server.use(
      http.get('/api/members', () => {
        listCalls += 1;
        return HttpResponse.json({ ok: true, data: { members } });
      }),
      http.post('/api/members', async ({ request }) => {
        const input = z
          .object({ email: z.string(), displayName: z.string().optional() })
          .parse(await request.json());
        const created = {
          ...member,
          id: 'member-2',
          userId: null,
          email: input.email,
          displayName: input.displayName ?? null,
          tags: [],
        };
        members.push(created);
        return HttpResponse.json({ ok: true, data: { member: created, created: true } });
      }),
    );
    renderWithProviders(<MembersPage />);
    const email = await screen.findByLabelText('Member email');
    const name = screen.getByLabelText('Member display name');

    await userEvent.type(email, 'new@example.com');
    await userEvent.type(name, 'New Member');
    await userEvent.click(screen.getByRole('button', { name: 'ensure ↵' }));

    expect(await screen.findByText('New Member')).toBeInTheDocument();
    expect(email).toHaveValue('');
    expect(name).toHaveValue('');
    expect(listCalls).toBe(2);
  });

  it('retains the form, shows the error, and invalidates after a failed ensure', async () => {
    let listCalls = 0;
    server.use(
      http.get('/api/members', () => {
        listCalls += 1;
        return HttpResponse.json({ ok: true, data: { members: [] } });
      }),
      http.post('/api/members', () =>
        HttpResponse.json(
          { ok: false, error: { code: 'validation', message: 'Email is rejected' } },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<MembersPage />);
    const email = await screen.findByLabelText('Member email');
    const name = screen.getByLabelText('Member display name');

    await userEvent.type(email, 'bad@example.com');
    await userEvent.type(name, 'Still Here');
    await userEvent.click(screen.getByRole('button', { name: 'ensure ↵' }));

    expect(await screen.findByText('Email is rejected')).toBeInTheDocument();
    expect(email).toHaveValue('bad@example.com');
    expect(name).toHaveValue('Still Here');
    expect(listCalls).toBe(2);
  });
});
