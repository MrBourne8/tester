/**
 * Сборка Linux unitest-player в Docker (на Windows/macOS хосте).
 * Копирует исходники во временный каталог контейнера (без host node_modules).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform as osPlatform } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const image = process.env.UNITEST_LINUX_DOCKER_IMAGE
  || 'meymchen/tauri2-ci:bookworm-node24.20.0-pnpm12.10.1-rust1.99.0-r1';

let mount = root;
if (osPlatform() === 'win32') {
  mount = root.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
}

mkdirSync(join(root, 'dist', 'native', 'linux'), { recursive: true });

const script = `
set -euo pipefail
export PATH="/opt/cargo/bin:/usr/local/bin:$PATH"
export CARGO_HOME=/tmp/cargo-home
mkdir -p /tmp/cargo-home /tmp/unitest-build
# копируем проект без тяжёлых/враждебных к правам каталогов
tar -C /work --exclude=node_modules --exclude=src-tauri/target --exclude=.cargo-docker \\
  --exclude=vendor --exclude=dist/standalone-runtime --exclude=public/build \\
  --exclude=.git -cf - . | tar -C /tmp/unitest-build -xf -
cd /tmp/unitest-build
npm ci
npm run build:standalone
node scripts/prepare-tauri-frontend.mjs
npx tauri build --no-bundle
npm run native:linux:publish
mkdir -p /work/dist/native/linux
cp -f dist/native/linux/unitest-player /work/dist/native/linux/unitest-player
cp -f dist/native/linux/manifest.json /work/dist/native/linux/manifest.json || true
chmod 755 /work/dist/native/linux/unitest-player
ls -la /work/dist/native/linux/
echo LINUX_PUBLISH_OK
`;

console.log(`Docker image: ${image}`);
console.log(`Mount: ${root} -> /work`);

const pull = spawnSync('docker', ['pull', image], { stdio: 'inherit' });
if (pull.status !== 0) {
  console.error('Не удалось скачать Docker-образ');
  process.exit(pull.status ?? 1);
}

const run = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '-v',
    `${mount}:/work`,
    '-w',
    '/work',
    image,
    'bash',
    '-lc',
    script,
  ],
  { stdio: 'inherit' },
);

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const out = join(root, 'dist', 'native', 'linux', 'unitest-player');
if (!existsSync(out)) {
  console.error('Сборка завершилась, но файл не найден:', out);
  process.exit(1);
}
console.log('Готово:', out);
