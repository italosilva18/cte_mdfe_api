/**
 * financeiro.js
 * Functions for the financial analysis panel
 */

// Global variables
let financeiroData = {}; // Store data from API
let mensalChart = null;  // Chart instance for monthly data
let cifFobChart = null;  // Chart instance for CIF/FOB distribution

/**
 * Initializes the financial panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Load initial data
    loadFinanceiroData();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadFinanceiroData()"]');
    if (filterBtn) {
        // Replace inline handler with proper event listener
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            loadFinanceiroData();
        });
    }
    
    // Reset button
    const resetBtn = document.querySelector('button[onclick="resetFilters()"]');
    if (resetBtn) {
        resetBtn.removeAttribute('onclick');
        resetBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
    
    // Group by dropdown
    const groupSelect = document.getElementById('agrupamento');
    if (groupSelect) {
        groupSelect.addEventListener('change', function() {
            loadFinanceiroData();
        });
    }
    
    // Export buttons
    setupExportButtonsListeners();
}

/**
 * Sets up export buttons listeners
 */
function setupExportButtonsListeners() {
    // Agrupamento table export
    document.querySelector('button[onclick="exportTableToCSV(\'agrupadoTable\', \'faturamento_por_cliente.csv\')"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        const filename = `faturamento_por_${document.getElementById('agrupamento').value}.csv`;
        exportTableToCSV('agrupadoTable', filename);
    });
    
    // Mensal table export
    document.querySelector('button[onclick="exportTableToCSV(\'mensalTable\', \'detalhamento_mensal.csv\')"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportTableToCSV('mensalTable', 'detalhamento_mensal.csv');
    });
    
    // Detail modal export
    document.getElementById('exportDetalhe')?.addEventListener('click', function() {
        const detailTable = document.querySelector('#detalheContent table');
        if (detailTable) {
            const filename = 'detalhamento_financeiro.csv';
            exportTableToCSV(detailTable.id, filename);
        }
    });
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
 * Resets all filters and loads data
 */
function resetFilters() {
    // Reset filter form
    document.getElementById('filterForm').reset();
    
    // Set default date range
    setDefaultDateRange();
    
    // Load data with default filters
    loadFinanceiroData();
}

/**
 * Loads financial data from the API
 */
function loadFinanceiroData() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const agrupamento = document.getElementById('agrupamento').value;
    
    // Update agrupamento table title
    updateAgrupamentoTitle(agrupamento);
    
    // Build API URL with query params
    let apiUrl = `/api/financeiro/?`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    
    // Fetch main financial data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados financeiros');
            }
            return response.json();
        })
        .then(data => {
            // Store data globally
            financeiroData = data;
            
            // Update summary cards
            updateSummaryCards(data.cards);
            
            // Render CIF/FOB chart
            renderCifFobChart(data.grafico_cif_fob);
            
            // Load monthly detailed data
            loadMensalData(dataInicio, dataFim);
            
            // Load grouped detailed data
            loadAgrupamentoData(dataInicio, dataFim, agrupamento);
        })
        .catch(error => {
            console.error('Error loading financial data:', error);
            showError('Não foi possível carregar os dados financeiros. Tente novamente.');
            hideLoading();
        });
}

/**
 * Loads monthly detailed data
 * @param {string} dataInicio - Start date
 * @param {string} dataFim - End date
 */
function loadMensalData(dataInicio, dataFim) {
    // Build API URL with query params
    let apiUrl = `/api/financeiro/mensal/?`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    
    // Fetch monthly data
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados mensais');
            }
            return response.json();
        })
        .then(data => {
            // Render monthly data table
            renderMensalTable(data);
            
            // Render monthly chart
            renderMensalChart(data);
        })
        .catch(error => {
            console.error('Error loading monthly data:', error);
            
            // Clear monthly table with error message
            document.getElementById('mensal-dados').innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Erro ao carregar dados mensais. Tente novamente.
                </td>
            </tr>`;
        });
}

/**
 * Loads grouped detailed data
 * @param {string} dataInicio - Start date
 * @param {string} dataFim - End date
 * @param {string} agrupamento - Grouping type (cliente, veiculo, distribuidora)
 */
function loadAgrupamentoData(dataInicio, dataFim, agrupamento) {
    // Build API URL with query params
    let apiUrl = `/api/financeiro/detalhe/?group=${agrupamento}`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    
    // Fetch grouped data
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados agrupados');
            }
            return response.json();
        })
        .then(data => {
            // Render grouped data table
            renderAgrupamentoTable(data);
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading grouped data:', error);
            
            // Clear grouped table with error message
            document.getElementById('agrupamento-dados').innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Erro ao carregar dados agrupados. Tente novamente.
                </td>
            </tr>`;
            
            // Hide loading indicator
            hideLoading();
        });
}

/**
 * Updates summary cards with API data
 * @param {Object} cards - Summary data from API
 */
function updateSummaryCards(cards) {
    if (!cards) return;
    
    document.getElementById('faturamento-total').textContent = formatCurrency(cards.faturamento || 0);
    document.getElementById('valor-cif').textContent = formatCurrency(cards.valor_cif || 0);
    document.getElementById('valor-fob').textContent = formatCurrency(cards.valor_fob || 0);
    document.getElementById('valor-tributos').textContent = formatCurrency(cards.tributos || 0);
    
    // Calculate and update percentages
    const totalFaturamento = cards.faturamento || 0;
    
    if (totalFaturamento > 0) {
        const percentCif = (cards.valor_cif || 0) / totalFaturamento * 100;
        const percentFob = (cards.valor_fob || 0) / totalFaturamento * 100;
        const percentTributos = (cards.tributos || 0) / totalFaturamento * 100;
        
        document.getElementById('percent-cif').textContent = `${percentCif.toFixed(1)}% do total`;
        document.getElementById('percent-fob').textContent = `${percentFob.toFixed(1)}% do total`;
        document.getElementById('percent-tributos').textContent = `${percentTributos.toFixed(1)}% do faturamento`;
    } else {
        document.getElementById('percent-cif').textContent = '0% do total';
        document.getElementById('percent-fob').textContent = '0% do total';
        document.getElementById('percent-tributos').textContent = '0% do faturamento';
    }
}

/**
 * Updates agrupamento table title based on selected group
 * @param {string} agrupamento - Grouping type
 */
function updateAgrupamentoTitle(agrupamento) {
    const tituloElement = document.getElementById('agrupamento-titulo');
    const colunaElement = document.getElementById('agrupamento-coluna-nome');
    
    if (tituloElement) {
        switch (agrupamento) {
            case 'cliente':
                tituloElement.textContent = 'Faturamento por Cliente';
                if (colunaElement) colunaElement.textContent = 'Cliente';
                break;
            case 'veiculo':
                tituloElement.textContent = 'Faturamento por Veículo';
                if (colunaElement) colunaElement.textContent = 'Placa';
                break;
            case 'distribuidora':
                tituloElement.textContent = 'Faturamento por Distribuidora';
                if (colunaElement) colunaElement.textContent = 'Distribuidora';
                break;
            default:
                tituloElement.textContent = 'Faturamento por Cliente';
                if (colunaElement) colunaElement.textContent = 'Cliente';
        }
    }
}

/**
 * Renders CIF/FOB distribution chart
 * @param {Array} chartData - Chart data from API
 */
function renderCifFobChart(chartData) {
    if (!chartData || chartData.length === 0) return;
    
    const canvas = document.getElementById('cifFobChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    if (cifFobChart) {
        cifFobChart.destroy();
    }
    
    // Prepare data for chart
    const labels = ['CIF', 'FOB'];
    const cifTotal = chartData.reduce((sum, item) => sum + parseFloat(item.cif || 0), 0);
    const fobTotal = chartData.reduce((sum, item) => sum + parseFloat(item.fob || 0), 0);
    const data = [cifTotal, fobTotal];
    const total = cifTotal + fobTotal;
    
    // Create new chart
    const ctx = canvas.getContext('2d');
    cifFobChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#4CAF50', '#1b4d3e'],
                borderColor: ['#fff', '#fff'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = total > 0 ? (value / total * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders monthly data chart
 * @param {Array} chartData - Monthly data from API
 */
function renderMensalChart(chartData) {
    if (!chartData || chartData.length === 0) return;
    
    const canvas = document.getElementById('faturamentoMensalChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    if (mensalChart) {
        mensalChart.destroy();
    }
    
    // Prepare data for chart
    const labels = chartData.map(item => {
        const [year, month] = item.mes.split('-');
        return `${getMonthName(parseInt(month))}/${year}`;
    });
    
    const faturamentoData = chartData.map(item => parseFloat(item.faturamento || 0));
    const cifData = chartData.map(item => parseFloat(item.cif || 0));
    const fobData = chartData.map(item => parseFloat(item.fob || 0));
    
    // Create new chart
    const ctx = canvas.getContext('2d');
    mensalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Faturamento Total',
                    data: faturamentoData,
                    backgroundColor: '#4CAF50',
                    borderColor: '#388E3C',
                    borderWidth: 1,
                    order: 0
                },
                {
                    label: 'CIF',
                    data: cifData,
                    backgroundColor: '#81C784',
                    borderColor: '#4CAF50',
                    borderWidth: 1,
                    order: 1
                },
                {
                    label: 'FOB',
                    data: fobData,
                    backgroundColor: '#1b4d3e',
                    borderColor: '#1b4d3e',
                    borderWidth: 1,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders monthly data table
 * @param {Array} data - Monthly data from API
 */
function renderMensalTable(data) {
    const tbody = document.getElementById('mensal-dados');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum dado mensal encontrado para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    data.forEach(item => {
        const [year, month] = item.mes.split('-');
        const periodoFormatado = `${getMonthName(parseInt(month))}/${year}`;
        
        html += `
        <tr>
            <td>${periodoFormatado}</td>
            <td class="text-end">${formatCurrency(item.faturamento)}</td>
            <td class="text-end">${formatCurrency(item.cif)}</td>
            <td class="text-end">${formatCurrency(item.fob)}</td>
            <td class="text-end">${item.entregas}</td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders grouped data table
 * @param {Array} data - Grouped data from API
 */
function renderAgrupamentoTable(data) {
    const tbody = document.getElementById('agrupamento-dados');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum dado agrupado encontrado para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    const agrupamento = document.getElementById('agrupamento').value;
    
    data.forEach(item => {
        html += `
        <tr>
            <td>${item.label || '--'}</td>
            <td class="text-end">${formatCurrency(item.faturamento_total)}</td>
            <td class="text-end">${item.qtd_ctes || 0}</td>
            <td class="text-end">${formatCurrency(item.valor_medio)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-primary view-detail" data-id="${item.id}" data-label="${item.label}" data-agrupamento="${agrupamento}">
                    <i class="fas fa-search"></i>
                </button>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Set up detail button click events
    const detailButtons = document.querySelectorAll('.view-detail');
    detailButtons.forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const label = this.getAttribute('data-label');
            const agrupamento = this.getAttribute('data-agrupamento');
            showDetailModal(id, label, agrupamento);
        });
    });
}

/**
 * Shows detail modal with data for a specific item
 * @param {string} id - ID of the item
 * @param {string} label - Label of the item
 * @param {string} agrupamento - Grouping type
 */
function showDetailModal(id, label, agrupamento) {
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detalheContent');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Update modal title based on grouping type
    let titlePrefix = '';
    let fieldName = '';
    let paramName = '';
    
    switch (agrupamento) {
        case 'cliente':
            titlePrefix = 'Cliente';
            fieldName = 'cliente';
            paramName = 'cliente_id';
            break;
        case 'veiculo':
            titlePrefix = 'Veículo';
            fieldName = 'placa';
            paramName = 'placa';
            break;
        case 'distribuidora':
            titlePrefix = 'Distribuidora';
            fieldName = 'distribuidor';
            paramName = 'distribuidor_id';
            break;
        default:
            titlePrefix = 'Item';
            fieldName = 'id';
            paramName = 'id';
    }
    
    modalTitle.textContent = `${titlePrefix}: ${label}`;
    
    // Show loading state in modal
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center p-5">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    <div class="text-center mt-3">Carregando detalhes...</div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Build API URL for detail
    let apiUrl = `/api/ctes/?`;
    apiUrl += `${paramName}=${encodeURIComponent(id)}`;
    
    // Add date filters if they exist
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    
    // Fetch detail data
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes');
            }
            return response.json();
        })
        .then(data => {
            // Render detail table
            renderDetailContent(data.results || [], fieldName, label);
        })
        .catch(error => {
            console.error('Error loading detail data:', error);
            
            // Show error in modal
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes. Tente novamente.
            </div>
            `;
        });
}

/**
 * Renders detail content in modal
 * @param {Array} details - Detail data from API
 * @param {string} fieldName - Field name for the grouping
 * @param {string} label - Label of the item
 */
function renderDetailContent(details, fieldName, label) {
    const modalBody = document.getElementById('detalheContent');
    if (!modalBody) return;
    
    if (!details || details.length === 0) {
        modalBody.innerHTML = `
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum CT-e encontrado para este filtro.
        </div>
        `;
        return;
    }
    
    // Create table for details
    let html = `
    <div class="table-responsive">
        <table class="table table-striped table-hover" id="detalheTable">
            <thead>
                <tr>
                    <th>CT-e</th>
                    <th>Data</th>
                    <th>Remetente</th>
                    <th>Destinatário</th>
                    <th>Valor</th>
                    <th>Modal.</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add rows for each CT-e
    details.forEach(cte => {
        const dataEmissao = cte.data_emissao ? formatDate(new Date(cte.data_emissao)) : '--';
        
        html += `
        <tr>
            <td>${cte.numero_cte || '--'}</td>
            <td>${dataEmissao}</td>
            <td>${truncateText(cte.remetente_nome, 15)}</td>
            <td>${truncateText(cte.destinatario_nome, 15)}</td>
            <td class="text-end">${formatCurrency(cte.valor_total)}</td>
            <td>${cte.modalidade || '--'}</td>
        </tr>
        `;
    });
    
    html += `
            </tbody>
            <tfoot>
                <tr class="table-success">
                    <td colspan="4" class="text-end fw-bold">Total:</td>
                    <td class="text-end fw-bold">${formatCurrency(details.reduce((sum, cte) => sum + parseFloat(cte.valor_total || 0), 0))}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    modalBody.innerHTML = html;
}

/**
 * Shows loading state
 */
function showLoading() {
    // Show loading states for tables
    const loadingHTML = `
    <tr>
        <td colspan="5" class="text-center">
            <div class="spinner-border spinner-border-sm text-success me-2" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            Carregando dados...
        </td>
    </tr>`;
    
    document.getElementById('agrupamento-dados')?.innerHTML = loadingHTML;
    document.getElementById('mensal-dados')?.innerHTML = loadingHTML;
    
    // Disable filter buttons during loading
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = true;
    });
}

/**
 * Hides loading state
 */
function hideLoading() {
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
 * Gets month name from month number
 * @param {number} month - Month number (1-12)
 * @returns {string} - Month name
 */
function getMonthName(month) {
    const monthNames = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    
    return monthNames[month - 1] || '';
}

/**
 * Formats currency value
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
 * Formats date
 * @param {string|Date} dateString - Date string or object
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return '--';
    
    try {
        const date = dateString instanceof Date ? dateString : new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Truncates text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Exports table data to CSV file
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