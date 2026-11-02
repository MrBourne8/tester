# UniTest — сборка и распространение

## Требования к окружению разработки

| Компонент | Минимум | Примечание |
|-----------|---------|------------|
| PHP | 8.3+ | расширения: pdo_mysql, mbstring, openssl, zip, json, fileinfo |
| Composer | 2.x | в OSPanel: `COMPOSER_HOME` + `composer.phar` |
| Node.js | 20+ (проверено 25.x) | для Vite |
| npm | 8+ | lock-файл обязателен |
| MySQL | 8.0+ | база `unitest` |
| Rust + Tauri CLI | для Этапов 4/7 | Windows: проверено; macOS/Linux — нативные хосты или CI |
| OS-сборки | Windows / macOS / Linux host | кросс-сборка с чужой ОС не используется |

## Локальный запуск web (Этап 1)

См. корневой `README.md`. Кратко:

1. Скопировать `.env.example` → `.env`
2. `composer install`
3. `npm install`
4. `php bin/migrate.php`
5. `npm run build` (или `npm run dev`)
6. `php -S 0.0.0.0:8080 -t public`

Проверка: `GET /api/v1/health`.

## OSPanel

- Документный корень домена должен указывать на `public/`, либо использовать встроенный PHP-сервер для разработки.
- MySQL в OSPanel часто слушает `127.0.1.30`, не `127.0.0.1`. Указывать фактический хост в `.env`.

## Автономный экспорт (план)

Порядок модуля экспорта:

1. Валидировать тест.
2. Создать неизменяемый снимок версии.
3. Собрать манифест и ресурсы `.quiz`.
4. Взять заранее собранный плеер под целевую ОС (не обязательно пересобирать Tauri на каждый экспорт).
5. Встроить данные теста.
6. Контрольные суммы и проверка пакета.
7. Показать путь к артефакту.

Интерфейс честно сообщает, для каких ОС на текущей машине доступна сборка.

### Платформы

| ОС | Артефакт | Где собирать |
|----|----------|--------------|
| Windows | `.exe` / MSI / portable | Windows host |
| macOS | `.app` / DMG | macOS host (подпись отдельно) |
| Linux | AppImage / deb | Linux host |

Не обещать запуск Windows EXE на macOS/Linux.

### Безопасность пакетов

- Не исполнять код из `.quiz`.
- Не подтягивать неподписанные удалённые скрипты.
- Подпись пакетов — отдельный этап; до него фиксировать ограничения в UI и документации.

## CI (план)

- PHPUnit / Pest, Vitest на каждый PR.
- Playwright — основные сценарии.
- Сборки Tauri — отдельные runners под каждую ОС.
- Не помечать критерий кроссплатформенности выполненным без фактического запуска на целевой ОС.

## Статус проверок окружения (2026-10-25)

| Проверка | Результат |
|----------|-----------|
| PHP 8.3 CLI | OK |
| PDO MySQL | OK (расширение есть) |
| MySQL connect 127.0.1.30 | OK, создана БД `unitest` |
| Node/npm | OK |
| Composer | OK (устаревший 2.4-dev — следить за совместимостью) |
| Rust/cargo | **установлены** — rustc/cargo 1.99.1 (MSVC) |
| VS Build Tools 2022 + VC Tools | **установлены** (`cl.exe` доступен) |
| WebView2 | присутствует |
| Автономный веб-пакет (IIFE) | `npm run build:standalone` |
| Сборка Tauri EXE | **выполнена** — см. ниже |

### Артефакты Tauri (проверено)

```text
src-tauri/target/release/unitest-player.exe
src-tauri/target/release/bundle/nsis/UniTest Player_0.1.0_x64-setup.exe
```

Команда: `npm run tauri:build` (нужен MSVC в PATH — Developer PowerShell).

### Публикация плеера на сервер (админ, один раз)

```powershell
npm run native:windows
# → dist/native/windows/unitest-player.exe
```

Скопируйте `dist/native/windows/` на сервер приложения. Подробно: [NATIVE_PLAYER.md](NATIVE_PLAYER.md).

## Автономный экспорт (Этапы 4 + 7)

```powershell
npm run build          # web + standalone runtime
# «Автономный EXE»  → POST /api/v1/quizzes/{id}/export-standalone  (.exe)
# «Веб-пакет»       → POST /api/v1/quizzes/{id}/export-web         (.zip)
# платформы хоста: GET /api/v1/export/platforms
```

Кроссплатформа: [CROSS_PLATFORM.md](CROSS_PLATFORM.md). Базовый EXE: [NATIVE_PLAYER.md](NATIVE_PLAYER.md).
