import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, 'dist/standalone-runtime');
const outDir = resolve(root, 'dist/tauri-frontend');
const resourceQuiz = resolve(root, 'src-tauri/resources/quiz-data.js');

if (!existsSync(resolve(runtime, 'player.js'))) {
  console.error('Missing dist/standalone-runtime/player.js. Run: npm run build:standalone');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
cpSync(resolve(runtime, 'player.js'), resolve(outDir, 'player.js'));
if (existsSync(resolve(runtime, 'player.css'))) {
  cpSync(resolve(runtime, 'player.css'), resolve(outDir, 'player.css'));
}
const favicon = resolve(root, 'public/favicon.svg');
if (existsSync(favicon)) {
  cpSync(favicon, resolve(outDir, 'favicon.svg'));
}

// Заглушка: реальный тест подставляется из src-tauri/resources/quiz-data.js при запуске EXE.
writeFileSync(
  resolve(outDir, 'quiz-data.js'),
  'window.__UNITEST_QUIZ__ = window.__UNITEST_QUIZ__ || null;\n',
  'utf8',
);
if (!existsSync(resourceQuiz)) {
  writeFileSync(
    resourceQuiz,
    "window.__UNITEST_QUIZ__ = null;\nwindow.__UNITEST_META__ = { format: 'unitest-standalone-web' };\n",
    'utf8',
  );
}
writeFileSync(
  resolve(outDir, 'index.html'),
  `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Тестория</title>
  <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="./player.css" />
</head>
<body>
  <div id="player-app"><p>Загрузка…</p></div>
  <script src="./quiz-data.js"></script>
  <script src="./player.js"></script>
</body>
</html>
`,
  'utf8',
);

console.log('Tauri frontend prepared at dist/tauri-frontend');
