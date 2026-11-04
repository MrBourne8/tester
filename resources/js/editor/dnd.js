/**
 * HTML5 drag-and-drop reorder for a list of items.
 * Drag starts only from [data-drag-handle].
 *
 * @param {{
 *   container: Element,
 *   itemSelector: string,
 *   onReorder: (from: number, to: number) => void,
 * }} opts
 */
export function bindReorder(opts) {
  const { container, itemSelector, onReorder } = opts;
  if (!container) return;

  /** @type {number|null} */
  let fromIndex = null;

  container.querySelectorAll(itemSelector).forEach((item) => {
    const handle = item.querySelector('[data-drag-handle]');
    if (!handle) return;

    handle.setAttribute('draggable', 'true');
    handle.addEventListener('dragstart', (e) => {
      const items = [...container.querySelectorAll(itemSelector)];
      fromIndex = items.indexOf(item);
      if (fromIndex < 0) return;
      item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(fromIndex));
      try {
        e.dataTransfer.setDragImage(item, 16, 16);
      } catch {
        // ignore
      }
    });

    handle.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      container.querySelectorAll(`${itemSelector}.is-drop-target`).forEach((el) => {
        el.classList.remove('is-drop-target');
      });
      fromIndex = null;
    });

    item.addEventListener('dragover', (e) => {
      if (fromIndex == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll(`${itemSelector}.is-drop-target`).forEach((el) => {
        el.classList.remove('is-drop-target');
      });
      item.classList.add('is-drop-target');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('is-drop-target');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('is-drop-target');
      const items = [...container.querySelectorAll(itemSelector)];
      const toIndex = items.indexOf(item);
      if (fromIndex == null || toIndex < 0 || fromIndex === toIndex) return;
      onReorder(fromIndex, toIndex);
    });
  });
}

/**
 * @template T
 * @param {T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(list, from, to) {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
    return list;
  }
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
