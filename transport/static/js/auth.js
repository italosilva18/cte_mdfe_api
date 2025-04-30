/**
 * auth.js
 * Functions for authentication and JWT token management
 */

// Constants
const AUTH_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_DATA_KEY = 'userData';

// API endpoints
const API_ENDPOINTS = {
    LOGIN: '/api/token/',
    REFRESH: '/api/token/refresh/',
    USER_INFO: '/api/users/me/'
};

/**
 * Initializes authentication checks when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    setupLogoutButtons();
});

/**
 * Checks current authentication status and redirects if necessary
 */
function checkAuthStatus() {
    const token = getAuthToken();
    const isLoginPage = window.location.pathname === '/login/' || 
                        window.location.pathname === '/login';
    
    // If on login page with valid token, redirect to dashboard
    if (isLoginPage && token) {
        window.location.href = '/dashboard/';
        return;
    }
    
    // If not on login page and no token, redirect to login
    if (!isLoginPage && !token) {
        window.location.href = '/login/';
        return;
    }
    
    // If has token but it's expired, try to refresh
    if (!isLoginPage && token) {
        // Optional: Validate token expiration and refresh if needed
        validateTokenExpiration();
    }
}

/**
 * Sets up logout functionality for all logout buttons
 */
function setupLogoutButtons() {
    const logoutButtons = document.querySelectorAll('.logout-btn, [data-action="logout"]');
    
    logoutButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            logoutUser();
        });
    });
}

/**
 * Attempts to log in a user with provided credentials
 * @param {string} username - The username
 * @param {string} password - The password
 * @returns {Promise} - Returns promise that resolves on successful login
 */
function loginUser(username, password) {
    // Show loading indicator if it exists
    const loginButton = document.querySelector('#loginForm button[type="submit"]');
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Entrando...';
    }
    
    // Reset any previous error
    hideLoginError();
    
    // Create request
    return fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: username,
            password: password
        })
    })
    .then(response => {
        // If login failed
        if (!response.ok) {
            throw new Error(response.status === 401 ? 
                'Credenciais inválidas. Verifique seu usuário e senha.' : 
                'Erro ao conectar ao servidor. Tente novamente.');
        }
        
        return response.json();
    })
    .then(data => {
        // Save tokens
        localStorage.setItem(AUTH_TOKEN_KEY, data.access);
        
        if (data.refresh) {
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
        }
        
        // Get user info if available
        return fetchUserInfo().then(() => {
            // Redirect to dashboard
            window.location.href = '/dashboard/';
            return true;
        });
    })
    .catch(error => {
        // Show error to user
        showLoginError(error.message);
        console.error('Login error:', error);
        
        // Reset button state
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Entrar no Sistema';
        }
        
        return false;
    });
}

/**
 * Fetches user information after login
 * @returns {Promise} - Returns promise with user data
 */
function fetchUserInfo() {
    return fetchWithAuth(API_ENDPOINTS.USER_INFO)
        .then(response => {
            if (!response.ok) {
                // If we can't get user info, it's not critical
                return null;
            }
            return response.json();
        })
        .then(userData => {
            if (userData) {
                localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
            }
            return userData;
        })
        .catch(error => {
            console.warn('Could not fetch user info:', error);
            return null;
        });
}

/**
 * Shows login error message
 * @param {string} message - Error message to display
 */
function showLoginError(message) {
    const errorAlert = document.getElementById('loginAlert');
    const errorMessage = document.getElementById('loginAlertMessage');
    
    if (errorAlert && errorMessage) {
        errorMessage.textContent = message;
        errorAlert.classList.remove('d-none');
    }
}

/**
 * Hides login error message
 */
function hideLoginError() {
    const errorAlert = document.getElementById('loginAlert');
    
    if (errorAlert) {
        errorAlert.classList.add('d-none');
    }
}

/**
 * Logs out the current user
 */
function logoutUser() {
    // Clear all auth data
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    
    // Redirect to login page
    window.location.href = '/login/';
}

/**
 * Gets the current authentication token
 * @returns {string|null} - The JWT token or null if not authenticated
 */
function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Gets the current user data
 * @returns {Object|null} - User data object or null if not available
 */
function getUserData() {
    const userData = localStorage.getItem(USER_DATA_KEY);
    return userData ? JSON.parse(userData) : null;
}

/**
 * Creates authorization header with JWT token
 * @returns {Object} - Headers object with Authorization
 */
function getAuthHeaders() {
    const token = getAuthToken();
    return token ? {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    } : {
        'Content-Type': 'application/json'
    };
}

/**
 * Performs a fetch request with authentication
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise} - Fetch promise
 */
function fetchWithAuth(url, options = {}) {
    // Add authorization header
    const headers = {
        ...options.headers,
        ...getAuthHeaders()
    };
    
    // Return fetch promise
    return fetch(url, {
        ...options,
        headers
    }).then(response => {
        // If unauthorized (401), try to refresh token
        if (response.status === 401) {
            return refreshAuthToken().then(success => {
                if (success) {
                    // Try request again with new token
                    const newHeaders = {
                        ...options.headers,
                        ...getAuthHeaders() // Get fresh headers with new token
                    };
                    
                    return fetch(url, {
                        ...options,
                        headers: newHeaders
                    });
                }
                
                // If refresh failed, logout
                logoutUser();
                return response;
            });
        }
        
        return response;
    });
}

/**
 * Attempts to refresh the authentication token
 * @returns {Promise<boolean>} - Promise resolving to success status
 */
function refreshAuthToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    
    if (!refreshToken) {
        console.warn('No refresh token available');
        return Promise.resolve(false);
    }
    
    return fetch(API_ENDPOINTS.REFRESH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            refresh: refreshToken
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }
        return response.json();
    })
    .then(data => {
        // Save new access token
        localStorage.setItem(AUTH_TOKEN_KEY, data.access);
        
        // Save new refresh token if provided
        if (data.refresh) {
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
        }
        
        return true;
    })
    .catch(error => {
        console.error('Error refreshing token:', error);
        return false;
    });
}

/**
 * Validates if current token is expired and refreshes if needed
 * @returns {Promise<boolean>} - Promise resolving to token validity
 */
function validateTokenExpiration() {
    const token = getAuthToken();
    
    if (!token) {
        return Promise.resolve(false);
    }
    
    try {
        // Parse token payload to check expiration
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiryTime = payload.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        
        // If token expires in less than 5 minutes, refresh it
        if (expiryTime - currentTime < 300000) {
            return refreshAuthToken();
        }
        
        return Promise.resolve(true);
    } catch (error) {
        console.error('Error parsing token:', error);
        return refreshAuthToken(); // Try refreshing on error
    }
}

// Export functions for use in other scripts
window.Auth = {
    login: loginUser,
    logout: logoutUser,
    getToken: getAuthToken,
    getHeaders: getAuthHeaders,
    fetchWithAuth: fetchWithAuth,
    getUserData: getUserData
};