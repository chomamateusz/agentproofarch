import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: '🚀 Start here',
      collapsed: false,
      items: [
        'start/landing',
        'start/quickstart',
        'start/glossary',
        'start/troubleshooting',
      ],
    },
    {
      type: 'category',
      label: '🧭 Build something',
      link: {
        type: 'generated-index',
        title: 'Build something',
        description:
          'The working loop: drive the stack from the CLI, then add a feature the type-forced way. If you just booted the demo, start with the CLI walkthrough.',
      },
      items: [
        'guides/cli-walkthrough',
        'guides/cli-reference',
        'guides/adding-a-feature',
      ],
    },
    {
      type: 'category',
      label: '✅ Ship it',
      link: {
        type: 'generated-index',
        title: 'Ship it',
        description:
          'What "done" means here and how a change reaches main: the testing doctrine, the CI gates, the fail-closed AI review, and the agent workflow around them.',
      },
      items: [
        'guides/testing-doctrine',
        'operations/ci-gates',
        'operations/ai-review-gate',
        'guides/agent-workflow',
      ],
    },
    {
      type: 'category',
      label: '🧱 Run it',
      link: {
        type: 'generated-index',
        title: 'Run it',
        description:
          'Operating the deployed thing: environments and promotion, health probes and deploy attestation, backup and DR, the Docker self-host target, and per-tenant custom domains with TLS.',
      },
      items: [
        'operations/environments',
        'operations/health-and-attestation',
        'operations/backup-dr',
        'operations/self-host',
        'operations/self-host-and-domains',
      ],
    },
    {
      type: 'category',
      label: '🏛️ Architecture reference',
      link: {
        type: 'generated-index',
        title: 'Architecture reference',
        description:
          'Lookup pages, not required reading: the layer graph and its enforcers, the fixed order of a request, identity and tenancy, authorization, data, errors, observability, client state, and the port catalogue.',
      },
      items: [
        'architecture/layers',
        'architecture/request-lifecycle',
        'architecture/identity-and-multi-tenancy',
        'architecture/authorization',
        'architecture/data-and-transactions',
        'architecture/errors-and-api-versioning',
        'architecture/observability',
        'architecture/client-state',
        'architecture/ports-and-adapters',
      ],
    },
    {
      type: 'category',
      label: '⚖️ ADRs',
      link: {type: 'doc', id: 'decisions/index'},
      items: [
        'decisions/0001-public-surface-embeds-over-pages',
        'decisions/0002-member-identity-and-idp',
        'decisions/0003-vercel-environments',
        'decisions/0004-no-exceptions-enforcement',
        'decisions/0005-client-application-state',
        'decisions/0006-public-read-only-surface',
        'decisions/0007-email-port-and-magic-link-transport',
        'decisions/0008-visual-regression',
        'decisions/0009-package-manager-pnpm',
        'decisions/0010-tenant-creation-policy',
        'decisions/0011-layout-layer',
      ],
    },
    'changelog',
  ],
};

export default sidebars;
