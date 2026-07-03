import { z } from 'zod';

import { roleSchema } from './identity.js';

export const tenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export type Tenant = z.infer<typeof tenantSchema>;

export const membershipSchema = z.object({
  tenant: tenantSchema,
  role: roleSchema,
});

export type Membership = z.infer<typeof membershipSchema>;

export const tenantDomainSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  domain: z.string(),
  kind: z.enum(['subdomain', 'custom']),
  verified: z.boolean(),
});

export type TenantDomain = z.infer<typeof tenantDomainSchema>;
