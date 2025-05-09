/**
 * auth.js
 * v1.2.0 - Helpers para autenticação JWT, feedback visual e redirecionamento.
 */

/* ===== CONSTANTES ====================================================== */
const AUTH_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_DATA_KEY = 'userData'; // Para armazenar dados básicos do usuário

const API_ENDPOINTS = {
  LOGIN: '/api/token/', // Endpoint do Simple JWT para obter o token
  REFRESH: '/api/token/refresh/', // Endpoint do Simple JWT para refresh
  USER_ME: '/api/users/me/' // Endpoint da sua API para buscar dados do usuário logado
};

// Rotas que não exigem login
const PUBLIC_ROUTES = ['/', '/login', '/login/']; // Inclui a raiz e a página de login

// Variável para controlar se um refresh já está em andamento
let isRefreshing = false;
// Fila para requisições que falharam com 401 enquanto o refresh ocorria
let failedQueue = [];

const processFailedQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};


/* ===== INIT ============================================================ */
// Verifica o status da autenticação quando o DOM é carregado
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus(); // Verifica se precisa redirecionar
  setupLogoutButtons(); // Configura botões de logout genéricos
});

/* ===== FLUXO PRINCIPAL DE VERIFICAÇÃO E REDIRECIONAMENTO ===== */
function checkAuthStatus() {
  const token = getAuthToken();
  const currentPath = window.location.pathname;
  const isPublicRoute = PUBLIC_ROUTES.includes(currentPath);

  console.log(`Auth Check: Path: ${currentPath}, Token: ${token ? 'Exists' : 'None'}, IsPublic: ${isPublicRoute}`);

  if (isPublicRoute && token) {
    // Usuário está em rota pública (ex: /login/) mas TEM token.
    // Tentar buscar dados do usuário para confirmar validade do token antes de redirecionar.
    console.log("Token exists on public route. Verifying and fetching user info...");
    fetchUserInfo().then(userData => {
        if (userData) {
            console.log("User data fetched, redirecting to /dashboard/");
            window.location.href = '/dashboard/';
        } else {
            // Token pode ser inválido ou expirado, limpar e deixar na página pública
            console.log("Failed to fetch user data with existing token. Clearing tokens.");
            clearAuthData();
        }
    }).catch(() => {
        console.log("Error fetching user info with existing token. Clearing tokens.");
        clearAuthData();
    });
    return;
  }

  if (!isPublicRoute && !token) {
    // Usuário está em rota privada (ex: /dashboard/) mas NÃO TEM token.
    console.log("No token on private route. Redirecting to /login/");
    clearAuthData(); // Garante que qualquer resquício seja limpo
    window.location.href = '/login/';
    return;
  }

  if (!isPublicRoute && token) {
    // Usuário em rota privada com token. Validar o token e/ou buscar dados do usuário.
    // fetchUserInfo é chamado por muitas páginas, então a validação já ocorre lá.
    console.log("Token exists on private route. User should be authenticated.");
  }
}

/* ===== LOGIN / LOGOUT ================================================== */
function login(username, password) {
  hideLoginError(); // Garante que erros anteriores sumam

  return fetch(API_ENDPOINTS.LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  .then(async res => {
    if (!res.ok) {
        let errorMsg = 'Erro de conexão. Tente novamente.';
        if (res.status === 401 || res.status === 400) { // DRF Simple JWT retorna 400 ou 401 para credenciais inválidas
            try {
                const errorData = await res.json();
                errorMsg = errorData.detail || 'Credenciais inválidas. Verifique usuário e senha.';
                // Se houver erros de campo específicos (menos comum para /token/)
                if (typeof errorData === 'object' && !errorData.detail) {
                    const fieldErrors = Object.entries(errorData)
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                        .join('; ');
                    if (fieldErrors) errorMsg = fieldErrors;
                }
            } catch (e) {
                 errorMsg = 'Credenciais inválidas. Verifique usuário e senha.';
            }
        }
        throw new Error(errorMsg); // Lança o erro para o .catch()
    }
    return res.json();
  })
  .then(data => {
    localStorage.setItem(AUTH_TOKEN_KEY, data.access);
    if (data.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);

    // Busca dados do usuário APÓS salvar os tokens
    return fetchUserInfo().then((userData) => {
        if (userData) { // Verifica se os dados do usuário foram realmente obtidos
            window.location.href = '/dashboard/'; // Redireciona após sucesso
            return true; // Indica sucesso no login
        } else {
            // Se fetchUserInfo falhar (ex: usuário inativo, token recém-obtido é inválido por algum motivo)
            clearAuthData(); // Limpa tokens
            showLoginError("Falha ao obter dados do usuário após login.");
            return false; // Indica falha
        }
    });
  })
  .catch(err => {
    showLoginError(err.message); // Exibe a mensagem de erro processada
    console.error('Login error:', err);
    return false; // Indica falha no login
  });
}

function logout() {
  console.log("Efetuando logout...");
  clearAuthData();
  window.location.href = '/login/';
}

function clearAuthData() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
}

function setupLogoutButtons() {
  document.body.addEventListener('click', function(event) {
      const logoutButton = event.target.closest('.logout-btn, [data-action="logout"], #logoutBtn');
      if (logoutButton) {
          event.preventDefault();
          logout();
      }
  });
}

/* ===== USER INFO ======================================================= */
function fetchUserInfo() {
  console.log("Fetching user info...");
  return fetchWithAuth(API_ENDPOINTS.USER_ME) // fetchWithAuth já lida com refresh se necessário
    .then(res => {
        if (!res.ok) {
            console.error(`Erro ${res.status} ao buscar dados do usuário.`);
            // Se fetchWithAuth falhou mesmo após tentar refresh, o token de refresh pode ser inválido.
            // Nesse caso, o próprio fetchWithAuth (via refreshAuthToken) já deveria ter deslogado.
            // Mas, como uma segurança adicional:
            if (res.status === 401) {
                console.log("Falha ao buscar dados do usuário (401), limpando autenticação.");
                logout(); // Desloga se o token for inválido e não puder ser atualizado
            }
            return null; // Retorna null em caso de erro para que a chamada possa tratar
        }
        return res.json();
    })
    .then(data => {
      if (data) {
          console.log("User data received:", data);
          localStorage.setItem(USER_DATA_KEY, JSON.stringify(data));
      } else {
           localStorage.removeItem(USER_DATA_KEY);
      }
      return data;
    })
    .catch(err => {
      console.error('Falha crítica ao buscar dados do usuário:', err);
      // Se chegou aqui, fetchWithAuth já tentou refresh e falhou, ou houve outro erro de rede.
      // O logout já deve ter sido chamado por refreshAuthToken em caso de falha no refresh.
      localStorage.removeItem(USER_DATA_KEY);
      return null;
    });
}

/* ===== HELPERS: TOKEN & LOCALSTORAGE =================================== */
function getAuthToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getRefreshToken() { return localStorage.getItem(REFRESH_TOKEN_KEY); }

function getUserData() {
  const data = localStorage.getItem(USER_DATA_KEY);
  try {
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Erro ao parsear dados do usuário do localStorage", e);
    return null;
  }
}

/* ===== FETCH COM AUTO-REFRESH ========================================= */
function fetchWithAuth(url, options = {}) {
  const makeRequest = (token) => {
      const headers = { ...options.headers };

      if (token) {
          headers['Authorization'] = `Bearer ${token}`;
      }

      if (options.body instanceof FormData) {
          delete headers['Content-Type'];
      } else if (typeof options.body === 'object' && options.body !== null && !(options.body instanceof FormData)) {
          // Se for um objeto (não FormData), assume JSON e stringify
          options.body = JSON.stringify(options.body);
          if (!headers['Content-Type']) { // Define apenas se não foi definido externamente
            headers['Content-Type'] = 'application/json';
          }
      } else if (typeof options.body === 'string' && !headers['Content-Type']){
           // Se já é uma string JSON e não tem Content-Type, define.
           try { JSON.parse(options.body); headers['Content-Type'] = 'application/json'; }
           catch (e) { /* não é JSON, deixa como está */ }
      }


      return fetch(url, { ...options, headers });
  };

  return makeRequest(getAuthToken()).then(response => {
      if (response.status !== 401) {
          return response;
      }

      if (isRefreshing) {
          return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
          })
          .then(refreshedToken => makeRequest(refreshedToken))
           .catch(err => {
                console.error("Requisição falhou mesmo após aguardar refresh (fila):", err);
                throw err;
           });
      }

      isRefreshing = true;
      return new Promise((resolve, reject) => {
          refreshAuthToken()
              .then(newAccessToken => {
                  processFailedQueue(null, newAccessToken);
                  resolve(makeRequest(newAccessToken));
              })
              .catch(refreshError => {
                  console.error("Falha no refresh do token (fetchWithAuth):", refreshError);
                  processFailedQueue(refreshError, null);
                  // refreshAuthToken já chama logout() em caso de falha de refresh
                  reject(refreshError);
              })
              .finally(() => {
                  isRefreshing = false;
              });
      });
  });
}


/* ===== REFRESH TOKEN =================================================== */
function refreshAuthToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    console.warn("Nenhum refresh token encontrado. Não é possível atualizar.");
    logout(); // Se não há refresh token, desloga.
    return Promise.reject("No refresh token");
  }

  console.log("Tentando atualizar token de acesso...");
  return fetch(API_ENDPOINTS.REFRESH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken })
  })
  .then(res => {
    if (!res.ok) {
        console.error(`Erro ${res.status} ao atualizar token. Refresh token pode estar inválido ou expirado.`);
        logout(); // Desloga se o refresh token falhar
        throw new Error("Refresh token inválido ou expirado.");
    }
    return res.json();
  })
  .then(data => {
    if (!data.access) {
         throw new Error("Resposta de refresh não contém novo access token.");
    }
    console.log("Token de acesso atualizado com sucesso.");
    localStorage.setItem(AUTH_TOKEN_KEY, data.access);
    if (data.refresh) { // Alguns backends retornam um novo refresh token
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    }
    return data.access;
  }).catch(error => {
      console.error("Erro durante o refreshAuthToken:", error.message);
      // O logout já foi chamado se a requisição falhou com !res.ok
      // Se o erro foi outro (ex: 'Failed to fetch'), desloga também.
      if (!error.message.includes("Refresh token inválido")) {
          logout();
      }
      throw error; // Re-lança o erro para a promise original
  });
}


/* ===== LOGIN FORM FEEDBACK ============================================ */
function showLoginError(msg) {
  const alertEl = document.getElementById('loginAlert');
  const textEl = document.getElementById('loginAlertMessage');
  if (alertEl && textEl) {
    textEl.textContent = msg || "Ocorreu um erro inesperado.";
    alertEl.classList.remove('d-none');
  } else {
      alert(msg || "Ocorreu um erro inesperado."); // Fallback
  }
}
function hideLoginError() {
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) alertEl.classList.add('d-none');
}

/* ===== EXPORTA PARA OUTROS SCRIPTS ==================================== */
window.Auth = {
  login: login, // Note que 'loginUser' foi renomeado para 'login' para uso externo
  logout: logout,
  getToken: getAuthToken,
  fetchWithAuth: fetchWithAuth,
  getUserData: getUserData,
  // Funções de feedback de login podem ser chamadas pelo JS do login.html
  showLoginError: showLoginError,
  hideLoginError: hideLoginError,
  checkAuthStatus: checkAuthStatus // Expor para verificações manuais se necessário
};

console.log("auth.js carregado e configurado (v1.2.0).");