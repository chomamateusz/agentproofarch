import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH, passwordSchema } from './password.js';

describe('passwordSchema', () => {
  it('pins the floor at twelve characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });

  it('rejects anything shorter with a length-only message', () => {
    const result = passwordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH - 1));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Use at least 12 characters');
  });

  it('accepts a long all-lowercase passphrase — length is the only rule', () => {
    expect(passwordSchema.safeParse('correct horse battery staple').success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH)).success).toBe(true);
  });

  it('imposes no composition rule on a long secret', () => {
    for (const candidate of ['aaaaaaaaaaaa', '111111111111', '............']) {
      expect(passwordSchema.safeParse(candidate).success).toBe(true);
    }
  });
});
