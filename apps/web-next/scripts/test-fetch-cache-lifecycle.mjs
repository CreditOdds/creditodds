// Real Next production runtime + controllable HTTP upstream. No test routes ship.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(app, '../..');
const fixture = await mkdtemp(path.join(app, '.fetch-cache-test-'));
const modes = new Map();
const calls = new Map();
let active = 0;
let aborted = 0;
let next;
let output = '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const upstream = createServer((req, res) => {
  const name = req.url.slice(1);
  calls.set(name, (calls.get(name) ?? 0) + 1);
  active++;
  res.on('close', () => { active--; if (!res.writableEnded) aborted++; });
  const mode = modes.get(name) ?? 'v1';
  if (mode === 'hang') return;
  res.setHeader('content-type', 'application/json');
  if (mode === 'body-hang') { res.write('{'); return; }
  if (mode === '500') { res.writeHead(500); res.end('{}'); return; }
  if (mode === '404') { res.writeHead(404); res.end('{}'); return; }
  if (mode === 'malformed') { res.end('{'); return; }
  setTimeout(() => res.end(JSON.stringify({ name, value: mode })), 30);
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${upstream.address().port}`;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SENTRY_DSN: '', TEST_ORIGIN: origin };
async function file(name, source) {
  const target = path.join(fixture, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
}
async function until(check, message, timeout = 8000) {
  const end = Date.now() + timeout;
  do { if (await check()) return; await delay(80); } while (Date.now() < end);
  throw new Error(message);
}
async function nextCommand(args) {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), ...args], { cwd: fixture, env });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  return child;
}
try {
  await file('package.json', JSON.stringify({ private: true }));
  await file('next.config.mjs', `export default { turbopack: { root: ${JSON.stringify(root)} } };`);
  for (const name of ['fetchWithRetry.ts', 'responseCache.ts']) {
    await file(`lib/${name}`, await readFile(path.join(app, 'src/lib', name), 'utf8'));
  }
  await file('lib/load.ts', `import { fetchWithRetry } from './fetchWithRetry';
export const load = (name: string, signal?: AbortSignal) => fetchWithRetry(process.env.TEST_ORIGIN + '/' + name,
  { signal, next: { revalidate: 1 } }, { attemptTimeoutMs: 150, totalTimeoutMs: 400, retries: 1, backoffMs: 0 });`);
  await file('app/layout.jsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html> }');
  await file('app/card/[name]/page.jsx', `import { load } from '../../../lib/load';
import { notFound } from 'next/navigation';
export const revalidate = 1;
export async function generateStaticParams() { return [{ name: 'built' }]; }
async function read(params) { const { name } = await params; const res = await load(name); if (res.status === 404) notFound(); if (!res.ok) throw new Error('upstream '+res.status); return res.json(); }
export async function generateMetadata({ params }) { const item = await read(params); return { title: item.value }; }
export default async function Page({ params }) { const item = await read(params); return <h1>{item.name}:{item.value}</h1>; }`);
  await file('app/background/[name]/route.js', `import { connection } from 'next/server';
import { load } from '../../../lib/load';
export async function GET(_req, { params }) { await connection(); const { name } = await params; return load(name); }`);
  await file('app/cancel/route.js', `import { connection } from 'next/server';
import { load } from '../../lib/load';
export async function GET() { await connection(); const controller = new AbortController(); const cancelled = load('shared', controller.signal).then(() => 'unexpected', e => e.name); const survivor = load('shared'); controller.abort(); return Response.json({ cancelled: await cancelled, survivor: await (await survivor).json() }); }`);
  const build = await nextCommand(['build', fixture]);
  const exit = await new Promise(resolve => build.on('exit', resolve));
  assert.equal(exit, 0, `Fixture build failed:\n${output.slice(-8000)}`);
  output = '';
  const portServer = createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  next = await nextCommand(['start', fixture, '--port', String(port)]);
  const base = `http://127.0.0.1:${port}`;
  await until(() => output.includes('Ready'), 'Next did not start');
  const request = async (route, method = 'GET') => {
    const res = await fetch(base + route, { method, signal: AbortSignal.timeout(8000) });
    return { status: res.status, text: await res.text() };
  };

  // Both metadata and page must consume one complete origin response.
  let res = await request('/card/cold');
  assert.equal(res.status, 200); assert.match(res.text, /cold.*v1/);
  assert.equal(calls.get('cold'), 1, 'cold metadata/page did duplicate origin work');
  await delay(1200);
  modes.set('cold', 'v2');
  res = await request('/card/cold'); assert.equal(res.status, 200);
  await until(async () => (await request('/card/cold')).text.includes('cold<!-- -->:<!-- -->v2'), 'ISR did not publish refreshed content');
  assert.equal(calls.get('cold'), 2, 'expired metadata/page did duplicate origin work');
  console.log('PASS cold deduplication and expired ISR refresh');

  // HEAD on a cold route, and HEAD-triggered failed background regeneration.
  res = await request('/card/head-cold', 'HEAD');
  assert.equal(res.status, 200); assert.equal(res.text, ''); assert.equal(calls.get('head-cold'), 1);
  await delay(1200);
  modes.set('head-cold', 'hang');
  const before = aborted;
  res = await request('/card/head-cold', 'HEAD');
  assert.equal(res.status, 200); assert.equal(res.text, '');
  await until(() => aborted >= before + 2, 'HEAD refresh did not abort both stalled attempts');
  res = await request('/card/head-cold'); assert.equal(res.status, 200); assert.match(res.text, /head-cold.*v1/);
  modes.set('head-cold', 'v2');
  console.log('PASS cold HEAD and failed HEAD-triggered refresh preserve the page');

  // Dynamic consumers serve stale immediately while Next awaits background work.
  res = await request('/background/dynamic'); assert.match(res.text, /v1/);
  await delay(1200);
  modes.set('dynamic', 'body-hang');
  const abortedBefore = aborted;
  const start = Date.now();
  res = await request('/background/dynamic');
  assert.equal(res.status, 200); assert.match(res.text, /v1/);
  assert.ok(Date.now() - start < 250, 'stale read waited for the refresh deadline');
  await until(() => aborted >= abortedBefore + 2, 'background body timeout left sockets running');
  modes.set('dynamic', 'v2');
  await until(async () => (await request('/background/dynamic')).text.includes('v2'), 'background refresh did not recover');
  console.log('PASS stale background read, body cancellation, and recovery');

  // Lambda-like suspension: elapsed timers resume after the stale response left.
  res = await request('/background/frozen'); assert.match(res.text, /v1/);
  await delay(1200);
  modes.set('frozen', 'hang');
  res = await request('/background/frozen'); assert.equal(res.status, 200);
  await until(() => calls.get('frozen') >= 2, 'refresh did not start before suspension');
  next.kill('SIGSTOP');
  await delay(600);
  next.kill('SIGCONT');
  await until(() => active === 0, 'resumed refresh left origin work running');
  modes.set('frozen', 'v2');
  await until(async () => (await request('/background/frozen')).text.includes('v2'), 'frozen refresh poisoned later requests');
  console.log('PASS paused/resumed background refresh and later recovery');

  // Failed refreshes do not overwrite good content; a real deletion does.
  for (const failure of ['500', 'malformed']) {
    const name = 'stale-' + failure;
    res = await request('/background/' + name); assert.match(res.text, /v1/);
    await delay(1200); modes.set(name, failure);
    res = await request('/background/' + name); assert.equal(res.status, 200); assert.match(res.text, /v1/);
    await until(() => calls.get(name) >= (failure === '500' ? 3 : 2), 'stale refresh was not attempted');
    await until(() => active === 0, 'failed refresh did not settle');
    res = await request('/background/' + name); assert.equal(res.status, 200); assert.match(res.text, /v1/);
    modes.set(name, 'v2');
    await until(async () => (await request('/background/' + name)).text.includes('v2'), 'failed refresh did not recover');
  }
  res = await request('/background/deleted'); assert.equal(res.status, 200);
  await delay(1200); modes.set('deleted', '404');
  await until(async () => (await request('/background/deleted', 'HEAD')).status === 404, '404 did not replace removed content');
  console.log('PASS stale 5xx/malformed response preservation and genuine deletion');

  // A caller's abort cannot poison the shared transport/cache operation.
  res = await request('/cancel');
  assert.deepEqual(JSON.parse(res.text), { cancelled: 'AbortError', survivor: { name: 'shared', value: 'v1' } });
  assert.equal(calls.get('shared'), 1);
  console.log('PASS independent cancellation of shared reads');

  // Never persist errors/rejected promises on a cold miss; genuine 404 is kept.
  modes.set('cold-timeout', 'hang');
  res = await request('/background/cold-timeout'); assert.equal(res.status, 500);
  modes.set('cold-timeout', 'v2');
  res = await request('/background/cold-timeout'); assert.equal(res.status, 200); assert.match(res.text, /v2/);
  modes.set('failure', '500');
  res = await request('/background/failure'); assert.equal(res.status, 500);
  modes.set('failure', 'v2');
  res = await request('/background/failure'); assert.equal(res.status, 200); assert.match(res.text, /v2/);
  modes.set('missing', '404');
  res = await request('/card/missing', 'HEAD'); assert.equal(res.status, 404); assert.equal(res.text, '');
  console.log('PASS failed cold read recovery and HEAD 404');
  await until(() => active === 0, 'upstream requests leaked');
  assert.ok(!output.includes('unhandledRejection'), 'unhandled background promise rejection');
  console.log('All production Next cache lifecycle checks passed.');
} catch (error) {
  console.error(output.slice(-10000));
  throw error;
} finally {
  if (next && next.exitCode === null) {
    next.kill('SIGCONT');
    next.kill('SIGTERM');
    const force = setTimeout(() => next.kill('SIGKILL'), 5000);
    await new Promise(resolve => next.on('exit', resolve));
    clearTimeout(force);
  }
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
  await rm(fixture, { recursive: true, force: true });
}
