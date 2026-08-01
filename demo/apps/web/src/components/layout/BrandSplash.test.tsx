import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrandSplash } from './BrandSplash.js';

describe('BrandSplash', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the wordmark, the tenant host and the version stamp, and no app chrome', () => {
    render(<BrandSplash host="acme.localhost" />);

    const region = screen.getByRole('status', { name: 'opening agentproofarch' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'agentproofarch' })).toBeInTheDocument();
    expect(screen.getByText('tenant acme.localhost')).toBeInTheDocument();
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('omits the tenant line when the host is not known', () => {
    render(<BrandSplash />);

    expect(screen.getByRole('heading', { name: 'agentproofarch' })).toBeInTheDocument();
    expect(screen.queryByText(/^tenant /)).not.toBeInTheDocument();
  });

  it('admits a slow start only once the threshold passes', () => {
    vi.useFakeTimers();
    render(<BrandSplash host="acme.localhost" />);

    expect(screen.queryByText('warming up the server…')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_999);
    });
    expect(screen.queryByText('warming up the server…')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('warming up the server…')).toBeInTheDocument();
  });
});
