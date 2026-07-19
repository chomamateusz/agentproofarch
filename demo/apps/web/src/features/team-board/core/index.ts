import { TEAM_BOARD_COLUMNS, TEAM_WIP_LIMITS, type Card, type TeamColumn } from '#core/domain/index.js';

import { actions, teamBoardGateway } from '../../../api.js';

import { type TeamBoardEvent } from './events.js';
import {
  columnsOf,
  effectiveBoard,
  occupancyOf,
  pendingIds,
  verdictOf,
  wipLimitOf,
  type TeamColumns,
} from './selectors.js';
import { createTeamBoardStore, type Rejection, type TeamOverlayState } from './store.js';

export type { TeamBoardEvent } from './events.js';
export type { TeamCard, TeamColumns } from './selectors.js';
export type { TeamBoardGateway, GatewayResult, Rejection } from './store.js';
export { evaluateTeamMove } from './machine.js';

/**
 * Public seam of the team-board island core: `send` in, selectors out. A view
 * imports ONLY from this module — never the store, a machine, a descriptor or
 * api.ts directly — so the rung-3 machinery behind the seam stays invisible.
 *
 * RUNG 3 (statechart). `send` forwards each intent to the UI store (core/store.ts),
 * which consults the table-derived oracle (core/machine.ts) before dispatching a
 * move to the gateway. The server read (`list`) stays the cache truth; `board`
 * merges it with the store's optimistic overlay; `verdict` runs that same board
 * through the oracle so the view can disable illegal moves. The view's calls never
 * change across rungs.
 */
const store = createTeamBoardStore({
  gateway: teamBoardGateway,
  generateId: () => crypto.randomUUID(),
});

export const send = (event: TeamBoardEvent): void => {
  store.send(event);
};

export const subscribe = (listener: () => void): (() => void) => store.subscribe(listener);

export const teamBoardSelectors = {
  list: actions.teamBoard,
  invalidates: actions.boardInvalidates,
  columns: TEAM_BOARD_COLUMNS,
  limits: TEAM_WIP_LIMITS,
  snapshot: (): TeamOverlayState => store.getState(),
  board: (serverCards: readonly Card[]): readonly Card[] =>
    effectiveBoard(store.getState(), serverCards),
  grouped: (board: readonly Card[]): TeamColumns => columnsOf(board, pendingIds(store.getState())),
  verdict: (board: readonly Card[], cardId: string, toColumn: TeamColumn) =>
    verdictOf(board, cardId, toColumn),
  occupancy: (board: readonly Card[], column: TeamColumn): number => occupancyOf(board, column),
  wipLimit: (column: TeamColumn): number | undefined => wipLimitOf(column),
  lastRejection: (): Rejection | null => store.getState().lastRejection,
};
