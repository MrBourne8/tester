/**
 * Ресурсы теста: dataBase64 в JSON (БД / автономный embed)
 * или path в ZIP-пакете .quiz.
 */

/**
 * @param {object|null|undefined} resource
 * @returns {string|null}
 */
export function resourceSrc(resource) {
  if (!resource || typeof resource !== 'object') return null;
  if (typeof resource.dataUrl === 'string' && resource.dataUrl.startsWith('data:')) {
    return resource.dataUrl;
  }
  if (typeof resource.dataBase64 === 'string' && resource.dataBase64 !== '') {
    const mime = typeof resource.mime === 'string' && resource.mime !== ''
      ? resource.mime
      : 'application/octet-stream';
    return `data:${mime};base64,${resource.dataBase64}`;
  }
  return null;
}

/**
 * @param {object} quiz
 * @param {string|null|undefined} resourceId
 * @returns {object|null}
 */
export function findResource(quiz, resourceId) {
  if (!resourceId || !quiz || !Array.isArray(quiz.resources)) return null;
  return quiz.resources.find((r) => r && r.id === resourceId) || null;
}

/**
 * @param {object} quiz
 * @param {string|null|undefined} resourceId
 * @returns {string|null}
 */
export function resolveResourceSrc(quiz, resourceId) {
  return resourceSrc(findResource(quiz, resourceId));
}

/**
 * @param {File} file
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<{ id: string, path: string, mime: string, dataBase64: string, name: string }>}
 */
export async function fileToResource(file, options = {}) {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Файл слишком большой (лимит ${Math.round(maxBytes / 1024 / 1024)} МБ)`);
  }
  const mime = file.type || 'application/octet-stream';
  if (!mime.startsWith('image/')) {
    throw new Error('Поддерживаются только изображения');
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const dataBase64 = btoa(binary);
  const id = `res_${Math.random().toString(36).slice(2, 10)}`;
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return {
    id,
    path: `resources/images/${id}.${ext}`,
    mime,
    dataBase64,
    name: file.name,
  };
}
