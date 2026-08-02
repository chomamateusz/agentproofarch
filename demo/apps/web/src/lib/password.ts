import { z } from 'zod';

export const passwordSchema = z.string().min(8, 'Use at least 8 characters');
