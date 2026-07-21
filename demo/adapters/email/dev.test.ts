import { describe, expect, it } from 'vitest';

import { createDevEmailPort } from './dev.js';

describe('createDevEmailPort', () => {
  it('captures the last action link per recipient and logs without delivering', async () => {
    const lines: string[] = [];
    const port = createDevEmailPort((line) => lines.push(line));

    await port.sendMail({
      to: 'Mag@Example.com',
      subject: 'Your link',
      text: 'Sign in: https://app/verify?token=1',
      link: 'https://app/verify?token=1',
    });

    expect(port.lastLinkFor('mag@example.com')).toBe('https://app/verify?token=1');
    // Case-insensitive retrieval mirrors email semantics.
    expect(port.lastLinkFor('MAG@EXAMPLE.COM')).toBe('https://app/verify?token=1');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('https://app/verify?token=1');
  });

  it('returns null for a recipient with no captured link', async () => {
    const port = createDevEmailPort(() => {});
    expect(port.lastLinkFor('nobody@example.com')).toBeNull();
  });

  it('keeps only the most recent link per recipient', async () => {
    const port = createDevEmailPort(() => {});
    await port.sendMail({ to: 'a@example.com', subject: 's', text: 't', link: 'first' });
    await port.sendMail({ to: 'a@example.com', subject: 's', text: 't', link: 'second' });
    expect(port.lastLinkFor('a@example.com')).toBe('second');
  });

  it('does not capture a link for a plain message with no link field', async () => {
    const port = createDevEmailPort(() => {});
    await port.sendMail({ to: 'a@example.com', subject: 's', text: 't' });
    expect(port.lastLinkFor('a@example.com')).toBeNull();
  });
});
