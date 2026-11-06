// Validation server: only exported files, clean URLs, hosting headers and rules.
// No Next runtime, API mocks, or SPA fallback.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
const root = path.resolve('out');
const rules = JSON.parse(await fs.readFile('hosting/custom-rules.json'));
const config = yaml.load(await fs.readFile('../../customHttp.yml', 'utf8'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    for (const entry of config.applications[0].customHeaders) {
      if (entry.pattern === '**' || pathname.startsWith(entry.pattern.replace('**',''))) {
        for (const { key,value } of entry.headers) res.setHeader(key,value);
      }
    }
    const rule = rules.find(r => r.source === pathname.replace(/\/$/,''));
    if (rule?.status === '301') { res.writeHead(301, { Location: rule.target + url.search }); return res.end(); }
    // Backend routes deliberately require the separately deployed API. Proxying
    // them here would hide a frontend runtime dependency from the smoke test.
    if (rule?.status === '200') { res.writeHead(501); return res.end('Backend endpoint: ' + rule.target); }
    const requested = path.resolve(root, '.' + pathname);
    if (!requested.startsWith(root + '/') && requested !== root) { res.writeHead(400); return res.end(); }
    let filename;
    for (const candidate of [requested, requested.replace(/\/$/,'')+'.html', path.join(requested,'index.html')]) {
      try { if ((await fs.stat(candidate)).isFile()) { filename=candidate; break; } } catch { /* try clean URL */ }
    }
    const status = filename ? 200 : 404;
    filename ??= path.join(root,'404.html');
    const bytes = await fs.readFile(filename);
    const type = mime[path.extname(filename)] || (bytes.subarray(1,4).toString() === 'PNG' ? 'image/png' : pathname.startsWith('/api/') ? 'application/json' : 'application/octet-stream');
    res.writeHead(status, { 'Content-Type': type });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Static export: http://127.0.0.1:' + (process.env.PORT || 4173)));
