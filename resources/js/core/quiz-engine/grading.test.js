import { describe, expect, it } from 'vitest';
import { createEngine, resolveGrade, summarizeAnswers } from './index.js';

describe('grading scale', () => {
  it('resolves russian-like grades by percent', () => {
    expect(resolveGrade(95).label).toBe('5');
    expect(resolveGrade(75).label).toBe('4');
    expect(resolveGrade(55).label).toBe('3');
    expect(resolveGrade(20).label).toBe('2');
  });

  it('summarizes correct and incorrect answers', () => {
    const stats = summarizeAnswers([
      { type: 'single_choice', awarded: 1, max: 1, isCorrect: true },
      { type: 'single_choice', awarded: 0, max: 1, isCorrect: false },
      { type: 'multiple_choice', awarded: 1, max: 2, isCorrect: false },
      { type: 'info', awarded: 0, max: 0, isCorrect: null },
    ]);
    expect(stats.correct).toBe(1);
    expect(stats.incorrect).toBe(1);
    expect(stats.partial).toBe(1);
    expect(stats.info).toBe(1);
  });

  it('engine.grade includes grade and stats', () => {
    const engine = createEngine();
    const quiz = {
      schemaVersion: '1.0',
      id: 'g1',
      title: 'G',
      settings: {
        passThresholdPercent: 50,
        gradingScale: [
          { label: 'отлично', minPercent: 80 },
          { label: 'хорошо', minPercent: 60 },
          { label: 'неудовл.', minPercent: 0 },
        ],
      },
      questions: [
        {
          id: 'q1',
          type: 'single_choice',
          prompt: '?',
          points: 1,
          options: [
            { id: 'a', text: 'ok', correct: true },
            { id: 'b', text: 'no', correct: false },
          ],
        },
        {
          id: 'q2',
          type: 'single_choice',
          prompt: '?',
          points: 1,
          options: [
            { id: 'a', text: 'ok', correct: true },
            { id: 'b', text: 'no', correct: false },
          ],
        },
      ],
    };
    const loaded = engine.load(quiz);
    const graded = engine.grade(
      loaded.questions,
      { q1: { optionId: 'a' }, q2: { optionId: 'a' } },
      loaded.settings,
    );
    expect(graded.percentage).toBe(100);
    expect(graded.grade.label).toBe('отлично');
    expect(graded.stats.correct).toBe(2);
    expect(graded.stats.incorrect).toBe(0);
  });
});
