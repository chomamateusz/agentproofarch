import { Alert, Link, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { actions } from '../../api.js';
import {
  BUILD_SHA,
  BUILD_VERSION,
  CHANGELOG_URL,
  DOCS_URL,
  isStaleBundle,
} from '../../lib/build-info.js';

export const BuildInfoSection = () => {
  const health = useQuery(actions.health);
  const stale = health.data !== undefined && isStaleBundle(health.data);

  return (
    <Paper variant="outlined" sx={{ p: '1.25rem', mt: '1.5rem' }}>
      <Typography variant="overline">build</Typography>
      <Stack useFlexGap spacing="0.3rem" sx={{ mt: '0.4rem' }}>
        <Typography variant="body2">browser version: {BUILD_VERSION}</Typography>
        <Typography variant="body2">browser sha: {BUILD_SHA}</Typography>
        {health.data === undefined ? null : (
          <>
            <Typography variant="body2">server version: {health.data.version}</Typography>
            <Typography variant="body2">server sha: {health.data.sha}</Typography>
          </>
        )}
        <Stack direction="row" useFlexGap sx={{ columnGap: '1.2rem', mt: '0.5rem' }}>
          <Link href={CHANGELOG_URL} variant="body2">
            changelog
          </Link>
          <Link href={DOCS_URL} variant="body2">
            docs
          </Link>
        </Stack>
      </Stack>
      {stale ? (
        <Alert severity="warning" data-testid="stale-bundle-warning" sx={{ mt: '1rem' }}>
          This tab is running an older build than the server. Reload to use the current build.
        </Alert>
      ) : null}
    </Paper>
  );
};
