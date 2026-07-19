import { PERSONAL_BOARD_COLUMNS, type Card } from '#core/domain/index.js';

import { actions, boardGateway } from '../../../api.js';

import { type BoardEvent } from './events.js';
import { boardOf, canUndoOf, type BoardColumns } from './selectors.js';
import { createBoardStore, type BoardOverlayState } from './store.js';

export type { BoardEvent } from './events.js';
export type { BoardCard, BoardColumns } from './selectors.js';
export type { BoardGateway, GatewayResult } from './store.js';

/**
 * Public seam of the board island core: `send` in, selectors out. A view imports
 * ONLY from this module — never the store, a descriptor or api.ts directly — so
 * the machine behind the seam stays invisible and swappable.
 *
 * RUNG 2 (island store). `send` forwards each event to the @xstate/store store
 * (core/store.ts). The server read (`list`) stays the cache truth; `board` merges
 * it with the store's optimistic overlay; `invalidates` lets the view refetch the
 * truth once a persist commits. The view's calls never change across rungs.
 */
const store = createBoardStore({
  gateway: boardGateway,
  generateId: () => crypto.randomUUID(),
});

export const send = (event: BoardEvent): void => {
  store.send(event);
};

export const subscribe = (listener: () => void): (() => void) => store.subscribe(listener);

export const boardSelectors = {
  list: actions.board,
  invalidates: actions.boardInvalidates,
  columns: PERSONAL_BOARD_COLUMNS,
  snapshot: (): BoardOverlayState => store.getState(),
  board: (serverCards: readonly Card[]): BoardColumns => boardOf(store.getState(), serverCards),
  canUndo: (): boolean => canUndoOf(store.getState()),
};
