import { brandLockup } from '../ui/brand.js';
import { escapeHtml } from './render.js';

/**
 * SVG-кольцевая диаграмма правильных / частичных / неправильных.
 * @param {{ correct: number, incorrect: number, partial?: number, skipped?: number }} stats
 * @param {{ centerLabel?: string, centerSub?: string }} [opts]
 */
export function renderDonutChart(stats, opts = {}) {
  const correct = Number(stats.correct) || 0;
  const incorrect = Number(stats.incorrect) || 0;
  const partial = Number(stats.partial) || 0;
  const skipped = Number(stats.skipped) || 0;
  const total = correct + incorrect + partial + skipped;

  if (total === 0) {
    return `<div class="donut empty-donut" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="42" fill="none" stroke="#e2e8f0" stroke-width="16"/></svg>
      <div class="donut-center"><span>0</span><small>ответов</small></div>
    </div>`;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { value: correct, color: '#059669' },
    { value: partial, color: '#d97706' },
    { value: incorrect, color: '#dc2626' },
    { value: skipped, color: '#94a3b8' },
  ].filter((s) => s.value > 0);

  let offset = 0;
  const arcs = segments
    .map((s) => {
      const len = (s.value / total) * circumference;
      const arc = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${s.color}" stroke-width="16"
        stroke-dasharray="${len} ${circumference - len}"
        stroke-dashoffset="${-offset}"
        stroke-linecap="butt"
        transform="rotate(-90 60 60)" />`;
      offset += len;
      return arc;
    })
    .join('');

  const centerLabel = opts.centerLabel ?? `${Math.round((correct / total) * 100)}%`;
  const centerSub = opts.centerSub ?? 'верно';

  return `<div class="donut" role="img" aria-label="Правильных ${correct}, частично ${partial}, неверных ${incorrect}">
    <svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="16"/>
      ${arcs}
    </svg>
    <div class="donut-center"><span>${escapeHtml(String(centerLabel))}</span><small>${escapeHtml(centerSub)}</small></div>
  </div>`;
}

/**
 * Кольцо процента набранных баллов.
 * @param {number} percentage
 * @param {boolean} passed
 * @param {{ centerSub?: string }} [opts]
 */
export function renderPercentRing(percentage, passed = false, opts = {}) {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const len = (pct / 100) * circumference;
  const color = passed ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
  const centerSub = opts.centerSub || 'результат';

  return `
    <div class="pct-ring" role="img" aria-label="Набрано ${pct}%">
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="12"/>
        <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${color}" stroke-width="12"
          stroke-dasharray="${len} ${circumference - len}"
          stroke-linecap="round"
          transform="rotate(-90 70 70)" />
      </svg>
      <div class="pct-ring-center">
        <strong>${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%</strong>
        <span>${escapeHtml(centerSub)}</span>
      </div>
    </div>`;
}

/**
 * @param {number} value
 * @param {number} max
 * @param {string} [color]
 */
export function renderMeter(value, max, color = 'var(--brand)') {
  const safeMax = Number(max) > 0 ? Number(max) : 1;
  const pct = Math.max(0, Math.min(100, (Number(value) / safeMax) * 100));
  return `
    <div class="result-meter" aria-hidden="true">
      <div class="result-meter-fill" style="width:${pct}%;background:${color}"></div>
    </div>`;
}

/**
 * Горизонтальные полосы по типам ответов.
 * @param {{ correct?: number, incorrect?: number, partial?: number, skipped?: number }} stats
 */
export function renderAnswerBars(stats) {
  const rows = [
    { key: 'correct', label: 'Верно', value: Number(stats.correct) || 0, color: '#059669' },
    { key: 'partial', label: 'Частично', value: Number(stats.partial) || 0, color: '#d97706' },
    { key: 'incorrect', label: 'Неверно', value: Number(stats.incorrect) || 0, color: '#dc2626' },
    { key: 'skipped', label: 'Пропущено', value: Number(stats.skipped) || 0, color: '#94a3b8' },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;

  return `
    <div class="result-bars">
      ${rows.filter((r) => r.value > 0 || r.key === 'correct' || r.key === 'incorrect').map((r) => {
        const pct = Math.round((r.value / total) * 100);
        return `
          <div class="result-bar-row">
            <div class="result-bar-label">
              <span>${escapeHtml(r.label)}</span>
              <strong>${r.value} · ${pct}%</strong>
            </div>
            <div class="result-bar-track">
              <div class="result-bar-fill" style="width:${pct}%;background:${r.color}"></div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/**
 * @param {object} resultPayload
 * @param {object} settings
 * @param {string} [statusMessage]
 */
export function renderResultScreen(resultPayload, settings, statusMessage = '') {
  const showScore = settings.showScore !== false;
  const html = renderNetworkResultBody(resultPayload, { showScore, statusMessage });
  return `
    <section class="player-shell result-shell">
      ${html}
      <div class="player-nav">
        <button type="button" class="btn btn-primary" data-action="download">Скачать .result</button>
        <button type="button" class="btn" data-action="again">Пройти снова</button>
      </div>
    </section>`;
}

/**
 * Экран результата для сетевого / опубликованного теста.
 * @param {object|null} attempt
 * @param {{ leaveLabel?: string }} [opts]
 */
export function renderNetworkResultScreen(attempt, opts = {}) {
  if (!attempt) {
    return `
      <div class="join-wrap join-wrap--result">
        <section class="panel result-panel">
          ${brandLockup({ compact: true })}
          <h1 class="result-title">Тест завершён</h1>
          <p class="muted">Результаты доступны у преподавателя.</p>
          <div class="result-actions">
            <button type="button" class="btn btn-primary" data-action="leave">${escapeHtml(opts.leaveLabel || 'Выйти')}</button>
          </div>
        </section>
      </div>`;
  }

  const showScore = attempt.showScore !== false;
  return `
    <div class="join-wrap join-wrap--result">
      <section class="panel result-panel">
        ${renderNetworkResultBody(attempt, { showScore })}
        <div class="result-actions">
          <button type="button" class="btn btn-primary" data-action="leave">${escapeHtml(opts.leaveLabel || 'Выйти')}</button>
        </div>
      </section>
    </div>`;
}

/**
 * @param {object} data
 * @param {{ showScore?: boolean, statusMessage?: string }} [opts]
 */
function renderNetworkResultBody(data, opts = {}) {
  const showScore = opts.showScore !== false;
  const stats = data.stats || { correct: 0, incorrect: 0, partial: 0, skipped: 0 };
  const grade = data.grade || {};
  const percentage = Number(data.percentage) || 0;
  const passed = Boolean(data.passed);
  const threshold = data.passThresholdPercent ?? 50;
  const duration = formatDuration(data.durationSeconds);
  const score = Number(data.score) || 0;
  const maxScore = Number(data.maxScore) || 0;
  const gradeColor = grade.color || (passed ? '#059669' : '#dc2626');
  const answered = (Number(stats.correct) || 0)
    + (Number(stats.incorrect) || 0)
    + (Number(stats.partial) || 0)
    + (Number(stats.skipped) || 0);

  if (!showScore) {
    return `
      ${brandLockup({ compact: true })}
      <h1 class="result-title">Тест завершён</h1>
      <p class="result-lead">Ответы приняты. Показ баллов отключён настройками теста.</p>
      <p class="meta">Время прохождения: <strong>${escapeHtml(duration)}</strong></p>
      ${opts.statusMessage ? `<p class="error">${escapeHtml(opts.statusMessage)}</p>` : ''}`;
  }

  return `
    ${brandLockup({ compact: true })}
    <div class="result-hero ${passed ? 'is-pass' : 'is-fail'}">
      <div>
        <p class="result-kicker">${passed ? 'Порог пройден' : 'Порог не пройден'}</p>
        <h1 class="result-title">${escapeHtml(data.title || 'Тест завершён')}</h1>
        <p class="result-lead">
          ${data.studentName ? `Участник: <strong>${escapeHtml(data.studentName)}</strong> · ` : ''}
          Ответы приняты и сохранены
        </p>
      </div>
      <div class="grade-badge grade-badge--lg" style="--grade-color:${escapeHtml(gradeColor)}">
        <span class="grade-label">Оценка</span>
        <strong class="grade-value">${escapeHtml(grade.label || '—')}</strong>
      </div>
    </div>
    ${opts.statusMessage ? `<p class="error">${escapeHtml(opts.statusMessage)}</p>` : ''}

    <div class="result-dashboard">
      <div class="result-dash-main">
        ${renderPercentRing(percentage, passed)}
        <div class="result-score-block">
          <div class="result-score-line">
            <span>Баллы</span>
            <strong>${formatNumber(score)} / ${formatNumber(maxScore)}</strong>
          </div>
          ${renderMeter(score, maxScore, gradeColor)}
          <div class="result-score-line">
            <span>До порога ≥ ${threshold}%</span>
            <strong class="${passed ? 'pass-ok' : 'pass-bad'}">${percentage.toFixed(1)}%</strong>
          </div>
          ${renderMeter(Math.min(percentage, 100), 100, passed ? '#059669' : '#f59e0b')}
          <p class="result-threshold-hint">
            ${passed
              ? `Выше порога на ${(percentage - threshold).toFixed(1)} п.п.`
              : `До порога не хватает ${(threshold - percentage).toFixed(1)} п.п.`}
          </p>
        </div>
      </div>

      <div class="result-dash-side">
        <h2 class="result-section-title">Разбор ответов</h2>
        <div class="result-mini-grid">
          ${statCard('Верно', stats.correct ?? 0, answered, '#059669')}
          ${statCard('Частично', stats.partial ?? 0, answered, '#d97706')}
          ${statCard('Неверно', stats.incorrect ?? 0, answered, '#dc2626')}
          ${statCard('Пропущено', stats.skipped ?? 0, answered, '#64748b')}
        </div>
        ${renderAnswerBars(stats)}
        <div class="result-donut-row">
          ${renderDonutChart(stats, {
            centerLabel: String(answered),
            centerSub: 'вопросов',
          })}
          <ul class="result-stats result-stats--compact">
            <li><span class="dot ok"></span> Правильных: <strong>${stats.correct ?? 0}</strong></li>
            ${(stats.partial ?? 0) > 0 ? `<li><span class="dot partial"></span> Частично: <strong>${stats.partial}</strong></li>` : ''}
            <li><span class="dot bad"></span> Неправильных: <strong>${stats.incorrect ?? 0}</strong></li>
            ${(stats.skipped ?? 0) > 0 ? `<li><span class="dot skip"></span> Пропущено: <strong>${stats.skipped}</strong></li>` : ''}
            <li>Время: <strong>${escapeHtml(duration)}</strong></li>
          </ul>
        </div>
      </div>
    </div>`;
}

function statCard(label, value, total, color) {
  const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0;
  return `
    <div class="result-stat-card" style="--stat-color:${color}">
      <span class="result-stat-value">${Number(value) || 0}</span>
      <span class="result-stat-label">${escapeHtml(label)}</span>
      <span class="result-stat-pct">${pct}%</span>
    </div>`;
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
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
