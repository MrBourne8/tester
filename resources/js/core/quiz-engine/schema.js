/** @typedef {'single_choice'|'multiple_choice'|'true_false'|'text'|'numeric'|'matching'|'ordering'|'fill_blanks'|'image'|'info'} QuestionType */

export const SCHEMA_VERSION = '1.0';
export const ENGINE_VERSION = '1.0.0';
export const SCORING_VERSION = '1.0.0';

export const SUPPORTED_SCHEMA_VERSIONS = new Set(['1.0']);

export const QUESTION_TYPES = Object.freeze([
  'single_choice',
  'multiple_choice',
  'true_false',
  'text',
  'numeric',
  'matching',
  'ordering',
  'fill_blanks',
  'image',
  'info',
]);

/**
 * @typedef {object} QuizSettings
 * @property {number|null} [timeLimitSeconds]
 * @property {number|null} [questionTimeLimitSeconds]
 * @property {number} [maxAttempts]
 * @property {number} [passThresholdPercent]
 * @property {boolean} [shuffleQuestions]
 * @property {boolean} [shuffleOptions]
 * @property {boolean} [showCorrectAnswers]
 * @property {boolean} [showScore]
 * @property {'immediate'|'teacher_release'} [showResultMode]
 * @property {boolean} [allowNavigationBack]
 * @property {boolean} [allowSkip]
 * @property {boolean} [trainingMode]
 * @property {boolean} [examMode]
 * @property {Array<{label: string, minPercent: number, color?: string}>} [gradingScale]
 */

/**
 * @typedef {object} QuizDocument
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {string} [author]
 * @property {QuizSettings} [settings]
 * @property {object[]} questions
 * @property {object[]} [resources]
 * @property {object[]} [questionGroups]
 */

export function defaultSettings() {
  return {
    timeLimitSeconds: null,
    questionTimeLimitSeconds: null,
    maxAttempts: 1,
    passThresholdPercent: 50,
    shuffleQuestions: false,
    shuffleOptions: false,
    showCorrectAnswers: false,
    showScore: true,
    showResultMode: 'immediate',
    allowNavigationBack: true,
    allowSkip: true,
    trainingMode: false,
    examMode: false,
    gradingScale: [
      { label: '5', minPercent: 90, color: '#0f6b4c' },
      { label: '4', minPercent: 70, color: '#2f7d4f' },
      { label: '3', minPercent: 50, color: '#b7791f' },
      { label: '2', minPercent: 0, color: '#9b2c2c' },
    ],
  };
}
