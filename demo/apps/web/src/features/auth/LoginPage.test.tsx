import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/render.js';
import { LoginPage } from './LoginPage.js';

describe('LoginPage', () => {
  it('renders labeled login inputs', async () => {
    const rootRoute = createRootRoute({ component: LoginPage });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/login'] }),
    });

    await router.load();
    renderWithProviders(<RouterProvider router={router} />);

    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sign in' })).toBeInTheDocument();
  });
});
