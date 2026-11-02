import '../../css/editor.css';
import { validateQuizDocument } from '../core/quiz-engine/validate.js';
import { fileToResource, resolveResourceSrc } from '../core/quiz-engine/resources.js';
import * as api from './api.js';
import { downloadQuizDocx, printQuiz } from './export-document.js';
import { defaultGradingScale, pointsForScale } from '../core/quiz-engine/grading.js';
import { applyModePreset, currentMode } from '../core/quiz-engine/modes.js';
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

/** @type {{ mode: 'list'|'edit', quizId: number|null, content: object|null, selectedIndex: number, dirty: boolean, status: string, list: object[] }} */
const state = {
  mode: initialId ? 'edit' : 'list',
  quizId: initialId,
  content: null,
  selectedIndex: 0,
  dirty: false,
  status: '',
  list: [],
};

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
  state.list = await api.listQuizzes();
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

function renderList() {
  root.innerHTML = `
    <header class="ed-top page-head">
      <div class="page-head-main">
        <a class="brand-link" href="/">UniTest</a>
        <h1>Мои тесты</h1>
        <p class="muted page-lead">Создание, импорт и проведение тестов</p>
      </div>
      <div class="ed-actions">
        <label class="btn btn-ghost file-btn">Импорт .quiz
          <input type="file" accept=".quiz,.zip" hidden data-action="import">
        </label>
        <button type="button" class="btn btn-primary" data-action="create">Создать тест</button>
      </div>
    </header>
    <section class="ed-list">
      ${state.list.length === 0
        ? '<p class="empty">Тестов пока нет. Создайте первый или импортируйте файл .quiz.</p>'
        : `<table class="table"><thead><tr><th>Название</th><th>Вопросов</th><th>Версия</th><th>Изменён</th><th></th></tr></thead>
           <tbody>${state.list.map((q) => `
             <tr>
               <td><button type="button" class="linkish" data-open="${q.id}">${escapeHtml(q.title)}</button></td>
               <td>${q.questions_count}</td>
               <td>${q.version_number ?? '—'}</td>
               <td>${escapeHtml(formatDate(q.updated_at))}</td>
               <td class="row-actions">
                 <button type="button" class="btn btn-ghost" data-dup="${q.id}">Копия</button>
                 <button type="button" class="btn btn-ghost" data-export="${q.id}" data-title="${escapeHtml(q.title)}">Экспорт</button>
                 <button type="button" class="btn btn-danger" data-del="${q.id}">Удалить</button>
               </td>
             </tr>`).join('')}</tbody></table>`}
    </section>
    <p class="status-line" id="status-line">${escapeHtml(state.status)}</p>`;

  root.querySelector('[data-action="create"]')?.addEventListener('click', onCreate);
  root.querySelector('[data-action="import"]')?.addEventListener('change', onImport);
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
}

function renderEditor() {
  const content = state.content;
  const questions = content.questions || [];
  if (state.selectedIndex >= questions.length) {
    state.selectedIndex = Math.max(0, questions.length - 1);
  }
  const selected = questions[state.selectedIndex] || null;
  const types = supportedTypes();

  root.innerHTML = `
    <header class="ed-top page-head">
      <div class="page-head-main">
        <button type="button" class="nav-back" data-action="back">${navBackIcon()}К списку</button>
        <h1>Редактор теста</h1>
        <p class="muted page-lead">${state.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'} · ${escapeHtml(state.status)}</p>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn btn-primary" data-action="save">Сохранить</button>
      </div>
    </header>

    <section class="ed-actions-panel" aria-label="Действия с тестом">
      <h2 class="ed-actions-title">Действия с тестом</h2>
      <div class="ed-actions-groups">
        <div class="ed-actions-group">
          <span class="ed-actions-label">Проведение</span>
          <div class="ed-actions-btns">
            <a class="btn btn-ghost" href="/player/${state.quizId}" target="_blank" rel="noopener" title="Открыть тест в плеере, как его видит студент (нужно сохранить изменения)">Предпросмотр</a>
            <button type="button" class="btn btn-ghost" data-action="network" title="Создать занятие с кодом для прохождения теста онлайн">Сетевое тестирование</button>
            <a class="btn btn-ghost" href="/reports" title="Результаты попыток и статистика по этому и другим тестам">Отчёты</a>
          </div>
        </div>
        <div class="ed-actions-group">
          <span class="ed-actions-label">Экспорт</span>
          <div class="ed-actions-btns">
            <button type="button" class="btn btn-ghost" data-action="export" title="Скачать файл .quiz для переноса или резервной копии">Экспорт .quiz</button>
            <button type="button" class="btn btn-ghost" data-action="export-standalone" title="Скачать автономный файл (EXE и др.) для прохождения без сервера">Автономный тест</button>
            <button type="button" class="btn btn-ghost" data-action="export-web" title="Скачать ZIP-пакет для открытия теста в браузере без сервера">Веб-пакет</button>
          </div>
        </div>
        <div class="ed-actions-group">
          <span class="ed-actions-label">Документ</span>
          <div class="ed-actions-btns">
            <button type="button" class="btn btn-ghost" data-action="print" title="Распечатать бланк для студентов и ключ ответов для проверки">Печать</button>
            <button type="button" class="btn btn-ghost" data-action="export-word" title="Скачать Word (.docx): бланк для студентов и ключ ответов">Скачать Word</button>
          </div>
        </div>
      </div>
    </section>

    <dialog class="os-dialog" id="os-export-dialog">
      <form method="dialog" class="os-dialog-inner">
        <div data-el="os-choose">
          <h2>Автономный тест — выбор ОС</h2>
          <p class="hint">Скачивается один файл плеера со вшитым тестом. Доступны только ОС, для которых админ опубликовал базовый плеер.</p>
          <div class="os-list" data-el="os-list"><p class="muted">Загрузка…</p></div>
          <div class="ed-actions" style="justify-content:flex-end;margin-top:0.75rem">
            <button type="submit" class="btn btn-ghost" value="cancel" data-el="os-cancel">Отмена</button>
          </div>
        </div>
        <div class="os-progress" data-el="os-progress" hidden>
          <div class="os-preloader" aria-hidden="true">
            <span class="os-preloader-ring"></span>
          </div>
          <h2 class="os-progress-title">Создание теста</h2>
          <p class="muted os-progress-sub" data-el="os-progress-sub">Подготовка файла…</p>
        </div>
      </form>
    </dialog>

    <section class="ed-meta" aria-label="Сведения о тесте">
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
        <div class="q-list">
          ${questions.map((q, i) => `
            <button type="button" class="q-item ${i === state.selectedIndex ? 'is-active' : ''}" data-select="${i}">
              <span class="q-index">${i + 1}</span>
              <span class="q-title">${escapeHtml(q.prompt || '(без текста)')}</span>
              <span class="q-type">${escapeHtml(types.find((t) => t.type === q.type)?.label || q.type)}</span>
            </button>`).join('') || '<p class="empty">Добавьте вопрос</p>'}
        </div>
        <div class="add-row">
          <button type="button" class="btn btn-primary" data-action="add-question">Добавить вопрос</button>
        </div>
      </aside>

      <section class="ed-main">
        ${selected ? renderQuestionEditor(selected, state.selectedIndex) : '<p class="empty">Выберите или создайте вопрос</p>'}
      </section>

      <aside class="ed-settings">
        <h2>Настройки</h2>
        ${renderSettings(content.settings || {})}
      </aside>
    </div>

`;

  bindEditorEvents();
}

function renderQuestionEditor(question, index) {
  const types = supportedTypes();
  return `
    <div class="q-editor">
      <div class="q-editor-top">
        <h2>Вопрос ${index + 1}</h2>
        <div class="ed-actions">
          <button type="button" class="btn btn-ghost" data-action="dup-q">Дублировать</button>
          <button type="button" class="btn btn-ghost" data-action="up-q" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-ghost" data-action="down-q" ${index >= state.content.questions.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-danger" data-action="del-q">Удалить</button>
        </div>
      </div>
      <label class="field">Тип ответа
        <select class="input" data-q="type">
          ${types.map((t) => `
            <option value="${t.type}" ${t.type === question.type ? 'selected' : ''}>${escapeHtml(t.label)}</option>
          `).join('')}
        </select>
      </label>
      <label class="field">Текст вопроса
        <textarea class="input" rows="3" data-q="prompt">${escapeHtml(question.prompt || '')}</textarea>
      </label>
      ${question.type !== 'info' ? `<label class="field inline">Баллы
        <input class="input narrow" type="number" min="0" step="0.5" data-q="points" value="${question.points ?? 1}">
      </label>` : ''}
      ${question.type !== 'info' ? `<label class="field">Пояснение при ошибке
        <textarea class="input" rows="2" data-q="explanation" placeholder="Показывается в тренировочном режиме, если ответ неверный">${escapeHtml(question.explanation || '')}</textarea>
      </label>` : ''}
      ${renderTypeFields(question)}
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
        <div class="options">
          ${(question.options || []).map((o, i) => `
            <div class="option-row">
              <input type="${question.type === 'multiple_choice' ? 'checkbox' : 'radio'}"
                     name="correct" data-opt-correct="${i}" ${o.correct ? 'checked' : ''}>
              <input class="input" data-opt-text="${i}" value="${escapeHtml(o.text || '')}">
              <button type="button" class="btn btn-ghost" data-opt-del="${i}" ${question.type === 'true_false' ? 'disabled' : ''}>×</button>
            </div>`).join('')}
        </div>
        ${question.type !== 'true_false' ? '<button type="button" class="btn" data-action="add-option">Добавить вариант</button>' : ''}`;
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
      return `<div class="pairs">${(question.pairs || []).map((p, i) => `
        <div class="option-row">
          <input class="input" data-pair-left="${i}" value="${escapeHtml(p.leftText || '')}" placeholder="Слева">
          <span>→</span>
          <input class="input" data-pair-right="${i}" value="${escapeHtml(p.rightText || '')}" placeholder="Справа">
          <button type="button" class="btn btn-ghost" data-pair-del="${i}">×</button>
        </div>`).join('')}</div>
        <button type="button" class="btn" data-action="add-pair">Добавить пару</button>`;
    case 'ordering':
      return `<div class="pairs">${(question.items || []).map((item, i) => `
        <div class="option-row">
          <span class="q-index">${i + 1}</span>
          <input class="input" data-item-text="${i}" value="${escapeHtml(item.text || '')}">
          <button type="button" class="btn btn-ghost" data-item-del="${i}">×</button>
        </div>`).join('')}</div>
        <button type="button" class="btn" data-action="add-item">Добавить элемент</button>`;
    case 'fill_blanks':
      return `<div class="pairs">${(question.blanks || []).map((b, i) => `
        <div class="option-row">
          <span class="q-index">${i + 1}</span>
          <input class="input" data-blank-answers="${i}" value="${escapeHtml((b.acceptedAnswers || []).join(' | '))}" placeholder="ответы через |">
          <button type="button" class="btn btn-ghost" data-blank-del="${i}">×</button>
        </div>`).join('')}</div>
        <button type="button" class="btn" data-action="add-blank">Добавить пропуск</button>`;
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

function renderSettings(settings) {
  const mode = currentMode(settings);
  const checks = [
    ['shuffleQuestions', 'Случайный порядок вопросов'],
    ['shuffleOptions', 'Случайный порядок вариантов'],
    ['showCorrectAnswers', 'Показывать правильные ответы'],
    ['showScore', 'Показывать баллы'],
    ['allowNavigationBack', 'Возврат к предыдущим'],
    ['allowSkip', 'Разрешить пропуск'],
  ];

  const scale = Array.isArray(settings.gradingScale) && settings.gradingScale.length
    ? settings.gradingScale
    : defaultGradingScale();
  const maxScore = (state.content?.questions || []).reduce((sum, q) => {
    if (q.type === 'info') return sum;
    return sum + (Number(q.points) || 0);
  }, 0);
  const withPoints = pointsForScale(scale, maxScore);
  const modeHint = mode === 'training'
    ? 'После ответа показывается проверка: верно/неверно, правильный ответ и пояснение к вопросу.'
    : mode === 'exam'
      ? 'Без возврата назад и пропуска; правильные ответы во время прохождения скрыты.'
      : 'Настройки ниже задаются вручную.';

  return `
    <label class="field">Режим прохождения
      <select class="input" data-mode>
        <option value="normal" ${mode === 'normal' ? 'selected' : ''}>Обычный</option>
        <option value="training" ${mode === 'training' ? 'selected' : ''}>Тренировочный</option>
        <option value="exam" ${mode === 'exam' ? 'selected' : ''}>Экзаменационный</option>
      </select>
    </label>
    <p class="hint">${modeHint}</p>
    <label class="field">Время на тест (мин)
      <input class="input" type="number" min="0" step="1" data-setting="timeLimitSeconds" data-unit="minutes" value="${timeLimitMinutesValue(settings.timeLimitSeconds)}" placeholder="без лимита">
    </label>
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
    ${checks.map(([key, label]) => `
      <label class="check"><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}> ${label}</label>`).join('')}

    <h2>Критерии оценок</h2>
    <p class="hint">Минимальный процент для оценки. Баллы рассчитаны от суммы вопросов (${maxScore}).</p>
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
    <p class="hint">Выборка из группы при прохождении. Вопросы вне групп идут после.</p>
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
    markDirty();
    render();
  });

  root.querySelectorAll('[data-select]').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedIndex = Number(el.getAttribute('data-select'));
      render();
    });
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
  const quiz = await api.createQuiz(content);
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
        choose.hidden = true;
        progress.hidden = false;
        if (cancelBtn) cancelBtn.disabled = true;
        dialog.dataset.busy = '1';
        if (progressSub) {
          progressSub.textContent = `Сборка для ${labels[platform] || platform}…`;
        }
        try {
          await api.exportStandalone(state.quizId, state.content.title, platform);
          state.status = `Автономный тест (${platform}) скачан`;
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
  const line = root.querySelector('.page-lead') || root.querySelector('.muted');
  if (line) {
    line.textContent = `${state.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'} · ${state.status}`;
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

function navBackIcon() {
  return '<svg class="nav-back-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
