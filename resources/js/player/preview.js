import { createEngine } from '../core/quiz-engine/index.js';
import { resolveResourceSrc } from '../core/quiz-engine/resources.js';
import { captureAnswer as captureFromRender, renderQuestion as renderPlayerQuestion } from './render.js';

/**
 * Простой предпросмотр прохождения без сети.
 * @param {HTMLElement} root
 * @param {object} quizDocument
 */
export function mountPreview(root, quizDocument) {
  const engine = createEngine();
  let quiz;
  try {
    quiz = engine.load(quizDocument);
  } catch (error) {
    root.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    return;
  }

  const prepared = engine.prepare(quiz, { seed: 1 });
  /** @type {Record<string, unknown>} */
  const answers = {};
  let index = 0;
  let finished = false;

  function render() {
    if (finished) {
      const result = engine.grade(prepared.questions, answers, quiz.settings || {});
      root.innerHTML = `
        <div class="preview-result">
          <h3>Результат предпросмотра</h3>
          <p>Баллы: <strong>${result.score}</strong> / ${result.maxScore} (${result.percentage}%)</p>
          <p>${result.passed ? 'Порог пройден' : 'Порог не пройден'}</p>
          <button type="button" data-action="restart" class="btn">Пройти снова</button>
        </div>`;
      root.querySelector('[data-action="restart"]')?.addEventListener('click', () => {
        finished = false;
        index = 0;
        Object.keys(answers).forEach((k) => delete answers[k]);
        render();
      });
      return;
    }

    const question = prepared.questions[index];
    const total = prepared.questions.length;
    root.innerHTML = `
      <div class="preview-player">
        <div class="preview-progress">Вопрос ${index + 1} из ${total || 0}</div>
        ${question ? renderQuestion(question, answers[question.id], quiz) : '<p>Нет вопросов</p>'}
        <div class="preview-nav">
          <button type="button" class="btn btn-ghost" data-action="prev" ${index === 0 ? 'disabled' : ''}>Назад</button>
          ${index < total - 1
            ? '<button type="button" class="btn" data-action="next">Далее</button>'
            : '<button type="button" class="btn btn-primary" data-action="finish">Завершить</button>'}
        </div>
      </div>`;

    root.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
      capture(root, question, answers);
      index = Math.max(0, index - 1);
      render();
    });
    root.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      capture(root, question, answers);
      index = Math.min(total - 1, index + 1);
      render();
    });
    root.querySelector('[data-action="finish"]')?.addEventListener('click', () => {
      capture(root, question, answers);
      finished = true;
      render();
    });
  }

  render();
}

/**
 * @param {object} question
 * @param {unknown} answer
 * @param {object|null} [quiz]
 */
export function renderQuestion(question, answer, quiz = null) {
  // Единый рендер с плеером (включая image + media).
  return renderPlayerQuestion(question, answer, quiz).replaceAll('player-prompt', 'preview-prompt')
    .replaceAll('player-options', 'preview-options')
    .replaceAll('player-order', 'preview-order')
    .replaceAll('player-media', 'preview-media');
}

export function capture(root, question, answers) {
  if (!question) return;
  const value = captureFromRender(root, question);
  if (value != null) {
    answers[question.id] = value;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// keep resolve available for callers that might need media helpers
export { resolveResourceSrc };
