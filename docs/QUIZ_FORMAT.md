# UniTest — формат файла `.quiz`

## Обзор

`.quiz` — ZIP-контейнер с декларативными данными теста.  
Исполняемый код (JS/PHP и др.) из файла **не выполняется**.

Расширение итогового файла: `.quiz`  
MIME/обработка: как ZIP.

## Структура архива

```text
example.quiz          (ZIP)
├── manifest.json     — обязательный манифест
├── quiz.json         — содержимое теста (вопросы, настройки, ключи оценивания)
├── checksums.json    — контрольные суммы файлов пакета
└── resources/
    ├── images/
    ├── audio/
    └── ...
```

Допускается объединение `quiz.json` внутрь `manifest.json` на ранних прототипах, но целевая схема — раздельные файлы с `schemaVersion`.

## schemaVersion

Текущая целевая версия схемы: **`1.0`**.

При открытии:

1. Проверить, что архив — корректный ZIP.
2. Прочитать `manifest.json`.
3. Проверить `schemaVersion` (поддерживаемые версии).
4. Проверить наличие обязательных полей и файлов.
5. Проверить размеры вложений (лимиты).
6. Сверить `checksums.json` с фактическими хешами.
7. Отклонить пакет с понятным сообщением при любой ошибке.

Неизвестная мажорная версия схемы → отказ с указанием требуемого обновления приложения.

## manifest.json (черновик v1)

```json
{
  "schemaVersion": "1.0",
  "format": "unitest-quiz",
  "quizId": "ulid-or-uuid",
  "title": "Название теста",
  "description": "Описание",
  "author": "Автор",
  "createdAt": "2026-10-25T12:00:00Z",
  "updatedAt": "2026-10-25T12:00:00Z",
  "contentFile": "quiz.json",
  "engineMinVersion": "1.0.0",
  "scoringVersion": "1.0.0"
}
```

## quiz.json — основные блоки

```json
{
  "id": "ulid-or-uuid",
  "title": "Название",
  "description": "",
  "settings": { },
  "questionGroups": [],
  "questions": [],
  "resources": [
    { "id": "img1", "path": "resources/images/a.png", "mime": "image/png" }
  ]
}
```

### settings (ключевые)

| Параметр | Смысл |
|----------|--------|
| timeLimitSeconds | лимит на весь тест |
| questionTimeLimitSeconds | лимит на вопрос (опционально) |
| maxAttempts | число попыток |
| passThresholdPercent | проходной балл % |
| shuffleQuestions | случайный порядок вопросов |
| shuffleOptions | случайный порядок вариантов |
| showCorrectAnswers | после завершения |
| showScore | показ баллов |
| showResultMode | `immediate` \| `teacher_release` |
| allowNavigationBack | возврат к предыдущим |
| allowSkip | пропуск |
| trainingMode | тренировочный: проверка после ответа, пояснения |
| examMode | экзаменационный: без назад/пропуска, без подсказок |
| availability | окно доступности |

Поведение каждого параметра фиксируется тестами движка (Этап 2+).

### questionGroups

```json
{
  "id": "grp1",
  "title": "Часть A",
  "questionIds": ["q1", "q2", "q3"],
  "pick": 2,
  "shuffle": true
}
```

При `prepareAttempt`: из каждой группы берётся до `pick` вопросов (или все, если `pick` не задан). Вопросы, входящие в группы, но не выбранные, в попытку не попадают. Затем добавляются вопросы вне групп.

### resources

В БД и автономном embed ресурсы хранятся с `dataBase64`. В файле `.quiz` бинарники лежат в `resources/…`, а в `quiz.json` остаются только `id` / `path` / `mime`.

### Типы вопросов (модули)

| type | Описание |
|------|----------|
| `single_choice` | один правильный |
| `multiple_choice` | несколько; partial/full scoring |
| `true_false` | да/нет |
| `text` | текст; exact / normalize |
| `numeric` | число + tolerance |
| `matching` | соответствия |
| `ordering` | упорядочивание |
| `fill_blanks` | пропуски |
| `image` | носитель (`imageResourceId`) + `innerQuestion` для оценивания |
| `info` | информационный блок, 0 баллов |

Каждый тип: schema данных, editor UI, player UI, validation, scoring, report view.

Правильные ответы хранятся в пакете для автономного режима. В сетевом API правильные ответы **не отдаются** клиенту до разрешения настройками.

## checksums.json

```json
{
  "algorithm": "sha256",
  "files": {
    "manifest.json": "...",
    "quiz.json": "...",
    "resources/images/a.png": "..."
  }
}
```

Хеш самого `checksums.json` не включается; при проверке файл читается отдельно.

## Безопасность пакета

- Запрет path traversal / ZIP Slip при распаковке.
- Лимит размера архива и каждого файла.
- Белый список расширений ресурсов.
- Нет `eval`, скриптов и исполняемых вложений как части логики теста.

## Воспроизводимость попытки

При случайном порядке/выборке сохранять в результате попытки:

- `seed` или явный список `questionOrder` / `optionOrder`;
- версии `engineVersion` и `scoringVersion`.

Одинаковые входные данные + ответы → одинаковый результат в автономном и сетевом режимах.
