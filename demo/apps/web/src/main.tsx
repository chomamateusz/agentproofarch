import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { ThemeSwitcher } from './components/ui/ThemeSwitcher.js';
import { queryClient } from './query-client.js';
import { RefreshSnackbar } from './RefreshSnackbar.js';
import { renderRootErrorFallback } from './RootErrorFallback.js';
import { LoginRoute } from './routes/login.js';
import { TodosRoute } from './routes/todos.js';
import { ThemeModeProvider } from './theme-mode.js';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <ThemeSwitcher />
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TodosRoute,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute,
});

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, loginRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ThemeModeProvider>
      <CssBaseline />
      <ErrorBoundary fallback={renderRootErrorFallback}>
        <QueryClientProvider client={queryClient}>
          <RefreshSnackbar />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeModeProvider>
  </StrictMode>,
);
