/**
 * financeiro.js
 * Functions for the financial dashboard panel
 */

// Global chart objects
let faturamentoMensalChartInstance = null;
let cifFobChartInstance = null;

// Cache para os dados do painel principal
let painelFinanceiroData = {}; 

// Constantes de Paginação
const ITEMS_PER_PAGE = 5;

// Estado da Paginação e Cache de Dados para Tabelas
let agrupamentoTableData = {
    allData: [],
    currentPage: 1,
    itemsPerPage: ITEMS_PER_PAGE
};

let mensalTableData = {
    allData: [],
    currentPage: 1,
    itemsPerPage: ITEMS_PER_PAGE
};


document.addEventListener('DOMContentLoaded', function() {
    setDefaultDateRange();
    loadPainelFinanceiroData(); 
    setupEventListeners();
});

function setupEventListeners() {
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            agrupamentoTableData.currentPage = 1; // Reseta página ao filtrar
            mensalTableData.currentPage = 1;    // Reseta página ao filtrar
            loadPainelFinanceiroData();
        });
    }

    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFiltersAndLoad);
    }

    const agrupamentoSelect = document.getElementById('agrupamento');
    if (agrupamentoSelect) {
        agrupamentoSelect.addEventListener('change', function() {
            agrupamentoTableData.currentPage = 1; // Reseta página ao mudar agrupamento
            const dataInicioFiltro = painelFinanceiroData.filtros?.data_inicio || document.getElementById('data_inicio').value;
            const dataFimFiltro = painelFinanceiroData.filtros?.data_fim || document.getElementById('data_fim').value;
            loadAgrupamentoData(dataInicioFiltro, dataFimFiltro, this.value);
        });
    }

    const agrupamentoDadosBody = document.getElementById('agrupamento-dados-body');
    if (agrupamentoDadosBody) {
        agrupamentoDadosBody.addEventListener('click', function(e) {
            const btnDetalhe = e.target.closest('.btn-detalhe');
            if (btnDetalhe) {
                const id = btnDetalhe.dataset.id;
                const tipo = btnDetalhe.dataset.tipo;
                const nome = btnDetalhe.dataset.nome || id; 
                showDetalheModal(id, tipo, nome);
            }
        });
    }
    
    const exportAgrupamentoBtn = document.getElementById('exportAgrupamentoBtn');
    if (exportAgrupamentoBtn) {
        exportAgrupamentoBtn.addEventListener('click', function() {
            const agrupamento = document.getElementById('agrupamento').value;
            const dataInicio = document.getElementById('data_inicio').value.replace(/-/g, '');
            const dataFim = document.getElementById('data_fim').value.replace(/-/g, '');
            const filename = `faturamento_${agrupamento}_${dataInicio}_${dataFim}.csv`;
            // Para exportar todos os dados, não apenas a página atual:
            exportFullDataToCSV(agrupamentoTableData.allData, ['label', 'faturamento_total', 'qtd_ctes', 'valor_medio'], filename, ['Agrupamento', 'Faturamento Total', 'Qt. CT-es', 'Ticket Médio']);
        });
    }
    
    const exportMensalBtn = document.getElementById('exportMensalBtn');
    if (exportMensalBtn) {
        exportMensalBtn.addEventListener('click', function() {
            const dataInicio = document.getElementById('data_inicio').value.replace(/-/g, '');
            const dataFim = document.getElementById('data_fim').value.replace(/-/g, '');
            // Para exportar todos os dados:
            exportFullDataToCSV(mensalTableData.allData, ['mes', 'faturamento', 'cif', 'fob', 'entregas'], `detalhamento_mensal_${dataInicio}_${dataFim}.csv`, ['Mês/Ano', 'Faturamento Total', 'Valor CIF', 'Valor FOB', 'Qt. Entregas']);
        });
    }

    const exportDetalheBtn = document.getElementById('exportDetalheBtn');
    if (exportDetalheBtn) {
        exportDetalheBtn.addEventListener('click', function() {
            const modalLabel = document.getElementById('detailModalLabel').textContent;
            const dataInicio = document.getElementById('data_inicio').value.replace(/-/g, '');
            const dataFim = document.getElementById('data_fim').value.replace(/-/g, '');
            const filenameBase = modalLabel.replace(/[:\s]/g, '_').replace(/__+/g, '_');
            const filename = `${filenameBase}_${dataInicio}_${dataFim}.csv`;
            exportTableToCSV('detalheTableModal', filename); 
        });
    }
    
    // Listeners para paginação (exemplo para tabela de agrupamento)
    const agrupamentoPagination = document.getElementById('agrupamento-pagination');
    if (agrupamentoPagination) {
        agrupamentoPagination.addEventListener('click', function(e) {
            e.preventDefault();
            const pageLink = e.target.closest('.page-link');
            if (pageLink && !pageLink.parentElement.classList.contains('disabled') && !pageLink.parentElement.classList.contains('active')) {
                const page = parseInt(pageLink.dataset.page);
                if (page) {
                    agrupamentoTableData.currentPage = page;
                    renderAgrupamentoTable(agrupamentoTableData.allData, document.getElementById('agrupamento').value);
                }
            }
        });
    }

    const mensalPagination = document.getElementById('mensal-pagination');
    if (mensalPagination) {
        mensalPagination.addEventListener('click', function(e) {
            e.preventDefault();
            const pageLink = e.target.closest('.page-link');
            if (pageLink && !pageLink.parentElement.classList.contains('disabled') && !pageLink.parentElement.classList.contains('active')) {
                const page = parseInt(pageLink.dataset.page);
                if (page) {
                    mensalTableData.currentPage = page;
                    renderDetalhamentoMensalTable(mensalTableData.allData);
                }
            }
        });
    }
}

function setDefaultDateRange() {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1); 
    document.getElementById('data_inicio').value = formatDateForInput(firstDayOfYear);
    document.getElementById('data_fim').value = formatDateForInput(today); 
}

function resetFiltersAndLoad() {
    document.getElementById('filterForm')?.reset();
    setDefaultDateRange();
    document.getElementById('agrupamento').value = 'cliente'; 
    agrupamentoTableData.currentPage = 1;
    mensalTableData.currentPage = 1;
    loadPainelFinanceiroData();
}

function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return new Date().toISOString().split('T')[0]; 
    }
    return date.toISOString().split('T')[0];
}

function ensureCanvasExists(containerId, canvasId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container de gráfico '${containerId}' não encontrado.`);
        return null;
    }
    container.innerHTML = ''; 
    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);
    return newCanvas;
}

function loadPainelFinanceiroData() {
    showLoadingState();
    
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const agrupamento = document.getElementById('agrupamento').value;

    const apiUrl = `/api/painel/financeiro/?data_inicio=${dataInicio}&data_fim=${dataFim}`;
    
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    let errorDetail = text;
                    try { const jsonError = JSON.parse(text); errorDetail = jsonError.detail || JSON.stringify(jsonError); } 
                    catch (e) { /* não é JSON */ }
                    throw new Error(`Falha ao carregar dados do painel financeiro (status: ${response.status}). Detalhe: ${errorDetail}`);
                });
            }
            return response.json();
        })
        .then(data => {
            painelFinanceiroData = data; 
            updateFinancialCards(data.cards);
            renderFaturamentoMensalChart(data.grafico_cif_fob || []); 
            renderCifFobPieChart(data.cards || {});           
            
            // Armazena dados completos para tabela mensal e renderiza a primeira página
            mensalTableData.allData = data.grafico_cif_fob || [];
            mensalTableData.currentPage = 1; // Garante que começa na primeira página
            renderDetalhamentoMensalTable(mensalTableData.allData); 
            
            return loadAgrupamentoData(dataInicio, dataFim, agrupamento);
        })
        .catch(error => {
            console.error('Erro ao carregar dados do painel financeiro:', error);
            showNotification(`Erro ao carregar painel: ${error.message}`, 'error');
            clearUIOnFailure();
        })
        .finally(() => {
            hideLoadingState();
        });
}

function loadAgrupamentoData(dataInicio, dataFim, tipoAgrupamento) {
    const agrupamentoTableBody = document.getElementById('agrupamento-dados-body');
    if (agrupamentoTableBody) {
        agrupamentoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-success me-2" role="status"></div> Carregando faturamento por ${tipoAgrupamento}...</td></tr>`;
    }
    updateAgrupamentoTitle(tipoAgrupamento);
    document.getElementById('agrupamento-pagination').innerHTML = ''; // Limpa paginação antiga

    const detailApiUrl = `/api/financeiro/detalhe/?data_inicio=${dataInicio}&data_fim=${dataFim}&tipo=${tipoAgrupamento}`;

    return Auth.fetchWithAuth(detailApiUrl)
        .then(response => response.json())
        .then(data => {
            // Armazena dados completos para tabela de agrupamento e renderiza a primeira página
            agrupamentoTableData.allData = data || [];
            agrupamentoTableData.currentPage = 1; // Garante que começa na primeira página
            renderAgrupamentoTable(agrupamentoTableData.allData, tipoAgrupamento);
        })
        .catch(error => {
            console.error(`Erro ao carregar dados de agrupamento (${tipoAgrupamento}):`, error);
            showNotification(`Erro ao carregar faturamento por ${tipoAgrupamento}: ${error.message}`, 'error');
            if (agrupamentoTableBody) {
                agrupamentoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Falha ao carregar dados.</td></tr>`;
            }
        });
}

// ... (showLoadingState, hideLoadingState, clearUIOnFailure, updateFinancialCards, renderFaturamentoMensalChart, renderCifFobPieChart - MANTENHA COMO ANTES) ...
function showLoadingState() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) applyBtn.disabled = true;
    
    const elementsToSpinner = ['faturamento-total', 'total-ctes', 'ticket-medio', 'valor-cif', 'valor-fob'];
    elementsToSpinner.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Carregando...</span></div>`;
    });
    const percentCifEl = document.getElementById('percent-cif');
    if (percentCifEl) percentCifEl.textContent = '...';
    const percentFobEl = document.getElementById('percent-fob');
    if (percentFobEl) percentFobEl.textContent = '...';

    const agrupamentoTableBody = document.getElementById('agrupamento-dados-body');
    if (agrupamentoTableBody) agrupamentoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-success me-2" role="status"></div> Carregando...</td></tr>`;
    
    const mensalTableBody = document.getElementById('mensal-dados-body');
    if (mensalTableBody) mensalTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-success me-2" role="status"></div> Carregando...</td></tr>`;

    const faturamentoChartContainer = document.getElementById('faturamentoMensalChartContainer');
    if (faturamentoChartContainer) faturamentoChartContainer.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Carregando gráfico...</p></div>`;
    const cifFobChartContainer = document.getElementById('cifFobChartContainer');
    if (cifFobChartContainer) cifFobChartContainer.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Carregando gráfico...</p></div>`;
}

function hideLoadingState() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) applyBtn.disabled = false;
}

function clearUIOnFailure() {
    const cardsToClear = {
        'faturamento-total': 'R$ 0,00', 'total-ctes': '0', 'ticket-medio': 'R$ 0,00',
        'valor-cif': 'R$ 0,00', 'valor-fob': 'R$ 0,00'
    };
    for (const id in cardsToClear) {
        const el = document.getElementById(id);
        if (el) el.textContent = cardsToClear[id];
    }
    const percentCifEl = document.getElementById('percent-cif');
    if(percentCifEl) percentCifEl.textContent = '0% do total';
    const percentFobEl = document.getElementById('percent-fob');
    if(percentFobEl) percentFobEl.textContent = '0% do total';

    if (faturamentoMensalChartInstance) {
        faturamentoMensalChartInstance.destroy();
        faturamentoMensalChartInstance = null;
    }
    if (cifFobChartInstance) {
        cifFobChartInstance.destroy();
        cifFobChartInstance = null;
    }
    
    const faturamentoChartContainer = document.getElementById('faturamentoMensalChartContainer');
    if(faturamentoChartContainer) faturamentoChartContainer.innerHTML = `<div class="alert alert-danger m-3 text-center p-5">Falha ao carregar gráfico de faturamento.</div>`;
    const cifFobChartContainer = document.getElementById('cifFobChartContainer');
    if(cifFobChartContainer) cifFobChartContainer.innerHTML = `<div class="alert alert-danger m-3 text-center p-5">Falha ao carregar gráfico CIF/FOB.</div>`;

    const agrupamentoTableBody = document.getElementById('agrupamento-dados-body');
    if (agrupamentoTableBody) {
        agrupamentoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Falha ao carregar dados.</td></tr>`;
        document.getElementById('agrupamento-pagination').innerHTML = ''; // Limpa paginação
    }
    const mensalTableBody = document.getElementById('mensal-dados-body');
    if (mensalTableBody) {
        mensalTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Falha ao carregar dados.</td></tr>`;
        document.getElementById('mensal-pagination').innerHTML = ''; // Limpa paginação
    }
}

function updateFinancialCards(cardsData) {
    if (!cardsData) {
        const defaultValue = 'N/A';
        document.getElementById('faturamento-total').textContent = defaultValue;
        document.getElementById('total-ctes').textContent = defaultValue;
        document.getElementById('ticket-medio').textContent = defaultValue;
        document.getElementById('valor-cif').textContent = defaultValue;
        document.getElementById('percent-cif').textContent = '0%';
        document.getElementById('valor-fob').textContent = defaultValue;
        document.getElementById('percent-fob').textContent = '0%';
        return;
    }
    document.getElementById('faturamento-total').textContent = formatCurrency(cardsData.faturamento_total);
    document.getElementById('total-ctes').textContent = formatNumber(cardsData.total_ctes);
    document.getElementById('ticket-medio').textContent = formatCurrency(cardsData.ticket_medio);
    document.getElementById('valor-cif').textContent = formatCurrency(cardsData.valor_cif);
    document.getElementById('percent-cif').textContent = `${formatPercent(cardsData.percentual_cif)} do total`;
    document.getElementById('valor-fob').textContent = formatCurrency(cardsData.valor_fob);
    document.getElementById('percent-fob').textContent = `${formatPercent(cardsData.percentual_fob)} do total`;
}

function renderFaturamentoMensalChart(graficoData) {
    const containerId = 'faturamentoMensalChartContainer';
    const canvasId = 'faturamentoMensalChart';

    if (faturamentoMensalChartInstance) {
        faturamentoMensalChartInstance.destroy();
        faturamentoMensalChartInstance = null;
    }
    const canvas = ensureCanvasExists(containerId, canvasId);
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    const container = document.getElementById(containerId); 

    if (!graficoData || graficoData.length === 0) {
        if (container) container.innerHTML = `<div class="alert alert-info m-3 text-center p-5">Sem dados de faturamento mensal para o período.</div>`;
        return;
    }
    const labels = graficoData.map(item => item.mes); 
    const faturamentoValues = graficoData.map(item => parseFloat(item.faturamento) || 0);
    const entregasValues = graficoData.map(item => parseInt(item.entregas) || 0);

    faturamentoMensalChartInstance = new Chart(ctx, { /* ...opções do gráfico como antes ... */ 
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Faturamento Total', data: faturamentoValues, backgroundColor: 'rgba(28, 200, 138, 0.6)', 
                    borderColor: 'rgba(28, 200, 138, 1)', borderWidth: 1, yAxisID: 'y', order: 2 
                },
                {
                    label: 'Entregas (CT-es)', data: entregasValues, type: 'line', borderColor: '#dc3545', 
                    backgroundColor: 'rgba(220, 53, 69, 0.1)', tension: 0.1, yAxisID: 'y1', fill: false, order: 1 
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            stacked: false, 
            plugins: {
                title: { display: false }, 
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.yAxisID === 'y1') label += formatNumber(context.raw) + ' CT-es';
                            else label += formatCurrency(context.raw);
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Valor (R$)' }, ticks: { callback: value => formatCurrency(value, '') } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Qt. Entregas' }, grid: { drawOnChartArea: false }, ticks: { callback: value => formatNumber(value) } }
            }
        }
    });
}

function renderCifFobPieChart(cardsData) {
    const containerId = 'cifFobChartContainer'; 
    const canvasId = 'cifFobChart';    

    if (cifFobChartInstance) {
        cifFobChartInstance.destroy();
        cifFobChartInstance = null;
    }
    const canvas = ensureCanvasExists(containerId, canvasId);
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    const container = document.getElementById(containerId); 

    const valorCif = parseFloat(cardsData.valor_cif) || 0;
    const valorFob = parseFloat(cardsData.valor_fob) || 0;

    if (valorCif === 0 && valorFob === 0) {
        if (container) container.innerHTML = `<div class="alert alert-info m-3 text-center p-5">Sem dados CIF/FOB para o período.</div>`;
        return;
    }
    cifFobChartInstance = new Chart(ctx, { /* ...opções do gráfico como antes ... */ 
        type: 'doughnut',
        data: {
            labels: ['CIF', 'FOB'],
            datasets: [{ label: 'Distribuição', data: [valorCif, valorFob], backgroundColor: ['#36b9cc', '#f6c23e'], hoverOffset: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }, title: { display: false }, 
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw;
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? formatPercent((value / total) * 100, 1) : '0,0%';
                            return `${label}: ${formatCurrency(value)} (${percentage})`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renderiza a tabela de Detalhamento Mensal com paginação.
 * @param {Array} allData - Todos os dados mensais.
 */
function renderDetalhamentoMensalTable(allData) {
    mensalTableData.allData = allData || []; // Atualiza o cache de dados
    const tbody = document.getElementById('mensal-dados-body');
    const paginationContainer = document.getElementById('mensal-pagination');
    if (!tbody || !paginationContainer) return;

    if (mensalTableData.allData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3">Nenhum dado mensal encontrado para o período.</td></tr>`;
        paginationContainer.innerHTML = '';
        return;
    }

    const pageData = getPaginatedData(mensalTableData.allData, mensalTableData.currentPage, mensalTableData.itemsPerPage);
    let html = '';
    pageData.forEach(item => {
        html += `
        <tr>
            <td>${item.mes || '--'}</td>
            <td>${formatCurrency(item.faturamento)}</td>
            <td>${formatCurrency(item.cif)}</td>
            <td>${formatCurrency(item.fob)}</td>
            <td class="text-center">${formatNumber(item.entregas)}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderPaginationControls(paginationContainer, mensalTableData.currentPage, mensalTableData.allData.length, mensalTableData.itemsPerPage);
}

function updateAgrupamentoTitle(tipo) {
    const titleMap = { 'cliente': 'Faturamento por Cliente', 'veiculo': 'Faturamento por Veículo', 'distribuidora': 'Faturamento por Distribuidora (Remetente)' };
    const columnMap = { 'cliente': 'Cliente (Destinatário)', 'veiculo': 'Veículo (Placa)', 'distribuidora': 'Distribuidora (Remetente)' };
    const titleEl = document.getElementById('agrupamento-titulo');
    if(titleEl) titleEl.textContent = titleMap[tipo] || `Faturamento por ${tipo}`;
    const columnEl = document.getElementById('agrupamento-coluna-nome');
    if(columnEl) columnEl.textContent = columnMap[tipo] || tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

/**
 * Renderiza a tabela de Agrupamento com paginação.
 * @param {Array} allData - Todos os dados de agrupamento.
 * @param {string} tipoAgrupamento - O tipo de agrupamento atual.
 */
function renderAgrupamentoTable(allData, tipoAgrupamento) {
    agrupamentoTableData.allData = allData || []; // Atualiza o cache
    const tbody = document.getElementById('agrupamento-dados-body');
    const paginationContainer = document.getElementById('agrupamento-pagination');
    if (!tbody || !paginationContainer) return;

    if (agrupamentoTableData.allData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3">Nenhum dado encontrado para agrupar por ${tipoAgrupamento}.</td></tr>`;
        paginationContainer.innerHTML = '';
        return;
    }
    
    const pageData = getPaginatedData(agrupamentoTableData.allData, agrupamentoTableData.currentPage, agrupamentoTableData.itemsPerPage);
    let html = '';
    pageData.forEach(item => {
        html += `
        <tr>
            <td>${item.label || item.id || '--'}</td>
            <td>${formatCurrency(item.faturamento_total)}</td>
            <td class="text-center">${formatNumber(item.qtd_ctes)}</td>
            <td>${formatCurrency(item.valor_medio)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary btn-detalhe" 
                        data-id="${item.id}" data-tipo="${tipoAgrupamento}" data-nome="${escapeHtml(item.label || item.id)}"
                        title="Ver Detalhes de ${escapeHtml(item.label || item.id)}">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderPaginationControls(paginationContainer, agrupamentoTableData.currentPage, agrupamentoTableData.allData.length, agrupamentoTableData.itemsPerPage);
}


/**
 * Retorna uma fatia dos dados para a página atual.
 * @param {Array} allData - Array completo de dados.
 * @param {number} currentPage - A página atual (1-indexed).
 * @param {number} itemsPerPage - Quantidade de itens por página.
 * @returns {Array} - Array com os dados da página atual.
 */
function getPaginatedData(allData, currentPage, itemsPerPage) {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return allData.slice(startIndex, endIndex);
}

/**
 * Renderiza os controles de paginação.
 * @param {HTMLElement} container - O elemento UL onde a paginação será renderizada.
 * @param {number} currentPage - A página atual.
 * @param {number} totalItems - O número total de itens.
 * @param {number} itemsPerPage - Itens por página.
 */
function renderPaginationControls(container, currentPage, totalItems, itemsPerPage) {
    if (!container) return;
    container.innerHTML = ''; // Limpa controles antigos

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return; // Não mostra paginação se só tem 1 página

    let html = '';

    // Botão "Anterior"
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}">
                <a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Anterior">
                    <span aria-hidden="true">&laquo;</span>
                </a>
             </li>`;

    // Links das páginas (exibe um número limitado de links)
    const maxPageLinks = 5; // Quantos links de página mostrar (excluindo prev/next)
    let startPage, endPage;
    if (totalPages <= maxPageLinks) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const maxPagesBeforeCurrentPage = Math.floor(maxPageLinks / 2);
        const maxPagesAfterCurrentPage = Math.ceil(maxPageLinks / 2) - 1;
        if (currentPage <= maxPagesBeforeCurrentPage) {
            startPage = 1;
            endPage = maxPageLinks;
        } else if (currentPage + maxPagesAfterCurrentPage >= totalPages) {
            startPage = totalPages - maxPageLinks + 1;
            endPage = totalPages;
        } else {
            startPage = currentPage - maxPagesBeforeCurrentPage;
            endPage = currentPage + maxPagesAfterCurrentPage;
        }
    }
    
    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item${i === currentPage ? ' active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                 </li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
    }

    // Botão "Próximo"
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}">
                <a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Próximo">
                    <span aria-hidden="true">&raquo;</span>
                </a>
             </li>`;
    
    container.innerHTML = html;
}


function showDetalheModal(id, tipo, nome) {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBodyContainer = document.getElementById('detalheModalBody'); 
    
    if (!modal || !modalTitle || !modalBodyContainer) return;

    modalTitle.textContent = `Detalhes: ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} - ${nome}`;
    modalBodyContainer.innerHTML = `<div id="detalheContent"><div class="text-center py-4"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div><p class="mt-2">Carregando detalhes...</p></div></div>`;

    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    const dataInicio = painelFinanceiroData.filtros?.data_inicio || document.getElementById('data_inicio').value;
    const dataFim = painelFinanceiroData.filtros?.data_fim || document.getElementById('data_fim').value;
    
    let apiUrl = `/api/ctes/?`; 
    const filterFieldMap = {
        'cliente': 'destinatario_cnpj', 'veiculo': 'placa_veiculo', 'distribuidora': 'remetente_cnpj' 
    };
    const filterField = filterFieldMap[tipo];

    if (filterField) apiUrl += `${filterField}=${encodeURIComponent(id)}`;
    else {
        document.getElementById('detalheContent').innerHTML = `<div class="alert alert-warning">Tipo de detalhe não configurado para filtro: ${tipo}</div>`;
        return;
    }
    
    if (dataInicio) apiUrl += `&data_emissao_gte=${dataInicio}`; 
    if (dataFim) apiUrl += `&data_emissao_lte=${dataFim}`;
    apiUrl += `&page_size=200`; // Carrega um bom número de CTes para o modal, paginação no modal é mais complexa

    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    let errorDetail = text;
                    try { const jsonError = JSON.parse(text); errorDetail = jsonError.detail || JSON.stringify(jsonError); } catch (e) { /* não é JSON */ }
                    throw new Error(`Falha ao carregar detalhes do ${tipo} (status: ${response.status}). Detalhe: ${errorDetail}`);
                });
            }
            return response.json();
        })
        .then(data => {
            renderDetalheContentInModal(document.getElementById('detalheContent'), data.results || data, tipo);
        })
        .catch(error => {
            console.error(`Erro ao carregar detalhes para ${tipo} ${id}:`, error);
            document.getElementById('detalheContent').innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        });
}

function renderDetalheContentInModal(container, ctes, tipo) {
    if (!container) return;
    if (!ctes || ctes.length === 0) {
        container.innerHTML = `<div class="alert alert-info text-center mt-3">Nenhum CT-e encontrado para este ${tipo} no período selecionado.</div>`;
        return;
    }
    const totalFaturamentoModal = ctes.reduce((sum, cte) => sum + (parseFloat(cte.valor_total_prestacao || cte.valor_total_servico) || 0), 0);
    const totalCtesModal = ctes.length;
    const ticketMedioModal = totalCtesModal > 0 ? totalFaturamentoModal / totalCtesModal : 0;

    let html = `
    <div class="card mb-3 shadow-sm">
        <div class="card-body row text-center">
            <div class="col-md-4 border-end"><h6 class="text-muted mb-1">Total CT-es</h6><p class="h5 mb-0">${formatNumber(totalCtesModal)}</p></div>
            <div class="col-md-4 border-end"><h6 class="text-muted mb-1">Faturamento</h6><p class="h5 mb-0">${formatCurrency(totalFaturamentoModal)}</p></div>
            <div class="col-md-4"><h6 class="text-muted mb-1">Ticket Médio</h6><p class="h5 mb-0">${formatCurrency(ticketMedioModal)}</p></div>
        </div>
    </div>
    <div class="table-responsive" style="max-height: 400px;">
        <table class="table table-sm table-hover table-striped" id="detalheTableModal">
            <thead class="table-light">
                <tr><th>Nº CT-e</th><th>Emissão</th><th>Remetente</th><th>Destinatário</th><th>Valor (R$)</th><th>Status</th></tr>
            </thead>
            <tbody>`;
    ctes.forEach(cte => {
        html += `
        <tr>
            <td>${cte.numero_cte || '--'}</td><td>${formatDate(cte.data_emissao) || '--'}</td>
            <td>${truncateText(cte.remetente_razao_social || cte.remetente_cnpj, 25)}</td>
            <td>${truncateText(cte.destinatario_razao_social || cte.destinatario_cnpj, 25)}</td>
            <td class="text-end">${formatCurrency(cte.valor_total_prestacao || cte.valor_total_servico)}</td>
            <td class="text-center">${getStatusBadgeHTML(cte)}</td>
        </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function getStatusBadgeHTML(cte) {
    if (cte.cancelado) return '<span class="badge bg-danger">Cancelado</span>';
    let statusText = cte.status_sefaz || cte.status || 'Desconhecido'; 
    let badgeClass = 'bg-secondary';
    if (statusText === 'Cancelado') badgeClass = 'bg-danger';
    else if (statusText === 'Autorizado' || cte.protocolo_codigo_status === 100) { statusText = 'Autorizado'; badgeClass = 'bg-success';}
    else if (statusText.toLowerCase().includes('rejeitado')) badgeClass = 'bg-warning text-dark';
    else if (cte.processado && (statusText === 'Desconhecido' || !statusText)) { statusText = 'Processado'; badgeClass = 'bg-info';}
    return `<span class="badge ${badgeClass}">${statusText}</span>`;
}

function formatCurrency(value, ifNull = 'R$ 0,00') {
    if (value === null || value === undefined || isNaN(Number(value))) return ifNull;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function formatNumber(value, ifNull = '0') {
    if (value === null || value === undefined || isNaN(Number(value))) return ifNull;
    return new Intl.NumberFormat('pt-BR').format(Number(value));
}

function formatPercent(value, fractionDigits = 1, ifNull = '0,0%') {
    if (value === null || value === undefined || isNaN(Number(value))) return ifNull;
    const numericValue = Number(value) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(numericValue);
}

function formatDate(dateString, ifNull = '--') {
    if (!dateString) return ifNull;
    const date = new Date(dateString);
    if (isNaN(date.getTime()) || date.getFullYear() < 1900) { 
        if (/\d{2}\/\d{2}\/\d{4}/.test(dateString) || /\d{4}-\d{2}-\d{2}/.test(dateString)) return dateString.split('T')[0].replace(/-/g, '/');
        return ifNull;
    }
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); 
}

function truncateText(text, maxLength = 30) {
    if (text === null || text === undefined) return '--';
    const strText = String(text);
    return strText.length > maxLength ? strText.substring(0, maxLength - 3) + '...' : strText;
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Exporta dados completos de uma tabela (não apenas a página visível) para CSV.
 * @param {Array} allData - O array completo de dados para a tabela.
 * @param {Array<string>} headersOrder - Array com os nomes das chaves dos objetos em `allData` na ordem desejada.
 * @param {string} filename - Nome do arquivo CSV.
 * @param {Array<string>} displayHeaders - Array com os nomes das colunas para o cabeçalho do CSV.
 */
function exportFullDataToCSV(allData, headersOrder, filename, displayHeaders) {
    if (!allData || allData.length === 0) {
        showNotification('Não há dados para exportar.', 'info');
        return;
    }
    let csv = [];
    // Adiciona cabeçalho customizado
    csv.push(displayHeaders.map(header => `"${header.replace(/"/g, '""')}"`).join(','));

    // Adiciona linhas de dados
    allData.forEach(item => {
        const rowData = headersOrder.map(key => {
            let cellValue = item[key];
            if (cellValue === null || cellValue === undefined) {
                cellValue = '';
            } else if (typeof cellValue === 'number') {
                // Formata números: usa ponto como decimal, sem separador de milhar para CSV puro
                if (key.toLowerCase().includes('faturamento') || key.toLowerCase().includes('valor') || key.toLowerCase().includes('cif') || key.toLowerCase().includes('fob')) {
                     cellValue = formatCurrency(cellValue).replace("R$", "").trim().replace(/\./g, "").replace(",", "."); // Preserva apenas o número formatado para CSV
                } else {
                    cellValue = String(cellValue); // Números como qtd_ctes, entregas
                }
            } else {
                cellValue = String(cellValue);
            }
            return `"${cellValue.replace(/"/g, '""')}"`;
        });
        csv.push(rowData.join(','));
    });

    const csvFileContent = "\uFEFF" + csv.join("\n"); 
    const blob = new Blob([csvFileContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Exportação de '${filename}' concluída.`, 'success');
}


function exportTableToCSV(tableId, filename) { // Mantida para exportação do modal (tabela visível)
    const table = document.getElementById(tableId);
    if (!table) {
        showNotification(`Tabela com ID '${tableId}' não encontrada para exportação.`, 'error');
        return;
    }
    let csv = [];
    const rows = table.querySelectorAll("tr");
    
    for (const row of rows) {
        const cols = row.querySelectorAll("td, th");
        const rowData = [];
        for (const col of cols) {
            let cellText = col.innerText.trim();
            if (cellText.startsWith("R$")) cellText = cellText.replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
            else cellText = cellText.replace(/\./g, "").replace(",", "."); 
            
            cellText = cellText.replace(/\n/g, " ").replace(/"/g, '""');
            rowData.push(`"${cellText}"`); 
        }
        const lastCellContent = row.cells.length > 0 ? row.cells[row.cells.length - 1].innerHTML : "";
        if (lastCellContent.includes("<button") && rowData.slice(0, -1).every(d => d === '""' || d === '"--"' )) continue; 
        csv.push(rowData.join(","));
    }
    const csvFileContent = "\uFEFF" + csv.join("\n"); 
    const blob = new Blob([csvFileContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Tabela '${filename}' exportada com sucesso.`, 'success');
}

function showNotification(message, type = 'success', duration = 5000) {
    const typeClasses = { success: 'bg-success text-white', error: 'bg-danger text-white', warning: 'bg-warning text-dark', info: 'bg-info text-dark' };
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1090'; 
        document.body.appendChild(toastContainer);
    }
    const toastID = 'toast-' + Date.now();
    const toastHTML = `
    <div id="${toastID}" class="toast ${typeClasses[type] || typeClasses.info}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close ${type === 'success' || type === 'error' ? 'btn-close-white' : ''} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>`;
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastID);
    const toast = new bootstrap.Toast(toastElement, { delay: duration });
    toast.show();
    toastElement.addEventListener('hidden.bs.toast', function() { this.remove(); if (toastContainer.children.length === 0) toastContainer.remove(); });
}

if (typeof Auth === 'undefined') {
    console.warn("Auth object not found for financeiro.js. Using mock. Ensure Auth is properly included.");
    window.Auth = { fetchWithAuth: function(url, options = {}) { return fetch(url, options); } };
}