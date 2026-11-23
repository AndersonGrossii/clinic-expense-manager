const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const submitBtn = document.getElementById('login-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

// Redirect straight to the app if an active session already exists
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) window.location.replace('/');
  } catch {
    // Ignore network hiccup on pre-check
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showError('Introduce tu correo y contraseña.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verificando…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || 'No se pudo iniciar sesión.');
      passwordInput.select();
      return;
    }
    window.location.replace('/');
  } catch {
    showError('Error de conexión con el servidor.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  }
});
