import { Box, Button, Paper, Typography } from '@mui/material';

import { ApiError } from '@core/client/index.js';

const headingFor = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'Something went wrong';
  switch (error.appError.code) {
    case 'unauthorized':
      return 'Your session has ended';
    case 'forbidden':
      return 'You do not have access';
    case 'not_found':
      return 'Nothing here';
    case 'tenant_not_found':
      return 'Unknown tenant';
    case 'validation':
      return 'That request was invalid';
    case 'conflict':
      return 'A conflicting change happened';
    case 'internal':
      return 'Something went wrong';
  }
};

const detailFor = (error: unknown): string =>
  error instanceof ApiError ? error.appError.message : 'An unexpected error interrupted the page.';

/** Taxonomy-aware fallback for the root error boundary, with a reload action. */
export const renderRootErrorFallback = (error: unknown) => (
  <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: '1.5rem' }}>
    <Paper
      variant="outlined"
      role="alert"
      sx={{ width: '100%', maxWidth: '23rem', px: '1.8rem', pt: '2rem', pb: '1.6rem' }}
    >
      <Typography variant="h1" sx={{ mb: '0.4rem' }}>
        {headingFor(error)}
      </Typography>
      <Typography variant="body2" sx={{ mb: '1.4rem' }}>
        {detailFor(error)}
      </Typography>
      <Button variant="contained" fullWidth onClick={() => window.location.reload()}>
        reload
      </Button>
    </Paper>
  </Box>
);
