# UniTest — кроссплатформенные сборки (Этап 7)

Нативный плеер — **Tauri 2**. Кросс-компиляция с одной ОС на другую **не поддерживается** как рабочий процесс: каждую ОС собирают на своём хосте или в CI.

## Что доступно «из коробки»

| Артефакт | ОС | Кнопка / API |
|----------|-----|--------------|
| **Веб-пакет** (`*_web.zip`) | браузер, все ОС | «Веб-пакет» / `POST …/export-web` |
| **Автономный тест** (один файл) | Windows / macOS / Linux | «Автономный тест» → выбор ОС / `…/export-standalone?platform=` |

Базовые плееры публикует админ в `dist/native/{windows,macos,linux}/` (см. [NATIVE_PLAYER.md](NATIVE_PLAYER.md)). Тест вшивается overlay без пересборки Rust.

## Windows (проверено на этом проекте)

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
# Developer PowerShell / VS Build Tools в PATH
cd D:\OSPanel\domains\localhost\tester
npm run native:windows
```

Артефакты:

```text
src-tauri/target/release/unitest-player.exe
dist/native/windows/unitest-player.exe   ← для деплоя на сервер
src-tauri/target/release/bundle/nsis/...
```

Smoke:

1. Админ: `npm run native:windows` → `dist/native/windows/` на сервере
2. В редакторе «Автономный EXE» → скачивается один `.exe`
3. «Веб-пакет» — отдельная кнопка, ZIP для браузера (все ОС)

## macOS

Требования: Xcode CLT, Rust `stable-aarch64-apple-darwin` или `x86_64-apple-darwin`, Node 20+.

```bash
npm ci
npm run build
npm run tauri:build
```

Артефакты обычно в `src-tauri/target/release/bundle/macos/` и `dmg/`.

Подпись/нотаризация — отдельно (не входит в обязательный критерий v1).

Smoke: открыть `.app`, пройти демо-тест, сохранить `.result`.

## Linux

Требования: `webkit2gtk`, `libgtk-3`, Rust stable, Node 20+.

```bash
# Debian/Ubuntu (пример)
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

npm ci
npm run build
npm run tauri:build
```

Артефакты: `bundle/appimage/`, `bundle/deb/`.

Smoke: запуск AppImage/deb-пакета, прохождение теста.

## CI

Workflow: `.github/workflows/tauri-build.yml` — matrix `windows-latest`, `macos-latest`, `ubuntu-latest`.

Критерий «проверено на ОС» ставится только после успешного job и (для релиза) ручного smoke по чеклисту выше.

## API

`GET /api/v1/export/platforms` — честный список того, что доступно на текущем хосте (веб runtime, путь к Windows EXE).
