import { SCORING_VERSION } from './schema.js';

/**
 * @param {string} value
 * @param {{ caseSensitive?: boolean, trim?: boolean, collapseWhitespace?: boolean }} [mode]
 */
export function normalizeText(value, mode = {}) {
  let out = String(value ?? '');
  if (mode.trim !== false) {
    out = out.trim();
  }
  if (mode.collapseWhitespace !== false) {
    out = out.replace(/\s+/g, ' ');
  }
  if (!mode.caseSensitive) {
    out = out.toLowerCase();
  }
  return out;
}

/**
 * Оценивает один вопрос.
 * @param {object} question
 * @param {unknown} answer
 * @returns {{ awarded: number, max: number, isCorrect: boolean|null, detail?: object }}
 */
export function scoreQuestion(question, answer) {
  const max = typeof question.points === 'number' ? question.points : 1;

  switch (question.type) {
    case 'info':
      return { awarded: 0, max: 0, isCorrect: null };

    case 'single_choice':
    case 'true_false': {
      const correct = (question.options || []).find((o) => o.correct);
      const selected = answer && typeof answer === 'object' ? answer.optionId : answer;
      const ok = correct && selected === correct.id;
      return { awarded: ok ? max : 0, max, isCorrect: Boolean(ok) };
    }

    case 'multiple_choice': {
      const options = question.options || [];
      const correctIds = new Set(options.filter((o) => o.correct).map((o) => o.id));
      const selected = new Set(
        Array.isArray(answer?.optionIds) ? answer.optionIds : Array.isArray(answer) ? answer : [],
      );
      const mode = question.scoringMode === 'partial' ? 'partial' : 'all_or_nothing';

      if (mode === 'all_or_nothing') {
        const ok =
          selected.size === correctIds.size && [...correctIds].every((id) => selected.has(id));
        return { awarded: ok ? max : 0, max, isCorrect: ok };
      }

      // Частичный балл: +за верный, −за лишний, не ниже 0.
      let hits = 0;
      let misses = 0;
      for (const id of selected) {
        if (correctIds.has(id)) hits += 1;
        else misses += 1;
      }
      const ratio = correctIds.size === 0 ? 0 : Math.max(0, hits - misses) / correctIds.size;
      const awarded = Math.round(ratio * max * 100) / 100;
      return {
        awarded,
        max,
        isCorrect: awarded === max && misses === 0,
        detail: { hits, misses, mode },
      };
    }

    case 'text': {
      const raw = typeof answer === 'string' ? answer : answer?.text ?? '';
      const mode = {
        caseSensitive: Boolean(question.caseSensitive),
        trim: question.trim !== false,
        collapseWhitespace: question.collapseWhitespace !== false,
      };
      const normalized = normalizeText(raw, mode);
      const accepted = (question.acceptedAnswers || []).map((a) => normalizeText(a, mode));
      const ok = accepted.includes(normalized);
      return { awarded: ok ? max : 0, max, isCorrect: ok };
    }

    case 'numeric': {
      const value = typeof answer === 'number' ? answer : Number(answer?.value);
      if (Number.isNaN(value)) {
        return { awarded: 0, max, isCorrect: false };
      }
      const tolerance = typeof question.tolerance === 'number' ? question.tolerance : 0;
      const ok = Math.abs(value - question.correctValue) <= tolerance;
      return { awarded: ok ? max : 0, max, isCorrect: ok };
    }

    case 'matching': {
      const pairs = question.pairs || [];
      const map = answer && typeof answer === 'object' ? answer.matches || answer : {};
      let correctCount = 0;
      for (const pair of pairs) {
        if (map[pair.leftId] === pair.rightId) correctCount += 1;
      }
      const ratio = pairs.length === 0 ? 0 : correctCount / pairs.length;
      const awarded = Math.round(ratio * max * 100) / 100;
      return {
        awarded,
        max,
        isCorrect: correctCount === pairs.length,
        detail: { correctCount, total: pairs.length },
      };
    }

    case 'ordering': {
      const expected = (question.items || []).map((item) => item.id);
      const actual = Array.isArray(answer?.order) ? answer.order : Array.isArray(answer) ? answer : [];
      const ok =
        expected.length === actual.length && expected.every((id, i) => id === actual[i]);
      return { awarded: ok ? max : 0, max, isCorrect: ok };
    }

    case 'fill_blanks': {
      const blanks = question.blanks || [];
      const values = answer && typeof answer === 'object' ? answer.blanks || answer : {};
      const mode = {
        caseSensitive: Boolean(question.caseSensitive),
        trim: true,
        collapseWhitespace: true,
      };
      let correctCount = 0;
      for (const blank of blanks) {
        const given = normalizeText(values[blank.id] ?? '', mode);
        const accepted = (blank.acceptedAnswers || []).map((a) => normalizeText(a, mode));
        if (accepted.includes(given)) correctCount += 1;
      }
      const ratio = blanks.length === 0 ? 0 : correctCount / blanks.length;
      const awarded = Math.round(ratio * max * 100) / 100;
      return {
        awarded,
        max,
        isCorrect: correctCount === blanks.length,
        detail: { correctCount, total: blanks.length },
      };
    }

    case 'image': {
      // Носитель: оценивается вложенный вопрос, если задан.
      if (question.innerQuestion) {
        return scoreQuestion(question.innerQuestion, answer);
      }
      return { awarded: 0, max: 0, isCorrect: null };
    }

    default:
      return { awarded: 0, max, isCorrect: false, detail: { reason: 'unknown_type' } };
  }
}

/**
 * @param {object[]} questions
 * @param {Record<string, unknown>} answers map questionId -> answer
 */
export function scoreAttempt(questions, answers) {
  /** @type {object[]} */
  const perQuestion = [];
  let score = 0;
  let maxScore = 0;

  for (const question of questions) {
    const result = scoreQuestion(question, answers[question.id]);
    score += result.awarded;
    maxScore += result.max;
    perQuestion.push({
      questionId: question.id,
      type: question.type,
      awarded: result.awarded,
      max: result.max,
      isCorrect: result.isCorrect,
      detail: result.detail ?? null,
    });
  }

  score = Math.round(score * 100) / 100;
  maxScore = Math.round(maxScore * 100) / 100;
  const percentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 10000) / 100;

  return {
    scoringVersion: SCORING_VERSION,
    score,
    maxScore,
    percentage,
    perQuestion,
  };
}
