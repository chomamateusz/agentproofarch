import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const GITHUB_REPO = 'https://github.com/chomamateusz/agentproofarch';

const config: Config = {
  title: 'agentproofarch',
  tagline:
    'An agent-first, strictly layered TypeScript foundation for multi-tenant SaaS',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://chomamateusz.github.io',
  baseUrl: '/agentproofarch/',
  organizationName: 'chomamateusz',
  projectName: 'agentproofarch',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          // ADR file names carry their number (0001-…) as part of the identifier,
          // not as an ordering prefix Docusaurus should strip.
          numberPrefixParser: false,
          editUrl: `${GITHUB_REPO}/tree/main/website/`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'agentproofarch',
      logo: {alt: 'agentproofarch', src: 'img/logo.svg'},
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {to: '/start/quickstart', label: 'Quickstart', position: 'left'},
        {to: '/changelog', label: 'Changelog', position: 'left'},
        {
          href: 'https://agentproofarch.vercel.app',
          label: 'Live demo',
          position: 'right',
        },
        {href: GITHUB_REPO, label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Start here', to: '/'},
            {label: 'Quickstart', to: '/start/quickstart'},
            {label: 'Decisions (ADRs)', to: '/decisions'},
          ],
        },
        {
          title: 'Repository',
          items: [
            {label: 'GitHub', href: GITHUB_REPO},
            {
              label: 'Architecture (normative)',
              href: `${GITHUB_REPO}/blob/main/docs/architecture.md`,
            },
            {
              label: 'Deferred-work register',
              href: `${GITHUB_REPO}/blob/main/docs/backlog.md`,
            },
          ],
        },
        {
          title: 'Collaboration',
          items: [
            {label: 'CodeRoad.pl', href: 'https://coderoad.pl'},
            {label: 'AmazingDesign.eu', href: 'https://amazingdesign.eu'},
          ],
        },
      ],
      copyright:
        'A free, open project by Mateusz Choma, developed in collaboration with CodeRoad.pl and AmazingDesign.eu.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'diff'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
