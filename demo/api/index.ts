import { handle } from 'hono/vercel';

import { buildApp } from '../apps/server/src/app.js';
import { createDeps } from '../apps/server/src/composition.js';
import { loadEnv } from '../apps/server/src/env.js';
import { startServerObservability } from '../apps/server/src/observability.js';

const flush = startServerObservability();
const app = buildApp(createDeps(loadEnv()));
const handler = handle(app);

// No resident process to run a shutdown hook: drain the tracer per invocation
// (awaited before the response returns) so batched spans survive the freeze.
const withFlush: typeof handler = async (...args) => {
  try {
    return await handler(...args);
  } finally {
    if (flush) await flush();
  }
};

export default withFlush;
