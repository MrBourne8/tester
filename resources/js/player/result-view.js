import { escapeHtml } from './render.js';

/**
 * SVG-кольцевая диаграмма правильных / частичных / неправильных.
 * @param {{ correct: number, incorrect: number, partial?: number }} stats
 */
export function renderDonutChart(stats) {
  const correct = Number(stats.correct) || 0;
  const incorrect = Number(stats.incorrect) || 0;
  const partial = Number(stats.partial) || 0;
  const total = correct + incorrect + partial;

  if (total === 0) {
    return `<div class="donut empty-donut" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="42" fill="none" stroke="#d5ddd8" stroke-width="16"/></svg>
      <div class="donut-center"><span>0</span><small>ответов</small></div>
    </div>`;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { value: correct, color: '#0f6b4c' },
    { value: partial, color: '#b7791f' },
    { value: incorrect, color: '#9b2c2c' },
  ].filter((s) => s.value > 0);

  let offset = 0;
  const arcs = segments
    .map((s) => {
      const len = (s.value / total) * circumference;
      const arc = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${s.color}" stroke-width="16"
        stroke-dasharray="${len} ${circumference - len}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 60 60)" />`;
      offset += len;
      return arc;
    })
    .join('');

  return `<div class="donut" role="img" aria-label="Правильных ${correct}, частично ${partial}, неверных ${incorrect}">
    <svg viewBox="0 0 120 120">${arcs}</svg>
    <div class="donut-center"><span>${Math.round((correct / total) * 100)}%</span><small>верно</small></div>
  </div>`;
}

/**
 * @param {object} resultPayload
 * @param {object} settings
 * @param {string} [statusMessage]
 */
export function renderResultScreen(resultPayload, settings, statusMessage = '') {
  const showScore = settings.showScore !== false;
  const stats = resultPayload.stats || { correct: 0, incorrect: 0, partial: 0 };
  const grade = resultPayload.grade;
  const duration = formatDuration(resultPayload.durationSeconds);

  if (!showScore) {
    return `
      <section class="player-shell result-shell">
        <h1>Тест завершён</h1>
        <p>Результат сохранён. Показ баллов отключён настройками теста.</p>
        <p class="meta">Время прохождения: <strong>${escapeHtml(duration)}</strong></p>
        ${statusMessage ? `<p class="error">${escapeHtml(statusMessage)}</p>` : ''}
        <div class="player-nav">
          <button type="button" class="btn btn-primary" data-action="download">Скачать .result</button>
          <button type="button" class="btn" data-action="again">Пройти снова</button>
        </div>
      </section>`;
  }

  return `
    <section class="player-shell result-shell">
      <h1>Тест завершён</h1>
      ${statusMessage ? `<p class="error">${escapeHtml(statusMessage)}</p>` : ''}

      <div class="result-grid">
        <div class="result-main">
          <div class="grade-badge" style="--grade-color:${escapeHtml(grade?.color || '#0f6b4c')}">
            <span class="grade-label">Оценка</span>
            <strong class="grade-value">${escapeHtml(grade?.label || '—')}</strong>
          </div>
          <p class="result-score">
            Баллы: <strong>${resultPayload.score}</strong> / ${resultPayload.maxScore}
            (${resultPayload.percentage}%)
          </p>
          <p class="${resultPayload.passed ? 'pass-ok' : 'pass-bad'}">
            ${resultPayload.passed ? 'Порог пройден' : 'Порог не пройден'}
            (нужно ≥ ${resultPayload.passThresholdPercent}%)
          </p>
        </div>
        ${renderDonutChart(stats)}
      </div>

      <ul class="result-stats">
        <li><span class="dot ok"></span> Правильных: <strong>${stats.correct ?? 0}</strong></li>
        ${stats.partial ? `<li><span class="dot partial"></span> Частично: <strong>${stats.partial}</strong></li>` : ''}
        <li><span class="dot bad"></span> Неправильных: <strong>${stats.incorrect ?? 0}</strong></li>
        <li>Время прохождения: <strong>${escapeHtml(duration)}</strong></li>
        ${resultPayload.studentName ? `<li>Участник: <strong>${escapeHtml(resultPayload.studentName)}</strong></li>` : ''}
      </ul>

      <div class="player-nav">
        <button type="button" class="btn btn-primary" data-action="download">Скачать .result</button>
        <button type="button" class="btn" data-action="again">Пройти снова</button>
      </div>
    </section>`;
}

export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h} ч ${String(m).padStart(2, '0')} мин ${String(s).padStart(2, '0')} с`;
  }
  if (m > 0) {
    return `${m} мин ${String(s).padStart(2, '0')} с`;
  }
  return `${s} с`;
}
