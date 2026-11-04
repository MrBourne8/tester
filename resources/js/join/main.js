import '../../css/session.css';
import { resolveEffectiveSettings, scoreQuestion } from '../core/quiz-engine/index.js';
import {
  correctAnswerSummary,
  questionExplanation,
  renderTrainingFeedback,
} from '../player/feedback.js';
import { createFocusGuard, enterFullscreen, exitFullscreen } from '../player/focus-guard.js';
import { capture, escapeHtml, renderQuestion } from '../player/preview.js';
import { renderNetworkResultScreen } from '../player/result-view.js';

const TOKEN_KEY = 'unitest_participant_token';
const root = document.getElementById('join-app');
if (!root) throw new Error('Контейнер join не найден');

const initialCode = (root.dataset.code || '').toUpperCase();
const publishSlug = (root.dataset.slug || '').trim();
const isPublished = Boolean(publishSlug);

/** @type {string|null} */
let token = localStorage.getItem(TOKEN_KEY);
/** @type {any} */
let sessionView = null;
/** @type {any} */
let attempt = null;
/** @type {Record<string, unknown>} */
let answers = {};
let questionIndex = 0;
let pollTimer = null;
let saveTimer = null;
let phase = token ? 'sync' : 'login';

boot().catch((e) => {
  root.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
});

async function boot() {
  if (token) {
    try {
      await sync();
      startPolling();
      return;
    } catch {
      token = null;
      localStorage.removeItem(TOKEN_KEY);
      phase = 'login';
    }
  }
  renderLogin();
}

function renderLogin() {
  phase = 'login';
  const fromQr = Boolean(initialCode);
  if (isPublished) {
    root.innerHTML = `
      <div class="join-wrap">
        <section class="panel">
          <p class="brand">Тестория</p>
          <h1 class="app-title" style="font-size:1.45rem" data-el="pub-title">Прохождение теста</h1>
          <p class="muted">Укажите имя, чтобы начать тест по опубликованной ссылке.</p>
          <label class="field">Ваше имя
            <input class="input" data-field="name" maxlength="80" placeholder="Иван Иванов" autofocus>
          </label>
          <button type="button" class="btn btn-primary" data-action="join">Начать</button>
          <p class="error" data-error hidden></p>
        </section>
      </div>`;
    loadPublishTitle();
  } else {
    root.innerHTML = `
      <div class="join-wrap">
        <section class="panel">
          <p class="brand">Тестория</p>
          <h1 class="app-title" style="font-size:1.45rem">Подключение к занятию</h1>
          <p class="muted">${fromQr
            ? 'Код занятия уже подставлен из QR. Укажите имя и войдите.'
            : 'Введите код преподавателя или отсканируйте QR.'}</p>
          <label class="field">Код занятия
            <input class="input" data-field="code" value="${escapeHtml(initialCode)}" autocomplete="off" style="text-transform:uppercase;letter-spacing:0.12em;font-weight:700" ${fromQr ? 'readonly' : ''}>
          </label>
          <label class="field">Ваше имя
            <input class="input" data-field="name" maxlength="80" placeholder="Иван Иванов" autofocus>
          </label>
          <button type="button" class="btn btn-primary" data-action="join">Войти</button>
          <p class="error" data-error hidden></p>
        </section>
      </div>`;
  }

  root.querySelector('[data-action="join"]')?.addEventListener('click', onJoin);
  root.querySelector('[data-field="name"]')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onJoin();
  });
  if (fromQr || isPublished) {
    root.querySelector('[data-field="name"]')?.focus();
  }
}

async function loadPublishTitle() {
  try {
    const data = await api(`/api/v1/p/${encodeURIComponent(publishSlug)}`);
    const titleEl = root.querySelector('[data-el="pub-title"]');
    if (titleEl && data.title) titleEl.textContent = data.title;
  } catch (e) {
    const err = root.querySelector('[data-error]');
    if (err) {
      err.textContent = e.message;
      err.hidden = false;
    }
    root.querySelector('[data-action="join"]')?.setAttribute('disabled', 'disabled');
  }
}

async function onJoin() {
  const err = root.querySelector('[data-error]');
  err.hidden = true;
  try {
    const name = root.querySelector('[data-field="name"]')?.value || '';
    const data = isPublished
      ? await api(`/api/v1/p/${encodeURIComponent(publishSlug)}/join`, {
          method: 'POST',
          body: JSON.stringify({ display_name: name }),
        })
      : await api('/api/v1/join', {
          method: 'POST',
          body: JSON.stringify({
            code: root.querySelector('[data-field="code"]')?.value || '',
            display_name: name,
          }),
        });
    token = data.participantToken;
    localStorage.setItem(TOKEN_KEY, token);
    sessionView = { session: data.session, participant: data.participant, quiz: null, attempt: null };
    startPolling();
    await sync();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

async function sync() {
  sessionView = await api('/api/v1/participant/session', { headers: authHeaders() });
  attempt = sessionView.attempt;
  if (attempt?.status === 'submitted') {
    phase = 'done';
    renderDone(null);
    return;
  }
  if (sessionView.session.status === 'running' && sessionView.quiz) {
    if (!attempt || attempt.status !== 'in_progress') {
      attempt = await api('/api/v1/attempts/start', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ client: clientInfo() }),
      });
      questionTiming = {};
      markQuestionEnter(null);
    } else {
      const saved = await api(`/api/v1/attempts/${attempt.id}/answers`, { headers: authHeaders() });
      answers = saved.answers || {};
    }
    phase = 'take';
    await ensureFocusTracking();
    renderTake();
    return;
  }
  phase = 'lobby';
  renderLobby();
}

function renderLobby() {
  const s = sessionView?.session;
  root.innerHTML = `
    <div class="join-wrap">
      <section class="panel">
        <p class="brand">Тестория</p>
        <h1 class="app-title" style="font-size:1.35rem">${escapeHtml(s?.quiz_title || 'Ожидание')}</h1>
        <p>Вы: <strong>${escapeHtml(sessionView?.participant?.display_name || '')}</strong></p>
        <p class="muted">Статус сессии: <span class="status-pill">${escapeHtml(statusLabel(s?.status))}</span></p>
        <p class="muted">${s?.status === 'open' ? 'Дождитесь старта от преподавателя…' : 'Ожидание…'}</p>
        <button type="button" class="btn btn-ghost" data-action="leave">Выйти</button>
      </section>
    </div>`;
  root.querySelector('[data-action="leave"]')?.addEventListener('click', leave);
}

/** @type {null|{ isCorrect: boolean, explanation: string, correctSummary: string, showCorrectAnswers: boolean }} */
let trainFeedback = null;
let focusStarted = false;
/** @type {Record<string, { dwellMs: number }>} */
let questionTiming = {};
let questionEnteredAt = Date.now();
let activeQuestionId = null;

function clientInfo() {
  return {
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    language: navigator.language || '',
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
  };
}

function markQuestionEnter(qid) {
  activeQuestionId = qid || null;
  questionEnteredAt = Date.now();
}

function markQuestionLeave(qid = activeQuestionId) {
  if (!qid) return;
  const spent = Math.max(0, Date.now() - questionEnteredAt);
  const prev = Number(questionTiming[qid]?.dwellMs || 0);
  questionTiming[qid] = { dwellMs: prev + spent };
  questionEnteredAt = Date.now();
}

const focusGuard = createFocusGuard({
  isActive: () => phase === 'take',
  getQuestionId: () => {
    const quiz = sessionView?.quiz;
    const order = attempt?.meta?.questionOrder;
    const questions = order?.length
      ? order.map((id) => quiz?.questions?.find((q) => q.id === id)).filter(Boolean)
      : quiz?.questions || [];
    return questions[questionIndex]?.id || null;
  },
  onEvent: () => {
    persistAnswers().catch(() => {});
  },
});

async function ensureFocusTracking() {
  if (focusStarted) return;
  focusStarted = true;
  focusGuard.suppress(2000);
  focusGuard.start();
  await enterFullscreen();
  focusGuard.suppress(1500);
}

async function stopFocusTracking() {
  focusGuard.stop();
  focusStarted = false;
  await exitFullscreen();
}

function renderTake() {
  const quiz = sessionView.quiz;
  const settings = resolveEffectiveSettings(quiz.settings || {});
  const isTraining = Boolean(settings.trainingMode);
  const order = attempt?.meta?.questionOrder;
  const questions = order?.length
    ? order.map((id) => quiz.questions.find((q) => q.id === id)).filter(Boolean)
    : quiz.questions || [];
  const total = questions.length;
  const question = questions[questionIndex];
  const allowBack = settings.allowNavigationBack !== false && !trainFeedback;
  const locked = Boolean(trainFeedback);

  root.innerHTML = `
    <div class="join-wrap" style="width:min(720px, calc(100% - 2rem))">
      <section class="panel">
        <div class="top" style="margin-bottom:0.5rem">
          <div>
            <p class="brand">Тестория</p>
            <h1 class="app-title" style="font-size:1.25rem">${escapeHtml(quiz.title || 'Тест')}</h1>
            <p class="preview-progress">Вопрос ${questionIndex + 1} из ${total || 0}${isTraining ? ' · Тренировка' : settings.examMode ? ' · Экзамен' : ''}</p>
          </div>
        </div>
        <div class="${locked ? 'is-locked' : ''}" data-q>
          ${question ? renderQuestion(applyOptionOrder(question, attempt?.meta?.optionOrder), answers[question.id], quiz) : '<p>Нет вопросов</p>'}
        </div>
        ${renderTrainingFeedback(trainFeedback)}
        <div class="preview-nav">
          <button type="button" class="btn btn-ghost" data-action="prev" ${!allowBack || questionIndex === 0 ? 'disabled' : ''}>Назад</button>
          ${trainFeedback
            ? ''
            : (questionIndex < total - 1
              ? `<button type="button" class="btn btn-soft" data-action="next">${isTraining ? 'Проверить' : 'Далее'}</button>`
              : `<button type="button" class="btn btn-primary" data-action="submit">${isTraining ? 'Проверить и сдать' : 'Сдать тест'}</button>`)}
        </div>
        <p class="muted" data-save-status style="margin-top:0.75rem"></p>
      </section>
    </div>`;

  const q = question;
  if (locked) {
    root.querySelectorAll('[data-q] input, [data-q] textarea, [data-q] button, [data-q] select').forEach((el) => {
      el.setAttribute('disabled', 'disabled');
    });
  }

  const captureRoot = root.querySelector('[data-q]') || root;
  if (q?.id && q.id !== activeQuestionId) {
    markQuestionLeave(activeQuestionId);
    markQuestionEnter(q.id);
  } else if (q?.id && !activeQuestionId) {
    markQuestionEnter(q.id);
  }

  root.querySelector('[data-action="prev"]')?.addEventListener('click', async () => {
    if (trainFeedback) return;
    capture(captureRoot, q, answers);
    markQuestionLeave(q?.id);
    trainFeedback = null;
    questionIndex = Math.max(0, questionIndex - 1);
    await persistAnswers();
    renderTake();
  });
  root.querySelector('[data-action="next"]')?.addEventListener('click', async () => {
    capture(captureRoot, q, answers);
    markQuestionLeave(q?.id);
    if (isTraining && q && q.type !== 'info') {
      const scored = scoreQuestion(q, answers[q.id]);
      if (scored.isCorrect === false || scored.isCorrect === true) {
        trainFeedback = {
          isCorrect: scored.isCorrect === true,
          explanation: scored.isCorrect ? '' : questionExplanation(q),
          correctSummary: scored.isCorrect ? '' : correctAnswerSummary(q),
          showCorrectAnswers: settings.showCorrectAnswers !== false,
        };
        await persistAnswers();
        renderTake();
        return;
      }
    }
    trainFeedback = null;
    questionIndex = Math.min(total - 1, questionIndex + 1);
    await persistAnswers();
    renderTake();
  });
  root.querySelector('[data-action="train-continue"]')?.addEventListener('click', async () => {
    const wasLast = questionIndex >= total - 1;
    trainFeedback = null;
    if (wasLast) {
      await submitAttempt();
      return;
    }
    questionIndex = Math.min(total - 1, questionIndex + 1);
    await persistAnswers();
    renderTake();
  });
  root.querySelector('[data-action="submit"]')?.addEventListener('click', async () => {
    capture(captureRoot, q, answers);
    if (isTraining && q && q.type !== 'info') {
      const scored = scoreQuestion(q, answers[q.id]);
      if (scored.isCorrect === false || scored.isCorrect === true) {
        trainFeedback = {
          isCorrect: scored.isCorrect === true,
          explanation: scored.isCorrect ? '' : questionExplanation(q),
          correctSummary: scored.isCorrect ? '' : correctAnswerSummary(q),
          showCorrectAnswers: settings.showCorrectAnswers !== false,
        };
        await persistAnswers();
        renderTake();
        return;
      }
    }
    await submitAttempt();
  });

  scheduleAutosave();
}

async function submitAttempt() {
  focusGuard.suppress(3000);
  if (!confirm('Отправить ответы? Изменить их будет нельзя.')) {
    renderTake();
    return;
  }
  try {
    markQuestionLeave(activeQuestionId);
    await persistAnswers();
    const result = await api(`/api/v1/attempts/${attempt.id}/submit`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ answers }),
    });
    phase = 'done';
    trainFeedback = null;
    activeQuestionId = null;
    await stopFocusTracking();
    renderDone(result.attempt);
    stopPolling();
  } catch (e) {
    alert(e.message);
  }
}

function renderDone(attemptResult) {
  root.innerHTML = renderNetworkResultScreen(attemptResult, { leaveLabel: 'Выйти' });
  root.querySelector('[data-action="leave"]')?.addEventListener('click', leave);
}

function applyOptionOrder(question, optionOrder) {
  if (!optionOrder || !question?.options || !optionOrder[question.id]) return question;
  const map = new Map(question.options.map((o) => [o.id, o]));
  const ordered = optionOrder[question.id].map((id) => map.get(id)).filter(Boolean);
  const rest = question.options.filter((o) => !optionOrder[question.id].includes(o.id));
  return { ...question, options: [...ordered, ...rest] };
}

function scheduleAutosave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistAnswers().catch(() => {});
  }, 1200);
}

async function persistAnswers() {
  if (!attempt?.id || !token) return;
  const status = root.querySelector('[data-save-status]');
  try {
    markQuestionLeave(activeQuestionId);
    markQuestionEnter(activeQuestionId);
    await api(`/api/v1/attempts/${attempt.id}/answers`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        answers,
        focusEvents: focusGuard.getByQuestion(),
        questionTiming,
      }),
    });
    if (status) status.textContent = 'Ответы сохранены на сервере';
  } catch (e) {
    if (status) status.textContent = e.message || 'Не удалось сохранить';
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (phase === 'done' || phase === 'login') return;
    try {
      const prevStatus = sessionView?.session?.status;
      sessionView = await api('/api/v1/participant/session', { headers: authHeaders() });
      const next = sessionView.session.status;
      if (phase === 'lobby' && next === 'running' && sessionView.quiz) {
        await sync();
      } else if (phase === 'take' && next === 'paused') {
        const status = root.querySelector('[data-save-status]');
        if (status) status.textContent = 'Сессия на паузе';
      } else if (phase === 'lobby' && prevStatus !== next) {
        renderLobby();
      }
    } catch {
      // keep UI; next poll retries
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function leave() {
  stopPolling();
  stopFocusTracking().catch(() => {});
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  attempt = null;
  answers = {};
  questionIndex = 0;
  renderLogin();
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'X-Participant-Token': token,
  };
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Ошибка ${response.status}`);
  }
  return payload.data;
}

function statusLabel(status) {
  return ({
    draft: 'Черновик',
    open: 'Открыта',
    running: 'Идёт',
    paused: 'Пауза',
    finished: 'Завершена',
    closed: 'Закрыта',
  })[status] || status || '—';
}
