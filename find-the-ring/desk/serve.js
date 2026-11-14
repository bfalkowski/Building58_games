#!/usr/bin/env node
// Serves the repo's files on this computer only, so the desk page can load the game's modules.
// Browsers do not load modules from a file:// page. Read-only, GET only, and nothing outside the repo.
// Usage: node find-the-ring/desk/serve.js [--port 5858], then open the address it prints.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };

export function serve(port = 5858) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = resolve(join(ROOT, path.endsWith('/') ? join(path, 'index.html') : path));
    if (req.method !== 'GET' || !file.startsWith(ROOT + '/') || file.includes('/.') || !TYPES[extname(file)]) { res.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)], 'cache-control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const i = process.argv.indexOf('--port');
  const server = await serve(i > 0 ? Number(process.argv[i + 1]) : 5858);
  console.log(`The desk: http://127.0.0.1:${server.address().port}/find-the-ring/desk/`);
}
