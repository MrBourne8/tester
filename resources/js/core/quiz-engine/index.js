import { ENGINE_VERSION, SCORING_VERSION, SCHEMA_VERSION } from './schema.js';
import { prepareAttempt } from './prepare.js';
import { scoreAttempt, scoreQuestion, normalizeText } from './scoring.js';
import {
  defaultGradingScale,
  normalizeGradingScale,
  pointsForScale,
  resolveGrade,
  summarizeAnswers,
} from './grading.js';
import { QuizValidationError, validateQuizDocument, validateManifest } from './validate.js';
import { applyModePreset, currentMode, resolveEffectiveSettings } from './modes.js';

export {
  ENGINE_VERSION,
  SCORING_VERSION,
  SCHEMA_VERSION,
  QuizValidationError,
  validateQuizDocument,
  validateManifest,
  prepareAttempt,
  scoreAttempt,
  scoreQuestion,
  normalizeText,
  defaultGradingScale,
  normalizeGradingScale,
  pointsForScale,
  resolveGrade,
  summarizeAnswers,
  applyModePreset,
  currentMode,
  resolveEffectiveSettings,
};

/**
 * Независимый от DOM/сети движок тестирования.
 */
export function createEngine() {
  return {
    version: ENGINE_VERSION,
    scoringVersion: SCORING_VERSION,
    schemaVersion: SCHEMA_VERSION,

    /**
     * @param {unknown} document
     */
    load(document) {
      return validateQuizDocument(document);
    },

    /**
     * @param {import('./schema.js').QuizDocument} quiz
     * @param {{ seed?: number|string }} [options]
     */
    prepare(quiz, options) {
      return prepareAttempt(quiz, options);
    },

    /**
     * @param {object[]} questions
     * @param {Record<string, unknown>} answers
     * @param {{ passThresholdPercent?: number, gradingScale?: object[] }} [meta]
     */
    grade(questions, answers, meta = {}) {
      const scored = scoreAttempt(questions, answers);
      const threshold = meta.passThresholdPercent ?? 50;
      const grade = resolveGrade(scored.percentage, meta.gradingScale);
      const stats = summarizeAnswers(scored.perQuestion);
      return {
        ...scored,
        engineVersion: ENGINE_VERSION,
        passed: scored.percentage >= threshold,
        passThresholdPercent: threshold,
        grade,
        stats,
      };
    },

    /**
     * Полный цикл попытки с фиксацией порядка.
     * @param {unknown} document
     * @param {Record<string, unknown>} answers
     * @param {{ seed?: number|string }} [options]
     */
    runAttempt(document, answers, options = {}) {
      const quiz = validateQuizDocument(document);
      const prepared = prepareAttempt(quiz, options);
      const graded = this.grade(prepared.questions, answers, quiz.settings || {});

      return {
        quizId: quiz.id,
        title: quiz.title,
        seed: prepared.seed,
        questionOrder: prepared.questionOrder,
        optionOrder: prepared.optionOrder,
        ...graded,
      };
    },
  };
}

export default createEngine;
