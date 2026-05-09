// Cross-platform start script for hosting platforms (Railway, Render, etc.)
// that inject the listen port via $PORT. cmd.exe and sh expand env vars
// differently, so we read process.env directly here instead of relying on
// shell substitution in package.json.
import { spawn } from 'node:child_process';
const port = process.env.PORT || 5173;
const child = spawn(
  'npx',
  ['--yes', 'serve@latest', '-p', String(port), '-s', '.'],
  { shell: true, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 0));
