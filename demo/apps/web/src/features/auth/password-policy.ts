import { z } from 'zod';

/**
 * The one password rule the app enforces client-side. Registration and the reset
 * form share it so a reset can never mint a password registration would refuse.
 */
export const passwordPolicy = z.string().min(8, 'Use at least 8 characters');
