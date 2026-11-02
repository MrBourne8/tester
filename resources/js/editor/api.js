async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || 'Ошибка API';
      throw new Error(message);
    }
    return payload;
  }

  if (!response.ok) {
    throw new Error('Ошибка запроса: ' + response.status);
  }

  return response;
}

export async function listQuizzes() {
  const payload = await parseResponse(await fetch('/api/v1/quizzes', {
    headers: { Accept: 'application/json' },
  }));
  return payload.data;
}

export async function getQuiz(id) {
  const payload = await parseResponse(await fetch(`/api/v1/quizzes/${id}`, {
    headers: { Accept: 'application/json' },
  }));
  return payload.data;
}

export async function createQuiz(content) {
  const payload = await parseResponse(await fetch('/api/v1/quizzes', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }));
  return payload.data;
}

export async function updateQuiz(id, content) {
  const payload = await parseResponse(await fetch(`/api/v1/quizzes/${id}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }));
  return payload.data;
}

export async function deleteQuiz(id) {
  await parseResponse(await fetch(`/api/v1/quizzes/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  }));
}

export async function duplicateQuiz(id) {
  const payload = await parseResponse(await fetch(`/api/v1/quizzes/${id}/duplicate`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  }));
  return payload.data;
}

export async function exportQuiz(id, title = 'quiz') {
  await downloadBinary(`/api/v1/quizzes/${id}/export`, `${title || 'quiz'}.quiz`);
}

export async function exportStandalone(id, title = 'quiz', platform = 'windows') {
  const response = await fetch(
    `/api/v1/quizzes/${id}/export-standalone?platform=${encodeURIComponent(platform)}`,
    { method: 'POST', headers: { Accept: 'application/octet-stream' } },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'Не удалось скачать файл');
  }
  const fallbackExt = platform === 'windows' ? '.exe' : platform === 'macos' ? '.zip' : '';
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition'))
    || `${title || 'quiz'}_${platform}${fallbackExt}`;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
  return {
    platforms: (response.headers.get('X-UniTest-Platforms') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    format: response.headers.get('X-UniTest-Export-Format') || '',
  };
}

function filenameFromDisposition(header) {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/"/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"/i.exec(header) || /filename\s*=\s*([^;]+)/i.exec(header);
  return plain?.[1]?.trim() || null;
}

export async function exportWeb(id, title = 'quiz') {
  return downloadBinary(
    `/api/v1/quizzes/${id}/export-web`,
    `${title || 'quiz'}_web.zip`,
  );
}

export async function exportPlatforms() {
  const payload = await parseResponse(await fetch('/api/v1/export/platforms', {
    headers: { Accept: 'application/json' },
  }));
  return payload.data;
}

async function downloadBinary(url, filename) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/octet-stream' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'Не удалось скачать файл');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filenameFromDisposition(response.headers.get('Content-Disposition')) || filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
  return {
    platforms: (response.headers.get('X-UniTest-Platforms') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    format: response.headers.get('X-UniTest-Export-Format') || '',
  };
}

export async function importQuiz(file) {
  const body = new FormData();
  body.append('file', file);
  const payload = await parseResponse(await fetch('/api/v1/quizzes/import', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body,
  }));
  return payload.data;
}

export async function createSession(quizId, settings = {}) {
  const payload = await parseResponse(await fetch('/api/v1/sessions', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ quiz_id: quizId, settings }),
  }));
  return payload.data;
}
