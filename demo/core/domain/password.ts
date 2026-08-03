import { z } from 'zod';

/**
 * The account-password floor (owner decision 2026-08-02), following NIST SP
 * 800-63B-4 §3.1.1: length is the control that matters, and composition rules
 * ("one uppercase, one digit, one symbol") are explicitly discouraged because
 * they push people towards predictable mutations of a short secret. So this
 * number ships ALONE — there is deliberately no character-class rule anywhere in
 * the stack, and adding one is a policy change, not a hardening tweak.
 *
 * It lives in `core/domain` because both edges must agree on it: the web forms
 * parse with `passwordSchema`, and the auth adapter hands the same number to the
 * provider as `minPasswordLength`, so a client-side pass can never be a
 * server-side reject.
 */
export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`);
