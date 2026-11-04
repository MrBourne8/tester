import { icon } from './icons.js';

/**
 * Синий квадрат с GraduationCap — как логотип в сайдбаре.
 * @param {{ size?: number, iconSize?: number, className?: string }} [opts]
 */
export function brandMark(opts = {}) {
  const size = opts.size ?? 40;
  const iconSize = opts.iconSize ?? Math.round(size * 0.5);
  const cls = ['brand-mark', opts.className].filter(Boolean).join(' ');
  return `<span class="${cls}" style="width:${size}px;height:${size}px" aria-hidden="true">${icon('logo', { size: iconSize })}</span>`;
}

/**
 * @param {{ size?: number, tagline?: boolean, compact?: boolean }} [opts]
 */
export function brandLockup(opts = {}) {
  const markSize = opts.compact ? 36 : 44;
  const tag = opts.tagline
    ? '<p class="brand-tag">Территория создания и прохождения тестов</p>'
    : '';
  return `
    <div class="brand-lockup">
      ${brandMark({ size: markSize })}
      <div class="brand-lockup-text">
        <p class="brand">Тестория</p>
        ${tag}
      </div>
    </div>`;
}

export const FAVICON_HREF = '/favicon.svg';
