import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, SCORING_VERSION, createEngine } from './index.js';

describe('quiz-engine', () => {
  it('exposes stable versions', () => {
    expect(ENGINE_VERSION).toBe('1.0.0');
    expect(SCORING_VERSION).toBe('1.0.0');
  });

  it('createEngine returns versioned API', () => {
    const engine = createEngine();
    expect(engine.version).toBe(ENGINE_VERSION);
    expect(typeof engine.load).toBe('function');
    expect(typeof engine.grade).toBe('function');
    expect(typeof engine.runAttempt).toBe('function');
  });
});
