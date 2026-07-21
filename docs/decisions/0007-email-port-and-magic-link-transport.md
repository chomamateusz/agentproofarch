# ADR-0007: EmailPort shape and the magic-link transport

Date: 2026-07-21 · Status: accepted (owner-approved)

## Context

US-026 (passwordless member provisioning + magic-link sign-in) is the first
feature that must send mail, so it is the trigger that turns the roadmap's
deferred `EmailPort` (architecture §Storage and email ports) into a built port.
The roadmap had sketched `send({ to, subject, html, text })` with a Resend
adapter on both targets and a `console` dev adapter.

Two forces reshaped that sketch:

1. **Owner delivery decision.** The universal default transport is **SMTP**, not
   Resend — it must work with Amazon SES SMTP credentials out of the box, and be
   trivially swappable behind the port ("niech sobie ktoś to podmieni"). Real SES
   creds arrive later via env; dev/CI must do **no** real delivery.
2. **Dev must surface the link.** US-026's acceptance criterion is explicit: in
   dev the magic-link URL is returned/logged, no email sent. A test/CLI/e2e run
   needs to retrieve that specific link deterministically.

## Decision

1. **Port shape: `sendMail({ to, subject, text, html?, link? })`.** Kept minimal
   and generic. The magic link is ONE consumer of `sendMail`, not the port's
   shape — the magic-link email is composed in `create-auth.ts` and passes the
   raw URL as the optional `link` field. `link` is a general transactional-mail
   concept (a primary call-to-action URL), not a dev hack: the smtp transport
   embeds it in the body and ignores the field; the dev transport captures it.
   No `tenantId` — one verified sender domain (`EMAIL_FROM`).

2. **Two adapters in `adapters/email/`, selected by `EMAIL_TRANSPORT`** in the
   composition root, exactly like `DOMAIN_PROVISIONER`:
   - `smtp` — nodemailer over any RFC SMTP relay. Amazon SES SMTP creds work
     unchanged (`SMTP_HOST=email-smtp.<region>.amazonaws.com`, the SES SMTP
     user/pass, port 587, STARTTLS). Swap the relay behind the port for any other
     provider; the app never learns which.
   - `dev` (default) — no delivery. Logs the message and keeps the last action
     `link` per recipient in memory (`DevMailbox`).
   nodemailer was chosen over a hand-rolled SMTP client: it is well-maintained,
   handles STARTTLS/auth/encoding, and SES-SMTP compatibility is a first-class
   use case. It is contained to `adapters/email` by a depcruise rule.

3. **Dev link retrieval via a mounted-only-in-dev route.** When (and only when)
   the composition selects the dev transport, the server mounts
   `GET /api/dev/magic-link?email=…`, backed by the `DevMailbox`. It cannot exist
   on a deploy that configured a real relay. This is the surface the CLI
   (`login-link --follow`), the smoke gate, and the e2e spec consume.

4. **Member↔user binding on first sign-in (US-026).** A member provisioned by
   `ensureMember` has a null `userId` until they first authenticate. Binding
   happens in `resolveIdentity`: when no member is yet bound to the account, the
   (tenant, email) member row is claimed (`bindMemberOnSignIn`). It is tenant-
   aware (resolution knows the tenant), idempotent (a bound account short-circuits
   before the bind read), and safe (a member already bound to a different account
   is never re-bound or granted). It carries no capability — a system step gated
   by an established session, like tenant resolution itself.

## Consequences

- Better Auth's magic-link plugin's `sendMagicLink` callback delegates to
  `EmailPort.sendMail` — one transport, one from-address policy, as the roadmap
  called for. Social (Google) and TOTP 2FA plugins ride the same auth adapter.
- Passkeys (`@better-auth/passkey`) are deferred: the package pins a
  `better-call` whose optional `zod@^4` peer conflicts with this tree's pinned
  `zod@^3`. Wiring passkeys requires a zod-4 migration first; the seam is not
  faked.
- The originally-sketched Resend/`console` split is superseded. Future non-auth
  transactional mail (order receipt, export-ready notice) reuses `sendMail` from
  a use-case; per-tenant branded senders remain a when-triggered extension.
