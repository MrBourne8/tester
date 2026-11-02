/**
 * Публикует базовый unitest-player в dist/native/<platform>/
 *
 *   node scripts/publish-native.mjs --platform=windows|macos|linux
 *   node scripts/publish-native.mjs --platform=linux --from=/path/unitest-player
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const platform = (argValue('platform') || process.env.UNITEST_NATIVE_PLATFORM || '').toLowerCase();
if (!['windows', 'macos', 'linux'].includes(platform)) {
  console.error('Укажите --platform=windows|macos|linux');
  process.exit(1);
}

const binaryName = platform === 'windows' ? 'unitest-player.exe' : 'unitest-player';
const destDir = join(root, 'dist', 'native', platform);
const destFile = join(destDir, binaryName);
const destManifest = join(destDir, 'manifest.json');

const envMap = {
  windows: 'UNITEST_TAURI_EXE',
  macos: 'UNITEST_TAURI_MACOS',
  linux: 'UNITEST_TAURI_LINUX',
};

function resolveSource() {
  const fromEnv = process.env[envMap[platform]];
  if (fromEnv && existsSync(fromEnv)) return resolve(fromEnv);

  const fromArg = argValue('from');
  if (fromArg && existsSync(fromArg)) return resolve(fromArg);

  const release = join(root, 'src-tauri', 'target', 'release', binaryName);
  if (existsSync(release)) return release;

  return null;
}

const source = resolveSource();
if (!source) {
  console.error(`Не найден ${binaryName} для ${platform}.

Соберите на соответствующей ОС / в CI:
  npm run tauri:build

Затем:
  npm run native:${platform}:publish

Или:
  npm run native:${platform}:publish -- --from=/path/${binaryName}
`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(source, destFile);
if (platform !== 'windows') {
  try {
    chmodSync(destFile, 0o755);
  } catch {
    /* ignore on Windows host copying linux binary */
  }
}

const st = statSync(destFile);
const manifest = {
  name: binaryName,
  platform,
  publishedAt: new Date().toISOString(),
  sizeBytes: st.size,
  source,
  note: 'Базовый плеер. Тест вшивается при экспорте (overlay UNITSTQ1).',
};
writeFileSync(destManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
writeFileSync(join(destDir, 'README.md'), `# ${platform}

Базовый плеер \`${binaryName}\` для автономного экспорта.

Публикация: \`npm run native:${platform}\` или артефакт CI \`unitest-player-${platform}-dist\`.
`, 'utf8');

console.log(`Опубликовано (${platform}):
  ${destFile}
  размер: ${(st.size / (1024 * 1024)).toFixed(2)} МиБ
`);
