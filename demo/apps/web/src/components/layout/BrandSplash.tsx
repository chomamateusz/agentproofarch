import { useEffect, useState } from 'react';
import { Box, Stack } from '@mui/material';

import { BuildStamp } from '../ui/BuildStamp.js';
import { BootIndicator, Eyebrow, FinePrint, Wordmark } from '../../theme.js';

const SPLASH_WIDTH = '23rem';
const SLOW_START_MS = 4_000;
const SLOW_START_SLOT_HEIGHT = '1.5rem';

interface BrandSplashProps {
  host?: string;
}

/**
 * The boot skeleton: the only thing on screen until the session and tenant
 * bootstrap resolves, so no authenticated chrome can appear before the app
 * knows who is looking at it.
 */
export const BrandSplash = ({ host }: BrandSplashProps) => {
  const [slowStart, setSlowStart] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlowStart(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Box
      role="status"
      aria-busy="true"
      aria-label="opening agentproofarch"
      sx={{ minHeight: '100vh', display: 'grid', gridTemplateRows: '1fr auto', p: '1.5rem' }}
    >
      <Stack
        useFlexGap
        sx={{
          alignSelf: 'center',
          justifySelf: 'center',
          alignItems: 'center',
          width: '100%',
          maxWidth: SPLASH_WIDTH,
          rowGap: '0.9rem',
        }}
      >
        <Wordmark variant="h1">agentproofarch</Wordmark>
        {host === undefined ? null : (
          <Eyebrow variant="overline" component="p">
            tenant {host}
          </Eyebrow>
        )}
        <BootIndicator />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: SLOW_START_SLOT_HEIGHT,
          }}
        >
          {slowStart ? (
            <FinePrint variant="caption" component="p">
              warming up the server…
            </FinePrint>
          ) : null}
        </Box>
      </Stack>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <BuildStamp />
      </Box>
    </Box>
  );
};
