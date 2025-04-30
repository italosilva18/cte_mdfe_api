/**
 * dashboard.js
 * Functions for the main dashboard panel
 */

// Global chart objects to allow destruction/updates
let faturamentoChart = null;
let topClientesChart = null;
let rotasChart = null;

// Dashboard data cache
let dashboardData = {};

/**
 * Initializes dashboard when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Load initial dashboard data
    loadDashboardData();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the dashboard
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="refreshData()"]');
    if (filterBtn) {
        // Replace inline handler with proper event listener
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            loadDashboardData();
        });
    }
    
    // Reset button
    const resetBtn = document.querySelector('button[onclick="document.getElementById(\'filterForm\').reset(); refreshData()"]');
    if (resetBtn) {
        // Replace inline handler with proper event listener
        resetBtn.removeAttribute('onclick');
        resetBtn.addEventListener('click', function() {
            document.getElementById('filterForm').reset();
            setDefaultDateRange();
            loadDashboardData();
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            Auth.logout();
        });
    }
}

/**
 * Sets default date range (last 30 days)
 */
function setDefaultDateRange() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Format dates for input fields (YYYY-MM-DD)
    document.getElementById('data_inicio').value = formatDateForInput(thirtyDaysAgo);
    document.getElementById('data_fim').value = formatDateForInput(today);
}

/**
 * Formats date for input fields
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date string (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Loads dashboard data from the API
 */
function loadDashboardData() {
    // Show loading indicator
    showLoading();
    
    // Get date filters
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    // Build API URL with query params
    let apiUrl = '/api/dashboard/';
    const queryParams = [];
    
    if (dataInicio) queryParams.push(`date_from=${dataInicio}`);
    if (dataFim) queryParams.push(`date_to=${dataFim}`);
    
    if (queryParams.length > 0) {
        apiUrl += '?' + queryParams.join('&');
    }
    
    // Fetch data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados do dashboard');
            }
            return response.json();
        })
        .then(data => {
            // Cache the data
            dashboardData = data;
            
            // Update all dashboard components
            updateDashboardCards();
            updateDashboardCharts();
            updateRecentEntries();
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading dashboard data:', error);
            showError('Não foi possível carregar os dados do dashboard. Tente novamente.');
            hideLoading();
        });
}

/**
 * Shows loading state for dashboard
 */
function showLoading() {
    // You can implement a loading overlay or indicators here
    document.body.classList.add('loading');
    
    // Disable filter buttons during loading
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = true;
    });
}

/**
 * Hides loading state for dashboard
 */
function hideLoading() {
    document.body.classList.remove('loading');
    
    // Re-enable filter buttons
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = false;
    });
}

/**
 * Shows error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    // Create toast notification
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '1080';
    
    const toastHTML = `
    <div class="toast align-items-center text-white bg-danger border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                <i class="fas fa-exclamation-circle me-2"></i> ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>
    `;
    
    toastContainer.innerHTML = toastHTML;
    document.body.appendChild(toastContainer);
    
    const toastElement = toastContainer.querySelector('.toast');
    const toast = new bootstrap.Toast(toastElement, {
        delay: 5000
    });
    
    toast.show();
    
    // Remove toast container when hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        document.body.removeChild(toastContainer);
    });
}

/**
 * Updates dashboard cards with latest data
 */
function updateDashboardCards() {
    const cards = dashboardData.cards || {};
    
    // Update CT-e card
    document.getElementById('cte-total').textContent = `Total CT-e Emitido: ${cards.total_ctes || 0}`;
    document.getElementById('cte-valor').textContent = `Valor Total Prestado: ${formatCurrency(cards.faturamento || 0)}`;
    
    // Update MDF-e card
    document.getElementById('mdfe-total').textContent = `Total MDF-e Emitido: ${cards.total_mdfes || 0}`;
    
    // Calculate cargo weight in tons (converting from kg)
    const cargaTotal = (cards.valor_carga || 0) / 1000; // convert kg to tons
    document.getElementById('mdfe-carga').textContent = `Carga Total: ${cargaTotal.toFixed(2)} Ton`;
}

/**
 * Updates all dashboard charts
 */
function updateDashboardCharts() {
    updateTopMunicipiosChart();
    updateTopRotasChart();
}

/**
 * Updates the Top Municípios chart
 */
function updateTopMunicipiosChart() {
    const canvas = document.getElementById('topMunicipiosChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    if (topClientesChart) {
        topClientesChart.destroy();
    }
    
    // Process chart data
    const chartData = processMunicipiosChartData();
    
    // Create new chart
    const ctx = canvas.getContext('2d');
    topClientesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Quantidade de CT-es',
                data: chartData.values,
                backgroundColor: '#4CAF50',
                borderColor: '#1b4d3e',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} CT-e(s)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Updates the Top Rotas chart
 */
function updateTopRotasChart() {
    const canvas = document.getElementById('topRotasChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    if (rotasChart) {
        rotasChart.destroy();
    }
    
    // Process chart data
    const chartData = processRotasChartData();
    
    // Create new chart
    const ctx = canvas.getContext('2d');
    rotasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Quantidade de MDF-es',
                data: chartData.values,
                backgroundColor: '#4CAF50',
                borderColor: '#1b4d3e',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} MDF-e(s)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Process data for Municípios chart
 * @returns {Object} Object with labels and values arrays
 */
function processMunicipiosChartData() {
    // Get data from API response or use fallback
    const municipioData = dashboardData.grafico_cif_fob || [];
    
    // Extract month names and values
    const labels = [];
    const cif = [];
    const fob = [];
    
    municipioData.forEach(item => {
        // Format month/year (e.g., "Jan/2023")
        const [year, month] = item.mes.split('-');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const formattedDate = `${monthNames[parseInt(month) - 1]}/${year}`;
        
        labels.push(formattedDate);
        cif.push(parseFloat(item.cif || 0));
        fob.push(parseFloat(item.fob || 0));
    });
    
    return {
        labels: labels,
        values: cif, // Using CIF values as primary
        secondaryValues: fob // FOB as secondary data
    };
}

/**
 * Process data for Rotas chart
 * @returns {Object} Object with labels and values arrays
 */
function processRotasChartData() {
    // Get data from API response or use fallback
    const rotasData = dashboardData.grafico_metas || [];
    
    // Extract month names and values
    const labels = [];
    const values = [];
    const metaValues = [];
    
    rotasData.forEach(item => {
        // Format month/year (e.g., "Jan/2023")
        const [year, month] = item.mes.split('-');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const formattedDate = `${monthNames[parseInt(month) - 1]}/${year}`;
        
        labels.push(formattedDate);
        values.push(parseFloat(item.real || 0));
        metaValues.push(parseFloat(item.meta || 0));
    });
    
    return {
        labels: labels,
        values: values,
        secondaryValues: metaValues
    };
}

/**
 * Updates the recent entries table
 */
function updateRecentEntries() {
    const tbody = document.getElementById('ultimosLancamentosBody');
    if (!tbody) return;
    
    const lancamentos = dashboardData.ultimos_lancamentos?.ctes || [];
    
    if (lancamentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum lançamento encontrado</td></tr>';
        return;
    }
    
    let html = '';
    
    lancamentos.forEach(item => {
        const dataFormatada = new Date(item.data_emissao).toLocaleString('pt-BR');
        const valorFormatado = formatCurrency(item.valor_total || 0);
        
        html += `
        <tr>
            <td>${dataFormatada}</td>
            <td>CT-e ${item.numero_cte || '--'}</td>
            <td>${valorFormatado}</td>
            <td>${item.remetente_nome || '--'}</td>
            <td>${item.destinatario_nome || '--'}</td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Formats currency values
 * @param {number} value - Value to format
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

/**
 * Main function to refresh all dashboard data
 * (This is the function called from the UI filter button)
 */
function refreshData() {
    loadDashboardData();
}