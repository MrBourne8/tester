import { QUESTION_TYPES, SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS, defaultSettings } from './schema.js';

export class QuizValidationError extends Error {
  /**
   * @param {string} message
   * @param {string[]} [details]
   */
  constructor(message, details = []) {
    super(message);
    this.name = 'QuizValidationError';
    this.details = details;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Нормализует и проверяет документ теста (quiz.json / content_json).
 * @param {unknown} input
 * @returns {import('./schema.js').QuizDocument}
 */
export function validateQuizDocument(input) {
  const details = [];

  if (!isObject(input)) {
    throw new QuizValidationError('Документ теста должен быть объектом JSON');
  }

  const schemaVersion = String(input.schemaVersion ?? SCHEMA_VERSION);
  if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw new QuizValidationError(
      `Неподдерживаемая schemaVersion: ${schemaVersion}`,
      [`Поддерживаются: ${[...SUPPORTED_SCHEMA_VERSIONS].join(', ')}`],
    );
  }

  if (typeof input.id !== 'string' || input.id.trim() === '') {
    details.push('Поле id обязательно');
  }
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    details.push('Поле title обязательно');
  }
  if (!Array.isArray(input.questions)) {
    details.push('Поле questions должно быть массивом');
  }

  if (details.length > 0) {
    throw new QuizValidationError('Документ теста некорректен', details);
  }

  /** @type {object[]} */
  const questions = input.questions;
  const ids = new Set();

  questions.forEach((question, index) => {
    if (!isObject(question)) {
      details.push(`questions[${index}]: ожидается объект`);
      return;
    }
    if (typeof question.id !== 'string' || question.id.trim() === '') {
      details.push(`questions[${index}]: id обязателен`);
    } else if (ids.has(question.id)) {
      details.push(`questions[${index}]: дублирующий id ${question.id}`);
    } else {
      ids.add(question.id);
    }

    if (!QUESTION_TYPES.includes(question.type)) {
      details.push(`questions[${index}]: неизвестный type ${String(question.type)}`);
    }

    if (typeof question.prompt !== 'string' && question.type !== 'info') {
      details.push(`questions[${index}]: prompt обязателен`);
    }

    const points = question.points ?? 1;
    if (typeof points !== 'number' || Number.isNaN(points) || points < 0) {
      details.push(`questions[${index}]: points должен быть числом ≥ 0`);
    }

    validateByType(question, index, details);
  });

  const resources = Array.isArray(input.resources) ? input.resources : [];
  resources.forEach((resource, index) => {
    if (!isObject(resource)) {
      details.push(`resources[${index}]: ожидается объект`);
      return;
    }
    if (typeof resource.id !== 'string' || resource.id.trim() === '') {
      details.push(`resources[${index}]: id обязателен`);
    }
  });

  const questionGroups = Array.isArray(input.questionGroups) ? input.questionGroups : [];
  questionGroups.forEach((group, index) => {
    if (!isObject(group)) {
      details.push(`questionGroups[${index}]: ожидается объект`);
      return;
    }
    if (typeof group.id !== 'string' || group.id.trim() === '') {
      details.push(`questionGroups[${index}]: id обязателен`);
    }
    if (typeof group.title !== 'string') {
      details.push(`questionGroups[${index}]: title обязателен`);
    }
    if (!Array.isArray(group.questionIds)) {
      details.push(`questionGroups[${index}]: questionIds должен быть массивом`);
      return;
    }
    group.questionIds.forEach((qid) => {
      if (!ids.has(qid)) {
        details.push(`questionGroups[${index}]: неизвестный вопрос ${String(qid)}`);
      }
    });
    if (group.pick != null && (typeof group.pick !== 'number' || group.pick < 0)) {
      details.push(`questionGroups[${index}]: pick ≥ 0 или null`);
    }
  });

  if (details.length > 0) {
    throw new QuizValidationError('Документ теста некорректен', details);
  }

  return {
    schemaVersion,
    id: input.id.trim(),
    title: input.title.trim(),
    description: typeof input.description === 'string' ? input.description : '',
    author: typeof input.author === 'string' ? input.author : '',
    settings: { ...defaultSettings(), ...(isObject(input.settings) ? input.settings : {}) },
    questions,
    resources,
    questionGroups,
  };
}

/**
 * @param {Record<string, unknown>} question
 * @param {number} index
 * @param {string[]} details
 */
function validateByType(question, index, details) {
  const prefix = `questions[${index}]`;

  switch (question.type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false': {
      if (!Array.isArray(question.options) || question.options.length < 2) {
        details.push(`${prefix}: options — минимум 2 варианта`);
        break;
      }
      const correct = question.options.filter((o) => isObject(o) && o.correct === true);
      if (question.type === 'single_choice' || question.type === 'true_false') {
        if (correct.length !== 1) {
          details.push(`${prefix}: ровно один correct`);
        }
      } else if (correct.length < 1) {
        details.push(`${prefix}: нужен хотя бы один correct`);
      }
      break;
    }
    case 'text': {
      if (!Array.isArray(question.acceptedAnswers) || question.acceptedAnswers.length < 1) {
        details.push(`${prefix}: acceptedAnswers обязателен`);
      }
      break;
    }
    case 'numeric': {
      if (typeof question.correctValue !== 'number' || Number.isNaN(question.correctValue)) {
        details.push(`${prefix}: correctValue должен быть числом`);
      }
      const tol = question.tolerance ?? 0;
      if (typeof tol !== 'number' || tol < 0) {
        details.push(`${prefix}: tolerance ≥ 0`);
      }
      break;
    }
    case 'matching': {
      if (!Array.isArray(question.pairs) || question.pairs.length < 1) {
        details.push(`${prefix}: pairs обязателен`);
      }
      break;
    }
    case 'ordering': {
      if (!Array.isArray(question.items) || question.items.length < 2) {
        details.push(`${prefix}: items — минимум 2`);
      }
      break;
    }
    case 'fill_blanks': {
      if (!Array.isArray(question.blanks) || question.blanks.length < 1) {
        details.push(`${prefix}: blanks обязателен`);
      }
      break;
    }
    case 'image':
    case 'info':
      break;
    default:
      break;
  }
}

/**
 * Проверка манифеста пакета .quiz
 * @param {unknown} manifest
 */
export function validateManifest(manifest) {
  if (!isObject(manifest)) {
    throw new QuizValidationError('manifest.json должен быть объектом');
  }
  const details = [];
  if (manifest.format !== 'unitest-quiz') {
    details.push('format должен быть unitest-quiz');
  }
  const schemaVersion = String(manifest.schemaVersion ?? '');
  if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
    details.push(`неподдерживаемая schemaVersion: ${schemaVersion}`);
  }
  if (typeof manifest.quizId !== 'string' || !manifest.quizId) {
    details.push('quizId обязателен');
  }
  if (typeof manifest.title !== 'string' || !manifest.title) {
    details.push('title обязателен');
  }
  if (typeof manifest.contentFile !== 'string' || !manifest.contentFile) {
    details.push('contentFile обязателен');
  }
  if (details.length) {
    throw new QuizValidationError('manifest.json некорректен', details);
  }
  return manifest;
}
