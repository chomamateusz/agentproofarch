import { z } from 'zod';

import {
  cardListQuerySchema,
  cardMoveSchema,
  cardSchema,
  memberExportSchema,
  memberRefSchema,
  memberSchema,
  memberUpdateSchema,
  membershipSchema,
  newCardSchema,
  newMemberSchema,
  newTodoSchema,
  grantAdminInputSchema,
  revokeAdminInputSchema,
  slugSchema,
  staffMemberSchema,
  staffRoleSchema,
  tenantSchema,
  todoSchema,
} from '#core/domain/index.js';

/**
 * Single source of truth for the HTTP API shared by server and all clients.
 * Every route is described by its method, path and zod schemas; the server
 * implements them, `core/client` consumes them. Neither side hand-writes URLs
 * or response types anywhere else.
 */

/**
 * Deploy attestation carried by every health response: the release version and
 * the build's commit SHA. `smoke:remote` compares the SHA against the deploy
 * event's SHA to prove it verified the deployment it thinks it did.
 */
export const attestationSchema = z.object({
  version: z.string(),
  sha: z.string(),
});

/**
 * Liveness (`/api/health/live`): the process is up and can serve. No database
 * touch — always 200 as long as the process answers. Attestation only.
 */
export const healthLiveOutputSchema = attestationSchema.extend({
  status: z.literal('ok'),
});

/**
 * Readiness (`/api/health/ready`): the process AND its database are ready. A
 * successful body always reports `database: 'up'`; a down database returns the
 * `unavailable` error envelope (HTTP 503), never a 200.
 */
export const healthReadyOutputSchema = attestationSchema.extend({
  status: z.literal('ok'),
  database: z.literal('up'),
});

/**
 * Compat `/api/health`: 200 with the database status inline (readiness info
 * without the non-200 gate). New callers should use `/live` for liveness or
 * `/ready` for a readiness gate that goes non-200 when the database is down.
 */
export const healthOutputSchema = attestationSchema.extend({
  status: z.literal('ok'),
  database: z.enum(['up', 'down']),
});

export const meOutputSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  tenant: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      staffRole: staffRoleSchema.nullable(),
      memberId: z.string().nullable(),
    })
    .nullable(),
});

export const tenantListOutputSchema = z.object({
  tenants: z.array(membershipSchema),
});

export const todoListOutputSchema = z.object({
  todos: z.array(todoSchema),
});

export const tenantCreateInputSchema = z.object({
  slug: slugSchema,
  name: z.string(),
});

export type TenantCreateInput = z.input<typeof tenantCreateInputSchema>;

export const tenantCreateOutputSchema = z.object({
  tenant: tenantSchema,
});

export const todoCreateInputSchema = newTodoSchema;

export const todoCreateOutputSchema = z.object({
  todo: todoSchema,
});

/**
 * The card list is board-scoped via an optional `?board=` query param (absent =
 * personal). Additive: an old client that sends no query still reads its
 * personal board.
 */
export const cardsListQuerySchema = cardListQuerySchema;

export const cardsListOutputSchema = z.object({
  cards: z.array(cardSchema),
});

export const cardCreateInputSchema = newCardSchema;

export const cardCreateOutputSchema = z.object({
  card: cardSchema,
});

export const cardMoveInputSchema = cardMoveSchema;

export const cardMoveOutputSchema = z.object({
  card: cardSchema,
});

export const memberListOutputSchema = z.object({
  members: z.array(memberSchema),
});

export const memberEnsureInputSchema = newMemberSchema;

export type MemberEnsureInput = z.input<typeof memberEnsureInputSchema>;

export const memberEnsureOutputSchema = z.object({
  member: memberSchema,
  created: z.boolean(),
});

export const memberUpdateInputSchema = memberUpdateSchema;

export type MemberUpdateInput = z.input<typeof memberUpdateInputSchema>;

export const memberUpdateOutputSchema = z.object({
  member: memberSchema,
});

export const memberRemoveInputSchema = memberRefSchema;

export type MemberRemoveInput = z.input<typeof memberRemoveInputSchema>;

export const memberRemoveOutputSchema = z.object({
  memberId: z.string(),
  deleted: z.object({ members: z.number().int() }),
});

/** The export id travels as a `?id=` query param (a read, so a GET, not a body). */
export const memberExportQuerySchema = memberRefSchema;

export const memberExportOutputSchema = memberExportSchema;

export const staffListOutputSchema = z.object({
  staff: z.array(staffMemberSchema),
});

export const staffGrantInputSchema = grantAdminInputSchema;

export type StaffGrantInput = z.input<typeof staffGrantInputSchema>;

export const staffGrantOutputSchema = z.object({
  staff: staffMemberSchema,
  granted: z.boolean(),
});

export const staffRevokeInputSchema = revokeAdminInputSchema;

export type StaffRevokeInput = z.input<typeof staffRevokeInputSchema>;

export const staffRevokeOutputSchema = z.object({
  userId: z.string(),
  revoked: z.number().int(),
});

/**
 * Every route carries its HTTP method so clients can discriminate reads from
 * writes at the type level (CQRS partition). Safe GETs are queries; unsafe
 * verbs are commands. `core/client` brands its call surface from these methods.
 */
export const API_ROUTES = {
  health: { method: 'GET', path: '/api/health' },
  healthLive: { method: 'GET', path: '/api/health/live' },
  healthReady: { method: 'GET', path: '/api/health/ready' },
  me: { method: 'GET', path: '/api/me' },
  tenants: { method: 'GET', path: '/api/tenants' },
  tenantsCreate: { method: 'POST', path: '/api/tenants' },
  todos: { method: 'GET', path: '/api/todos' },
  todosCreate: { method: 'POST', path: '/api/todos' },
  cards: { method: 'GET', path: '/api/cards' },
  cardsCreate: { method: 'POST', path: '/api/cards' },
  cardsMove: { method: 'POST', path: '/api/cards/move' },
  members: { method: 'GET', path: '/api/members' },
  membersEnsure: { method: 'POST', path: '/api/members' },
  membersUpdate: { method: 'POST', path: '/api/members/update' },
  membersRemove: { method: 'POST', path: '/api/members/remove' },
  membersExport: { method: 'GET', path: '/api/members/export' },
  staff: { method: 'GET', path: '/api/staff' },
  staffGrant: { method: 'POST', path: '/api/staff' },
  staffRevoke: { method: 'POST', path: '/api/staff/revoke' },
} as const;

export type HttpMethod = (typeof API_ROUTES)[keyof typeof API_ROUTES]['method'];
export type ReadMethod = Extract<HttpMethod, 'GET'>;
export type WriteMethod = Exclude<HttpMethod, ReadMethod>;

export const API_PATHS = {
  health: API_ROUTES.health.path,
  healthLive: API_ROUTES.healthLive.path,
  healthReady: API_ROUTES.healthReady.path,
  me: API_ROUTES.me.path,
  tenants: API_ROUTES.tenants.path,
  todos: API_ROUTES.todos.path,
  cards: API_ROUTES.cards.path,
  cardsMove: API_ROUTES.cardsMove.path,
  members: API_ROUTES.members.path,
  membersUpdate: API_ROUTES.membersUpdate.path,
  membersRemove: API_ROUTES.membersRemove.path,
  membersExport: API_ROUTES.membersExport.path,
  staff: API_ROUTES.staff.path,
  staffRevoke: API_ROUTES.staffRevoke.path,
} as const;

/** Header used by non-browser clients (CLI, tests) to select the tenant. */
export const TENANT_HEADER = 'x-tenant';
