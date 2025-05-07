/**
 * dashboard.js
 * Functions for the main dashboard panel
 */

// Global chart objects to allow destruction/updates
let faturamentoChart = null;
let clientesChart = null;
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
    // Period selector
    const periodoSelect = document.getElementById('periodo');
    if (periodoSelect) {
        periodoSelect.addEventListener('change', function() {
            handlePeriodChange(this.value);
            loadDashboardData();
        });
    }
    
    // Filter button
    const filterBtn = document.getElementById('btnFiltrar');
    if (filterBtn) {
        filterBtn.addEventListener('click', function() {
            loadDashboardData();
        });
    }
    
    // Reset filters button
    const resetBtn = document.getElementById('btnResetarFiltros');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('btnAtualizar');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            loadDashboardData();
        });
    }
    
    // Modal detail button in CTes recentes
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('btn-detail') || 
            (e.target.parentElement && e.target.parentElement.classList.contains('btn-detail'))) {
            const btn = e.target.classList.contains('btn-detail') ? e.target : e.target.parentElement;
            const id = btn.getAttribute('data-id');
            const tipo = btn.getAttribute('data-tipo');
            
            if (id && tipo) {
                showDocumentDetails(id, tipo);
            }
        }
    });
}

/**
 * Handles period change from dropdown
 * @param {string} period - Selected period
 */
function handlePeriodChange(period) {
    const today = new Date();
    const dataInicio = document.getElementById('data_inicio');
    const dataFim = document.getElementById('data_fim');
    
    switch (period) {
        case 'hoje':
            dataInicio.value = formatDateForInput(today);
            dataFim.value = formatDateForInput(today);
            break;
        case 'ontem':
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            dataInicio.value = formatDateForInput(yesterday);
            dataFim.value = formatDateForInput(yesterday);
            break;
        case '7dias':
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(today.getDate() - 6); // -6 because it includes today
            dataInicio.value = formatDateForInput(sevenDaysAgo);
            dataFim.value = formatDateForInput(today);
            break;
        case '30dias':
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(today.getDate() - 29); // -29 because it includes today
            dataInicio.value = formatDateForInput(thirtyDaysAgo);
            dataFim.value = formatDateForInput(today);
            break;
        case 'mes_atual':
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            dataInicio.value = formatDateForInput(firstDayOfMonth);
            dataFim.value = formatDateForInput(today);
            break;
        case 'mes_anterior':
            const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            dataInicio.value = formatDateForInput(firstDayOfLastMonth);
            dataFim.value = formatDateForInput(lastDayOfLastMonth);
            break;
        case 'ano_atual':
            const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
            dataInicio.value = formatDateForInput(firstDayOfYear);
            dataFim.value = formatDateForInput(today);
            break;
        case 'personalizado':
            // Keep current dates
            break;
    }
    
    // Enable/disable date inputs based on selection
    const isCustom = period === 'personalizado';
    dataInicio.disabled = !isCustom;
    dataFim.disabled = !isCustom;
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
 * Resets filters and loads data
 */
function resetFilters() {
    document.getElementById('filterForm').reset();
    setDefaultDateRange();
    const periodoSelect = document.getElementById('periodo');
    if (periodoSelect) periodoSelect.value = '30dias';
    loadDashboardData();
}

/**
 * Loads dashboard data from the API
 */
function loadDashboardData() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const periodo = document.getElementById('periodo')?.value || '30dias';
    
    // Build API URL with query params
    let apiUrl = `/api/dashboard/?`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (periodo !== 'personalizado') apiUrl += `&periodo=${periodo}`;
    
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
            
            // Update dashboard components
            updateDashboardCards(data.cards);
            updateDashboardCharts(data);
            updateRecentEntries(data.ultimos_lancamentos);
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading dashboard data:', error);
            showNotification('Não foi possível carregar os dados do dashboard. Tente novamente.', 'error');
            hideLoading();
        });
}

/**
 * Shows loading state for dashboard
 */
function showLoading() {
    // Show loading indicator for charts
    const chartContainers = document.querySelectorAll('.chart-container');
    chartContainers.forEach(container => {
        container.innerHTML = `
        <div class="d-flex justify-content-center align-items-center h-100">
            <div class="spinner-border text-success" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
        </div>`;
    });
    
    // Show loading for recent entries
    const entriesContainer = document.getElementById('ultimosLancamentosBody');
    if (entriesContainer) {
        entriesContainer.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                <div class="spinner-border spinner-border-sm text-secondary" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <span class="ms-2">Carregando dados...</span>
            </td>
        </tr>`;
    }
    
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
 * Updates dashboard cards with latest data
 * @param {Object} cards - Cards data
 */
function updateDashboardCards(cards) {
    if (!cards) return;
    
    // Update CT-e card
    if (document.getElementById('total-cte')) {
        document.getElementById('total-cte').textContent = formatNumber(cards.total_ctes || 0);
    }
    if (document.getElementById('valor-frete')) {
        document.getElementById('valor-frete').textContent = formatCurrency(cards.valor_total_fretes || 0);
    }
    
    // Update MDF-e card
    if (document.getElementById('total-mdfe')) {
        document.getElementById('total-mdfe').textContent = formatNumber(cards.total_mdfes || 0);
    }
    
    // Update CIF card
    if (document.getElementById('total-cif')) {
        document.getElementById('total-cif').textContent = formatCurrency(cards.valor_cif || 0);
    }
    
    // Update FOB card
    if (document.getElementById('total-fob')) {
        document.getElementById('total-fob').textContent = formatCurrency(cards.valor_fob || 0);
    }
}

/**
 * Updates all dashboard charts
 * @param {Object} data - Dashboard data
 */
function updateDashboardCharts(data) {
    // Render faturamento chart
    if (document.getElementById('faturamentoChart')) {
        renderFaturamentoChart(data.grafico_cif_fob || []);
    }
    
    // Render clientes chart
    if (document.getElementById('clientesChart')) {
        renderClientesChart(data.grafico_cliente || []);
    }
    
    // Render rotas chart
    if (document.getElementById('rotasChart')) {
        renderRotasChart(data.grafico_metas || []);
    }
}

/**
 * Renders the faturamento chart
 * @param {Array} chartData - Chart data
 */
function renderFaturamentoChart(chartData) {
    const canvas = document.getElementById('faturamentoChart');
    if (!canvas) return;
    
    // Clear chart container if there's no data
    if (!chartData || chartData.length === 0) {
        const container = canvas.parentElement;
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Prepare container for the chart
    const container = canvas.parentElement;
    container.innerHTML = '<canvas id="faturamentoChart"></canvas>';
    const newCanvas = document.getElementById('faturamentoChart');
    
    // Process chart data
    const labels = [];
    const cifData = [];
    const fobData = [];
    const totalData = [];
    
    chartData.forEach(item => {
        labels.push(item.data || '');
        cifData.push(parseFloat(item.cif || 0));
        fobData.push(parseFloat(item.fob || 0));
        totalData.push(parseFloat(item.total || 0));
    });
    
    // Create chart
    const ctx = newCanvas.getContext('2d');
    faturamentoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CIF',
                    data: cifData,
                    backgroundColor: '#4CAF50',
                    order: 2
                },
                {
                    label: 'FOB',
                    data: fobData,
                    backgroundColor: '#1b4d3e',
                    order: 3
                },
                {
                    label: 'Total',
                    data: totalData,
                    type: 'line',
                    fill: false,
                    borderColor: '#FF5722',
                    pointBackgroundColor: '#FF5722',
                    tension: 0.4,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Faturamento por Período',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders the clientes chart
 * @param {Array} chartData - Chart data
 */
function renderClientesChart(chartData) {
    const canvas = document.getElementById('clientesChart');
    if (!canvas) return;
    
    // Clear chart container if there's no data
    if (!chartData || chartData.length === 0) {
        const container = canvas.parentElement;
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Prepare container for the chart
    const container = canvas.parentElement;
    container.innerHTML = '<canvas id="clientesChart"></canvas>';
    const newCanvas = document.getElementById('clientesChart');
    
    // Process chart data - limit to top 6 for better visualization
    const displayData = chartData.slice(0, 6);
    
    const labels = displayData.map(item => truncateText(item.label, 20));
    const values = displayData.map(item => parseFloat(item.valor || 0));
    
    // Create chart
    const ctx = newCanvas.getContext('2d');
    clientesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor em R$',
                data: values,
                backgroundColor: '#4CAF50',
                borderColor: '#1b4d3e',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bar chart
            plugins: {
                title: {
                    display: true,
                    text: 'Top Clientes por Faturamento',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders the rotas chart
 * @param {Array} chartData - Chart data
 */
function renderRotasChart(chartData) {
    const canvas = document.getElementById('rotasChart');
    if (!canvas) return;
    
    // Clear chart container if there's no data
    if (!chartData || chartData.length === 0) {
        const container = canvas.parentElement;
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Prepare container for the chart
    const container = canvas.parentElement;
    container.innerHTML = '<canvas id="rotasChart"></canvas>';
    const newCanvas = document.getElementById('rotasChart');
    
    // Process chart data
    const labels = [];
    const valorData = [];
    const metaData = [];
    
    chartData.forEach(item => {
        labels.push(item.label || '');
        valorData.push(parseFloat(item.valor || 0));
        metaData.push(parseFloat(item.meta || 0));
    });
    
    // Create chart
    const ctx = newCanvas.getContext('2d');
    rotasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valor Realizado',
                    data: valorData,
                    backgroundColor: '#4CAF50'
                },
                {
                    label: 'Meta',
                    data: metaData,
                    backgroundColor: 'rgba(255, 87, 34, 0.7)',
                    borderColor: '#FF5722',
                    borderWidth: 1,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Realizado x Meta',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Updates the recent entries table
 * @param {Object} lancamentos - Recent entries data
 */
function updateRecentEntries(lancamentos) {
    const tbody = document.getElementById('ultimosLancamentosBody');
    if (!tbody) return;
    
    if (!lancamentos || (!lancamentos.ctes && !lancamentos.mdfes)) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum lançamento recente encontrado.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    // Add CT-es to the list
    if (lancamentos.ctes && lancamentos.ctes.length > 0) {
        lancamentos.ctes.forEach(cte => {
            const data = formatDateTime(cte.data_emissao);
            
            html += `
            <tr>
                <td>${data}</td>
                <td>CT-e ${cte.numero || '--'}</td>
                <td>${formatCurrency(cte.valor)}</td>
                <td>${truncateText(cte.remetente, 20) || '--'}</td>
                <td>${truncateText(cte.destinatario, 20) || '--'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary btn-detail" data-id="${cte.id}" data-tipo="cte" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        });
    }
    
    // Add MDF-es to the list
    if (lancamentos.mdfes && lancamentos.mdfes.length > 0) {
        lancamentos.mdfes.forEach(mdfe => {
            const data = formatDateTime(mdfe.data_emissao);
            
            html += `
            <tr>
                <td>${data}</td>
                <td>MDF-e ${mdfe.numero || '--'}</td>
                <td>--</td>
                <td>${mdfe.uf_origem || '--'}</td>
                <td>${mdfe.uf_destino || '--'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary btn-detail" data-id="${mdfe.id}" data-tipo="mdfe" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        });
    }
    
    if (html === '') {
        html = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum lançamento recente encontrado.
            </td>
        </tr>`;
    }
    
    tbody.innerHTML = html;
}

/**
 * Shows document details in modal
 * @param {string} id - Document ID
 * @param {string} tipo - Document type (cte, mdfe)
 */
function showDocumentDetails(id, tipo) {
    const modalId = tipo === 'cte' ? 'cteDetailModal' : 'mdfeDetailModal';
    const modal = document.getElementById(modalId);
    
    if (!modal) {
        console.error(`Modal #${modalId} not found`);
        showNotification(`Erro ao exibir detalhes. Modal #${modalId} não encontrado.`, 'error');
        return;
    }
    
    // Show loading in modal
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Endpoint based on document type
    const endpoint = tipo === 'cte' ? '/api/ctes/' : '/api/mdfes/';
    
    // Fetch document details
    Auth.fetchWithAuth(`${endpoint}${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Update modal title
            const modalTitle = modal.querySelector('.modal-title');
            if (modalTitle) {
                modalTitle.textContent = tipo === 'cte' 
                    ? `CT-e ${data.identificacao?.numero || ''} - Detalhes`
                    : `MDF-e ${data.identificacao?.n_mdf || ''} - Detalhes`;
            }
            
            // Render appropriate content based on document type
            if (tipo === 'cte') {
                renderCTeDetails(modalBody, data);
            } else {
                renderMDFeDetails(modalBody, data);
            }
            
            // Set current document ID for action buttons
            const actionButtons = modal.querySelectorAll('.action-btn');
            actionButtons.forEach(btn => {
                btn.setAttribute('data-id', id);
            });
        })
        .catch(error => {
            console.error(`Error loading ${tipo.toUpperCase()} details:`, error);
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes: ${error.message}
            </div>
            `;
        });
}

/**
 * Renders CT-e details in modal
 * @param {Element} container - Modal body element
 * @param {Object} cte - CT-e data
 */
function renderCTeDetails(container, cte) {
    // Basic info
    let html = `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Informações Básicas</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Número:</strong> ${cte.identificacao?.numero || '--'}</p>
                    <p><strong>Série:</strong> ${cte.identificacao?.serie || '--'}</p>
                    <p><strong>Data Emissão:</strong> ${formatDateTime(cte.identificacao?.data_emissao)}</p>
                    <p><strong>Chave:</strong> ${cte.chave || '--'}</p>
                    <p><strong>Modalidade:</strong> ${cte.modalidade || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Remetente:</strong> ${cte.remetente?.razao_social || '--'}</p>
                    <p><strong>Destinatário:</strong> ${cte.destinatario?.razao_social || '--'}</p>
                    <p><strong>Origem/Destino:</strong> ${cte.identificacao?.uf_ini || '--'} → ${cte.identificacao?.uf_fim || '--'}</p>
                    <p><strong>Valor Total:</strong> ${formatCurrency(cte.prestacao?.valor_total_prestado)}</p>
                    <p><strong>Status:</strong> ${getStatusHTML(cte)}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Renders MDF-e details in modal
 * @param {Element} container - Modal body element
 * @param {Object} mdfe - MDF-e data
 */
function renderMDFeDetails(container, mdfe) {
    // Basic info
    let html = `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Informações Básicas</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Número:</strong> ${mdfe.identificacao?.n_mdf || '--'}</p>
                    <p><strong>Série:</strong> ${mdfe.identificacao?.serie || '--'}</p>
                    <p><strong>Data Emissão:</strong> ${formatDateTime(mdfe.identificacao?.dh_emi)}</p>
                    <p><strong>Chave:</strong> ${mdfe.chave || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>UF Origem:</strong> ${mdfe.identificacao?.uf_ini || '--'}</p>
                    <p><strong>UF Destino:</strong> ${mdfe.identificacao?.uf_fim || '--'}</p>
                    <p><strong>Placa Principal:</strong> ${mdfe.modal_rodoviario?.veiculo_tracao?.placa || '--'}</p>
                    <p><strong>Status:</strong> ${getMDFeStatusHTML(mdfe)}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Gets status HTML for CT-e
 * @param {Object} cte - CT-e data
 * @returns {string} - HTML status badge
 */
function getStatusHTML(cte) {
    if (cte.status === 'Cancelado' || (cte.cancelamento && cte.cancelamento.c_stat === 135)) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (cte.status === 'Autorizado' || (cte.protocolo?.codigo_status === 100)) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    
    if (cte.status && cte.status.toLowerCase().includes('rejeitado')) {
        return '<span class="badge bg-warning text-dark">Rejeitado</span>';
    }
    
    if (cte.processado) {
        return '<span class="badge bg-info">Processado</span>';
    }
    
    return '<span class="badge bg-secondary">Pendente</span>';
}

/**
 * Gets status HTML for MDF-e
 * @param {Object} mdfe - MDF-e data
 * @returns {string} - HTML status badge
 */
function getMDFeStatusHTML(mdfe) {
    if (mdfe.status === 'Cancelado' || (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135)) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (mdfe.encerrado) {
        return '<span class="badge bg-primary">Encerrado</span>';
    }
    
    if (mdfe.status === 'Autorizado' || (mdfe.protocolo?.codigo_status === 100)) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    
    if (mdfe.status && mdfe.status.toLowerCase().includes('rejeitado')) {
        return '<span class="badge bg-warning text-dark">Rejeitado</span>';
    }
    
    if (mdfe.processado) {
        return '<span class="badge bg-info">Processado</span>';
    }
    
    return '<span class="badge bg-secondary">Pendente</span>';
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
 * Formats number with thousands separator
 * @param {number} value - Value to format
 * @returns {string} - Formatted number
 */
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
}

/**
 * Formats date
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        return new Date(date).toLocaleDateString('pt-BR');
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
        return new Date(date).toLocaleString('pt-BR');
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