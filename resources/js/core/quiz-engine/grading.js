/**
 * Шкала оценок по проценту (по умолчанию — российская 5-балльная).
 *
 * @typedef {{ label: string, minPercent: number, color?: string }} GradeBand
 */

/** @returns {GradeBand[]} */
export function defaultGradingScale() {
  return [
    { label: '5', minPercent: 90, color: '#0f6b4c' },
    { label: '4', minPercent: 70, color: '#2f7d4f' },
    { label: '3', minPercent: 50, color: '#b7791f' },
    { label: '2', minPercent: 0, color: '#9b2c2c' },
  ];
}

/**
 * @param {unknown} scale
 * @returns {GradeBand[]}
 */
export function normalizeGradingScale(scale) {
  if (!Array.isArray(scale) || scale.length === 0) {
    return defaultGradingScale();
  }

  const bands = scale
    .filter((b) => b && typeof b === 'object')
    .map((b) => ({
      label: String(b.label ?? '').trim() || '—',
      minPercent: Math.max(0, Math.min(100, Number(b.minPercent) || 0)),
      color: typeof b.color === 'string' ? b.color : undefined,
    }))
    .sort((a, b) => b.minPercent - a.minPercent);

  return bands.length ? bands : defaultGradingScale();
}

/**
 * @param {number} percentage
 * @param {GradeBand[]|unknown} scale
 */
export function resolveGrade(percentage, scale) {
  const bands = normalizeGradingScale(scale);
  const pct = Number(percentage) || 0;
  const matched = bands.find((b) => pct >= b.minPercent) || bands[bands.length - 1];
  return {
    label: matched.label,
    minPercent: matched.minPercent,
    color: matched.color || '#0f6b4c',
    scale: bands,
  };
}

/**
 * Статистика по вопросам попытки.
 * @param {object[]} perQuestion
 */
export function summarizeAnswers(perQuestion) {
  const items = Array.isArray(perQuestion) ? perQuestion : [];
  let correct = 0;
  let incorrect = 0;
  let partial = 0;
  let skipped = 0;
  let info = 0;

  for (const item of items) {
    if (item.type === 'info' || Number(item.max) === 0) {
      info += 1;
      continue;
    }

    const awarded = Number(item.awarded) || 0;
    const max = Number(item.max) || 0;

    if (item.isCorrect === true || (max > 0 && awarded >= max)) {
      correct += 1;
    } else if (awarded > 0 && awarded < max) {
      partial += 1;
    } else {
      incorrect += 1;
    }
  }

  return {
    correct,
    incorrect,
    partial,
    skipped,
    info,
    scored: correct + incorrect + partial,
    total: items.length,
  };
}

/**
 * Минимальные баллы для оценки при известном maxScore.
 * @param {GradeBand[]|unknown} scale
 * @param {number} maxScore
 */
export function pointsForScale(scale, maxScore) {
  const max = Number(maxScore) || 0;
  return normalizeGradingScale(scale).map((b) => ({
    ...b,
    minPoints: Math.round(((b.minPercent / 100) * max) * 100) / 100,
  }));
}
