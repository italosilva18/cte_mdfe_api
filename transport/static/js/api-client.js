/**
 * API Client for Django Session Authentication
 * Handles CSRF tokens and session-based authentication
 */

class ApiClient {
    constructor() {
        this.baseURL = '';
        this.csrfToken = this.getCSRFToken();
    }

    /**
     * Get CSRF token from cookies or meta tag
     */
    getCSRFToken() {
        // Try to get from cookie first
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrftoken') {
                return value;
            }
        }
        
        // Try to get from meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            return metaTag.getAttribute('content');
        }
        
        // Try to get from form input
        const formInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
        if (formInput) {
            return formInput.value;
        }
        
        return null;
    }

    /**
     * Make authenticated API request
     */
    async request(method, url, data = null, options = {}) {
        const config = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers
            },
            credentials: 'same-origin', // Include session cookies
            ...options
        };

        // Add CSRF token for unsafe methods
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method)) {
            if (this.csrfToken) {
                config.headers['X-CSRFToken'] = this.csrfToken;
            }
        }

        // Add body for data
        if (data) {
            if (data instanceof FormData) {
                // Remove Content-Type to let browser set it with boundary
                delete config.headers['Content-Type'];
                config.body = data;
            } else {
                config.body = JSON.stringify(data);
            }
        }

        try {
            const response = await fetch(`${this.baseURL}${url}`, config);
            
            // Handle authentication errors
            if (response.status === 401) {
                this.handleAuthError();
                throw new Error('Authentication required');
            }
            
            // Handle forbidden errors
            if (response.status === 403) {
                throw new Error('Permission denied');
            }
            
            // Handle other errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    /**
     * Handle authentication errors
     */
    handleAuthError() {
        // Show message to user
        this.showMessage('Sua sessão expirou. Faça login novamente.', 'warning');
        
        // Redirect to login after a delay
        setTimeout(() => {
            window.location.href = '/login/';
        }, 2000);
    }

    /**
     * Show message to user
     */
    showMessage(message, type = 'info') {
        // Create message element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Add to page
        const container = document.querySelector('.container-fluid') || document.body;
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }

    // Convenience methods
    async get(url, options = {}) {
        const response = await this.request('GET', url, null, options);
        return response.json();
    }

    async post(url, data, options = {}) {
        const response = await this.request('POST', url, data, options);
        return response.json();
    }

    async put(url, data, options = {}) {
        const response = await this.request('PUT', url, data, options);
        return response.json();
    }

    async patch(url, data, options = {}) {
        const response = await this.request('PATCH', url, data, options);
        return response.json();
    }

    async delete(url, options = {}) {
        const response = await this.request('DELETE', url, null, options);
        return response.status === 204 ? null : response.json();
    }

    /**
     * Upload file with progress tracking
     */
    async uploadFile(url, formData, onProgress = null) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Set up progress tracking
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                });
            }
            
            // Set up completion handler
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else if (xhr.status === 401) {
                    this.handleAuthError();
                    reject(new Error('Authentication required'));
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });
            
            // Set headers
            xhr.open('POST', `${this.baseURL}${url}`);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            if (this.csrfToken) {
                xhr.setRequestHeader('X-CSRFToken', this.csrfToken);
            }
            
            // Send request
            xhr.send(formData);
        });
    }
}

// Create global instance
window.apiClient = new ApiClient();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiClient;
}