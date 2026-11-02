import JSZip from 'jszip';
import { resolveResourceSrc } from '../core/quiz-engine/resources.js';
import { QUESTION_TYPE_LABELS } from './questions.js';

/**
 * Печать: бланк для студентов + ключ ответов для проверки.
 * @param {object} quiz
 */
export function printQuiz(quiz) {
  const html = buildPrintHtml(quiz);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Печать теста');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const frameWin = iframe.contentWindow;
  const frameDoc = frameWin?.document;
  if (!frameDoc) {
    iframe.remove();
    throw new Error('Не удалось подготовить печать');
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1000);
  };

  const runPrint = async () => {
    try {
      const images = [...frameDoc.images];
      await Promise.all(images.map((img) => (
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
      )));
      frameWin.focus();
      frameWin.print();
    } finally {
      cleanup();
    }
  };

  const schedule = () => setTimeout(() => { runPrint(); }, 50);
  if (frameDoc.readyState === 'complete') schedule();
  else iframe.addEventListener('load', schedule, { once: true });
}

/**
 * Word (.docx): бланк для студентов + ключ ответов.
 * @param {object} quiz
 */
export async function downloadQuizDocx(quiz) {
  const title = String(quiz.title || 'тест').trim() || 'тест';
  const blob = await buildDocxBlob(quiz);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sanitizeFilename(title)}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildPrintHtml(quiz) {
  const title = escapeHtml(quiz.title || 'Тест');
  const meta = [
    quiz.author ? `Автор: ${escapeHtml(quiz.author)}` : '',
    quiz.description ? escapeHtml(quiz.description) : '',
  ].filter(Boolean).join('<br>');
  const questions = quiz.questions || [];

  const studentQs = questions.map((q, i) => renderStudentQuestionHtml(quiz, q, i)).join('')
    || '<p>Вопросов нет.</p>';
  const keyQs = questions.map((q, i) => renderAnswerKeyHtml(q, i)).join('')
    || '<p>Вопросов нет.</p>';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { margin: 16mm 14mm; }
  body { font-family: "Segoe UI", "PT Sans", sans-serif; color: #14201b; line-height: 1.45; margin: 0; padding: 1rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.3rem; text-align: center; }
  h2.section { font-size: 1.15rem; margin: 0 0 0.75rem; padding-bottom: 0.35rem; border-bottom: 2px solid #0c6a4a; color: #0c6a4a; }
  .lead { color: #5a6a62; margin: 0 0 0.85rem; font-size: 0.92rem; }
  .fill-row { margin: 0 0 1rem; font-size: 0.95rem; }
  .fill-row span { display: inline-block; min-width: 12rem; border-bottom: 1px solid #14201b; margin: 0 0.75rem 0 0.25rem; }
  .q { break-inside: avoid; margin: 0 0 1rem; padding-bottom: 0.65rem; border-bottom: 1px solid #d3ddd7; }
  .q h3 { font-size: 1.02rem; margin: 0 0 0.2rem; font-weight: 600; }
  .q .meta { margin: 0 0 0.4rem; color: #5a6a62; font-size: 0.82rem; }
  .q-img { display: block; max-width: 100%; max-height: 90mm; width: auto; height: auto; margin: 0.35rem 0 0.55rem; border: 1px solid #d3ddd7; }
  ul, ol { margin: 0.2rem 0 0; padding-left: 1.2rem; }
  li { margin: 0.18rem 0; }
  .key-item { break-inside: avoid; margin: 0 0 0.55rem; }
  .key-item strong { font-weight: 700; }
  .ans { color: #0c6a4a; }
  .page-break { break-before: page; page-break-before: always; margin-top: 2rem; padding-top: 0.5rem; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
    .page-break { margin-top: 0; }
    .q-img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <p class="no-print" style="margin:0 0 1rem"><button onclick="window.print()">Печать</button></p>

  <section>
    <h1>${title}</h1>
    ${meta ? `<p class="lead">${meta}</p>` : ''}
    <p class="fill-row">ФИО:<span></span> Группа:<span></span> Дата:<span></span></p>
    ${studentQs}
  </section>

  <section class="page-break">
    <h2 class="section">Ключ ответов (для преподавателя)</h2>
    <p class="lead">${title} — не раздавать студентам</p>
    ${keyQs}
  </section>
</body>
</html>`;
}

function renderStudentQuestionHtml(quiz, q, i) {
  const type = QUESTION_TYPE_LABELS[q.type] || q.type;
  const pts = q.type === 'info' ? '' : ` · ${Number(q.points) || 0} б.`;
  return `
    <section class="q">
      <h3>${i + 1}. ${escapeHtml(q.prompt || '(без текста)')}</h3>
      <p class="meta">${escapeHtml(type)}${pts}</p>
      ${formatQuestionHtml(quiz, q, false)}
    </section>`;
}

function renderAnswerKeyHtml(q, i) {
  if (q.type === 'info') {
    return `<div class="key-item"><strong>${i + 1}.</strong> <span class="ans">(информационный блок)</span></div>`;
  }
  const answer = answerKeyText(q);
  return `<div class="key-item"><strong>${i + 1}.</strong> <span class="ans">${escapeHtml(answer || '—')}</span></div>`;
}

function formatQuestionHtml(quiz, q, withAnswers) {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false':
      return `<ul>${(q.options || []).map((o) => {
        const mark = withAnswers && o.correct ? ' ✓' : '';
        const cls = withAnswers && o.correct ? ' class="ok"' : '';
        const prefix = withAnswers ? '' : '□ ';
        return `<li${cls}>${prefix}${escapeHtml(o.text || '')}${mark}</li>`;
      }).join('')}</ul>`;
    case 'text':
      return withAnswers && q.acceptedAnswers?.length
        ? `<p class="ans">Ответы: ${escapeHtml(q.acceptedAnswers.join('; '))}</p>`
        : '<p>□ ______________________________</p>';
    case 'numeric': {
      if (!withAnswers) return '<p>□ ________</p>';
      const tol = q.tolerance != null ? ` (±${q.tolerance})` : '';
      return `<p class="ans">Ответ: ${escapeHtml(String(q.correctValue ?? ''))}${escapeHtml(tol)}</p>`;
    }
    case 'matching': {
      const pairs = q.pairs || [];
      if (withAnswers) {
        return `<ul>${pairs.map((p) => `<li>${escapeHtml(pairLeft(p))} — ${escapeHtml(pairRight(p))}</li>`).join('')}</ul>`;
      }
      const rights = shuffleCopy(pairs.map((p) => pairRight(p)).filter(Boolean));
      return `
        <p>Соедините:</p>
        <ul>${pairs.map((p) => `<li>${escapeHtml(pairLeft(p))} — ________</li>`).join('')}</ul>
        ${rights.length ? `<p>Варианты справа: ${rights.map((r) => escapeHtml(r)).join('; ')}</p>` : ''}`;
    }
    case 'ordering':
      return withAnswers
        ? `<ol>${(q.items || []).map((it) => `<li>${escapeHtml(it.text || '')}</li>`).join('')}</ol>`
        : `<ul>${shuffleCopy(q.items || []).map((it) => `<li>□ ${escapeHtml(it.text || '')}</li>`).join('')}</ul>`;
    case 'fill_blanks': {
      const tpl = q.template || q.prompt || '';
      if (!withAnswers) {
        return `<p>${escapeHtml(String(tpl).replace(/\{\d+\}/g, '______'))}</p>`;
      }
      return `<p>${escapeHtml(tpl)}</p>
        <p class="ans">Пропуски: ${(q.blanks || []).map((b) => escapeHtml((b.acceptedAnswers || []).join('/'))).join('; ')}</p>`;
    }
    case 'image': {
      const src = resolveResourceSrc(quiz, q.imageResourceId || q.resourceId);
      const img = src
        ? `<img class="q-img" src="${src}" alt="">`
        : '<p class="lead">[Изображение не найдено]</p>';
      const inner = formatQuestionHtml(quiz, q.innerQuestion || { type: 'info', prompt: '' }, withAnswers);
      return `${img}${inner}`;
    }
    case 'info':
      return '';
    default:
      return '';
  }
}

function answerKeyText(q) {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false': {
      const correct = (q.options || []).filter((o) => o.correct).map((o) => o.text || '');
      return correct.length ? correct.join('; ') : '—';
    }
    case 'text':
      return (q.acceptedAnswers || []).filter(Boolean).join('; ') || '—';
    case 'numeric': {
      const tol = q.tolerance != null && Number(q.tolerance) !== 0 ? ` (±${q.tolerance})` : '';
      return `${q.correctValue ?? '—'}${tol}`;
    }
    case 'matching':
      return (q.pairs || []).map((p) => `${pairLeft(p)} → ${pairRight(p)}`).join('; ') || '—';
    case 'ordering':
      return (q.items || []).map((it, i) => `${i + 1}) ${it.text || ''}`).join('; ') || '—';
    case 'fill_blanks':
      return (q.blanks || []).map((b, i) => `{${i + 1}} ${(b.acceptedAnswers || []).join('/')}`).join('; ') || '—';
    case 'image':
      return answerKeyText(q.innerQuestion || { type: 'info' });
    default:
      return '—';
  }
}

async function buildDocxBlob(quiz) {
  const paragraphs = [];
  /** @type {{ rId: string, fileName: string, mime: string, base64: string, cx: number, cy: number, docPrId: number }[]} */
  const media = [];
  const questions = quiz.questions || [];

  paragraphs.push(pXml(quiz.title || 'Тест', { bold: true, size: 32 }));
  if (quiz.author) paragraphs.push(pXml(`Автор: ${quiz.author}`, { size: 20, color: '5A6A62' }));
  if (quiz.description) paragraphs.push(pXml(quiz.description, { size: 20, color: '5A6A62' }));
  paragraphs.push(pXml('ФИО: ____________________  Группа: __________  Дата: __________', { size: 22 }));
  paragraphs.push(pXml(''));

  if (!questions.length) {
    paragraphs.push(pXml('Вопросов нет.'));
  } else {
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const type = QUESTION_TYPE_LABELS[q.type] || q.type;
      const pts = q.type === 'info' ? '' : ` · ${Number(q.points) || 0} б.`;
      paragraphs.push(pXml(`${i + 1}. ${q.prompt || '(без текста)'}`, { bold: true, size: 24 }));
      paragraphs.push(pXml(`${type}${pts}`, { size: 18, color: '5A6A62' }));
      await appendQuestionDocx(paragraphs, media, quiz, q, false);
      paragraphs.push(pXml(''));
    }
  }

  paragraphs.push(pageBreakXml());
  paragraphs.push(pXml('Ключ ответов (для преподавателя)', { bold: true, size: 28, color: '0C6A4A' }));
  paragraphs.push(pXml(`${quiz.title || 'Тест'} — не раздавать студентам`, { size: 20, color: '5A6A62' }));
  paragraphs.push(pXml(''));

  questions.forEach((q, i) => {
    if (q.type === 'info') {
      paragraphs.push(pXml(`${i + 1}. (информационный блок)`, { size: 22 }));
      return;
    }
    paragraphs.push(pXml(`${i + 1}. ${answerKeyText(q)}`, { size: 22 }));
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${paragraphs.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const rels = media.map((m) => (
    `<Relationship Id="${m.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.fileName}"/>`
  )).join('');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const word = zip.folder('word');
  word.file('document.xml', documentXml);
  word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
</Relationships>`);
  const mediaFolder = word.folder('media');
  media.forEach((m) => {
    mediaFolder.file(m.fileName, m.base64, { base64: true });
  });

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function appendQuestionDocx(paragraphs, media, quiz, q, withAnswers) {
  if (q.type === 'image') {
    const src = resolveResourceSrc(quiz, q.imageResourceId || q.resourceId);
    if (src) {
      const entry = await registerDocxImage(media, src);
      if (entry) paragraphs.push(imageDrawingXml(entry));
      else paragraphs.push(pXml('[Изображение не удалось встроить — сохраните как PNG/JPEG]', { size: 20, color: '5A6A62' }));
    } else {
      paragraphs.push(pXml('[Изображение не найдено]', { size: 20, color: '5A6A62' }));
    }
    await appendQuestionDocx(paragraphs, media, quiz, q.innerQuestion || { type: 'info' }, withAnswers);
    return;
  }
  formatQuestionDocxLines(q, withAnswers).forEach((line) => paragraphs.push(pXml(line, { size: 22 })));
}

function formatQuestionDocxLines(q, withAnswers) {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
    case 'true_false':
      return (q.options || []).map((o) => {
        const mark = withAnswers && o.correct ? ' ✓' : '';
        const prefix = withAnswers ? '• ' : '□ ';
        return `${prefix}${o.text || ''}${mark}`;
      });
    case 'text':
      return withAnswers && q.acceptedAnswers?.length
        ? [`Ответы: ${q.acceptedAnswers.join('; ')}`]
        : ['□ ______________________________'];
    case 'numeric': {
      if (!withAnswers) return ['□ ________'];
      const tol = q.tolerance != null ? ` (±${q.tolerance})` : '';
      return [`Ответ: ${q.correctValue ?? ''}${tol}`];
    }
    case 'matching': {
      const pairs = q.pairs || [];
      if (withAnswers) {
        return pairs.map((p) => `• ${pairLeft(p)} — ${pairRight(p)}`);
      }
      const rights = shuffleCopy(pairs.map((p) => pairRight(p)).filter(Boolean));
      return [
        ...pairs.map((p) => `• ${pairLeft(p)} — ________`),
        rights.length ? `Варианты справа: ${rights.join('; ')}` : '',
      ].filter(Boolean);
    }
    case 'ordering':
      return withAnswers
        ? (q.items || []).map((it, i) => `${i + 1}. ${it.text || ''}`)
        : shuffleCopy(q.items || []).map((it) => `□ ${it.text || ''}`);
    case 'fill_blanks': {
      const tpl = q.template || q.prompt || '';
      if (!withAnswers) {
        return [String(tpl).replace(/\{\d+\}/g, '______')];
      }
      return [
        tpl,
        `Пропуски: ${(q.blanks || []).map((b) => (b.acceptedAnswers || []).join('/')).join('; ')}`,
      ];
    }
    default:
      return [];
  }
}

async function registerDocxImage(media, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  let { mime, base64 } = parsed;
  // Word плохо открывает webp — конвертируем в PNG через canvas
  if (mime === 'image/webp') {
    const converted = await webpToPngBase64(dataUrl);
    if (!converted) return null;
    mime = 'image/png';
    base64 = converted;
  }
  const ext = mimeExt(mime);
  if (!ext) return null;
  const size = await measureImage(dataUrl);
  const maxCx = 4680000; // ~13 см
  const ratio = size.h > 0 ? size.w / size.h : 4 / 3;
  const cx = maxCx;
  const cy = Math.round(maxCx / ratio);
  const docPrId = media.length + 1;
  const rId = `rIdImg${docPrId}`;
  const fileName = `image${docPrId}.${ext}`;
  const entry = { rId, fileName, mime, base64, cx, cy, docPrId };
  media.push(entry);
  return entry;
}

function imageDrawingXml(entry) {
  return `<w:p><w:r><w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${entry.cx}" cy="${entry.cy}"/>
    <wp:docPr id="${entry.docPrId}" name="Picture ${entry.docPrId}"/>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic>
          <pic:nvPicPr>
            <pic:cNvPr id="${entry.docPrId}" name="${escapeXml(entry.fileName)}"/>
            <pic:cNvPicPr/>
          </pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="${entry.rId}"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="${entry.cx}" cy="${entry.cy}"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing></w:r></w:p>`;
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

function mimeExt(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  return null;
}

function measureImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
    img.onerror = () => resolve({ w: 800, h: 600 });
    img.src = src;
  });
}

function webpToPngBase64(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1;
        canvas.height = img.naturalHeight || 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const png = canvas.toDataURL('image/png');
        const parsed = parseDataUrl(png);
        resolve(parsed ? parsed.base64 : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function pageBreakXml() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function pXml(text, { bold = false, size = 22, color = null } = {}) {
  const rPr = [
    bold ? '<w:b/>' : '',
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '',
    color ? `<w:color w:val="${color}"/>` : '',
  ].filter(Boolean).join('');
  return `<w:p><w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function pairLeft(p) {
  return String(p?.leftText ?? p?.left ?? '').trim();
}

function pairRight(p) {
  return String(p?.rightText ?? p?.right ?? '').trim();
}

function shuffleCopy(list) {
  const arr = [...(list || [])];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'тест';
}
