import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Start here',
      collapsed: false,
      items: ['start/landing', 'start/quickstart'],
    },
    {
      type: 'category',
      label: 'Full architecture',
      items: [
        'start/glossary',
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
      label: 'Step-by-step guides',
      items: [
        'guides/cli-walkthrough',
        'guides/adding-a-feature',
        'guides/testing-doctrine',
        'guides/agent-workflow',
      ],
    },
    {
      type: 'category',
      label: 'Infrastructure',
      items: [
        'operations/environments',
        'operations/ci-gates',
        'operations/health-and-attestation',
        'operations/backup-dr',
        'operations/self-host-and-domains',
      ],
    },
    {
      type: 'category',
      label: 'ADRs',
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
        'decisions/0010-tenant-creation-policy',
      ],
    },
    'changelog',
  ],
};

export default sidebars;
