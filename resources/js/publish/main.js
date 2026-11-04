import QRCode from 'qrcode';
import '../../css/publish.css';
import { icon, withIcon } from '../ui/icons.js';
import { bindSidebar, navBackIcon, renderAppShell } from '../ui/shell.js';
import {
  fetchAttemptDetail,
  renderAttemptDetailPanel,
  renderParticipantsReport,
} from './attempt-detail.js';
import { renderPublishStatsSection } from './stats-view.js';

const root = document.getElementById('publish-app');
if (!root) throw new Error('Контейнер публикации не найден');

const quizId = root.dataset.quizId ? Number(root.dataset.quizId) : null;
if (!quizId) {
  root.innerHTML = '<p class="error" style="padding:1.5rem">Не указан тест</p>';
  throw new Error('quiz id required');
}

const DURATIONS = [
  { hours: 1, label: '1 час' },
  { hours: 6, label: '6 часов' },
  { hours: 12, label: '12 часов' },
  { hours: 24, label: '1 сутки' },
  { hours: 72, label: '3 суток' },
  { hours: 168, label: '7 суток' },
  { hours: 720, label: '30 суток' },
];

/** @type {any} */
let payload = null;
/** @type {any[]} */
let results = [];
/** @type {any|null} */
let selectedDetail = null;
/** @type {number|null} */
let selectedAttemptId = null;
let detailLoading = false;
let statusText = '';
let durationHours = 24;

boot().catch((e) => {
  root.innerHTML = `<p class="error" style="padding:1.5rem">${escapeHtml(e.message)}</p>`;
});

async function boot() {
  await refresh();
}

async function refresh() {
  const [info, res] = await Promise.all([
    apiJson(`/api/v1/quizzes/${quizId}/publication`),
    apiJson(`/api/v1/quizzes/${quizId}/publication/results`).catch(() => ({ data: [] })),
  ]);
  payload = info.data;
  results = Array.isArray(res.data) ? res.data : [];
  if (payload?.publication?.duration_hours) {
    durationHours = Number(payload.publication.duration_hours) || 24;
  }
  render();
}

function render() {
  const quiz = payload?.quiz || {};
  const pub = payload?.publication;
  const active = pub?.status === 'active';

  root.innerHTML = renderAppShell('tests', {
    title: `
      <a class="nav-back" href="/editor/${quizId}">${navBackIcon()}К редактору</a>
      <h1 class="app-title">Публикация теста</h1>
      <p class="app-subtitle">${escapeHtml(quiz.title || 'Тест')}${quiz.version_number ? ` · версия ${quiz.version_number}` : ''}</p>`,
    topRight: `
      <a class="btn btn-ghost" href="/published">${withIcon('layers', 'Опубликованные')}</a>
      ${statusText ? `<span class="status-pill">${escapeHtml(statusText)}</span>` : ''}`,
    content: `
      <div class="publish-grid">
        <section class="publish-card">
          <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:center;flex-wrap:wrap">
            <h2 style="margin:0">Ссылка и QR-код</h2>
            ${pub ? `<span class="publish-status is-${escapeAttr(pub.status)}">${statusLabel(pub.status)}</span>` : ''}
          </div>
          ${active ? renderActive(pub) : renderInactive(pub)}
        </section>

        <aside class="publish-card">
          <h2>Срок действия</h2>
          <label class="field">Длительность ссылки
            <select class="input" data-el="duration">
              ${DURATIONS.map((d) => `
                <option value="${d.hours}" ${d.hours === durationHours ? 'selected' : ''}>${d.label}</option>
              `).join('')}
            </select>
          </label>
          <div class="publish-actions">
            ${!pub || pub.status !== 'active'
              ? `<button type="button" class="btn btn-primary" data-action="publish">${withIcon('share', pub ? 'Опубликовать повторно' : 'Опубликовать')}</button>`
              : `
                <button type="button" class="btn btn-soft" data-action="extend">${withIcon('save', 'Обновить срок')}</button>
                <button type="button" class="btn btn-primary" data-action="republish">${withIcon('share', 'Опубликовать заново')}</button>
                <button type="button" class="btn btn-danger" data-action="revoke">${withIcon('x', 'Отозвать')}</button>`}
          </div>
          <p class="hint" style="margin-top:0.85rem">По ссылке и QR ученики проходят тест через интернет без кода занятия. После истечения срока ссылка перестаёт работать. Статистику всех публикаций смотрите в разделе «Опубликованные».</p>
        </aside>
      </div>

      ${renderPublishStatsSection(results)}

      <section class="publish-card">
        <div class="report-head">
          <h2 style="margin:0">Отчёт по ссылке</h2>
          <p class="muted" style="margin:0">Нажмите на участника, чтобы открыть подробности</p>
        </div>
        ${results.length === 0
          ? '<p class="muted">Пока нет прохождений по этой публикации.</p>'
          : renderParticipantsReport(results, {
            selectedAttemptId,
            detailHtml: renderAttemptDetailPanel({
              loading: detailLoading,
              detail: selectedDetail,
            }),
          })}
      </section>`,
  });

  bind();
  bindSidebar(root);
  if (active) drawQr(publicUrl(pub));
}

async function openAttemptDetail(attemptId) {
  if (!attemptId) return;
  selectedAttemptId = Number(attemptId);
  detailLoading = true;
  selectedDetail = null;
  render();
  try {
    selectedDetail = await fetchAttemptDetail(attemptId);
  } catch (e) {
    selectedAttemptId = null;
    selectedDetail = null;
    alert(e.message || 'Не удалось загрузить подробности');
  } finally {
    detailLoading = false;
    render();
  }
}

function renderActive(pub) {
  const url = publicUrl(pub);
  return `
    <p class="muted" style="margin:0.55rem 0 0">Отправьте ссылку или QR ученикам для самостоятельного прохождения.</p>
    <div class="publish-url-row">
      <input class="input" readonly data-el="url" value="${escapeAttr(url)}">
      <button type="button" class="btn btn-soft" data-action="copy">${withIcon('copy', 'Копировать')}</button>
      <a class="btn btn-ghost" href="${escapeAttr(url)}" target="_blank" rel="noopener">${withIcon('eye', 'Открыть')}</a>
    </div>
    <div class="publish-qr-wrap">
      <canvas data-el="qr" width="200" height="200" aria-label="QR-код публикации"></canvas>
      <span class="muted" style="font-size:0.82rem">QR ведёт на страницу прохождения</span>
    </div>
    <ul class="publish-meta">
      <li><span>Действует до</span><strong>${escapeHtml(formatDate(pub.expires_at))}</strong></li>
      <li><span>Осталось</span><strong>${escapeHtml(formatRemaining(pub.remaining_seconds))}</strong></li>
      <li><span>Длительность</span><strong>${escapeHtml(durationLabel(pub.duration_hours))}</strong></li>
    </ul>`;
}

function renderInactive(pub) {
  if (!pub) {
    return `<p class="muted" style="margin:0.55rem 0 0">Тест ещё не опубликован. Выберите срок действия и нажмите «Опубликовать».</p>`;
  }
  return `
    <p class="muted" style="margin:0.55rem 0 0">
      Публикация ${pub.status === 'expired' ? 'истекла' : 'отозвана'}
      ${pub.expires_at ? ` (${escapeHtml(formatDate(pub.expires_at))})` : ''}.
      Опубликуйте повторно, чтобы снова открыть доступ.
    </p>`;
}

function bind() {
  root.querySelector('[data-el="duration"]')?.addEventListener('change', (e) => {
    durationHours = Number(e.target.value) || 24;
  });
  root.querySelector('[data-action="publish"]')?.addEventListener('click', async () => {
    try {
      const res = await apiJson(`/api/v1/quizzes/${quizId}/publication${payload?.publication ? '/republish' : ''}`, {
        method: 'POST',
        body: JSON.stringify({ duration_hours: durationHours }),
      });
      payload = res.data;
      statusText = 'Опубликовано';
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  });
  root.querySelector('[data-action="republish"]')?.addEventListener('click', async () => {
    if (!confirm('Создать новую публикацию? Текущая ссылка перестанет принимать новых участников.')) return;
    try {
      const res = await apiJson(`/api/v1/quizzes/${quizId}/publication/republish`, {
        method: 'POST',
        body: JSON.stringify({ duration_hours: durationHours }),
      });
      payload = res.data;
      statusText = 'Опубликовано заново';
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  });
  root.querySelector('[data-action="extend"]')?.addEventListener('click', async () => {
    try {
      const res = await apiJson(`/api/v1/quizzes/${quizId}/publication`, {
        method: 'PUT',
        body: JSON.stringify({ duration_hours: durationHours }),
      });
      payload = res.data;
      statusText = 'Срок обновлён';
      render();
    } catch (e) {
      alert(e.message);
    }
  });
  root.querySelector('[data-action="revoke"]')?.addEventListener('click', async () => {
    if (!confirm('Отозвать публикацию? Ссылка и QR перестанут работать.')) return;
    try {
      const res = await apiJson(`/api/v1/quizzes/${quizId}/publication`, { method: 'DELETE' });
      payload = res.data;
      statusText = 'Публикация отозвана';
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  });
  root.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    const url = root.querySelector('[data-el="url"]')?.value || '';
    try {
      await navigator.clipboard.writeText(url);
      statusText = 'Ссылка скопирована';
      render();
    } catch {
      alert('Не удалось скопировать');
    }
  });
  root.querySelectorAll('[data-attempt-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = Number(row.getAttribute('data-attempt-id'));
      if (!id) return;
      openAttemptDetail(id);
    });
  });
  root.querySelector('[data-action="close-detail"]')?.addEventListener('click', () => {
    selectedAttemptId = null;
    selectedDetail = null;
    render();
  });
}

async function drawQr(url) {
  const canvas = root.querySelector('[data-el="qr"]');
  if (!canvas || !url) return;
  await QRCode.toCanvas(canvas, url, { width: 200, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
}

function publicUrl(pub) {
  if (!pub) return '';
  if (pub.url && String(pub.url).startsWith('http')) return pub.url;
  const path = pub.path || `/p/${pub.slug}`;
  return `${window.location.origin}${path}`;
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Ошибка ${res.status}`);
  return data;
}

function statusLabel(status) {
  return ({ active: 'Активна', expired: 'Истекла', revoked: 'Отозвана' })[status] || status || '—';
}

function durationLabel(hours) {
  const hit = DURATIONS.find((d) => d.hours === Number(hours));
  return hit ? hit.label : `${hours} ч`;
}

function formatRemaining(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)} д ${h % 24} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function formatDate(value) {
  if (!value) return '—';
  const ts = Date.parse(String(value).replace(' ', 'T'));
  if (!Number.isFinite(ts)) return String(value);
  return new Date(ts).toLocaleString('ru-RU');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
