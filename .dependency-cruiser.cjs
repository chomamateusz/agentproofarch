/** Second, independent enforcement of PRD §3.2 — including vendor lock bans. */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'core-domain-depends-on-nothing',
      severity: 'error',
      from: { path: '^core/domain' },
      to: { path: '^(core/(contract|server|client)|adapters|apps)' },
    },
    {
      name: 'core-server-pure',
      severity: 'error',
      from: { path: '^core/server' },
      to: { path: '^(core/(contract|client)|adapters|apps)' },
    },
    {
      name: 'core-contract-only-domain',
      severity: 'error',
      from: { path: '^core/contract' },
      to: { path: '^(core/(server|client)|adapters|apps)' },
    },
    {
      name: 'core-client-never-server-side',
      severity: 'error',
      from: { path: '^core/client' },
      to: { path: '^(core/server|adapters|apps)' },
    },
    {
      name: 'adapters-never-import-apps',
      severity: 'error',
      from: { path: '^adapters' },
      to: { path: '^apps' },
    },
    {
      name: 'web-never-server-side',
      severity: 'error',
      from: { path: '^apps/web' },
      to: { path: '^(core/server|adapters/db|adapters/domain-provisioning|apps/(server|cli))' },
    },
    {
      name: 'cli-is-a-pure-api-client',
      severity: 'error',
      from: { path: '^apps/cli' },
      to: { path: '^(core/server|adapters|apps/(server|web))' },
    },
    {
      name: 'vercel-and-neon-only-in-adapters',
      severity: 'error',
      comment: 'Zero platform lock-in in core and apps (PRD: Goals)',
      from: { pathNot: '^(adapters|apps/server/src/entry\\.vercel\\.ts)' },
      to: { path: 'node_modules/(@vercel|@neondatabase)' },
    },
    {
      name: 'no-frameworks-in-core',
      severity: 'error',
      from: { path: '^core' },
      to: { path: 'node_modules/(hono|react|react-dom|drizzle-orm|better-auth|pg|commander)(/|$)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
