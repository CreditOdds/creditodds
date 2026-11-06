import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const origin = process.env.STATIC_TEST_ORIGIN || 'http://127.0.0.1:4173';
const sitemap = await fs.readFile('out/sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
const cards = JSON.parse(await fs.readFile('.static-cache/cards.json'));
for (const card of cards) assert(urls.includes(`/card/${card.slug}`), `Missing sitemap card: ${card.slug}`);
const queue = [...new Set(urls)];
let checked = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const url = queue.shift();
    const response = await fetch(origin + url);
    assert.equal(response.status,200, url);
    const html = await response.text();
    assert.match(html, /<h1[\s>]/, `No heading: ${url}`);
    assert.match(html, /rel="canonical"/, `No canonical: ${url}`);
    assert(!html.includes('/_next/image?'), `Runtime image optimizer: ${url}`);
    const slashUrl = url.endsWith('/') ? url : url + '/';
    assert.equal((await fetch(origin + slashUrl)).status, 200, `Trailing slash: ${url}`);
    checked++;
  }
}));
const news = JSON.parse(await fs.readFile('../../data/news.json'));
for (const item of news.items) assert.equal((await fetch(origin + '/news/' + item.id)).status, 200, `Legacy news URL: ${item.id}`);
for (const url of ['/missing-page', '/card/does-not-exist', '/news/does-not-exist']) assert.equal((await fetch(origin+url)).status,404,url);
for (const [from,to] of [['/_admin','/admin'],['/best-card-for/budget-car-rental','/best-card-for/budget'],['/articles/wyndham-rewards-earner-premier','/news/wyndham-rewards-earner-premier'],['/news/trump-credit-card-interest-rate-cap-proposal','/news']]) {
  const response = await fetch(origin+from, { redirect: 'manual' });
  assert.equal(response.status,301); assert.equal(response.headers.get('location'),to);
}
for (const [url,key] of [['/api/news','items'],['/api/articles','articles'],['/api/best','pages']]) assert(Array.isArray((await (await fetch(origin+url)).json())[key]));
const response = await fetch(origin);
assert(response.headers.get('content-security-policy').includes("object-src 'none'"));
assert.equal(response.headers.get('x-frame-options'),'DENY');
assert((await (await fetch(origin+'/robots.txt')).text()).includes('Disallow: /profile'));
const prerender = JSON.parse(await fs.readFile('.next/prerender-manifest.json'));
for (const [url,entry] of Object.entries(prerender.dynamicRoutes)) assert.equal(entry.fallback,false,`Runtime fallback: ${url}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
// Avoid recording analytics/views or submitting production data during validation.
await context.route(/relay\.creditodds\.com|sentry\.io|google-analytics\.com|googletagmanager\.com/, r => r.fulfill({ status: 204 }));
// Firebase Analytics' production key is origin-restricted on localhost. Mock
// only telemetry configuration; Firebase Authentication itself remains real.
await context.route(/firebase\.googleapis\.com\/v1alpha\/projects\/-\/apps\/.*\/webConfig/, r => r.fulfill({
  status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ appId: decodeURIComponent(new URL(r.request().url()).pathname.split('/apps/')[1].split('/')[0]), measurementId: 'G-TESTONLY' }),
}));
const writes = [];
await context.route(/^https:\/\/(?:d2ojrhbh2dincr\.cloudfront\.net|api\.creditodds\.com)\//, async route => {
  const req = route.request();
  if (!['GET','HEAD','OPTIONS'].includes(req.method())) { writes.push(req.url()); await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }); }
  else await route.continue();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
for (const url of ['/', '/explore', `/card/${cards[0].slug}`, '/bank/American%20Express', '/news', '/articles', '/best-card-for/amazon', '/check-odds', '/best-card-for-me', '/login', '/register', '/forgot']) {
  const response = await page.goto(origin+url);
  assert.equal(response.status(),200,url);
  await page.locator('body').waitFor();
  await page.waitForTimeout(150);
  assert(await page.locator('h1,h2').count() > 0, url);
  const badImages = await page.locator('img').evaluateAll(images => images.filter(i => i.complete && !i.naturalWidth).map(i => i.src));
  assert.deepEqual(badImages,[],`${url}: broken images`);
}
await page.goto(origin+'/tools/chase-ultimate-rewards-to-usd');
await page.getByLabel('Chase Ultimate Rewards Points', { exact:true }).fill('10000');
await page.getByText('Estimated Value', { exact:true }).waitFor();
assert.match(await page.locator('body').innerText(),/\$[\d,]+\.00/);
await page.reload();
assert.equal(await page.getByLabel('Chase Ultimate Rewards Points', { exact:true }).inputValue(),'');
const compare = `/compare?cards=${cards[0].slug},${cards[1].slug}`;
await page.goto(origin+compare);
await page.getByRole('button', { name: `Remove ${cards[0].card_name}`, exact:true }).waitFor();
await page.reload();
await page.getByRole('button', { name: `Remove ${cards[1].card_name}`, exact:true }).waitFor();
await page.goto(origin+'/explore');
await page.locator(`a[href="/card/${cards[0].slug}"]`).first().click();
await page.waitForURL(origin + `/card/${cards[0].slug}`);
await page.reload();
assert.match(await page.locator('body').innerText(), new RegExp(cards[0].card_name));
await page.goto(origin+'/profile');
await page.waitForURL(/\/login(?:\?|$)/);
await page.getByLabel('Email address', { exact:true }).waitFor();
assert.deepEqual(errors,[], 'Browser errors');
await page.screenshot({ path:'/tmp/creditodds-static-login.png',fullPage:true });
await browser.close();
console.log(JSON.stringify({ sitemapPages: checked, exportedCards: cards.length, redirects: 4, browserPages: 16, interceptedWrites: writes.length, browserErrors: errors }, null,2));
