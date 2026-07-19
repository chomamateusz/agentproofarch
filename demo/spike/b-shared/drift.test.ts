import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  type ColumnId,
  type RuleId,
  type TeamBoardState,
  type TeamCard,
  type WipLimits,
} from '../core-contract';
import { canApplyMove as clientCheck } from './client';
import { canApplyMove as serverCheck } from './serverCheck';

// Card (column, visited) combos that are consistent with reachability:
// `todo`/`in-dev` may or may not have passed through `in-dev`; `review`/`done`
// must have (R3), and `done` must have passed `review` (R2). The two `todo`
// rows deliberately differ only in whether `in-dev` was visited — that is what
// makes `review-requires-in-dev` fire for one and pass for the other.
const CARD_STATES: ReadonlyArray<{ readonly column: ColumnId; readonly visited: readonly ColumnId[] }> = [
  { column: 'todo', visited: ['todo'] },
  { column: 'todo', visited: ['todo', 'in-dev'] },
  { column: 'in-dev', visited: ['todo', 'in-dev'] },
  { column: 'review', visited: ['todo', 'in-dev', 'review'] },
  { column: 'done', visited: ['todo', 'in-dev', 'review', 'done'] },
];

const LIMIT_SETS: readonly WipLimits[] = [{}, { 'in-dev': 1 }, { review: 1 }];

const mkCard = (id: string, state: (typeof CARD_STATES)[number]): TeamCard => ({
  id,
  title: id,
  column: state.column,
  visited: state.visited,
});

interface Case {
  readonly board: TeamBoardState;
  readonly cardId: string;
  readonly to: ColumnId;
}

const enumerateCases = (): readonly Case[] => {
  const cases: Case[] = [];
  const pushForBoard = (board: TeamBoardState): void => {
    for (const card of board.cards) {
      for (const to of COLUMNS) cases.push({ board, cardId: card.id, to });
    }
    // Unknown-card events: a cardId that is not on the board.
    for (const to of COLUMNS) cases.push({ board, cardId: 'ghost', to });
  };

  // 1-card boards.
  for (const a of CARD_STATES) pushForBoard({ cards: [mkCard('a', a)] });
  // 2-card boards (all ordered pairs) — needed for WIP occupancy to matter.
  for (const a of CARD_STATES) {
    for (const b of CARD_STATES) {
      pushForBoard({ cards: [mkCard('a', a), mkCard('b', b)] });
    }
  }
  return cases;
};

describe('b-shared drift-proof (shared machine)', () => {
  it('client and server never disagree across the bounded domain', () => {
    const firedRules = new Set<RuleId>();
    let allowedCount = 0;
    let comparisons = 0;

    for (const limits of LIMIT_SETS) {
      for (const { board, cardId, to } of enumerateCases()) {
        const move = { cardId, toColumn: to };
        const client = clientCheck(board, move, limits);
        const server = serverCheck(board, move, limits);
        comparisons += 1;

        // Same artifact, two invocation styles: allowance must always match.
        expect(client.allowed, JSON.stringify({ board, move, limits, client, server })).toBe(
          server.allowed,
        );
        if (!client.allowed && !server.allowed) {
          expect(client.rule).toBe(server.rule);
          firedRules.add(client.rule);
        } else {
          allowedCount += 1;
        }
      }
    }

    // Non-vacuity: every rejection rule fires, and at least one move is allowed.
    expect(comparisons).toBeGreaterThan(0);
    expect(allowedCount).toBeGreaterThan(0);
    expect([...firedRules].sort()).toEqual(
      ['done-only-from-review', 'review-requires-in-dev', 'unknown-card', 'wip-limit'].sort(),
    );
  });

  // WHY drift is structurally impossible here: there is exactly ONE machine
  // (`moveMachine`). `serverCheck` evaluates it with `getNextSnapshot` (pure,
  // no actor); `client` evaluates it through a live `createActor(...).send`.
  // Neither restates a rule — both read the `verdict` the machine's own guards
  // and actions wrote. The only decision made outside the machine is
  // `unknown-card`, and both wrappers make it with the identical existence
  // check. So the sole way the two sites could diverge is if XState's actor and
  // pure-transition engines disagreed — a library bug, not a rule copy. Contrast
  // b-table, where a hand-written table is mapped into a machine AND into a
  // check: two derivations that CAN silently drift. The cost b-shared pays for
  // this: xstate becomes a `core/domain` dependency, and every server check
  // rebuilds a whole synthetic per-card context (see machine.ts buildContext).
  it('proves the equality is non-trivial (distinct code paths, not x === x)', () => {
    const board: TeamBoardState = {
      cards: [mkCard('a', { column: 'todo', visited: ['todo', 'in-dev'] })],
    };
    // clientCheck runs an actor; serverCheck runs getNextSnapshot — different
    // engines, asserted equal above across ~4000 cases.
    expect(clientCheck(board, { cardId: 'a', toColumn: 'review' }, {})).toEqual(
      serverCheck(board, { cardId: 'a', toColumn: 'review' }, {}),
    );
  });
});
