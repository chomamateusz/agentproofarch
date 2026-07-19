import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { BoardPage } from './BoardPage.js';

interface ServerCard {
  id: string;
  tenantId: string;
  title: string;
  column: string;
  position: number;
  createdAt: string;
}

const makeCard = (id: string, title: string, column: string, position: number): ServerCard => ({
  id,
  tenantId: 't1',
  title,
  column,
  position,
  createdAt: '2026-07-11T00:00:00.000Z',
});

const addBodySchema = z.object({ title: z.string(), column: z.string() });
const moveBodySchema = z.object({ cardId: z.string(), toColumn: z.string(), toIndex: z.number() });

const cardsBackend = (initial: readonly ServerCard[]) => {
  let cards: ServerCard[] = initial.map((card) => ({ ...card }));
  let nextId = 100;
  return [
    http.get('/api/cards', () => HttpResponse.json({ ok: true, data: { cards } })),
    http.post('/api/cards', async ({ request }) => {
      const body = addBodySchema.parse(await request.json());
      const position = cards.filter((card) => card.column === body.column).length;
      const created = makeCard(`s-${(nextId += 1)}`, body.title, body.column, position);
      cards = [...cards, created];
      return HttpResponse.json({ ok: true, data: { card: created } });
    }),
    http.post('/api/cards/move', async ({ request }) => {
      const body = moveBodySchema.parse(await request.json());
      const moved = cards.find((card) => card.id === body.cardId);
      if (moved) {
        moved.column = body.toColumn;
        moved.position = cards.filter((card) => card.column === body.toColumn).length;
      }
      return HttpResponse.json({ ok: true, data: { card: moved } });
    }),
  ];
};

const renderBoard = async () => {
  const rootRoute = createRootRoute({ component: BoardPage });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  return renderWithProviders(<RouterProvider router={router} />);
};

describe('BoardPage', () => {
  it('optimistically adds a card and reconciles with the server list', async () => {
    server.use(...cardsBackend([makeCard('a', 'Alpha', 'todo', 0)]));

    await renderBoard();

    const todo = await screen.findByRole('region', { name: 'todo' });
    expect(await within(todo).findByText('Alpha')).toBeInTheDocument();

    await userEvent.type(within(todo).getByLabelText('New card in todo'), 'Beta');
    await userEvent.click(within(todo).getByRole('button', { name: 'add' }));

    expect(await within(todo).findByText('Beta')).toBeInTheDocument();
  });

  it('moves a card to the next column through the accessible button', async () => {
    server.use(...cardsBackend([makeCard('a', 'Alpha', 'todo', 0), makeCard('c', 'Gamma', 'doing', 0)]));

    await renderBoard();

    const todo = await screen.findByRole('region', { name: 'todo' });
    expect(await within(todo).findByText('Alpha')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Move Alpha right' }));

    const doing = screen.getByRole('region', { name: 'doing' });
    expect(await within(doing).findByText('Alpha')).toBeInTheDocument();
  });
});
