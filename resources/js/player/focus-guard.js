/**
 * Полноэкранный режим и учёт реального ухода со страницы теста.
 * Считаем только скрытие вкладки/окна (visibility hidden).
 * Обычный blur от confirm(), fullscreen и кликов по UI браузера игнорируем.
 */

/**
 * @typedef {{ at: string, type: 'hidden', questionId: string|null }} FocusEvent
 */

/**
 * @param {{
 *   getQuestionId: () => string|null,
 *   isActive: () => boolean,
 *   onEvent?: (ev: FocusEvent) => void,
 * }} options
 */
export function createFocusGuard(options) {
  /** @type {FocusEvent[]} */
  const events = [];
  /** @type {Record<string, FocusEvent[]>} */
  const byQuestion = {};
  let listening = false;
  let lastAtMs = 0;
  let suppressUntil = 0;

  function record() {
    if (!options.isActive()) return;
    const now = Date.now();
    if (now < suppressUntil) return;
    // антидребезг на парные события
    if (now - lastAtMs < 1000) return;
    lastAtMs = now;
    const questionId = options.getQuestionId();
    const ev = {
      at: new Date().toISOString(),
      type: /** @type {'hidden'} */ ('hidden'),
      questionId: questionId || null,
    };
    events.push(ev);
    if (questionId) {
      if (!byQuestion[questionId]) byQuestion[questionId] = [];
      byQuestion[questionId].push(ev);
    }
    options.onEvent?.(ev);
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      record();
    }
  }

  return {
    /**
     * Временно не учитывать уходы (fullscreen, диалоги подтверждения).
     * @param {number} [ms]
     */
    suppress(ms = 1500) {
      suppressUntil = Math.max(suppressUntil, Date.now() + ms);
    },
    start() {
      if (listening) return;
      listening = true;
      // Не слушаем window.blur: confirm/alert/fullscreen дают ложные уходы.
      document.addEventListener('visibilitychange', onVisibility);
    },
    stop() {
      if (!listening) return;
      listening = false;
      document.removeEventListener('visibilitychange', onVisibility);
    },
    getEvents() {
      return events.slice();
    },
    getByQuestion() {
      return structuredClone(byQuestion);
    },
    /** Сводка для монитора: questionId → { count, lastAt } */
    getSummary() {
      /** @type {Record<string, { count: number, lastAt: string, types: string[] }>} */
      const summary = {};
      for (const [qid, list] of Object.entries(byQuestion)) {
        summary[qid] = {
          count: list.length,
          lastAt: list[list.length - 1]?.at || '',
          types: [...new Set(list.map((e) => e.type))],
        };
      }
      return summary;
    },
  };
}

/**
 * Попытка включить полноэкранный режим (браузер или Tauri).
 * @returns {Promise<boolean>}
 */
export async function enterFullscreen() {
  try {
    if (globalThis.__TAURI__ || globalThis.__TAURI_INTERNALS__) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(true);
      return true;
    }
  } catch {
    // fallback ниже
  }

  const el = document.documentElement;
  if (el.requestFullscreen) {
    try {
      await el.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * @returns {Promise<void>}
 */
export async function exitFullscreen() {
  try {
    if (globalThis.__TAURI__ || globalThis.__TAURI_INTERNALS__) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(false);
      return;
    }
  } catch {
    // ignore
  }
  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch {
      // ignore
    }
  }
}
