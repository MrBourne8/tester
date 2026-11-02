# UniTest

Кроссплатформенная система создания и проведения тестов (автономный и сетевой режимы).

Документация:

- [Архитектура](docs/ARCHITECTURE.md)
- [База данных](docs/DATABASE.md)
- [Формат `.quiz`](docs/QUIZ_FORMAT.md)
- [Сетевой режим](docs/NETWORK_MODE.md)
- [Сборка](docs/BUILD.md)
- [Дорожная карта](docs/ROADMAP.md)

## Требования

| Компонент | Версия |
|-----------|--------|
| PHP | 8.3+ (pdo_mysql, mbstring, openssl, zip, json, fileinfo) |
| MySQL | 8.0+ |
| Composer | 2.x |
| Node.js | 20+ |
| npm | 8+ |

### OSPanel (текущее окружение)

```text
PHP:   D:\OSPanel\modules\PHP-8.3\php.exe
MySQL: 127.0.1.30:3306  (не 127.0.0.1)
Composer: COMPOSER_HOME=D:\OSPanel\userdata\composer
```

Перед командами в PowerShell:

```powershell
$env:Path = "D:\OSPanel\modules\PHP-8.3;D:\OSPanel\modules\MySQL-8.4\bin;" + $env:Path
$env:COMPOSER_HOME = "D:\OSPanel\userdata\composer"
function composer { php "$env:COMPOSER_HOME\composer.phar" @args }
```

## Установка

```powershell
cd D:\OSPanel\domains\localhost\tester
copy .env.example .env
# при необходимости поправьте DB_HOST / DB_* в .env

composer install
npm install
php bin/migrate.php
npm run build
```

Создайте БД (если ещё нет):

```powershell
mysql -h 127.0.1.30 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS unitest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## Запуск

```powershell
php -S 127.0.0.1:8090 -t public public/router.php
```

Открыть: http://127.0.0.1:8090  
Health: http://127.0.0.1:8090/api/v1/health

Для доступа учеников по LAN (не только с этого ПК) слушайте все интерфейсы:

```powershell
php -S 0.0.0.0:8090 -t public public/router.php
```

При необходимости разрешите входящие на порт `8090` в брандмауэре Windows.

### Доступ через интернет

1. Поднимите сервер на `0.0.0.0:8090` (см. выше).
2. Откройте туннель к порту, например Cloudflare:
   `cloudflared tunnel --url http://127.0.0.1:8090`
3. На панели сессии вставьте выданный `https://…` в блок **«Доступ через интернет»** и нажмите **Применить**  
   (либо задайте `PUBLIC_BASE_URL` в `.env`).
4. QR и ссылки для учеников будут использовать этот адрес.

> Порт `8080` в OSPanel часто занят другим приложением — используйте `8090` или свободный порт.

Frontend в режиме разработки (отдельно):

```powershell
npm run dev
```

## Проверки

```powershell
composer test
npm test
```

## Редактор и плеер

```text
http://127.0.0.1:8090/editor
http://127.0.0.1:8090/player          — портативный плеер (.quiz)
http://127.0.0.1:8090/player/{id}     — пройти тест из БД
http://127.0.0.1:8090/join            — вход ученика в сетевую сессию
http://127.0.0.1:8090/session/{id}    — панель преподавателя
http://127.0.0.1:8090/reports         — отчёты и импорт .result
```

Пакеты без PHP/MySQL у ученика:

- **«Автономный тест»** — выбор ОС (Windows / macOS / Linux), один файл
- **«Веб-пакет»** — ZIP для браузера
- **Админ:** `npm run native:windows|macos|linux` → [docs/NATIVE_PLAYER.md](docs/NATIVE_PLAYER.md)

Сетевой режим (LAN):

1. В редакторе: **«Сетевое тестирование»**
2. Раздать код или URL `/join?code=…`
3. **Старт** на панели сессии → ученики проходят тест
4. Результаты на панели и в `GET /api/v1/sessions/{id}/results`

Формат результата: [docs/RESULT_FORMAT.md](docs/RESULT_FORMAT.md).

## Отчёты

- Страница `/reports`: фильтры, детали попыток, экспорт CSV
- Импорт автономных результатов: кнопка **«Импорт .result»** (повтор того же файла отклоняется)

## Кроссплатформа

- Веб-пакет в ZIP работает на любой ОС
- Один Windows EXE — если на сервере есть `dist/native/windows/unitest-player.exe` ([NATIVE_PLAYER.md](docs/NATIVE_PLAYER.md))
- macOS/Linux нативные сборки — на своих хостах или CI ([CROSS_PLATFORM.md](docs/CROSS_PLATFORM.md))

## Текущий этап

**Этап 7 — кроссплатформа** выполнен для Windows + CI/docs для macOS/Linux. Следующий: **Этап 8 — расширения**.
