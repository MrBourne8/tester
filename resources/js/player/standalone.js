import { createEngine, resolveEffectiveSettings, scoreQuestion } from '../core/quiz-engine/index.js';
import {
  correctAnswerSummary,
  questionExplanation,
  renderTrainingFeedback,
} from './feedback.js';
import { createFocusGuard, enterFullscreen, exitFullscreen } from './focus-guard.js';
import { bindOrderingControls, captureAnswer, escapeHtml, renderQuestion } from './render.js';
import { buildResultPayload, downloadResultFile } from './result.js';
import { renderResultScreen } from './result-view.js';

/**
 * Полноценный автономный плеер (без DOM-зависимостей движка).
 * @param {HTMLElement} root
 * @param {object} options
 * @param {object} options.quizDocument
 * @param {number|null} [options.quizVersionNumber]
 * @param {string|null} [options.contentHash]
 * @param {boolean} [options.requireName]
 */
export function mountStandalonePlayer(root, options) {
  const engine = createEngine();
  const quiz = engine.load(options.quizDocument);
  const settings = resolveEffectiveSettings(quiz.settings || {});
  const requireName = options.requireName ?? true;
  const isTraining = Boolean(settings.trainingMode);

  /** @type {'start'|'running'|'result'} */
  let screen = 'start';
  let studentName = '';
  let prepared = null;
  /** @type {Record<string, unknown>} */
  let answers = {};
  let index = 0;
  let startedAt = null;
  let timerId = null;
  let remainingSeconds = settings.timeLimitSeconds || null;
  let resultPayload = null;
  let statusMessage = '';
  /** @type {null|{ isCorrect: boolean, explanation: string, correctSummary: string, showCorrectAnswers: boolean }} */
  let trainFeedback = null;

  const focusGuard = createFocusGuard({
    isActive: () => screen === 'running',
    getQuestionId: () => prepared?.questions?.[index]?.id || null,
  });

  function clearTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    clearTimer();
    if (!remainingSeconds || remainingSeconds <= 0) return;
    timerId = setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        remainingSeconds = 0;
        clearTimer();
        finishAttempt(true);
        return;
      }
      const timerEl = root.querySelector('[data-timer]');
      if (timerEl) timerEl.textContent = formatTime(remainingSeconds);
    }, 1000);
  }

  function render() {
    if (screen === 'start') {
      root.innerHTML = `
        <section class="player-shell">
          <p class="brand">UniTest</p>
          <h1>${escapeHtml(quiz.title)}</h1>
          <p class="lead">${escapeHtml(quiz.description || 'Автономное прохождение теста')}</p>
          ${requireName ? `
            <label class="field">Ваше имя
              <input class="input" data-field="name" value="${escapeHtml(studentName)}" placeholder="ФИО или идентификатор">
            </label>` : ''}
          <p class="meta">
            Вопросов: <strong>${quiz.questions.length}</strong>
            ${isTraining ? ' · <strong>Тренировка</strong>' : settings.examMode ? ' · <strong>Экзамен</strong>' : ''}
            ${settings.timeLimitSeconds ? ` · Время: <strong>${formatTime(settings.timeLimitSeconds)}</strong>` : ''}
            ${settings.passThresholdPercent != null ? ` · Порог: <strong>${settings.passThresholdPercent}%</strong>` : ''}
          </p>
          <button type="button" class="btn btn-primary" data-action="start">Начать на весь экран</button>
          <p class="hint">Окно будет развёрнуто на весь экран. Переключение на другие программы фиксируется.</p>
          ${statusMessage ? `<p class="error">${escapeHtml(statusMessage)}</p>` : ''}
        </section>`;
      root.querySelector('[data-action="start"]')?.addEventListener('click', async () => {
        const name = root.querySelector('[data-field="name"]')?.value?.trim() || '';
        if (requireName && !name) {
          statusMessage = 'Укажите имя перед началом';
          render();
          return;
        }
        studentName = name;
        statusMessage = '';
        const seed = `${quiz.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        prepared = engine.prepare(quiz, { seed });
        answers = {};
        index = 0;
        startedAt = new Date().toISOString();
        remainingSeconds = settings.timeLimitSeconds || null;
        screen = 'running';
        focusGuard.start();
        await enterFullscreen();
        render();
        startTimer();
      });
      return;
    }

    if (screen === 'result') {
      focusGuard.stop();
      root.innerHTML = renderResultScreen(resultPayload, settings, statusMessage);
      root.querySelector('[data-action="download"]')?.addEventListener('click', () => {
        downloadResultFile(resultPayload, `${resultPayload.attemptId}.result`);
      });
      root.querySelector('[data-action="again"]')?.addEventListener('click', async () => {
        resultPayload = null;
        statusMessage = '';
        screen = 'start';
        await exitFullscreen();
        render();
      });
      return;
    }

    const questions = prepared.questions;
    const question = questions[index];
    const total = questions.length;
    const allowBack = settings.allowNavigationBack !== false && !trainFeedback;
    const allowSkip = settings.allowSkip !== false && !trainFeedback;
    const locked = Boolean(trainFeedback);

    root.innerHTML = `
      <section class="player-shell running">
        <header class="player-top">
          <div>
            <p class="brand">UniTest</p>
            <h1>${escapeHtml(quiz.title)}</h1>
          </div>
          <div class="player-meta">
            <span>Вопрос ${index + 1} / ${total}</span>
            ${isTraining ? '<span class="mode-pill">Тренировка</span>' : settings.examMode ? '<span class="mode-pill is-exam">Экзамен</span>' : ''}
            ${remainingSeconds != null ? `<span data-timer>${formatTime(remainingSeconds)}</span>` : ''}
          </div>
        </header>
        <div class="progress"><div class="progress-bar" style="width:${total ? ((index + 1) / total) * 100 : 0}%"></div></div>
        <div class="player-card ${locked ? 'is-locked' : ''}" data-q>
          ${question ? renderQuestion(question, answers[question.id], quiz) : '<p>Нет вопросов</p>'}
        </div>
        ${renderTrainingFeedback(trainFeedback)}
        <div class="player-nav">
          <button type="button" class="btn btn-ghost" data-action="prev" ${!allowBack || index === 0 ? 'disabled' : ''}>Назад</button>
          <div class="player-nav-right">
            ${allowSkip && index < total - 1 ? '<button type="button" class="btn btn-ghost" data-action="skip">Пропустить</button>' : ''}
            ${trainFeedback
              ? ''
              : (index < total - 1
                ? `<button type="button" class="btn btn-primary" data-action="next">${isTraining ? 'Проверить' : 'Далее'}</button>`
                : `<button type="button" class="btn btn-primary" data-action="finish">${isTraining ? 'Проверить и завершить' : 'Завершить'}</button>`)}
          </div>
        </div>
      </section>`;

    const card = root.querySelector('[data-q]');
    if (!locked) {
      bindOrderingControls(card, () => {});
    } else {
      card?.querySelectorAll('input, textarea, button, select').forEach((el) => {
        el.setAttribute('disabled', 'disabled');
      });
    }

    root.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
      if (trainFeedback) return;
      saveCurrent();
      trainFeedback = null;
      index = Math.max(0, index - 1);
      render();
    });
    root.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      saveCurrent();
      if (isTraining && question && question.type !== 'info') {
        const scored = scoreQuestion(question, answers[question.id]);
        if (scored.isCorrect === false) {
          trainFeedback = {
            isCorrect: false,
            explanation: questionExplanation(question),
            correctSummary: correctAnswerSummary(question),
            showCorrectAnswers: settings.showCorrectAnswers !== false,
          };
          render();
          return;
        }
        if (scored.isCorrect === true) {
          trainFeedback = {
            isCorrect: true,
            explanation: '',
            correctSummary: '',
            showCorrectAnswers: false,
          };
          render();
          return;
        }
      }
      trainFeedback = null;
      index = Math.min(total - 1, index + 1);
      render();
    });
    root.querySelector('[data-action="train-continue"]')?.addEventListener('click', () => {
      const wasLast = index >= total - 1;
      trainFeedback = null;
      if (wasLast) {
        finishAttempt(false);
        return;
      }
      index = Math.min(total - 1, index + 1);
      render();
    });
    root.querySelector('[data-action="skip"]')?.addEventListener('click', () => {
      if (trainFeedback) return;
      saveCurrent();
      trainFeedback = null;
      index = Math.min(total - 1, index + 1);
      render();
    });
    root.querySelector('[data-action="finish"]')?.addEventListener('click', () => {
      saveCurrent();
      if (isTraining && question && question.type !== 'info') {
        const scored = scoreQuestion(question, answers[question.id]);
        if (scored.isCorrect === false || scored.isCorrect === true) {
          trainFeedback = {
            isCorrect: scored.isCorrect === true,
            explanation: scored.isCorrect ? '' : questionExplanation(question),
            correctSummary: scored.isCorrect ? '' : correctAnswerSummary(question),
            showCorrectAnswers: settings.showCorrectAnswers !== false,
          };
          render();
          return;
        }
      }
      if (!confirm('Завершить тест и сохранить результат?')) return;
      finishAttempt(false);
    });
  }

  function saveCurrent() {
    const question = prepared?.questions[index];
    if (!question) return;
    answers[question.id] = captureAnswer(root.querySelector('[data-q]') || root, question);
  }

  async function finishAttempt(auto) {
    saveCurrent();
    clearTimer();
    focusGuard.stop();
    const submittedAt = new Date().toISOString();
    const durationSeconds = startedAt
      ? Math.max(0, Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000))
      : 0;
    const graded = engine.grade(prepared.questions, answers, settings);
    resultPayload = await buildResultPayload({
      quizId: quiz.id,
      quizTitle: quiz.title,
      quizVersionNumber: options.quizVersionNumber ?? null,
      contentHash: options.contentHash ?? null,
      studentName: studentName || null,
      startedAt,
      submittedAt,
      durationSeconds,
      seed: prepared.seed,
      questionOrder: prepared.questionOrder,
      optionOrder: prepared.optionOrder,
      answers,
      score: graded.score,
      maxScore: graded.maxScore,
      percentage: graded.percentage,
      passed: graded.passed,
      passThresholdPercent: graded.passThresholdPercent,
      grade: graded.grade,
      stats: graded.stats,
      perQuestion: graded.perQuestion,
      focusEvents: focusGuard.getByQuestion(),
    });

    try {
      localStorage.setItem(`unitest:result:${resultPayload.attemptId}`, JSON.stringify(resultPayload));
    } catch {
      // ignore quota
    }

    statusMessage = auto ? 'Время истекло — попытка завершена автоматически' : '';
    screen = 'result';
    await exitFullscreen();
    render();
  }

  render();

  return {
    destroy() {
      clearTimer();
      focusGuard.stop();
    },
  };
}

function formatTime(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
