import QRCode from 'qrcode';
import '../../css/session.css';

const root = document.getElementById('session-app');
if (!root) throw new Error('Контейнер сессии не найден');

const sessionId = root.dataset.sessionId ? Number(root.dataset.sessionId) : null;

/** @type {any} */
let state = null;
/** @type {any} */
let results = [];
/** @type {any} */
let live = null;
/** @type {number|null} */
let selectedParticipantId = null;
/** @type {string|null} */
let selectedJoinUrl = null;
let shellReady = false;
let timer = null;
let busy = false;
let qrBusy = false;

async function boot() {
  ensureShell();
  await refresh(true);
  timer = setInterval(() => {
    refresh(false).catch(() => {});
  }, 2000);
}

function ensureShell() {
  if (shellReady) return;
  root.innerHTML = `
    <header class="top page-head">
      <div class="page-head-main">
        <div class="nav-row">
          <a class="nav-back" href="/editor"><svg class="nav-back-ico" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>К редактору</a>
          <a class="nav-text" href="/reports">Отчёты</a>
        </div>
        <h1 data-el="title">Сессия</h1>
        <p class="muted page-lead">Сетевое тестирование · <span class="status-pill" data-el="status">—</span></p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="start">Старт</button>
        <button type="button" class="btn" data-action="pause">Пауза</button>
        <button type="button" class="btn" data-action="finish">Завершить</button>
        <button type="button" class="btn btn-danger" data-action="close">Закрыть</button>
      </div>
    </header>

    <div class="grid-2">
      <section class="panel">
        <h2 class="panel-title">Код занятия</h2>
        <p class="code-box" data-el="code">————</p>
        <p class="muted">Ученики сканируют QR или открывают /join и вводят код.</p>
        <div class="access-block">
          <h3 class="panel-subtitle">Доступ через интернет</h3>
          <p class="muted hint-sm">Вставьте публичный URL (туннель Cloudflare / ngrok или домен сервера). QR и ссылки обновятся.</p>
          <div class="access-row">
            <input class="input" data-el="public-url" placeholder="https://xxxx.trycloudflare.com" autocomplete="off">
            <button type="button" class="btn btn-primary" data-action="save-access">Применить</button>
            <button type="button" class="btn btn-ghost" data-action="clear-access">Сбросить</button>
          </div>
          <p class="muted hint-sm" data-el="access-status"></p>
        </div>
        <div class="join-qr-block">
          <canvas class="join-qr" data-el="qr" width="220" height="220" aria-label="QR для подключения"></canvas>
          <div class="join-qr-side">
            <h3 class="panel-subtitle">QR для телефона</h3>
            <p class="muted hint-sm">Сканирование откроет страницу входа с уже подставленным кодом.</p>
            <label class="field join-qr-select-label">Адрес в QR
              <select class="input" data-el="qr-url"></select>
            </label>
            <p class="muted meta-line" data-el="qr-url-text"></p>
          </div>
        </div>
        <h3 class="panel-subtitle">Адреса</h3>
        <div class="urls" data-el="urls"></div>
        <p class="muted meta-line" data-el="meta"></p>
      </section>

      <section class="panel">
        <h2 class="panel-title">Участники</h2>
        <p class="muted hint-sm">Выберите ученика, чтобы открыть живой монитор.</p>
        <div data-el="participants"><p class="muted">Загрузка…</p></div>
      </section>
    </div>

    <section class="panel monitor-panel">
      <div class="monitor-head">
        <h2 class="panel-title">Живой монитор</h2>
        <p class="muted" data-el="monitor-summary">Выберите участника в списке слева.</p>
      </div>
      <div data-el="monitor"><p class="muted">Нет выбранного ученика</p></div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Итоги</h2>
      <div data-el="results"><p class="muted">Пока нет сданных попыток</p></div>
    </section>
  `;

  root.querySelector('[data-action="start"]')?.addEventListener('click', () => postAction('start'));
  root.querySelector('[data-action="pause"]')?.addEventListener('click', () => postAction('pause'));
  root.querySelector('[data-action="finish"]')?.addEventListener('click', () => postAction('finish'));
  root.querySelector('[data-action="close"]')?.addEventListener('click', async () => {
    if (!confirm('Закрыть сессию окончательно?')) return;
    await postAction('close');
  });

  root.querySelector('[data-el="participants"]')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-select-participant]');
    if (!btn) return;
    selectedParticipantId = Number(btn.getAttribute('data-select-participant'));
    patchParticipants();
    refreshLive(true).catch(() => {});
  });

  root.querySelector('[data-el="qr-url"]')?.addEventListener('change', (event) => {
    selectedJoinUrl = event.target.value || null;
    renderJoinQr().catch(() => {});
  });

  root.querySelector('[data-action="save-access"]')?.addEventListener('click', () => saveAccess(false));
  root.querySelector('[data-action="clear-access"]')?.addEventListener('click', () => saveAccess(true));
  root.querySelector('[data-el="public-url"]')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAccess(false);
  });

  shellReady = true;
}

async function refresh(forceLive = false) {
  if (busy) return;
  busy = true;
  try {
    const [sessionData, resultsData] = await Promise.all([
      api(`/api/v1/sessions/${sessionId}`),
      api(`/api/v1/sessions/${sessionId}/results`),
    ]);
    state = sessionData;
    results = resultsData;
    if (selectedParticipantId && !state.participants?.some((p) => p.id === selectedParticipantId)) {
      selectedParticipantId = null;
      live = null;
    }
    patchSession();
    patchParticipants();
    patchResults();
    if (selectedParticipantId) {
      await refreshLive(forceLive);
    } else {
      patchMonitor();
    }
  } finally {
    busy = false;
  }
}

async function refreshLive() {
  if (!selectedParticipantId) {
    live = null;
    patchMonitor();
    return;
  }
  live = await api(`/api/v1/sessions/${sessionId}/participants/${selectedParticipantId}/live`);
  patchMonitor();
}

function patchSession() {
  const s = state;
  if (!s) return;
  setText('title', s.quiz_title || 'Сессия');
  setText('status', statusLabel(s.status));
  setText('code', s.session_code || '————');
  setText('meta', `Порт: ${s.listen_port} · участников: ${s.participants_count ?? 0}${s.internet_enabled ? ' · интернет' : ''}`);

  const publicInput = root.querySelector('[data-el="public-url"]');
  if (publicInput && document.activeElement !== publicInput) {
    const saved = s.settings?.public_base_url || s.public_base_url || '';
    if (publicInput.value !== saved) publicInput.value = saved;
  }
  const accessStatus = root.querySelector('[data-el="access-status"]');
  if (accessStatus) {
    accessStatus.textContent = s.internet_enabled
      ? `Интернет-ссылка активна: ${s.public_base_url}`
      : 'Пока только локальная сеть. Для удалённых учеников укажите публичный URL.';
  }

  const urls = root.querySelector('[data-el="urls"]');
  const list = s.join_urls_with_code || [];
  if (urls) {
    const html = list.length
      ? list.map((u) => {
        const isNet = !u.includes('127.0.0.1') && !/https?:\/\/192\.168\.|https?:\/\/10\.|https?:\/\/172\.(1[6-9]|2\d|3[0-1])\./.test(u);
        const isLan = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(u);
        const tag = isNet && !isLan ? ' <span class="url-tag">интернет</span>' : (isLan ? ' <span class="url-tag is-lan">LAN</span>' : '');
        return `<code>${escapeHtml(u)}${tag}</code>`;
      }).join('')
      : '<p class="muted">Адреса не определены</p>';
    if (urls.dataset.cache !== html) {
      urls.innerHTML = html;
      urls.dataset.cache = html;
    }
  }

  patchQrUrlSelect(list);
  renderJoinQr().catch(() => {});

  const canStart = s.status === 'open' || s.status === 'paused';
  const canPause = s.status === 'running';
  const canFinish = ['open', 'running', 'paused'].includes(s.status);
  const canClose = s.status !== 'closed';
  setDisabled('start', !canStart);
  setDisabled('pause', !canPause);
  setDisabled('finish', !canFinish);
  setDisabled('close', !canClose);
}

function patchParticipants() {
  const box = root.querySelector('[data-el="participants"]');
  if (!box || !state) return;
  const list = state.participants || [];
  if (!list.length) {
    const empty = '<p class="muted">Пока никто не подключился</p>';
    if (box.dataset.cache !== empty) {
      box.innerHTML = empty;
      box.dataset.cache = empty;
    }
    return;
  }

  const html = `
    <table class="table participants-table">
      <thead><tr><th>Имя</th><th>Статус</th><th>%</th></tr></thead>
      <tbody>
        ${list.map((p) => `
          <tr class="${p.id === selectedParticipantId ? 'is-selected' : ''}" data-select-participant="${p.id}" role="button" tabindex="0">
            <td>${escapeHtml(p.display_name)}</td>
            <td>${escapeHtml(participantLabel(p))}</td>
            <td>${p.percentage != null ? `${escapeHtml(String(p.percentage))}%` : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  if (box.dataset.cache !== html) {
    box.innerHTML = html;
    box.dataset.cache = html;
  }
}

function patchResults() {
  const box = root.querySelector('[data-el="results"]');
  if (!box) return;
  if (!results.length) {
    const empty = '<p class="muted">Пока нет сданных попыток</p>';
    if (box.dataset.cache !== empty) {
      box.innerHTML = empty;
      box.dataset.cache = empty;
    }
    return;
  }
  const html = `
    <table class="table">
      <thead><tr><th>Ученик</th><th>Попытка</th><th>Баллы</th><th>%</th><th>Оценка</th><th>Сдано</th></tr></thead>
      <tbody>
        ${results.map((r) => `
          <tr>
            <td>${escapeHtml(r.display_name)}</td>
            <td>${escapeHtml(r.attempt_status || '—')}</td>
            <td>${r.score != null ? `${escapeHtml(String(r.score))} / ${escapeHtml(String(r.max_score))}` : '—'}</td>
            <td>${r.percentage != null ? escapeHtml(String(r.percentage)) : '—'}</td>
            <td>${escapeHtml(r.grade?.label || '—')}</td>
            <td>${escapeHtml(formatTime(r.submitted_at))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  if (box.dataset.cache !== html) {
    box.innerHTML = html;
    box.dataset.cache = html;
  }
}

function patchMonitor() {
  const summary = root.querySelector('[data-el="monitor-summary"]');
  const box = root.querySelector('[data-el="monitor"]');
  if (!summary || !box) return;

  if (!selectedParticipantId || !live) {
    summary.textContent = 'Выберите участника в списке слева.';
    const empty = '<p class="muted">Нет выбранного ученика</p>';
    if (box.dataset.cache !== empty) {
      box.innerHTML = empty;
      box.dataset.cache = empty;
    }
    return;
  }

  const p = live.participant;
  const L = live.live || {};
  const attempt = live.attempt;
  const questions = live.questions || [];
  const focusTotal = questions.reduce((n, q) => n + (q.focus_loss?.count || 0), 0);
  summary.textContent = `${p.display_name} · ${participantStatusRu(p.status, attempt?.status)} · сейчас ${L.score ?? 0}/${L.max_score ?? 0} (${L.percentage ?? 0}%) · верно ${L.correct ?? 0}, ошибки ${L.incorrect ?? 0}, отвечено ${L.answered ?? 0}/${L.total ?? 0}${focusTotal ? ` · уходов с окна: ${focusTotal}` : ''}`;

  const html = questions.length
    ? `<div class="monitor-list">${questions.map(renderMonitorItem).join('')}</div>`
    : '<p class="muted">В тесте нет вопросов</p>';
  if (box.dataset.cache !== html) {
    box.innerHTML = html;
    box.dataset.cache = html;
  }
}

function renderMonitorItem(q) {
  const statusClass = ({
    correct: 'is-correct',
    incorrect: 'is-incorrect',
    partial: 'is-partial',
    pending: 'is-pending',
    info: 'is-info',
  })[q.status] || 'is-pending';

  const badge = ({
    correct: 'Верно',
    incorrect: 'Ошибка',
    partial: 'Частично',
    pending: 'Ещё не ответил',
    info: 'Инфо',
  })[q.status] || q.status;

  const focus = q.focus_loss;
  const focusHtml = focus?.count
    ? `<p class="monitor-focus">⚠ Уход с окна: ${escapeHtml(String(focus.count))}×${
        focus.last_at ? ` · последний ${escapeHtml(formatTime(focus.last_at))}` : ''
      }</p>`
    : '';

  return `
    <article class="monitor-item ${statusClass}${focus?.count ? ' has-focus-loss' : ''}">
      <div class="monitor-item-top">
        <strong>${q.index}. ${escapeHtml(q.prompt || '(без текста)')}</strong>
        <span class="monitor-badges">
          <span class="monitor-badge">${escapeHtml(badge)}</span>
          ${focus?.count ? `<span class="monitor-badge is-focus">Фокус −${escapeHtml(String(focus.count))}</span>` : ''}
        </span>
      </div>
      <p class="muted q-type">${escapeHtml(typeLabel(q.type))} · ${escapeHtml(String(q.awarded ?? 0))}/${escapeHtml(String(q.max ?? 0))} б.</p>
      ${focusHtml}
      ${q.status === 'info' ? '' : `
        <div class="monitor-answers">
          <div><span class="label">Ответ ученика</span><div class="value">${q.answered ? escapeHtml(q.given || '—') : '—'}</div></div>
          <div><span class="label">Правильный</span><div class="value">${escapeHtml(q.expected || '—')}</div></div>
        </div>
        ${q.answered_at ? `<p class="muted answered-at">Обновлено: ${escapeHtml(formatTime(q.answered_at))}</p>` : ''}
      `}
    </article>`;
}

async function postAction(action) {
  state = await api(`/api/v1/sessions/${sessionId}/${action}`, { method: 'POST' });
  patchSession();
  await refresh(true);
}

function pickDefaultJoinUrl(list) {
  if (!list.length) return null;
  const internet = list.find((u) => {
    try {
      const host = new URL(u).hostname;
      if (host === '127.0.0.1' || host === 'localhost') return false;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
      return true;
    } catch {
      return false;
    }
  });
  if (internet) return internet;
  const lan = list.find((u) => !u.includes('127.0.0.1') && !u.includes('localhost'));
  return lan || list[0];
}

async function saveAccess(clear) {
  const input = root.querySelector('[data-el="public-url"]');
  const status = root.querySelector('[data-el="access-status"]');
  const value = clear ? '' : (input?.value?.trim() || '');
  try {
    state = await api(`/api/v1/sessions/${sessionId}/access`, {
      method: 'POST',
      body: JSON.stringify({ public_base_url: value }),
    });
    selectedJoinUrl = null;
    patchSession();
    if (status) status.textContent = clear || !value
      ? 'Публичный адрес сброшен — доступ только по LAN.'
      : 'Публичный адрес сохранён.';
  } catch (e) {
    alert(e.message || 'Не удалось сохранить адрес');
  }
}

function patchQrUrlSelect(list) {
  const select = root.querySelector('[data-el="qr-url"]');
  if (!select) return;
  if (!list.includes(selectedJoinUrl)) {
    selectedJoinUrl = pickDefaultJoinUrl(list);
  }
  const key = list.join('\n');
  if (select.dataset.cache === key) {
    if (selectedJoinUrl && select.value !== selectedJoinUrl) {
      select.value = selectedJoinUrl;
    }
    return;
  }
  select.innerHTML = list.length
    ? list.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')
    : '<option value="">Нет адресов</option>';
  select.disabled = list.length === 0;
  if (selectedJoinUrl) select.value = selectedJoinUrl;
  select.dataset.cache = key;
}

async function renderJoinQr() {
  const canvas = root.querySelector('[data-el="qr"]');
  const caption = root.querySelector('[data-el="qr-url-text"]');
  if (!canvas) return;
  const url = selectedJoinUrl;
  if (caption) {
    caption.textContent = url
      ? 'Наведите камеру телефона на QR'
      : 'Нет сетевого адреса для QR';
  }
  if (!url || qrBusy) return;
  if (canvas.dataset.url === url) return;
  qrBusy = true;
  try {
    await QRCode.toCanvas(canvas, url, {
      width: 220,
      margin: 1,
      color: { dark: '#14201b', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    canvas.dataset.url = url;
  } catch {
    canvas.dataset.url = '';
    if (caption) caption.textContent = 'Не удалось построить QR';
  } finally {
    qrBusy = false;
  }
}

function setText(name, value) {
  const el = root.querySelector(`[data-el="${name}"]`);
  if (el && el.textContent !== String(value)) el.textContent = String(value);
}

function setDisabled(action, disabled) {
  const el = root.querySelector(`[data-action="${action}"]`);
  if (el) el.disabled = Boolean(disabled);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Ошибка ${response.status}`);
  }
  return payload.data;
}

function statusLabel(status) {
  return ({
    draft: 'Черновик',
    open: 'Открыта',
    running: 'Идёт',
    paused: 'Пауза',
    finished: 'Завершена',
    closed: 'Закрыта',
  })[status] || status;
}

function participantLabel(p) {
  if (p.attempt_status === 'submitted') return 'Сдал';
  if (p.status === 'in_progress') return 'Пишет';
  if (p.status === 'disconnected') return 'Офлайн';
  return 'Подключился';
}

function participantStatusRu(participantStatus, attemptStatus) {
  if (attemptStatus === 'submitted') return 'сдал';
  if (participantStatus === 'in_progress') return 'пишет';
  if (participantStatus === 'disconnected') return 'офлайн';
  return 'подключился';
}

function typeLabel(type) {
  return ({
    single_choice: 'Один ответ',
    multiple_choice: 'Несколько ответов',
    true_false: 'Верно/Неверно',
    text: 'Текст',
    numeric: 'Число',
    matching: 'Соответствия',
    ordering: 'Порядок',
    fill_blanks: 'Пропуски',
    image: 'Изображение',
    info: 'Инфо',
  })[type] || type;
}

function formatTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

window.addEventListener('beforeunload', () => {
  if (timer) clearInterval(timer);
});

if (!sessionId) {
  root.innerHTML = '<p class="error">Не указан id сессии</p>';
} else {
  boot().catch((e) => {
    root.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  });
}
