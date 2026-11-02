/**
 * Публикует шаблон macOS-экспорта (.app.zip режим) без сборки на Mac.
 * Нативный Mach-O по-прежнему: npm run native:macos на macOS/CI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destDir = join(root, 'dist', 'native', 'macos');
mkdirSync(destDir, { recursive: true });

const manifest = {
  name: 'macos-app-zip-template',
  platform: 'macos',
  mode: 'app-zip',
  publishedAt: new Date().toISOString(),
  note: 'Экспорт отдаёт UniTest.app.zip (веб-плеер). Для настоящего Tauri Mach-O соберите на macOS: npm run native:macos',
};

writeFileSync(join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  join(destDir, 'README.md'),
  `# macOS

Сейчас опубликован режим **app-zip** (можно экспортировать с Windows-сервера).

Нативный \`unitest-player\` (Mach-O):

\`\`\`bash
# на macOS или CI macos-latest
npm run native:macos
\`\`\`
`,
);

console.log('Опубликован шаблон macOS app-zip:', join(destDir, 'manifest.json'));
