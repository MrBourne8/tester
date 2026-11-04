import { renderDonutChart, renderPercentRing } from '../player/result-view.js';

/**
 * @param {any[]} results
 */
export function computePublishStats(results) {
  const list = Array.isArray(results) ? results : [];
  const total = list.length;
  const submitted = list.filter((r) => r.attempt_status === 'submitted' || r.submitted_at);
  const inProgress = list.filter((r) => r.attempt_status === 'in_progress');
  const percents = submitted
    .map((r) => Number(r.percentage))
    .filter((n) => Number.isFinite(n));
  const avgPercent = percents.length
    ? percents.reduce((s, n) => s + n, 0) / percents.length
    : 0;
  const best = percents.length ? Math.max(...percents) : null;
  const worst = percents.length ? Math.min(...percents) : null;
  const passed = submitted.filter((r) => r.passed === true
    || (r.passed == null && Number(r.percentage) >= 50)).length;
  const failed = Math.max(0, submitted.length - passed);
  const passRate = submitted.length ? (passed / submitted.length) * 100 : 0;

  /** @type {Record<string, number>} */
  const grades = {};
  submitted.forEach((r) => {
    const label = gradeLabel(r.grade);
    if (!label || label === '—') return;
    grades[label] = (grades[label] || 0) + 1;
  });

  let correct = 0;
  let incorrect = 0;
  let partial = 0;
  submitted.forEach((r) => {
    if (!r.stats || typeof r.stats !== 'object') return;
    correct += Number(r.stats.correct) || 0;
    incorrect += Number(r.stats.incorrect) || 0;
    partial += Number(r.stats.partial) || 0;
  });

  const buckets = [
    { label: '0–24%', min: 0, max: 25, count: 0, color: '#dc2626' },
    { label: '25–49%', min: 25, max: 50, count: 0, color: '#f59e0b' },
    { label: '50–74%', min: 50, max: 75, count: 0, color: '#3b82f6' },
    { label: '75–100%', min: 75, max: 101, count: 0, color: '#059669' },
  ];
  percents.forEach((p) => {
    const bucket = buckets.find((b) => p >= b.min && p < b.max);
    if (bucket) bucket.count += 1;
  });

  return {
    total,
    submitted: submitted.length,
    inProgress: inProgress.length,
    waiting: Math.max(0, total - submitted.length - inProgress.length),
    avgPercent,
    best,
    worst,
    passed,
    failed,
    passRate,
    grades,
    answerStats: { correct, incorrect, partial },
    buckets,
  };
}

/**
 * @param {any[]} results
 * @param {{ emptyHint?: string }} [opts]
 */
export function renderPublishStatsSection(results, opts = {}) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) {
    return `
      <section class="publish-card pub-stats">
        <h2>Общая статистика</h2>
        <p class="muted" style="margin:0">${escapeHtml(opts.emptyHint || 'После прохождений здесь появятся диаграммы успеваемости группы.')}</p>
      </section>`;
  }

  const s = computePublishStats(list);
  const gradeEntries = Object.entries(s.grades).sort((a, b) => String(b[0]).localeCompare(String(a[0]), 'ru'));
  const maxGrade = Math.max(1, ...gradeEntries.map(([, n]) => n));
  const maxBucket = Math.max(1, ...s.buckets.map((b) => b.count));
  const hasAnswers = (s.answerStats.correct + s.answerStats.incorrect + s.answerStats.partial) > 0;

  return `
    <section class="publish-card pub-stats">
      <div class="report-head">
        <h2 style="margin:0">Общая статистика</h2>
        <p class="muted" style="margin:0">${s.submitted} сдано из ${s.total} участников</p>
      </div>

      <div class="pub-stat-cards">
        ${statCard('Участников', String(s.total), 'всего по ссылке')}
        ${statCard('Сдано', String(s.submitted), pctOf(s.submitted, s.total))}
        ${statCard('Средний %', s.submitted ? `${s.avgPercent.toFixed(1)}%` : '—', s.best != null ? `лучш. ${s.best}% · худш. ${s.worst}%` : 'нет сдач')}
        ${statCard('Прошли порог', s.submitted ? `${s.passed}` : '—', s.submitted ? `${s.passRate.toFixed(0)}% от сдавших` : 'нет сдач')}
      </div>

      <div class="pub-stats-grid">
        <div class="pub-stats-panel">
          <h3>Успеваемость</h3>
          <div class="pub-stats-visual">
            ${renderPercentRing(s.avgPercent, s.passRate >= 50, { centerSub: 'средний %' })}
            <div class="pub-stats-legend">
              <div class="pub-legend-row"><span class="dot ok"></span> Прошли порог <strong>${s.passed} · ${s.submitted ? Math.round((s.passed / s.submitted) * 100) : 0}%</strong></div>
              <div class="pub-legend-row"><span class="dot bad"></span> Не прошли <strong>${s.failed} · ${s.submitted ? Math.round((s.failed / s.submitted) * 100) : 0}%</strong></div>
              <div class="pub-legend-row"><span class="dot skip"></span> В процессе <strong>${s.inProgress}</strong></div>
              <div class="result-meter" aria-hidden="true" style="margin-top:0.55rem">
                <div class="result-meter-fill" style="width:${Math.min(100, s.passRate)}%;background:#059669"></div>
              </div>
              <p class="pub-hint">Доля сдавших, прошедших порог</p>
            </div>
          </div>
        </div>

        <div class="pub-stats-panel">
          <h3>Статусы участников</h3>
          <div class="pub-stats-visual">
            ${renderDonutChart({
              correct: s.submitted,
              partial: s.inProgress,
              incorrect: Math.max(0, s.total - s.submitted - s.inProgress),
            }, { centerLabel: String(s.total), centerSub: 'всего' })}
            <div class="pub-stats-legend">
              <div class="pub-legend-row"><span class="dot ok"></span> Сдано <strong>${s.submitted} · ${pctOf(s.submitted, s.total)}</strong></div>
              <div class="pub-legend-row"><span class="dot partial"></span> В процессе <strong>${s.inProgress} · ${pctOf(s.inProgress, s.total)}</strong></div>
              <div class="pub-legend-row"><span class="dot bad"></span> Без сдачи <strong>${Math.max(0, s.total - s.submitted - s.inProgress)} · ${pctOf(Math.max(0, s.total - s.submitted - s.inProgress), s.total)}</strong></div>
            </div>
          </div>
        </div>

        <div class="pub-stats-panel">
          <h3>Распределение по %</h3>
          <div class="pub-hist">
            ${s.buckets.map((b) => `
              <div class="pub-hist-col" title="${escapeAttr(b.label)}: ${b.count}">
                <div class="pub-hist-bar-wrap">
                  <div class="pub-hist-bar" style="height:${Math.round((b.count / maxBucket) * 100)}%;background:${b.color}"></div>
                </div>
                <strong>${b.count}</strong>
                <span>${escapeHtml(b.label)}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="pub-stats-panel">
          <h3>Оценки</h3>
          ${gradeEntries.length ? `
            <div class="result-bars">
              ${gradeEntries.map(([label, count]) => {
                const pct = Math.round((count / s.submitted) * 100);
                const width = Math.round((count / maxGrade) * 100);
                return `
                  <div class="result-bar-row">
                    <div class="result-bar-label">
                      <span>Оценка ${escapeHtml(label)}</span>
                      <strong>${count} · ${pct}%</strong>
                    </div>
                    <div class="result-bar-track">
                      <div class="result-bar-fill" style="width:${width}%;background:#2563eb"></div>
                    </div>
                  </div>`;
              }).join('')}
            </div>` : '<p class="muted">Нет оценок</p>'}
          ${hasAnswers ? `
            <h3 style="margin-top:1rem">Ответы по всем сдавшим</h3>
            <div class="pub-stats-visual">
              ${renderDonutChart(s.answerStats, {
                centerLabel: `${Math.round((s.answerStats.correct / Math.max(1, s.answerStats.correct + s.answerStats.incorrect + s.answerStats.partial)) * 100)}%`,
                centerSub: 'верно',
              })}
              <div class="pub-stats-legend">
                <div class="pub-legend-row"><span class="dot ok"></span> Верно <strong>${s.answerStats.correct}</strong></div>
                <div class="pub-legend-row"><span class="dot partial"></span> Частично <strong>${s.answerStats.partial}</strong></div>
                <div class="pub-legend-row"><span class="dot bad"></span> Неверно <strong>${s.answerStats.incorrect}</strong></div>
              </div>
            </div>` : ''}
        </div>
      </div>
    </section>`;
}

export function gradeLabel(grade) {
  if (!grade) return '—';
  if (typeof grade === 'string' || typeof grade === 'number') return String(grade);
  return String(grade.label ?? grade.value ?? '—');
}

function statCard(title, value, hint) {
  return `
    <div class="pub-stat-card">
      <span class="pub-stat-title">${escapeHtml(title)}</span>
      <strong class="pub-stat-value">${escapeHtml(value)}</strong>
      <span class="pub-stat-hint">${escapeHtml(hint || '')}</span>
    </div>`;
}

function pctOf(part, total) {
  if (!total) return '0%';
  return `${Math.round((Number(part) / Number(total)) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
