/**
 * auth.js
 * v1.1.0 - Helpers para autenticação JWT com auto-refresh e Content-Type dinâmico.
 */

/* ===== CONSTANTES ====================================================== */
const AUTH_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_DATA_KEY = 'userData';

const API_ENDPOINTS = {
  LOGIN: '/api/token/',
  REFRESH: '/api/token/refresh/',
  USER_ME: '/api/users/me/'
};

const PUBLIC_ROUTES = ['/', '/login', '/login/']; // Rotas que não exigem login

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
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  setupLogoutButtons(); // Configura botões de logout genéricos
});

/* ===== FLUXO PRINCIPAL ================================================= */
function checkAuthStatus() {
  const token = getAuthToken();
  const path = window.location.pathname;
  const isPublic = PUBLIC_ROUTES.includes(path);

  if (isPublic && token) {
    console.log("Usuário logado em rota pública, redirecionando para /dashboard/");
    window.location.href = '/dashboard/';
    return;
  }

  if (!isPublic && !token) {
    console.log("Usuário não logado em rota privada, redirecionando para /login/");
    window.location.href = '/login/';
    return;
  }

  if (!isPublic && token) {
    // Validação inicial ou periódica pode ser adicionada aqui se necessário
    console.log("Usuário logado em rota privada.");
    // validateTokenExpiration(); // Descomente se quiser validação proativa
  }
}

/* ===== LOGIN / LOGOUT ================================================== */
function loginUser(username, password) {
  const btn = document.querySelector('#loginForm button[type="submit"]');
  // (Feedback visual do botão já está sendo tratado no HTML/JS do login.html)
  hideLoginError(); // Garante que erros anteriores sumam

  return fetch(API_ENDPOINTS.LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // Login sempre usa JSON
    body: JSON.stringify({ username, password })
  })
  .then(async res => { // Usa async para poder usar await no res.json() em caso de erro
    if (!res.ok) {
        let errorMsg = 'Erro de conexão. Tente novamente.';
        if (res.status === 401) {
            try {
                const errorData = await res.json();
                errorMsg = errorData.detail || 'Credenciais inválidas. Verifique usuário e senha.';
            } catch (e) {
                 errorMsg = 'Credenciais inválidas. Verifique usuário e senha.';
            }
        }
        throw new Error(errorMsg);
    }
    return res.json();
  })
  .then(data => {
    localStorage.setItem(AUTH_TOKEN_KEY, data.access);
    if (data.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    // Busca dados do usuário APÓS salvar os tokens
    return fetchUserInfo().then(() => {
        window.location.href = '/dashboard/'; // Redireciona após sucesso
        return true; // Indica sucesso no login
    });
  })
  .catch(err => {
    showLoginError(err.message);
    console.error('Login error:', err);
    // (Feedback visual do botão já está sendo tratado no HTML/JS do login.html)
    return false; // Indica falha no login
  });
}

function logoutUser() {
  console.log("Efetuando logout...");
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
  window.location.href = '/login/'; // Redireciona para a página de login
}

function setupLogoutButtons() {
  // Adiciona listener a qualquer elemento com a classe 'logout-btn' ou data-action='logout'
  document.body.addEventListener('click', function(event) {
      if (event.target.matches('.logout-btn, [data-action="logout"]') || event.target.closest('.logout-btn, [data-action="logout"]')) {
          event.preventDefault();
          logoutUser();
      }
  });
   // Garante que o botão específico na sidebar também funcione
   const logoutSidebarBtn = document.getElementById('logoutBtn');
   if (logoutSidebarBtn && !logoutSidebarBtn.classList.contains('logout-btn') && !logoutSidebarBtn.hasAttribute('data-action')) {
        logoutSidebarBtn.addEventListener('click', function(e){
            e.preventDefault();
            logoutUser();
        });
   }
}

/* ===== USER INFO ======================================================= */
function fetchUserInfo() {
  // Usa fetchWithAuth para garantir que o token é válido/atualizado
  return fetchWithAuth(API_ENDPOINTS.USER_ME)
    .then(res => {
        if (!res.ok) {
            // Se falhar mesmo após refresh, pode indicar problema no refresh token
            console.error(`Erro ${res.status} ao buscar dados do usuário.`);
            // Decide se quer deslogar ou apenas retornar null
             // logoutUser(); // Descomente para deslogar se fetchUserInfo falhar
            return null;
        }
        return res.json();
    })
    .then(data => {
      if (data) {
          console.log("Dados do usuário recebidos:", data);
          localStorage.setItem(USER_DATA_KEY, JSON.stringify(data));
      } else {
           localStorage.removeItem(USER_DATA_KEY); // Limpa se não receber dados
      }
      return data;
    })
    .catch(err => {
      console.error('Falha crítica ao buscar dados do usuário:', err);
       localStorage.removeItem(USER_DATA_KEY);
      // logoutUser(); // Considerar deslogar em caso de falha crítica
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

function getAuthHeaders(contentType = 'application/json') {
    const token = getAuthToken();
    const headers = {};

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    // Define Content-Type apenas se não for FormData (que será tratado depois)
    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    return headers;
}

/* ===== FETCH COM AUTO-REFRESH ========================================= */
function fetchWithAuth(url, options = {}) {
  const makeRequest = (token) => {
      const headers = { ...options.headers }; // Começa com os headers passados

      // Adiciona token de autorização
      if (token) {
          headers['Authorization'] = `Bearer ${token}`;
      }

      // *** CORREÇÃO PRINCIPAL: Não definir Content-Type se for FormData ***
      if (options.body instanceof FormData) {
          // Se o body é FormData, REMOVE qualquer Content-Type explícito.
          // O navegador definirá 'multipart/form-data' com o boundary correto.
          delete headers['Content-Type'];
      } else {
          // Para outros tipos de body (ex: JSON), define se não foi passado.
          if (!headers['Content-Type'] && typeof options.body === 'string') { // Verifica se body é string (provavelmente JSON)
              headers['Content-Type'] = 'application/json';
          }
      }

      return fetch(url, { ...options, headers });
  };

  return makeRequest(getAuthToken()).then(response => {
      if (response.status !== 401) {
          return response; // Retorna a resposta se não for 401
      }

      // --- Tratamento do 401 (Token Expirado/Inválido) ---

      if (isRefreshing) {
          // Se um refresh já está em andamento, adiciona à fila
          return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
          })
          .then(refreshedToken => makeRequest(refreshedToken)) // Tenta novamente com o novo token
           .catch(err => {
                console.error("Requisição falhou mesmo após aguardar refresh:", err);
                throw err; // Re-throw para a chamada original
           });
      }

      // Inicia o processo de refresh
      isRefreshing = true;

      return new Promise((resolve, reject) => {
          refreshAuthToken()
              .then(newAccessToken => {
                  processFailedQueue(null, newAccessToken); // Processa fila com sucesso
                  resolve(makeRequest(newAccessToken)); // Tenta a requisição original novamente
              })
              .catch(refreshError => {
                  console.error("Falha no refresh do token:", refreshError);
                  processFailedQueue(refreshError, null); // Processa fila com erro
                  logoutUser(); // Desloga o usuário se o refresh falhar
                  reject(refreshError); // Rejeita a promise original
              })
              .finally(() => {
                  isRefreshing = false; // Marca que o refresh terminou
              });
      });
  });
}


/* ===== REFRESH TOKEN =================================================== */
function refreshAuthToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    console.log("Nenhum refresh token encontrado para atualizar.");
    return Promise.reject("No refresh token"); // Rejeita se não houver refresh token
  }

  console.log("Tentando atualizar token...");
  return fetch(API_ENDPOINTS.REFRESH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken })
  })
  .then(res => {
    if (!res.ok) {
        // Se o refresh falhar (ex: token inválido ou expirado), limpa tudo
        console.error(`Erro ${res.status} ao atualizar token.`);
         localStorage.removeItem(AUTH_TOKEN_KEY);
         localStorage.removeItem(REFRESH_TOKEN_KEY);
        throw new Error("Refresh token inválido ou expirado.");
    }
    return res.json();
  })
  .then(data => {
    if (!data.access) {
         throw new Error("Resposta de refresh não contém novo access token.");
    }
    console.log("Token atualizado com sucesso.");
    localStorage.setItem(AUTH_TOKEN_KEY, data.access);
    // Atualiza o refresh token SE um novo for retornado (opcional, depende do backend)
    if (data.refresh) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    }
    return data.access; // Retorna o novo access token
  });
  // O catch é tratado na chamada de fetchWithAuth
}


/* ===== EXPIRAÇÃO (Opcional - Validação Proativa) ====================== */
function isTokenExpired(token) {
    if (!token) return true;
    try {
        // Decodifica a parte do payload (sem verificar assinatura aqui)
        const payloadBase64 = token.split('.')[1];
        const decodedJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(decodedJson);

        // 'exp' está em segundos, Date.now() em milissegundos
        const expiryTime = payload.exp * 1000;
        const now = Date.now();

        // Verifica se expirou ou está prestes a expirar (ex: nos próximos 60 segundos)
        const buffer = 60 * 1000; // 60 segundos de buffer
        return expiryTime < (now - buffer);

    } catch (e) {
        console.error("Erro ao decodificar ou verificar token:", e);
        return true; // Assume expirado se houver erro
    }
}

// Função para validar proativamente (chamar periodicamente ou antes de ações importantes)
function validateTokenExpiration() {
  const token = getAuthToken();
  if (isTokenExpired(token)) {
      console.log("Token expirado ou perto de expirar, tentando refresh...");
      return refreshAuthToken().catch(err => {
          console.error("Falha ao atualizar token expirado:", err);
          logoutUser(); // Desloga se não conseguir atualizar
      });
  }
  return Promise.resolve(); // Token ainda é válido
}


/* ===== LOGIN FORM FEEDBACK ============================================ */
function showLoginError(msg) {
  const alert = document.getElementById('loginAlert');
  const text = document.getElementById('loginAlertMessage');
  if (alert && text) {
    text.textContent = msg || "Ocorreu um erro inesperado.";
    alert.classList.remove('d-none');
  } else {
      // Fallback se os elementos não existirem
      alert(msg || "Ocorreu um erro inesperado.");
  }
}
function hideLoginError() {
  const alert = document.getElementById('loginAlert');
  if (alert) alert.classList.add('d-none');
}

/* ===== EXPORTA PARA OUTROS SCRIPTS ==================================== */
// Disponibiliza as funções principais globalmente sob o namespace Auth
window.Auth = {
  login: loginUser,
  logout: logoutUser,
  getToken: getAuthToken,
  getHeaders: getAuthHeaders, // Pode ser útil para chamadas fora do fetchWithAuth
  fetchWithAuth: fetchWithAuth,
  getUserData: getUserData,
  isTokenExpired: isTokenExpired // Expõe para verificações manuais se necessário
};

console.log("auth.js carregado e configurado.");