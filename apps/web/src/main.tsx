import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { LoginPage } from './pages/LoginPage.js';
import { TodosPage } from './pages/TodosPage.js';
import { ThemeModeProvider } from './theme-mode.js';
import { ThemeSwitcher } from './ThemeSwitcher.js';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <ThemeSwitcher />
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: TodosPage });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, loginRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ThemeModeProvider>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeModeProvider>
  </StrictMode>,
);
