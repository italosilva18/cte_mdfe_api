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
    // Handle sidebar toggle for mobile
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });
        
        // Close sidebar when clicking outside (on mobile)
        document.addEventListener('click', function(e) {
            if (window.innerWidth < 992 && 
                !e.target.closest('.sidebar') && 
                !e.target.closest('.menu-toggle')) {
                sidebar.classList.remove('active');
            }
        });
    }
    
    // Highlight active menu item
    highlightActiveMenu();
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
    
    // Any other global event listeners
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
}

/**
 * Highlight active menu item based on current URL
 */
function highlightActiveMenu() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        // Check if link href matches current path
        if (href && (href === currentPath || 
                    (href !== '/' && currentPath.startsWith(href)))) {
            link.classList.add('active');
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
    
    // Apply mask
    return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
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
    <div id="${toastID}" class="toast ${typeClasses[type]}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
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
 * @param {string} tableId - ID of table to export
 * @param {string} filename - Filename for CSV
 */
function exportTableToCSV(tableId, filename = 'export.csv') {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`Table with ID "${tableId}" not found`);
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
            
            // Add quotes around the value
            rowData.push(`"${text}"`);
        });
        
        // Add row to CSV data
        csvData.push(rowData.join(','));
    });
    
    // Join all rows with newlines
    const csvString = csvData.join('\n');
    
    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    
    // Add to document, click and remove
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
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