import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const docsearchAppId = process.env.DOCSEARCH_APP_ID?.trim();
const docsearchApiKey = process.env.DOCSEARCH_API_KEY?.trim();
const docsearchIndexName = process.env.DOCSEARCH_INDEX_NAME?.trim();

const config: Config = {
  title: 'Ananke Docs',
  tagline: 'Deterministic simulation for game developers, researchers, and creators.',
  url: 'https://ananke.dev',
  baseUrl: '/',
  organizationName: 'its-not-rocket-science',
  projectName: 'ananke',
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-Hans', 'ja', 'ko']
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/its-not-rocket-science/ananke/tree/work/docs/ananke/',
          lastVersion: 'current',
          versions: {
            current: {
              label: 'latest'
            },
            '1.1': {
              label: 'v1.1'
            },
            '1.0': {
              label: 'v1.0'
            }
          }
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css'
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    navbar: {
      title: 'Ananke',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          label: 'Docs',
          position: 'left'
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
          dropdownActiveClassDisabled: true
        },
        {
          href: 'https://github.com/its-not-rocket-science/ananke',
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    ...(docsearchAppId && docsearchApiKey && docsearchIndexName
      ? {
          algolia: {
            appId: docsearchAppId,
            apiKey: docsearchApiKey,
            indexName: docsearchIndexName,
            contextualSearch: true
          }
        }
      : {})
  } satisfies Preset.ThemeConfig
};

export default config;
