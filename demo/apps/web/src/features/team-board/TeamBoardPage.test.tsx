import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { TeamBoardPage } from './TeamBoardPage.js';

interface ServerCard {
  id: string;
  tenantId: string;
  title: string;
  board: string;
  column: string;
  position: number;
  visited: string[];
  createdAt: string;
}

const makeCard = (id: string, title: string, column: string, visited: string[]): ServerCard => ({
  id,
  tenantId: 't1',
  title,
  board: 'team',
  column,
  position: 0,
  visited,
  createdAt: '2026-07-19T00:00:00.000Z',
});

const addBodySchema = z.object({ title: z.string(), column: z.string() });
const moveBodySchema = z.object({ cardId: z.string(), toColumn: z.string(), toIndex: z.number() });

const cardsBackend = (initial: readonly ServerCard[]) => {
  let cards: ServerCard[] = initial.map((card) => ({ ...card, visited: [...card.visited] }));
  let nextId = 100;
  return [
    http.get('/api/cards', () => HttpResponse.json({ ok: true, data: { cards } })),
    http.post('/api/cards', async ({ request }) => {
      const body = addBodySchema.parse(await request.json());
      const created = makeCard(`s-${(nextId += 1)}`, body.title, body.column, [body.column]);
      cards = [...cards, created];
      return HttpResponse.json({ ok: true, data: { card: created } });
    }),
    http.post('/api/cards/move', async ({ request }) => {
      const body = moveBodySchema.parse(await request.json());
      const moved = cards.find((card) => card.id === body.cardId);
      if (moved) {
        moved.column = body.toColumn;
        if (!moved.visited.includes(body.toColumn)) moved.visited.push(body.toColumn);
      }
      return HttpResponse.json({ ok: true, data: { card: moved } });
    }),
  ];
};

const renderBoard = async () => {
  const rootRoute = createRootRoute({ component: TeamBoardPage });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  return renderWithProviders(<RouterProvider router={router} />);
};

describe('TeamBoardPage', () => {
  it('moves a card to the next column through an allowed accessible button', async () => {
    server.use(...cardsBackend([makeCard('a', 'Alpha', 'in-dev', ['todo', 'in-dev'])]));

    await renderBoard();

    const inDev = await screen.findByRole('region', { name: 'in-dev' });
    expect(await within(inDev).findByText('Alpha')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Move Alpha to review' }));

    const review = screen.getByRole('region', { name: 'review' });
    expect(await within(review).findByText('Alpha')).toBeInTheDocument();
  });

  it('disables an illegal move and names the rejecting rule as accessible text', async () => {
    // review is full at its WIP limit of 2, so moving Alpha (in-dev) into it is
    // blocked by wip-limit — the button must be disabled and say so.
    server.use(
      ...cardsBackend([
        makeCard('r1', 'R1', 'review', ['todo', 'in-dev', 'review']),
        makeCard('r2', 'R2', 'review', ['todo', 'in-dev', 'review']),
        makeCard('a', 'Alpha', 'in-dev', ['todo', 'in-dev']),
      ]),
    );

    await renderBoard();

    const inDev = await screen.findByRole('region', { name: 'in-dev' });
    expect(await within(inDev).findByText('Alpha')).toBeInTheDocument();

    const blocked = screen.getByRole('button', { name: 'Move Alpha to review (blocked: wip-limit)' });
    expect(blocked).toBeDisabled();

    // The WIP counter makes the limit visible.
    const review = screen.getByRole('region', { name: 'review' });
    expect(within(review).getByText('2/2')).toBeInTheDocument();
  });

  it('optimistically adds a card to a column', async () => {
    server.use(...cardsBackend([]));

    await renderBoard();

    const todo = await screen.findByRole('region', { name: 'todo' });
    await userEvent.type(within(todo).getByLabelText('New card in todo'), 'Fresh');
    await userEvent.click(within(todo).getByRole('button', { name: 'add' }));

    expect(await within(todo).findByText('Fresh')).toBeInTheDocument();
  });
});
