import '../../css/home.css';
import * as api from '../editor/api.js';
import { icon, withIcon } from '../ui/icons.js';
import { bindSidebar, renderDashShell } from '../ui/shell.js';
import { pickTip } from './tips.js';

const root = document.getElementById('home-app');
if (!root) throw new Error('Контейнер главной не найден');

/** @type {{ quizzes: any[], attempts: any[], health: any|null, search: string, statusOk: boolean|null, tip: { text: string, art: string, index: number } }} */
const state = {
  quizzes: [],
  attempts: [],
  health: null,
  search: '',
  statusOk: null,
  tip: pickTip('rotate'),
};

boot().catch((e) => {
  root.innerHTML = `<p class="error" style="padding:1.5rem">${escapeHtml(e.message)}</p>`;
});

async function boot() {
  render();
  await Promise.all([loadQuizzes(), loadAttempts(), loadHealth()]);
  render();
}

async function loadQuizzes() {
  const payload = await apiJson('/api/v1/quizzes');
  state.quizzes = Array.isArray(payload.data) ? payload.data : [];
}

async function loadAttempts() {
  try {
    const payload = await apiJson('/api/v1/reports/attempts');
    const list = payload.data?.attempts ?? payload.data;
    state.attempts = Array.isArray(list) ? list : [];
  } catch {
    state.attempts = [];
  }
}

async function loadHealth() {
  try {
    const data = await apiJson('/api/v1/health');
    state.health = data;
    state.statusOk = data.status === 'ok';
  } catch {
    state.health = null;
    state.statusOk = false;
  }
}

async function apiJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Ошибка ${res.status}`);
  return data;
}

function render() {
  const q = state.search.trim().toLowerCase();
  const recent = state.quizzes
    .filter((item) => !q || String(item.title || '').toLowerCase().includes(q))
    .slice(0, 5);

  const total = state.quizzes.length;
  const active = state.quizzes.filter((item) => (item.questions_count || 0) > 0).length;
  const runs = state.attempts.length;
  const avgGrade = averageGrade(state.attempts);

  root.innerHTML = renderDashShell('home', {
    title: `
      <h1 class="app-title">Добро пожаловать в Тесторию!</h1>
      <p class="app-subtitle">Территория создания и прохождения тестов</p>`,
    topRight: `
      <label class="dash-search">
        ${icon('search', { size: 16, className: 'dash-search-ico' })}
        <input type="search" class="dash-search-input" placeholder="Поиск по тестам…" value="${escapeAttr(state.search)}" data-el="search">
      </label>
      <button type="button" class="dash-icon-btn" title="Уведомления" aria-label="Уведомления">${icon('bell', { size: 18 })}</button>
      <div class="dash-avatar" title="Профиль">Т</div>`,
    content: `
      <div class="dash-grid">
        <section class="dash-panel">
          <h2 class="dash-panel-title">Ваши тесты</h2>
          <div class="dash-stats">
            ${statCard('blue', 'layers', total, 'Всего тестов')}
            ${statCard('green', 'clipboard', active, 'Активных')}
            ${statCard('sky', 'trending', runs, 'Прохождений')}
            ${statCard('orange', 'star', avgGrade, 'Средняя оценка')}
          </div>
          <div class="dash-recent-head">
            <h3 class="dash-recent-title">Недавние тесты</h3>
            <a class="dash-link" href="/editor">Все тесты ${icon('chevronRight', { size: 14 })}</a>
          </div>
          <div class="dash-recent">
            ${recent.length ? recent.map(recentRow).join('') : `<p class="muted dash-empty">Пока нет тестов. <a href="/editor">Создать первый</a></p>`}
          </div>
        </section>

        <aside class="dash-aside">
          <section class="dash-panel dash-status ${state.statusOk === false ? 'is-bad' : state.statusOk ? 'is-ok' : ''}">
            <div class="dash-status-head">
              <h2 class="dash-panel-title">Статус системы</h2>
              <span class="dash-badge ${state.statusOk ? 'is-ok' : state.statusOk === false ? 'is-bad' : ''}">${
                state.statusOk ? 'Готово' : state.statusOk === false ? 'Сбой' : '…'
              }</span>
            </div>
            <div class="dash-status-body">
              <div class="dash-status-mark" aria-hidden="true">${icon(state.statusOk === false ? 'x' : 'check', { size: 36 })}</div>
              <div>
                <strong>${state.statusOk === false ? 'Есть проблемы' : state.statusOk ? 'Система готова к работе' : 'Проверка…'}</strong>
                <p class="muted">${
                  state.statusOk === false
                    ? 'Не удалось получить ответ /api/v1/health.'
                    : state.statusOk
                      ? 'Все сервисы функционируют в штатном режиме.'
                      : 'Загрузка состояния сервера…'
                }</p>
              </div>
            </div>
          </section>

          <section class="dash-tip">
            <div class="dash-tip-ico">${icon('lightbulb', { size: 20 })}</div>
            <h2 class="dash-tip-title">Совет</h2>
            <p class="dash-tip-text">${escapeHtml(state.tip.text)}</p>
            <div class="dash-tip-art" aria-hidden="true">${renderTipArt(state.tip.art)}</div>
          </section>
        </aside>
      </div>`,
  });

  bind();
  bindSidebar(root);
}

function renderTipArt(art) {
  switch (art) {
    case 'checklist':
      return `
        <div class="dash-tip-card">
          <span class="is-check"></span><span class="is-check"></span><span></span>
        </div>
        ${icon('clipboard', { size: 28, className: 'dash-tip-float' })}`;
    case 'shield':
      return `
        <div class="dash-tip-badge is-ok">${icon('check', { size: 28 })}</div>
        ${icon('eye', { size: 26, className: 'dash-tip-float' })}`;
    case 'timer':
      return `
        <div class="dash-tip-timer"><i></i></div>
        ${icon('play', { size: 26, className: 'dash-tip-float' })}`;
    case 'export':
      return `
        <div class="dash-tip-pack">
          <span></span><span></span>
        </div>
        ${icon('download', { size: 28, className: 'dash-tip-float' })}`;
    case 'star':
      return `
        <div class="dash-tip-badge is-star">${icon('star', { size: 26 })}</div>
        ${icon('trophy', { size: 26, className: 'dash-tip-float' })}`;
    case 'laptop':
    default:
      return `
        <div class="dash-tip-laptop">
          <span></span><span></span><span></span>
        </div>
        ${icon('send', { size: 28, className: 'dash-tip-plane' })}`;
  }
}

function statCard(tone, name, value, label) {
  return `
    <div class="dash-stat dash-stat--${tone}">
      <div class="dash-stat-ico">${icon(name, { size: 18 })}</div>
      <div class="dash-stat-value">${escapeHtml(String(value))}</div>
      <div class="dash-stat-label">${escapeHtml(label)}</div>
    </div>`;
}

function recentRow(item) {
  const qCount = Number(item.questions_count || 0);
  const when = formatRelative(item.updated_at);
  const id = item.id;
  const title = escapeAttr(item.title || 'quiz');
  const folder = item.folder_name
    ? ` · ${escapeHtml(item.folder_name)}`
    : '';
  return `
    <article class="dash-recent-row">
      <div class="dash-recent-main">
        <strong>${escapeHtml(item.title || 'Без названия')}</strong>
        <span class="muted">${escapeHtml(when)}${folder} · ${qCount} ${plural(qCount, 'вопрос', 'вопроса', 'вопросов')}</span>
      </div>
      <a class="btn btn-soft btn-sm" href="/editor/${id}">${withIcon('pencil', 'Открыть', { size: 14 })}</a>
      <div class="dash-menu">
        <button type="button" class="dash-more" data-menu-toggle="${id}" title="Действия" aria-haspopup="true" aria-expanded="false">
          ${icon('more', { size: 18 })}
        </button>
        <div class="dash-menu-pop" data-menu="${id}" hidden>
          <a class="dash-menu-item" href="/editor/${id}">${icon('pencil', { size: 15 })}<span>Открыть</span></a>
          <button type="button" class="dash-menu-item" data-action="network" data-id="${id}">${icon('globe', { size: 15 })}<span>Сетевое тестирование</span></button>
          <a class="dash-menu-item" href="/publish/${id}">${icon('share', { size: 15 })}<span>Опубликовать</span></a>
          <a class="dash-menu-item" href="/player/${id}" target="_blank" rel="noopener">${icon('eye', { size: 15 })}<span>Предпросмотр</span></a>
          <button type="button" class="dash-menu-item" data-action="export" data-id="${id}" data-title="${title}">${icon('download', { size: 15 })}<span>Экспорт .quiz</span></button>
          <button type="button" class="dash-menu-item" data-action="duplicate" data-id="${id}">${icon('copy', { size: 15 })}<span>Создать копию</span></button>
          <button type="button" class="dash-menu-item is-danger" data-action="delete" data-id="${id}">${icon('trash', { size: 15 })}<span>Удалить</span></button>
        </div>
      </div>
    </article>`;
}

function bind() {
  const search = root.querySelector('[data-el="search"]');
  if (search) {
    search.addEventListener('input', () => {
      state.search = search.value;
      render();
      const again = root.querySelector('[data-el="search"]');
      if (again) {
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }
    });
  }

  root.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-menu-toggle');
      const menu = root.querySelector(`[data-menu="${id}"]`);
      const open = menu && !menu.hidden;
      closeMenus();
      if (menu && !open) {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('is-open');
      }
    });
  });

  root.querySelectorAll('.dash-menu-pop [data-action]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.getAttribute('data-action');
      const id = Number(el.getAttribute('data-id'));
      const title = el.getAttribute('data-title') || 'quiz';
      closeMenus();
      try {
        if (action === 'network') {
          const session = await api.createSession(id);
          window.location.href = `/session/${session.id}`;
          return;
        }
        if (action === 'export') {
          await api.exportQuiz(id, title);
          return;
        }
        if (action === 'duplicate') {
          const quiz = await api.duplicateQuiz(id);
          window.location.href = `/editor/${quiz.id}`;
          return;
        }
        if (action === 'delete') {
          if (!confirm('Удалить тест вместе с сессиями и результатами?')) return;
          await api.deleteQuiz(id);
          state.quizzes = state.quizzes.filter((q) => Number(q.id) !== id);
          render();
        }
      } catch (err) {
        alert(err.message || 'Не удалось выполнить действие');
      }
    });
  });

  if (!root.dataset.menuDocBound) {
    root.dataset.menuDocBound = '1';
    document.addEventListener('click', () => closeMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenus();
    });
  }
}

function closeMenus() {
  root.querySelectorAll('.dash-menu-pop').forEach((m) => { m.hidden = true; });
  root.querySelectorAll('[data-menu-toggle]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
    b.classList.remove('is-open');
  });
}

function averageGrade(attempts) {
  const grades = attempts
    .map((a) => {
      const label = a.grade_label ?? a.grade?.label ?? a.grade;
      const n = Number(label);
      if (Number.isFinite(n) && n > 0) return n;
      const pct = Number(a.percentage);
      if (!Number.isFinite(pct)) return null;
      if (pct >= 85) return 5;
      if (pct >= 70) return 4;
      if (pct >= 50) return 3;
      return 2;
    })
    .filter((n) => n != null);
  if (!grades.length) return '—';
  return (grades.reduce((s, n) => s + n, 0) / grades.length).toFixed(1);
}

function formatRelative(iso) {
  if (!iso) return 'без даты';
  const ts = Date.parse(String(iso).replace(' ', 'T'));
  if (!Number.isFinite(ts)) return String(iso);
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
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
