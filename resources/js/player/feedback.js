import { escapeHtml } from './render.js';

/**
 * Текст правильного ответа для подсказки в тренировке.
 * @param {object} question
 */
export function correctAnswerSummary(question) {
  if (!question) return '';
  if (question.type === 'image' && question.innerQuestion) {
    return correctAnswerSummary(question.innerQuestion);
  }
  switch (question.type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false':
      return (question.options || []).filter((o) => o.correct).map((o) => o.text || '').join('; ');
    case 'text':
      return (question.acceptedAnswers || []).filter(Boolean).join('; ');
    case 'numeric': {
      const tol = question.tolerance != null && Number(question.tolerance) !== 0
        ? ` (±${question.tolerance})`
        : '';
      return `${question.correctValue ?? ''}${tol}`;
    }
    case 'matching':
      return (question.pairs || [])
        .map((p) => `${p.leftText || p.left || ''} → ${p.rightText || p.right || ''}`)
        .join('; ');
    case 'ordering':
      return (question.items || []).map((it, i) => `${i + 1}) ${it.text || ''}`).join('; ');
    case 'fill_blanks':
      return (question.blanks || [])
        .map((b, i) => `{${i + 1}} ${(b.acceptedAnswers || []).join('/')}`)
        .join('; ');
    default:
      return '';
  }
}

/**
 * @param {object} question
 * @returns {string}
 */
export function questionExplanation(question) {
  if (!question) return '';
  const own = String(question.explanation || '').trim();
  if (own) return own;
  if (question.type === 'image' && question.innerQuestion) {
    return String(question.innerQuestion.explanation || '').trim();
  }
  return '';
}

/**
 * HTML-блок обратной связи после проверки в тренировке.
 * @param {{ isCorrect: boolean, explanation?: string, correctSummary?: string, showCorrectAnswers?: boolean }} feedback
 */
export function renderTrainingFeedback(feedback) {
  if (!feedback) return '';
  const ok = feedback.isCorrect;
  const explanation = String(feedback.explanation || '').trim();
  const correct = String(feedback.correctSummary || '').trim();
  const showCorrect = feedback.showCorrectAnswers !== false && correct;

  return `
    <aside class="train-feedback ${ok ? 'is-ok' : 'is-bad'}" data-train-feedback>
      <p class="train-feedback-title">${ok ? 'Верно' : 'Неверно'}</p>
      ${!ok && showCorrect ? `<p class="train-feedback-correct">Правильный ответ: <strong>${escapeHtml(correct)}</strong></p>` : ''}
      ${!ok && explanation ? `<p class="train-feedback-explain">${escapeHtml(explanation)}</p>` : ''}
      ${!ok && !explanation && !showCorrect ? '<p class="train-feedback-explain">Попробуйте ещё раз или перейдите дальше.</p>' : ''}
      <button type="button" class="btn btn-primary" data-action="train-continue">Продолжить</button>
    </aside>`;
}
