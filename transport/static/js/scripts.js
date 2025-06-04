/**
 * script.js
 * Global utility functions and common functionality
 */

/**
 * Initializes common functionality when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI components
    initUIComponents();
    
    // Set up global event listeners
    setupGlobalEventListeners();
    
    // Check and handle theme preference
    handleThemePreference();
    
    // Initialize tooltips and popovers if Bootstrap is available
    initializeBootstrapComponents();
});

/**
 * Initialize UI components
 */
function initUIComponents() {
    // Sidebar toggle is now handled in base.html
    // Removed to avoid conflicts
    
    // Highlight active menu item
    highlightActiveMenu();
    
    // Implement custom input formatting if needed
    setupInputFormatting();
}

/**
 * Set up global event listeners
 */
function setupGlobalEventListeners() {
    // Setup logout button
    const logoutLink = document.querySelector('a[href="/logout/"]');
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            Auth.logout();
        });
    }
    
    // Setup refresh dashboard button
    const refreshDashboardBtn = document.getElementById('refreshDashboard');
    if (refreshDashboardBtn) {
        refreshDashboardBtn.addEventListener('click', function() {
            // Call dashboard refresh function if it exists
            if (typeof refreshData === 'function') {
                refreshData();
            } else {
                // Fallback to page reload if function doesn't exist
                window.location.reload();
            }
        });
    }
    
    // Add window resize handler for responsive adjustments
    window.addEventListener('resize', handleWindowResize);
    
    // Add print event listener
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
}

/**
 * Handle window resize events
 */
function handleWindowResize() {
    // Adjust UI for responsive behavior
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth < 992 && sidebar) {
        sidebar.classList.remove('active');
    }
    
    // Adjust any charts if they exist
    resizeCharts();
}

/**
 * Resize charts if they exist
 */
function resizeCharts() {
    // Check if Chart.js is available
    if (typeof Chart !== 'undefined') {
        // Get all chart instances and update them
        Object.values(Chart.instances).forEach(chart => {
            chart.resize();
        });
    }
}

/**
 * Handle before print event
 */
function handleBeforePrint() {
    // Expand all collapsed elements
    document.querySelectorAll('.collapse').forEach(item => {
        item.classList.add('show');
    });
    
    // Expand sidebar if collapsed
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.remove('collapsed');
    }
    
    // Add print-specific classes
    document.body.classList.add('printing');
}

/**
 * Handle after print event
 */
function handleAfterPrint() {
    // Restore collapsed state
    document.querySelectorAll('.collapse:not(.show)').forEach(item => {
        item.classList.remove('show');
    });
    
    // Remove print-specific classes
    document.body.classList.remove('printing');
}

/**
 * Handle theme preference (light/dark)
 */
function handleThemePreference() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    // Apply theme
    if (currentTheme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    
    // Set up theme toggle if it exists
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    
    if (themeToggle && themeIcon) {
        // Update icon based on current theme
        if (currentTheme === 'dark') {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
        
        // Theme toggle click handler
        themeToggle.addEventListener('click', function() {
            const currentTheme = localStorage.getItem('theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            // Save preference
            localStorage.setItem('theme', newTheme);
            
            // Apply theme
            document.body.classList.toggle('dark-theme');
            
            // Update icon
            if (newTheme === 'dark') {
                themeIcon.classList.remove('fa-moon');
                themeIcon.classList.add('fa-sun');
            } else {
                themeIcon.classList.remove('fa-sun');
                themeIcon.classList.add('fa-moon');
            }
        });
    }
}

/**
 * Initialize Bootstrap components if available
 */
function initializeBootstrapComponents() {
    // Initialize tooltips
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function(tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
    
    // Initialize popovers
    if (typeof bootstrap !== 'undefined' && bootstrap.Popover) {
        const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
        popoverTriggerList.map(function(popoverTriggerEl) {
            return new bootstrap.Popover(popoverTriggerEl);
        });
    }
    
    // Initialize toasts
    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        const toastElList = [].slice.call(document.querySelectorAll('.toast'));
        toastElList.map(function(toastEl) {
            return new bootstrap.Toast(toastEl);
        });
    }
}

/**
 * Setup input formatting for special fields
 */
function setupInputFormatting() {
    // Format CNPJ inputs
    document.querySelectorAll('input[data-format="cnpj"]').forEach(input => {
        input.addEventListener('input', function() {
            let value = this.value.replace(/\D/g, '');
            if (value.length > 14) value = value.slice(0, 14);
            
            if (value.length > 12) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            } else if (value.length > 8) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/, '$1.$2.$3/$4');
            } else if (value.length > 5) {
                value = value.replace(/^(\d{2})(\d{3})(\d+)$/, '$1.$2.$3');
            } else if (value.length > 2) {
                value = value.replace(/^(\d{2})(\d+)$/, '$1.$2');
            }
            
            this.value = value;
        });
    });
    
    // Format CPF inputs
    document.querySelectorAll('input[data-format="cpf"]').forEach(input => {
        input.addEventListener('input', function() {
            let value = this.value.replace(/\D/g, '');
            if (value.length > 11) value = value.slice(0, 11);
            
            if (value.length > 9) {
                value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
            } else if (value.length > 6) {
                value = value.replace(/^(\d{3})(\d{3})(\d+)$/, '$1.$2.$3');
            } else if (value.length > 3) {
                value = value.replace(/^(\d{3})(\d+)$/, '$1.$2');
            }
            
            this.value = value;
        });
    });
    
    // Format phone inputs
    document.querySelectorAll('input[data-format="phone"]').forEach(input => {
        input.addEventListener('input', function() {
            let value = this.value.replace(/\D/g, '');
            
            if (value.length > 11) {
                value = value.slice(0, 11);
            }
            
            if (value.length > 10) {
                value = value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
            } else if (value.length > 6) {
                value = value.replace(/^(\d{2})(\d{4})(\d+)$/, '($1) $2-$3');
            } else if (value.length > 2) {
                value = value.replace(/^(\d{2})(\d+)$/, '($1) $2');
            }
            
            this.value = value;
        });
    });
    
    // Format CEP inputs
    document.querySelectorAll('input[data-format="cep"]').forEach(input => {
        input.addEventListener('input', function() {
            let value = this.value.replace(/\D/g, '');
            if (value.length > 8) value = value.slice(0, 8);
            
            if (value.length > 5) {
                value = value.replace(/^(\d{5})(\d{3})$/, '$1-$2');
            }
            
            this.value = value;
        });
    });
    
    // Format currency inputs
    document.querySelectorAll('input[data-format="currency"]').forEach(input => {
        input.addEventListener('focus', function() {
            // Remove formatting when focused
            let value = this.value.replace(/\D/g, '');
            if (value) {
                this.value = (parseInt(value) / 100).toFixed(2);
            } else {
                this.value = '';
            }
        });
        
        input.addEventListener('blur', function() {
            // Apply formatting when blurred
            let value = parseFloat(this.value.replace(/,/g, '.') || 0).toFixed(2);
            this.value = formatCurrency(value);
        });
    });
}

/**
 * Highlight active menu item based on current URL
 */
function highlightActiveMenu() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        // Check if link href matches current path or is a parent path
        if (href && (href === currentPath || 
                    (href !== '/' && currentPath.startsWith(href)))) {
            link.classList.add('active');
            
            // Also highlight parent menu items if in dropdown
            const parentDropdown = link.closest('.nav-item.dropdown');
            if (parentDropdown) {
                parentDropdown.querySelector('.nav-link').classList.add('active');
            }
        } else {
            link.classList.remove('active');
        }
    });
}

/**
 * Format currency value
 * @param {number} value - Value to format
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Format date
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return '--';
        }
        
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Format date and time
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date and time
 */
function formatDateTime(date) {
    if (!date) return '--';
    
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return '--';
        }
        
        return date.toLocaleString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Format CNPJ with mask
 * @param {string} cnpj - CNPJ to format
 * @returns {string} - Formatted CNPJ
 */
function formatCNPJ(cnpj) {
    if (!cnpj) return '--';
    
    // Remove non-digits
    cnpj = cnpj.replace(/\D/g, '');
    
    if (cnpj.length !== 14) {
        return cnpj; // Return as is if not complete
    }
    
    // Apply mask
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Format CPF with mask
 * @param {string} cpf - CPF to format
 * @returns {string} - Formatted CPF
 */
function formatCPF(cpf) {
    if (!cpf) return '--';
    
    // Remove non-digits
    cpf = cpf.replace(/\D/g, '');
    
    if (cpf.length !== 11) {
        return cpf; // Return as is if not complete
    }
    
    // Apply mask
    return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/**
 * Format CNPJ or CPF based on length
 * @param {string} document - Document number
 * @returns {string} - Formatted document
 */
function formatDocument(document) {
    if (!document) return '--';
    
    // Remove non-digits
    document = document.replace(/\D/g, '');
    
    if (document.length === 11) {
        return formatCPF(document);
    } else if (document.length === 14) {
        return formatCNPJ(document);
    }
    
    return document;
}

/**
 * Show notification toast
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'success', duration = 5000) {
    // Define type colors
    const typeClasses = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-dark'
    };
    
    // Get or create toast container
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1080';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastID = 'toast-' + Date.now();
    const toastHTML = `
    <div id="${toastID}" class="toast ${typeClasses[type] || typeClasses.info}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close ${type === 'success' || type === 'error' ? 'btn-close-white' : ''} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>
    `;
    
    // Add toast to container
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    // Initialize and show toast
    const toastElement = document.getElementById(toastID);
    const toast = new bootstrap.Toast(toastElement, {
        delay: duration
    });
    
    toast.show();
    
    // Remove toast element when hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        this.remove();
        
        // Remove container if empty
        if (toastContainer.children.length === 0) {
            toastContainer.remove();
        }
    });
}

/**
 * Export table data to CSV
 * @param {string|Element} tableSelector - Table ID or Element to export
 * @param {string} filename - Filename for CSV
 */
function exportTableToCSV(tableSelector, filename = 'export.csv') {
    // Get table element
    const table = typeof tableSelector === 'string' 
        ? document.getElementById(tableSelector) 
        : tableSelector;
    
    if (!table) {
        console.error(`Table not found: ${tableSelector}`);
        return;
    }
    
    // Get all rows
    const rows = table.querySelectorAll('tr');
    
    // Array to store CSV data
    const csvData = [];
    
    // Process each row
    rows.forEach(row => {
        const rowData = [];
        
        // Process cells (th or td)
        const cells = row.querySelectorAll('th, td');
        
        cells.forEach(cell => {
            // Get text content, replace quotes and new lines
            let text = cell.textContent.trim().replace(/"/g, '""');
            text = text.replace(/\n/g, ' ');
            
            // Add quotes around the value
            rowData.push(`"${text}"`);
        });
        
        // Add row to CSV data
        csvData.push(rowData.join(','));
    });
    
    // Join all rows with newlines
    const csvString = csvData.join('\n');
    
    // Create download link
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename || 'export.csv';
    downloadLink.style.display = 'none';
    
    // Add to document, click and remove
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

/**
 * Format number with thousands separator
 * @param {number} number - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted number
 */
function formatNumber(number, decimals = 2) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number || 0);
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise} - Promise resolving to boolean (success or failure)
 */
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        // Modern clipboard API approach
        return navigator.clipboard.writeText(text)
            .then(() => {
                showNotification('Copiado para a área de transferência!', 'success', 2000);
                return true;
            })
            .catch(err => {
                console.error('Erro ao copiar para a área de transferência:', err);
                showNotification('Erro ao copiar para a área de transferência', 'error');
                return false;
            });
    } else {
        // Fallback for older browsers
        try {
            // Create temporary element
            const textArea = document.createElement('textarea');
            textArea.value = text;
            
            // Set styles to make it invisible
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            
            // Select and copy
            textArea.focus();
            textArea.select();
            const result = document.execCommand('copy');
            
            // Clean up
            document.body.removeChild(textArea);
            
            // Show notification
            if (result) {
                showNotification('Copiado para a área de transferência!', 'success', 2000);
                return Promise.resolve(true);
            } else {
                showNotification('Erro ao copiar para a área de transferência', 'error');
                return Promise.resolve(false);
            }
        } catch (err) {
            console.error('Erro ao copiar para a área de transferência:', err);
            showNotification('Erro ao copiar para a área de transferência', 'error');
            return Promise.resolve(false);
        }
    }
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text with ellipsis
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Check if a value is empty (null, undefined, empty string, etc.)
 * @param {*} value - Value to check
 * @returns {boolean} - True if empty, false otherwise
 */
function isEmpty(value) {
    return value === null || value === undefined || value === '' || 
           (Array.isArray(value) && value.length === 0) || 
           (typeof value === 'object' && Object.keys(value).length === 0);
}

/**
 * Format file size with appropriate units
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size with units
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get first day of the month
 * @param {Date} date - Date object
 * @returns {Date} - First day of the month
 */
function getFirstDayOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get last day of the month
 * @param {Date} date - Date object
 * @returns {Date} - Last day of the month
 */
function getLastDayOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Get days between two dates
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @returns {number} - Number of days
 */
function getDaysBetween(start, end) {
    const oneDayMs = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((end - start) / oneDayMs));
}

/**
 * Check if email is valid
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

/**
 * Get age from birthdate
 * @param {string|Date} birthdate - Birthdate
 * @returns {number} - Age in years
 */
function getAge(birthdate) {
    const birth = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
}

/**
 * Generate a random string
 * @param {number} length - Length of the string
 * @returns {string} - Random string
 */
function randomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}