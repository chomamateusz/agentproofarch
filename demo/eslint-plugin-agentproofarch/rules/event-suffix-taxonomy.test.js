import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { it } from 'vitest';

import rule from './event-suffix-taxonomy.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    parser: tseslint.parser,
  },
});

it('event-suffix-taxonomy', () => {
  ruleTester.run('event-suffix-taxonomy', rule, {
    valid: [
      "export type PersonalBoardEvent = { type: 'cardMoved' } | { type: 'cardSelected' } | { type: 'moveRequested' };",
      "export type CardEvent = { type: 'itemAdded' };",
      "export type ColumnEvent = 'columnOpened' | 'columnClosed';",
      [
        "type CardMovedEvent = { type: 'cardMoved' };",
        "type CardRemovedEvent = { type: 'cardRemoved' };",
        'export type BoardEvent = CardMovedEvent | CardRemovedEvent;',
      ].join('\n'),
      // Non-event exported unions and helper aliases are not the event contract.
      "export type Status = 'active' | 'archived';",
      "type CardId = string; export type Card = { id: CardId };",
      // Undeterminable discriminants are skipped, not falsely flagged.
      'export type DynamicEvent = { type: string };',
    ],
    invalid: [
      {
        code: "export type BoardEvent = { type: 'deleteCard' } | { type: 'cardMoved' };",
        errors: [{ messageId: 'badSuffix' }],
      },
      {
        code: "export type ColumnEvent = 'openColumn' | 'columnOpened';",
        errors: [{ messageId: 'badSuffix' }],
      },
      {
        code: [
          "type DeleteCardEvent = { type: 'deleteCard' };",
          'export type BoardEvent = DeleteCardEvent;',
        ].join('\n'),
        errors: [{ messageId: 'badSuffix' }],
      },
      {
        code: "export type BoardEvent = { type: 'foo' } | { type: 'bar' };",
        errors: [{ messageId: 'badSuffix' }, { messageId: 'badSuffix' }],
      },
    ],
  });
});
