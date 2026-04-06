import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Learning Paths',
      items: ['learning-paths']
    },
    {
      type: 'category',
      label: 'API',
      items: ['api']
    },
    {
      type: 'category',
      label: 'Videos',
      items: ['videos']
    }
  ]
};

export default sidebars;
