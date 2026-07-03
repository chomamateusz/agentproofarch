import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'admin', 'member']);

export type Role = z.infer<typeof roleSchema>;

export interface Identity {
  userId: string;
  email: string;
  name: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  role: Role | null;
}
