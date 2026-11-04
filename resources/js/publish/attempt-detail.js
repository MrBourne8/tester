import { withIcon } from '../ui/icons.js';
import { gradeLabel } from './stats-view.js';

/**
 * @param {{
 *   loading?: boolean,
 *   detail?: any|null,
 *   emptyHint?: string,
 * }} opts
 */
export function renderAttemptDetailPanel(opts = {}) {
  if (opts.loading) {
    return '<p class="muted">Загрузка подробностей…</p>';
  }
  const a = opts.detail;
  if (!a) {
    return `<p class="muted">${escapeHtml(opts.emptyHint || 'Выберите участника в таблице слева.')}</p>`;
  }
  const questions = Array.isArray(a.questions) ? a.questions : [];
  const stats = a.stats || {};
  return `
    <div class="detail-block">
      <div class="detail-title-row">
        <h3>${escapeHtml(a.student_name || '—')}</h3>
        <button type="button" class="btn btn-ghost btn-sm" data-action="close-detail">${withIcon('x', 'Закрыть')}</button>
      </div>
      <div class="kv">
        <div class="k">Баллы</div><div><strong>${escapeHtml(String(a.score ?? '—'))}</strong> / ${escapeHtml(String(a.max_score ?? '—'))} (${escapeHtml(String(a.percentage ?? '—'))}%)</div>
        <div class="k">Оценка</div><div>${escapeHtml(gradeLabel(a.grade))} ${a.passed == null ? '' : (a.passed ? '· порог пройден' : '· порог не пройден')}</div>
        <div class="k">Время теста</div><div>${escapeHtml(formatDuration(a.duration_seconds))}</div>
        <div class="k">Начало / сдача</div><div>${escapeHtml(formatDate(a.started_at))} → ${escapeHtml(formatDate(a.submitted_at))}</div>
        <div class="k">Устройство</div><div>${escapeHtml(a.client?.summary || 'Нет данных (старая попытка)')}</div>
        ${a.client?.user_agent ? `<div class="k">User-Agent</div><div class="ua">${escapeHtml(a.client.user_agent)}</div>` : ''}
        <div class="k">Уходы с окна</div><div>${escapeHtml(String(a.focus_loss_total ?? 0))}</div>
        <div class="k">Ответы</div><div>верно ${stats.correct ?? 0} · частично ${stats.partial ?? 0} · неверно ${stats.incorrect ?? 0}</div>
      </div>
    </div>
    <div class="detail-block">
      <h3>По вопросам</h3>
      <div class="pq-list">
        ${questions.length ? questions.map((q) => `
          <article class="pq-item is-${escapeAttr(q.status || 'pending')}">
            <header>
              <strong>${escapeHtml(String(q.index || ''))}. ${escapeHtml(truncate(q.prompt || q.question_id || 'Вопрос', 120))}</strong>
              <span class="pq-score">${escapeHtml(String(q.awarded ?? 0))}/${escapeHtml(String(q.max ?? 0))}</span>
            </header>
            <div class="pq-meta">
              <span>${escapeHtml(statusQuestionLabel(q.status))}</span>
              <span>Думал: <strong>${escapeHtml(formatDuration(q.dwell_seconds))}</strong></span>
              ${q.focus_loss?.count ? `<span>Уходов: <strong>${escapeHtml(String(q.focus_loss.count))}</strong></span>` : ''}
            </div>
            ${q.status !== 'info' ? `
              <div class="pq-answers">
                <div><span class="k">Ответ</span> ${escapeHtml(q.given || '—')}</div>
                <div><span class="k">Верный</span> ${escapeHtml(q.expected || '—')}</div>
              </div>` : ''}
          </article>`).join('') : '<p class="muted">Нет детализации по вопросам</p>'}
      </div>
    </div>`;
}

/**
 * @param {any[]} results
 * @param {{ selectedAttemptId?: number|null, detailHtml: string }} opts
 */
export function renderParticipantsReport(results, opts) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) {
    return '<p class="muted" style="margin:0">Нет участников по этой публикации.</p>';
  }
  const selectedId = opts.selectedAttemptId;
  return `
    <div class="report-layout">
      <div style="overflow:auto">
        <table class="results-table">
          <thead>
            <tr>
              <th>Участник</th>
              <th>Статус</th>
              <th>Баллы</th>
              <th>%</th>
              <th>Оценка</th>
              <th>Сдано</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((r) => `
              <tr class="is-clickable ${Number(r.attempt_id) === Number(selectedId) ? 'is-selected' : ''}"
                  data-attempt-id="${r.attempt_id || ''}"
                  ${r.attempt_id ? '' : 'aria-disabled="true"'}>
                <td>${escapeHtml(r.display_name || '—')}</td>
                <td>${escapeHtml(attemptLabel(r.attempt_status || r.participant_status))}</td>
                <td>${r.score != null ? `${r.score} / ${r.max_score ?? '—'}` : '—'}</td>
                <td>${r.percentage != null ? `${r.percentage}%` : '—'}</td>
                <td>${escapeHtml(gradeLabel(r.grade))}</td>
                <td>${escapeHtml(formatDate(r.submitted_at))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <aside class="report-detail" data-el="detail">
        ${opts.detailHtml}
      </aside>
    </div>`;
}

export async function fetchAttemptDetail(attemptId) {
  const res = await fetch(`/api/v1/reports/attempts/${attemptId}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Ошибка ${res.status}`);
  return data.data;
}

function attemptLabel(status) {
  return ({
    submitted: 'Сдано',
    in_progress: 'В процессе',
    joined: 'Вошёл',
    disconnected: 'Отключён',
  })[status] || status || '—';
}

function statusQuestionLabel(status) {
  return ({
    correct: 'Верно',
    partial: 'Частично',
    incorrect: 'Неверно',
    pending: 'Без ответа',
    info: 'Инфо',
  })[status] || status || '—';
}

function formatDate(value) {
  if (!value) return '—';
  const ts = Date.parse(String(value).replace(' ', 'T'));
  if (!Number.isFinite(ts)) return String(value);
  return new Date(ts).toLocaleString('ru-RU');
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null || totalSeconds === '') return '—';
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} ч ${String(m).padStart(2, '0')} мин ${String(s).padStart(2, '0')} с`;
  if (m > 0) return `${m} мин ${String(s).padStart(2, '0')} с`;
  return `${s} с`;
}

function truncate(value, max = 100) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
