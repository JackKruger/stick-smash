// Self-signed local HTTPS for testing on devices that need a secure context.
// Run: node https-server.mjs   (after: npm i selfsigned)
// Or:  npm run https
import { createServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { existsSync } from 'node:fs';

const PORT = +process.env.PORT || 5173;
const ROOT = process.cwd();

let selfsigned;
try { selfsigned = (await import('selfsigned')).default; }
catch {
  console.error('Missing dep. Install once with:\n  npm i selfsigned\n');
  process.exit(1);
}

const pems = selfsigned.generate(
  [{ name: 'commonName', value: 'localhost' }],
  { days: 365, keySize: 2048, algorithm: 'sha256' },
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.map':  'application/json',
};

const server = createServer({ key: pems.private, cert: pems.cert }, async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403); return res.end(); }
    if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    const s = await stat(file);
    if (s.isDirectory()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

server.listen(PORT, () => {
  console.log(`https://localhost:${PORT}`);
  console.log(`https://0.0.0.0:${PORT}  (LAN access)`);
  console.log('Browser will warn about self-signed cert. Click Advanced → Proceed.');
});
