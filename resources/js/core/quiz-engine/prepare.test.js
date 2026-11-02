import { describe, expect, it } from 'vitest';
import { prepareAttempt } from './prepare.js';

function quizWithGroups() {
  return {
    id: 'q',
    title: 'T',
    settings: { shuffleQuestions: false, shuffleOptions: false },
    questions: [
      { id: 'a', type: 'info', prompt: 'A', points: 0 },
      { id: 'b', type: 'info', prompt: 'B', points: 0 },
      { id: 'c', type: 'info', prompt: 'C', points: 0 },
      { id: 'd', type: 'info', prompt: 'D', points: 0 },
    ],
    questionGroups: [
      { id: 'g1', title: 'G1', questionIds: ['a', 'b', 'c'], pick: 2, shuffle: false },
    ],
  };
}

describe('prepareAttempt groups', () => {
  it('picks N questions from a group then appends ungrouped', () => {
    const prepared = prepareAttempt(quizWithGroups(), { seed: 42 });
    expect(prepared.questionOrder).toEqual(['a', 'b', 'd']);
  });

  it('is reproducible for the same seed when shuffling', () => {
    const quiz = quizWithGroups();
    quiz.questionGroups[0].shuffle = true;
    const a = prepareAttempt(quiz, { seed: 7 });
    const b = prepareAttempt(quiz, { seed: 7 });
    expect(a.questionOrder).toEqual(b.questionOrder);
    expect(a.questionOrder.filter((id) => id !== 'd')).toHaveLength(2);
    expect(a.questionOrder.at(-1)).toBe('d');
  });
});
