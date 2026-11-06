// @ts-check
/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'IT Job Portal – Backend',
  tagline: 'Tài liệu kỹ thuật',
  url: 'https://quocduy21-10.github.io',
  baseUrl: '/it-job-portal-be/',
  onBrokenLinks: 'throw',
  i18n: { defaultLocale: 'vi', locales: ['vi'] },
  // .md = CommonMark (docs có {} và <>), chỉ .mdx mới là MDX.
  markdown: { format: 'detect', mermaid: true },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      { indexBlog: false, docsRouteBasePath: '/', language: ['en'] },
    ],
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: '/',
          beforeDefaultRemarkPlugins: [require('./remark-repo-links')],
          sidebarPath: './sidebars.js',
          exclude: ['archive/**', 'SUMMARY.md', 'write-document.md'],
          editUrl: 'https://github.com/QuocDuy21-10/it-job-portal-be/edit/main/docs/',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'IT Job Portal – Backend',
      items: [
        {
          href: 'https://github.com/QuocDuy21-10/it-job-portal-be',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    colorMode: { respectPrefersColorScheme: true },
  },
};
