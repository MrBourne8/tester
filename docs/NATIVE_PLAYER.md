# Базовый нативный плеер (админ)

Цель: преподаватели выбирают ОС и скачивают **один файл** со вшитым тестом (Windows / macOS / Linux).  
Rust на сервере при каждом экспорте **не нужен**.

## Каталоги на сервере

```text
dist/native/windows/unitest-player.exe
dist/native/macos/unitest-player
dist/native/linux/unitest-player
```

Проверка: `GET /api/v1/export/platforms` → `autonomous[].available`.

## Публикация

| ОС | Команда |
|----|---------|
| Windows | `npm run native:windows` |
| Linux (с Windows через Docker) | `npm run native:linux:docker` |
| Linux (на Linux/CI) | `npm run native:linux` |
| macOS шаблон `.app.zip` (с любой ОС) | `npm run native:macos:publish-app` |
| macOS нативный Mach-O | на Mac/CI: `npm run native:macos` |

На Windows-сервере типовой набор:

```powershell
npm run native:windows:publish
npm run native:macos:publish-app
npm run native:linux:docker
```

Только копирование уже собранного бинарника:

```bash
npm run native:macos:publish -- --from=/path/unitest-player
```

## CI

Workflow `tauri-build.yml` публикует артефакты:

- `unitest-player-windows-dist`
- `unitest-player-macos-dist`
- `unitest-player-linux-dist`

Админ скачивает нужные и кладёт в `dist/native/<os>/` на сервере.

## Экспорт преподавателем

1. «Автономный тест» → диалог выбора ОС (доступны только опубликованные).
2. `POST /api/v1/quizzes/{id}/export-standalone?platform=windows|macos|linux`
3. Сервер вшивает тест (overlay `UNITSTQ1`) в копию базового плеера.

Отдельно: «Веб-пакет» — ZIP для браузера на любой ОС.

## Запуск учеником

- **Windows:** двойной клик по `.exe` (нужен WebView2).
- **macOS:** `chmod +x` при необходимости; при Gatekeeper: `xattr -cr ./файл`.
- **Linux:** `chmod +x`; нужны зависимости webkit2gtk (как у Tauri).
