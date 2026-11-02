import { QUESTION_TYPES, defaultSettings } from '../core/quiz-engine/schema.js';

export const QUESTION_TYPE_LABELS = {
  single_choice: 'Один ответ',
  multiple_choice: 'Несколько ответов',
  true_false: 'Верно / Неверно',
  text: 'Текстовый ответ',
  numeric: 'Числовой ответ',
  matching: 'Соответствия',
  ordering: 'Упорядочивание',
  fill_blanks: 'Пропуски',
  image: 'С изображением',
  info: 'Информационный блок',
};

export function newId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankQuiz(title = 'Новый тест') {
  return {
    schemaVersion: '1.0',
    id: newId('quiz'),
    title,
    description: '',
    author: '',
    settings: defaultSettings(),
    questions: [],
    resources: [],
    questionGroups: [],
  };
}

export function createQuestion(type = 'single_choice') {
  const id = newId('q');
  const base = { id, type, prompt: '', points: type === 'info' ? 0 : 1 };

  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
      return {
        ...base,
        scoringMode: type === 'multiple_choice' ? 'all_or_nothing' : undefined,
        options: [
          { id: newId('o'), text: 'Вариант 1', correct: true },
          { id: newId('o'), text: 'Вариант 2', correct: false },
        ],
      };
    case 'true_false':
      return {
        ...base,
        prompt: 'Утверждение',
        options: [
          { id: 'yes', text: 'Верно', correct: true },
          { id: 'no', text: 'Неверно', correct: false },
        ],
      };
    case 'text':
      return { ...base, acceptedAnswers: [''], caseSensitive: false };
    case 'numeric':
      return { ...base, correctValue: 0, tolerance: 0 };
    case 'matching':
      return {
        ...base,
        pairs: [
          { leftId: newId('l'), rightId: newId('r'), leftText: 'A', rightText: '1' },
          { leftId: newId('l'), rightId: newId('r'), leftText: 'B', rightText: '2' },
        ],
      };
    case 'ordering':
      return {
        ...base,
        items: [
          { id: newId('i'), text: 'Первый' },
          { id: newId('i'), text: 'Второй' },
        ],
      };
    case 'fill_blanks':
      return {
        ...base,
        prompt: 'Вставьте пропуск: ___',
        blanks: [{ id: newId('b'), acceptedAnswers: [''] }],
      };
    case 'image':
      return {
        ...base,
        imageResourceId: null,
        innerQuestion: createQuestion('single_choice'),
      };
    case 'info':
      return { ...base, prompt: 'Информационный текст' };
    default:
      return base;
  }
}

export function supportedTypes() {
  return QUESTION_TYPES.map((type) => ({
    type,
    label: QUESTION_TYPE_LABELS[type] || type,
  }));
}

export function cloneQuestion(question) {
  const copy = structuredClone(question);
  copy.id = newId('q');
  if (Array.isArray(copy.options)) {
    copy.options = copy.options.map((o) => ({ ...o, id: newId('o') }));
  }
  return copy;
}

/**
 * Меняет тип вопроса, сохраняя id, текст и баллы.
 * @param {object} question
 * @param {string} nextType
 */
export function changeQuestionType(question, nextType) {
  if (question.type === nextType) {
    return question;
  }

  const next = createQuestion(nextType);
  next.id = question.id;
  if (typeof question.prompt === 'string' && question.prompt.trim() !== '') {
    next.prompt = question.prompt;
  }
  if (nextType !== 'info' && typeof question.points === 'number') {
    next.points = question.points;
  }
  if (nextType !== 'info' && typeof question.explanation === 'string' && question.explanation.trim() !== '') {
    next.explanation = question.explanation;
  }

  // Перенос совместимых полей между похожими типами
  if (
    Array.isArray(question.options) &&
    (nextType === 'single_choice' || nextType === 'multiple_choice')
  ) {
    next.options = structuredClone(question.options);
    if (nextType === 'single_choice') {
      let seen = false;
      next.options = next.options.map((opt) => {
        const correct = Boolean(opt.correct) && !seen;
        if (correct) seen = true;
        return { ...opt, correct };
      });
      if (!seen && next.options[0]) next.options[0].correct = true;
    }
    if (nextType === 'multiple_choice') {
      next.scoringMode = question.scoringMode === 'partial' ? 'partial' : 'all_or_nothing';
    }
  }

  return next;
}
