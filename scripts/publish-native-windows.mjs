import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extra = process.argv.slice(2);
const r = spawnSync(
  process.execPath,
  [join(root, 'scripts', 'publish-native.mjs'), '--platform=windows', ...extra],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
