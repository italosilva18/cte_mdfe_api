/**
 * cte_panel.js
 * Functions for the CT-e panel page
 * Versão: 1.2.0 (Correções e melhorias com base no feedback)
 */

// Global variables
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let cteList = [];
let painelCteData = {};

// Chart instances
let graficoClienteChart = null;
let graficoDistribuidorChart = null;

// Current modal CT-e data
let currentCTeId = null;

document.addEventListener('DOMContentLoaded', function() {
    setDefaultDateRangePanel(); // Define datas padrão para o painel
    setDefaultDateRangeList();  // Define datas padrão para a lista

    loadCtePainelData();
    loadCTeList();

    setupEventListeners();
});

function setupEventListeners() {
    const filterPanelBtn = document.getElementById('btnFiltrarPainelCte');
    if (filterPanelBtn) {
        filterPanelBtn.addEventListener('click', loadCtePainelData);
    }
    const resetPanelBtn = document.getElementById('btnResetarFiltrosPainel');
    if (resetPanelBtn) {
        resetPanelBtn.addEventListener('click', () => {
            document.getElementById('filterFormPanelCte').reset();
            setDefaultDateRangePanel();
            loadCtePainelData();
        });
    }

    const filterListBtn = document.getElementById('btnFiltrarCteList');
    if (filterListBtn) {
        filterListBtn.addEventListener('click', () => {
            currentPage = 1;
            loadCTeList();
        });
    }
    
    const exportListBtn = document.getElementById('btnExportarCsvCteList');
    if (exportListBtn) {
        exportListBtn.addEventListener('click', exportCTeListToCSV);
    }

    setupModalEventListeners();

    document.getElementById('cte-list')?.addEventListener('click', function(e) {
        const detailButton = e.target.closest('.btn-cte-detail');
        if (detailButton) {
            const cteId = detailButton.getAttribute('data-id');
            if (cteId) {
                showCTeDetails(cteId);
            }
        }
    });
}

function setupModalEventListeners() {
    const modal = document.getElementById('cteDetailModal');
    if (!modal) return;

    const btnPrintCTe = document.getElementById('btnPrintCTe');
    const btnDownloadXML = document.getElementById('btnDownloadXML');
    const btnReprocessCTe = document.getElementById('btnReprocessCTe');

    if (btnPrintCTe) {
        btnPrintCTe.addEventListener('click', function() {
            if (!currentCTeId) return;
            window.open(`/api/ctes/${currentCTeId}/dacte/`, '_blank');
            showNotification('A geração de DACTE em PDF está em implementação. Exibindo dados JSON.', 'info');
        });
    }
    if (btnDownloadXML) {
        btnDownloadXML.addEventListener('click', function() {
            if (!currentCTeId) return;
            window.open(`/api/ctes/${currentCTeId}/xml/`, '_blank');
        });
    }
    if (btnReprocessCTe) {
        btnReprocessCTe.addEventListener('click', function() {
            if (!currentCTeId) return;
            reprocessCTe(currentCTeId);
        });
    }

    modal.addEventListener('hidden.bs.modal', function() {
        currentCTeId = null;
        const modalBody = document.getElementById('cteDetailContent');
        if(modalBody) modalBody.innerHTML = '<div class="d-flex justify-content-center"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
    });
}

function setDefaultDateRangePanel() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('data_inicio_panel').value = formatDateForInput(firstDayOfMonth);
    document.getElementById('data_fim_panel').value = formatDateForInput(today);
}

function setDefaultDateRangeList() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('data_inicio_list').value = formatDateForInput(thirtyDaysAgo);
    document.getElementById('data_fim_list').value = formatDateForInput(today);
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function loadCtePainelData() {
    showLoadingPainel();
    const dataInicio = document.getElementById('data_inicio_panel').value;
    const dataFim = document.getElementById('data_fim_panel').value;

    let apiUrl = `/api/painel/cte/?`;
    if (dataInicio) apiUrl += `data_inicio=${dataInicio}&`;
    if (dataFim) apiUrl += `data_fim=${dataFim}&`;
    apiUrl = apiUrl.slice(0, -1);

    Auth.fetchWithAuth(apiUrl)
        .then(handleFetchResponse) // Usar helper para tratar resposta
        .then(data => {
            painelCteData = data;
            updatePainelCards(data.cards);
            renderGraficoCliente(data.grafico_cliente || []);
            renderGraficoDistribuidor(data.grafico_distribuidor || []);
            renderTabelaClientePainel(data.tabela_cliente || []);
        })
        .catch(error => {
            console.error('Error loading CT-e Panel data:', error);
            showNotification(`Erro ao carregar dados do Painel CT-e: ${error.message || 'Erro desconhecido'}`, 'error');
        })
        .finally(() => {
            hideLoadingPainel();
        });
}

function showLoadingPainel() {
    const cardIds = ['panel-total-ctes', 'panel-valor-total', 'panel-total-autorizados', 'panel-total-cancelados', 'panel-total-rejeitados'];
    cardIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="spinner-border spinner-border-sm text-secondary" role="status"></span>';
    });
    ['chart-cliente-container', 'chart-distribuidor-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"></div></div>';
    });
    const tableBody = document.getElementById('tabela-cliente-painel');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div> Carregando...</td></tr>';
}

function hideLoadingPainel() {
    // Os dados serão preenchidos ou mensagens de erro exibidas pelas funções de renderização
}

function updatePainelCards(cards) {
    if (!cards) {
        console.warn("Dados dos cards do painel não recebidos.");
        ['panel-total-ctes', 'panel-valor-total', 'panel-total-autorizados', 'panel-total-cancelados', 'panel-total-rejeitados'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'N/A';
        });
        return;
    }
    document.getElementById('panel-total-ctes').textContent = formatNumber(cards.total_ctes || 0);
    document.getElementById('panel-valor-total').textContent = formatCurrency(cards.valor_total || 0);
    document.getElementById('panel-total-autorizados').textContent = formatNumber(cards.total_autorizados || 0);
    document.getElementById('panel-total-cancelados').textContent = formatNumber(cards.total_cancelados || 0);
    document.getElementById('panel-total-rejeitados').textContent = formatNumber(cards.total_rejeitados || 0);
}

function renderGraficoCliente(data) {
    const container = document.getElementById('chart-cliente-container');
    if (!container) return;

    let canvas = container.querySelector('canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        container.innerHTML = ''; // Limpa o spinner
        container.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-center text-muted p-3">Nenhum dado de cliente para exibir.</p>';
        if (graficoClienteChart) {
            graficoClienteChart.destroy();
            graficoClienteChart = null;
        }
        return;
    }

    if (graficoClienteChart) {
        graficoClienteChart.destroy();
    }

    graficoClienteChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.label),
            datasets: [{
                label: 'Valor Faturado (R$)',
                data: data.map(item => item.valor),
                backgroundColor: getChartColors(data.length),
                borderColor: getChartBorderColors(data.length),
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `R$ ${formatNumber(ctx.raw, 2)}` } } },
            scales: { x: { beginAtZero: true, ticks: { callback: val => `R$ ${formatNumber(val/1000)}k` } } }
        }
    });
}

function renderGraficoDistribuidor(data) {
    const container = document.getElementById('chart-distribuidor-container');
    if (!container) return;

    let canvas = container.querySelector('canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        container.innerHTML = ''; // Limpa o spinner
        container.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-center text-muted p-3">Nenhum dado de modalidade para exibir.</p>';
        if (graficoDistribuidorChart) {
            graficoDistribuidorChart.destroy();
            graficoDistribuidorChart = null;
        }
        return;
    }

    if (graficoDistribuidorChart) {
        graficoDistribuidorChart.destroy();
    }

    graficoDistribuidorChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(item => `${item.label} (${item.qtd})`),
            datasets: [{
                label: 'Distribuição por Modalidade',
                data: data.map(item => item.valor),
                backgroundColor: ['#4CAF50', '#1b4d3e', '#FFC107', '#DC3545'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.chart.getDatasetMeta(0).data.reduce((acc, datapoint) => acc + datapoint.$context.raw, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: R$ ${formatNumber(value, 2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderTabelaClientePainel(data) {
    const tbody = document.getElementById('tabela-cliente-painel');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted p-3">Nenhum cliente principal encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(cliente => `
        <tr>
            <td>${cliente.nome || '--'}</td>
            <td>${cliente.cnpj || '--'}</td>
            <td class="text-end">${formatNumber(cliente.qtd || 0)}</td>
            <td class="text-end">${formatCurrency(cliente.valor || 0)}</td>
            <td class="text-end">${formatCurrency(cliente.ticket_medio || 0)}</td>
        </tr>
    `).join('');
}

function loadCTeList() {
    showLoadingList();
    const dataInicio = document.getElementById('data_inicio_list').value;
    const dataFim = document.getElementById('data_fim_list').value;
    const modalidade = document.getElementById('modalidade_list').value;
    const status = document.getElementById('status_list').value;

    let apiUrl = `/api/ctes/?page=${currentPage}&page_size=${pageSize}`;
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (modalidade) apiUrl += `&modalidade=${modalidade}`;
    if (status) { // Ajustar para os filtros de status da API de CT-e
        if (status === "autorizado") apiUrl += `&autorizado=true`;
        else if (status === "cancelado") apiUrl += `&cancelado=true`;
        else if (status === "pendente") apiUrl += `&processado=false&autorizado=false&cancelado=false`; // Exemplo
        else if (status === "processado") apiUrl += `&processado=true&autorizado=false`; // Exemplo
        // Adicionar lógica para "rejeitado" se o backend suportar
    }


    Auth.fetchWithAuth(apiUrl)
        .then(handleFetchResponse)
        .then(data => {
            cteList = data.results || [];
            totalItems = data.count || 0;
            renderCTeTableList();
            updatePagination();
        })
        .catch(error => {
            console.error('Error loading CT-e List:', error);
            showNotification(`Erro ao carregar a lista de CT-es: ${error.message || 'Erro desconhecido'}`, 'error');
            const tbody = document.getElementById('cte-list');
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-4">Erro ao carregar a lista.</td></tr>`;
        })
        .finally(() => {
            hideLoadingList();
        });
}

function showLoadingList() {
    const tbody = document.getElementById('cte-list');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div> Carregando lista...</td></tr>`;
    document.getElementById('total-items-info').textContent = '';
}

function hideLoadingList() {
    // A tabela será preenchida ou terá mensagem de erro
}

function renderCTeTableList() {
    const tbody = document.getElementById('cte-list');
    const totalInfo = document.getElementById('total-items-info');

    if (!tbody) return;

    if (cteList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted p-3">Nenhum CT-e encontrado para os filtros selecionados.</td></tr>`;
        if(totalInfo) totalInfo.textContent = "0 CT-es encontrados.";
        return;
    }
    if(totalInfo) totalInfo.textContent = `${totalItems} CT-e(s) encontrado(s). Exibindo página ${currentPage} de ${Math.ceil(totalItems / pageSize)}.`;


    tbody.innerHTML = cteList.map(cte => {
        const dataEmissaoFmt = cte.data_emissao ? formatDateTime(cte.data_emissao) : '--';
        const statusHTML = getStatusBadgeHTML(cte.status);

        return `
            <tr>
                <td>${cte.numero_cte || '--'}</td>
                <td title="${cte.chave}">${truncateText(cte.chave, 15)}</td>
                <td>${dataEmissaoFmt}</td>
                <td>${truncateText(cte.remetente_nome, 20) || '--'}</td>
                <td>${truncateText(cte.destinatario_nome, 20) || '--'}</td>
                <td class="text-end">${formatCurrency(cte.valor_total)}</td>
                <td><span class="badge bg-${cte.modalidade === 'CIF' ? 'success' : 'primary'}">${cte.modalidade || '--'}</span></td>
                <td>${statusHTML}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button type="button" class="btn btn-outline-primary btn-cte-detail" data-id="${cte.id}" title="Ver Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <a href="/api/ctes/${cte.id}/xml/" class="btn btn-outline-secondary" title="Download XML" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-file-code"></i>
                        </a>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}


function reprocessCTe(cteId) {
    const btn = document.getElementById('btnReprocessCTe');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Reprocessando...';
    }

    Auth.fetchWithAuth(`/api/ctes/${cteId}/reprocessar/`, { method: 'POST' })
        .then(handleFetchResponse)
        .then(data => {
            showNotification(data.message || 'CT-e enviado para reprocessamento!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('cteDetailModal'))?.hide();
            loadCtePainelData();
            loadCTeList();
        })
        .catch(error => {
            console.error('Erro ao reprocessar CT-e:', error);
            showNotification(`Erro ao reprocessar: ${error.message || 'Falha desconhecida'}`, 'error');
        })
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Reprocessar';
            }
        });
}

function updatePagination() {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;

    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) {
        paginationElement.innerHTML = '';
        return;
    }

    let html = `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link page-link-sm" href="#" data-page="${currentPage - 1}">&laquo;</a></li>`;
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    if(startPage > 1) {
        html += `<li class="page-item"><a class="page-link page-link-sm" href="#" data-page="1">1</a></li>`;
        if(startPage > 2) html += `<li class="page-item disabled"><span class="page-link page-link-sm">...</span></li>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item${i === currentPage ? ' active' : ''}"><a class="page-link page-link-sm" href="#" data-page="${i}">${i}</a></li>`;
    }

    if(endPage < totalPages) {
        if(endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link page-link-sm">...</span></li>`;
        html += `<li class="page-item"><a class="page-link page-link-sm" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
    }

    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link page-link-sm" href="#" data-page="${currentPage + 1}">&raquo;</a></li>`;
    paginationElement.innerHTML = html;

    paginationElement.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = parseInt(this.getAttribute('data-page'));
            if (page && page !== currentPage && page >= 1 && page <= totalPages) {
                currentPage = page;
                loadCTeList();
            }
        });
    });
}

function showCTeDetails(cteId) {
    currentCTeId = cteId;
    const modal = document.getElementById('cteDetailModal');
    const modalTitle = document.getElementById('cteDetailModalLabel');
    const modalBody = document.getElementById('cteDetailContent');
    const btnReprocessCTe = document.getElementById('btnReprocessCTe');

    if (!modal || !modalTitle || !modalBody) return;

    modalBody.innerHTML = '<div class="d-flex justify-content-center p-5"><div class="spinner-border text-success" role="status"></div></div>';
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    Auth.fetchWithAuth(`/api/ctes/${cteId}/`)
        .then(handleFetchResponse)
        .then(cteData => {
            modalTitle.textContent = `CT-e ${cteData.identificacao?.numero || truncateText(cteData.chave,10) || 'Detalhes'}`;
            modalBody.innerHTML = renderCTeDetailsHTML(cteData);
            if (btnReprocessCTe) {
                const isCancelado = cteData.status_geral === "Cancelado";
                btnReprocessCTe.disabled = isCancelado;
                btnReprocessCTe.title = isCancelado ? "CT-e cancelado não pode ser reprocessado" : "Reprocessar CT-e";
            }
        })
        .catch(error => {
            console.error('Error loading CT-e details:', error);
            modalBody.innerHTML = `<div class="alert alert-danger">Erro ao carregar detalhes: ${error.message || 'Tente novamente.'}</div>`;
        });
}

function renderCTeDetailsHTML(cte) {
    let html = `<dl class="row gy-2 gx-4">`; // gy-2 para espaçamento vertical, gx-4 para horizontal
    const addDetail = (label, value) => {
        if (value !== undefined && value !== null && value !== '') {
            html += `<dt class="col-sm-4 col-lg-3 text-muted">${label}:</dt><dd class="col-sm-8 col-lg-9">${value}</dd>`;
        }
    };

    addDetail('Chave', cte.chave);
    addDetail('Número', cte.identificacao?.numero);
    addDetail('Série', cte.identificacao?.serie);
    addDetail('Emissão', formatDateTime(cte.identificacao?.data_emissao_formatada || cte.identificacao?.data_emissao));
    addDetail('Modalidade', cte.modalidade);
    addDetail('Valor', formatCurrency(cte.prestacao?.valor_total_prestado));
    addDetail('Status', getStatusBadgeHTML(cte.status_geral));

    html += `<div class="col-12 my-2"><hr></div>`; // Separador

    addDetail('Emitente', cte.emitente?.razao_social);
    addDetail('CNPJ Emitente', formatCNPJ(cte.emitente?.cnpj));
    addDetail('Remetente', cte.remetente?.razao_social);
    addDetail('CNPJ/CPF Remetente', formatDocument(cte.remetente?.cnpj || cte.remetente?.cpf));
    addDetail('Destinatário', cte.destinatario?.razao_social);
    addDetail('CNPJ/CPF Dest.', formatDocument(cte.destinatario?.cnpj || cte.destinatario?.cpf));

    html += `<div class="col-12 my-2"><hr></div>`;

    addDetail('Origem', `${cte.identificacao?.nome_mun_ini || ''} - ${cte.identificacao?.uf_ini || ''}`);
    addDetail('Destino', `${cte.identificacao?.nome_mun_fim || ''} - ${cte.identificacao?.uf_fim || ''}`);
    addDetail('Distância (KM)', cte.identificacao?.dist_km ? `${formatNumber(cte.identificacao.dist_km)} km` : '--');

    if(cte.protocolo) {
        html += `<div class="col-12 my-2"><hr></div>`;
        addDetail('Protocolo', cte.protocolo.numero_protocolo);
        addDetail('Status Protocolo', `${cte.protocolo.codigo_status} - ${cte.protocolo.motivo_status || 'N/A'}`);
        addDetail('Data Protocolo', formatDateTime(cte.protocolo.data_recebimento_formatada || cte.protocolo.data_recebimento));
    }
    if(cte.cancelamento) {
        html += `<div class="col-12 my-2"><hr></div>`;
        addDetail('Cancelamento', '<strong class="text-danger">SIM</strong>');
        addDetail('Prot. Cancelamento', cte.cancelamento.n_prot_retorno);
        addDetail('Data Cancelamento', formatDateTime(cte.cancelamento.dh_reg_evento_formatada || cte.cancelamento.dh_reg_evento));
        addDetail('Justificativa', truncateText(cte.cancelamento.x_just, 100));
    }
    if(cte.carga?.produto_predominante){
         html += `<div class="col-12 my-2"><hr></div>`;
         addDetail('Produto Predominante', cte.carga.produto_predominante);
         addDetail('Valor Carga', formatCurrency(cte.carga.valor_carga));
    }

    html += `</dl>`;
    return html;
}

function exportCTeListToCSV() {
    const dataInicio = document.getElementById('data_inicio_list').value;
    const dataFim = document.getElementById('data_fim_list').value;
    const modalidade = document.getElementById('modalidade_list').value;
    const status = document.getElementById('status_list').value;

    let apiUrl = `/api/ctes/export/?format=csv`; // Adiciona ?format=csv
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (modalidade) apiUrl += `&modalidade=${modalidade}`;
    // Adapte o filtro de status conforme a API /api/ctes/ espera
    if (status) {
        if (status === "autorizado") apiUrl += `&autorizado=true`;
        else if (status === "cancelado") apiUrl += `&cancelado=true`;
        // Adicione outros mapeamentos de status para os query params da API
    }

    window.location.href = apiUrl;
}

// --- Funções Utilitárias (podem estar em scripts.js global) ---
function formatCurrency(value) {
    if (value === null || value === undefined) return 'R$ 0,00';
    const val = parseFloat(value);
    return isNaN(val) ? 'R$ 0,00' : val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined) return '0';
    const val = parseFloat(value);
    return isNaN(val) ? '0' : val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDateTime(dateString) {
    if (!dateString) return '--';
    try {
        return new Date(dateString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}
function formatCNPJ(cnpj) {
    if (!cnpj) return '--';
    cnpj = cnpj.replace(/\D/g, '');
    if (cnpj.length === 14) {
        return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    return cnpj;
}

function formatDocument(doc) {
    if (!doc) return '--';
    doc = String(doc).replace(/\D/g, '');
    if (doc.length === 11) return formatCPF(doc);
    if (doc.length === 14) return formatCNPJ(doc);
    return doc;
}
function formatCPF(cpf) {
    if (!cpf) return '--';
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length === 11) {
        return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }
    return cpf;
}


function truncateText(text, maxLength = 50) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function getStatusBadgeHTML(statusText) {
    if (!statusText) return '<span class="badge bg-secondary">Desconhecido</span>';
    const lowerStatus = statusText.toLowerCase();
    let badgeClass = 'bg-secondary'; // Padrão
    if (lowerStatus.includes('autorizado')) badgeClass = 'bg-success';
    else if (lowerStatus.includes('cancelado')) badgeClass = 'bg-danger';
    else if (lowerStatus.includes('rejeitado')) badgeClass = 'bg-warning text-dark';
    else if (lowerStatus.includes('processado')) badgeClass = 'bg-info text-dark';
    else if (lowerStatus.includes('pendente')) badgeClass = 'bg-secondary';
    return `<span class="badge ${badgeClass}">${statusText}</span>`;
}

function getChartColors(count) {
    const baseColors = ['#4CAF50', '#1b4d3e', '#FFC107', '#2196F3', '#FF5722', '#607D8B', '#9C27B0', '#00BCD4', '#8BC34A', '#E91E63'];
    return Array.from({ length: count }, (_, i) => baseColors[i % baseColors.length]);
}
function getChartBorderColors(count) {
     const baseColors = ['#388E3C', '#0f3b2f', '#FFA000', '#1976D2', '#E64A19', '#455A64', '#7B1FA2', '#0097A7', '#689F38', '#C2185B'];
    return Array.from({ length: count }, (_, i) => baseColors[i % baseColors.length]);
}

// Função auxiliar para tratar respostas de fetch
async function handleFetchResponse(response) {
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            // Se não conseguir parsear JSON, usa o statusText
            throw new Error(response.statusText || `Erro HTTP ${response.status}`);
        }
        // Tenta pegar a mensagem de erro mais específica
        const errorMessage = errorData.detail || errorData.error || JSON.stringify(errorData);
        throw new Error(errorMessage);
    }
    return response.json();
}

// Assegura que showNotification está disponível globalmente (de scripts.js ou auth.js)
// Se não estiver, uma versão básica:
if (typeof showNotification !== 'function') {
    window.showNotification = function(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // Poderia adicionar um alert simples como fallback, mas pode ser irritante.
        // alert(`[${type.toUpperCase()}] ${message}`);
    };
}