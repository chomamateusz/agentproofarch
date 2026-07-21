import type { DevMailbox, EmailMessage, EmailPort } from '#core/server/index.js';

export type DevEmailPort = EmailPort & DevMailbox;

/**
 * Dev/CI transport (US-026 AC: no real delivery). It logs every message and
 * keeps the last action `link` per recipient in memory so the CLI, smoke and
 * e2e can retrieve a magic link without an inbox. Selected by `EMAIL_TRANSPORT`
 * in the composition root, exactly like `DOMAIN_PROVISIONER`.
 */
export const createDevEmailPort = (
  log: (line: string) => void = (line) => console.log(line),
): DevEmailPort => {
  const links = new Map<string, string>();
  return {
    sendMail: async (message: EmailMessage) => {
      if (message.link !== undefined) links.set(message.to.toLowerCase(), message.link);
      log(
        `[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}` +
          (message.link !== undefined ? ` link=${message.link}` : ''),
      );
    },
    lastLinkFor: (email) => links.get(email.toLowerCase()) ?? null,
  };
};
