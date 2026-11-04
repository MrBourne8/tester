import '../../css/published.css';
import { withIcon } from '../ui/icons.js';
import {
  fetchAttemptDetail,
  renderAttemptDetailPanel,
  renderParticipantsReport,
} from '../publish/attempt-detail.js';
import { renderPublishStatsSection } from '../publish/stats-view.js';
import { bindSidebar, navBackIcon, renderAppShell } from '../ui/shell.js';

const root = document.getElementById('published-app');
if (!root) throw new Error('Контейнер опубликованных не найден');

/** @type {any[]} */
let publications = [];
/** @type {number|null} */
let selectedId = null;
/** @type {any|null} */
let selectedMeta = null;
/** @type {any[]} */
let results = [];
let loadingDetail = false;
/** @type {number|null} */
let selectedAttemptId = null;
/** @type {any|null} */
let selectedAttempt = null;
let attemptLoading = false;
let filter = 'all';
let search = '';
let statusText = '';

const params = new URLSearchParams(window.location.search);
const preselectId = params.get('id') ? Number(params.get('id')) : null;
const preselectQuiz = params.get('quiz') ? Number(params.get('quiz')) : null;

boot().catch((e) => {
  root.innerHTML = `<p class="error" style="padding:1.5rem">${escapeHtml(e.message)}</p>`;
});

async function boot() {
  await loadList();
  if (preselectId) {
    await selectPublication(preselectId);
  } else if (preselectQuiz) {
    const hit = publications.find((p) => Number(p.quiz_id) === preselectQuiz);
    if (hit) await selectPublication(hit.id);
  } else {
    render();
  }
}

async function loadList() {
  const res = await apiJson('/api/v1/publications');
  publications = Array.isArray(res.data) ? res.data : [];
  render();
}

async function selectPublication(id) {
  selectedId = Number(id);
  loadingDetail = true;
  selectedMeta = null;
  results = [];
  selectedAttemptId = null;
  selectedAttempt = null;
  render();
  try {
    const [info, res] = await Promise.all([
      apiJson(`/api/v1/publications/${selectedId}`),
      apiJson(`/api/v1/publications/${selectedId}/results`),
    ]);
    selectedMeta = info.data;
    results = Array.isArray(res.data) ? res.data : [];
    const url = new URL(window.location.href);
    url.searchParams.set('id', String(selectedId));
    window.history.replaceState({}, '', url);
  } catch (e) {
    statusText = e.message || 'Не удалось загрузить';
    selectedId = null;
  } finally {
    loadingDetail = false;
    render();
  }
}

async function openAttemptDetail(attemptId) {
  if (!attemptId) return;
  selectedAttemptId = Number(attemptId);
  attemptLoading = true;
  selectedAttempt = null;
  render();
  try {
    selectedAttempt = await fetchAttemptDetail(selectedAttemptId);
  } catch (e) {
    selectedAttemptId = null;
    selectedAttempt = null;
    alert(e.message || 'Не удалось загрузить подробности');
  } finally {
    attemptLoading = false;
    render();
  }
}

function filteredList() {
  const q = search.trim().toLowerCase();
  return publications.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (!q) return true;
    return String(p.quiz_title || '').toLowerCase().includes(q)
      || String(p.slug || '').toLowerCase().includes(q);
  });
}

function render() {
  const list = filteredList();
  const pub = selectedMeta?.publication;
  const quiz = selectedMeta?.quiz;

  root.innerHTML = renderAppShell('published', {
    title: `
      <a class="nav-back" href="/">${navBackIcon()}На главную</a>
      <h1 class="app-title">Опубликованные</h1>
      <p class="app-subtitle">Статистика прохождений по ссылкам — в любое время</p>`,
    topRight: statusText ? `<span class="status-pill">${escapeHtml(statusText)}</span>` : '',
    content: `
      <div class="pubd-layout">
        <section class="publish-card pubd-list-panel">
          <div class="pubd-list-head">
            <h2 style="margin:0">Публикации</h2>
            <span class="muted" style="font-size:0.82rem;font-weight:700">${publications.length}</span>
          </div>
          <div class="pubd-filters">
            <input class="input" data-el="search" placeholder="Поиск по названию" value="${escapeAttr(search)}">
            <select class="input" data-el="filter">
              <option value="all" ${filter === 'all' ? 'selected' : ''}>Все статусы</option>
              <option value="active" ${filter === 'active' ? 'selected' : ''}>Активные</option>
              <option value="expired" ${filter === 'expired' ? 'selected' : ''}>Истёкшие</option>
              <option value="revoked" ${filter === 'revoked' ? 'selected' : ''}>Отозванные</option>
            </select>
          </div>
          <div class="pubd-list">
            ${list.length === 0
              ? `<p class="muted" style="margin:0.5rem 0 0">${publications.length ? 'Ничего не найдено' : 'Пока нет опубликованных тестов. Опубликуйте тест из редактора.'}</p>`
              : list.map((p) => `
                <button type="button" class="pubd-item ${Number(p.id) === Number(selectedId) ? 'is-selected' : ''}"
                  data-pub-id="${p.id}">
                  <div class="pubd-item-top">
                    <strong>${escapeHtml(p.quiz_title || 'Тест')}</strong>
                    <span class="publish-status is-${escapeAttr(p.status)}">${statusLabel(p.status)}</span>
                  </div>
                  <div class="pubd-item-meta">
                    <span>${escapeHtml(formatDate(p.created_at))}</span>
                    <span>${p.submitted_count ?? 0}/${p.participants_count ?? 0} сдано</span>
                    <span>${p.avg_percentage != null ? `${p.avg_percentage}%` : '—'}</span>
                  </div>
                </button>`).join('')}
          </div>
        </section>

        <section class="pubd-detail">
          ${renderDetail(quiz, pub)}
        </section>
      </div>`,
  });

  bind();
  bindSidebar(root);
}

function renderDetail(quiz, pub) {
  if (!selectedId) {
    return `
      <div class="publish-card pubd-empty">
        <h2 style="margin:0 0 0.4rem">Выберите публикацию</h2>
        <p class="muted" style="margin:0">Слева список всех тестов, которые вы публиковали по ссылке. Здесь можно снова открыть диаграммы и отчёт.</p>
      </div>`;
  }
  if (loadingDetail || !pub) {
    return `<div class="publish-card"><p class="muted" style="margin:0">Загрузка статистики…</p></div>`;
  }

  return `
    <div class="publish-card">
      <div class="report-head">
        <div>
          <h2 style="margin:0">${escapeHtml(quiz?.title || 'Тест')}</h2>
          <p class="muted" style="margin:0.25rem 0 0">
            ${statusLabel(pub.status)} · создано ${escapeHtml(formatDate(pub.created_at))}
            ${pub.expires_at ? ` · до ${escapeHtml(formatDate(pub.expires_at))}` : ''}
          </p>
        </div>
        <div class="pubd-actions">
          <a class="btn btn-soft" href="/publish/${Number(pub.quiz_id)}">${withIcon('share', 'Управление ссылкой')}</a>
          ${pub.status === 'active' ? `<a class="btn btn-ghost" href="${escapeAttr(publicUrl(pub))}" target="_blank" rel="noopener">${withIcon('eye', 'Открыть ссылку')}</a>` : ''}
        </div>
      </div>
      <ul class="publish-meta" style="margin-top:0.85rem">
        <li><span>Участников</span><strong>${results.length}</strong></li>
        <li><span>Сдано</span><strong>${results.filter((r) => r.attempt_status === 'submitted' || r.submitted_at).length}</strong></li>
        <li><span>Slug</span><strong style="font-family:ui-monospace,monospace;font-size:0.82rem">${escapeHtml(pub.slug)}</strong></li>
      </ul>
    </div>

    ${renderPublishStatsSection(results, { emptyHint: 'По этой публикации ещё нет прохождений.' })}

    <section class="publish-card">
      <div class="report-head">
        <h2 style="margin:0">Участники</h2>
        <p class="muted" style="margin:0">Нажмите на участника, чтобы открыть подробности</p>
      </div>
      ${renderParticipantsReport(results, {
        selectedAttemptId,
        detailHtml: renderAttemptDetailPanel({
          loading: attemptLoading,
          detail: selectedAttempt,
        }),
      })}
    </section>`;
}

function bind() {
  root.querySelector('[data-el="search"]')?.addEventListener('input', (e) => {
    search = e.target.value || '';
    patchList();
  });
  root.querySelector('[data-el="filter"]')?.addEventListener('change', (e) => {
    filter = e.target.value || 'all';
    patchList();
  });
  bindListClicks();
  root.querySelectorAll('[data-attempt-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = Number(row.getAttribute('data-attempt-id'));
      if (!id) return;
      openAttemptDetail(id);
    });
  });
  root.querySelector('[data-action="close-detail"]')?.addEventListener('click', () => {
    selectedAttemptId = null;
    selectedAttempt = null;
    render();
  });
}

function bindListClicks() {
  root.querySelectorAll('[data-pub-id]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-pub-id'));
      if (id) selectPublication(id);
    });
  });
}

function patchList() {
  const box = root.querySelector('.pubd-list');
  if (!box) {
    render();
    return;
  }
  const list = filteredList();
  box.innerHTML = list.length === 0
    ? `<p class="muted" style="margin:0.5rem 0 0">${publications.length ? 'Ничего не найдено' : 'Пока нет опубликованных тестов. Опубликуйте тест из редактора.'}</p>`
    : list.map((p) => `
      <button type="button" class="pubd-item ${Number(p.id) === Number(selectedId) ? 'is-selected' : ''}"
        data-pub-id="${p.id}">
        <div class="pubd-item-top">
          <strong>${escapeHtml(p.quiz_title || 'Тест')}</strong>
          <span class="publish-status is-${escapeAttr(p.status)}">${statusLabel(p.status)}</span>
        </div>
        <div class="pubd-item-meta">
          <span>${escapeHtml(formatDate(p.created_at))}</span>
          <span>${p.submitted_count ?? 0}/${p.participants_count ?? 0} сдано</span>
          <span>${p.avg_percentage != null ? `${p.avg_percentage}%` : '—'}</span>
        </div>
      </button>`).join('');
  bindListClicks();
}

function publicUrl(pub) {
  if (!pub) return '';
  if (pub.url && String(pub.url).startsWith('http')) return pub.url;
  const path = pub.path || `/p/${pub.slug}`;
  return `${window.location.origin}${path}`;
}

function statusLabel(status) {
  return ({ active: 'Активна', expired: 'Истекла', revoked: 'Отозвана' })[status] || status || '—';
}

function formatDate(value) {
  if (!value) return '—';
  const ts = Date.parse(String(value).replace(' ', 'T'));
  if (!Number.isFinite(ts)) return String(value);
  return new Date(ts).toLocaleString('ru-RU');
}

async function apiJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Ошибка ${res.status}`);
  return data;
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
