import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const prerender = JSON.parse(await fs.readFile('.next/prerender-manifest.json'));
for (const [url, entry] of Object.entries(prerender.dynamicRoutes)) assert.equal(entry.fallback, false, `Runtime fallback: ${url}`);
const catalog = JSON.parse(await fs.readFile('.static-cache/cards.json'));
const local = JSON.parse(await fs.readFile('../../data/cards.json'));
const content = Object.fromEntries(await Promise.all(['news', 'articles', 'best', 'stores'].map(async name => [name, JSON.parse(await fs.readFile(`../../data/${name}.json`))])));
const paths = [
  ...catalog.map(c => `/card/${c.slug}`),
  ...local.cards.map(c => `/card/${c.slug}`),
  ...[...new Set(catalog.map(c => c.bank))].map(bank => `/bank/${bank}`),
  ...content.news.items.map(x => `/news/${x.id}`),
  ...content.articles.articles.map(x => `/articles/${x.slug}`),
  ...content.best.pages.map(x => `/best/${x.slug}`),
  ...content.stores.stores.map(x => `/best-card-for/${x.slug}`),
];
for (const url of paths) await fs.access(path.join('out', `${url}.html`));
for (const asset of ['404.html', 'sitemap.xml', 'robots.txt', 'news-sitemap.xml', 'api/news', 'api/articles', 'api/best', 'api/og/compare']) await fs.access(path.join('out',asset));
const manifest = JSON.parse(await fs.readFile('src/lib/static-images.json'));
for (const key of new Set(Object.values(manifest))) for (const size of [32,96,256,640,1200]) await fs.access(`out/_images/${key}-${size}.webp`);
async function inspect(dir) {
  let bytes = 0, files = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
    const file = path.join(dir, entry.name);
    assert(!['node_modules','.env','.env.local','.env.production','server'].includes(entry.name), `Private/server artifact: ${file}`);
    if (entry.isDirectory()) { const child = await inspect(file); bytes += child.bytes; files += child.files; }
    else {
      // Preserve .next maps for the user's uploader, but never publish the export copies.
      if (file.endsWith('.map')) { await fs.unlink(file); continue; }
      bytes += (await fs.stat(file)).size; files++;
    }
  }
  return { bytes, files };
}
const report = { checkedPublicPaths: new Set(paths).size, cardPages: catalog.length, newsPages: content.news.items.length, storePages: content.stores.stores.length, ...await inspect('out') };
console.log('Static artifact verified:', JSON.stringify(report));
await fs.writeFile('.static-cache/export-report.json', JSON.stringify(report,null,2));
