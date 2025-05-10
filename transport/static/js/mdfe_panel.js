/**
 * mdfe_panel.js
 * Funcionalidades para o painel de MDF-e.
 * v1.2.0 - Correção dos IDs dos containers dos gráficos.
 */

// Variáveis Globais
let currentPageMdfe = 1;
const pageSizeMdfe = 10;
let totalItemsMdfe = 0;
let mdfeDataCache = [];
let currentMdfeId = null;

// Instâncias dos Gráficos
let chartMdfeRelacaoCteInstance = null; // Renomeado para clareza
let chartMdfeTopVeiculosInstance = null; // Renomeado para clareza

/**
 * Define o intervalo de datas padrão para os filtros.
 */
function setDefaultDateRangeMdfePanel() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);

    const dataInicioInput = document.getElementById('data_inicio_mdfe');
    const dataFimInput = document.getElementById('data_fim_mdfe');

    if (dataInicioInput) {
        dataInicioInput.value = startDate.toISOString().split('T')[0];
    } else {
        console.error("Elemento 'data_inicio_mdfe' não encontrado no HTML.");
    }
    if (dataFimInput) {
        dataFimInput.value = endDate.toISOString().split('T')[0];
    } else {
        console.error("Elemento 'data_fim_mdfe' não encontrado no HTML.");
    }
}

/**
 * Limpa os filtros e recarrega os dados.
 */
function resetFiltersMdfePanel() {
    const form = document.getElementById('filterFormMdfe');
    if (form) form.reset();
    setDefaultDateRangeMdfePanel();
    currentPageMdfe = 1;
    loadMdfeDataPanel();
}

/**
 * Carrega os dados principais do painel MDF-e.
 */
async function loadMdfeDataPanel() {
    showLoadingStateMdfePanel(true);

    const dataInicio = document.getElementById('data_inicio_mdfe').value;
    const dataFim = document.getElementById('data_fim_mdfe').value;
    const placa = document.getElementById('placa_mdfe_filter').value;
    const statusFilterValue = document.getElementById('status_mdfe_filter').value;
    const ufIni = document.getElementById('uf_ini_mdfe_filter').value;
    const ufFim = document.getElementById('uf_fim_mdfe_filter').value;
    const emitenteCnpj = document.getElementById('emitente_cnpj_mdfe_filter').value;
    const searchText = document.getElementById('search_text_mdfe_filter').value;

    let tableApiUrl = `/api/mdfes/?page=${currentPageMdfe}&page_size=${pageSizeMdfe}`;
    if (dataInicio) tableApiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) tableApiUrl += `&data_fim=${dataFim}`;
    if (placa) tableApiUrl += `&placa=${placa}`;
    if (ufIni) tableApiUrl += `&uf_ini=${ufIni}`;
    if (ufFim) tableApiUrl += `&uf_fim=${ufFim}`;
    if (emitenteCnpj) tableApiUrl += `&emitente_cnpj=${emitenteCnpj.replace(/\D/g, '')}`;
    if (searchText) tableApiUrl += `&q=${encodeURIComponent(searchText)}`;

    if (statusFilterValue) {
        if (statusFilterValue === 'autorizado_ativo') tableApiUrl += `&autorizado=true&encerrado=false&cancelado=false`;
        else if (statusFilterValue === 'encerrado') tableApiUrl += `&encerrado=true`;
        else if (statusFilterValue === 'cancelado') tableApiUrl += `&cancelado=true`;
        else if (statusFilterValue === 'pendente_autorizacao') tableApiUrl += `&autorizado=false&processado=false`;
        else if (statusFilterValue === 'processado_sem_protocolo') tableApiUrl += `&processado=true&autorizado=false&cancelado=false&encerrado=false`;
    }

    let panelApiUrl = `/api/painel/mdfe/?`;
    if (dataInicio) panelApiUrl += `data_inicio=${dataInicio}&`;
    if (dataFim) panelApiUrl += `data_fim=${dataFim}&`;
    if (placa) panelApiUrl += `placa=${placa}&`;
    if (ufIni) panelApiUrl += `uf_ini=${ufIni}&`;
    if (ufFim) panelApiUrl += `uf_fim=${ufFim}&`;
    if (emitenteCnpj) panelApiUrl += `emitente_cnpj=${emitenteCnpj.replace(/\D/g, '')}&`;
    if (searchText) panelApiUrl += `q=${encodeURIComponent(searchText)}&`;
    if (statusFilterValue) panelApiUrl += `status=${statusFilterValue}&`;
    panelApiUrl = panelApiUrl.slice(0, -1);

    try {
        const [listResponse, panelResponse] = await Promise.all([
            Auth.fetchWithAuth(tableApiUrl),
            Auth.fetchWithAuth(panelApiUrl)
        ]);

        if (!listResponse.ok) {
            const errData = await listResponse.json().catch(() => ({}));
            throw new Error(`Erro ao buscar lista de MDF-es: ${errData.detail || listResponse.statusText}`);
        }
        const listData = await listResponse.json();
        mdfeDataCache = listData || [];
        totalItemsMdfe = listData ? listData.length : 0;
        renderMdfeTablePanel(mdfeDataCache);
        updatePaginationMdfePanel(totalItemsMdfe, pageSizeMdfe, currentPageMdfe, false); // Assumindo que a API de lista não é paginada pelo DRF como no exemplo

        if (!panelResponse.ok) {
            const errData = await panelResponse.json().catch(() => ({}));
            throw new Error(`Erro ao buscar dados do painel MDF-e: ${errData.detail || panelResponse.statusText}`);
        }
        const panelData = await panelResponse.json();
        updateMdfeSummaryCardsPanel(panelData.cards);
        renderMdfeRelacaoCteChartPanel(panelData.grafico_cte_mdfe || []);
        renderMdfeTopVeiculosChartPanel(panelData.top_veiculos || []);

    } catch (error) {
        console.error("Falha ao carregar dados do painel MDF-e:", error);
        showNotification(`${error.message}`, 'error');
        document.getElementById('mdfeListBody').innerHTML = `<tr><td colspan="9" class="text-center text-danger p-4">Erro ao carregar dados. Verifique o console.</td></tr>`;
        clearChartContainerPanel('chart-mdfe-relacao-cte-container', 'Erro ao carregar gráfico de relação CT-e.');
        clearChartContainerPanel('chart-mdfe-top-veiculos-container', 'Erro ao carregar gráfico de top veículos.');
    } finally {
        showLoadingStateMdfePanel(false);
    }
}

/**
 * Limpa um container de gráfico e exibe uma mensagem.
 */
function clearChartContainerPanel(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="text-center text-danger p-3">${message}</p>`;
    }
}

/**
 * Atualiza os cards de resumo com dados da API do painel.
 */
function updateMdfeSummaryCardsPanel(cardsData) {
    if (!cardsData) {
        console.warn("Dados dos cards não fornecidos para atualização.");
        const cardIds = ['card-total-mdfes', 'card-mdfes-autorizados-ativos', 'card-mdfes-encerrados', 'card-mdfes-cancelados', 'card-mdfes-docs-transportados'];
        cardIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        });
        return;
    }
    document.getElementById('card-total-mdfes').textContent = formatNumber(cardsData.total_mdfes || 0);
    document.getElementById('card-mdfes-autorizados-ativos').textContent = formatNumber(cardsData.total_autorizados || 0);
    document.getElementById('card-mdfes-encerrados').textContent = formatNumber(cardsData.total_encerrados || 0);
    document.getElementById('card-mdfes-cancelados').textContent = formatNumber(cardsData.total_cancelados || 0);
    document.getElementById('card-mdfes-docs-transportados').textContent = formatNumber(cardsData.total_ctes_em_mdfes || 0);
}

/**
 * Renderiza o gráfico de Relação CT-e/MDF-e.
 */
function renderMdfeRelacaoCteChartPanel(data) {
    const container = document.getElementById('chart-mdfe-relacao-cte-container'); // ID CORRIGIDO
    if (!container) {
        console.warn("Container do gráfico 'chart-mdfe-relacao-cte-container' não encontrado.");
        return;
    }
    container.innerHTML = '<canvas id="chartMdfeRelacaoCte"></canvas>';
    const canvas = document.getElementById('chartMdfeRelacaoCte');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-center text-muted small p-3">Nenhum dado de relação CT-e/MDF-e.</p>';
        if (chartMdfeRelacaoCteInstance) chartMdfeRelacaoCteInstance.destroy();
        chartMdfeRelacaoCteInstance = null;
        return;
    }
    if (chartMdfeRelacaoCteInstance) chartMdfeRelacaoCteInstance.destroy();

    const labels = data.map(item => item.categoria);
    const counts = data.map(item => item.contagem);

    chartMdfeRelacaoCteInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade de MDF-es',
                data: counts,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'MDF-es por Quantidade de CT-es Vinculados' }
            }
        }
    });
}

/**
 * Renderiza o gráfico de Top Veículos.
 */
function renderMdfeTopVeiculosChartPanel(data) {
    const container = document.getElementById('chart-mdfe-top-veiculos-container'); // ID CORRIGIDO
    if (!container) {
        console.warn("Container do gráfico 'chart-mdfe-top-veiculos-container' não encontrado.");
        return;
    }
    container.innerHTML = '<canvas id="chartMdfeTopVeiculos"></canvas>';
    const canvas = document.getElementById('chartMdfeTopVeiculos');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-center text-muted small p-3">Nenhum dado de top veículos.</p>';
        if (chartMdfeTopVeiculosInstance) chartMdfeTopVeiculosInstance.destroy();
        chartMdfeTopVeiculosInstance = null;
        return;
    }
    if (chartMdfeTopVeiculosInstance) chartMdfeTopVeiculosInstance.destroy();

    const labels = data.map(item => item.placa);
    const counts = data.map(item => item.total);

    chartMdfeTopVeiculosInstance = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'MDF-es por Veículo',
                data: counts,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
                    'rgba(199, 199, 199, 0.7)', 'rgba(83, 102, 255, 0.7)',
                    'rgba(40, 167, 69, 0.7)', 'rgba(220, 53, 69, 0.7)'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth:15, padding:10 } },
                title: { display: true, text: 'Top Veículos por Nº de MDF-es' }
            }
        }
    });
}

/**
 * Mostra ou esconde o indicador de carregamento.
 */
function showLoadingStateMdfePanel(isLoading) {
    const tableBody = document.getElementById('mdfeListBody');
    const filterButton = document.getElementById('btnFiltrarMdfePanel');
    const cardSpinners = document.querySelectorAll('#card-total-mdfes .spinner-border, #card-mdfes-autorizados-ativos .spinner-border, #card-mdfes-encerrados .spinner-border, #card-mdfes-cancelados .spinner-border, #card-mdfes-docs-transportados .spinner-border');

    if (isLoading) {
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center p-5"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></td></tr>`;
        }
        if (filterButton) filterButton.disabled = true;
        cardSpinners.forEach(spinner => spinner.style.display = 'inline-block');
    } else {
        if (filterButton) filterButton.disabled = false;
        cardSpinners.forEach(spinner => spinner.style.display = 'none');
    }
}

/**
 * Renderiza a tabela de MDF-es.
 */
function renderMdfeTablePanel(mdfes) {
    const tableBody = document.getElementById('mdfeListBody');
    if (!tableBody) return;

    if (!mdfes || mdfes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted p-4">Nenhum MDF-e encontrado.</td></tr>`;
        return;
    }

    tableBody.innerHTML = mdfes.map(mdfe => {
        const dataExibicao = mdfe.data_emissao || (mdfe.data_upload ? formatDateTime(mdfe.data_upload) : '--');
        const statusInfo = getMdfeStatusObjectPanel(mdfe);
        const statusBadge = `<span class="badge ${statusInfo.badgeClass} text-dark-emphasis">${statusInfo.text}</span>`;
        const chaveAbrev = mdfe.chave ? `${mdfe.chave.substring(0, 6)}...${mdfe.chave.substring(mdfe.chave.length - 6)}` : '--';
        const serie = mdfe.serie_mdfe || (mdfe.chave ? mdfe.chave.substring(22, 25) : '--');

        return `
            <tr>
                <td>${mdfe.numero_mdfe || '--'}</td>
                <td>${serie}</td>
                <td title="${mdfe.chave || ''}">${chaveAbrev}</td>
                <td>${dataExibicao}</td>
                <td>${mdfe.uf_inicio || '--'} / ${mdfe.uf_fim || '--'}</td>
                <td>${mdfe.placa_tracao || '--'}</td>
                <td class="text-center">${mdfe.documentos_count !== undefined ? mdfe.documentos_count : '--'}</td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-outline-primary" onclick="openMdfeDetailModalPanel('${mdfe.id}')" title="Ver Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button type="button" class="btn btn-outline-info" onclick="openDocsVinculadosModalPanel('${mdfe.id}')" title="Docs. Vinculados">
                            <i class="fas fa-file-invoice"></i>
                        </button>
                        <a href="/api/mdfes/${mdfe.id}/xml/" class="btn btn-outline-success" title="Baixar XML" target="_blank">
                            <i class="fas fa-file-code"></i>
                        </a>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Atualiza os controles de paginação.
 */
function updatePaginationMdfePanel(totalItems, pageSize, currentPage, apiPaginates) {
    const paginationElement = document.getElementById('paginationMdfe');
    if (!paginationElement) return;
    
    const totalPages = apiPaginates ? Math.ceil(totalItems / pageSize) : (totalItems > 0 ? 1: 0) ;
    paginationElement.innerHTML = '';

    if (totalPages <= 1 && !apiPaginates && totalItems <= pageSize) { // Se não há paginação da API e tudo cabe na "página"
         paginationElement.innerHTML = ''; // Não mostra paginação
         return;
    }
     if (totalPages === 0) {
        paginationElement.innerHTML = '<li class="page-item disabled"><span class="page-link">Nenhum item</span></li>';
        return;
    }


    let html = '';
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
               <a class="page-link" href="#" data-page="1">&laquo;&laquo;</a></li>`;
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
               <a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a></li>`;

    const maxPagesToShow = 3; // Reduzido para melhor visualização com início/fim
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (totalPages > maxPagesToShow) {
        if (endPage === totalPages) startPage = Math.max(1, totalPages - maxPagesToShow + 1);
        else if (startPage === 1) endPage = Math.min(totalPages, maxPagesToShow);
    }


    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
                   <a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    }

    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
               <a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a></li>`;
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
               <a class="page-link" href="#" data-page="${totalPages}">&raquo;&raquo;</a></li>`;
    
    paginationElement.innerHTML = html;

    paginationElement.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const page = parseInt(event.target.getAttribute('data-page'));
            if (page && page !== currentPageMdfe && page >= 1 && page <= totalPages) {
                currentPageMdfe = page;
                loadMdfeDataPanel();
            }
        });
    });
}

/**
 * Abre o modal com detalhes do MDF-e.
 */
async function openMdfeDetailModalPanel(mdfeId) {
    currentMdfeId = mdfeId;
    const modalElement = document.getElementById('mdfeDetailModal');
    if (!modalElement) return;
    const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
    
    const modalBody = document.getElementById('mdfeDetailModalBody');
    const modalTitle = document.getElementById('mdfeDetailModalLabel');
    const btnImprimir = document.getElementById('btnImprimirDamdfe');
    const btnXml = document.getElementById('btnBaixarXmlMdfe');
    const btnReprocessar = document.getElementById('btnReprocessarMdfe');

    modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Carregando...</p></div>';
    modalTitle.textContent = "Detalhes do MDF-e";
    if(btnImprimir) btnImprimir.disabled = true;
    if(btnXml) btnXml.disabled = true;
    if(btnReprocessar) btnReprocessar.disabled = true;
    modal.show();

    try {
        const response = await Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/`);
        if (!response.ok) throw new Error('Falha ao buscar detalhes do MDF-e.');
        const data = await response.json();

        modalTitle.textContent = `MDF-e: ${data.identificacao?.n_mdf || (data.chave ? data.chave.substring(25,34): 'N/A')}`;
        renderMdfeDetailContentPanel(modalBody, data);

        const statusInfo = getMdfeStatusObjectPanel(data);
        if(btnImprimir) btnImprimir.disabled = !(statusInfo.isAutorizado && !statusInfo.isCancelado && !statusInfo.isEncerrado);
        if(btnXml) btnXml.disabled = false;
        if(btnReprocessar) btnReprocessar.disabled = statusInfo.isCancelado || statusInfo.isEncerrado;

    } catch (error) {
        console.error("Erro ao carregar detalhes do MDF-e:", error);
        modalBody.innerHTML = `<div class="alert alert-danger">Erro ao carregar detalhes. ${error.message}</div>`;
    }
}

/**
 * Renderiza o conteúdo detalhado do MDF-e no corpo do modal.
 */
function renderMdfeDetailContentPanel(modalBody, mdfe) {
    const ident = mdfe.identificacao || {};
    const emit = mdfe.emitente || {};
    const modalRodo = mdfe.modal_rodoviario || {};
    const veicTracao = modalRodo.veiculo_tracao || {};
    const totais = mdfe.totais || {};
    const protocolo = mdfe.protocolo || {};
    const cancelamento = mdfe.cancelamento || {};
    const encerramentoInfo = mdfe.encerramento_info || (mdfe.encerrado ? { 
        status: 'Encerrado', 
        data: mdfe.data_encerramento, 
        municipio: mdfe.municipio_encerramento_cod, 
        uf: mdfe.uf_encerramento, 
        protocolo: mdfe.protocolo_encerramento 
    } : null);

    let html = `<div class="container-fluid">`;
    // Seção de Identificação
    html += `<h6><i class="fas fa-file-alt me-2"></i>Identificação</h6><hr class="mt-1 mb-2">
    <div class="row mb-2">
        <div class="col-md-3"><small class="text-muted d-block">Número:</small><strong>${ident.n_mdf || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Série:</small><strong>${ident.serie || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Emissão:</small><strong>${ident.dh_emi_formatada || formatDateTime(ident.dh_emi) || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Modal:</small><strong>${ident.modal == '1' ? 'Rodoviário' : (ident.modal || '--')}</strong></div>
    </div>
    <div class="row mb-2">
        <div class="col-md-3"><small class="text-muted d-block">UF Início:</small><strong>${ident.uf_ini || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">UF Fim:</small><strong>${ident.uf_fim || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Início Viagem:</small><strong>${ident.dh_ini_viagem_formatada || formatDateTime(ident.dh_ini_viagem) || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Ambiente:</small><strong>${ident.tp_amb == 1 ? 'Produção' : 'Homologação'}</strong></div>
    </div>
    <div class="row"><div class="col-12"><small class="text-muted d-block">Chave:</small><p class="text-break small"><strong>${mdfe.chave || '--'}</strong></p></div></div>`;

    // Seção do Emitente
    html += `<h6 class="mt-3"><i class="fas fa-building me-2"></i>Emitente</h6><hr class="mt-1 mb-2">
    <div class="row">
        <div class="col-md-6"><small class="text-muted d-block">Razão Social:</small><strong>${emit.razao_social || '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">CNPJ:</small><strong>${emit.cnpj ? formatCNPJ(emit.cnpj) : '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">IE:</small><strong>${emit.ie || '--'}</strong></div>
    </div>`;

    // Seção do Modal Rodoviário
    if (mdfe.modal_rodoviario) {
        html += `<h6 class="mt-3"><i class="fas fa-road me-2"></i>Modal Rodoviário</h6><hr class="mt-1 mb-2">
        <p><small class="text-muted">RNTRC:</small> <strong>${modalRodo.rntrc || '--'}</strong></p>
        <p class="fw-bold">Veículo Tração</p>
        <div class="row">
            <div class="col-md-3"><small class="text-muted d-block">Placa:</small><strong>${veicTracao.placa || '--'}</strong></div>
            <div class="col-md-3"><small class="text-muted d-block">RENAVAM:</small><strong>${veicTracao.renavam || '--'}</strong></div>
            <div class="col-md-3"><small class="text-muted d-block">Tara (kg):</small><strong>${veicTracao.tara ? formatNumber(veicTracao.tara, 0) : '--'}</strong></div>
            <div class="col-md-3"><small class="text-muted d-block">UF:</small><strong>${veicTracao.uf || '--'}</strong></div>
        </div>`;
        if (modalRodo.veiculos_reboque && modalRodo.veiculos_reboque.length > 0) {
            html += `<p class="fw-bold mt-2">Veículos Reboque</p>`;
            modalRodo.veiculos_reboque.forEach(r => {
                html += `<div class="row border-top pt-1 mt-1">
                           <div class="col-md-3"><small class="text-muted">Placa:</small><p>${r.placa}</p></div>
                           <div class="col-md-3"><small class="text-muted">Tara:</small><p>${r.tara}kg</p></div>
                           <div class="col-md-3"><small class="text-muted">Cap KG:</small><p>${r.cap_kg || '--'}kg</p></div>
                           <div class="col-md-3"><small class="text-muted">UF:</small><p>${r.uf}</p></div>
                         </div>`;
            });
        }
        if (mdfe.condutores && mdfe.condutores.length > 0) {
            html += `<p class="fw-bold mt-2">Condutores</p>`;
            mdfe.condutores.forEach(c => { html += `<p class="mb-0"><small class="text-muted">Nome:</small> ${c.nome} | <small class="text-muted">CPF:</small> ${formatCPF(c.cpf)}</p>`; });
        }
    }

    // Seção de Totais
    html += `<h6 class="mt-3"><i class="fas fa-calculator me-2"></i>Totais</h6><hr class="mt-1 mb-2">
    <div class="row">
        <div class="col-md-3"><small class="text-muted d-block">Qtd. CT-e:</small><strong>${totais.q_cte !== undefined ? formatNumber(totais.q_cte, 0) : '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Qtd. NF-e:</small><strong>${totais.q_nfe !== undefined ? formatNumber(totais.q_nfe, 0) : '--'}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Valor Carga:</small><strong>${formatCurrency(totais.v_carga)}</strong></div>
        <div class="col-md-3"><small class="text-muted d-block">Peso (${totais.c_unid === '01' ? 'KG' : (totais.c_unid === '02' ? 'TON' : totais.c_unid || '?')}):</small><strong>${formatNumber(totais.q_carga, 4)}</strong></div>
    </div>`;

    // Protocolo de Autorização
    html += `<h6 class="mt-3"><i class="fas fa-stamp me-2"></i>Situação</h6><hr class="mt-1 mb-2">`;
    const statusObj = getMdfeStatusObjectPanel(mdfe);
    html += `<div class="alert ${statusObj.alertClass} py-2 mb-1">
                <p class="mb-1"><strong>Status: ${statusObj.text}</strong></p>`;
    if (protocolo && protocolo.codigo_status) {
        html += `<small class="d-block">Código: ${protocolo.codigo_status} | Motivo: ${protocolo.motivo_status || '--'}</small>
                 <small class="d-block">Protocolo: ${protocolo.numero_protocolo || '--'} | Data: ${protocolo.data_recebimento_formatada || formatDateTime(protocolo.data_recebimento) || '--'}</small>`;
    } else if (!statusObj.isCancelado && !statusObj.isEncerrado){
        html += `<small class="d-block">Documento aguardando processamento ou sem protocolo de autorização.</small>`
    }
    html += `</div>`;
    
    // Encerramento
    if (encerramentoInfo && encerramentoInfo.status) {
        let encAlertClass = 'alert-info';
        if(encerramentoInfo.status === 'Encerramento Cancelado') encAlertClass = 'alert-warning';
        else if(encerramentoInfo.status === 'Encerrado') encAlertClass = 'alert-primary';

        html += `<div class="alert ${encAlertClass} py-2 mb-1"><strong>Encerramento: ${encerramentoInfo.status}</strong><br>`;
        if (encerramentoInfo.status === 'Encerramento Cancelado') {
            html += `<small>Data Canc.: ${formatDateTime(encerramentoInfo.data_cancelamento) || '--'} | Prot. Canc.: ${encerramentoInfo.protocolo_cancelamento || '--'}<br>
            Justificativa: ${encerramentoInfo.justificativa_cancelamento || '--'}</small>`;
        } else { 
            html += `<small>Data: ${formatDate(encerramentoInfo.data) || '--'} | Município: ${encerramentoInfo.municipio || '--'}/${encerramentoInfo.uf || '--'} | Protocolo: ${encerramentoInfo.protocolo || '--'}</small>`;
        }
        html += `</div>`;
    }

    // Cancelamento
    if (cancelamento && (cancelamento.c_stat === 135 || cancelamento.cStat === 135)) {
        html += `<div class="alert alert-danger py-2 mb-1">
            <strong>Documento Cancelado</strong><br>
            <small>Data: ${cancelamento.dh_reg_evento_formatada || formatDateTime(cancelamento.dh_reg_evento) || '--'} | Protocolo: ${cancelamento.n_prot_retorno || '--'}<br>
            Justificativa: ${cancelamento.x_just || '--'}</small>
        </div>`;
    }

    html += `</div>`; // Fecha container-fluid
    modalBody.innerHTML = html;
}


/**
 * Abre o modal para exibir os documentos vinculados a um MDF-e.
 */
async function openDocsVinculadosModalPanel(mdfeId) {
    const modalElement = document.getElementById('docsVinculadosModal');
    if(!modalElement) return;
    const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
    
    const modalBody = document.getElementById('docsVinculadosModalBody');
    const modalTitle = document.getElementById('docsVinculadosModalLabel');

    modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Carregando...</p></div>';
    modalTitle.textContent = "Documentos Vinculados";
    modal.show();

    try {
        const docsVinculados = await Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/documentos/`).then(res => res.ok ? res.json() : Promise.reject(new Error('Falha ao buscar documentos.')));
        const mdfeDetalhe = await Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/`).then(res => res.ok ? res.json() : Promise.reject(new Error('Falha ao buscar MDF-e.')));
        
        modalTitle.textContent = `Docs. do MDF-e: ${mdfeDetalhe.identificacao?.n_mdf || (mdfeDetalhe.chave ? mdfeDetalhe.chave.substring(25,34) : 'N/A') }`;
        renderDocsVinculadosContentPanel(modalBody, docsVinculados);
    } catch (error) {
        console.error("Erro ao carregar docs vinculados ou MDF-e:", error);
        modalBody.innerHTML = `<div class="alert alert-danger">Erro ao carregar. ${error.message}</div>`;
    }
}

/**
 * Renderiza a lista de documentos vinculados.
 */
function renderDocsVinculadosContentPanel(modalBody, docsList) {
    if (!docsList || docsList.length === 0) {
        modalBody.innerHTML = '<div class="alert alert-info m-3">Nenhum documento vinculado a este MDF-e.</div>';
        return;
    }

    const municipiosMap = new Map();
    docsList.forEach(doc => {
        const munKey = doc.municipio ? `${doc.municipio.codigo}-${doc.municipio.nome}` : 'sem_municipio_informado';
        if (!municipiosMap.has(munKey)) {
            municipiosMap.set(munKey, {
                nome: doc.municipio ? doc.municipio.nome : "Sem Município de Descarga",
                codigo: doc.municipio ? doc.municipio.codigo : "N/A",
                documentos: []
            });
        }
        municipiosMap.get(munKey).documentos.push(doc);
    });

    let html = '<div class="accordion" id="accordionDocsVinculadosPanel">';
    let first = true;
    for (const [key, grupo] of municipiosMap) {
        const collapseId = `collapseMunPanel_${key.replace(/\W/g, '')}`; // ID seguro para HTML
        html += `
        <div class="accordion-item">
            <h2 class="accordion-header" id="headingMunPanel_${key.replace(/\W/g, '')}">
                <button class="accordion-button ${first ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${first}">
                    ${grupo.nome} (${grupo.codigo}) - ${grupo.documentos.length} doc(s)
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse ${first ? 'show' : ''}" data-bs-parent="#accordionDocsVinculadosPanel">
                <div class="accordion-body p-0">`;
        if (grupo.documentos.length > 0) {
            html += `<ul class="list-group list-group-flush">`;
            grupo.documentos.forEach(doc => {
                let infoAdicional = '';
                if (doc.cte) {
                    infoAdicional = `<br><small class="text-muted">Rem: ${truncateText(doc.cte.remetente_nome, 15)} &rarr; Dest: ${truncateText(doc.cte.destinatario_nome, 15)} | Val: ${formatCurrency(doc.cte.valor_total)}</small>`;
                }
                const chaveDocVinculado = doc.chave_documento || doc.chave || 'N/A';
                const tipoDocVinculado = doc.tipo || getDocumentoTipo(chaveDocVinculado);

                html += `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <span class="badge bg-secondary me-2">${tipoDocVinculado}</span>
                            <span class="text-break">${chaveDocVinculado}</span>
                            ${infoAdicional}
                        </div>
                        ${doc.cte && doc.cte.id ? `<a href="/api/ctes/${doc.cte.id}/xml/" class="btn btn-sm btn-outline-success ms-2" target="_blank" title="XML do CT-e"><i class="fas fa-file-code"></i></a>` : ''}
                    </li>`;
            });
            html += `</ul>`;
        } else {
            html += `<p class="p-3 text-muted">Nenhum documento para este município.</p>`;
        }
        html += `</div></div></div>`;
        first = false;
    }
    html += '</div>';
    modalBody.innerHTML = html;
}


/**
 * Lida com a ação de reprocessar um MDF-e.
 */
async function handleReprocessarMdfePanel() {
    if (!currentMdfeId) {
        showNotification("Nenhum MDF-e selecionado.", "warning");
        return;
    }
    const btn = document.getElementById('btnReprocessarMdfe');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Reprocessando...`;
    }
    try {
        const response = await Auth.fetchWithAuth(`/api/mdfes/${currentMdfeId}/reprocessar/`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.detail || "Falha no reprocessamento.");
        
        showNotification(result.message || "MDF-e enviado para reprocessamento.", "success");
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal'));
        if (modalInstance) modalInstance.hide();
        loadMdfeDataPanel(); 
    } catch (error) {
        console.error("Erro ao reprocessar MDF-e:", error);
        showNotification(`Erro: ${error.message}`, "error");
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-sync-alt me-1"></i>Reprocessar`;
        }
    }
}

/**
 * Exporta os MDF-es filtrados para CSV.
 */
function exportMdfeToCSVPanel() {
    const dataInicio = document.getElementById('data_inicio_mdfe').value;
    const dataFim = document.getElementById('data_fim_mdfe').value;
    const placa = document.getElementById('placa_mdfe_filter').value;
    const statusFilter = document.getElementById('status_mdfe_filter').value;
    const ufIni = document.getElementById('uf_ini_mdfe_filter').value;
    const ufFim = document.getElementById('uf_fim_mdfe_filter').value;
    const emitenteCnpj = document.getElementById('emitente_cnpj_mdfe_filter').value;
    const searchText = document.getElementById('search_text_mdfe_filter').value;

    let exportUrl = `/api/mdfes/export/?format=csv`;
    if (dataInicio) exportUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) exportUrl += `&data_fim=${dataFim}`;
    if (placa) exportUrl += `&placa=${placa}`;
    if (ufIni) exportUrl += `&uf_ini=${ufIni}`;
    if (ufFim) exportUrl += `&uf_fim=${ufFim}`;
    if (emitenteCnpj) exportUrl += `&emitente_cnpj=${emitenteCnpj.replace(/\D/g, '')}`;
    if (searchText) exportUrl += `&q=${encodeURIComponent(searchText)}`;
    
    if (statusFilter === 'autorizado_ativo') exportUrl += `&autorizado=true&encerrado=false&cancelado=false`;
    else if (statusFilter === 'encerrado') exportUrl += `&encerrado=true`;
    else if (statusFilter === 'cancelado') exportUrl += `&cancelado=true`;
    else if (statusFilter === 'pendente_autorizacao') exportUrl += `&autorizado=false&processado=false`;
    else if (statusFilter === 'processado_sem_protocolo') exportUrl += `&processado=true&autorizado=false&cancelado=false&encerrado=false`;

    window.open(exportUrl, '_blank');
}

/**
 * Retorna um objeto com informações de status do MDF-e.
 */
function getMdfeStatusObjectPanel(mdfe) {
    let text = 'Desconhecido';
    let badgeClass = 'bg-secondary'; // Cor de fundo do badge
    let alertClass = 'alert-secondary'; // Classe de alerta para o modal
    let isCancelado = false, isEncerrado = false, isAutorizado = false;

    if (mdfe && mdfe.status) { // Prioriza o status da lista se disponível
        text = mdfe.status;
        if (text === 'Cancelado') { badgeClass = 'bg-danger'; alertClass = 'alert-danger'; isCancelado = true; }
        else if (text === 'Encerrado') { badgeClass = 'bg-dark'; alertClass = 'alert-dark'; isEncerrado = true; isAutorizado = true;}
        else if (text === 'Enc. Cancelado') { badgeClass = 'bg-warning text-dark'; alertClass = 'alert-warning'; isAutorizado = true;} // Encerramento foi cancelado, MDFe volta a ser ativo (Autorizado)
        else if (text === 'Autorizado') { badgeClass = 'bg-success'; alertClass = 'alert-success'; isAutorizado = true;}
        else if (text.startsWith('Rejeitado')) { badgeClass = 'bg-warning text-dark'; alertClass = 'alert-warning';}
        else if (text === 'Processado (s/ Prot.)') { badgeClass = 'bg-info text-dark'; alertClass = 'alert-info';}
        else { text = 'Pendente'; badgeClass = 'bg-secondary'; alertClass = 'alert-secondary'; } // Default se o status da lista for desconhecido
    } else if (mdfe) { // Fallback para o objeto detalhado
        if (mdfe.cancelamento && (mdfe.cancelamento.c_stat === 135 || mdfe.cancelamento.cStat === 135)) {
            text = 'Cancelado'; badgeClass = 'bg-danger'; alertClass = 'alert-danger'; isCancelado = true;
        } else if (mdfe.encerrado) {
            text = 'Encerrado'; badgeClass = 'bg-dark'; alertClass = 'alert-dark'; isEncerrado = true; isAutorizado = true;
            if (mdfe.cancelamento_encerramento && (mdfe.cancelamento_encerramento.c_stat === 135 || mdfe.cancelamento_encerramento.cStat === 135)) {
                text = 'Enc. Cancelado'; badgeClass = 'bg-warning text-dark'; alertClass = 'alert-warning'; isEncerrado = false;
            }
        } else if (mdfe.protocolo && (mdfe.protocolo.codigo_status === 100 || mdfe.protocolo.cStat === 100)) {
            text = 'Autorizado'; badgeClass = 'bg-success'; alertClass = 'alert-success'; isAutorizado = true;
        } else if (mdfe.protocolo && (mdfe.protocolo.codigo_status || mdfe.protocolo.cStat)) {
            text = `Rejeitado (${mdfe.protocolo.codigo_status || mdfe.protocolo.cStat})`; badgeClass = 'bg-warning text-dark'; alertClass = 'alert-warning';
        } else if (mdfe.processado) {
            text = 'Processado (s/ Prot.)'; badgeClass = 'bg-info text-dark'; alertClass = 'alert-info';
        } else {
            text = 'Pendente';
        }
    }
    return { text, badgeClass, alertClass, isCancelado, isEncerrado, isAutorizado };
}

// Funções auxiliares de formatação (assumindo que estão em scripts.js ou globais)
// Se não estiverem, descomente e adapte ou copie de scripts.js
/*
function formatDateTime(dateStr) { if (!dateStr) return '--'; try { return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return dateStr; } }
function formatDate(dateStr) { if (!dateStr) return '--'; try { return new Date(dateStr).toLocaleDateString('pt-BR'); } catch (e) { return dateStr; } }
function formatNumber(num, precision = 0) { if (typeof num !== 'number' && typeof num !== 'string') return '--'; const number = parseFloat(num); if(isNaN(number)) return '--'; return number.toLocaleString('pt-BR', { minimumFractionDigits: precision, maximumFractionDigits: precision }); }
function formatCurrency(num) { if (typeof num !== 'number' && typeof num !== 'string') return 'R$ --'; const number = parseFloat(num); if(isNaN(number)) return 'R$ --'; return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatCNPJ(cnpj) { if (!cnpj) return '--'; cnpj = String(cnpj).replace(/\D/g, ''); if (cnpj.length !== 14) return cnpj; return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
function formatCPF(cpf) { if (!cpf) return '--'; cpf = String(cpf).replace(/\D/g, ''); if (cpf.length !== 11) return cpf; return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"); }
function truncateText(text, maxLength) { if (!text) return '--'; return String(text).length > maxLength ? String(text).substring(0, maxLength) + '...' : String(text); }
*/

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Assegura que setDefaultDateRangeMdfePanel seja chamada apenas uma vez e após o DOM estar pronto.
    setDefaultDateRangeMdfePanel();
    loadMdfeDataPanel();

    document.getElementById('btnFiltrarMdfePanel')?.addEventListener('click', () => {
        currentPageMdfe = 1;
        loadMdfeDataPanel();
    });
    document.getElementById('btnResetarFiltrosMdfePanel')?.addEventListener('click', (e) => {
        e.preventDefault();
        resetFiltersMdfePanel();
    });
    document.getElementById('btnExportarCSV_Mdfe')?.addEventListener('click', exportMdfeToCSVPanel);
    document.getElementById('btnAtualizarPainelMdfe')?.addEventListener('click', loadMdfeDataPanel);

    document.getElementById('btnImprimirDamdfe')?.addEventListener('click', () => {
        if (currentMdfeId) {
            Auth.fetchWithAuth(`/api/mdfes/${currentMdfeId}/damdfe/`)
                .then(response => response.json())
                .then(data => {
                    if(data.error){ showNotification(data.error, 'error'); }
                    else {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
                        const dl = document.createElement('a');
                        dl.setAttribute("href", dataStr);
                        dl.setAttribute("download", `DAMDFE_${currentMdfeId}.json`);
                        document.body.appendChild(dl); dl.click(); dl.remove();
                        showNotification("JSON da DAMDFE gerado.", "info");
                    }
                }).catch(err => showNotification("Erro ao obter dados da DAMDFE.", "error"));
        }
    });
    document.getElementById('btnBaixarXmlMdfe')?.addEventListener('click', () => {
        if (currentMdfeId) window.open(`/api/mdfes/${currentMdfeId}/xml/`, '_blank');
    });
    document.getElementById('btnReprocessarMdfe')?.addEventListener('click', handleReprocessarMdfePanel);
});