# UniTest — формат файла `.result`

Файл результата автономной попытки. Расширение: `.result` (JSON).

## Поля

| Поле | Описание |
|------|----------|
| format | `unitest-result` |
| schemaVersion | `1.0` |
| checksumAlgorithm | `sha256` |
| quizId | id содержимого теста |
| quizTitle | название |
| quizVersionNumber | номер версии в БД преподавателя (если известен) |
| contentHash | хеш снимка |
| attemptId | уникальный id попытки |
| studentName | имя ученика |
| startedAt / submittedAt | ISO-8601 |
| seed / questionOrder / optionOrder | воспроизводимость |
| answers | ответы ученика |
| score / maxScore / percentage / passed | итог |
| durationSeconds | время прохождения |
| grade | `{ label, minPercent, color }` по шкале теста |
| stats | `{ correct, incorrect, partial, ... }` |
| engineVersion / scoringVersion | версии движка |
| perQuestion | детализация |
| checksum | SHA-256 канонического JSON без поля checksum |

Шкала оценок задаётся в настройках теста (`settings.gradingScale`): массив `{ label, minPercent }`.

Контрольная сумма обнаруживает случайные изменения, но не доказывает авторство.
