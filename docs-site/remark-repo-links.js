// Links in docs/ that point outside docs/ (src/, Dockerfile, AGENTS.md…) become GitHub URLs.
// Links to directories or SUMMARY.md (replaced by the sidebar) become plain text.
const path = require('path');
const DOCS = path.resolve(__dirname, '../docs');
const REPO = path.resolve(__dirname, '..');
const GH = 'https://github.com/QuocDuy21-10/it-job-portal-be/blob/main/';

module.exports = () => (tree, file) => {
  const walk = (n) => {
    (n.children || []).forEach((c, i) => {
      if (c.type === 'link' && /^\.{0,2}\/?[^:#]/.test(c.url) && !/^[a-z]+:/i.test(c.url)) {
        const [p, hash] = c.url.split('#');
        const abs = path.resolve(path.dirname(file.path), p);
        if (!abs.startsWith(DOCS + path.sep)) {
          c.url = GH + path.relative(REPO, abs) + (hash ? '#' + hash : '');
        } else if (p.endsWith('/') || path.basename(abs) === 'SUMMARY.md') {
          n.children[i] = { type: 'emphasis', children: c.children };
        }
      }
      walk(n.children[i]);
    });
  };
  walk(tree);
};
