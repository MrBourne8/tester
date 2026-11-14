import '../../css/help.css';
import { icon } from '../ui/icons.js';
import { bindSidebar, renderDashShell } from '../ui/shell.js';

const root = document.getElementById('help-app');
if (!root) throw new Error('Контейнер помощи не найден');

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
    a: 'Проверьте, что веб-сервер запущен, корень сайта указывает на папку public, используется PHP 8.3+, а база MySQL доступна.',
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
}

function render() {
  root.innerHTML = renderDashShell('help', {
    title: `
      <h1 class="app-title">Помощь</h1>
      <p class="app-subtitle">Справка по работе с Тесторией и FAQ</p>`,
    content: `
      <div class="help-grid help-grid--single">
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
