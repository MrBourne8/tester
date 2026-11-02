import { resolveResourceSrc } from '../core/quiz-engine/resources.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {object} question
 * @param {unknown} answer
 * @param {object|null} [quiz]
 */
export function renderQuestion(question, answer, quiz = null) {
  const prompt = `<h3 class="player-prompt">${escapeHtml(question.prompt || '')}</h3>`;
  const media = renderMedia(question, quiz);

  switch (question.type) {
    case 'info':
      return `${prompt}${media}<p class="hint">Информационный блок — баллы не начисляются.</p>`;
    case 'single_choice':
    case 'true_false':
      return (
        prompt +
        media +
        `<div class="player-options">${(question.options || [])
          .map(
            (o) => `
        <label class="option"><input type="radio" name="ans" value="${escapeHtml(o.id)}" ${
              answer?.optionId === o.id ? 'checked' : ''
            }> ${escapeHtml(o.text)}</label>`,
          )
          .join('')}</div>`
      );
    case 'multiple_choice': {
      const selected = new Set(answer?.optionIds || []);
      return (
        prompt +
        media +
        `<div class="player-options">${(question.options || [])
          .map(
            (o) => `
        <label class="option"><input type="checkbox" value="${escapeHtml(o.id)}" ${
              selected.has(o.id) ? 'checked' : ''
            }> ${escapeHtml(o.text)}</label>`,
          )
          .join('')}</div>`
      );
    }
    case 'text':
      return `${prompt}${media}<input class="input" data-field="text" value="${escapeHtml(
        answer?.text || '',
      )}" placeholder="Ваш ответ">`;
    case 'numeric':
      return `${prompt}${media}<input class="input" data-field="number" type="number" step="any" value="${
        answer?.value ?? ''
      }" placeholder="Число">`;
    case 'ordering':
      return `${prompt}${media}<ol class="player-order" data-order>${(question.items || [])
        .map(
          (item, index) => `
        <li data-id="${escapeHtml(item.id)}">
          <span>${escapeHtml(item.text || item.id)}</span>
          <span class="order-btns">
            <button type="button" class="btn btn-ghost" data-move="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-ghost" data-move="1">↓</button>
          </span>
        </li>`,
        )
        .join('')}</ol>`;
    case 'fill_blanks':
      return (
        prompt +
        media +
        (question.blanks || [])
          .map(
            (b) => `
        <label class="blank">Пропуск
          <input class="input" data-blank="${escapeHtml(b.id)}" value="${escapeHtml(
              answer?.blanks?.[b.id] || '',
            )}">
        </label>`,
          )
          .join('')
      );
    case 'matching':
      return (
        prompt +
        media +
        (question.pairs || [])
          .map(
            (p) => `
          <label class="blank">${escapeHtml(p.leftText || p.leftId)}
            <select class="input" data-left="${escapeHtml(p.leftId)}">
              <option value="">—</option>
              ${(question.pairs || [])
                .map(
                  (opt) => `
                <option value="${escapeHtml(opt.rightId)}" ${
                    answer?.matches?.[p.leftId] === opt.rightId ? 'selected' : ''
                  }>${escapeHtml(opt.rightText || opt.rightId)}</option>`,
                )
                .join('')}
            </select>
          </label>`,
          )
          .join('')
      );
    case 'image': {
      const inner = question.innerQuestion;
      const innerHtml = inner
        ? renderQuestion({ ...inner, prompt: inner.prompt || '' }, answer, quiz).replace(
            /<h3 class="player-prompt">[\s\S]*?<\/h3>/,
            '',
          )
        : '<p class="hint">Вложенный вопрос не задан.</p>';
      return `${prompt}${media}${innerHtml}`;
    }
    default:
      return `${prompt}${media}<p class="hint">Тип ${escapeHtml(question.type)} пока упрощён.</p>`;
  }
}

function renderMedia(question, quiz) {
  const resourceId = question.imageResourceId || question.resourceId || null;
  if (!resourceId || !quiz) return '';
  const src = resolveResourceSrc(quiz, resourceId);
  if (!src) return '<p class="hint">Изображение не найдено в ресурсах теста.</p>';
  return `<figure class="player-media"><img src="${src}" alt=""></figure>`;
}

export function captureAnswer(root, question) {
  if (!question) return null;

  if (question.type === 'image' && question.innerQuestion) {
    return captureAnswer(root, question.innerQuestion);
  }

  switch (question.type) {
    case 'single_choice':
    case 'true_false': {
      const selected = root.querySelector('input[name="ans"]:checked');
      return { optionId: selected ? selected.value : null };
    }
    case 'multiple_choice': {
      const ids = [...root.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
      return { optionIds: ids };
    }
    case 'text':
      return { text: root.querySelector('[data-field="text"]')?.value || '' };
    case 'numeric': {
      const raw = root.querySelector('[data-field="number"]')?.value;
      return { value: raw === '' || raw == null ? NaN : Number(raw) };
    }
    case 'ordering':
      return {
        order: [...root.querySelectorAll('[data-order] li')].map((li) => li.dataset.id),
      };
    case 'fill_blanks': {
      const blanks = {};
      root.querySelectorAll('[data-blank]').forEach((el) => {
        blanks[el.getAttribute('data-blank')] = el.value;
      });
      return { blanks };
    }
    case 'matching': {
      const matches = {};
      root.querySelectorAll('[data-left]').forEach((el) => {
        matches[el.getAttribute('data-left')] = el.value;
      });
      return { matches };
    }
    default:
      return null;
  }
}

export function bindOrderingControls(root, onChange) {
  root.querySelectorAll('[data-order] li').forEach((li) => {
    li.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.getAttribute('data-move'));
        const list = li.parentElement;
        if (!list) return;
        const items = [...list.children];
        const index = items.indexOf(li);
        const target = index + delta;
        if (target < 0 || target >= items.length) return;
        if (delta > 0) {
          list.insertBefore(items[target], li);
        } else {
          list.insertBefore(li, items[target]);
        }
        onChange?.();
      });
    });
  });
}
