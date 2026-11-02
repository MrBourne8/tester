import { describe, expect, it } from 'vitest';
import { createEngine, normalizeText, scoreQuestion } from './index.js';

const sampleQuiz = {
  schemaVersion: '1.0',
  id: 'quiz-demo',
  title: 'Демо',
  settings: {
    shuffleQuestions: true,
    shuffleOptions: true,
    passThresholdPercent: 60,
  },
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: '2+2?',
      points: 1,
      options: [
        { id: 'a', text: '3', correct: false },
        { id: 'b', text: '4', correct: true },
        { id: 'c', text: '5', correct: false },
      ],
    },
    {
      id: 'q2',
      type: 'multiple_choice',
      prompt: 'Чётные',
      points: 2,
      scoringMode: 'partial',
      options: [
        { id: 'a', text: '1', correct: false },
        { id: 'b', text: '2', correct: true },
        { id: 'c', text: '4', correct: true },
      ],
    },
    {
      id: 'q3',
      type: 'true_false',
      prompt: 'Земля круглая',
      points: 1,
      options: [
        { id: 'yes', text: 'Верно', correct: true },
        { id: 'no', text: 'Неверно', correct: false },
      ],
    },
    {
      id: 'q4',
      type: 'text',
      prompt: 'Столица Франции',
      points: 1,
      acceptedAnswers: ['Париж', 'Paris'],
    },
    {
      id: 'q5',
      type: 'numeric',
      prompt: 'π ≈',
      points: 1,
      correctValue: 3.14,
      tolerance: 0.01,
    },
    {
      id: 'q6',
      type: 'matching',
      prompt: 'Пары',
      points: 2,
      pairs: [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l2', rightId: 'r2' },
      ],
    },
    {
      id: 'q7',
      type: 'ordering',
      prompt: 'Порядок',
      points: 1,
      items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }],
    },
    {
      id: 'q8',
      type: 'fill_blanks',
      prompt: 'Hello ___',
      points: 1,
      blanks: [{ id: 'b1', acceptedAnswers: ['world', 'мир'] }],
    },
    {
      id: 'q9',
      type: 'info',
      prompt: 'Инфо',
      points: 0,
    },
  ],
};

describe('normalizeText', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeText('  Hello   World ')).toBe('hello world');
  });
});

describe('scoreQuestion', () => {
  it('scores single choice', () => {
    const q = sampleQuiz.questions[0];
    expect(scoreQuestion(q, { optionId: 'b' }).awarded).toBe(1);
    expect(scoreQuestion(q, { optionId: 'a' }).awarded).toBe(0);
  });

  it('scores multiple choice partially', () => {
    const q = sampleQuiz.questions[1];
    expect(scoreQuestion(q, { optionIds: ['b', 'c'] }).awarded).toBe(2);
    expect(scoreQuestion(q, { optionIds: ['b'] }).awarded).toBe(1);
    expect(scoreQuestion(q, { optionIds: ['b', 'a'] }).awarded).toBe(0);
  });

  it('scores numeric with tolerance', () => {
    const q = sampleQuiz.questions[4];
    expect(scoreQuestion(q, { value: 3.141 }).isCorrect).toBe(true);
    expect(scoreQuestion(q, { value: 3.2 }).isCorrect).toBe(false);
  });

  it('scores text with normalization', () => {
    const q = sampleQuiz.questions[3];
    expect(scoreQuestion(q, { text: '  париж ' }).isCorrect).toBe(true);
  });
});

describe('createEngine reproducibility', () => {
  const answers = {
    q1: { optionId: 'b' },
    q2: { optionIds: ['b', 'c'] },
    q3: { optionId: 'yes' },
    q4: { text: 'Paris' },
    q5: { value: 3.14 },
    q6: { matches: { l1: 'r1', l2: 'r2' } },
    q7: { order: ['i1', 'i2', 'i3'] },
    q8: { blanks: { b1: 'world' } },
    q9: null,
  };

  it('same seed and answers produce identical results', () => {
    const engine = createEngine();
    const a = engine.runAttempt(sampleQuiz, answers, { seed: 42 });
    const b = engine.runAttempt(sampleQuiz, answers, { seed: 42 });

    expect(a.score).toBe(b.score);
    expect(a.maxScore).toBe(b.maxScore);
    expect(a.percentage).toBe(b.percentage);
    expect(a.questionOrder).toEqual(b.questionOrder);
    expect(a.optionOrder).toEqual(b.optionOrder);
    expect(a.passed).toBe(true);
  });

  it('rejects invalid documents', () => {
    const engine = createEngine();
    expect(() => engine.load({ title: 'x' })).toThrow();
  });
});
