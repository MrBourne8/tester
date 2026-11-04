import '../../css/reports.css';
import { withIcon } from '../ui/icons.js';
import { bindSidebar, navBackIcon, renderAppShell } from '../ui/shell.js';

const root = document.getElementById('reports-app');
if (!root) throw new Error('Контейнер отчётов не найден');

/** @type {any[]} */
let attempts = [];
/** @type {any[]} */
let quizzes = [];
/** @type {any|null} */
let selected = null;
let selectedId = null;
let statusText = '';

boot().catch((e) => {
  root.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
});

async function boot() {
  renderShell();
  await Promise.all([loadList(), loadStats()]);
}

function renderShell() {
  root.innerHTML = renderAppShell('reports', {
    title: `
      <a class="nav-back" href="/editor">${navBackIcon()}К редактору</a>
      <h1 class="app-title">Отчёты</h1>
      <p class="app-subtitle">Попытки из сети и импортированные .result</p>`,
    topRight: `
      <label class="btn btn-ghost file-btn">
        ${withIcon('upload', 'Импорт .result')}
        <input type="file" accept=".result,.json,application/json" hidden data-action="import">
      </label>
      <button type="button" class="btn btn-primary" data-action="export">${withIcon('download', 'Экспорт CSV')}</button>`,
    content: `
      <section class="panel">
        <div class="filters">
          <label class="field">Поиск
            <input class="input" data-filter="q" placeholder="Имя или название теста">
          </label>
          <label class="field">Тест
            <select class="input" data-filter="quiz_id">
              <option value="">Все</option>
            </select>
          </label>
          <label class="field">Источник
            <select class="input" data-filter="source">
              <option value="">Все</option>
              <option value="network">Сеть</option>
              <option value="import">Импорт .result</option>
            </select>
          </label>
          <label class="field">С
            <input class="input" type="date" data-filter="from">
          </label>
          <label class="field">По
            <input class="input" type="date" data-filter="to">
          </label>
          <button type="button" class="btn btn-soft" data-action="apply">Применить</button>
        </div>
        <p class="muted" data-el="status" style="margin:0.75rem 0 0"></p>
      </section>

      <section class="panel">
        <h2 class="panel-title">Статистика по вопросам</h2>
        <div data-el="stats"><p class="muted">Загрузка…</p></div>
      </section>

      <div class="layout">
        <section class="panel">
          <h2 class="panel-title">Попытки</h2>
          <div data-el="list"><p class="muted">Загрузка…</p></div>
        </section>
        <section class="panel">
          <h2 class="panel-title">Детали</h2>
          <div data-el="detail"><p class="muted">Выберите попытку</p></div>
        </section>
      </div>`,
  });

  root.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
    loadList();
    loadStats();
  });
  root.querySelector('[data-action="export"]')?.addEventListener('click', exportCsv);
  root.querySelector('[data-action="import"]')?.addEventListener('change', onImport);
  root.querySelector('[data-el="list"]')?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-attempt-id]');
    if (!row) return;
    selectedId = Number(row.getAttribute('data-attempt-id'));
    patchList();
    await loadDetail(selectedId);
  });
  ['q', 'quiz_id', 'source', 'from', 'to'].forEach((name) => {
    root.querySelector(`[data-filter="${name}"]`)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadList();
    });
  });
  bindSidebar(root);
}

function filters() {
  return {
    q: root.querySelector('[data-filter="q"]')?.value || '',
    quiz_id: root.querySelector('[data-filter="quiz_id"]')?.value || '',
    source: root.querySelector('[data-filter="source"]')?.value || '',
    from: root.querySelector('[data-filter="from"]')?.value || '',
    to: root.querySelector('[data-filter="to"]')?.value || '',
  };
}

function queryString(extra = {}) {
  const params = new URLSearchParams();
  const all = { ...filters(), ...extra };
  Object.entries(all).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadList() {
  setStatus('Обновление…');
  const data = await api(`/api/v1/reports/attempts${queryString()}`);
  attempts = data.attempts || [];
  quizzes = data.quizzes || [];
  patchQuizFilter();
  patchList();
  setStatus(`Найдено: ${attempts.length}`);
  if (selectedId && !attempts.some((a) => a.id === selectedId)) {
    selectedId = null;
    selected = null;
    patchDetail();
  }
}

async function loadStats() {
  const box = root.querySelector('[data-el="stats"]');
  if (!box) return;
  try {
    const data = await api(`/api/v1/reports/stats${queryString()}`);
    const rows = data.questions || [];
    if (!rows.length) {
      box.innerHTML = `<p class="muted">Нет данных (попыток: ${escapeHtml(String(data.attempts_count || 0))})</p>`;
      return;
    }
    box.innerHTML = `
      <p class="muted" style="margin:0 0 0.6rem">Попыток в выборке: ${escapeHtml(String(data.attempts_count || 0))}</p>
      <table class="table">
        <thead>
          <tr>
            <th>Вопрос</th>
            <th>Ответов</th>
            <th>Верно</th>
            <th>%</th>
            <th>Ср. балл</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td><code>${escapeHtml(r.question_id)}</code></td>
              <td>${escapeHtml(String(r.answers_count))}</td>
              <td>${escapeHtml(String(r.correct_count))}</td>
              <td>${r.correct_percent != null ? escapeHtml(String(r.correct_percent)) : '—'}</td>
              <td>${r.avg_score != null ? escapeHtml(String(r.avg_score)) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    box.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  }
}

function patchQuizFilter() {
  const select = root.querySelector('[data-filter="quiz_id"]');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Все</option>${quizzes.map((q) => `
    <option value="${q.id}">${escapeHtml(q.title)}</option>`).join('')}`;
  select.value = current;
}

function patchList() {
  const box = root.querySelector('[data-el="list"]');
  if (!box) return;
  if (!attempts.length) {
    box.innerHTML = '<p class="muted">Нет попыток по текущим фильтрам</p>';
    return;
  }
  box.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Ученик</th>
          <th>Тест</th>
          <th>Источник</th>
          <th>%</th>
          <th>Оценка</th>
          <th>Сдача</th>
        </tr>
      </thead>
      <tbody>
        ${attempts.map((a) => `
          <tr class="is-clickable ${a.id === selectedId ? 'is-selected' : ''}" data-attempt-id="${a.id}">
            <td>${escapeHtml(a.student_name || '—')}</td>
            <td>${escapeHtml(a.quiz_title)} <span class="muted">v${escapeHtml(String(a.version_number))}</span></td>
            <td><span class="source-pill">${escapeHtml(sourceLabel(a.source))}</span></td>
            <td>${a.percentage != null ? escapeHtml(String(a.percentage)) : '—'}</td>
            <td>${escapeHtml(a.grade_label || '—')}</td>
            <td>${escapeHtml(formatTime(a.submitted_at))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadDetail(id) {
  selected = await api(`/api/v1/reports/attempts/${id}`);
  patchDetail();
}

function patchDetail() {
  const box = root.querySelector('[data-el="detail"]');
  if (!box) return;
  if (!selected) {
    box.innerHTML = '<p class="muted">Выберите попытку</p>';
    return;
  }
  const a = selected;
  const per = Array.isArray(a.per_question) ? a.per_question : [];
  box.innerHTML = `
    <div class="detail-block">
      <h3>${escapeHtml(a.student_name || '—')}</h3>
      <div class="kv">
        <div class="k">Тест</div><div>${escapeHtml(a.quiz_title)} (v${escapeHtml(String(a.version_number))})</div>
        <div class="k">Источник</div><div>${escapeHtml(sourceLabel(a.source))}</div>
        <div class="k">Баллы</div><div>${escapeHtml(String(a.score ?? '—'))} / ${escapeHtml(String(a.max_score ?? '—'))} (${escapeHtml(String(a.percentage ?? '—'))}%)</div>
        <div class="k">Оценка</div><div>${escapeHtml(a.grade?.label || '—')}</div>
        <div class="k">Сдано</div><div>${escapeHtml(formatTime(a.submitted_at))}</div>
        ${a.session_code ? `<div class="k">Сессия</div><div>${escapeHtml(a.session_code)}</div>` : ''}
        ${a.imported_at ? `<div class="k">Импорт</div><div>${escapeHtml(formatTime(a.imported_at))}</div>` : ''}
      </div>
    </div>
    <div class="detail-block">
      <h3>По вопросам</h3>
      <div class="pq-list">
        ${per.length ? per.map((item, i) => `
          <div class="pq-item ${itemClass(item)}">
            <strong>${i + 1}. ${escapeHtml(item.questionId || '')}</strong>
            · ${escapeHtml(String(item.awarded ?? 0))}/${escapeHtml(String(item.max ?? 0))}
            · ${escapeHtml(correctLabel(item))}
          </div>`).join('') : '<p class="muted">Нет детализации</p>'}
      </div>
    </div>`;
}

async function onImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/v1/results/import', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Ошибка ${response.status}`);
    }
    statusText = `Импортировано: попытка #${payload.data.attempt_id}`;
    setStatus(statusText);
    selectedId = payload.data.attempt_id;
    await loadList();
    await loadDetail(selectedId);
  } catch (e) {
    alert(e.message);
  } finally {
    event.target.value = '';
  }
}

function exportCsv() {
  window.location.href = `/api/v1/reports/export.csv${queryString()}`;
}

function setStatus(text) {
  const el = root.querySelector('[data-el="status"]');
  if (el) el.textContent = text;
}

async function api(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Ошибка ${response.status}`);
  }
  return payload.data;
}

function sourceLabel(source) {
  return ({ network: 'Сеть', import: 'Импорт', standalone: 'Автономно' })[source] || source || '—';
}

function formatTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

function itemClass(item) {
  if (item.isCorrect === true) return 'is-correct';
  if (Number(item.awarded) > 0 && Number(item.awarded) < Number(item.max)) return 'is-partial';
  if (item.isCorrect === false) return 'is-incorrect';
  return '';
}

function correctLabel(item) {
  if (item.isCorrect === true) return 'верно';
  if (Number(item.awarded) > 0 && Number(item.awarded) < Number(item.max)) return 'частично';
  if (item.isCorrect === false) return 'ошибка';
  return '—';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
