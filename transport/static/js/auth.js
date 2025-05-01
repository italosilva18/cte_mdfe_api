/**
 * auth.js
 * Autenticação baseada em sessão do Django para o frontend
 * Compatível com o sistema de login e logout do Django
 * --------------------------------------------------------------------------
 * Inclua <script src="{% static 'js/auth.js' %}"></script> em todos os templates
 * que precisam de autenticação.
 */

/* ===== CONSTANTES ====================================================== */
const PUBLIC_ROUTES = ['/', '/login', '/login/', '/admin/', '/admin/login/'];

/* ===== INIT ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Adiciona logs para debug
  console.log('Auth.js carregado (modo sessão Django)');
  console.log('Rota atual:', window.location.pathname);
  
  checkAuthStatus();
  setupLoginForm();
  setupLogoutButtons();
  
  // Verificar se há problemas de login anteriores na URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('login_error')) {
    showLoginError(decodeURIComponent(urlParams.get('login_error')));
  }
});

/* ===== FLUXO PRINCIPAL ================================================= */
function checkAuthStatus() {
  const path = window.location.pathname;
  const isAuthenticated = document.body.classList.contains('authenticated');
  const isPublic = PUBLIC_ROUTES.some(route => path === route || path.startsWith(route));
  
  console.log('Verificando status de autenticação:', { 
    isAuthenticated, 
    path, 
    isPublic 
  });

  // Já logado e em rota pública → redireciona para dashboard
  if (isPublic && isAuthenticated && path !== '/') {
    console.log('Usuário já autenticado em rota pública, redirecionando para /dashboard/');
    window.location.href = '/dashboard/';
    return;
  }

  // Não há necessidade de redirecionar outros casos, pois o Django
  // já controla o acesso às rotas protegidas via login_required decorator
}

/* ===== LOGIN FORM SETUP ================================================ */
function setupLoginForm() {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) {
    console.warn('Formulário de login não encontrado ou já está usando o form nativo do Django');
    return;
  }
  
  console.log('Formulário de login encontrado, configurando para usar autenticação Django');
  
  // Verificar se o formulário já tem um listener para evitar duplicação
  if (loginForm.getAttribute('data-auth-js-initialized') === 'true') {
    console.log('Formulário já inicializado, pulando configuração');
    return;
  }
  
  loginForm.setAttribute('data-auth-js-initialized', 'true');
  
  // Converter o formulário para enviar diretamente para o Django
  loginForm.setAttribute('method', 'post');
  loginForm.setAttribute('action', '/login/');
  
  // Adicionar CSRF token se não existir
  if (!loginForm.querySelector('input[name="csrfmiddlewaretoken"]')) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      const csrfInput = document.createElement('input');
      csrfInput.type = 'hidden';
      csrfInput.name = 'csrfmiddlewaretoken';
      csrfInput.value = csrfToken;
      loginForm.appendChild(csrfInput);
    }
  }
  
  // Adicionar campo 'next' se não existir
  if (!loginForm.querySelector('input[name="next"]')) {
    const nextParam = new URLSearchParams(window.location.search).get('next') || '/dashboard/';
    const nextInput = document.createElement('input');
    nextInput.type = 'hidden';
    nextInput.name = 'next';
    nextInput.value = nextParam;
    loginForm.appendChild(nextInput);
  }
  
  // Verificar se o formulário tem os elementos necessários
  console.log('Elementos do formulário:', {
    username: !!document.getElementById('username'),
    password: !!document.getElementById('password'),
    submitButton: !!loginForm.querySelector('button[type="submit"]'),
    alertBox: !!document.getElementById('loginAlert')
  });
  
  // Adicionar alert box se não existir
  if (!document.getElementById('loginAlert')) {
    console.log('Alert box não encontrada, criando...');
    const alertBox = document.createElement('div');
    alertBox.id = 'loginAlert';
    alertBox.className = 'alert alert-danger d-none mt-3';
    alertBox.role = 'alert';
    
    const message = document.createElement('span');
    message.id = 'loginAlertMessage';
    
    alertBox.appendChild(message);
    loginForm.appendChild(alertBox);
  }
}

/* ===== LOGIN / LOGOUT ================================================== */
function setupLogoutButtons() {
  const logoutButtons = document.querySelectorAll('.logout-btn,[data-action="logout"]');
  
  if (logoutButtons.length > 0) {
    console.log('Configurando botões de logout:', logoutButtons.length);
  }
  
  logoutButtons.forEach(btn => btn.addEventListener('click', function(e) {
    e.preventDefault();
    logoutUser();
  }));
}

function logoutUser() {
  console.log('Encerrando sessão do usuário');
  
  // Tentar fazer logout via Django (requer POST e CSRF)
  const csrfToken = getCsrfToken();
  
  if (csrfToken) {
    console.log('Enviando requisição de logout para o Django');
    
    // Criar um formulário para enviar o logout via POST
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/logout/';
    form.style.display = 'none';
    
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'csrfmiddlewaretoken';
    csrfInput.value = csrfToken;
    
    form.appendChild(csrfInput);
    document.body.appendChild(form);
    form.submit();
  } else {
    // Fallback se não encontrar o token CSRF
    console.warn('CSRF Token não encontrado, redirecionando diretamente para logout');
    window.location.href = '/logout/';
  }
}

/* ===== LOGIN FORM FEEDBACK ============================================= */
function showLoginError(msg) {
  console.error('Erro de login:', msg);
  
  const alert = document.getElementById('loginAlert');
  const text = document.getElementById('loginAlertMessage');
  
  if (alert && text) {
    text.textContent = msg;
    alert.classList.remove('d-none');
  } else {
    // Fallback se os elementos não existirem
    alert(msg);
  }
}

function hideLoginError() {
  const alert = document.getElementById('loginAlert');
  if (alert) alert.classList.add('d-none');
}

/* ===== HELPERS: CSRF TOKEN ============================================= */
function getCsrfToken() {
  // Tenta obter o token CSRF do cookie
  const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
  
  if (csrfCookie) {
    return csrfCookie.split('=')[1].trim();
  }
  
  // Ou do elemento meta na página
  const csrfElement = document.querySelector('meta[name="csrf-token"]') || 
                      document.querySelector('input[name="csrfmiddlewaretoken"]');
  
  return csrfElement ? csrfElement.getAttribute('content') || csrfElement.value : null;
}

/* ===== FETCH COM CSRF ================================================= */
function fetchWithCsrf(url, options = {}) {
  const headers = { 
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }
  
  return fetch(url, { 
    ...options, 
    headers,
    credentials: 'same-origin' // Importante para enviar cookies
  });
}

/* ===== TESTES DE CONECTIVIDADE ======================================== */
function testConnectivity() {
  // Testar a conectividade com os endpoints principais
  const endpoints = [
    { url: '/login/', method: 'HEAD' },
    { url: '/api/users/me/', method: 'GET' }
  ];
  
  console.log('Iniciando testes de conectividade...');
  
  const results = {};
  
  // Testar cada endpoint
  const tests = endpoints.map(endpoint => {
    return fetchWithCsrf(endpoint.url, { method: endpoint.method })
      .then(res => {
        results[endpoint.url] = {
          status: res.status,
          ok: res.ok,
          statusText: res.statusText,
          headers: Array.from(res.headers.entries())
        };
        return res;
      })
      .catch(err => {
        results[endpoint.url] = {
          error: err.message,
          stack: err.stack
        };
        return null;
      });
  });
  
  return Promise.all(tests)
    .then(() => {
      console.log('Resultados dos testes de conectividade:', results);
      return results;
    });
}

/* ===== EXPORTA PARA OUTROS SCRIPTS ==================================== */
window.Auth = {
  isAuthenticated: function() {
    return document.body.classList.contains('authenticated');
  },
  getUserData: function() {
    // Obter dados do usuário via API (se necessário)
    return fetchWithCsrf('/api/users/me/')
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);
  },
  logout: logoutUser,
  getHeaders: function() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }
    
    return headers;
  },
  fetchWithCsrf: fetchWithCsrf,
  testConnectivity: testConnectivity
};

// Verificação de configuração inicial
console.log('Auth.js inicializado:', {
  isAuthenticated: document.body.classList.contains('authenticated'),
  rotaPublica: PUBLIC_ROUTES.includes(window.location.pathname)
});