/**
 * auth.js
 * 100% self-contained helpers for JWT authentication on the front-end
 * - Login (TokenObtainPair)         /api/token/
 * - Refresh (TokenRefresh)          /api/token/refresh/
 * - User info (requer Auth)         /api/users/me/
 * --------------------------------------------------------------------------
 * Para usar: inclua <script src="{% static 'js/auth.js' %}"></script>
 * em todos os templates que PRECISAM de autenticação. Páginas públicas
 * (/, /login) também podem incluí-lo — o script se encarrega de ignorá-las.
 */

/* ===== CONSTANTES ====================================================== */
const AUTH_TOKEN_KEY   = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_DATA_KEY    = 'userData';

const API_ENDPOINTS = {
  LOGIN   : '/api/token/',
  REFRESH : '/api/token/refresh/',
  USER_ME : '/api/users/me/'
};

const PUBLIC_ROUTES = ['/', '/login', '/login/']; // não exigem token

/* ===== INIT ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  setupLogoutButtons();
});

/* ===== FLUXO PRINCIPAL ================================================= */
function checkAuthStatus() {
  const token   = getAuthToken();
  const path    = window.location.pathname;
  const isPublic = PUBLIC_ROUTES.includes(path);

  // Já logado e em rota pública → redireciona para dashboard
  if (isPublic && token) {
    window.location.href = '/dashboard/';
    return;
  }

  // Não logado e em rota privada → força login
  if (!isPublic && !token) {
    window.location.href = '/login/';
    return;
  }

  // Logado em rota privada → verifica expiração
  if (!isPublic && token) {
    validateTokenExpiration();
  }
}

/* ===== LOGIN / LOGOUT ================================================== */
function loginUser(username, password) {
  const btn = document.querySelector('#loginForm button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Entrando...';
  }
  hideLoginError();

  return fetch(API_ENDPOINTS.LOGIN, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ username, password })
  })
  .then(res => {
    if (!res.ok) {
      throw new Error(
        res.status === 401
          ? 'Credenciais inválidas. Verifique usuário e senha.'
          : 'Erro de conexão. Tente novamente.'
      );
    }
    return res.json();
  })
  .then(data => {
    localStorage.setItem(AUTH_TOKEN_KEY, data.access);
    if (data.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    return fetchUserInfo().then(() => {
      window.location.href = '/dashboard/';
      return true;
    });
  })
  .catch(err => {
    showLoginError(err.message);
    console.error('Login error:', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Entrar no Sistema';
    }
    return false;
  });
}

function logoutUser() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
  window.location.href = '/login/';
}

function setupLogoutButtons() {
  document.querySelectorAll('.logout-btn,[data-action="logout"]')
    .forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      logoutUser();
    }));
}

/* ===== USER INFO ======================================================= */
function fetchUserInfo() {
  return fetchWithAuth(API_ENDPOINTS.USER_ME)
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (data) localStorage.setItem(USER_DATA_KEY, JSON.stringify(data));
      return data;
    })
    .catch(err => {
      console.warn('Could not fetch user info:', err);
      return null;
    });
}

/* ===== HELPERS: TOKEN & LOCALSTORAGE =================================== */
function getAuthToken()  { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUserData()   {
  const d = localStorage.getItem(USER_DATA_KEY);
  return d ? JSON.parse(d) : null;
}
function getAuthHeaders() {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
}

/* ===== FETCH COM AUTO-REFRESH ========================================= */
function fetchWithAuth(url, options = {}) {
  const headers = { ...options.headers, ...getAuthHeaders() };

  return fetch(url, { ...options, headers })
    .then(res => {
      if (res.status !== 401) return res;                // ok ou outro erro

      // 401 → tenta refresh
      return refreshAuthToken().then(success => {
        if (!success) {
          logoutUser();
          return res;
        }
        const newHeaders = { ...options.headers, ...getAuthHeaders() };
        return fetch(url, { ...options, headers: newHeaders });
      });
    });
}

/* ===== REFRESH TOKEN =================================================== */
function refreshAuthToken() {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return Promise.resolve(false);

  return fetch(API_ENDPOINTS.REFRESH, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ refresh })
  })
  .then(res => (res.ok ? res.json() : Promise.reject()))
  .then(data => {
    localStorage.setItem(AUTH_TOKEN_KEY, data.access);
    if (data.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    return true;
  })
  .catch(err => {
    console.error('Error refreshing token:', err);
    return false;
  });
}

/* ===== EXPIRAÇÃO ======================================================= */
function validateTokenExpiration() {
  const token = getAuthToken();
  if (!token) return Promise.resolve(false);

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry  = payload.exp * 1000;
    if (expiry - Date.now() < 5 * 60 * 1000) { // < 5 min
      return refreshAuthToken();
    }
    return Promise.resolve(true);
  } catch (err) {
    console.error('Error parsing token:', err);
    return refreshAuthToken();
  }
}

/* ===== LOGIN FORM FEEDBACK ============================================ */
function showLoginError(msg) {
  const alert = document.getElementById('loginAlert');
  const text  = document.getElementById('loginAlertMessage');
  if (alert && text) {
    text.textContent = msg;
    alert.classList.remove('d-none');
  }
}
function hideLoginError() {
  const alert = document.getElementById('loginAlert');
  if (alert) alert.classList.add('d-none');
}

/* ===== EXPORTA PARA OUTROS SCRIPTS ==================================== */
window.Auth = {
  login        : loginUser,
  logout       : logoutUser,
  getToken     : getAuthToken,
  getHeaders   : getAuthHeaders,
  fetchWithAuth: fetchWithAuth,
  getUserData  : getUserData
};
