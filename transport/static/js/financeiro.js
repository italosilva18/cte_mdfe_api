/**
 * financeiro.js
 * Functions for the financial dashboard panel
 */

// Global chart objects to allow destruction/updates
let faturamentoMensalChart = null;
let cifFobChart = null;

// Global data cache
let financialData = {};
let detalhamentoData = [];

/**
 * Initializes financial dashboard when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (current year)
    setDefaultDateRange();
    
    // Load initial data
    loadFinanceiroData();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the financial panel
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadFinanceiroData()"]');
    if (filterBtn) {
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            loadFinanceiroData();
        });
    }
    
    // Reset filters button
    const resetBtn = document.querySelector('button[onclick="resetFilters()"]');
    if (resetBtn) {
        resetBtn.removeAttribute('onclick');
        resetBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
    
    // Agrupamento select
    const agrupamentoSelect = document.getElementById('agrupamento');
    if (agrupamentoSelect) {
        agrupamentoSelect.addEventListener('change', function() {
            updateAgrupamentoTable(this.value);
        });
    }
    
    // Setup button click delegation for detalhe buttons
    document.addEventListener('click', function(e) {
        // Check if clicked element or its parent has 'btn-detalhe' class
        const btnDetalhe = e.target.closest('.btn-detalhe');
        if (btnDetalhe) {
            const id = btnDetalhe.getAttribute('data-id');
            const tipo = btnDetalhe.getAttribute('data-tipo');
            showDetalhe(id, tipo);
        }
    });
    
    // Export buttons event listeners
    const exportAgrupamentoBtn = document.querySelector('button[onclick="exportTableToCSV(\'agrupadoTable\', \'faturamento_por_cliente.csv\')"]');
    if (exportAgrupamentoBtn) {
        exportAgrupamentoBtn.removeAttribute('onclick');
        exportAgrupamentoBtn.addEventListener('click', function() {
            const agrupamento = document.getElementById('agrupamento').value;
            const filename = `faturamento_por_${agrupamento}.csv`;
            exportTableToCSV('agrupadoTable', filename);
        });
    }
    
    const exportMensalBtn = document.querySelector('button[onclick="exportTableToCSV(\'mensalTable\', \'detalhamento_mensal.csv\')"]');
    if (exportMensalBtn) {
        exportMensalBtn.removeAttribute('onclick');
        exportMensalBtn.addEventListener('click', function() {
            exportTableToCSV('mensalTable', 'detalhamento_mensal.csv');
        });
    }
    
    const exportDetalheBtn = document.getElementById('exportDetalhe');
    if (exportDetalheBtn) {
        exportDetalheBtn.addEventListener('click', function() {
            exportDetalheToCSV();
        });
    }
}

/**
 * Sets default date range (current year)
 */
function setDefaultDateRange() {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    
    // Format dates for input fields
    document.getElementById('data_inicio').value = formatDateForInput(firstDayOfYear);
    document.getElementById('data_fim').value = formatDateForInput(today);
}

/**
 * Resets filters and loads data
 */
function resetFilters() {
    // Reset form
    document.getElementById('filterForm')?.reset();
    
    // Set default date range
    setDefaultDateRange();
    
    // Reset agrupamento to default
    const agrupamentoSelect = document.getElementById('agrupamento');
    if (agrupamentoSelect) agrupamentoSelect.value = 'cliente';
    
    // Load data with reset filters
    loadFinanceiroData();
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
 * Loads financial data from the API
 */
function loadFinanceiroData() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const agrupamento = document.getElementById('agrupamento').value;
    
    // Build API URL with query params
    const apiUrl = `/api/financeiro/?data_inicio=${dataInicio}&data_fim=${dataFim}`;
    
    // Fetch financial overview data
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados financeiros');
            }
            return response.json();
        })
        .then(data => {
            // Cache the data
            financialData = data;
            
            // Update UI components
            updateFinancialCards(data.cards);
            renderCharts(data);
            
            // Fetch and load agrupamento data
            return loadDetalheFinanceiro(dataInicio, dataFim, agrupamento);
        })
        .then(() => {
            // Fetch and load monthly data
            return loadDetalhamentoMensal(dataInicio, dataFim);
        })
        .catch(error => {
            console.error('Error loading financial data:', error);
            showNotification('Não foi possível carregar os dados financeiros. Tente novamente.', 'error');
            hideLoading();
        });
}

/**
 * Loads financial detail data from the API
 * @param {string} dataInicio - Start date
 * @param {string} dataFim - End date
 * @param {string} tipo - Detail type (cliente, veiculo, distribuidora, etc.)
 * @returns {Promise} - Promise for the fetch operation
 */
function loadDetalheFinanceiro(dataInicio, dataFim, tipo) {
    // Build API URL with query params
    const apiUrl = `/api/financeiro/detalhe/?data_inicio=${dataInicio}&data_fim=${dataFim}&tipo=${tipo}`;
    
    // Fetch detail data
    return Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados de detalhamento');
            }
            return response.json();
        })
        .then(data => {
            // Update agrupamento table
            renderAgrupamentoTable(data, tipo);
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading detail data:', error);
            
            // Show error in table
            const tbody = document.getElementById('agrupamento-dados');
            if (tbody) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Erro ao carregar dados de detalhamento.
                    </td>
                </tr>`;
            }
            
            hideLoading();
            return Promise.reject(error);
        });
}

/**
 * Loads monthly detail data from the API
 * @param {string} dataInicio - Start date
 * @param {string} dataFim - End date
 * @returns {Promise} - Promise for the fetch operation
 */
function loadDetalhamentoMensal(dataInicio, dataFim) {
    // Extract year and month from dates
    const anoInicio = parseInt(dataInicio.split('-')[0]);
    const anoFim = parseInt(dataFim.split('-')[0]);
    
    // Create array to store promises for each month
    const promises = [];
    const meses = [];
    
    // Generate list of months to fetch
    for (let ano = anoInicio; ano <= anoFim; ano++) {
        // Determine start and end months
        const mesInicio = ano === anoInicio ? parseInt(dataInicio.split('-')[1]) : 1;
        const mesFim = ano === anoFim ? parseInt(dataFim.split('-')[1]) : 12;
        
        for (let mes = mesInicio; mes <= mesFim; mes++) {
            const mesFmt = mes.toString().padStart(2, '0');
            const periodo = `${ano}-${mesFmt}`;
            meses.push(periodo);
            
            // Create promise for this month
            const promise = Auth.fetchWithAuth(`/api/financeiro/mensal/?mes=${periodo}`)
                .then(response => {
                    if (!response.ok) {
                        // Return empty data for this month if fails
                        return {
                            mes: periodo,
                            faturamento: 0,
                            cif: 0,
                            fob: 0,
                            entregas: 0
                        };
                    }
                    return response.json();
                });
            
            promises.push(promise);
        }
    }
    
    // Fetch all months in parallel
    return Promise.all(promises)
        .then(results => {
            // Cache the results
            detalhamentoData = results;
            
            // Render monthly table
            renderMensalTable(results);
        })
        .catch(error => {
            console.error('Error loading monthly data:', error);
            
            // Show error in table
            const tbody = document.getElementById('mensal-dados');
            if (tbody) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Erro ao carregar dados mensais.
                    </td>
                </tr>`;
            }
            
            return Promise.reject(error);
        });
}

/**
 * Shows loading state
 */
function showLoading() {
    // Display loading message in tables
    const agrupamentoTable = document.getElementById('agrupamento-dados');
    if (agrupamentoTable) {
        agrupamentoTable.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                <div class="spinner-border spinner-border-sm text-success" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <span class="ms-2">Carregando dados...</span>
            </td>
        </tr>`;
    }
    
    const mensalTable = document.getElementById('mensal-dados');
    if (mensalTable) {
        mensalTable.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                <div class="spinner-border spinner-border-sm text-success" role="status">
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
 * Updates financial summary cards with latest data
 * @param {Object} cards - Cards data
 */
function updateFinancialCards(cards) {
    if (!cards) return;
    
    // Update faturamento total
    if (document.getElementById('faturamento-total')) {
        document.getElementById('faturamento-total').textContent = formatCurrency(cards.faturamento_total || 0);
    }
    
    // Update CIF values
    if (document.getElementById('valor-cif')) {
        document.getElementById('valor-cif').textContent = formatCurrency(cards.valor_cif || 0);
    }
    if (document.getElementById('percent-cif')) {
        document.getElementById('percent-cif').textContent = formatPercent(cards.percentual_cif || 0) + ' do total';
    }
    
    // Update FOB values
    if (document.getElementById('valor-fob')) {
        document.getElementById('valor-fob').textContent = formatCurrency(cards.valor_fob || 0);
    }
    if (document.getElementById('percent-fob')) {
        document.getElementById('percent-fob').textContent = formatPercent(cards.percentual_fob || 0) + ' do total';
    }
    
    // Update tributos values (if available)
    if (document.getElementById('valor-tributos')) {
        const valorTributos = cards.valor_tributos || 0;
        const percentTributos = cards.percentual_tributos || 0;
        
        document.getElementById('valor-tributos').textContent = formatCurrency(valorTributos);
        
        if (document.getElementById('percent-tributos')) {
            document.getElementById('percent-tributos').textContent = formatPercent(percentTributos) + ' do faturamento';
        }
    }
}

/**
 * Renders financial charts
 * @param {Object} data - Financial data
 */
function renderCharts(data) {
    // Render faturamento mensal chart
    if (document.getElementById('faturamentoMensalChart')) {
        renderFaturamentoMensalChart(data.grafico_cif_fob || []);
    }
    
    // Render CIF/FOB pie chart
    if (document.getElementById('cifFobChart')) {
        renderCifFobChart(data.cards || {});
    }
}

/**
 * Renders the faturamento mensal chart
 * @param {Array} chartData - Chart data
 */
function renderFaturamentoMensalChart(chartData) {
    const canvas = document.getElementById('faturamentoMensalChart');
    if (!canvas) return;
    
    // Destroy previous chart if exists
    if (faturamentoMensalChart) {
        faturamentoMensalChart.destroy();
    }
    
    // Check if there's data to display
    if (!chartData || chartData.length === 0) {
        const container = canvas.parentElement;
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Process chart data
    const labels = [];
    const faturamentoData = [];
    const cifData = [];
    const fobData = [];
    const entregasData = [];
    
    chartData.forEach(item => {
        labels.push(item.mes || '');
        faturamentoData.push(parseFloat(item.faturamento || 0));
        cifData.push(parseFloat(item.cif || 0));
        fobData.push(parseFloat(item.fob || 0));
        entregasData.push(parseInt(item.entregas || 0));
    });
    
    // Create chart
    const ctx = canvas.getContext('2d');
    faturamentoMensalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CIF',
                    data: cifData,
                    backgroundColor: '#4CAF50',
                    order: 3
                },
                {
                    label: 'FOB',
                    data: fobData,
                    backgroundColor: '#1b4d3e',
                    order: 2
                },
                {
                    label: 'Entregas',
                    data: entregasData,
                    type: 'line',
                    yAxisID: 'y1',
                    fill: false,
                    borderColor: '#ff6b6b',
                    pointBackgroundColor: '#ff6b6b',
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
                    text: 'Faturamento Mensal',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === 'Entregas') {
                                return `${context.dataset.label}: ${context.raw} CT-es`;
                            }
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Valor (R$)'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                },
                y1: {
                    beginAtZero: true,
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Quantidade CT-es'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

/**
 * Renders the CIF/FOB pie chart
 * @param {Object} data - Financial data
 */
function renderCifFobChart(data) {
    const canvas = document.getElementById('cifFobChart');
    if (!canvas) return;
    
    // Destroy previous chart if exists
    if (cifFobChart) {
        cifFobChart.destroy();
    }
    
    // Calculate values
    const valorCif = parseFloat(data.valor_cif || 0);
    const valorFob = parseFloat(data.valor_fob || 0);
    
    // Check if there's data to display
    if (valorCif <= 0 && valorFob <= 0) {
        const container = canvas.parentElement;
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Create chart
    const ctx = canvas.getContext('2d');
    cifFobChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['CIF', 'FOB'],
            datasets: [{
                data: [valorCif, valorFob],
                backgroundColor: ['#4CAF50', '#1b4d3e'],
                borderWidth: 0
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
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Updates the agrupamento table based on selected type
 * @param {string} tipo - Agrupamento type (cliente, veiculo, origem, destino, etc.)
 */
function updateAgrupamentoTable(tipo) {
    // Get current filters
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    // Update table title
    updateAgrupamentoTitle(tipo);
    
    // Show loading in table
    const tbody = document.getElementById('agrupamento-dados');
    if (tbody) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                <div class="spinner-border spinner-border-sm text-success" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <span class="ms-2">Carregando dados...</span>
            </td>
        </tr>`;
    }
    
    // Fetch updated data
    loadDetalheFinanceiro(dataInicio, dataFim, tipo);
}

/**
 * Updates agrupamento table title based on type
 * @param {string} tipo - Agrupamento type
 */
function updateAgrupamentoTitle(tipo) {
    const titleMap = {
        'cliente': 'Faturamento por Cliente',
        'veiculo': 'Faturamento por Veículo',
        'origem': 'Faturamento por Município de Origem',
        'destino': 'Faturamento por Município de Destino',
        'distribuidora': 'Faturamento por Distribuidora'
    };
    
    const columnMap = {
        'cliente': 'Cliente',
        'veiculo': 'Veículo',
        'origem': 'Município de Origem',
        'destino': 'Município de Destino',
        'distribuidora': 'Distribuidora'
    };
    
    // Update title
    const title = document.getElementById('agrupamento-titulo');
    if (title) {
        title.textContent = titleMap[tipo] || `Faturamento por ${tipo}`;
    }
    
    // Update column header
    const colHeader = document.getElementById('agrupamento-coluna-nome');
    if (colHeader) {
        colHeader.textContent = columnMap[tipo] || tipo;
    }
}

/**
 * Renders the agrupamento table with data
 * @param {Array} data - Agrupamento data
 * @param {string} tipo - Agrupamento type
 */
function renderAgrupamentoTable(data, tipo) {
    const tbody = document.getElementById('agrupamento-dados');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum dado encontrado para o período selecionado.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    data.forEach(item => {
        html += `
        <tr>
            <td>${item.label || '--'}</td>
            <td>${formatCurrency(item.faturamento_total)}</td>
            <td>${formatNumber(item.qtd_ctes)}</td>
            <td>${formatCurrency(item.valor_medio)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary btn-detalhe" data-id="${item.id}" data-tipo="${tipo}" title="Ver Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders the monthly data table
 * @param {Array} data - Monthly data
 */
function renderMensalTable(data) {
    const tbody = document.getElementById('mensal-dados');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum dado encontrado para o período selecionado.
            </td>
        </tr>`;
        return;
    }
    
    // Sort by date (newest first)
    data.sort((a, b) => {
        return b.mes.localeCompare(a.mes);
    });
    
    let html = '';
    
    data.forEach(item => {
        // Format month for display (YYYY-MM to MM/YYYY)
        const mesParts = item.mes.split('-');
        const mesFormatado = `${mesParts[1]}/${mesParts[0]}`;
        
        html += `
        <tr>
            <td>${mesFormatado}</td>
            <td>${formatCurrency(item.faturamento)}</td>
            <td>${formatCurrency(item.cif)}</td>
            <td>${formatCurrency(item.fob)}</td>
            <td>${formatNumber(item.entregas)}</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

/**
 * Shows detalhe modal with data
 * @param {string} id - Item ID
 * @param {string} tipo - Agrupamento type
 */
function showDetalhe(id, tipo) {
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detalheContent');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Show loading state
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center py-4">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    <div class="text-center">Carregando detalhes...</div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Build API URL based on tipo
    let apiUrl;
    let titlePrefix;
    
    switch (tipo) {
        case 'cliente':
            apiUrl = `/api/ctes/?destinatario_cnpj=${id}`;
            titlePrefix = 'Cliente';
            break;
        case 'veiculo':
            apiUrl = `/api/ctes/?placa=${id}`;
            titlePrefix = 'Veículo';
            break;
        case 'origem':
            apiUrl = `/api/ctes/?uf_origem=${id}`;
            titlePrefix = 'Origem';
            break;
        case 'destino':
            apiUrl = `/api/ctes/?uf_destino=${id}`;
            titlePrefix = 'Destino';
            break;
        default:
            apiUrl = `/api/ctes/?q=${id}`;
            titlePrefix = 'Detalhamento';
    }
    
    // Add date filters
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    
    // Fetch details data
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes');
            }
            return response.json();
        })
        .then(data => {
            const ctes = data.results || data;
            
            // Update modal title
            const label = tipo === 'cliente' ? 
                ctes[0]?.destinatario_nome : 
                (tipo === 'veiculo' ? id : id);
            
            modalTitle.textContent = `${titlePrefix}: ${label || id}`;
            
            // Render detalhe content
            renderDetalheContent(modalBody, ctes, tipo);
        })
        .catch(error => {
            console.error('Error loading detalhe:', error);
            
            // Show error in modal
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes: ${error.message}
            </div>
            `;
        });
}

/**
 * Renders detalhe content in modal
 * @param {Element} container - Modal body element
 * @param {Array} ctes - List of CT-es
 * @param {string} tipo - Agrupamento type
 */
function renderDetalheContent(container, ctes, tipo) {
    if (!ctes || ctes.length === 0) {
        container.innerHTML = `
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum CT-e encontrado para este filtro.
        </div>
        `;
        return;
    }
    
    // Calculate summary stats
    const totalFaturamento = ctes.reduce((total, cte) => total + (parseFloat(cte.valor_total) || 0), 0);
    const totalCtes = ctes.length;
    const valorMedio = totalFaturamento / totalCtes;
    
    // Prepare top info card
    let html = `
    <div class="card mb-3">
        <div class="card-body">
            <div class="row">
                <div class="col-md-4 text-center">
                    <h6 class="text-muted mb-1">Total de CT-es</h6>
                    <p class="h4">${formatNumber(totalCtes)}</p>
                </div>
                <div class="col-md-4 text-center">
                    <h6 class="text-muted mb-1">Faturamento Total</h6>
                    <p class="h4">${formatCurrency(totalFaturamento)}</p>
                </div>
                <div class="col-md-4 text-center">
                    <h6 class="text-muted mb-1">Valor Médio</h6>
                    <p class="h4">${formatCurrency(valorMedio)}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Add table with CT-es
    html += `
    <div class="table-responsive">
        <table class="table table-sm table-hover" id="detalheTable">
            <thead>
                <tr>
                    <th>Número</th>
                    <th>Data Emissão</th>
                    <th>Remetente</th>
                    <th>Destinatário</th>
                    <th>Valor (R$)</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add rows for each CT-e
    ctes.forEach(cte => {
        const dataEmissao = formatDate(cte.data_emissao);
        const statusHTML = getStatusHTML(cte);
        
        html += `
        <tr>
            <td>${cte.numero_cte || '--'}</td>
            <td>${dataEmissao}</td>
            <td>${truncateText(cte.remetente_nome, 20) || '--'}</td>
            <td>${truncateText(cte.destinatario_nome, 20) || '--'}</td>
            <td>${formatCurrency(cte.valor_total)}</td>
            <td>${statusHTML}</td>
        </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Exports table to CSV
 * @param {string} tableId - Table ID
 * @param {string} filename - Export filename
 */
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = table.querySelectorAll('tr');
    const csvContent = [];
    
    // Extract header row
    const headerRow = [];
    const headers = rows[0].querySelectorAll('th');
    headers.forEach(header => {
        headerRow.push(header.textContent.trim());
    });
    csvContent.push(headerRow.join(','));
    
    // Extract data rows (skip first row which is header)
    for (let i = 1; i < rows.length; i++) {
        const row = [];
        const cells = rows[i].querySelectorAll('td');
        
        cells.forEach((cell, index) => {
            // Skip the last column if it contains buttons
            if (index === cells.length - 1 && cell.querySelector('button')) {
                return;
            }
            
            // Remove currency symbols and formatting for numbers
            let content = cell.textContent.trim();
            if (content.includes('R$')) {
                content = content.replace('R$', '').replace(/\./g, '').replace(/,/g, '.');
            }
            
            row.push(content);
        });
        
        csvContent.push(row.join(','));
    }
    
    // Create and trigger download
    const csv = csvContent.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Exports detalhe table to CSV
 */
function exportDetalheToCSV() {
    const tableId = 'detalheTable';
    const filename = document.getElementById('detailModalLabel').textContent.replace(':', '') + '.csv';
    
    exportTableToCSV(tableId, filename);
}

/**
 * Gets status HTML badge for CT-e
 * @param {Object} cte - CT-e data
 * @returns {string} - HTML status badge
 */
function getStatusHTML(cte) {
    // Implementation follows the same pattern as in cte_panel.js
    if (cte.status === 'Cancelado' || (cte.cancelamento && cte.cancelamento.c_stat === 135)) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (cte.status === 'Autorizado' || (cte.protocolo && cte.protocolo.codigo_status === 100)) {
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
 * Formats percentage value
 * @param {number} value - Value to format
 * @returns {string} - Formatted percentage
 */
function formatPercent(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(value / 100 || 0);
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