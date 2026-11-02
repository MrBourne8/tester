import { ENGINE_VERSION, SCORING_VERSION } from '../core/quiz-engine/schema.js';

/**
 * @param {object} input
 */
export async function buildResultPayload(input) {
  const payload = {
    format: 'unitest-result',
    schemaVersion: '1.0',
    checksumAlgorithm: 'sha256',
    quizId: String(input.quizId || ''),
    quizTitle: String(input.quizTitle || ''),
    quizVersionNumber: input.quizVersionNumber ?? null,
    contentHash: input.contentHash ?? null,
    attemptId: String(input.attemptId || createAttemptId()),
    studentName: input.studentName ? String(input.studentName) : null,
    startedAt: String(input.startedAt || ''),
    submittedAt: String(input.submittedAt || new Date().toISOString()),
    seed: input.seed ?? null,
    questionOrder: Array.isArray(input.questionOrder) ? input.questionOrder : [],
    optionOrder: input.optionOrder || {},
    answers: input.answers || {},
    score: Number(input.score ?? 0),
    maxScore: Number(input.maxScore ?? 0),
    percentage: Number(input.percentage ?? 0),
    passed: Boolean(input.passed),
    passThresholdPercent: Number(input.passThresholdPercent ?? 50),
    durationSeconds: Number(input.durationSeconds ?? 0),
    grade: input.grade || null,
    stats: input.stats || null,
    engineVersion: ENGINE_VERSION,
    scoringVersion: SCORING_VERSION,
    perQuestion: Array.isArray(input.perQuestion) ? input.perQuestion : [],
    focusEvents: input.focusEvents && typeof input.focusEvents === 'object' ? input.focusEvents : {},
  };

  payload.checksum = await checksumForResult(payload);
  return payload;
}

/**
 * @param {object} payload
 */
export async function checksumForResult(payload) {
  const canonical = canonicalResultJson(payload);
  return sha256Hex(canonical);
}

export async function verifyResultPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Результат должен быть объектом');
  }
  if (payload.format !== 'unitest-result') {
    throw new Error('Неверный format результата');
  }
  if (payload.schemaVersion !== '1.0') {
    throw new Error('Неподдерживаемая schemaVersion результата');
  }
  const expected = await checksumForResult(payload);
  if (!payload.checksum || expected !== String(payload.checksum).toLowerCase()) {
    throw new Error('Контрольная сумма результата не совпала');
  }
  return true;
}

export function downloadResultFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${payload.attemptId || 'attempt'}.result`;
  a.click();
  URL.revokeObjectURL(url);
}

function canonicalResultJson(payload) {
  const copy = { ...payload };
  delete copy.checksum;
  return JSON.stringify(sortKeys(copy));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(digest);
  }
  throw new Error('Web Crypto API недоступна для SHA-256');
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function createAttemptId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `attempt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
