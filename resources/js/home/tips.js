/**
 * Короткие советы для блока на главной.
 * art: ключ простой графики (laptop | checklist | shield | timer | export | star).
 */
export const TIPS = [
  {
    text: 'Используйте сетевое тестирование для проведения групповых сессий в аудитории.',
    art: 'laptop',
  },
  {
    text: 'Перед занятием сохраните тест и сделайте пробный проход в режиме тренировки.',
    art: 'checklist',
  },
  {
    text: 'Раздайте ученикам QR-код сессии — так быстрее, чем диктовать код вручную.',
    art: 'laptop',
  },
  {
    text: 'Для офлайн-аудитории экспортируйте автономный тест: интернет после запуска не нужен.',
    art: 'export',
  },
  {
    text: 'Импортируйте файлы .result в отчёты, чтобы собрать баллы с автономных прохождений.',
    art: 'export',
  },
  {
    text: 'Включите лимит времени, если нужен единый контроль длительности попытки.',
    art: 'timer',
  },
  {
    text: 'В экзаменационном режиме отключите навигацию назад, чтобы ответы нельзя было менять.',
    art: 'shield',
  },
  {
    text: 'Порог прохождения задаётся в настройках теста — ученик сразу видит, сдал ли он.',
    art: 'star',
  },
  {
    text: 'Дублируйте тест перед правками шаблона — так сохранится исходная версия.',
    art: 'checklist',
  },
  {
    text: 'Перемешивайте вопросы и варианты, чтобы снизить списывание в одной аудитории.',
    art: 'shield',
  },
  {
    text: 'Для освобождённых от ПК используйте автономный EXE: файл можно раздать на флешке.',
    art: 'export',
  },
  {
    text: 'Следите за панелью сессии: видно, кто подключился и кто уже сдал работу.',
    art: 'laptop',
  },
  {
    text: 'Потеря фокуса окна во время теста фиксируется — предупредите учеников заранее.',
    art: 'shield',
  },
  {
    text: 'Экспорт в Word удобен для печати бумажного варианта контрольной работы.',
    art: 'checklist',
  },
  {
    text: 'Веб-пакет ZIP открывается в браузере на Windows, macOS и Linux без установки.',
    art: 'export',
  },
  {
    text: 'В тренировке показывайте правильные ответы — это полезно для самоподготовки.',
    art: 'star',
  },
  {
    text: 'Проверьте шкалу оценок до сессии: от неё зависит итоговая оценка в результате.',
    art: 'star',
  },
  {
    text: 'Короткий код сессии держите на экране проектора — так проще подключить всю группу.',
    art: 'laptop',
  },
  {
    text: 'После сетевой сессии закройте её, чтобы новые участники не подключались к старому коду.',
    art: 'timer',
  },
  {
    text: 'Сохраняйте версии теста перед крупными правками — откат будет проще.',
    art: 'checklist',
  },
];

/**
 * Совет дня (по дню года) или случайный.
 * @param {'day'|'random'|'rotate'} [mode]
 */
export function pickTip(mode = 'day') {
  const list = TIPS;
  if (!list.length) return { text: '', art: 'laptop', index: 0 };

  if (mode === 'random') {
    const index = Math.floor(Math.random() * list.length);
    return { ...list[index], index };
  }

  if (mode === 'rotate') {
    const key = 'testoriya_tip_index';
    let index = Number(localStorage.getItem(key) || 0);
    if (!Number.isFinite(index) || index < 0) index = 0;
    const tip = list[index % list.length];
    localStorage.setItem(key, String((index + 1) % list.length));
    return { ...tip, index: index % list.length };
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  const index = day % list.length;
  return { ...list[index], index };
}
