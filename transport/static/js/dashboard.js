/**
 * dashboard.js
 * Functions for the main dashboard panel
 * v1.1 - Correções de IDs de gráfico e lógica de Últimos Lançamentos.
 */

// Global chart objects to allow destruction/updates
let cifFobChart = null;
let metasChart = null;

// Dashboard data cache
let dashboardData = {};

/**
 * Initializes dashboard when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
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
    const cardPlaceholders = ['card-total-ctes', 'card-total-mdfes', 'card-valor-total-fretes', 'card-valor-cif', 'card-valor-fob'];
    cardPlaceholders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span>`;
    });

    const chartContainers = ['chart-cif-fob-container', 'chart-metas-container'];
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
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Carregando...</span></div><span class="ms-2 text-muted">Carregando lançamentos...</span></td></tr>`;
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
    const cardPlaceholders = ['card-total-ctes', 'card-total-mdfes', 'card-valor-total-fretes', 'card-valor-cif', 'card-valor-fob'];
    cardPlaceholders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'Erro!';
    });

    const chartContainers = ['chart-cif-fob-container', 'chart-metas-container'];
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
    document.getElementById('card-total-ctes').textContent = formatNumber(cards.total_ctes || 0);
    document.getElementById('card-total-mdfes').textContent = formatNumber(cards.total_mdfes || 0);
    document.getElementById('card-valor-total-fretes').textContent = formatCurrency(cards.valor_total_fretes || 0);
    document.getElementById('card-valor-cif').textContent = formatCurrency(cards.valor_cif || 0);
    document.getElementById('card-valor-fob').textContent = formatCurrency(cards.valor_fob || 0);
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
    renderMetasChart(data.grafico_metas || []);
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
        container.innerHTML = `<div class="alert alert-light text-center p-3">Nenhum dado de faturamento para exibir.</div>`;
        return;
    }

    const labels = chartData.map(item => item.data || '');
    const cifValues = chartData.map(item => item.cif || 0);
    const fobValues = chartData.map(item => item.fob || 0);
    const totalValues = chartData.map(item => item.total || 0);

    cifFobChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CIF (R$)',
                    data: cifValues,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'FOB (R$)',
                    data: fobValues,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    stack: 'Stack 0',
                    order: 3
                },
                {
                    label: 'Total (R$)',
                    data: totalValues,
                    type: 'line',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1,
                    fill: false,
                    yAxisID: 'y',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Evolução Faturamento CIF/FOB (R$)', font: { size: 14 } },
                tooltip: {
                    mode: 'index', intersect: false,
                    callbacks: { label: context => `${context.dataset.label || ''}: ${formatCurrency(context.parsed.y)}` }
                },
                legend: { position: 'bottom' }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Valor (R$)' }, ticks: { callback: value => formatCurrency(value) } }
            }
        }
    });
}

/**
 * Renders the Metas chart
 * @param {Array} chartData - Data for the chart (data.grafico_metas)
 */
function renderMetasChart(chartData) {
    const containerId = 'chart-metas-container';
    const canvasId = 'chartMetas';
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container de gráfico #${containerId} não encontrado.`);
        return;
    }
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const metaInfoEl = document.getElementById('meta-info');

    if (metasChart) { metasChart.destroy(); }
    if (metaInfoEl) metaInfoEl.innerHTML = ''; // Limpa info anterior

    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
        container.innerHTML = `<div class="alert alert-light text-center p-3">Nenhum dado de metas para exibir.</div>`;
        return;
    }

    const item = chartData[0]; // Pega o primeiro (e único) item esperado
    const labels = [item.label || 'Período Atual'];
    const valorData = [parseFloat(item.valor || 0)];
    const metaData = [parseFloat(item.meta || 0)];

    if (metaInfoEl && item.crescimento !== undefined) {
        const crescimento = parseFloat(item.crescimento);
        const crescimentoClass = crescimento >= 0 ? 'text-success' : 'text-danger';
        const iconClass = crescimento >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        metaInfoEl.innerHTML = `Crescimento período anterior: <strong class="${crescimentoClass}"><i class="fas ${iconClass} me-1"></i>${crescimento.toFixed(1)}%</strong>`;
    }

    metasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Realizado (R$)',
                    data: valorData,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Meta (R$)',
                    data: metaData,
                    backgroundColor: 'rgba(255, 159, 64, 0.6)',
                    borderColor: 'rgba(255, 159, 64, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Barra horizontal
            plugins: {
                title: { display: true, text: 'Desempenho vs Meta (R$)', font: { size: 14 } },
                tooltip: { callbacks: { label: context => `${context.dataset.label || ''}: ${formatCurrency(context.parsed.x)}` } }, // Usar x para horizontal
                legend: { position: 'bottom' }
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'Valor (R$)' }, ticks: { callback: value => formatCurrency(value) } },
                y: { title: { display: false } }
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
        const dataFormatada = item.data_emissao || formatDateTime(item.data_ordenacao) || '--'; // Fallback para data_ordenacao
        const numDoc = item.tipoDoc === 'CT-e' ? item.numero_cte : item.numero_mdfe;
        const chaveOuNum = `${item.tipoDoc} ${numDoc || ''}`.trim() || item.chave;
        const origem = item.tipoDoc === 'CT-e' ? (item.remetente_nome || '-') : (item.uf_inicio || '-');
        const destino = item.tipoDoc === 'CT-e' ? (item.destinatario_nome || '-') : (item.uf_fim || '-');
        // Trata valor_total como string
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