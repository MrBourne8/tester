import { createRng, seedFromString, shuffle } from './rng.js';

/**
 * Готовит попытку: группы, порядок вопросов/вариантов, воспроизводимый через seed.
 * @param {import('./schema.js').QuizDocument} quiz
 * @param {{ seed?: number|string }} [options]
 */
export function prepareAttempt(quiz, options = {}) {
  const seed =
    typeof options.seed === 'number'
      ? options.seed >>> 0
      : seedFromString(String(options.seed ?? `${quiz.id}:${Date.now()}`));

  const rng = createRng(seed);
  const settings = quiz.settings || {};
  const groups = Array.isArray(quiz.questionGroups) ? quiz.questionGroups : [];

  let questions;
  if (groups.length > 0) {
    questions = selectFromGroups(quiz.questions || [], groups, rng, settings.shuffleQuestions);
  } else {
    questions = (quiz.questions || []).slice();
    if (settings.shuffleQuestions) {
      questions = shuffle(questions, rng);
    }
  }

  const questionOrder = questions.map((q) => q.id);
  /** @type {Record<string, string[]|undefined>} */
  const optionOrder = {};

  const preparedQuestions = questions.map((question) => {
    const prepared = prepareQuestionOptions(question, settings, rng, optionOrder);
    if (prepared.type === 'image' && prepared.innerQuestion) {
      const inner = prepareQuestionOptions(prepared.innerQuestion, settings, rng, optionOrder);
      return { ...prepared, innerQuestion: inner };
    }
    return prepared;
  });

  return {
    seed,
    questionOrder,
    optionOrder,
    questions: preparedQuestions,
  };
}

/**
 * @param {object[]} allQuestions
 * @param {object[]} groups
 * @param {() => number} rng
 * @param {boolean} [shuffleUngrouped]
 */
function selectFromGroups(allQuestions, groups, rng, shuffleUngrouped = false) {
  const byId = new Map(allQuestions.map((q) => [q.id, q]));
  /** @type {Set<string>} */
  const inGroups = new Set();
  /** @type {object[]} */
  const selected = [];

  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const ids = Array.isArray(group.questionIds) ? group.questionIds : [];
    ids.forEach((id) => inGroups.add(id));
    let pool = ids.map((id) => byId.get(id)).filter(Boolean);
    if (group.shuffle !== false) {
      pool = shuffle(pool, rng);
    }
    let pick = pool.length;
    if (typeof group.pick === 'number' && Number.isFinite(group.pick) && group.pick >= 0) {
      pick = Math.floor(group.pick);
    }
    const chosen = pool.slice(0, Math.min(pick, pool.length));
    for (const q of chosen) {
      selected.push(q);
    }
  }

  // Вопросы, входящие в группы, но не выбранные pick — пропускаются.
  let rest = allQuestions.filter((q) => !inGroups.has(q.id));
  if (shuffleUngrouped) {
    rest = shuffle(rest, rng);
  }
  return selected.concat(rest);
}

/**
 * @param {object} question
 * @param {object} settings
 * @param {() => number} rng
 * @param {Record<string, string[]|undefined>} optionOrder
 */
function prepareQuestionOptions(question, settings, rng, optionOrder) {
  if (
    settings.shuffleOptions &&
    Array.isArray(question.options) &&
    (question.type === 'single_choice' ||
      question.type === 'multiple_choice' ||
      question.type === 'true_false')
  ) {
    const shuffled = shuffle(question.options, rng);
    optionOrder[question.id] = shuffled.map((o) => o.id);
    return { ...question, options: shuffled };
  }
  if (Array.isArray(question.options)) {
    optionOrder[question.id] = question.options.map((o) => o.id);
  }
  return question;
}
