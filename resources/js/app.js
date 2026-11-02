import '../css/app.css';

async function loadHealth() {
  const output = document.getElementById('health-output');
  if (!output) {
    return;
  }

  try {
    const response = await fetch('/api/v1/health', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
    output.classList.toggle('is-ok', data.status === 'ok');
    output.classList.toggle('is-bad', data.status !== 'ok');
  } catch (error) {
    output.textContent = 'Не удалось получить /api/v1/health: ' + String(error);
    output.classList.add('is-bad');
  }
}

loadHealth();
