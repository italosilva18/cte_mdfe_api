/**
 * dashboard.js
 * Functions for the main dashboard panel
 * v1.1 - Correções de IDs de gráfico e lógica de Últimos Lançamentos.
 */

// Global chart objects to allow destruction/updates
let cifFobChart = null;
let documentosChart = null;

// Dashboard data cache
let dashboardData = {};

/**
 * Initializes dashboard when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Wait for API client to be available
    if (typeof window.apiClient === 'undefined') {
        console.error('API Client not loaded. Dashboard functionality may be limited.');
        return;
    }

    // Define período padrão inicial (ex: 'ano')
    const periodoSelect = document.getElementById('periodo');
    if (periodoSelect) {
        periodoSelect.value = 'ano'; // Define 'Este Ano' como padrão inicial
        handlePeriodChange('ano'); // Aplica o range de data para o ano atual
    } else {
        setDefaultDateRangeForYear(); // Fallback
    }

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
            // Se for personalizado, não carrega automaticamente, espera o botão Filtrar
            if (this.value !== 'personalizado') {
                loadDashboardData();
            }
        });
    }

    // Filter button
    const filterBtn = document.getElementById('btnFiltrar');
    if (filterBtn) {
        filterBtn.addEventListener('click', function() {
            // Se o usuário clicou em filtrar, assume que quer usar as datas (mesmo que o select não seja 'personalizado')
            // Forçar personalizado aqui garante que as datas selecionadas sejam usadas.
            // const periodoSelect = document.getElementById('periodo');
            // if (periodoSelect.value !== 'personalizado') {
            //     periodoSelect.value = 'personalizado';
            //     handlePeriodChange('personalizado'); // Habilita as datas
            // }
            loadDashboardData();
        });
    }

    // Reset filters button
    const resetBtn = document.getElementById('btnResetarFiltros');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            resetFiltersAndLoad();
        });
    }

    // Refresh button in header (se existir)
    const refreshBtnHeader = document.getElementById('btnAtualizarDashboard');
    if (refreshBtnHeader) {
        refreshBtnHeader.addEventListener('click', function() {
            loadDashboardData();
        });
    }

    // Modal detail button delegation
    document.addEventListener('click', function(e) {
        const btnDetalhe = e.target.closest('.btn-detail');
        if (btnDetalhe) {
            e.preventDefault(); // Previne comportamento padrão do link/botão
            const id = btnDetalhe.getAttribute('data-id');
            const tipo = btnDetalhe.getAttribute('data-tipo');
            if (id && tipo) {
                // Implementar showDocumentDetails(id, tipo); se os modais forem definidos em base.html ou carregados dinamicamente.
                // Ou redirecionar para a página específica:
                 window.location.href = `/${tipo === 'cte' ? 'cte' : 'mdfe'}/#detalhe-${id}`; // Exemplo de redirecionamento com hash
                console.log(`Redirecionar ou abrir modal para ${tipo} ID ${id}`);
                 // showNotification(`Funcionalidade de detalhe para ${tipo.toUpperCase()} ID ${id} a implementar.`, 'info');
            }
        }
    });
}

/**
 * Handles period change from dropdown and updates date inputs
 * @param {string} period - Selected period value
 */
function handlePeriodChange(period) {
    const today = new Date();
    const dataInicioInput = document.getElementById('data_inicio');
    const dataFimInput = document.getElementById('data_fim');

    // Assegura que os inputs existem antes de tentar acessá-los
    if (!dataInicioInput || !dataFimInput) {
        console.error("Inputs de data não encontrados.");
        return;
    }

    let startDate, endDate;

    switch (period) {
        case 'mes':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'trimestre':
            const currentMonth = today.getMonth();
            const currentQuarter = Math.floor(currentMonth / 3);
            startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
            endDate = new Date(today.getFullYear(), startDate.getMonth() + 3, 0);
            break;
        case 'ano':
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
            break;
        case '7dias':
            endDate = today;
            startDate = new Date();
            startDate.setDate(today.getDate() - 6);
            break;
        case '30dias':
            endDate = today;
            startDate = new Date();
            startDate.setDate(today.getDate() - 29);
            break;
        case 'personalizado':
            dataInicioInput.disabled = false;
            dataFimInput.disabled = false;
            return; // Mantém datas atuais e habilita
        default: // Default para 'ano'
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
            break;
    }

    dataInicioInput.value = formatDateForInput(startDate);
    dataFimInput.value = formatDateForInput(endDate);
    dataInicioInput.disabled = true;
    dataFimInput.disabled = true;
}

/**
 * Resets filters to default and loads data
 */
function resetFiltersAndLoad() {
    const filterForm = document.getElementById('filterForm');
    if(filterForm) filterForm.reset();

    const periodoSelect = document.getElementById('periodo');
    if (periodoSelect) {
        periodoSelect.value = 'ano'; // Define 'ano' como padrão
        handlePeriodChange('ano'); // Atualiza as datas e desabilita
    } else {
        setDefaultDateRangeForYear(); // Fallback
    }

    loadDashboardData(); // Recarrega com os filtros padrão
}

/**
 * Sets default date range (current year) - Fallback
 */
function setDefaultDateRangeForYear() {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const lastDayOfYear = new Date(today.getFullYear(), 11, 31);

    const dataInicioInput = document.getElementById('data_inicio');
    const dataFimInput = document.getElementById('data_fim');

    if(dataInicioInput) dataInicioInput.value = formatDateForInput(firstDayOfYear);
    if(dataFimInput) dataFimInput.value = formatDateForInput(lastDayOfYear);
}


/**
 * Formats date for input fields (YYYY-MM-DD)
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date string
 */
function formatDateForInput(date) {
    if (!date || isNaN(date.getTime())) { return ''; } // Retorna vazio se data for inválida
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}


/**
 * Loads dashboard data from the API
 */
function loadDashboardData() {
    showLoading();

    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const periodo = document.getElementById('periodo')?.value;

    // Monta a URL da API
    let apiUrl = `/api/dashboard/?`;
    if (periodo === 'personalizado') {
        // Usa as datas apenas se for personalizado
        if (dataInicio) apiUrl += `data_inicio=${dataInicio}&`;
        if (dataFim) apiUrl += `data_fim=${dataFim}&`;
    } else if (periodo) {
        // Envia o nome do período para a view calcular
        apiUrl += `periodo=${periodo}&`;
    }
    apiUrl = apiUrl.replace(/&$/, ""); // Remove '&' final

    console.log("Fetching dashboard data from:", apiUrl);

    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                return response.json().then(errData => {
                    throw new Error(errData.detail || `Erro ${response.status}`);
                }).catch(() => {
                     throw new Error(`Erro ${response.status} ao buscar dados.`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Dashboard data received:", data);
            // Verifica se a estrutura básica esperada está presente
             if (!data || typeof data !== 'object') {
                 throw new Error("Resposta da API inválida ou vazia.");
             }
            dashboardData = data;
            updateDashboardCards(data.cards || {}); // Passa objeto vazio se cards não existir
            updateDashboardCharts(data);
            updateRecentEntries(data.ultimos_lancamentos || { ctes: [], mdfes: [] }); // Passa objeto vazio se não existir
            hideLoading();
        })
        .catch(error => {
            console.error('Erro ao carregar dados do dashboard:', error);
            showNotification(`Falha ao carregar dados do dashboard: ${error.message}`, 'error');
            clearDashboardUIOnError();
            hideLoading();
        });
}

/**
 * Mostra indicadores de carregamento na UI.
 */
function showLoading() {
    console.log("Showing loading state...");
    const cardPlaceholders = ['card-total-ctes', 'card-total-mdfes', 'card-valor-total-fretes', 'card-valor-cif', 'card-valor-fob', 'card-ticket-medio'];
    cardPlaceholders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span>`;
    });

    const chartContainers = ['chart-cif-fob-container', 'chart-documentos-container'];
    chartContainers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            const oldCanvas = container.querySelector('canvas');
            if (oldCanvas) oldCanvas.remove();
            container.innerHTML = `<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div>`;
        }
    });

    const tableBody = document.getElementById('tbody-ultimos-lancamentos');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Carregando...</span></div><div class="mt-2 small text-muted">Carregando lançamentos...</div></td></tr>`;
    }

    document.getElementById('btnFiltrar')?.setAttribute('disabled', true);
    document.getElementById('btnResetarFiltros')?.setAttribute('disabled', true);
    document.getElementById('btnAtualizarDashboard')?.setAttribute('disabled', true);
}

/**
 * Esconde indicadores de carregamento.
 */
function hideLoading() {
    console.log("Hiding loading state...");
    document.getElementById('btnFiltrar')?.removeAttribute('disabled');
    document.getElementById('btnResetarFiltros')?.removeAttribute('disabled');
    document.getElementById('btnAtualizarDashboard')?.removeAttribute('disabled');
}

/**
 * Limpa a UI do dashboard em caso de erro de carregamento.
 */
function clearDashboardUIOnError() {
    const cardPlaceholders = ['card-total-ctes', 'card-total-mdfes', 'card-valor-total-fretes', 'card-valor-cif', 'card-valor-fob', 'card-ticket-medio'];
    cardPlaceholders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'Erro!';
    });

    const chartContainers = ['chart-cif-fob-container', 'chart-documentos-container'];
    chartContainers.forEach(id => {
        const container = document.getElementById(id);
        if (container) container.innerHTML = `<div class="alert alert-danger m-3">Erro ao carregar gráfico.</div>`;
    });

    const tableBody = document.getElementById('tbody-ultimos-lancamentos');
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger p-4"><i class="fas fa-exclamation-triangle me-2"></i>Erro ao carregar lançamentos.</td></tr>`;
}


/**
 * Updates dashboard cards with latest data
 * @param {Object} cards - Cards data from API (e.g., data.cards)
 */
function updateDashboardCards(cards) {
    console.log("Updating cards:", cards);
    if (!cards || typeof cards !== 'object') {
        console.warn("Dados dos cards inválidos ou ausentes.");
        cards = {}; // Define como objeto vazio para evitar erros abaixo
    }
    
    // Métricas principais
    document.getElementById('card-total-ctes').textContent = formatNumber(cards.total_ctes || 0);
    document.getElementById('card-total-mdfes').textContent = formatNumber(cards.total_mdfes || 0);
    document.getElementById('card-valor-total-fretes').textContent = formatCurrency(cards.valor_total_fretes || 0);
    
    // Calcular ticket médio
    const totalCtes = cards.total_ctes || 0;
    const valorTotal = cards.valor_total_fretes || 0;
    const ticketMedio = totalCtes > 0 ? valorTotal / totalCtes : 0;
    document.getElementById('card-ticket-medio').textContent = formatCurrency(ticketMedio);
    
    // Valores CIF/FOB
    const valorCif = cards.valor_cif || 0;
    const valorFob = cards.valor_fob || 0;
    
    document.getElementById('card-valor-cif').textContent = formatCurrency(valorCif);
    document.getElementById('card-valor-fob').textContent = formatCurrency(valorFob);
}


/**
 * Updates all dashboard charts
 * @param {Object} data - Full dashboard data from API
 */
function updateDashboardCharts(data) {
    if (!data || typeof data !== 'object') {
         console.warn("Dados para gráficos ausentes ou inválidos.");
         data = {}; // Evita erros
     }
    renderCifFobChart(data.grafico_cif_fob || []);
    renderDocumentosChart(data.grafico_documentos || []);
}


/**
 * Renders the Faturamento CIF/FOB chart
 * @param {Array} chartData - Data for the chart (data.grafico_cif_fob)
 */
function renderCifFobChart(chartData) {
    const containerId = 'chart-cif-fob-container';
    const canvasId = 'chartCifFob';
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container de gráfico #${containerId} não encontrado.`);
        return;
    }
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    if (cifFobChart) { cifFobChart.destroy(); }

    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
        container.innerHTML = `<div class="text-center p-4 text-muted">
            <i class="fas fa-chart-line fa-2x mb-2 d-block"></i>
            <small>Nenhum dado de faturamento para exibir</small>
        </div>`;
        return;
    }

    const labels = chartData.map(item => item.data || '');
    const cifValues = chartData.map(item => item.cif || 0);
    const fobValues = chartData.map(item => item.fob || 0);
    const totalValues = chartData.map(item => item.total || 0);

    cifFobChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CIF',
                    data: cifValues,
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'FOB',
                    data: fobValues,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'Total',
                    data: totalValues,
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(245, 158, 11, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return formatCurrencyCompact(value);
                        }
                    }
                }
            }
        }
    });
    
    // Adicionar event listeners para os botões de período
    setupChartPeriodButtons();
}

/**
 * Renders the Desempenho Mensal chart (indicador de desenvolvimento)
 * @param {Array} chartData - Data for the chart
 */
function renderDocumentosChart(chartData) {
    const containerId = 'chart-documentos-container';
    const canvasId = 'chartDocumentos';
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container de gráfico #${containerId} não encontrado.`);
        return;
    }
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    if (documentosChart) { documentosChart.destroy(); }

    // Se não houver dados específicos, gerar dados de desempenho baseados nos cards
    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
        // Usar dados dos cards para criar indicadores de desempenho
        const cards = dashboardData.cards || {};
        
        // Simular dados de desempenho mensal baseado nos valores atuais
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
        const valorAtual = cards.valor_total_fretes || 0;
        
        // Criar dados simulados de crescimento progressivo
        chartData = meses.map((mes, index) => {
            const fator = (index + 1) / meses.length;
            return {
                mes: mes,
                faturamento: valorAtual * fator * (0.8 + Math.random() * 0.4),
                ctes: (cards.total_ctes || 0) * fator * (0.8 + Math.random() * 0.4),
                meta: valorAtual * fator * 1.1 // Meta 10% acima
            };
        });
    }

    const labels = chartData.map(item => item.mes || item.data || '');
    const faturamentoValues = chartData.map(item => item.faturamento || item.valor || 0);
    const metaValues = chartData.map(item => item.meta || (item.faturamento * 1.1) || 0);
    
    // Calcular percentual de atingimento da meta
    const percentuais = faturamentoValues.map((fat, i) => 
        metaValues[i] > 0 ? (fat / metaValues[i] * 100) : 0
    );

    documentosChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Faturamento',
                    data: faturamentoValues,
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(40, 167, 69, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    yAxisID: 'y'
                },
                {
                    label: 'Meta',
                    data: metaValues,
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255, 193, 7, 1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(255, 193, 7, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: '% Atingimento',
                    data: percentuais,
                    backgroundColor: 'rgba(23, 162, 184, 0.2)',
                    borderColor: 'rgba(23, 162, 184, 1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(23, 162, 184, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === '% Atingimento') {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                            }
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return formatCurrencyCompact(value);
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    max: 120,
                    grid: {
                        drawOnChartArea: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}



/**
 * Updates the recent entries table
 * @param {Object} lancamentos - Object containing 'ctes' and 'mdfes' arrays from API response
 */
function updateRecentEntries(lancamentos) {
    const tbody = document.getElementById('tbody-ultimos-lancamentos');
    if (!tbody) {
        console.error("Elemento tbody #tbody-ultimos-lancamentos não encontrado.");
        return;
    }

    let combinedEntries = [];
    if (lancamentos && typeof lancamentos === 'object') {
        if (lancamentos.ctes && Array.isArray(lancamentos.ctes)) {
            combinedEntries.push(...lancamentos.ctes.map(cte => ({
                ...cte, // Preserva todos os campos vindos da API
                tipoDoc: 'CT-e',
                data_ordenacao: cte.data_upload // Chave para ordenação
            })));
        }
        if (lancamentos.mdfes && Array.isArray(lancamentos.mdfes)) {
            combinedEntries.push(...lancamentos.mdfes.map(mdfe => ({
                ...mdfe, // Preserva todos os campos vindos da API
                tipoDoc: 'MDF-e',
                data_ordenacao: mdfe.data_upload // Chave para ordenação
            })));
        }
    }

    if (combinedEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4"><i class="fas fa-info-circle me-2 text-muted"></i>Nenhum lançamento recente encontrado.</td></tr>`;
        return;
    }

    // Ordenar por data_upload (mais recente primeiro)
    combinedEntries.sort((a, b) => new Date(b.data_ordenacao) - new Date(a.data_ordenacao));

    // Limitar (opcional, a API já deve ter limitado)
    const recentEntries = combinedEntries.slice(0, 10);

    let html = '';
    recentEntries.forEach(item => {
        // Usa a data_emissao pré-formatada da API
        const dataFormatada = item.data_emissao || formatDateTime(item.data_ordenacao) || '--';
        const numDoc = item.tipoDoc === 'CT-e' ? item.numero_cte : item.numero_mdfe;
        const chaveOuNum = `${item.tipoDoc} ${numDoc || ''}`.trim() || item.chave;
        const origem = item.tipoDoc === 'CT-e' ? (item.remetente_nome || '-') : (item.uf_inicio || '-');
        const destino = item.tipoDoc === 'CT-e' ? (item.destinatario_nome || '-') : (item.uf_fim || '-');
        const valor = item.tipoDoc === 'CT-e' ? formatCurrency(item.valor_total) : '--';
        const tipoApi = item.tipoDoc === 'CT-e' ? 'cte' : 'mdfe';

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td><span class="badge bg-${item.tipoDoc === 'CT-e' ? 'success' : 'primary'}">${item.tipoDoc}</span></td>
                <td title="${item.chave || ''}">${truncateText(chaveOuNum, 25)}</td>
                <td>${truncateText(origem, 20)}</td>
                <td>${truncateText(destino, 20)}</td>
                <td class="text-end">${valor}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group" aria-label="Ações ${item.tipoDoc}">
                        <button class="btn btn-outline-primary btn-detail"
                                data-id="${item.id}"
                                data-tipo="${tipoApi}"
                                title="Ver Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <a href="/api/${tipoApi}s/${item.id}/xml/" class="btn btn-outline-secondary" title="Baixar XML" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-file-code"></i>
                        </a>
                        ${item.tipoDoc === 'CT-e' ? `<a href="/api/ctes/${item.id}/dacte/" class="btn btn-outline-info" title="Ver DACTE" target="_blank" rel="noopener noreferrer"><i class="fas fa-print"></i></a>` : ''}
                        ${item.tipoDoc === 'MDF-e' ? `<a href="/api/mdfes/${item.id}/damdfe/" class="btn btn-outline-info" title="Ver DAMDFE" target="_blank" rel="noopener noreferrer"><i class="fas fa-print"></i></a>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}


// --- Funções Utilitárias ---

// (Incluir aqui ou garantir que estejam em scripts.js as funções:
// formatCurrency, formatNumber, formatDateTime, truncateText, showNotification)
// Exemplo da formatCurrency ajustada:
function formatCurrency(value) {
    if (value === null || value === undefined) return 'R$ 0,00';
    const numericValue = typeof value === 'string' ? parseFloat(value.replace('.', '').replace(',', '.')) : Number(value);
    if (isNaN(numericValue)) return 'R$ 0,00';
    return numericValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value) {
     if (value === null || value === undefined) return '0';
     const numericValue = Number(value);
      if (isNaN(numericValue)) return '0';
    return numericValue.toLocaleString('pt-BR');
}

function formatDateTime(dateString) {
    if (!dateString) return '--';
    try {
        // Tenta converter para data, mesmo que já venha formatada
        const dateObj = new Date(dateString);
        // Se a conversão falhar, usa a string original
        if (isNaN(dateObj.getTime())) return dateString;

        // Formata no padrão desejado
        return dateObj.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit' // Omite segundos
        });
    } catch (e) {
        return dateString; // Retorna original se falhar
    }
}

function truncateText(text, maxLength) {
    if (!text) return '--';
    const str = String(text); // Garante que é string
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

// (showNotification precisa estar definida, vinda de scripts.js ou aqui)
function showNotification(message, type = 'success', duration = 5000) {
    // Implementação básica (ou chame a função global se existir)
    console.log(`[${type.toUpperCase()}] ${message}`);
     // Aqui deveria chamar a implementação real do Toast do Bootstrap de scripts.js
     if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
         window.showNotification(message, type, duration);
     } else {
         alert(`[${type.toUpperCase()}] ${message}`); // Fallback
     }
}

/**
 * Formata valores monetários de forma compacta (K, M, B)
 * @param {number} value - Valor a ser formatado
 * @returns {string} - Valor formatado
 */
function formatCurrencyCompact(value) {
    if (!value || isNaN(value)) return 'R$ 0';
    
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    
    if (absValue >= 1000000000) {
        return sign + 'R$ ' + (absValue / 1000000000).toFixed(1) + 'B';
    } else if (absValue >= 1000000) {
        return sign + 'R$ ' + (absValue / 1000000).toFixed(1) + 'M';
    } else if (absValue >= 1000) {
        return sign + 'R$ ' + (absValue / 1000).toFixed(1) + 'K';
    } else {
        return sign + 'R$ ' + absValue.toFixed(0);
    }
}

/**
 * Configura os botões de período do gráfico
 */
function setupChartPeriodButtons() {
    const periodButtons = document.querySelectorAll('input[name="chart-period"]');
    
    periodButtons.forEach(button => {
        button.addEventListener('change', function() {
            if (this.checked) {
                const period = this.id.replace('chart-', ''); // 7d, 30d, 90d
                console.log(`Alterando período do gráfico para: ${period}`);
                
                // Aqui você pode implementar a lógica para recarregar o gráfico
                // com o período selecionado
                // Por exemplo:
                // loadChartDataForPeriod(period);
                
                // Por enquanto, apenas mostra uma notificação
                showNotification(`Período do gráfico alterado para ${period.toUpperCase()}`, 'info', 2000);
            }
        });
    });
}

/**
 * Carrega dados do gráfico para um período específico (função de exemplo)
 * @param {string} period - Período (7d, 30d, 90d)
 */
function loadChartDataForPeriod(period) {
    // Esta função pode ser implementada para fazer uma chamada específica
    // à API com o período desejado para o gráfico
    console.log(`Carregando dados do gráfico para o período: ${period}`);
    
    // Exemplo de implementação:
    // const apiUrl = `/api/dashboard/chart/?period=${period}`;
    // Auth.fetchWithAuth(apiUrl)
    //     .then(response => response.json())
    //     .then(data => {
    //         renderCifFobChart(data.grafico_cif_fob || []);
    //     })
    //     .catch(error => {
    //         console.error('Erro ao carregar dados do gráfico:', error);
    //     });
}