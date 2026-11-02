window.__UNITEST_QUIZ__ = {
  schemaVersion: '1.0',
  id: 'embedded-demo',
  title: 'Демонстрационный автономный тест',
  description: 'Встроенный пример для Tauri-плеера',
  settings: { passThresholdPercent: 50, showScore: true, timeLimitSeconds: null },
  questions: [
    {
      id: 'q1', type: 'single_choice', prompt: '2 + 2 = ?', points: 1,
      options: [
        { id: 'a', text: '3', correct: false },
        { id: 'b', text: '4', correct: true }
      ]
    }
  ]
};
window.__UNITEST_META__ = { versionNumber: 1, format: 'unitest-standalone-web', schemaVersion: '1.0' };
