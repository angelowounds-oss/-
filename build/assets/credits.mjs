// The in-game credits screen's list (EV-84): the manifest's shipped entries (status ok) grouped by licence, each with its title, author, source
// and link, plus the libraries the page is built from. build.mjs puts it into index.html as JSON; src/credits.js draws it.
import fs from 'node:fs';

// the libraries bundled into main.js, with their licences (package versions as installed)
const LIBS = [['three.js', 'MIT', 'https://threejs.org'], ['Rapier (@dimforge/rapier3d-compat)', 'Apache-2.0', 'https://rapier.rs'], ['esbuild (build only)', 'MIT', 'https://esbuild.github.io']];

// the list for a manifest: [{ licence, items: [{ title, author, source, url }] }], attribution licences first
export function creditsList(man) {
  const groups = new Map();
  for (const a of man.assets) { if (a.status !== 'ok') continue; const g = groups.get(a.licence) || groups.set(a.licence, []).get(a.licence); g.push({ title: a.title, author: a.author || '', source: a.source || '', url: a.url || '' }); }
  for (const [title, licence, url] of LIBS) (groups.get(licence) || groups.set(licence, []).get(licence)).push({ title, author: '', source: 'library', url });
  const order = (l) => (/^(ODbL|CC-BY|KOGL|KOSTAT|OFL)/.test(l) ? 0 : /^(MIT|Apache)/.test(l) ? 1 : 2);
  return [...groups].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([licence, items]) => ({ licence, items }));
}
// the JSON for the page, safe inside a <script> element
export function creditsJson(file = 'build/assets/manifest.json') { return JSON.stringify(creditsList(JSON.parse(fs.readFileSync(file, 'utf8')))).replace(/</g, '\\u003c'); }
