/**
 * cte_panel.js
 * Functions for the CT-e panel page
 * Ajuste para dimensionamento de gráficos.
 */

// ... (variáveis globais e outras funções como na versão anterior) ...
let currentPage = 1;
const pageSize = 10;
let totalItems = 0;
let cteList = [];

let currentCTeId = null;

let cteModalidadeQtdChartInstance = null;
let cteTopRemetentesChartInstance = null;

const MODALIDADE_CHART_CONTAINER_ID = 'cteModalidadeQtdChartContainer';
const REMETENTES_CHART_CONTAINER_ID = 'cteTopRemetentesChartContainer';
const MODALIDADE_CANVAS_ID = 'cteModalidadeQtdChart';
const REMETENTES_CANVAS_ID = 'cteTopRemetentesChart';


document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Completamente Carregado - cte_panel.js");
    setDefaultDateRange();
    setupEventListeners();
    // Garante que os containers estejam prontos e os canvas sejam criados se não existirem
    getOrCreateCanvasContext(MODALIDADE_CHART_CONTAINER_ID, MODALIDADE_CANVAS_ID, "DOMContentLoaded");
    getOrCreateCanvasContext(REMETENTES_CHART_CONTAINER_ID, REMETENTES_CANVAS_ID, "DOMContentLoaded");
    loadCTeList();
});

// Função auxiliar para obter/criar canvas e retornar o contexto
function getOrCreateCanvasContext(containerId, canvasId, chartName) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`[${chartName}] ERRO: Container do gráfico '${containerId}' NÃO FOI ENCONTRADO NO DOM.`);
        return null;
    }

    // Limpa apenas mensagens anteriores, se houver, mas preserva outros elementos se existirem
    const existingMessage = container.querySelector('p.text-muted');
    if (existingMessage) {
        existingMessage.remove();
    }

    let canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.log(`[${chartName}] Canvas '${canvasId}' não existe. Criando dentro de '${containerId}'.`);
        canvas = document.createElement('canvas');
        canvas.id = canvasId;
        // Definir dimensões do canvas via JS pode ajudar em alguns casos, mas o CSS no container é geralmente melhor.
        // canvas.style.width = '100%';
        // canvas.style.height = '100%'; // O container já tem altura definida
        container.appendChild(canvas);
    } else if (!container.contains(canvas)) {
         console.warn(`[${chartName}] Canvas '${canvasId}' existe mas não está em '${containerId}'. Movendo...`);
         container.appendChild(canvas); // Move para o container correto
    }
    
    console.log(`[${chartName}] Canvas '${canvasId}' pronto para uso em '${containerId}'.`);
    return canvas.getContext('2d');
}

function setupEventListeners() {
    // ... (setupEventListeners como na versão anterior)
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            currentPage = 1;
            loadCTeList();
        });
    }

    const btnAtualizarLista = document.getElementById('btnAtualizarListaCTe');
    if(btnAtualizarLista) {
        btnAtualizarLista.addEventListener('click', function() {
            currentPage = 1;
            loadCTeList();
        });
    }

    const exportBtn = document.getElementById('btnExportarCsvCte');
    if (exportBtn) {
        exportBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportCteTableToCSV();
        });
    }
    setupModalGlobalEventListeners();
}

function setupModalGlobalEventListeners() {
    // ... (setupModalGlobalEventListeners como na versão anterior)
    const modal = document.getElementById('cteDetailModal');
    if (!modal) return;

    modal.addEventListener('click', function(event) {
        const target = event.target.closest('button');
        if (!target) return;

        if (target.id === 'btnPrintCTe') {
            if (!currentCTeId) return;
            Auth.fetchWithAuth(`/api/ctes/${currentCTeId}/dacte/`)
                .then(response => {
                    if (!response.ok) { return response.json().then(err => { throw (err.detail || err.error || err); }); }
                    return response.json();
                })
                .then(data => {
                    if (data.pdf_url) { window.open(data.pdf_url, '_blank'); }
                    else { showNotification(data.message || "Funcionalidade de DACTE (PDF) em desenvolvimento.", "info"); }
                })
                .catch(error => showNotification(typeof error === 'string' ? error : 'Erro ao gerar DACTE.', 'error'));
        } else if (target.id === 'btnDownloadXML') {
            if (!currentCTeId) return;
            window.open(`/api/ctes/${currentCTeId}/xml/`, '_blank');
        }
    });

    modal.addEventListener('hidden.bs.modal', function() {
        currentCTeId = null;
        const modalBody = document.getElementById('cteDetailContent');
        if (modalBody) modalBody.innerHTML = '<div class="d-flex justify-content-center p-5"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
    });
}

function setDefaultDateRange() {
    // ... (setDefaultDateRange como na versão anterior)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const dataInicioInput = document.getElementById('data_inicio');
    const dataFimInput = document.getElementById('data_fim');
    if (dataInicioInput) dataInicioInput.value = formatDateForInput(thirtyDaysAgo);
    if (dataFimInput) dataFimInput.value = formatDateForInput(today);
}

function formatDateForInput(date) {
    // ... (formatDateForInput como na versão anterior)
    if (!date || !(date instanceof Date) || isNaN(date)) return '';
    return date.toISOString().split('T')[0];
}


function loadCTeList() {
    showLoadingStateInUI();
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;
    const modalidadeFiltro = document.getElementById('modalidade')?.value;
    const statusFiltro = document.getElementById('status_filtro')?.value;
    const queryText = document.getElementById('search_text_cte')?.value;

    let apiUrl = `/api/ctes/?page=${currentPage}&page_size=${pageSize}`;
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (modalidadeFiltro) apiUrl += `&modalidade=${modalidadeFiltro}`;
    if (queryText) apiUrl += `&q=${encodeURIComponent(queryText)}`;
    if (statusFiltro) {
        if (statusFiltro) apiUrl += `&status=${statusFiltro}`;
    }

    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    const errorMsg = err.detail || err.error || JSON.stringify(err);
                    throw new Error(errorMsg);
                }).catch(() => { throw new Error(`Erro ${response.status}: ${response.statusText || 'Falha na requisição'}`); });
            }
            return response.json();
        })
        .then(data => {
            console.log("API Data Received for processing:", data);
            cteList = data.results || [];
            totalItems = data.count || 0;

            const qtdCif = cteList.filter(cte => cte.modalidade === 'CIF').length;
            const qtdFob = cteList.filter(cte => cte.modalidade === 'FOB').length;
            const valorTotalFretes = cteList.reduce((sum, cte) => sum + parseFloat(cte.valor_total || 0), 0);

            updateSummaryCards({
                total_ctes: totalItems,
                valor_total_fretes: valorTotalFretes,
                total_cif_qtd: qtdCif,
                total_fob_qtd: qtdFob
            });
            renderCTeTable();
            updatePagination();
            
            renderCteModalidadeQtdChart(qtdCif, qtdFob, cteList.length);
            renderTopRemetentesChart(cteList);
        })
        .catch(error => {
            console.error('Error loading CT-e data:', error);
            showNotification(`Falha ao carregar CT-es: ${error.message}`, 'error');
            const tbody = document.getElementById('cte-list');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-4"><i class="fas fa-exclamation-circle me-2"></i>${error.message || 'Erro ao carregar dados.'} Tente novamente.</td></tr>`;
            }
            clearChartsOnError();
            updateSummaryCards({ total_ctes: 0, valor_total_fretes: 0, total_cif_qtd: 0, total_fob_qtd: 0 });
        })
        .finally(() => {
            hideLoadingStateFromUI();
        });
}

function clearChartsOnError() {
    destroyAndClearOrShowMessage(cteModalidadeQtdChartInstance, MODALIDADE_CHART_CONTAINER_ID, 'Não foi possível carregar o gráfico de modalidades.');
    cteModalidadeQtdChartInstance = null;
    destroyAndClearOrShowMessage(cteTopRemetentesChartInstance, REMETENTES_CHART_CONTAINER_ID, 'Não foi possível carregar o gráfico de remetentes.');
    cteTopRemetentesChartInstance = null;
}

function destroyAndClearOrShowMessage(chartInstance, containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        if (chartInstance) {
            chartInstance.destroy();
        }
        // Apenas insere a mensagem se não houver um canvas (para não sobrescrever um canvas recém-criado)
        if(!container.querySelector('canvas')) { // Esta verificação pode ser redundante se o canvas é sempre recriado
             container.innerHTML = `<p class="text-center text-muted small mt-5 p-3">${message}</p>`;
        }
    }
}


function showLoadingStateInUI() {
    const tbody = document.getElementById('cte-list');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div><p class="mt-2">Carregando dados...</p></td></tr>`;
    document.querySelectorAll('#filterForm button, #btnAtualizarListaCTe').forEach(button => button.disabled = true);
    document.querySelectorAll('.card-body .h4 .spinner-border').forEach(spinner => spinner.style.display = 'inline-block');

    if (cteModalidadeQtdChartInstance) {
        cteModalidadeQtdChartInstance.destroy();
        cteModalidadeQtdChartInstance = null;
    }
    const modalidadeContainer = document.getElementById(MODALIDADE_CHART_CONTAINER_ID);
    if (modalidadeContainer) modalidadeContainer.innerHTML = '<p class="text-muted small text-center mt-5 p-3">Carregando gráfico...</p>';


    if (cteTopRemetentesChartInstance) {
        cteTopRemetentesChartInstance.destroy();
        cteTopRemetentesChartInstance = null;
    }
    const remetentesContainer = document.getElementById(REMETENTES_CHART_CONTAINER_ID);
    if (remetentesContainer) remetentesContainer.innerHTML = '<p class="text-muted small text-center mt-5 p-3">Carregando gráfico...</p>';
}

// ... (o restante das funções: hideLoadingStateFromUI, updateSummaryCards, renderCTeTable, showCTeDetails, renderCTeDetailsHTML, updatePagination, exportCteTableToCSV permanecem como antes)
function hideLoadingStateFromUI() {
    document.querySelectorAll('#filterForm button, #btnAtualizarListaCTe').forEach(button => button.disabled = false);
    document.querySelectorAll('.card-body .h4 .spinner-border').forEach(spinner => spinner.style.display = 'none');
}

function updateSummaryCards(summary) {
    document.getElementById('total-cte').innerHTML = formatNumber(summary.total_ctes || 0);
    document.getElementById('valor-total').innerHTML = formatCurrency(summary.valor_total_fretes || 0);
    document.getElementById('total-cif-qtd').innerHTML = formatNumber(summary.total_cif_qtd || 0);
    document.getElementById('total-fob-qtd').innerHTML = formatNumber(summary.total_fob_qtd || 0);
}

function renderCTeTable() {
    const tbody = document.getElementById('cte-list');
    if (!tbody) { console.error("Elemento tbody com ID 'cte-list' não encontrado."); return; }
    if (!cteList || cteList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4">Nenhum CT-e encontrado para os filtros selecionados.</td></tr>`;
        return;
    }
    tbody.innerHTML = cteList.map(cte => {
        const dataEmissao = cte.data_emissao || '--';
        const statusHTML = getStatusHTMLBadge(cte.status);
        return `
        <tr>
            <td>${cte.numero_cte || '--'}</td>
            <td title="${cte.chave}">${truncateText(cte.chave, 15)}</td>
            <td>${dataEmissao}</td>
            <td>${truncateText(cte.remetente_nome, 20) || '--'}</td>
            <td>${truncateText(cte.destinatario_nome, 20) || '--'}</td>
            <td class="text-end">${formatCurrency(cte.valor_total)}</td>
            <td>${cte.modalidade || '--'}</td>
            <td class="text-center">${statusHTML}</td>
            <td class="text-center">
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary btn-cte-detail" data-id="${cte.id}" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                    <a href="/api/ctes/${cte.id}/xml/" class="btn btn-outline-info" title="Download XML" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-code"></i></a>
                </div>
            </td>
        </tr>`;
    }).join('');
    document.querySelectorAll('.btn-cte-detail').forEach(button => {
        button.addEventListener('click', function() { showCTeDetails(this.getAttribute('data-id')); });
    });
}

function showCTeDetails(cteId) {
    currentCTeId = cteId;
    const modal = document.getElementById('cteDetailModal');
    const modalTitle = document.getElementById('cteDetailModalLabel');
    const modalBody = document.getElementById('cteDetailContent');
    if (!modal || !modalTitle || !modalBody) return;
    modalBody.innerHTML = '<div class="d-flex justify-content-center p-5"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div><p class="ms-2">Carregando detalhes...</p></div>';
    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
    Auth.fetchWithAuth(`/api/ctes/${cteId}/`)
        .then(response => {
            if (!response.ok) { return response.json().then(err => { throw (err.detail || err.error || err); }); }
            return response.json();
        })
        .then(cteData => {
            modalTitle.textContent = `CT-e ${cteData.identificacao?.numero || cteData.chave.substring(25,34)} - Detalhes`;
            modalBody.innerHTML = renderCTeDetailsHTML(cteData);
        })
        .catch(error => {
            modalBody.innerHTML = `<div class="alert alert-danger p-4">Erro ao carregar detalhes: ${typeof error === 'string' ? error : 'Tente novamente.'}</div>`;
        });
}

function renderCTeDetailsHTML(cte) {
    if (!cte || !cte.identificacao) return '<p class="text-danger p-4">Dados do CT-e incompletos ou inválidos.</p>';
    const { identificacao, emitente, remetente, destinatario, prestacao, carga, modal_rodoviario, protocolo, cancelamento, documentos_transportados, status_geral } = cte;
    const dataEmissaoDetalhe = identificacao.data_emissao_formatada || formatDateTime(identificacao.data_emissao);
    const dataProtocoloDetalhe = protocolo ? (protocolo.data_recebimento_formatada || formatDateTime(protocolo.data_recebimento)) : '--';
    const dataCancelamentoDetalhe = cancelamento ? (cancelamento.dh_evento_formatada || formatDateTime(cancelamento.dh_evento)) : '--';

    let html = `<div class="container-fluid">`;
    html += `<h6><i class="fas fa-info-circle text-primary me-2"></i>Identificação do CT-e</h6>
    <div class="row mb-3">
        <div class="col-md-4"><small class="text-muted d-block">Chave:</small><p class="fw-bold text-break">${cte.chave}</p></div>
        <div class="col-md-2"><small class="text-muted d-block">Número:</small><p class="fw-bold">${identificacao.numero || '--'}</p></div>
        <div class="col-md-2"><small class="text-muted d-block">Série:</small><p class="fw-bold">${identificacao.serie || '--'}</p></div>
        <div class="col-md-4"><small class="text-muted d-block">Data Emissão:</small><p class="fw-bold">${dataEmissaoDetalhe}</p></div>
        <div class="col-md-3"><small class="text-muted d-block">Modalidade:</small><p class="fw-bold">${cte.modalidade || '--'}</p></div>
        <div class="col-md-3"><small class="text-muted d-block">Tipo Serviço:</small><p class="fw-bold">${identificacao.tipo_servico || '--'}</p></div>
        <div class="col-md-3"><small class="text-muted d-block">Origem:</small><p class="fw-bold">${identificacao.nome_mun_ini || '--'}/${identificacao.uf_ini || '--'}</p></div>
        <div class="col-md-3"><small class="text-muted d-block">Destino:</small><p class="fw-bold">${identificacao.nome_mun_fim || '--'}/${identificacao.uf_fim || '--'}</p></div>
        <div class="col-md-3"><small class="text-muted d-block">Distância (KM):</small><p class="fw-bold">${identificacao.dist_km ? formatNumber(identificacao.dist_km) + ' km' : '0 km'}</p></div>
        <div class="col-md-3"><small class="text-muted d-block">Status:</small>${getStatusHTMLBadge(status_geral || cte.status)}</div>
    </div>`;
    if (emitente) {
        html += `<hr><h6><i class="fas fa-building text-primary me-2"></i>Emitente</h6><div class="row mb-3"><div class="col-md-6"><small class="text-muted d-block">Razão Social:</small><p class="fw-bold">${emitente.razao_social || '--'}</p></div><div class="col-md-3"><small class="text-muted d-block">CNPJ:</small><p class="fw-bold">${formatCNPJ(emitente.cnpj)}</p></div><div class="col-md-3"><small class="text-muted d-block">IE:</small><p class="fw-bold">${emitente.ie || '--'}</p></div><div class="col-md-12"><small class="text-muted d-block">Endereço:</small><p class="fw-bold">${emitente.logradouro || ''}, ${emitente.numero || ''} - ${emitente.bairro || ''} - ${emitente.nome_municipio || ''}/${emitente.uf || ''}</p></div></div>`;
    }
    if (remetente) {
        html += `<hr><h6><i class="fas fa-user-tag text-primary me-2"></i>Remetente</h6><div class="row mb-3"><div class="col-md-6"><small class="text-muted d-block">Razão Social/Nome:</small><p class="fw-bold">${remetente.razao_social || '--'}</p></div><div class="col-md-3"><small class="text-muted d-block">CNPJ/CPF:</small><p class="fw-bold">${formatDocument(remetente.cnpj || remetente.cpf)}</p></div><div class="col-md-3"><small class="text-muted d-block">IE:</small><p class="fw-bold">${remetente.ie || '--'}</p></div><div class="col-md-12"><small class="text-muted d-block">Endereço:</small><p class="fw-bold">${remetente.logradouro || ''}, ${remetente.numero || ''} - ${remetente.bairro || ''} - ${remetente.nome_municipio || ''}/${remetente.uf || ''}</p></div></div>`;
    }
     if (destinatario) {
        html += `<hr><h6><i class="fas fa-user-check text-primary me-2"></i>Destinatário</h6><div class="row mb-3"><div class="col-md-6"><small class="text-muted d-block">Razão Social/Nome:</small><p class="fw-bold">${destinatario.razao_social || '--'}</p></div><div class="col-md-3"><small class="text-muted d-block">CNPJ/CPF:</small><p class="fw-bold">${formatDocument(destinatario.cnpj || destinatario.cpf)}</p></div><div class="col-md-3"><small class="text-muted d-block">IE:</small><p class="fw-bold">${destinatario.ie || '--'}</p></div><div class="col-md-12"><small class="text-muted d-block">Endereço:</small><p class="fw-bold">${destinatario.logradouro || ''}, ${destinatario.numero || ''} - ${destinatario.bairro || ''} - ${destinatario.nome_municipio || ''}/${destinatario.uf || ''}</p></div></div>`;
    }
    if (prestacao) {
        html += `<hr><h6><i class="fas fa-dollar-sign text-primary me-2"></i>Valores da Prestação</h6><div class="row mb-2"><div class="col-md-6"><small class="text-muted d-block">Valor Total:</small><p class="fw-bold h5">${formatCurrency(prestacao.valor_total_prestado)}</p></div><div class="col-md-6"><small class="text-muted d-block">Valor a Receber:</small><p class="fw-bold h5">${formatCurrency(prestacao.valor_recebido)}</p></div></div>`;
        if (prestacao.componentes && prestacao.componentes.length > 0) {
            html += `<small class="text-muted">Componentes do Frete:</small><ul class="list-unstyled small">`;
            prestacao.componentes.forEach(comp => { html += `<li>${comp.nome}: ${formatCurrency(comp.valor)}</li>`; });
            html += `</ul>`;
        }
    }
    if (carga) {
        html += `<hr><h6><i class="fas fa-box-open text-primary me-2"></i>Informações da Carga</h6><div class="row mb-2"><div class="col-md-6"><small class="text-muted d-block">Valor da Carga:</small><p class="fw-bold">${formatCurrency(carga.valor_carga)}</p></div><div class="col-md-6"><small class="text-muted d-block">Produto Predominante:</small><p class="fw-bold">${carga.produto_predominante || '--'}</p></div></div>`;
        if (carga.quantidades && carga.quantidades.length > 0) {
            html += `<small class="text-muted">Quantidades Declaradas:</small><ul class="list-unstyled small">`;
            carga.quantidades.forEach(q => { html += `<li>${q.tipo_medida}: ${formatNumber(parseFloat(q.quantidade), 4)} (${q.codigo_unidade})</li>`; });
            html += `</ul>`;
        }
    }
    if (documentos_transportados && documentos_transportados.length > 0) {
        html += `<hr><h6 class="mt-3"><i class="fas fa-file-alt text-primary me-2"></i>Documentos Transportados (${documentos_transportados.length})</h6><div class="table-responsive" style="max-height: 150px; overflow-y: auto;"><table class="table table-sm table-bordered small"><thead><tr><th>Tipo</th><th>Chave/Número</th><th>Valor</th></tr></thead><tbody>`;
        documentos_transportados.forEach(doc => { html += `<tr><td>${doc.tipo_documento || '--'}</td><td>${truncateText(doc.chave_nfe || doc.numero_nf || doc.numero_outros, 30) || '--'}</td><td class="text-end">${formatCurrency(doc.valor_total_nf || doc.valor_doc_outros)}</td></tr>`; });
        html += `</tbody></table></div>`;
    }
    if (modal_rodoviario && modal_rodoviario.veiculos && modal_rodoviario.veiculos.length > 0) {
        html += `<hr><h6 class="mt-3"><i class="fas fa-truck text-primary me-2"></i>Veículos</h6><ul class="list-unstyled small">`;
        modal_rodoviario.veiculos.forEach(v => { html += `<li>Placa: ${v.placa} (RNTRC: ${v.prop_rntrc || 'N/A'})</li>`; });
        html += `</ul>`;
    }
    if (modal_rodoviario && modal_rodoviario.motoristas && modal_rodoviario.motoristas.length > 0) {
        html += `<h6 class="mt-2"><i class="fas fa-id-card text-primary me-2"></i>Motoristas</h6><ul class="list-unstyled small">`;
        modal_rodoviario.motoristas.forEach(m => { html += `<li>${m.nome} (CPF: ${formatCPF(m.cpf)})</li>`; });
        html += `</ul>`;
    }
    if (protocolo) {
        html += `<hr><h6 class="mt-3"><i class="fas fa-stamp text-primary me-2"></i>Protocolo de Autorização</h6><div class="alert alert-${protocolo.codigo_status === 100 ? 'success' : 'warning'} small p-2"><p class="mb-1"><strong>Status:</strong> ${protocolo.codigo_status} - ${protocolo.motivo_status || '--'}</p><p class="mb-1"><strong>Protocolo:</strong> ${protocolo.numero_protocolo || '--'}</p><p class="mb-0"><strong>Data Recebimento:</strong> ${dataProtocoloDetalhe}</p></div>`;
    }
    if (cancelamento) {
        html += `<hr><h6 class="mt-3"><i class="fas fa-ban text-danger me-2"></i>Cancelamento</h6><div class="alert alert-danger small p-2"><p class="mb-1"><strong>Status:</strong> ${cancelamento.c_stat} - ${cancelamento.x_motivo || '--'}</p><p class="mb-1"><strong>Protocolo Canc.:</strong> ${cancelamento.n_prot_retorno || '--'}</p><p class="mb-1"><strong>Data Evento:</strong> ${dataCancelamentoDetalhe}</p><p class="mb-0"><strong>Justificativa:</strong> ${cancelamento.x_just || '--'}</p></div>`;
    }
    html += `</div>`;
    return html;
}

function updatePagination() {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) { paginationElement.innerHTML = ''; return; }
    let html = '';
    const maxPagesToShow = 5;
    let startPage, endPage;
    if (totalPages <= maxPagesToShow) { startPage = 1; endPage = totalPages; }
    else {
        const maxPagesBeforeCurrentPage = Math.floor(maxPagesToShow / 2);
        const maxPagesAfterCurrentPage = Math.ceil(maxPagesToShow / 2) - 1;
        if (currentPage <= maxPagesBeforeCurrentPage) { startPage = 1; endPage = maxPagesToShow; }
        else if (currentPage + maxPagesAfterCurrentPage >= totalPages) { startPage = totalPages - maxPagesToShow + 1; endPage = totalPages; }
        else { startPage = currentPage - maxPagesBeforeCurrentPage; endPage = currentPage + maxPagesAfterCurrentPage; }
    }
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Anterior">&laquo;</a></li>`;
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
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Próximo">&raquo;</a></li>`;
    paginationElement.innerHTML = html;
    paginationElement.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = parseInt(this.getAttribute('data-page'));
            if (this.closest('.page-item').classList.contains('disabled') || !page) return;
            if (page !== currentPage && page >= 1 && page <= totalPages) {
                currentPage = page;
                loadCTeList();
                document.querySelector('.card-header')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function exportCteTableToCSV() {
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;
    const modalidade = document.getElementById('modalidade')?.value;
    const statusFiltro = document.getElementById('status_filtro')?.value;
    const queryText = document.getElementById('search_text_cte')?.value;
    let apiUrl = `/api/ctes/export/?format=csv`;
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (modalidade) apiUrl += `&modalidade=${modalidade}`;
    if (queryText) apiUrl += `&q=${encodeURIComponent(queryText)}`;
    if (statusFiltro) {
        if (statusFiltro) apiUrl += `&status=${statusFiltro}`;
    }
    window.open(apiUrl, '_blank');
}

// --- Funções de Gráfico ---
function renderCteModalidadeQtdChart(qtdCif, qtdFob, totalCTesDaPagina) {
    const ctx = getOrCreateCanvasContext(MODALIDADE_CHART_CONTAINER_ID, MODALIDADE_CANVAS_ID, "Gráfico Modalidade");
    if (!ctx) {
        console.log("Contexto do gráfico de modalidade não obtido, gráfico não será renderizado.");
         const container = document.getElementById(MODALIDADE_CHART_CONTAINER_ID);
        if (container) container.innerHTML = '<p class="text-center text-muted small mt-5 p-3">Erro ao preparar área do gráfico de modalidade.</p>';
        return;
    }

    if (cteModalidadeQtdChartInstance) {
        cteModalidadeQtdChartInstance.destroy();
        cteModalidadeQtdChartInstance = null;
    }

    const naoIdentificado = Math.max(0, totalCTesDaPagina - (qtdCif + qtdFob));

    if (totalCTesDaPagina === 0 && qtdCif === 0 && qtdFob === 0) { // Condição ajustada
        const container = document.getElementById(MODALIDADE_CHART_CONTAINER_ID);
        if (container) container.innerHTML = '<p class="text-center text-muted small mt-5 p-3">Nenhum CT-e na página atual para exibir gráfico de modalidade.</p>';
        return;
    }
    
    console.log(`[GRAPH MODALIDADE] Dados: CIF=${qtdCif}, FOB=${qtdFob}, Outros=${naoIdentificado}, TotalPagina=${totalCTesDaPagina}`);
    cteModalidadeQtdChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['CIF', 'FOB', 'Outros/N.I.'],
            datasets: [{
                label: 'Quantidade de CT-es',
                data: [qtdCif, qtdFob, naoIdentificado],
                backgroundColor: ['rgba(75, 192, 192, 0.7)', 'rgba(255, 159, 64, 0.7)', 'rgba(201, 203, 207, 0.7)'],
                borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 159, 64, 1)', 'rgba(201, 203, 207, 1)'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }, title: { display: false },
                tooltip: { callbacks: { label: function(context) {
                    let label = context.label || '';
                    if (label) label += ': ';
                    if (context.parsed !== null) label += formatNumber(context.parsed) + ' CT-e(s)';
                    return label;
                }}}
            }
        }
    });
}

function renderTopRemetentesChart(ctesDaPagina) {
    const ctx = getOrCreateCanvasContext(REMETENTES_CHART_CONTAINER_ID, REMETENTES_CANVAS_ID, "Gráfico Remetentes");
    if (!ctx) {
        console.log("Contexto do gráfico de remetentes não obtido, gráfico não será renderizado.");
        const container = document.getElementById(REMETENTES_CHART_CONTAINER_ID);
        if (container) container.innerHTML = '<p class="text-center text-muted small mt-5 p-3">Erro ao preparar área do gráfico de remetentes.</p>';
        return;
    }

    if (cteTopRemetentesChartInstance) {
        cteTopRemetentesChartInstance.destroy();
        cteTopRemetentesChartInstance = null;
    }
    
    if (!ctesDaPagina || ctesDaPagina.length === 0) {
        const container = document.getElementById(REMETENTES_CHART_CONTAINER_ID);
        if (container) container.innerHTML = '<p class="text-center text-muted small mt-5 p-3">Nenhum dado de remetente na página atual para exibir gráfico.</p>';
        return;
    }

    const remetentesData = {};
    ctesDaPagina.forEach(cte => {
        const nome = cte.remetente_nome || "Desconhecido";
        const valor = parseFloat(cte.valor_total || 0);
        if (!isNaN(valor)) {
            remetentesData[nome] = (remetentesData[nome] || 0) + valor;
        }
    });

    const sortedRemetentes = Object.entries(remetentesData)
        .filter(([, valor]) => valor > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const labels = sortedRemetentes.map(item => truncateText(item[0], 18));
    const dataValues = sortedRemetentes.map(item => item[1]);

    if (labels.length === 0) {
        const container = document.getElementById(REMETENTES_CHART_CONTAINER_ID);
        if (container) container.innerHTML = '<p class="text-center text-muted small mt-5 p-3">Nenhum dado de remetente com valor para exibir.</p>';
        return;
    }
    console.log("[GRAPH REMETENTES] Labels:", labels, "DataValues:", dataValues);

    cteTopRemetentesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Total (R$)',
                data: dataValues,
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, title: { display: false },
                tooltip: { callbacks: { label: function(context) { return formatCurrency(context.raw); } } }
            },
            scales: { x: { beginAtZero: true, ticks: { callback: function(value) { return formatCurrency(value); } } } }
        }
    });
}

// Funções utilitárias (assumindo que estão em scripts.js ou definidas globalmente)
if (typeof formatCurrency !== 'function') { window.formatCurrency = (value, includeSymbol = true) => { const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 }; if (includeSymbol) { options.style = 'currency'; options.currency = 'BRL'; } else { options.style = 'decimal'; } return Number(value || 0).toLocaleString('pt-BR', options); }}
if (typeof formatNumber !== 'function') { window.formatNumber = (value, decimals = 0) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
if (typeof formatDateTime !== 'function') { window.formatDateTime = dateStr => { if (!dateStr) return '--'; try { if (/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(dateStr)) return dateStr; const date = new Date(dateStr); if (isNaN(date.getTime())) return dateStr; return date.toLocaleString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return dateStr; }};}
if (typeof truncateText !== 'function') { window.truncateText = (text, maxLength) => (text && text.length > maxLength) ? text.substring(0, maxLength) + '...' : (text || '--'); }
if (typeof formatCNPJ !== 'function') { window.formatCNPJ = cnpj => { if (!cnpj) return '--'; const cleanCnpj = String(cnpj).replace(/\D/g, ''); if (cleanCnpj.length !== 14) return cnpj; return cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); };}
if (typeof formatCPF !== 'function') { window.formatCPF = cpf => { if (!cpf) return '--'; const cleanCpf = String(cpf).replace(/\D/g, ''); if (cleanCpf.length !== 11) return cpf; return cleanCpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"); };}
if (typeof formatDocument !== 'function') { window.formatDocument = doc => { if (!doc) return '--'; const cleanDoc = String(doc).replace(/\D/g, ''); if (cleanDoc.length === 11) return formatCPF(cleanDoc); if (cleanDoc.length === 14) return formatCNPJ(cleanDoc); return doc; };}
if (typeof getStatusHTMLBadge !== 'function') { window.getStatusHTMLBadge = function(statusText) { if (!statusText) return '<span class="badge bg-secondary">Desconhecido</span>'; const lowerStatus = statusText.toLowerCase(); if (lowerStatus.includes("cancelado")) return `<span class="badge bg-danger text-white">${statusText}</span>`; if (lowerStatus.includes("autorizado")) return `<span class="badge bg-success text-white">${statusText}</span>`; if (lowerStatus.includes("rejeitado")) return `<span class="badge bg-warning text-dark">${statusText}</span>`; if (lowerStatus.includes("processado")) return `<span class="badge bg-info text-dark">${statusText}</span>`; if (lowerStatus.includes("pendente")) return `<span class="badge bg-secondary text-white">${statusText}</span>`; return `<span class="badge bg-light text-dark">${statusText}</span>`; }}
if (typeof showNotification !== 'function') { window.showNotification = (message, type = 'info') => { const tc = document.querySelector('.toast-container'); if (tc && typeof bootstrap !=='undefined' && bootstrap.Toast) { const id='t'+Date.now();const t={s:'bg-success text-white',e:'bg-danger text-white',w:'bg-warning text-dark',i:'bg-info text-dark'}[type[0]]||'bg-secondary text-white';const h=`<div id="${id}" class="toast align-items-center ${t}" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="5000"><div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close me-2 m-auto ${type[0]==='s'||type[0]==='e'?'btn-close-white':''}" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`;tc.insertAdjacentHTML('beforeend',h);const te=document.getElementById(id);const tst=new bootstrap.Toast(te);te.addEventListener('hidden.bs.toast',()=>te.remove());tst.show();} else {console.log(`[${type.toUpperCase()}] ${message}`);}}; }