import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@core/client/index.js';
import { unauthorized } from '@core/domain/index.js';

import { renderRootErrorFallback } from './RootErrorFallback.js';

describe('renderRootErrorFallback', () => {
  it('maps an ApiError to its taxonomy heading and message', () => {
    render(renderRootErrorFallback(new ApiError(unauthorized('Your session expired'))));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Your session has ended');
    expect(alert).toHaveTextContent('Your session expired');
  });

  it('falls back to a generic heading for a non-ApiError throw', () => {
    render(renderRootErrorFallback(new Error('boom')));

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
