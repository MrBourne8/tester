import { icon } from './icons.js';

const SIDEBAR_KEY = 'testoriya_sidebar_collapsed';

export function isSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   folders?: { id: number, name: string, quizzes_count?: number }[],
 *   folderFilter?: 'all'|'none'|number,
 *   total?: number,
 *   unfiled?: number,
 * }} [folderOpts]
 */
function renderFolderNav(folderOpts) {
  if (!folderOpts || !Array.isArray(folderOpts.folders)) return '';
  const filter = folderOpts.folderFilter ?? 'all';
  const total = folderOpts.total ?? 0;
  const unfiled = folderOpts.unfiled ?? 0;
  const item = (id, label, count, ico) => {
    const active = filter === id || (typeof filter === 'number' && Number(id) === Number(filter));
    const drop = id === 'all' ? '' : ` data-drop-folder="${id}"`;
    return `
      <button type="button" class="dash-nav-folder ${active ? 'is-active' : ''}"
        data-folder-filter="${id}"${drop} data-tip="${escapeAttr(label)}">
        ${icon(active && id !== 'none' && id !== 'all' ? 'folderOpen' : ico, { size: 16 })}
        <span class="dash-nav-folder-label">${escapeHtml(label)}</span>
        <span class="dash-nav-folder-count">${count}</span>
      </button>`;
  };
  return `
    <div class="dash-nav-folders" data-el="folder-nav">
      ${item('all', 'Все тесты', total, 'layers')}
      ${item('none', 'Без папки', unfiled, 'folder')}
      ${folderOpts.folders.map((f) => item(String(f.id), f.name, f.quizzes_count ?? 0, 'folder')).join('')}
      <button type="button" class="dash-nav-folder dash-nav-folder-add" data-action="folder-create" data-tip="Новая папка">
        ${icon('folderPlus', { size: 16 })}
        <span class="dash-nav-folder-label">Новая папка</span>
      </button>
    </div>`;
}

function renderSidebar(active, folderOpts = null) {
  const collapsed = isSidebarCollapsed();
  const toggleIcon = collapsed ? 'panelRight' : 'panelLeft';
  const toggleTip = collapsed ? 'Развернуть меню' : 'Свернуть меню';
  const showFolders = active === 'tests' && folderOpts;
  return `
    <div class="dash-nav-scrim" data-el="nav-scrim" aria-hidden="true"></div>
    <aside class="dash-sidebar" data-el="sidebar">
      <div class="dash-brand-row">
        <a class="dash-brand" href="/" title="Тестория">
          <span class="dash-brand-mark">${icon('logo', { size: 22 })}</span>
          <span class="dash-brand-name">Тестория</span>
        </a>
        <button type="button" class="dash-collapse" data-action="toggle-sidebar" title="${toggleTip}" aria-label="${toggleTip}">
          ${icon(toggleIcon, { size: 16 })}
        </button>
        <button type="button" class="dash-nav-close" data-action="close-nav" aria-label="Закрыть меню">
          ${icon('x', { size: 18 })}
        </button>
      </div>
      <nav class="dash-nav">
        <a class="dash-nav-link ${active === 'home' ? 'is-active' : ''}" href="/" data-tip="Главная">${icon('home', { size: 18 })}<span>Главная</span></a>
        <a class="dash-nav-link ${active === 'tests' && !showFolders ? 'is-active' : ''} ${showFolders ? 'is-parent' : ''}" href="/editor" data-tip="Мои тесты">${icon('tests', { size: 18 })}<span>Мои тесты</span></a>
        ${showFolders ? renderFolderNav(folderOpts) : ''}
        <a class="dash-nav-link ${active === 'published' ? 'is-active' : ''}" href="/published" data-tip="Опубликованные">${icon('share', { size: 18 })}<span>Опубликованные</span></a>
        <a class="dash-nav-link ${active === 'reports' ? 'is-active' : ''}" href="/reports" data-tip="Отчёты">${icon('reports', { size: 18 })}<span>Отчёты</span></a>
        <a class="dash-nav-link ${active === 'help' ? 'is-active' : ''}" href="/help" data-tip="Помощь">${icon('help', { size: 18 })}<span>Помощь</span></a>
      </nav>
      <div class="dash-promo" title="Территория создания и прохождения тестов">
        <div class="dash-promo-ico">${icon('rocket', { size: 18 })}</div>
        <p class="dash-promo-text">Территория создания и прохождения тестов</p>
        <a class="dash-promo-link" href="/help">О продукте ${icon('chevronRight', { size: 14 })}</a>
      </div>
    </aside>`;
}

function mobileNavToggle() {
  return `<button type="button" class="dash-mobile-toggle" data-action="open-nav" aria-label="Открыть меню" title="Меню">${icon('menu', { size: 20 })}</button>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

/**
 * @param {ParentNode} [root=document]
 */
export function bindSidebar(root = document) {
  const shell = root.querySelector?.('.dash-shell') || document.querySelector('.dash-shell');
  if (!shell) return;
  shell.classList.toggle('is-collapsed', isSidebarCollapsed());

  const closeNav = () => {
    shell.classList.remove('is-nav-open');
    document.body.classList.remove('nav-open');
    const scrim = shell.querySelector('[data-el="nav-scrim"]');
    if (scrim) scrim.setAttribute('aria-hidden', 'true');
  };
  const openNav = () => {
    shell.classList.add('is-nav-open');
    document.body.classList.add('nav-open');
    const scrim = shell.querySelector('[data-el="nav-scrim"]');
    if (scrim) scrim.setAttribute('aria-hidden', 'false');
  };

  const collapseBtn = shell.querySelector('[data-action="toggle-sidebar"]');
  if (collapseBtn && collapseBtn.dataset.bound !== '1') {
    collapseBtn.dataset.bound = '1';
    collapseBtn.addEventListener('click', () => {
      const next = !shell.classList.contains('is-collapsed');
      shell.classList.toggle('is-collapsed', next);
      setSidebarCollapsed(next);
      const tip = next ? 'Развернуть меню' : 'Свернуть меню';
      collapseBtn.title = tip;
      collapseBtn.setAttribute('aria-label', tip);
      collapseBtn.innerHTML = icon(next ? 'panelRight' : 'panelLeft', { size: 16 });
    });
  }

  if (shell.dataset.navBound !== '1') {
    shell.dataset.navBound = '1';
    shell.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t || !shell.contains(t)) return;
      const action = t.getAttribute('data-action');
      if (action === 'open-nav') openNav();
      if (action === 'close-nav') closeNav();
    });
    shell.querySelector('[data-el="nav-scrim"]')?.addEventListener('click', closeNav);
    shell.addEventListener('click', (e) => {
      const link = e.target.closest('.dash-nav-link, .dash-nav-folder');
      if (!link || !shell.contains(link)) return;
      if (window.matchMedia('(max-width: 860px)').matches) closeNav();
    });
  }

  if (!document.documentElement.dataset.navGlobal) {
    document.documentElement.dataset.navGlobal = '1';
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.dash-shell.is-nav-open').forEach((node) => {
        node.classList.remove('is-nav-open');
        node.querySelector('[data-el="nav-scrim"]')?.setAttribute('aria-hidden', 'true');
      });
      document.body.classList.remove('nav-open');
    });
    window.addEventListener('resize', () => {
      if (window.matchMedia('(max-width: 860px)').matches) return;
      document.querySelectorAll('.dash-shell.is-nav-open').forEach((node) => {
        node.classList.remove('is-nav-open');
        node.querySelector('[data-el="nav-scrim"]')?.setAttribute('aria-hidden', 'true');
      });
      document.body.classList.remove('nav-open');
    });
  }
}

/**
 * @param {'tests'|'reports'|'published'|'home'|'help'|'settings'} active
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   topRight?: string,
 *   content: string,
 *   footer?: string,
 *   folders?: { id: number, name: string, quizzes_count?: number }[],
 *   folderFilter?: 'all'|'none'|number,
 *   folderTotal?: number,
 *   folderUnfiled?: number,
 * }} opts
 */
export function renderAppShell(active, opts) {
  const {
    title,
    subtitle = '',
    topRight = '',
    content = '',
    footer = '',
    folders = null,
    folderFilter = 'all',
    folderTotal = 0,
    folderUnfiled = 0,
  } = opts;
  const collapsed = isSidebarCollapsed() ? ' is-collapsed' : '';
  const folderOpts = Array.isArray(folders)
    ? { folders, folderFilter, total: folderTotal, unfiled: folderUnfiled }
    : null;
  return `
    <div class="dash-shell${collapsed}">
      ${renderSidebar(active, folderOpts)}
      <div class="app-main dash-main">
        <header class="app-topbar dash-topbar">
          <div class="app-topbar-left dash-topbar-left">
            ${mobileNavToggle()}
            <div class="dash-topbar-titles">${title}${subtitle}</div>
          </div>
          <div class="app-topbar-right dash-topbar-right">${topRight}</div>
        </header>
        <div class="app-content">${content}</div>
        ${footer ? `<footer class="app-footer">${footer}</footer>` : ''}
      </div>
    </div>`;
}

/**
 * @param {'home'|'tests'|'reports'|'published'|'settings'|'help'} active
 * @param {{ title: string, topRight?: string, content: string }} opts
 */
export function renderDashShell(active, opts) {
  const { title = '', topRight = '', content = '' } = opts;
  const collapsed = isSidebarCollapsed() ? ' is-collapsed' : '';
  return `
    <div class="dash-shell${collapsed}">
      ${renderSidebar(active)}
      <div class="dash-main">
        <header class="dash-topbar">
          <div class="dash-topbar-left">
            ${mobileNavToggle()}
            <div class="dash-topbar-titles">${title}</div>
          </div>
          <div class="dash-topbar-right">${topRight}</div>
        </header>
        <div class="dash-content">${content}</div>
      </div>
    </div>`;
}

export function navBackIcon() {
  return icon('arrowLeft', { size: 16, className: 'nav-back-ico' });
}
