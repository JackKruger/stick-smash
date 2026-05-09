// One-command "host a public game" launcher.
//
// Spawns:
//   1. `serve` to host the static site (auto-detects actual port)
//   2. `localtunnel` to expose that port publicly
//
// Why localtunnel and not cloudflared: as of this writing, Cloudflare's
// account-less quick tunnels (`*.trycloudflare.com`) are returning 404 for
// all paths from their edge — the tunnel control plane connects but data
// never flows. localtunnel works reliably and only adds a one-time
// "Continue" warning page that clears once the visitor accepts.
//
// localtunnel quirk: on first visit visitors see a "Friendly Reminder"
// interstitial that asks for a tunnel password (the host's public IPv4).
// We fetch that IP up front and print it alongside the URL so the host
// can paste both into chat at once.
//
// Ctrl+C kills both children. Use:  npm run play
import { spawn } from 'node:child_process';
import process from 'node:process';
import http from 'node:http';
import https from 'node:https';

const DEFAULT_PORT = 5173;
const isWin = process.platform === 'win32';

let shuttingDown = false;
const children = [];
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try { c.kill(isWin ? undefined : 'SIGINT'); } catch (_) {}
  }
  setTimeout(() => process.exit(code), 250);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const tag = (label) => `\x1b[2m[${label}]\x1b[0m`;
const wireChild = (child, label) => {
  child.stdout?.on('data', (d) => process.stdout.write(`${tag(label)} ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`${tag(label)} ${d}`));
  child.on('exit', (code) => {
    process.stdout.write(`${tag(label)} exited ${code}\n`);
    if (code !== 0 && !shuttingDown) shutdown(code ?? 1);
  });
};

// ── 1. Static server ─────────────────────────────────────────────────────
console.log('\n\x1b[36m▶ Starting local server...\x1b[0m');
const server = spawn('npx', ['--yes', 'serve@latest', '-p', String(DEFAULT_PORT), '.'], {
  shell: true, stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(server);

// `serve` prints "Accepting connections at http://localhost:5173". Parse
// the actual port (it MAY differ if 5173 is already in use).
let detectedPort = null;
const portPromise = new Promise((resolve) => {
  const handle = (chunk) => {
    const s = chunk.toString();
    process.stdout.write(`${tag('server')} ${s}`);
    const m = s.match(/http:\/\/localhost:(\d+)/i);
    if (m && !detectedPort) {
      detectedPort = Number(m[1]);
      resolve(detectedPort);
    }
  };
  server.stdout.on('data', handle);
  server.stderr.on('data', handle);
});
server.on('exit', (code) => {
  process.stdout.write(`${tag('server')} exited ${code}\n`);
  if (code !== 0 && !shuttingDown) shutdown(code ?? 1);
});

// Probe until the server is actually responding.
const probe = (port) => new Promise((resolve) => {
  const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
    res.resume();
    resolve(res.statusCode && res.statusCode < 500);
  });
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});
const waitUntilUp = async (port, timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

const port = await Promise.race([
  portPromise,
  new Promise((r) => setTimeout(() => r(DEFAULT_PORT), 8000)),
]);
console.log(`\x1b[36m▶ Waiting for server on port ${port}...\x1b[0m`);
const up = await waitUntilUp(port);
if (!up) {
  console.error(`\x1b[31m✘ Server didn't come up on :${port} within 30s. Aborting.\x1b[0m`);
  shutdown(1);
  process.exit(1);
}
console.log(`\x1b[32m✔ Server is up on :${port}.\x1b[0m`);

// ── 2. Fetch host public IP (for localtunnel "Continue" page) ────────────
const fetchPublicIp = () => new Promise((resolve) => {
  const req = https.get('https://api.ipify.org', (res) => {
    let buf = '';
    res.on('data', (c) => (buf += c));
    res.on('end', () => resolve(buf.trim()));
  });
  req.on('error', () => resolve(null));
  req.setTimeout(3000, () => { req.destroy(); resolve(null); });
});
const publicIp = await fetchPublicIp();

// ── 3. Tunnel ────────────────────────────────────────────────────────────
console.log('\x1b[36m▶ Opening localtunnel...\x1b[0m\n');
const tunnel = spawn(
  'npx',
  ['--yes', 'localtunnel@latest', '--port', String(port)],
  { shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
children.push(tunnel);
wireChild(tunnel, 'tunnel');

// Watch tunnel output for `your url is: https://...loca.lt`.
const URL_RE = /https:\/\/[a-z0-9-]+\.loca\.lt/i;
let printed = false;
const printBanner = (url) => {
  if (printed) return;
  printed = true;
  const inner = `   ${url}   `;
  const bar = '═'.repeat(inner.length);
  console.log(`\n\x1b[35m╔${bar}╗`);
  console.log(`║\x1b[1;33m${inner}\x1b[0;35m║`);
  console.log(`╚${bar}╝\x1b[0m`);
  console.log('\n\x1b[1;32m✔ Share that link.\x1b[0m');
  if (publicIp) {
    console.log(`\x1b[33m  Note: visitors see a "Continue" page on first visit.\x1b[0m`);
    console.log(`\x1b[33m  If asked for "tunnel password" they enter:\x1b[1m ${publicIp}\x1b[0m`);
  }
  console.log('\x1b[2m  Press Ctrl+C in this terminal to stop.\x1b[0m\n');
};
const watchUrl = (stream) => stream.on('data', (chunk) => {
  const m = chunk.toString().match(URL_RE);
  if (m) printBanner(m[0]);
});
watchUrl(tunnel.stdout);
watchUrl(tunnel.stderr);
