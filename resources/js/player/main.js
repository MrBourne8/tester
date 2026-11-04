import '../../css/player.css';
import JSZip from 'jszip';
import { brandLockup } from '../ui/brand.js';
import { mountStandalonePlayer } from './standalone.js';

const root = document.getElementById('player-app');
if (!root) {
  throw new Error('Контейнер плеера не найден');
}

boot().catch((error) => {
  root.innerHTML = `<p class="error">${String(error.message || error)}</p>`;
});

async function boot() {
  await waitForEmbeddedQuiz();

  if (globalThis.__UNITEST_QUIZ__) {
    if (renderExpiredIfNeeded(root, globalThis.__UNITEST_META__)) {
      return;
    }
    mountStandalonePlayer(root, {
      quizDocument: globalThis.__UNITEST_QUIZ__,
      quizVersionNumber: globalThis.__UNITEST_META__?.versionNumber ?? null,
      contentHash: globalThis.__UNITEST_META__?.contentHash ?? null,
      expiresAt: globalThis.__UNITEST_META__?.expiresAt ?? null,
    });
    return;
  }

  const quizId = root.dataset.quizId;
  if (quizId) {
    const response = await fetch(`/api/v1/quizzes/${quizId}`, {
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Не удалось загрузить тест');
    }
    mountStandalonePlayer(root, {
      quizDocument: payload.data.content,
      quizVersionNumber: payload.data.version_number,
      contentHash: payload.data.content_hash,
    });
    return;
  }

  root.innerHTML = `
    <section class="player-shell is-start">
      ${brandLockup({ tagline: true })}
      <h1>Портативный плеер</h1>
      <p class="lead">Откройте файл теста (.quiz). После загрузки страницы интернет не требуется.</p>
      <div class="player-start-actions">
        <label class="btn btn-primary" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer">
          Выбрать .quiz
          <input type="file" accept=".quiz,.zip,application/zip" hidden data-action="open-quiz">
        </label>
      </div>
    </section>`;

  root.querySelector('[data-action="open-quiz"]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const quiz = await readQuizFile(file);
      mountStandalonePlayer(root, { quizDocument: quiz });
    } catch (error) {
      alert(error.message || String(error));
    }
  });
}

async function readQuizFile(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  assertSafeZipPaths(zip);
  const manifestText = await zip.file('manifest.json')?.async('string');
  if (!manifestText) throw new Error('В архиве нет manifest.json');
  const manifest = JSON.parse(manifestText);
  if (manifest.format !== 'unitest-quiz') throw new Error('Это не пакет Тестория .quiz');
  const contentFile = manifest.contentFile || 'quiz.json';
  if (String(contentFile).includes('..') || String(contentFile).startsWith('/')) {
    throw new Error('Небезопасный путь contentFile');
  }
  const quizText = await zip.file(contentFile)?.async('string');
  if (!quizText) throw new Error(`В архиве нет ${contentFile}`);
  return JSON.parse(quizText);
}

function assertSafeZipPaths(zip) {
  Object.keys(zip.files).forEach((name) => {
    const normalized = name.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new Error('Небезопасный путь в архиве: ' + name);
    }
  });
}

/**
 * @param {HTMLElement} root
 * @param {object|null|undefined} meta
 */
function renderExpiredIfNeeded(root, meta) {
  const expiresAt = meta?.expiresAt;
  if (!expiresAt) return false;
  const ts = Date.parse(String(expiresAt));
  if (!Number.isFinite(ts) || Date.now() <= ts) return false;

  const when = new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  root.innerHTML = `
    <section class="player-shell is-start is-expired">
      ${brandLockup({ tagline: true })}
      <h1>Срок действия истёк</h1>
      <p class="lead">Этот автономный тест больше недоступен. Срок действия файла закончился${when ? ` ${escapeHtml(when)}` : ''}.</p>
      <p class="hint">Обратитесь к преподавателю за новой версией теста.</p>
    </section>`;
  return true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * В Tauri тест подставляется из overlay EXE или resources/quiz-data.js после загрузки страницы.
 */
function waitForEmbeddedQuiz(timeoutMs = 2500) {
  if (globalThis.__UNITEST_QUIZ__) {
    return Promise.resolve();
  }
  const isTauri = Boolean(globalThis.__TAURI_INTERNALS__ || globalThis.__TAURI__);
  if (!isTauri) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('unitest-quiz-ready', done);
      resolve();
    };
    window.addEventListener('unitest-quiz-ready', done);
    setTimeout(done, timeoutMs);
  });
}
