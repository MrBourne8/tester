# UniTest — схема базы данных

СУБД: **MySQL 8+** (в текущем окружении проверено подключение к MySQL 8.0.45).  
Кодировка: `utf8mb4` / `utf8mb4_unicode_ci`.  
Доступ: PDO с подготовленными запросами.

Автономный плеер **не использует** MySQL.

## Принципы

1. Вопросы не хранятся в отдельной таблице на каждый тест: содержимое — в версионируемом `content_json` снимка.
2. Сетевая сессия ссылается на конкретный `quiz_version_id`.
3. Автономные результаты импортируются в `attempts` с `session_id = NULL` и фиксируются в `imported_results`.
4. Внешние ключи, индексы и транзакции обязательны для сохранения попытки.

## Таблицы (Этап 1+)

### users

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) NULL UNIQUE | |
| password_hash | VARCHAR(255) | |
| role | ENUM('teacher','admin') | по умолчанию teacher |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### quizzes

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| owner_id | BIGINT UNSIGNED FK → users | ON DELETE CASCADE |
| title | VARCHAR(255) | |
| description | TEXT NULL | |
| schema_version | VARCHAR(32) | версия схемы формата |
| current_version_id | BIGINT UNSIGNED NULL | FK → quiz_versions (после создания версии) |
| created_at | DATETIME | |
| updated_at | DATETIME | |

Индекс: `(owner_id, updated_at)`.

### quiz_versions

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| quiz_id | BIGINT UNSIGNED FK → quizzes | ON DELETE CASCADE |
| version_number | INT UNSIGNED | |
| content_json | LONGTEXT / JSON | полный снимок теста |
| content_hash | CHAR(64) | SHA-256 содержимого |
| created_at | DATETIME | |

UNIQUE `(quiz_id, version_number)`.

Циклическая ссылка `quizzes.current_version_id` ↔ `quiz_versions` решается: сначала версия без обновления quiz, затем UPDATE quizzes; либо nullable FK без жёсткого ON DELETE.

### sessions

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| quiz_version_id | BIGINT UNSIGNED FK → quiz_versions | |
| teacher_id | BIGINT UNSIGNED FK → users | |
| session_code | VARCHAR(16) | код занятия |
| status | ENUM('draft','open','running','paused','finished','closed') | |
| settings_json | JSON | overrides настроек проведения |
| starts_at | DATETIME NULL | |
| ends_at | DATETIME NULL | |
| created_at | DATETIME | |

UNIQUE активный код: уникальный индекс по `session_code` для статусов не-`closed`/`finished` (реализация: уникальность кода + проверка статуса в сервисе; при необходимости generated column `active_code`).

Индексы: `(teacher_id, created_at)`, `(status)`.

### participants

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| session_id | BIGINT UNSIGNED FK → sessions | ON DELETE CASCADE |
| display_name | VARCHAR(255) | |
| external_identifier | VARCHAR(255) NULL | |
| joined_at | DATETIME | |
| status | ENUM('joined','in_progress','submitted','disconnected') | |

Индекс: `(session_id, status)`.

### attempts

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| quiz_version_id | BIGINT UNSIGNED FK → quiz_versions | |
| session_id | BIGINT UNSIGNED NULL FK → sessions | NULL для автономного импорта |
| participant_id | BIGINT UNSIGNED NULL FK → participants | |
| attempt_token_hash | CHAR(64) NULL | |
| status | ENUM('in_progress','submitted','expired','void') | |
| started_at | DATETIME | |
| submitted_at | DATETIME NULL | |
| score | DECIMAL(10,2) NULL | |
| max_score | DECIMAL(10,2) NULL | |
| percentage | DECIMAL(5,2) NULL | |
| result_payload | JSON NULL | полный результат попытки |
| created_at | DATETIME | |

Индексы: `(session_id, status)`, `(quiz_version_id)`, `(participant_id)`.

### attempt_answers

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| attempt_id | BIGINT UNSIGNED FK → attempts | ON DELETE CASCADE |
| question_id | VARCHAR(64) | id вопроса внутри снимка |
| answer_json | JSON | |
| awarded_score | DECIMAL(10,2) NULL | |
| is_correct | TINYINT(1) NULL | |
| answered_at | DATETIME | |

UNIQUE `(attempt_id, question_id)` — идемпотентная повторная отправка обновляет строку.

### imported_results

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT UNSIGNED PK AI | |
| teacher_id | BIGINT UNSIGNED FK → users | |
| source_file_hash | CHAR(64) | |
| attempt_id | BIGINT UNSIGNED FK → attempts | |
| imported_at | DATETIME | |

UNIQUE `(teacher_id, source_file_hash)` — защита от повторного импорта.

### migrations

Служебная таблица раннера миграций:

| Поле | Тип |
|------|-----|
| id | INT PK AI |
| migration | VARCHAR(255) UNIQUE |
| applied_at | DATETIME |

### Дополнительно (поздние этапы)

- `attachments` — метаданные крупных вложений вне JSON при необходимости.
- `audit_logs` — критические действия (без секретов).
- `settings` — системные настройки преподавателя.

## Миграции Этапа 1

1. `001_create_migrations_table` — создаётся раннером.
2. `002_create_users_table`
3. `003_create_quizzes_and_versions`
4. `004_create_sessions_participants`
5. `005_create_attempts_and_answers`
6. `006_create_imported_results`

На Этапе 1 достаточно таблиц users + quizzes + quiz_versions и служебной migrations; остальные создаются сразу, чтобы схема соответствовала ТЗ и не ломала последующие этапы.

## Подключение в `.env`

```env
DB_HOST=127.0.1.30
DB_PORT=3306
DB_DATABASE=unitest
DB_USERNAME=root
DB_PASSWORD=
```

Хост `127.0.1.30` — типичный адрес модуля MySQL в OSPanel (не путать с публичным IP).
