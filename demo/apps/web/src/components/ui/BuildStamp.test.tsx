import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BuildStamp } from './BuildStamp.js';

describe('BuildStamp', () => {
  it('renders the SemVer build identity', () => {
    render(<BuildStamp />);
    expect(screen.getByTestId('build-stamp')).toHaveTextContent(/^v\d+\.\d+\.\d+/);
  });
});
