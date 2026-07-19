export const COLUMNS = ['todo', 'in-dev', 'review', 'done'] as const;

export type ColumnId = (typeof COLUMNS)[number];

export interface Card {
  readonly id: string;
  readonly title: string;
  readonly column: ColumnId;
}

export interface BoardState {
  readonly cards: readonly Card[];
}

export type BoardEvent =
  | { readonly type: 'cardAdded'; readonly title: string; readonly column: ColumnId }
  | {
      readonly type: 'cardMoved';
      readonly cardId: string;
      readonly toColumn: ColumnId;
      readonly toIndex: number;
    }
  | { readonly type: 'cardRemoved'; readonly cardId: string }
  | { readonly type: 'undoRequested' };

export type GatewayResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export interface AddCardInput {
  readonly id: string;
  readonly title: string;
  readonly column: ColumnId;
  readonly index: number;
}

export interface MoveCardInput {
  readonly cardId: string;
  readonly toColumn: ColumnId;
  readonly toIndex: number;
}

export interface RemoveCardInput {
  readonly cardId: string;
}

export interface Gateway {
  addCard(input: AddCardInput): Promise<GatewayResult>;
  moveCard(input: MoveCardInput): Promise<GatewayResult>;
  removeCard(input: RemoveCardInput): Promise<GatewayResult>;
}

export interface BoardSelectors {
  listColumns(): readonly ColumnId[];
  cardsIn(column: ColumnId): readonly Card[];
  canUndo(): boolean;
}

export interface CoreApi {
  send(event: BoardEvent): void;
  getState(): BoardState;
  subscribe(listener: () => void): () => void;
  readonly selectors: BoardSelectors;
}

export interface CoreDeps {
  readonly gateway: Gateway;
  readonly generateId: () => string;
}

export type CoreFactory = (deps: CoreDeps) => CoreApi;

export interface TeamCard {
  readonly id: string;
  readonly title: string;
  readonly column: ColumnId;
  readonly visited: readonly ColumnId[];
}

export interface TeamBoardState {
  readonly cards: readonly TeamCard[];
}

export type WipLimits = Readonly<Partial<Record<ColumnId, number>>>;

export interface TeamMove {
  readonly cardId: string;
  readonly toColumn: ColumnId;
}

export type RuleId =
  | 'unknown-card'
  | 'done-only-from-review'
  | 'review-requires-in-dev'
  | 'wip-limit';

export type MoveVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly rule: RuleId };

export type MoveCheck = (
  state: TeamBoardState,
  move: TeamMove,
  limits: WipLimits,
) => MoveVerdict;
