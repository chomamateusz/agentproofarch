import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  InputBase,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { boardSelectors, send, subscribe, type BoardCard } from './core/index.js';

/**
 * Board view — talks ONLY to the island core: it reads through `boardSelectors`
 * and emits intents through `send`. It never imports api.ts, a descriptor or the
 * store, so the core can graduate rungs without touching this file. Card movement
 * is driven by accessible buttons (the primary, dependency-free mechanism).
 */
export const BoardPage = () => {
  const queryClient = useQueryClient();
  const cards = useQuery(boardSelectors.list);
  const overlay = useSyncExternalStore(subscribe, boardSelectors.snapshot);

  useEffect(() => {
    if (overlay.committedRev === 0) return;
    void queryClient.invalidateQueries(boardSelectors.invalidates());
  }, [overlay.committedRev, queryClient]);

  const board = boardSelectors.board(cards.data?.cards ?? []);
  const canUndo = boardSelectors.canUndo();
  const columns = boardSelectors.columns;

  return (
    <Container disableGutters sx={{ maxWidth: '60rem !important', px: '1.25rem', py: '3rem' }}>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'baseline', columnGap: '1rem', mb: '1.5rem' }}>
        <Typography variant="h1">Board</Typography>
        <Box sx={{ flex: 1 }} />
        {canUndo ? (
          <Button variant="outlined" onClick={() => send({ type: 'undoRequested' })}>
            undo
          </Button>
        ) : null}
        <Button
          variant="text"
          onClick={() => {
            send({ type: 'refreshRequested' });
            void queryClient.invalidateQueries(boardSelectors.invalidates());
          }}
        >
          refresh
        </Button>
      </Stack>

      {cards.isPending ? <Typography>loading…</Typography> : null}
      {cards.isError ? <Alert>{cards.error.message}</Alert> : null}

      <Stack direction="row" useFlexGap sx={{ gap: '1rem', alignItems: 'flex-start' }}>
        {columns.map((column, columnIndex) => {
          const leftColumn = columns[columnIndex - 1];
          const rightColumn = columns[columnIndex + 1];
          return (
            <Paper
              key={column}
              component="section"
              variant="outlined"
              aria-label={column}
              sx={{ flex: 1, p: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
            >
              <Typography variant="overline" component="h2">
                {column}
              </Typography>
              <Stack useFlexGap sx={{ gap: '0.5rem' }}>
                {board[column].map((card, cardIndex) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    columnName={column}
                    cardIndex={cardIndex}
                    columnCount={board[column].length}
                    leftColumn={leftColumn}
                    rightColumn={rightColumn}
                    leftColumnSize={leftColumn === undefined ? 0 : board[leftColumn].length}
                    rightColumnSize={rightColumn === undefined ? 0 : board[rightColumn].length}
                  />
                ))}
              </Stack>
              <AddCardForm column={column} />
            </Paper>
          );
        })}
      </Stack>
    </Container>
  );
};

const CardRow = ({
  card,
  columnName,
  cardIndex,
  columnCount,
  leftColumn,
  rightColumn,
  leftColumnSize,
  rightColumnSize,
}: {
  card: BoardCard;
  columnName: string;
  cardIndex: number;
  columnCount: number;
  leftColumn: string | undefined;
  rightColumn: string | undefined;
  leftColumnSize: number;
  rightColumnSize: number;
}) => (
  <Paper
    variant="outlined"
    elevation={0}
    aria-busy={card.pending}
    sx={{ p: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
  >
    <Typography>{card.title}</Typography>
    <Stack direction="row" useFlexGap sx={{ gap: '0.25rem' }}>
      <Button
        size="small"
        aria-label={`Move ${card.title} left`}
        disabled={leftColumn === undefined}
        onClick={() =>
          leftColumn === undefined
            ? undefined
            : send({
                type: 'cardMoved',
                cardId: card.id,
                fromColumn: columnName,
                fromIndex: cardIndex,
                toColumn: leftColumn,
                toIndex: leftColumnSize,
                toColumnSize: leftColumnSize,
              })
        }
      >
        ◀
      </Button>
      <Button
        size="small"
        aria-label={`Move ${card.title} up`}
        disabled={cardIndex === 0}
        onClick={() =>
          send({
            type: 'cardMoved',
            cardId: card.id,
            fromColumn: columnName,
            fromIndex: cardIndex,
            toColumn: columnName,
            toIndex: cardIndex - 1,
            toColumnSize: columnCount,
          })
        }
      >
        ▲
      </Button>
      <Button
        size="small"
        aria-label={`Move ${card.title} down`}
        disabled={cardIndex === columnCount - 1}
        onClick={() =>
          send({
            type: 'cardMoved',
            cardId: card.id,
            fromColumn: columnName,
            fromIndex: cardIndex,
            toColumn: columnName,
            toIndex: cardIndex + 1,
            toColumnSize: columnCount,
          })
        }
      >
        ▼
      </Button>
      <Button
        size="small"
        aria-label={`Move ${card.title} right`}
        disabled={rightColumn === undefined}
        onClick={() =>
          rightColumn === undefined
            ? undefined
            : send({
                type: 'cardMoved',
                cardId: card.id,
                fromColumn: columnName,
                fromIndex: cardIndex,
                toColumn: rightColumn,
                toIndex: rightColumnSize,
                toColumnSize: rightColumnSize,
              })
        }
      >
        ▶
      </Button>
    </Stack>
  </Paper>
);

const AddCardForm = ({ column }: { column: string }) => {
  const [title, setTitle] = useState('');
  return (
    <Paper
      component="form"
      variant="outlined"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (trimmed === '') return;
        send({ type: 'cardAdded', title: trimmed, column });
        setTitle('');
      }}
      sx={{ mt: 'auto', display: 'flex', gap: '0.4rem', p: '0.25rem' }}
    >
      <InputBase
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="new card…"
        inputProps={{ 'aria-label': `New card in ${column}` }}
        sx={{ flex: 1, '& input': { p: '0.4rem 0.6rem' } }}
      />
      <Button type="submit" size="small" variant="contained">
        add
      </Button>
    </Paper>
  );
};
