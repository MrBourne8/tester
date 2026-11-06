import '../../css/editor.css';
import { validateQuizDocument } from '../core/quiz-engine/validate.js';
import { fileToResource, resolveResourceSrc } from '../core/quiz-engine/resources.js';
import * as api from './api.js';
import { downloadQuizDocx, printQuiz } from './export-document.js';
import { defaultGradingScale, pointsForScale } from '../core/quiz-engine/grading.js';
import { applyModePreset, currentMode } from '../core/quiz-engine/modes.js';
import { icon, withIcon } from '../ui/icons.js';
import { bindSidebar, navBackIcon, renderAppShell } from '../ui/shell.js';
import { bindReorder, moveItem } from './dnd.js';
import {
  blankQuiz,
  changeQuestionType,
  cloneQuestion,
  createQuestion,
  newId,
  supportedTypes,
} from './questions.js';

const root = document.getElementById('editor-app');
if (!root) {
  throw new Error('Контейнер редактора не найден');
}

const initialId = root.dataset.quizId ? Number(root.dataset.quizId) : null;

const VIEW_KEY = 'testoriya_quizzes_view';

function loadViewMode() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** @type {{ mode: 'list'|'edit', quizId: number|null, content: object|null, selectedIndex: number, dirty: boolean, status: string, list: object[], folders: object[], folderFilter: 'all'|'none'|number, viewMode: 'grid'|'list', qTab: 'edit'|'params' }} */
const state = {
  mode: initialId ? 'edit' : 'list',
  quizId: initialId,
  content: null,
  selectedIndex: 0,
  dirty: false,
  status: '',
  list: [],
  folders: [],
  folderFilter: 'all',
  viewMode: loadViewMode(),
  qTab: 'edit',
};

function setViewMode(mode) {
  state.viewMode = mode === 'list' ? 'list' : 'grid';
  try {
    localStorage.setItem(VIEW_KEY, state.viewMode);
  } catch {
    /* ignore */
  }
}

window.addEventListener('beforeunload', (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});

boot().catch((error) => {
  root.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});

async function boot() {
  if (state.mode === 'edit' && state.quizId) {
    await openQuiz(state.quizId);
  } else {
    await showList();
  }
}

async function showList() {
  if (state.dirty && !confirm('Есть несохранённые изменения. Уйти без сохранения?')) {
    return;
  }
  state.mode = 'list';
  state.quizId = null;
  state.content = null;
  state.dirty = false;
  const [list, folders] = await Promise.all([api.listQuizzes(), api.listFolders()]);
  state.list = list;
  state.folders = folders;
  history.replaceState({}, '', '/editor');
  render();
}

async function openQuiz(id) {
  const data = await api.getQuiz(id);
  state.mode = 'edit';
  state.quizId = data.id;
  state.content = data.content?.id ? structuredClone(data.content) : blankQuiz(data.title);
  if (!state.content.settings) {
    state.content.settings = blankQuiz().settings;
  }
  if (!Array.isArray(state.content.settings.gradingScale) || !state.content.settings.gradingScale.length) {
    state.content.settings.gradingScale = defaultGradingScale();
  }
  state.selectedIndex = 0;
  state.dirty = false;
  state.status = `Версия ${data.version_number ?? '—'}`;
  history.replaceState({}, '', `/editor/${id}`);
  render();
}

function markDirty() {
  state.dirty = true;
  renderStatus();
}

function render() {
  if (state.mode === 'list') {
    renderList();
    return;
  }
  const scroll = captureEditorScroll();
  renderEditor();
  restoreEditorScroll(scroll);
}

function captureEditorScroll() {
  const qList = root.querySelector('.q-list');
  const settings = root.querySelector('.ed-settings');
  return {
    qList: qList ? qList.scrollTop : 0,
    settings: settings ? settings.scrollTop : 0,
  };
}

function restoreEditorScroll(scroll) {
  if (!scroll) return;
  const qList = root.querySelector('.q-list');
  const settings = root.querySelector('.ed-settings');
  if (qList) qList.scrollTop = scroll.qList;
  if (settings) settings.scrollTop = scroll.settings;
}

function filteredQuizzes() {
  const f = state.folderFilter;
  if (f === 'all') return state.list;
  if (f === 'none') return state.list.filter((q) => q.folder_id == null);
  return state.list.filter((q) => Number(q.folder_id) === Number(f));
}

function unfiledCount() {
  return state.list.filter((q) => q.folder_id == null).length;
}

function quizCardHtml(q) {
  const title = escapeHtml(q.title || 'Без названия');
  return `
    <article class="quiz-card" draggable="true" data-quiz-id="${q.id}" title="Перетащите в папку слева">
      <div class="quiz-card-head">
        <span class="quiz-card-grip" aria-hidden="true" title="Перетащить в папку">${icon('grip', { size: 16 })}</span>
        <h3><button type="button" class="linkish" data-open="${q.id}" title="Открыть тест «${title}»">${title}</button></h3>
      </div>
      <div class="quiz-card-meta">
        ${q.folder_name ? `<span class="quiz-card-folder" title="Папка: ${escapeHtml(q.folder_name)}">${icon('folder', { size: 12 })} ${escapeHtml(q.folder_name)}</span>` : ''}
        <span title="Количество вопросов">${q.questions_count} вопр.</span>
        <span title="Текущая версия">v${q.version_number ?? '—'}</span>
        <span title="Дата изменения">${escapeHtml(formatDate(q.updated_at))}</span>
      </div>
      <div class="quiz-card-actions">
        <button type="button" class="btn btn-soft" data-open="${q.id}" title="Открыть тест в редакторе">${withIcon('pencil', 'Открыть')}</button>
        <button type="button" class="btn btn-ghost" data-dup="${q.id}" title="Создать копию теста">${withIcon('copy', 'Копия')}</button>
        <button type="button" class="btn btn-ghost" data-export="${q.id}" data-title="${title}" title="Экспортировать файл .quiz">${withIcon('download', 'Экспорт')}</button>
        <button type="button" class="btn btn-danger" data-del="${q.id}" title="Удалить тест вместе с результатами">${withIcon('trash', 'Удалить')}</button>
      </div>
    </article>`;
}

function quizzesContainer(items) {
  const view = state.viewMode === 'list' ? 'is-list' : 'is-grid';
  return `<div class="quiz-cards ${view}">${items.map(quizCardHtml).join('')}</div>`;
}

function renderListBody() {
  const quizzes = filteredQuizzes();
  if (state.list.length === 0) {
    return '<p class="empty">Тестов пока нет. Создайте первый или импортируйте файл .quiz.</p>';
  }
  if (quizzes.length === 0) {
    return '<p class="empty">В этой папке пока нет тестов.</p>';
  }
  if (state.folderFilter !== 'all') {
    return quizzesContainer(quizzes);
  }
  const groups = [];
  for (const folder of state.folders) {
    const items = state.list.filter((q) => Number(q.folder_id) === Number(folder.id));
    if (!items.length) continue;
    groups.push(`
      <div class="quiz-folder-group">
        <h3 class="quiz-folder-heading">${icon('folder', { size: 16 })} ${escapeHtml(folder.name)}
          <span class="muted">${items.length}</span>
        </h3>
        ${quizzesContainer(items)}
      </div>`);
  }
  const loose = state.list.filter((q) => q.folder_id == null);
  if (loose.length) {
    groups.push(`
      <div class="quiz-folder-group">
        <h3 class="quiz-folder-heading">${icon('layers', { size: 16 })} Без папки
          <span class="muted">${loose.length}</span>
        </h3>
        ${quizzesContainer(loose)}
      </div>`);
  }
  return groups.join('') || quizzesContainer(quizzes);
}

function viewToggleHtml() {
  const grid = state.viewMode === 'grid';
  return `
    <div class="view-toggle" role="group" aria-label="Вид списка">
      <button type="button" class="view-toggle-btn ${grid ? 'is-active' : ''}" data-view="grid" title="Показать тесты плиткой" aria-pressed="${grid}">
        ${icon('grid', { size: 16 })}
      </button>
      <button type="button" class="view-toggle-btn ${!grid ? 'is-active' : ''}" data-view="list" title="Показать тесты списком" aria-pressed="${!grid}">
        ${icon('list', { size: 16 })}
      </button>
    </div>`;
}

function currentFolderTitle() {
  const f = state.folderFilter;
  if (f === 'all') return 'Все тесты';
  if (f === 'none') return 'Без папки';
  return state.folders.find((x) => Number(x.id) === Number(f))?.name || 'Папка';
}

function renderList() {
  const filter = state.folderFilter;
  const folderSelected = typeof filter === 'number' || (typeof filter === 'string' && filter !== 'all' && filter !== 'none');
  root.innerHTML = renderAppShell('tests', {
    title: `<h1 class="app-title">${escapeHtml(currentFolderTitle())}</h1>`,
    subtitle: `<p class="app-subtitle">Перетащите тест в папку слева · ${state.list.length} всего</p>`,
    topRight: `
      ${viewToggleHtml()}
      ${folderSelected
        ? `<button type="button" class="btn btn-ghost" data-action="folder-rename" title="Переименовать текущую папку">${withIcon('pencil', 'Переименовать')}</button>
           <button type="button" class="btn btn-ghost" data-action="folder-delete" title="Удалить папку (тесты останутся)">${withIcon('trash', 'Удалить папку')}</button>`
        : ''}
      <label class="btn btn-ghost file-btn" title="Импортировать тест из файла .quiz">${withIcon('upload', 'Импорт .quiz')}
        <input type="file" accept=".quiz,.zip" hidden data-action="import">
      </label>
      <button type="button" class="btn btn-primary" data-action="create" title="Создать новый тест">${withIcon('plus', 'Создать тест')}</button>`,
    folders: state.folders,
    folderFilter: state.folderFilter,
    folderTotal: state.list.length,
    folderUnfiled: unfiledCount(),
    content: `
      <section class="ed-list">
        ${renderListBody()}
      </section>
      <p class="status-line" id="status-line">${escapeHtml(state.status)}</p>`,
  });

  root.querySelector('[data-action="create"]')?.addEventListener('click', onCreate);
  root.querySelector('[data-action="import"]')?.addEventListener('change', onImport);
  root.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', () => {
      setViewMode(el.getAttribute('data-view') || 'grid');
      renderList();
    });
  });
  root.querySelectorAll('[data-folder-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      const raw = el.getAttribute('data-folder-filter');
      state.folderFilter = raw === 'all' || raw === 'none' ? raw : Number(raw);
      renderList();
    });
  });
  root.querySelector('[data-action="folder-create"]')?.addEventListener('click', onFolderCreate);
  root.querySelector('[data-action="folder-rename"]')?.addEventListener('click', onFolderRename);
  root.querySelector('[data-action="folder-delete"]')?.addEventListener('click', onFolderDelete);
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => openQuiz(Number(el.getAttribute('data-open'))));
  });
  root.querySelectorAll('[data-dup]').forEach((el) => {
    el.addEventListener('click', async () => {
      const quiz = await api.duplicateQuiz(Number(el.getAttribute('data-dup')));
      state.status = 'Создана копия';
      await openQuiz(quiz.id);
    });
  });
  root.querySelectorAll('[data-export]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api.exportQuiz(Number(el.getAttribute('data-export')), el.getAttribute('data-title') || 'quiz');
      state.status = 'Экспорт выполнен';
      renderStatus();
    });
  });
  root.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', async () => {
      if (!confirm('Удалить тест вместе с сессиями и результатами?')) return;
      try {
        await api.deleteQuiz(Number(el.getAttribute('data-del')));
        state.status = 'Тест удалён';
        await showList();
      } catch (err) {
        alert(err.message || 'Не удалось удалить тест');
      }
    });
  });
  bindSidebar(root);
  bindQuizFolderDnD();
}

function bindQuizFolderDnD() {
  root.querySelectorAll('.quiz-card[data-quiz-id]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      if (e.target.closest('button, a, select, input, label')) {
        e.preventDefault();
        return;
      }
      const id = card.getAttribute('data-quiz-id');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.setData('application/x-quiz-id', id);
      card.classList.add('is-dragging');
      root.classList.add('is-quiz-dnd');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      root.classList.remove('is-quiz-dnd');
      root.querySelectorAll('.dash-nav-folder.is-drop-target').forEach((el) => {
        el.classList.remove('is-drop-target');
      });
    });
  });

  root.querySelectorAll('[data-drop-folder]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      if (!root.classList.contains('is-quiz-dnd')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('is-drop-target');
    });
    zone.addEventListener('dragleave', (e) => {
      if (zone.contains(e.relatedTarget)) return;
      zone.classList.remove('is-drop-target');
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('is-drop-target');
      const raw = e.dataTransfer.getData('application/x-quiz-id')
        || e.dataTransfer.getData('text/plain');
      const quizId = Number(raw);
      if (!Number.isFinite(quizId) || quizId <= 0) return;
      const drop = zone.getAttribute('data-drop-folder');
      const folderId = drop === 'none' ? null : Number(drop);
      if (drop !== 'none' && (!Number.isFinite(folderId) || folderId <= 0)) return;
      const quiz = state.list.find((q) => Number(q.id) === quizId);
      const current = quiz?.folder_id == null ? null : Number(quiz.folder_id);
      if (current === folderId) return;
      try {
        await api.setQuizFolder(quizId, folderId);
        state.status = folderId == null ? 'Тест убран из папки' : 'Тест перемещён в папку';
        await showList();
      } catch (err) {
        alert(err.message || 'Не удалось переместить');
      }
    });
  });
}

async function onFolderCreate() {
  const name = prompt('Название папки (группа, предмет…):');
  if (name == null) return;
  try {
    const folder = await api.createFolder(name.trim());
    state.folders.push(folder);
    state.folderFilter = folder.id;
    state.status = 'Папка создана';
    await showList();
  } catch (err) {
    alert(err.message || 'Не удалось создать папку');
  }
}

async function onFolderRename() {
  const id = Number(state.folderFilter);
  if (!Number.isFinite(id) || id <= 0) return;
  const current = state.folders.find((f) => Number(f.id) === id);
  const name = prompt('Новое название папки:', current?.name || '');
  if (name == null) return;
  try {
    await api.updateFolder(id, name.trim());
    state.status = 'Папка переименована';
    await showList();
  } catch (err) {
    alert(err.message || 'Не удалось переименовать');
  }
}

async function onFolderDelete() {
  const id = Number(state.folderFilter);
  if (!Number.isFinite(id) || id <= 0) return;
  if (!confirm('Удалить папку? Тесты останутся без папки.')) return;
  try {
    await api.deleteFolder(id);
    state.folderFilter = 'all';
    state.status = 'Папка удалена';
    await showList();
  } catch (err) {
    alert(err.message || 'Не удалось удалить папку');
  }
}

function renderEditor() {
  const content = state.content;
  const questions = content.questions || [];
  if (state.selectedIndex >= questions.length) {
    state.selectedIndex = Math.max(0, questions.length - 1);
  }
  const selected = questions[state.selectedIndex] || null;

  const maxScore = questions.reduce((sum, q) => (q.type === 'info' ? sum : sum + (Number(q.points) || 0)), 0);
  root.innerHTML = renderAppShell('tests', {
    title: `
      <button type="button" class="nav-back" data-action="back">${navBackIcon()}К списку</button>
      <h1 class="app-title">Редактор теста</h1>
      <p class="app-subtitle">${state.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}${state.status ? ` · ${escapeHtml(state.status)}` : ''}</p>`,
    topRight: `
      <a class="btn btn-soft" href="/player/${state.quizId}" target="_blank" rel="noopener" title="Открыть прохождение теста в новой вкладке">${withIcon('eye', 'Предпросмотр')}</a>
      <button type="button" class="btn btn-primary" data-action="save" title="Сохранить изменения теста">${withIcon('save', 'Сохранить')}</button>`,
    content: `
      <section class="ed-actions-panel" aria-label="Действия с тестом">
        <h2 class="ed-actions-title">Действия с тестом</h2>
        <div class="ed-actions-groups">
          <div class="ed-actions-group">
            <span class="ed-actions-label">Проведение</span>
            <div class="ed-actions-btns">
              <button type="button" class="btn btn-ghost" data-action="network" title="Запустить занятие по коду в локальной сети">${withIcon('globe', 'Сетевое тестирование')}</button>
              <button type="button" class="btn btn-ghost" data-action="publish" title="Создать публичную ссылку и QR для прохождения через интернет">${withIcon('share', 'Опубликовать')}</button>
            </div>
          </div>
          <div class="ed-actions-group">
            <span class="ed-actions-label">Экспорт</span>
            <div class="ed-actions-btns">
              <button type="button" class="btn btn-ghost" data-action="export" title="Скачать файл теста .quiz для переноса или резервной копии">${withIcon('fileDown', 'Экспорт .quiz')}</button>
              <button type="button" class="btn btn-ghost" data-action="export-standalone" title="Собрать автономный плеер со вшитым тестом для выбранной ОС">${withIcon('logo', 'Автономный тест')}</button>
              <button type="button" class="btn btn-ghost" data-action="export-web" title="Скачать ZIP-пакет для прохождения в браузере без сервера">${withIcon('package', 'Веб-пакет')}</button>
            </div>
          </div>
          <div class="ed-actions-group">
            <span class="ed-actions-label">Документ</span>
            <div class="ed-actions-btns">
              <button type="button" class="btn btn-ghost" data-action="print" title="Печать бланка для студентов и ключа ответов">${withIcon('print', 'Печать')}</button>
              <button type="button" class="btn btn-ghost" data-action="export-word" title="Скачать Word: бланк для студентов и ключ ответов">${withIcon('fileText', 'Скачать Word')}</button>
            </div>
          </div>
        </div>
      </section>

      <dialog class="os-dialog" id="os-export-dialog">
        <form method="dialog" class="os-dialog-inner">
          <div data-el="os-choose">
            <h2>Автономный тест — выбор ОС</h2>
            <p class="hint">Скачивается один файл плеера со вшитым тестом.</p>
            <div class="os-expiry" data-el="os-expiry">
              <label class="field">Срок действия файла
                <select class="input" data-el="os-valid-days">
                  <option value="" selected>Без ограничения</option>
                  <option value="1">1 день</option>
                  <option value="2">2 дня</option>
                  <option value="3">3 дня</option>
                  <option value="7">7 дней</option>
                  <option value="14">14 дней</option>
                  <option value="30">30 дней</option>
                  <option value="custom">Указать число дней…</option>
                </select>
              </label>
              <label class="field" data-el="os-valid-custom-wrap" hidden>Число дней
                <input class="input" type="number" min="1" max="3650" step="1" value="2" data-el="os-valid-custom">
              </label>
              <p class="hint">После истечения срока файл откроется с сообщением, что тест больше недоступен.</p>
            </div>
            <div class="os-list" data-el="os-list"><p class="muted">Загрузка…</p></div>
            <div class="ed-actions" style="justify-content:flex-end;margin-top:0.75rem">
              <button type="submit" class="btn btn-ghost" value="cancel" data-el="os-cancel">Отмена</button>
            </div>
          </div>
          <div class="os-progress" data-el="os-progress" hidden>
            <div class="os-preloader" aria-hidden="true"><span class="os-preloader-ring"></span></div>
            <h2 class="os-progress-title">Создание теста</h2>
            <p class="muted os-progress-sub" data-el="os-progress-sub">Подготовка файла…</p>
          </div>
        </form>
      </dialog>

      <section class="ed-meta panel-card" aria-label="Сведения о тесте">
        <label class="field">Название
          <input class="input" data-field="title" value="${escapeHtml(content.title || '')}">
        </label>
        <label class="field">Автор
          <input class="input" data-field="author" value="${escapeHtml(content.author || '')}">
        </label>
        <label class="field ed-meta-desc">Описание
          <textarea class="input" rows="2" data-field="description">${escapeHtml(content.description || '')}</textarea>
        </label>
      </section>

      <div class="ed-layout">
        <aside class="ed-side">
          <h2 class="ed-side-title">Вопросы <span class="ed-side-count">${questions.length}</span></h2>
          <div class="q-search">
            <span class="q-search-ico">${icon('search', { size: 16 })}</span>
            <input class="input" data-q-filter placeholder="Поиск вопроса…" autocomplete="off">
          </div>
          <div class="q-list">
            ${questions.map((q, i) => `
              <div class="q-item ${i === state.selectedIndex ? 'is-active' : ''}" data-select="${i}" data-q-label="${escapeHtml((q.prompt || '').toLowerCase())}" role="button" tabindex="0">
                <span class="q-drag" data-drag-handle title="Перетащить" aria-label="Перетащить">${icon('grip', { size: 16 })}</span>
                <span class="q-index">${i + 1}</span>
                <span class="q-title">${escapeHtml(q.prompt || '(без текста)')}</span>
              </div>`).join('') || '<p class="empty">Добавьте вопрос</p>'}
          </div>
          <div class="add-row">
            <button type="button" class="btn btn-primary" data-action="add-question">${withIcon('plus', 'Добавить вопрос')}</button>
          </div>
        </aside>

        <section class="ed-main">
          ${selected ? renderQuestionEditor(selected, state.selectedIndex) : '<p class="empty">Выберите или создайте вопрос</p>'}
        </section>

        <aside class="ed-settings">
          <h2>Настройки</h2>
          ${renderSettings(content.settings || {}, maxScore)}
        </aside>
      </div>`,
    footer: `
      <div class="save-stamp ${state.dirty ? 'is-dirty' : ''}">
        ${state.dirty ? '● Есть несохранённые изменения' : `${icon('check', { size: 16 })} Сохранено`}
      </div>
      <div class="ed-actions">
        <button type="button" class="btn btn-ghost" data-action="back">${withIcon('x', 'Отмена')}</button>
        <button type="button" class="btn btn-primary" data-action="save">${withIcon('save', 'Сохранить изменения')}</button>
      </div>`,
  });

  bindEditorEvents();
  bindSidebar(root);
}

function renderQuestionEditor(question, index) {
  const types = supportedTypes();
  const promptLen = String(question.prompt || '').length;
  const tab = state.qTab === 'params' ? 'params' : 'edit';
  return `
    <div class="q-editor">
      <div class="q-editor-top">
        <h2>Вопрос ${index + 1}</h2>
        <div class="ed-actions">
          <button type="button" class="btn btn-ghost btn-ico" data-action="dup-q" title="Дублировать">${icon('copy', { size: 16 })}</button>
          <button type="button" class="btn btn-ghost btn-ico" data-action="up-q" title="Выше" ${index === 0 ? 'disabled' : ''}>${icon('arrowUp', { size: 16 })}</button>
          <button type="button" class="btn btn-ghost btn-ico" data-action="down-q" title="Ниже" ${index >= state.content.questions.length - 1 ? 'disabled' : ''}>${icon('arrowDown', { size: 16 })}</button>
          <button type="button" class="btn btn-danger" data-action="del-q">${withIcon('trash', 'Удалить')}</button>
        </div>
      </div>
      <div class="q-tabs">
        <button type="button" class="q-tab ${tab === 'edit' ? 'is-active' : ''}" data-q-tab="edit">Редактирование</button>
        <button type="button" class="q-tab ${tab === 'params' ? 'is-active' : ''}" data-q-tab="params">Параметры вопроса</button>
      </div>
      ${tab === 'edit' ? `
        <label class="field">Тип ответа
          <select class="input" data-q="type">
            ${types.map((t) => `
              <option value="${t.type}" ${t.type === question.type ? 'selected' : ''}>${escapeHtml(t.label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">Текст вопроса
          <textarea class="input" rows="3" data-q="prompt" maxlength="2000">${escapeHtml(question.prompt || '')}</textarea>
        </label>
        <div class="char-count">${promptLen} / 2000</div>
        ${renderTypeFields(question)}
      ` : `
        ${question.type !== 'info' ? `<label class="field">Баллы
          <input class="input narrow" type="number" min="0" step="0.5" data-q="points" value="${question.points ?? 1}">
        </label>` : '<p class="hint">Информационный блок без баллов.</p>'}
        ${question.type !== 'info' ? `<label class="field">Пояснение при ошибке
          <textarea class="input" rows="3" data-q="explanation" placeholder="В тренировочном режиме при неверном ответе">${escapeHtml(question.explanation || '')}</textarea>
        </label>` : ''}
      `}
    </div>`;
}

function renderTypeFields(question) {
  switch (question.type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false':
      return `
        ${question.type === 'multiple_choice' ? `
          <label class="field">Оценивание
            <select class="input" data-q="scoringMode">
              <option value="all_or_nothing" ${question.scoringMode !== 'partial' ? 'selected' : ''}>Только полный ответ</option>
              <option value="partial" ${question.scoringMode === 'partial' ? 'selected' : ''}>Частичный балл</option>
            </select>
          </label>` : ''}
        <div class="options" data-reorder="options">
          <p class="hint" style="margin-top:0">Варианты ответов</p>
          ${(question.options || []).map((o, i) => `
            <div class="option-row" data-opt-row="${i}">
              <span class="q-drag" data-drag-handle title="Перетащить" aria-label="Перетащить">${icon('grip', { size: 16 })}</span>
              <input type="${question.type === 'multiple_choice' ? 'checkbox' : 'radio'}"
                     name="correct" data-opt-correct="${i}" ${o.correct ? 'checked' : ''}>
              <input class="input" data-opt-text="${i}" value="${escapeHtml(o.text || '')}">
              <button type="button" class="btn btn-ghost btn-ico" data-opt-del="${i}" title="Удалить" ${question.type === 'true_false' ? 'disabled' : ''}>${icon('x', { size: 16 })}</button>
            </div>`).join('')}
        </div>
        ${question.type !== 'true_false' ? `<button type="button" class="btn btn-soft" data-action="add-option">${withIcon('plus', 'Добавить вариант')}</button>` : ''}`;
    case 'text':
      return `
        <label class="field">Принимаемые ответы (каждый с новой строки)
          <textarea class="input" rows="4" data-q="acceptedAnswers">${escapeHtml((question.acceptedAnswers || []).join('\n'))}</textarea>
        </label>
        <label class="check"><input type="checkbox" data-q="caseSensitive" ${question.caseSensitive ? 'checked' : ''}> Учитывать регистр</label>`;
    case 'numeric':
      return `
        <div class="inline-fields">
          <label class="field">Правильное значение
            <input class="input" type="number" step="any" data-q="correctValue" value="${question.correctValue ?? 0}">
          </label>
          <label class="field">Погрешность
            <input class="input" type="number" step="any" min="0" data-q="tolerance" value="${question.tolerance ?? 0}">
          </label>
        </div>`;
    case 'matching':
      return `<div class="pairs" data-reorder="pairs">${(question.pairs || []).map((p, i) => `
        <div class="option-row" data-pair-row="${i}">
          <span class="q-drag" data-drag-handle title="Перетащить">${icon('grip', { size: 16 })}</span>
          <input class="input" data-pair-left="${i}" value="${escapeHtml(p.leftText || '')}" placeholder="Слева">
          <span>→</span>
          <input class="input" data-pair-right="${i}" value="${escapeHtml(p.rightText || '')}" placeholder="Справа">
          <button type="button" class="btn btn-ghost btn-ico" data-pair-del="${i}" title="Удалить">${icon('x', { size: 16 })}</button>
        </div>`).join('')}</div>
        <button type="button" class="btn btn-soft" data-action="add-pair">${withIcon('plus', 'Добавить пару')}</button>`;
    case 'ordering':
      return `<div class="pairs" data-reorder="items">${(question.items || []).map((item, i) => `
        <div class="option-row" data-item-row="${i}">
          <span class="q-drag" data-drag-handle title="Перетащить">${icon('grip', { size: 16 })}</span>
          <span class="q-index">${i + 1}</span>
          <input class="input" data-item-text="${i}" value="${escapeHtml(item.text || '')}">
          <button type="button" class="btn btn-ghost btn-ico" data-item-del="${i}" title="Удалить">${icon('x', { size: 16 })}</button>
        </div>`).join('')}</div>
        <button type="button" class="btn btn-soft" data-action="add-item">${withIcon('plus', 'Добавить элемент')}</button>`;
    case 'fill_blanks':
      return `<div class="pairs" data-reorder="blanks">${(question.blanks || []).map((b, i) => `
        <div class="option-row" data-blank-row="${i}">
          <span class="q-drag" data-drag-handle title="Перетащить">${icon('grip', { size: 16 })}</span>
          <span class="q-index">${i + 1}</span>
          <input class="input" data-blank-answers="${i}" value="${escapeHtml((b.acceptedAnswers || []).join(' | '))}" placeholder="ответы через |">
          <button type="button" class="btn btn-ghost btn-ico" data-blank-del="${i}" title="Удалить">${icon('x', { size: 16 })}</button>
        </div>`).join('')}</div>
        <button type="button" class="btn btn-soft" data-action="add-blank">${withIcon('plus', 'Добавить пропуск')}</button>`;
    case 'info':
      return '<p class="hint">Информационный блок не начисляет баллы.</p>';
    case 'image': {
      const src = resolveResourceSrc(state.content, question.imageResourceId);
      const inner = question.innerQuestion || createQuestion('single_choice');
      return `
        <div class="image-block">
          ${src ? `<figure class="ed-media"><img src="${src}" alt=""></figure>` : '<p class="hint">Изображение ещё не загружено</p>'}
          <label class="btn file-btn">Загрузить изображение
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden data-action="upload-image">
          </label>
          ${question.imageResourceId ? '<button type="button" class="btn btn-ghost" data-action="clear-image">Убрать изображение</button>' : ''}
        </div>
        <h3>Вложенный вопрос (оценивание)</h3>
        <label class="field">Тип вложенного
          <select class="input" data-inner="type">
            ${['single_choice', 'multiple_choice', 'true_false', 'text', 'numeric']
              .map((t) => `<option value="${t}" ${inner.type === t ? 'selected' : ''}>${escapeHtml(supportedTypes().find((x) => x.type === t)?.label || t)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field">Текст вложенного
          <textarea class="input" rows="2" data-inner="prompt">${escapeHtml(inner.prompt || '')}</textarea>
        </label>
        ${(inner.type === 'single_choice' || inner.type === 'multiple_choice' || inner.type === 'true_false')
          ? `<div class="options">${(inner.options || []).map((o, i) => `
              <div class="option-row">
                <input type="${inner.type === 'multiple_choice' ? 'checkbox' : 'radio'}" name="inner-correct" data-inner-opt-correct="${i}" ${o.correct ? 'checked' : ''}>
                <input class="input" data-inner-opt-text="${i}" value="${escapeHtml(o.text || '')}">
              </div>`).join('')}</div>`
          : ''}
        ${inner.type === 'text' ? `<label class="field">Принимаемые ответы
          <textarea class="input" rows="3" data-inner="acceptedAnswers">${escapeHtml((inner.acceptedAnswers || []).join('\n'))}</textarea>
        </label>` : ''}
        ${inner.type === 'numeric' ? `<div class="inline-fields">
          <label class="field">Значение<input class="input" type="number" step="any" data-inner="correctValue" value="${inner.correctValue ?? 0}"></label>
          <label class="field">Погрешность<input class="input" type="number" step="any" min="0" data-inner="tolerance" value="${inner.tolerance ?? 0}"></label>
        </div>` : ''}`;
    }
    default:
      return '';
  }
}

function timeLimitMinutesValue(seconds) {
  if (seconds == null || seconds === '') return '';
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec <= 0) return '';
  return Math.max(0, Math.round(sec / 60));
}

function renderSettings(settings, maxScoreOverride) {
  const mode = currentMode(settings);
  const toggles = [
    ['shuffleQuestions', 'Перемешивать вопросы'],
    ['shuffleOptions', 'Перемешивать ответы'],
    ['showCorrectAnswers', 'Показывать правильные ответы'],
    ['showScore', 'Показывать баллы'],
    ['allowNavigationBack', 'Возврат к предыдущим'],
    ['allowSkip', 'Разрешить пропуск'],
  ];

  const scale = Array.isArray(settings.gradingScale) && settings.gradingScale.length
    ? settings.gradingScale
    : defaultGradingScale();
  const maxScore = maxScoreOverride ?? (state.content?.questions || []).reduce((sum, q) => {
    if (q.type === 'info') return sum;
    return sum + (Number(q.points) || 0);
  }, 0);
  const withPoints = pointsForScale(scale, maxScore);
  const modeHint = mode === 'training'
    ? 'После ответа — проверка, правильный ответ и пояснение.'
    : mode === 'exam'
      ? 'Без возврата и пропуска; ответы скрыты.'
      : 'Настройки ниже задаются вручную.';
  const hasTime = Number(settings.timeLimitSeconds) > 0;

  return `
    <label class="field">Режим прохождения
      <select class="input" data-mode>
        <option value="normal" ${mode === 'normal' ? 'selected' : ''}>Обычный</option>
        <option value="training" ${mode === 'training' ? 'selected' : ''}>Тренировочный</option>
        <option value="exam" ${mode === 'exam' ? 'selected' : ''}>Экзаменационный</option>
      </select>
    </label>
    <p class="hint">${modeHint}</p>
    <label class="toggle-row">Ограничение по времени
      <input type="checkbox" data-time-enabled ${hasTime ? 'checked' : ''}>
    </label>
    <label class="field">Время на тест (мин)
      <input class="input" type="number" min="0" step="1" data-setting="timeLimitSeconds" data-unit="minutes" value="${timeLimitMinutesValue(settings.timeLimitSeconds)}" placeholder="без лимита" ${hasTime ? '' : 'disabled'}>
    </label>
    ${toggles.map(([key, label]) => `
      <label class="toggle-row">${label}
        <input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}>
      </label>`).join('')}
    <label class="field">Число попыток
      <input class="input" type="number" min="0" step="1" data-setting="maxAttempts" value="${settings.maxAttempts ?? ''}">
    </label>
    <label class="field">Проходной балл %
      <input class="input" type="number" min="0" max="100" step="1" data-setting="passThresholdPercent" value="${settings.passThresholdPercent ?? ''}">
    </label>
    <label class="field">Показ результата
      <select class="input" data-setting="showResultMode">
        <option value="immediate" ${settings.showResultMode !== 'teacher_release' ? 'selected' : ''}>Сразу</option>
        <option value="teacher_release" ${settings.showResultMode === 'teacher_release' ? 'selected' : ''}>После решения преподавателя</option>
      </select>
    </label>

    <div class="score-card">${icon('trophy', { size: 18 })} Результат: максимальный балл ${maxScore}</div>

    <h2>Критерии оценок</h2>
    <p class="hint">Минимальный % для оценки. От суммы баллов (${maxScore}).</p>
    <div class="grade-scale">
      ${withPoints.map((band, i) => `
        <div class="grade-row">
          <input class="input" data-grade-label="${i}" value="${escapeHtml(band.label)}" title="Оценка" aria-label="Оценка">
          <label class="grade-min">от
            <input class="input" type="number" min="0" max="100" step="1" data-grade-percent="${i}" value="${band.minPercent}">
            <span>%</span>
          </label>
          <span class="grade-points">≥ ${band.minPoints} б.</span>
          <button type="button" class="btn btn-ghost" data-grade-del="${i}" ${withPoints.length <= 2 ? 'disabled' : ''} title="Удалить">×</button>
        </div>`).join('')}
    </div>
    <div class="grade-actions">
      <button type="button" class="btn" data-action="add-grade">Добавить оценку</button>
      <button type="button" class="btn btn-ghost" data-action="reset-grades">Сбросить 5–2</button>
    </div>

    <h2>Группы вопросов</h2>
    <p class="hint">Выборка из группы при прохождении.</p>
    ${renderGroupsEditor()}`;
}

function renderGroupsEditor() {
  const groups = state.content.questionGroups || [];
  const questions = state.content.questions || [];
  return `
    <div class="groups">
      ${groups.map((g, gi) => `
        <div class="group-card">
          <input class="input" data-group-title="${gi}" value="${escapeHtml(g.title || '')}" placeholder="Название группы">
          <label class="field inline">Выбрать
            <input class="input narrow" type="number" min="0" data-group-pick="${gi}" value="${g.pick ?? ''}" placeholder="все">
          </label>
          <label class="check"><input type="checkbox" data-group-shuffle="${gi}" ${g.shuffle !== false ? 'checked' : ''}> Перемешивать</label>
          <div class="group-qs">
            ${questions.map((q) => `
              <label class="check">
                <input type="checkbox" data-group-qid="${gi}" value="${escapeHtml(q.id)}" ${(g.questionIds || []).includes(q.id) ? 'checked' : ''}>
                ${escapeHtml((q.prompt || q.id).slice(0, 40))}
              </label>`).join('') || '<p class="hint">Нет вопросов</p>'}
          </div>
          <button type="button" class="btn btn-ghost" data-group-del="${gi}">Удалить группу</button>
        </div>`).join('') || '<p class="hint">Групп пока нет</p>'}
    </div>
    <button type="button" class="btn" data-action="add-group">Добавить группу</button>`;
}

function bindEditorEvents() {
  root.querySelector('[data-action="back"]')?.addEventListener('click', () => showList());
  root.querySelector('[data-action="save"]')?.addEventListener('click', onSave);
  root.querySelector('[data-action="export"]')?.addEventListener('click', async () => {
    if (state.dirty) {
      alert('Сначала сохраните тест');
      return;
    }
    await api.exportQuiz(state.quizId, state.content.title);
    state.status = 'Экспорт .quiz выполнен';
    render();
  });
  root.querySelector('[data-action="export-standalone"]')?.addEventListener('click', () => {
    if (state.dirty) {
      alert('Сначала сохраните тест');
      return;
    }
    openOsExportDialog();
  });
  root.querySelector('[data-action="export-web"]')?.addEventListener('click', async () => {
    if (state.dirty) {
      alert('Сначала сохраните тест');
      return;
    }
    try {
      await api.exportWeb(state.quizId, state.content.title);
      state.status = 'Веб-пакет скачан (ZIP для браузера)';
      render();
    } catch (error) {
      alert(error.message);
    }
  });
  root.querySelector('[data-action="network"]')?.addEventListener('click', startNetworkSession);
  root.querySelector('[data-action="publish"]')?.addEventListener('click', openPublishPage);
  root.querySelector('[data-action="print"]')?.addEventListener('click', () => {
    try {
      printQuiz(state.content);
      state.status = 'Открыто окно печати (бланк + ключ)';
      renderStatus();
    } catch (err) {
      alert(err.message);
    }
  });
  root.querySelector('[data-action="export-word"]')?.addEventListener('click', async () => {
    try {
      await downloadQuizDocx(state.content);
      state.status = 'Word скачан (бланк + ключ)';
      renderStatus();
    } catch (err) {
      alert(err.message || 'Не удалось создать Word');
    }
  });
  root.querySelector('[data-action="add-question"]')?.addEventListener('click', () => {
    state.content.questions.push(createQuestion('single_choice'));
    state.selectedIndex = state.content.questions.length - 1;
    state.qTab = 'edit';
    markDirty();
    render();
  });

  root.querySelectorAll('[data-select]').forEach((el) => {
    const select = () => {
      state.selectedIndex = Number(el.getAttribute('data-select'));
      state.qTab = 'edit';
      render();
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-drag-handle]')) return;
      select();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });

  bindReorder({
    container: root.querySelector('.q-list'),
    itemSelector: '.q-item',
    onReorder: (from, to) => {
      state.content.questions = moveItem(state.content.questions, from, to);
      if (state.selectedIndex === from) state.selectedIndex = to;
      else if (from < state.selectedIndex && to >= state.selectedIndex) state.selectedIndex -= 1;
      else if (from > state.selectedIndex && to <= state.selectedIndex) state.selectedIndex += 1;
      markDirty();
      render();
    },
  });

  root.querySelectorAll('[data-q-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      state.qTab = el.getAttribute('data-q-tab') === 'params' ? 'params' : 'edit';
      render();
    });
  });

  root.querySelector('[data-q-filter]')?.addEventListener('input', (e) => {
    const q = String(e.target.value || '').trim().toLowerCase();
    root.querySelectorAll('.q-item').forEach((item) => {
      const label = item.getAttribute('data-q-label') || '';
      item.hidden = Boolean(q) && !label.includes(q);
    });
  });

  root.querySelector('[data-time-enabled]')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    const input = root.querySelector('[data-setting="timeLimitSeconds"]');
    if (on) {
      state.content.settings.timeLimitSeconds = state.content.settings.timeLimitSeconds || 30 * 60;
      if (input) {
        input.disabled = false;
        input.value = String(timeLimitMinutesValue(state.content.settings.timeLimitSeconds) || 30);
      }
    } else {
      state.content.settings.timeLimitSeconds = null;
      if (input) {
        input.disabled = true;
        input.value = '';
      }
    }
    markDirty();
  });

  root.querySelector('[data-field="title"]')?.addEventListener('input', (e) => {
    state.content.title = e.target.value;
    markDirty();
  });
  root.querySelector('[data-field="description"]')?.addEventListener('input', (e) => {
    state.content.description = e.target.value;
    markDirty();
  });
  root.querySelector('[data-field="author"]')?.addEventListener('input', (e) => {
    state.content.author = e.target.value;
    markDirty();
  });

  root.querySelector('[data-mode]')?.addEventListener('change', (e) => {
    const mode = e.target.value === 'training' || e.target.value === 'exam' ? e.target.value : 'normal';
    state.content.settings = applyModePreset(state.content.settings || {}, mode);
    markDirty();
    render();
  });

  root.querySelectorAll('[data-setting]').forEach((el) => {
    const key = el.getAttribute('data-setting');
    const handler = () => {
      if (el.type === 'checkbox') {
        state.content.settings[key] = el.checked;
      } else if (el.type === 'number') {
        if (el.value === '') {
          state.content.settings[key] = null;
        } else {
          let num = Number(el.value);
          if (!Number.isFinite(num) || num < 0) num = 0;
          if (key === 'passThresholdPercent' && num > 100) num = 100;
          if (el.value !== String(num)) el.value = String(num);
          if (el.getAttribute('data-unit') === 'minutes') {
            state.content.settings[key] = num === 0 ? null : Math.round(num * 60);
          } else {
            state.content.settings[key] = num;
          }
        }
      } else {
        state.content.settings[key] = el.value;
      }
      markDirty();
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });

  ensureGradingScale();
  root.querySelectorAll('[data-grade-label]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.getAttribute('data-grade-label'));
      state.content.settings.gradingScale[i].label = el.value;
      markDirty();
    });
  });
  root.querySelectorAll('[data-grade-percent]').forEach((el) => {
    const applyPercent = () => {
      const i = Number(el.getAttribute('data-grade-percent'));
      let pct = Number(el.value);
      if (!Number.isFinite(pct) || pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      if (el.value !== String(pct)) el.value = String(pct);
      state.content.settings.gradingScale[i].minPercent = pct;
      updateGradePointsLabels();
      markDirty();
    };
    el.addEventListener('input', applyPercent);
    el.addEventListener('change', applyPercent);
  });
  root.querySelectorAll('[data-grade-del]').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.getAttribute('data-grade-del'));
      if (state.content.settings.gradingScale.length <= 2) return;
      state.content.settings.gradingScale.splice(i, 1);
      markDirty();
      render();
    });
  });
  root.querySelector('[data-action="add-grade"]')?.addEventListener('click', () => {
    ensureGradingScale();
    state.content.settings.gradingScale.push({ label: '3', minPercent: 40, color: '#b7791f' });
    markDirty();
    render();
  });
  root.querySelector('[data-action="reset-grades"]')?.addEventListener('click', () => {
    state.content.settings.gradingScale = defaultGradingScale();
    markDirty();
    render();
  });

  if (!Array.isArray(state.content.questionGroups)) {
    state.content.questionGroups = [];
  }
  root.querySelector('[data-action="add-group"]')?.addEventListener('click', () => {
    state.content.questionGroups.push({
      id: newId('grp'),
      title: 'Группа',
      questionIds: [],
      pick: null,
      shuffle: true,
    });
    markDirty();
    render();
  });
  root.querySelectorAll('[data-group-title]').forEach((el) => {
    el.addEventListener('input', () => {
      state.content.questionGroups[Number(el.getAttribute('data-group-title'))].title = el.value;
      markDirty();
    });
  });
  root.querySelectorAll('[data-group-pick]').forEach((el) => {
    el.addEventListener('change', () => {
      const g = state.content.questionGroups[Number(el.getAttribute('data-group-pick'))];
      g.pick = el.value === '' ? null : Math.max(0, Number(el.value) || 0);
      markDirty();
    });
  });
  root.querySelectorAll('[data-group-shuffle]').forEach((el) => {
    el.addEventListener('change', () => {
      state.content.questionGroups[Number(el.getAttribute('data-group-shuffle'))].shuffle = el.checked;
      markDirty();
    });
  });
  root.querySelectorAll('[data-group-qid]').forEach((el) => {
    el.addEventListener('change', () => {
      const gi = Number(el.getAttribute('data-group-qid'));
      const g = state.content.questionGroups[gi];
      const id = el.value;
      const set = new Set(g.questionIds || []);
      if (el.checked) set.add(id);
      else set.delete(id);
      g.questionIds = [...set];
      markDirty();
    });
  });
  root.querySelectorAll('[data-group-del]').forEach((el) => {
    el.addEventListener('click', () => {
      state.content.questionGroups.splice(Number(el.getAttribute('data-group-del')), 1);
      markDirty();
      render();
    });
  });

  const q = state.content.questions[state.selectedIndex];
  if (!q) return;

  root.querySelector('[data-action="dup-q"]')?.addEventListener('click', () => {
    state.content.questions.splice(state.selectedIndex + 1, 0, cloneQuestion(q));
    state.selectedIndex += 1;
    markDirty();
    render();
  });
  root.querySelector('[data-action="del-q"]')?.addEventListener('click', () => {
    if (!confirm('Удалить вопрос?')) return;
    state.content.questions.splice(state.selectedIndex, 1);
    markDirty();
    render();
  });
  root.querySelector('[data-action="up-q"]')?.addEventListener('click', () => moveQuestion(-1));
  root.querySelector('[data-action="down-q"]')?.addEventListener('click', () => moveQuestion(1));

  root.querySelector('[data-q="type"]')?.addEventListener('change', (e) => {
    const nextType = e.target.value;
    state.content.questions[state.selectedIndex] = changeQuestionType(q, nextType);
    markDirty();
    render();
  });

  root.querySelector('[data-q="prompt"]')?.addEventListener('input', (e) => {
    const counter = root.querySelector('.char-count');
    if (counter) counter.textContent = `${String(e.target.value || '').length} / 2000`;
    q.prompt = e.target.value;
    markDirty();
  });
  root.querySelector('[data-q="explanation"]')?.addEventListener('input', (e) => {
    q.explanation = e.target.value;
    markDirty();
  });
  root.querySelector('[data-q="points"]')?.addEventListener('input', (e) => {
    q.points = Number(e.target.value);
    markDirty();
  });
  root.querySelector('[data-q="scoringMode"]')?.addEventListener('change', (e) => {
    q.scoringMode = e.target.value;
    markDirty();
  });
  root.querySelector('[data-q="acceptedAnswers"]')?.addEventListener('input', (e) => {
    q.acceptedAnswers = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
    markDirty();
  });
  root.querySelector('[data-q="caseSensitive"]')?.addEventListener('change', (e) => {
    q.caseSensitive = e.target.checked;
    markDirty();
  });
  root.querySelector('[data-q="correctValue"]')?.addEventListener('input', (e) => {
    q.correctValue = Number(e.target.value);
    markDirty();
  });
  root.querySelector('[data-q="tolerance"]')?.addEventListener('input', (e) => {
    q.tolerance = Number(e.target.value);
    markDirty();
  });

  root.querySelectorAll('[data-opt-text]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.getAttribute('data-opt-text'));
      q.options[i].text = el.value;
      markDirty();
    });
  });
  root.querySelectorAll('[data-opt-correct]').forEach((el) => {
    el.addEventListener('change', () => {
      const i = Number(el.getAttribute('data-opt-correct'));
      if (q.type === 'multiple_choice') {
        q.options[i].correct = el.checked;
      } else {
        q.options.forEach((opt, idx) => {
          opt.correct = idx === i;
        });
        render();
      }
      markDirty();
    });
  });
  root.querySelectorAll('[data-opt-del]').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.getAttribute('data-opt-del'));
      if ((q.options || []).length <= 2) return;
      q.options.splice(i, 1);
      markDirty();
      render();
    });
  });
  root.querySelector('[data-action="add-option"]')?.addEventListener('click', () => {
    q.options.push({ id: `o_${Math.random().toString(36).slice(2, 8)}`, text: 'Новый вариант', correct: false });
    markDirty();
    render();
  });

  bindReorder({
    container: root.querySelector('[data-reorder="options"]'),
    itemSelector: '.option-row',
    onReorder: (from, to) => {
      if (q.type === 'true_false') return;
      q.options = moveItem(q.options || [], from, to);
      markDirty();
      render();
    },
  });
  bindReorder({
    container: root.querySelector('[data-reorder="pairs"]'),
    itemSelector: '.option-row',
    onReorder: (from, to) => {
      q.pairs = moveItem(q.pairs || [], from, to);
      markDirty();
      render();
    },
  });
  bindReorder({
    container: root.querySelector('[data-reorder="items"]'),
    itemSelector: '.option-row',
    onReorder: (from, to) => {
      q.items = moveItem(q.items || [], from, to);
      markDirty();
      render();
    },
  });
  bindReorder({
    container: root.querySelector('[data-reorder="blanks"]'),
    itemSelector: '.option-row',
    onReorder: (from, to) => {
      q.blanks = moveItem(q.blanks || [], from, to);
      markDirty();
      render();
    },
  });

  root.querySelector('[data-action="add-pair"]')?.addEventListener('click', () => {
    q.pairs.push({
      leftId: `l_${Math.random().toString(36).slice(2, 8)}`,
      rightId: `r_${Math.random().toString(36).slice(2, 8)}`,
      leftText: '',
      rightText: '',
    });
    markDirty();
    render();
  });
  root.querySelectorAll('[data-pair-left]').forEach((el) => {
    el.addEventListener('input', () => {
      q.pairs[Number(el.getAttribute('data-pair-left'))].leftText = el.value;
      markDirty();
    });
  });
  root.querySelectorAll('[data-pair-right]').forEach((el) => {
    el.addEventListener('input', () => {
      q.pairs[Number(el.getAttribute('data-pair-right'))].rightText = el.value;
      markDirty();
    });
  });
  root.querySelectorAll('[data-pair-del]').forEach((el) => {
    el.addEventListener('click', () => {
      q.pairs.splice(Number(el.getAttribute('data-pair-del')), 1);
      markDirty();
      render();
    });
  });

  root.querySelector('[data-action="add-item"]')?.addEventListener('click', () => {
    q.items.push({ id: `i_${Math.random().toString(36).slice(2, 8)}`, text: '' });
    markDirty();
    render();
  });
  root.querySelectorAll('[data-item-text]').forEach((el) => {
    el.addEventListener('input', () => {
      q.items[Number(el.getAttribute('data-item-text'))].text = el.value;
      markDirty();
    });
  });
  root.querySelectorAll('[data-item-del]').forEach((el) => {
    el.addEventListener('click', () => {
      q.items.splice(Number(el.getAttribute('data-item-del')), 1);
      markDirty();
      render();
    });
  });

  root.querySelector('[data-action="add-blank"]')?.addEventListener('click', () => {
    q.blanks.push({ id: `b_${Math.random().toString(36).slice(2, 8)}`, acceptedAnswers: [''] });
    markDirty();
    render();
  });
  root.querySelectorAll('[data-blank-answers]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.getAttribute('data-blank-answers'));
      q.blanks[i].acceptedAnswers = el.value.split('|').map((s) => s.trim()).filter(Boolean);
      markDirty();
    });
  });
  root.querySelectorAll('[data-blank-del]').forEach((el) => {
    el.addEventListener('click', () => {
      q.blanks.splice(Number(el.getAttribute('data-blank-del')), 1);
      markDirty();
      render();
    });
  });

  if (q.type === 'image') {
    if (!q.innerQuestion) {
      q.innerQuestion = createQuestion('single_choice');
    }
    root.querySelector('[data-action="upload-image"]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const resource = await fileToResource(file);
        if (!Array.isArray(state.content.resources)) state.content.resources = [];
        if (q.imageResourceId) {
          state.content.resources = state.content.resources.filter((r) => r.id !== q.imageResourceId);
        }
        state.content.resources.push(resource);
        q.imageResourceId = resource.id;
        markDirty();
        render();
      } catch (error) {
        alert(error.message || String(error));
      } finally {
        e.target.value = '';
      }
    });
    root.querySelector('[data-action="clear-image"]')?.addEventListener('click', () => {
      if (q.imageResourceId) {
        state.content.resources = (state.content.resources || []).filter((r) => r.id !== q.imageResourceId);
      }
      q.imageResourceId = null;
      markDirty();
      render();
    });
    root.querySelector('[data-inner="type"]')?.addEventListener('change', (e) => {
      const next = createQuestion(e.target.value);
      next.prompt = q.innerQuestion?.prompt || '';
      next.points = q.points ?? 1;
      q.innerQuestion = next;
      markDirty();
      render();
    });
    root.querySelector('[data-inner="prompt"]')?.addEventListener('input', (e) => {
      q.innerQuestion.prompt = e.target.value;
      markDirty();
    });
    root.querySelector('[data-inner="acceptedAnswers"]')?.addEventListener('input', (e) => {
      q.innerQuestion.acceptedAnswers = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
      markDirty();
    });
    root.querySelector('[data-inner="correctValue"]')?.addEventListener('input', (e) => {
      q.innerQuestion.correctValue = Number(e.target.value);
      markDirty();
    });
    root.querySelector('[data-inner="tolerance"]')?.addEventListener('input', (e) => {
      q.innerQuestion.tolerance = Number(e.target.value);
      markDirty();
    });
    root.querySelectorAll('[data-inner-opt-text]').forEach((el) => {
      el.addEventListener('input', () => {
        const i = Number(el.getAttribute('data-inner-opt-text'));
        q.innerQuestion.options[i].text = el.value;
        markDirty();
      });
    });
    root.querySelectorAll('[data-inner-opt-correct]').forEach((el) => {
      el.addEventListener('change', () => {
        const i = Number(el.getAttribute('data-inner-opt-correct'));
        if (q.innerQuestion.type === 'multiple_choice') {
          q.innerQuestion.options[i].correct = el.checked;
        } else {
          q.innerQuestion.options.forEach((opt, idx) => {
            opt.correct = idx === i;
          });
          render();
        }
        markDirty();
      });
    });
  }
}

function moveQuestion(delta) {
  const from = state.selectedIndex;
  const to = from + delta;
  if (to < 0 || to >= state.content.questions.length) return;
  const arr = state.content.questions;
  [arr[from], arr[to]] = [arr[to], arr[from]];
  state.selectedIndex = to;
  markDirty();
  render();
}

async function onCreate() {
  const content = blankQuiz();
  content.questions.push(createQuestion('single_choice'));
  const folderId = typeof state.folderFilter === 'number' ? state.folderFilter : null;
  const quiz = await api.createQuiz(content, folderId);
  state.status = 'Тест создан';
  await openQuiz(quiz.id);
}

async function onImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const quiz = await api.importQuiz(file);
    state.status = 'Импорт выполнен';
    await openQuiz(quiz.id);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
}

async function onSave() {
  try {
    validateQuizDocument(state.content);
  } catch (error) {
    const details = error.details?.length ? `\n- ${error.details.join('\n- ')}` : '';
    alert(`${error.message}${details}`);
    return;
  }

  try {
    const saved = state.quizId
      ? await api.updateQuiz(state.quizId, state.content)
      : await api.createQuiz(state.content);
    state.quizId = saved.id;
    state.content = structuredClone(saved.content);
    state.dirty = false;
    state.status = `Сохранено · версия ${saved.version_number}`;
    history.replaceState({}, '', `/editor/${saved.id}`);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function startNetworkSession() {
  if (!state.quizId) {
    alert('Сначала сохраните тест');
    return;
  }
  if (state.dirty) {
    const ok = confirm('Есть несохранённые изменения. Сохранить и открыть сетевую сессию?');
    if (!ok) return;
    await onSave();
    if (state.dirty) return;
  }
  try {
    const session = await api.createSession(state.quizId);
    window.location.href = `/session/${session.id}`;
  } catch (error) {
    alert(error.message);
  }
}

async function openPublishPage() {
  if (!state.quizId) {
    alert('Сначала сохраните тест');
    return;
  }
  if (state.dirty) {
    const ok = confirm('Есть несохранённые изменения. Сохранить и открыть публикацию?');
    if (!ok) return;
    await onSave();
    if (state.dirty) return;
  }
  window.location.href = `/publish/${state.quizId}`;
}

function readOsValidDays(dialog) {
  const select = dialog.querySelector('[data-el="os-valid-days"]');
  const custom = dialog.querySelector('[data-el="os-valid-custom"]');
  if (!select) return null;
  const value = select.value;
  if (!value) return null;
  if (value === 'custom') {
    const days = Number(custom?.value || 0);
    return Number.isFinite(days) && days > 0 ? Math.min(3650, Math.floor(days)) : null;
  }
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function bindOsExpiryControls(dialog) {
  const select = dialog.querySelector('[data-el="os-valid-days"]');
  const wrap = dialog.querySelector('[data-el="os-valid-custom-wrap"]');
  if (!select || !wrap) return;
  const sync = () => {
    const custom = select.value === 'custom';
    wrap.hidden = !custom;
    wrap.toggleAttribute('hidden', !custom);
  };
  if (select.dataset.bound !== '1') {
    select.dataset.bound = '1';
    select.addEventListener('change', sync);
  }
  sync();
}

async function openOsExportDialog() {
  const dialog = root.querySelector('#os-export-dialog');
  const list = root.querySelector('[data-el="os-list"]');
  const choose = root.querySelector('[data-el="os-choose"]');
  const progress = root.querySelector('[data-el="os-progress"]');
  const progressSub = root.querySelector('[data-el="os-progress-sub"]');
  const cancelBtn = root.querySelector('[data-el="os-cancel"]');
  if (!dialog || !list || !choose || !progress) return;

  choose.hidden = false;
  progress.hidden = true;
  if (cancelBtn) cancelBtn.disabled = false;
  list.innerHTML = '<p class="muted">Загрузка…</p>';
  bindOsExpiryControls(dialog);
  dialog.showModal();

  const labels = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

  try {
    const catalog = await api.exportPlatforms();
    const items = Array.isArray(catalog.autonomous) ? catalog.autonomous : [
      { id: 'windows', label: 'Windows (.exe)', available: !!catalog.windows?.available, note: catalog.windows?.note },
      { id: 'macos', label: 'macOS', available: !!catalog.macos?.available, note: catalog.macos?.note },
      { id: 'linux', label: 'Linux', available: !!catalog.linux?.available, note: catalog.linux?.note },
    ];

    list.innerHTML = items.map((item) => `
      <button type="button" class="os-option ${item.available ? '' : 'is-disabled'}"
              data-os="${escapeHtml(item.id)}" ${item.available ? '' : 'disabled'}>
        <strong>${escapeHtml(item.label)}</strong>
        <span class="muted">${escapeHtml(item.available ? 'Доступно' : (item.note || 'Не опубликован'))}</span>
      </button>`).join('') || '<p class="muted">Нет данных о платформах</p>';

    list.querySelectorAll('[data-os]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const platform = btn.getAttribute('data-os');
        const validDays = readOsValidDays(dialog);
        choose.hidden = true;
        progress.hidden = false;
        if (cancelBtn) cancelBtn.disabled = true;
        dialog.dataset.busy = '1';
        if (progressSub) {
          const expiryHint = validDays
            ? ` · срок ${validDays} ${pluralDays(validDays)}`
            : '';
          progressSub.textContent = `Сборка для ${labels[platform] || platform}${expiryHint}…`;
        }
        try {
          await api.exportStandalone(state.quizId, state.content.title, platform, { validDays });
          state.status = validDays
            ? `Автономный тест (${platform}, ${validDays} дн.) скачан`
            : `Автономный тест (${platform}) скачан`;
          delete dialog.dataset.busy;
          dialog.close();
          render();
        } catch (error) {
          delete dialog.dataset.busy;
          progress.hidden = true;
          choose.hidden = false;
          if (cancelBtn) cancelBtn.disabled = false;
          alert(error.message);
        }
      });
    });

    dialog.addEventListener('cancel', (event) => {
      if (dialog.dataset.busy === '1') event.preventDefault();
    });
  } catch (error) {
    list.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

function pluralDays(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

function updateGradePointsLabels() {
  const maxScore = (state.content?.questions || []).reduce((sum, q) => {
    if (q.type === 'info') return sum;
    return sum + (Number(q.points) || 0);
  }, 0);
  root.querySelectorAll('.grade-row').forEach((row) => {
    const pctInput = row.querySelector('[data-grade-percent]');
    const pointsEl = row.querySelector('.grade-points');
    if (!pctInput || !pointsEl) return;
    const pct = Math.max(0, Math.min(100, Number(pctInput.value) || 0));
    const minPoints = Math.round(((pct / 100) * maxScore) * 100) / 100;
    pointsEl.textContent = `≥ ${minPoints} б.`;
  });
}

function renderStatus() {
  const line = root.querySelector('.app-subtitle') || root.querySelector('.page-lead');
  if (line) {
    line.textContent = `${state.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}${state.status ? ` · ${state.status}` : ''}`;
  }
  const stamp = root.querySelector('.save-stamp');
  if (stamp) {
    stamp.classList.toggle('is-dirty', state.dirty);
    stamp.textContent = state.dirty ? '● Есть несохранённые изменения' : '✓ Сохранено';
  }
  const status = root.querySelector('#status-line');
  if (status) status.textContent = state.status;
}

function ensureGradingScale() {
  if (!state.content.settings) {
    state.content.settings = {};
  }
  if (!Array.isArray(state.content.settings.gradingScale) || state.content.settings.gradingScale.length === 0) {
    state.content.settings.gradingScale = defaultGradingScale();
  }
}

function formatDate(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
