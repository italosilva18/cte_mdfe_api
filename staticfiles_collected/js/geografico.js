/**
 * geografico.js
 * Functions for the geographic dashboard panel
 * v1.3.2 - Ensured ensureCanvasExists is defined before use and adjusted chart options.
 */

let rotasUfChartInstance = null; 
const ITEMS_PER_PAGE_GEO = 5;

let geoPanelDataCache = {
    filtros: {}, rotas: [], top_origens: [], top_destinos: [], rotas_frequentes: []
};
let topOrigensTableState = { allData: [], currentPage: 1, itemsPerPage: ITEMS_PER_PAGE_GEO };
let topDestinosTableState = { allData: [], currentPage: 1, itemsPerPage: ITEMS_PER_PAGE_GEO };
let rotasFrequentesTableState = { allData: [], currentPage: 1, itemsPerPage: ITEMS_PER_PAGE_GEO };

/**
 * Garante que um canvas exista dentro de um container.
 * Se não existir, cria um novo. Se existir, limpa o container e recria o canvas.
 */
function ensureCanvasExists(containerId, canvasId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container de gráfico '${containerId}' não encontrado.`);
        return null;
    }
    container.innerHTML = ''; // Limpa qualquer conteúdo anterior (spinner, mensagem de erro, gráfico antigo)
    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);
    return newCanvas;
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Geo carregado. Iniciando setup...");
    setDefaultDateRangeGeo();
    loadGeograficoData();
    setupGeoEventListeners();
});

function setDefaultDateRangeGeo() {
    const today = new Date();
    // CORREÇÃO: Define o range padrão o dia atual.
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const dataInicioInput = document.getElementById('data_inicio_geo');
    const dataFimInput = document.getElementById('data_fim_geo');
    if (dataInicioInput) dataInicioInput.value = formatDateForInput(firstDayOfYear);
    if (dataFimInput) dataFimInput.value = formatDateForInput(today);
    console.log(`Datas padrão definidas: ${formatDateForInput(firstDayOfYear)} a ${formatDateForInput(today)}`);
}

function setupGeoEventListeners() {
    const applyFiltersBtn = document.getElementById('applyFiltersGeoBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            topOrigensTableState.currentPage = 1;
            topDestinosTableState.currentPage = 1;
            rotasFrequentesTableState.currentPage = 1;
            loadGeograficoData();
        });
    }

    setupPaginationListener('top-origens-pagination', topOrigensTableState, renderTopOrigensTable);
    setupPaginationListener('top-destinos-pagination', topDestinosTableState, renderTopDestinosTable);
    setupPaginationListener('rotas-frequentes-pagination', rotasFrequentesTableState, renderRotasFrequentesTable);

    document.getElementById('exportTopOrigensBtn')?.addEventListener('click', () => exportFullDataToCSV(geoPanelDataCache.top_origens, ['municipio', 'uf', 'total', 'valor'], 'top_origens.csv', ['Município', 'UF', 'CT-es', 'Valor (R$)']));
    document.getElementById('exportTopDestinosBtn')?.addEventListener('click', () => exportFullDataToCSV(geoPanelDataCache.top_destinos, ['municipio', 'uf', 'total', 'valor'], 'top_destinos.csv', ['Município', 'UF', 'CT-es', 'Valor (R$)']));
    document.getElementById('exportRotasFrequentesBtn')?.addEventListener('click', () => {
        const dataToExport = geoPanelDataCache.rotas_frequentes.map(item => ({
            origem_municipio: item.origem.municipio, origem_uf: item.origem.uf,
            destino_municipio: item.destino.municipio, destino_uf: item.destino.uf,
            total: item.total, valor: item.valor, km_total: item.km_total
        }));
        exportFullDataToCSV(dataToExport, 
            ['origem_municipio', 'origem_uf', 'destino_municipio', 'destino_uf', 'total', 'valor', 'km_total'], 
            'rotas_frequentes.csv', 
            ['Origem Município', 'Origem UF', 'Destino Município', 'Destino UF', 'CT-es', 'Valor (R$)', 'KM Total']);
    });
    console.log("Listeners de eventos geográficos configurados.");
}

function setupPaginationListener(paginationId, tableState, renderFunction) {
    const paginationContainer = document.getElementById(paginationId);
    if (paginationContainer) {
        paginationContainer.addEventListener('click', function(e) {
            e.preventDefault();
            const pageLink = e.target.closest('.page-link');
            if (pageLink && !pageLink.parentElement.classList.contains('disabled') && !pageLink.parentElement.classList.contains('active')) {
                const page = parseInt(pageLink.dataset.page);
                if (page) {
                    tableState.currentPage = page;
                    renderFunction(); 
                }
            }
        });
    }
}

function loadGeograficoData() {
    console.log("Iniciando loadGeograficoData()...");
    showGeoLoadingState();
    const dataInicio = document.getElementById('data_inicio_geo').value;
    const dataFim = document.getElementById('data_fim_geo').value;
    const apiUrl = `/api/painel/geografico/?data_inicio=${dataInicio}&data_fim=${dataFim}`;
    console.log("Chamando API Geográfica:", apiUrl);

    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            console.log(`Resposta da API Geográfica recebida, status: ${response.status}`);
            if (!response.ok) {
                return response.text().then(text => {
                    let errorDetail = text;
                    try { const jsonError = JSON.parse(text); errorDetail = jsonError.detail || JSON.stringify(jsonError); } 
                    catch (e) { console.warn("Não foi possível parsear erro JSON:", e) }
                    throw new Error(`Falha ao carregar dados geográficos (status: ${response.status}). Detalhe: ${errorDetail}`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Dados geográficos recebidos:", data);
            geoPanelDataCache = data; 

            renderRotasUfChart(data.rotas || []); // Chamada na linha ~113
            console.log("Dados de rotas para o gráfico:", data.rotas || []);

            topOrigensTableState.allData = data.top_origens || [];
            topOrigensTableState.currentPage = 1;
            renderTopOrigensTable();

            topDestinosTableState.allData = data.top_destinos || [];
            topDestinosTableState.currentPage = 1;
            renderTopDestinosTable();

            rotasFrequentesTableState.allData = data.rotas_frequentes || [];
            rotasFrequentesTableState.currentPage = 1;
            renderRotasFrequentesTable();
            
            if ( (data.rotas || []).length === 0 && (data.top_origens || []).length === 0 &&
                 (data.top_destinos || []).length === 0 && (data.rotas_frequentes || []).length === 0 ) {
                showNotification('Nenhum dado geográfico encontrado para o período selecionado.', 'info');
            }
        })
        .catch(error => {
            console.error('Erro ao carregar dados geográficos:', error);
            showNotification(`Erro ao carregar dados geográficos: ${error.message}`, 'error');
            clearGeoUIOnFailure();
        })
        .finally(() => {
            hideGeoLoadingState();
            console.log("Ocultando estado de carregamento geográfico.");
        });
}

function showGeoLoadingState() {
    console.log("Exibindo estado de carregamento geográfico...");
    const applyBtn = document.getElementById('applyFiltersGeoBtn');
    if (applyBtn) applyBtn.disabled = true;

    const tableBodiesIds = ['top-origens-body', 'top-destinos-body', 'rotas-frequentes-body'];
    tableBodiesIds.forEach(id => {
        const tbody = document.getElementById(id);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-success"></div> Carregando...</td></tr>`;
    });
    ['top-origens-pagination', 'top-destinos-pagination', 'rotas-frequentes-pagination'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    const rotasUfChartContainer = document.getElementById('rotasUfChartContainer');
    if (rotasUfChartContainer) {
        // Só mostra spinner se o container não tiver já um canvas (evita piscar)
        if (!rotasUfChartContainer.querySelector('canvas')) {
             rotasUfChartContainer.innerHTML = `<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Carregando gráfico...</p></div>`;
        }
    }
}

function hideGeoLoadingState() {
    const applyBtn = document.getElementById('applyFiltersGeoBtn');
    if (applyBtn) applyBtn.disabled = false;
}

function clearGeoUIOnFailure() {
    const tableBodiesIds = ['top-origens-body', 'top-destinos-body', 'rotas-frequentes-body'];
    const paginationIds = ['top-origens-pagination', 'top-destinos-pagination', 'rotas-frequentes-pagination'];
    tableBodiesIds.forEach(id => {
        const tbody = document.getElementById(id);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Falha ao carregar.</td></tr>`;
    });
    paginationIds.forEach(id => {
        const nav = document.getElementById(id);
        if (nav) nav.innerHTML = '';
    });
    
    if (rotasUfChartInstance) {
        rotasUfChartInstance.destroy();
        rotasUfChartInstance = null;
    }
    const rotasUfChartContainer = document.getElementById('rotasUfChartContainer');
    if(rotasUfChartContainer) rotasUfChartContainer.innerHTML = `<div class="alert alert-danger text-center m-3 p-5">Falha ao carregar gráfico de rotas.</div>`;
}

function renderRotasUfChart(rotasData) {
    const containerId = 'rotasUfChartContainer';
    const canvasId = 'rotasUfChart';

    if (rotasUfChartInstance) {
        rotasUfChartInstance.destroy();
        rotasUfChartInstance = null;
    }

    const canvas = ensureCanvasExists(containerId, canvasId); 
    if (!canvas) { // Se ensureCanvasExists retornou null (container não encontrado)
        console.error("Canvas para rotas UF não pôde ser criado/encontrado.");
        return; 
    }

    const ctx = canvas.getContext('2d');
    const container = document.getElementById(containerId);

    if (!rotasData || rotasData.length === 0) {
        if (container) { // ensureCanvasExists limpa o container, então precisamos adicionar a msg de novo
           container.innerHTML = `<div class="chart-message-overlay alert alert-info"><i class="fas fa-info-circle me-2"></i>Sem dados de fluxo de rotas UF-UF para exibir no período.</div>`;
        }
        return;
    }

    const topRotas = [...rotasData].sort((a,b) => b.contagem - a.contagem).slice(0, 10);

    const labels = topRotas.map(item => `${item.uf_ini} → ${item.uf_fim}`); 
    const contagemValues = topRotas.map(item => item.contagem);

    rotasUfChartInstance = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Contagem de CT-es', data: contagemValues,
                backgroundColor: 'rgba(28, 180, 138, 0.7)', 
                borderColor: 'rgba(28, 160, 138, 1)',
                borderWidth: 1,
                hoverBackgroundColor: 'rgba(28, 200, 138, 0.9)',
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y', 
            plugins: {
                title: { display: false }, legend: { display: false }, 
                tooltip: { 
                    backgroundColor: 'rgba(0,0,0,0.8)', titleFont: {size: 14}, bodyFont: {size: 12},
                    callbacks: { label: context => `CT-es: ${formatNumber(context.raw)}` } 
                }
            },
            scales: {
                x: { 
                    beginAtZero: true, title: { display: true, text: 'Quantidade de CT-es', font: {size: 12} },
                    grid: { display: true, color: 'rgba(0,0,0,0.05)'},
                    ticks: { 
                        font: {size: 10},
                        callback: value => formatNumber(value, 0), 
                        stepSize: Math.max(1, Math.ceil(Math.max(0,...contagemValues) / (labels.length > 5 ? 5 : labels.length) )) // Ajusta o step para não poluir muito
                    } 
                },
                y: { 
                    title: { display: false }, // Rótulo já é "Rota (UF Origem → UF Destino)"
                    grid: { display: false },
                    ticks: { font: {size: 10} }
                }
            }
        }
    });
}

function renderTopOrigensTable() {
    const allData = topOrigensTableState.allData;
    const currentPage = topOrigensTableState.currentPage;
    const itemsPerPage = topOrigensTableState.itemsPerPage;
    const tbody = document.getElementById('top-origens-body');
    const paginationContainer = document.getElementById('top-origens-pagination');

    if (!tbody || !paginationContainer) return;

    if (!allData || allData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3">Nenhuma origem encontrada para o período.</td></tr>`;
        paginationContainer.innerHTML = '';
        return;
    }
    const pageData = getPaginatedData(allData, currentPage, itemsPerPage);
    let html = '';
    pageData.forEach(item => {
        html += `
        <tr>
            <td>${item.municipio || '--'}</td>
            <td>${item.uf || '--'}</td>
            <td class="text-end">${formatNumber(item.total)}</td>
            <td class="text-end">${formatCurrency(item.valor)}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderPaginationControls(paginationContainer, currentPage, allData.length, itemsPerPage);
}

function renderTopDestinosTable() {
    const allData = topDestinosTableState.allData;
    const currentPage = topDestinosTableState.currentPage;
    const itemsPerPage = topDestinosTableState.itemsPerPage;
    const tbody = document.getElementById('top-destinos-body');
    const paginationContainer = document.getElementById('top-destinos-pagination');

    if (!tbody || !paginationContainer) return;

    if (!allData || allData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3">Nenhum destino encontrado para o período.</td></tr>`;
        paginationContainer.innerHTML = '';
        return;
    }
    const pageData = getPaginatedData(allData, currentPage, itemsPerPage);
    let html = '';
    pageData.forEach(item => {
        html += `
        <tr>
            <td>${item.municipio || '--'}</td>
            <td>${item.uf || '--'}</td>
            <td class="text-end">${formatNumber(item.total)}</td>
            <td class="text-end">${formatCurrency(item.valor)}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderPaginationControls(paginationContainer, currentPage, allData.length, itemsPerPage);
}

function renderRotasFrequentesTable() {
    const allData = rotasFrequentesTableState.allData;
    const currentPage = rotasFrequentesTableState.currentPage;
    const itemsPerPage = rotasFrequentesTableState.itemsPerPage;
    const tbody = document.getElementById('rotas-frequentes-body');
    const paginationContainer = document.getElementById('rotas-frequentes-pagination');

    if (!tbody || !paginationContainer) return;

    if (!allData || allData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3">Nenhuma rota frequente encontrada para o período.</td></tr>`;
        paginationContainer.innerHTML = '';
        return;
    }
    const pageData = getPaginatedData(allData, currentPage, itemsPerPage);
    let html = '';
    pageData.forEach(item => {
        const origem = item.origem ? `${item.origem.municipio || '-'}/${item.origem.uf || '-'}` : '--';
        const destino = item.destino ? `${item.destino.municipio || '-'}/${item.destino.uf || '-'}` : '--';
        const kmTotal = parseFloat(item.km_total);
        html += `
        <tr>
            <td>${origem}</td>
            <td>${destino}</td>
            <td class="text-end">${formatNumber(item.total)}</td>
            <td class="text-end">${formatCurrency(item.valor)}</td>
            <td class="text-end">${kmTotal > 0 ? formatNumber(kmTotal, 0) : '--'}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderPaginationControls(paginationContainer, currentPage, allData.length, itemsPerPage);
}

// --- Funções Utilitárias ---
function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date)) return new Date().toISOString().split('T')[0];
    return date.toISOString().split('T')[0];
}
function getPaginatedData(allData, currentPage, itemsPerPage) {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return allData.slice(startIndex, endIndex);
}
function renderPaginationControls(container, currentPage, totalItems, itemsPerPage) {
    if (!container) return;
    container.innerHTML = ''; 
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalItems === 0 || totalPages <= 1) return; 

    let html = `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Anterior"><span aria-hidden="true">&laquo;</span></a></li>`;
    const maxPageLinks = 3; 
    let startPage, endPage;
    if (totalPages <= maxPageLinks) { startPage = 1; endPage = totalPages; } 
    else {
        let maxPagesBefore = Math.floor((maxPageLinks -1) / 2);
        let maxPagesAfter = Math.ceil((maxPageLinks-1) / 2);
        startPage = currentPage - maxPagesBefore;
        endPage = currentPage + maxPagesAfter;
        if (startPage < 1) { endPage += (1 - startPage); startPage = 1; }
        if (endPage > totalPages) { startPage -= (endPage - totalPages); endPage = totalPages; if (startPage < 1) startPage = 1; }
    }
    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item${i === currentPage ? ' active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
    }
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Próximo"><span aria-hidden="true">&raquo;</span></a></li>`;
    container.innerHTML = html;
}
function formatCurrency(value, ifNull = 'R$ 0,00') {
    if (value === null || value === undefined || isNaN(Number(value))) return ifNull;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}
function formatNumber(value, decimals, ifNull = '0') {
    if (value === null || value === undefined || isNaN(Number(value))) return ifNull;
    const num = Number(value);
    const options = {};
    if (decimals === 0) { // Se explicitamente 0 decimais
        options.minimumFractionDigits = 0;
        options.maximumFractionDigits = 0;
    } else if (Number.isInteger(num) && (decimals === undefined || decimals === null)) { // Inteiro e decimais não especificados
        options.minimumFractionDigits = 0;
        options.maximumFractionDigits = 0;
    } else if (decimals !== undefined && decimals !== null) { // Decimais especificados
        options.minimumFractionDigits = decimals;
        options.maximumFractionDigits = decimals;
    }
    // Se decimals não for fornecido e não for inteiro, usa o padrão do Intl (geralmente 0 a 3 decimais)
    return new Intl.NumberFormat('pt-BR', options).format(num);
}
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function exportFullDataToCSV(allData, headersOrder, filename, displayHeaders) {
    if (!allData || allData.length === 0) {
        showNotification('Não há dados para exportar.', 'info'); return;
    }
    let csv = [displayHeaders.map(header => `"${String(header).replace(/"/g, '""')}"`).join(',')];
    allData.forEach(item => {
        const rowData = headersOrder.map(key => {
            let cellValue = item[key];
            if (typeof item[key] === 'object' && item[key] !== null) {
                 if (key === 'origem' || key === 'destino') cellValue = `${item[key].municipio || ''}/${item[key].uf || ''}`;
                 else cellValue = JSON.stringify(item[key]); 
            }
            if (cellValue === null || cellValue === undefined) cellValue = '';
            else if (typeof cellValue === 'number') {
                 if (key.toLowerCase().includes('valor')) cellValue = String(cellValue.toFixed(2)).replace('.', ',');
                 else cellValue = String(cellValue);
            } else cellValue = String(cellValue);
            return `"${cellValue.replace(/"/g, '""')}"`;
        });
        csv.push(rowData.join(','));
    });
    const csvFileContent = "\uFEFF" + csv.join("\n"); 
    const blob = new Blob([csvFileContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showNotification(`Exportação de '${filename}' concluída.`, 'success');
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
    console.warn("Auth object not found for geografico.js. Using mock.");
    window.Auth = { fetchWithAuth: function(url, options = {}) { return fetch(url, options); } };
}