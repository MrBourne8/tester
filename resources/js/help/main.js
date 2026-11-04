import '../../css/help.css';
import { icon } from '../ui/icons.js';
import { bindSidebar, renderDashShell } from '../ui/shell.js';

const root = document.getElementById('help-app');
if (!root) throw new Error('Контейнер помощи не найден');

/** @type {{ health: any|null, statusOk: boolean|null }} */
const state = { health: null, statusOk: null };

const FAQ = [
  {
    q: 'Как создать и провести тест?',
    a: 'Откройте раздел «Мои тесты», создайте или выберите тест, сохраните изменения. Для сетевой сессии нажмите «Провести» / запустите сессию и раздайте ученикам код или QR. Для автономного режима экспортируйте EXE или веб-пакет.',
  },
  {
    q: 'Как ученик подключается к сетевому тесту?',
    a: 'Ученик открывает страницу входа (/join), вводит код сессии или сканирует QR. После старта сессии преподавателем можно проходить тест. Переключение с окна теста фиксируется системой контроля.',
  },
  {
    q: 'Что такое автономный тест?',
    a: 'Это офлайн-пакет (Windows EXE или веб-ZIP) с встроенным плеером. Интернет после запуска не нужен. По окончании ученик скачивает файл .result и передаёт преподавателю для импорта в отчёты.',
  },
  {
    q: 'Как импортировать результаты .result?',
    a: 'В разделе «Отчёты» нажмите «Импорт .result» и выберите файл. Результат появится в списке попыток вместе с сетевыми прохождениями.',
  },
  {
    q: 'Почему не удаляется тест?',
    a: 'Удаление выполняется из списка тестов в редакторе. Если тест связан с сессиями, система удаляет связанные данные каскадно. Обновите страницу и повторите, если тест всё ещё отображается.',
  },
  {
    q: 'Что делать, если страница не открывается или API недоступен?',
    a: 'Проверьте, что веб-сервер запущен (OSPanel / PHP), корень сайта указывает на папку public, используется PHP 8.3+, а база MySQL доступна. Статус сервисов смотрите в блоке «Информация о системе» справа.',
  },
  {
    q: 'Какие форматы файлов поддерживаются?',
    a: 'Тесты экспортируются как .quiz. Автономные результаты — .result. Также доступны экспорт в Word, печать, веб-пакет ZIP и нативный EXE для Windows.',
  },
];

boot().catch((e) => {
  root.innerHTML = `<p class="error" style="padding:1.5rem">${escapeHtml(e.message)}</p>`;
});

async function boot() {
  render();
  await loadHealth();
  render();
}

async function loadHealth() {
  try {
    const res = await fetch('/api/v1/health', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    state.health = data;
    state.statusOk = data.status === 'ok';
  } catch {
    state.health = null;
    state.statusOk = false;
  }
}

function render() {
  const h = state.health;
  const app = h?.checks?.app || {};
  const db = h?.checks?.database || {};
  const ext = h?.checks?.extensions || {};

  root.innerHTML = renderDashShell('help', {
    title: `
      <h1 class="app-title">Помощь</h1>
      <p class="app-subtitle">Справка по работе с Тесторией, FAQ и состояние системы</p>`,
    content: `
      <div class="help-grid">
        <div class="help-main">
          <section class="help-panel">
            <h2 class="help-panel-title">Быстрый старт</h2>
            <p class="help-intro">Тестория — территория создания и прохождения тестов: редактор, сетевые сессии, автономный режим и отчёты на одном формате .quiz.</p>
            <div class="help-links">
              ${linkCard('tests', 'Мои тесты', 'Создание и редактирование', '/editor')}
              ${linkCard('globe', 'Вход ученика', 'Код или QR сессии', '/join')}
              ${linkCard('reports', 'Отчёты', 'Попытки и импорт .result', '/reports')}
              ${linkCard('logo', 'Плеер', 'Открыть файл .quiz', '/player')}
            </div>
          </section>

          <section class="help-panel">
            <h2 class="help-panel-title">Частые вопросы</h2>
            <div class="faq-list">
              ${FAQ.map((item, i) => `
                <details class="faq-item" ${i === 0 ? 'open' : ''}>
                  <summary>${escapeHtml(item.q)}</summary>
                  <div class="faq-body"><p>${escapeHtml(item.a)}</p></div>
                </details>`).join('')}
            </div>
          </section>
        </div>

        <aside class="help-aside">
          <section class="help-panel">
            <div class="sys-status">
              <h2 class="help-panel-title" style="margin:0">Информация о системе</h2>
              <span class="dash-badge ${state.statusOk ? 'is-ok' : state.statusOk === false ? 'is-bad' : ''}">${
                state.statusOk ? 'Готово' : state.statusOk === false ? 'Сбой' : '…'
              }</span>
            </div>
            <dl class="sys-rows">
              <div class="sys-row"><dt>Приложение</dt><dd>${escapeHtml(app.name || 'Тестория')}</dd></div>
              <div class="sys-row"><dt>Окружение</dt><dd>${escapeHtml(app.env || '—')}</dd></div>
              <div class="sys-row"><dt>PHP</dt><dd>${escapeHtml(app.php || '—')}</dd></div>
              <div class="sys-row">
                <dt>База данных</dt>
                <dd class="${db.ok ? 'is-ok' : 'is-bad'}">${
                  db.ok
                    ? `OK · ${escapeHtml(String(db.version || 'MySQL'))}${db.latency_ms != null ? ` · ${db.latency_ms} мс` : ''}`
                    : escapeHtml(db.message || 'Недоступна')
                }</dd>
              </div>
              <div class="sys-row">
                <dt>Расширения PHP</dt>
                <dd class="${ext.ok ? 'is-ok' : 'is-bad'}">${
                  ext.ok
                    ? 'Все обязательные'
                    : `Нет: ${(ext.missing || []).map(escapeHtml).join(', ') || 'ошибка'}`
                }</dd>
              </div>
              <div class="sys-row">
                <dt>Health API</dt>
                <dd class="${state.statusOk ? 'is-ok' : 'is-bad'}">${
                  state.statusOk ? 'ok' : state.statusOk === false ? (h?.status || 'ошибка') : '…'
                }</dd>
              </div>
            </dl>
            <p class="sys-note">Данные с <code>/api/v1/health</code>. При сбое проверьте OSPanel, PHP 8.3+ и подключение к MySQL.</p>
          </section>
        </aside>
      </div>`,
  });
  bindSidebar(root);
}

function linkCard(name, title, text, href) {
  return `
    <a class="help-link-card" href="${href}">
      <span class="help-link-card-ico">${icon(name, { size: 16 })}</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </a>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
