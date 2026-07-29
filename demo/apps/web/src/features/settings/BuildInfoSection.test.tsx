import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { BUILD_VERSION } from '../../lib/build-info.js';
import { renderWithProviders } from '../../test/render.js';
import { server } from '../../test/server.js';
import { BuildInfoSection } from './BuildInfoSection.js';

describe('BuildInfoSection', () => {
  it('does not warn when browser and server builds match', async () => {
    renderWithProviders(<BuildInfoSection />);
    expect(await screen.findByText(`server version: ${BUILD_VERSION}`)).toBeInTheDocument();
    expect(screen.queryByTestId('stale-bundle-warning')).not.toBeInTheDocument();
  });

  it('warns when the server reports a different version', async () => {
    server.use(
      http.get('*/api/health', () =>
        HttpResponse.json({
          ok: true,
          data: { status: 'ok', version: '999.0.0', sha: 'unknown', database: 'up' },
        }),
      ),
    );
    renderWithProviders(<BuildInfoSection />);
    expect(await screen.findByTestId('stale-bundle-warning')).toBeInTheDocument();
  });

  it('does not warn while the health query is pending', () => {
    server.use(
      http.get('*/api/health', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<BuildInfoSection />);
    expect(screen.queryByTestId('stale-bundle-warning')).not.toBeInTheDocument();
  });
});
