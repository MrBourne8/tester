/**
 * Режимы прохождения: обычный / тренировочный / экзаменационный.
 */

/**
 * @param {object} settings
 * @returns {'normal'|'training'|'exam'}
 */
export function currentMode(settings = {}) {
  if (settings.examMode) return 'exam';
  if (settings.trainingMode) return 'training';
  return 'normal';
}

/**
 * Применить пресет режима (взаимно исключающие флаги + связанные опции).
 * @param {object} settings
 * @param {'normal'|'training'|'exam'} mode
 */
export function applyModePreset(settings = {}, mode = 'normal') {
  const next = { ...settings };
  if (mode === 'training') {
    next.trainingMode = true;
    next.examMode = false;
    next.allowNavigationBack = true;
    next.allowSkip = true;
    next.showCorrectAnswers = true;
    next.showScore = true;
  } else if (mode === 'exam') {
    next.trainingMode = false;
    next.examMode = true;
    next.allowNavigationBack = false;
    next.allowSkip = false;
    next.showCorrectAnswers = false;
  } else {
    next.trainingMode = false;
    next.examMode = false;
  }
  return next;
}

/**
 * Эффективные настройки для плеера (экзамен принудительно ужесточает правила).
 * @param {object} settings
 */
export function resolveEffectiveSettings(settings = {}) {
  const s = { ...settings };
  if (s.examMode) {
    s.allowNavigationBack = false;
    s.allowSkip = false;
    s.showCorrectAnswers = false;
  }
  if (s.trainingMode) {
    s.examMode = false;
  }
  return s;
}
