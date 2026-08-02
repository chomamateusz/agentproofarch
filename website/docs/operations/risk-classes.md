---
title: Deployment risk classes
sidebar_label: 🛡️ Deployment risk classes
description: Classify an application by outage harm before choosing its repository, hosting, release wall, and agent autonomy.
---

# Deployment risk classes 🛡️ \{#deployment-risk-classes}

*Read this before creating the repository or hosting project.*

Classify the application with one question:

> **Who gets hurt, and how much, when production is down?**

The answer determines whether production may be disposable, whether an agent may
deploy autonomously, and whether safety lives in a release wall or in recovery.
The names **SIL-0** through **SIL-3** nod to Safety Integrity Levels from IEC
61508; here they are deployment-risk shorthand, not a functional-safety rating
or certification.

:::caution[Plan facts expire]
Platform plans, feature availability, pricing, and terms of service change. The
platform facts below are current **as of 2026-08**; verify the current repository
and hosting terms before creating either project.
:::

## Summary 📋 \{#summary}

| Class | Who is hurt by downtime? | Repository and release wall | Production and agent autonomy |
|---|---|---|---|
| **SIL-0 — open-source demo** | Maintainers and viewers; embarrassment only | Public repository; as of 2026-08, free-plan rulesets are available for enforcement | A non-commercial free hosting tier is acceptable under its current terms; production may break |
| **SIL-1 — commercial, locally built** | Buyers waiting for a downloadable release; there is no hosted production service | Public repository plus tagged releases | **No hosting project**; any hosted licensing or payment service is classified separately |
| **SIL-2 — downtime-tolerant back office** | Internal staff and workflows; interruption is inconvenient but accepted | Private repository; as of 2026-08, a paid repository plan is required for an enforced approval wall | Self-host or use paid managed hosting; the agent may deploy autonomously, but only behind the recoverability trio |
| **SIL-3 — commercial hosted production** | Paying users and the business; downtime can cost revenue, trust, or contractual performance | Public repository or, as of 2026-08, paid-plan private repository with an enforced promotion wall | Paid hosting in a separate commercial team; the agent has no hosting identity or deployment token |

The class belongs to a deployed system, not a company or product name. A local
desktop product can be SIL-1 while its licensing service is SIL-3. Reclassify
when the answer to the outage question changes.

## SIL-0 — open-source demo 🧪 \{#sil-0}

SIL-0 is a public, non-commercial demonstration. If production is unavailable,
nobody loses access to a paid service or an internal business process. The harm
is a broken link, a failed walkthrough, or embarrassment.

Use a **public repository**. As of 2026-08, GitHub documents repository rulesets
and protected branches as available on free plans for public repositories, while
private-repository enforcement requires a paid plan
([rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).
A free hosting tier is suitable when the deployment is genuinely personal or
non-commercial and its current terms permit that use. Production is allowed to
break because the consequence is limited to the demo.

This repository is the living SIL-0 example: its deployed demo is disposable,
while its code and documentation demonstrate controls that higher-risk systems
can adopt.

## SIL-1 — commercial but locally built 📦 \{#sil-1}

SIL-1 is a commercial product sold once and built or run locally by the buyer.
There is no hosted production application to keep available. Publish the source
in a **public repository** and distribute versioned releases. Use the
[release-cut and tagging procedure](./versioning-and-releases.md#the-release-procedure)
defined by [ADR-0014](../decisions/0014-release-versioning-and-version-surfaces.md).

Create **no hosting project at all**. A website that merely documents or
distributes the product is not its production runtime, but its own availability
still needs an explicit classification.

A later payment, entitlement, activation, update, or licensing backend is a
**separate hosted system**. Classify it independently — normally SIL-2 if a
rehearsed outage is acceptable, and SIL-3 when paying users depend on it to use
what they bought. Calling the desktop product SIL-1 never downgrades that
backend.

## SIL-2 — downtime-tolerant internal back office 🧰 \{#sil-2}

SIL-2 is an internal business application whose users can tolerate downtime.
The repository is normally **private**. The key plan boundary is explicit: as
of 2026-08, GitHub documents rulesets and protected branches for private
repositories on paid plans, not GitHub Free. On a private repository under the
free plan, a configured merge or approval convention is therefore **not an
enforced wall**.

That can be an accepted SIL-2 trade. The agent may merge or push the production
deployment trigger autonomously. Safety moves from prevention to
**recoverability**, with three hard requirements:

1. **Automatically tested backups.** Follow the repository's
   [`dr-acceptance` pattern](./backup-dr.md#ci-acceptance-scope): exercise backup,
   integrity verification, offsite copy, restore, and corruption refusal rather
   than trusting a successful upload.
2. **A rehearsed restore in under 30 minutes.** Adapt and repeatedly time the
   [restore drill](./backup-dr.md#the-restore-drill). This repository's package
   states a
   [30–60 minute RTO target](./backup-dr.md#rpo-and-rto--as-stated-with-the-conditions)
   that only holds on an already-prepared standby host, and it instructs
   measuring the number in a drill rather than trusting the table. The
   30-minute figure is therefore something an application proves by timing its
   own restore, not something the package grants it.
3. **Production secrets outside the agent's reach.** The deployment trigger may
   be autonomous; database credentials, encryption keys, host access, and
   hosting sessions may not be present on an agent-driven machine.

Host SIL-2 with the repository's [Docker self-host target](./self-host.md) and
[backup/DR package](./backup-dr.md), or on a paid managed tier. Do not assume a
free hosting tier permits business use: as of 2026-08, the host this repository
deploys to documents its free Hobby plan as non-commercial
([Hobby plan](https://vercel.com/docs/plans/hobby)), and free tiers elsewhere
carry comparable restrictions. Terms differ per provider and change. A back
office run for a business is commercial use even when only staff can reach it,
so SIL-2 means a paid tier or self-hosting.

## SIL-3 — commercial hosted production 💼 \{#sil-3}

SIL-3 serves paying users. An outage can stop customer work, interrupt revenue,
and damage trust or contractual performance. Use the full posture demonstrated
by this repository:

- a **public repository** or — as of 2026-08 — a **private repository on a paid
  plan**, with the [CI wall](./ci-gates.md#the-required-set) enforced rather than
  advisory;
- a promotion-only production branch requiring approval from an independent
  human owner — the agent identity cannot supply the approval that releases its
  own work — following the [promotion topology](./environments.md#the-wall);
- release cuts and immutable tags under
  [ADR-0014](../decisions/0014-release-versioning-and-version-surfaces.md) and the
  [versioning procedure](./versioning-and-releases.md#the-release-procedure);
- [post-deploy smoke with SHA attestation](./health-and-attestation.md#the-attestation-gate),
  proving that the deployment tested is the reviewed commit; and
- a paid hosting tier on a **separate commercial team or account boundary**.
  The agent holds no hosting identity, CLI session, or deployment token;
  deployment happens through the host's Git integration after the protected Git
  push or merge. The existing
  [two-identity model](../guides/agent-workflow.md#the-identity-split) and
  [production credential controls](./environments.md#the-five-standing-controls)
  show the separation.

As of 2026-08, hosting team models, plan names, and prices vary and may change;
the invariant is not a vendor label. It is a commercial blast-radius boundary
with no agent-reachable production credential.

## Classify before the first deploy ✅ \{#classify-before-the-first-deploy}

Six rules, applied before the repository or the hosting project exists:

1. **Classify first.** Write down who is hurt by downtime, the maximum
   acceptable outage, and the resulting class. Every choice below follows from
   that answer, and every one of them is expensive to reverse later.
2. **Never put commercial use on a free hosting tier.** Verify the terms on the
   day the project is created, then pay for hosting or self-host anything a
   business depends on.
3. **Treat private plus free as no enforced merge wall.** Accept that only for
   SIL-2, and only together with automatically tested backups, a rehearsed
   restore under 30 minutes, and production secrets outside the agent's reach.
4. **Keep agent-reachable secrets out of SIL-2 and SIL-3.** An autonomous Git
   action never requires autonomous access to the runtime, the database,
   encryption keys, or the hosting account.
5. **Release SIL-3 only through approval-walled promotion.** The independent
   human approval precedes the production build, and release cuts, tags,
   required gates, and post-deploy SHA smoke travel with it.
6. **Classify SIL-1 payment and licensing infrastructure separately.** A
   locally built product does not make its hosted entitlement, activation, or
   payment service low risk; that service is normally SIL-2 or SIL-3.

:::caution[Honest caveats]
- **Nothing here enforces a class.** No gate reads a SIL label. The class
  decides which accounts, plans, and branches you create on day one; the walls
  and drills you create from it are what enforce anything afterwards.
- **SIL-2 autonomy is an accepted residual risk, not a solved one.** The
  recoverability trio caps what a bad autonomous deploy costs — an outage plus
  a restore — it does not prevent one.
- **Classes move upward in practice.** The first paying user, the first team
  that plans its day around an internal tool, or a new payment backend can
  raise the class, and raising it means changing accounts and walls rather than
  only adding process.
:::
