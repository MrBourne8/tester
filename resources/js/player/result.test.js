import { describe, expect, it } from 'vitest';
import { buildResultPayload, verifyResultPayload } from './result.js';

describe('result payload', () => {
  it('builds checksum and verifies', async () => {
    const payload = await buildResultPayload({
      quizId: 'quiz_1',
      quizTitle: 'Demo',
      studentName: 'Иван',
      startedAt: '2026-10-25T10:00:00.000Z',
      submittedAt: '2026-10-25T10:05:00.000Z',
      seed: 42,
      questionOrder: ['q1'],
      answers: { q1: { optionId: 'a' } },
      score: 1,
      maxScore: 1,
      percentage: 100,
      passed: true,
      passThresholdPercent: 50,
      perQuestion: [],
    });

    expect(payload.format).toBe('unitest-result');
    expect(payload.checksum).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyResultPayload(payload)).resolves.toBe(true);

    const tampered = { ...payload, score: 99 };
    await expect(verifyResultPayload(tampered)).rejects.toThrow(/сумма/i);
  });
});
