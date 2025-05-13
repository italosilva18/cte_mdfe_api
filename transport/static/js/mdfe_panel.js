/**
 * mdfe_panel.js
 * Funções para a página do painel MDF-e.
 * Versão ÚNICA e CORRIGIDA: IDs e chaves de API alinhados.
 */

// Variáveis globais para paginação da tabela principal
let currentMdfePage = 1;
const MDFe_PAGE_SIZE = 10;
let totalMdfeItems = 0;

// Variável global para a instância do gráfico
let graficoDistribuicaoDocsInstance = null;

// Armazena o ID e status do MDF-e atualmente no modal de detalhes
let currentSelectedMDFeId = null;
let currentSelectedMDFeStatus = null;
let currentSelectedMDFeIsEncerrado = false;
let currentSelectedMDFeIsProcessado = false;

document.addEventListener('DOMContentLoaded', function() {
    setDefaultDateRangeMdfe();
    setupMdfeEventListeners();
    loadAllMdfePanelData();
});

function setDefaultDateRangeMdfe() {
    const dataFimInput = document.getElementById('data_fim_mdfe');
    const dataInicioInput = document.getElementById('data_inicio_mdfe');

    if (dataFimInput && dataInicioInput) {
        const hoje = new Date();
        dataFimInput.value = hoje.toISOString().split('T')[0];
        const dataInicioTemp = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataInicioInput.value = dataInicioTemp.toISOString().split('T')[0];
    }
}

function setupMdfeEventListeners() {
    document.getElementById('btnAplicarFiltrosMdfe')?.addEventListener('click', () => {
        currentMdfePage = 1;
        loadAllMdfePanelData();
    });

    document.getElementById('btnLimparFiltrosMdfe')?.addEventListener('click', () => {
        document.getElementById('mdfeFilterForm').reset();
        setDefaultDateRangeMdfe();
        currentMdfePage = 1;
        loadAllMdfePanelData();
    });

    document.getElementById('btnAtualizarPainelMdfe')?.addEventListener('click', () => {
        loadAllMdfePanelData(false);
    });

    document.getElementById('btnExportarCsvMdfe')?.addEventListener('click', exportMDFeToCSV);

    const detailModalEl = document.getElementById('mdfeDetailModal');
    if (detailModalEl) {
        detailModalEl.addEventListener('click', function(event) {
            const targetButton = event.target.closest('button');
            if (!targetButton || !currentSelectedMDFeId) return;

            switch (targetButton.id) {
                case 'btnPrintMDFe':
                    window.open(`/api/mdfes/${currentSelectedMDFeId}/damdfe/`, '_blank');
                    break;
                case 'btnDownloadXMLMDFe':
                    window.open(`/api/mdfes/${currentSelectedMDFeId}/xml/`, '_blank');
                    break;
                case 'btnReprocessMDFe':
                    reprocessMDFe(currentSelectedMDFeId);
                    break;
                case 'btnVerDocumentosVinculadosMdfe':
                    showDocumentosVinculadosMdfe(currentSelectedMDFeId);
                    break;
                case 'btnEncerrarMDFe':
                    encerrarMDFe(currentSelectedMDFeId);
                    break;
                case 'btnCancelarMDFe':
                    cancelarMDFe(currentSelectedMDFeId);
                    break;
            }
        });
        detailModalEl.addEventListener('hidden.bs.modal', () => {
            currentSelectedMDFeId = null;
            currentSelectedMDFeStatus = null;
            currentSelectedMDFeIsEncerrado = false;
            currentSelectedMDFeIsProcessado = false;
            document.getElementById('mdfeDetailContent').innerHTML = getSpinnerHtml('success', 'Carregando...');
            document.getElementById('mdfeDetailModalLabel').textContent = 'Detalhes do MDF-e';
        });
    }

    const docsModalEl = document.getElementById('docsVinculadosMdfeModal');
    if (docsModalEl) {
        docsModalEl.addEventListener('hidden.bs.modal', () => {
            document.getElementById('docsVinculadosMdfeModalBody').innerHTML = getSpinnerHtml('info', 'Carregando...');
            document.getElementById('docsVinculadosMdfeModalLabel').textContent = 'Documentos Vinculados ao MDF-e';
        });
    }
}

function getMdfeAppliedFilters(forPanelApi = false) {
    const form = document.getElementById('mdfeFilterForm');
    const params = new URLSearchParams();

    if (form.data_inicio.value) params.append('data_inicio', form.data_inicio.value);
    if (form.data_fim.value) params.append('data_fim', form.data_fim.value);

    if (!forPanelApi) {
        if (form.placa.value) params.append('placa', form.placa.value);
        if (form.uf_ini.value) params.append('uf_ini', form.uf_ini.value);
        if (form.uf_fim.value) params.append('uf_fim', form.uf_fim.value);
        if (form.q.value) params.append('q', form.q.value);

        const statusFiltro = form.status.value;
        if (statusFiltro) {
            if (['autorizado', 'cancelado', 'encerrado'].includes(statusFiltro)) {
                 params.append(statusFiltro, 'true');
            } else if (statusFiltro === 'pendente_processamento') {
                params.append('processado', 'false');
            } else if (statusFiltro === 'pendente_autorizacao') {
                params.append('processado', 'true');
                params.append('autorizado', 'false');
                params.append('cancelado', 'false');
            } else if (statusFiltro === 'rejeitado') {
                 params.append('processado', 'true');
                 params.append('autorizado', 'false');
                 params.append('protocolo__isnull', 'false');
                 params.append('cancelado', 'false');
                 params.append('encerrado', 'false');
            }
        }
    }
    return params.toString();
}

function loadAllMdfePanelData(resetTablePage = true) {
    if(resetTablePage) currentMdfePage = 1;
    loadMdfePanelSummaryData();
    loadMDFeListTable();
}

function loadMdfePanelSummaryData() {
    showLoadingStateMdfePanel(true);
    const filters = getMdfeAppliedFilters(true);
    const url = `/api/painel/mdfe/?${filters}`;

    Auth.fetchWithAuth(url)
        .then(response => response.json())
        .then(data => {
            updateMdfeSummaryCards(data.cards, data.eficiencia);
            renderGraficoDistribuicaoDocs(data.grafico_cte_mdfe || []);
            renderTabelaTopVeiculosMdfe(data.tabela_mdfe_veiculo ? data.tabela_mdfe_veiculo.slice(0, 5) : []);
        })
        .catch(error => {
            console.error('Erro ao carregar resumo do painel MDF-e:', error);
            showNotification('Erro ao carregar resumo do painel MDF-e.', 'error');
            updateMdfeSummaryCards({}, 0);
            renderGraficoDistribuicaoDocs([]);
            renderTabelaTopVeiculosMdfe([]);
        })
        .finally(() => showLoadingStateMdfePanel(false));
}

function loadMDFeListTable() {
    showLoadingStateMdfeTable(true);
    const filters = getMdfeAppliedFilters(false);
    const url = `/api/mdfes/?page=${currentMdfePage}&page_size=${MDFe_PAGE_SIZE}&${filters}`;

    Auth.fetchWithAuth(url)
        .then(response => response.json())
        .then(data => {
            totalMdfeItems = data.count;
            renderMDFeTable(data.results);
            renderMdfePagination();
            document.getElementById('total-items-mdfe-table').textContent = totalMdfeItems;
        })
        .catch(error => {
            console.error('Erro ao carregar lista de MDF-e:', error);
            showNotification('Erro ao carregar lista de MDF-es.', 'error');
            document.getElementById('mdfe-list-table-body').innerHTML = `<tr><td colspan="8" class="text-center text-danger p-5">Erro ao carregar dados. Tente novamente.</td></tr>`;
            document.getElementById('total-items-mdfe-table').textContent = '0';
            renderMdfePagination();
        })
        .finally(() => showLoadingStateMdfeTable(false));
}

function showLoadingStateMdfePanel(isLoading) {
    const cardIds = [
        'card-total-mdfes', 'card-total-autorizados-ativos', 'card-total-encerrados',
        'card-total-cancelados', 'card-total-ctes-em-mdfes'
    ];
    const spinnerHtml = `<span class="spinner-border spinner-border-sm text-muted"></span>`;

    cardIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = isLoading ? spinnerHtml : '0';
    });
    const eficienciaEl = document.getElementById('card-mdfe-eficiencia');
    if (eficienciaEl) eficienciaEl.innerHTML = isLoading ? `Eficiência CT-e: ${spinnerHtml}` : 'Eficiência CT-e: 0%';

    document.getElementById('graficoDistribuicaoDocsLoading').style.display = isLoading ? 'flex' : 'none';
    if (!isLoading) {
      document.getElementById('graficoDistribuicaoDocsNoData').style.display = 'none';
    }

    const tabelaVeiculoBody = document.getElementById('tabelaTopVeiculosMdfe');
    if (tabelaVeiculoBody) {
        if (isLoading) {
            tabelaVeiculoBody.innerHTML = `<tr><td colspan="4" class="text-center p-3">${getSpinnerHtml('primary', '')}</td></tr>`;
        }
    }
}

function showLoadingStateMdfeTable(isLoading) {
    const tableBody = document.getElementById('mdfe-list-table-body');
    if (isLoading) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center p-5">${getSpinnerHtml('primary', 'Carregando MDF-es...')}</td></tr>`;
    }
    document.getElementById('btnAplicarFiltrosMdfe').disabled = isLoading;
    document.getElementById('btnLimparFiltrosMdfe').disabled = isLoading;
    document.getElementById('btnAtualizarPainelMdfe').disabled = isLoading;
}

function getSpinnerHtml(color = 'primary', text = '') {
    return `<div class="d-flex justify-content-center align-items-center p-3">
                <div class="spinner-border text-${color} spinner-border-sm" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                ${text ? `<span class="ms-2 text-muted small">${text}</span>` : ''}
            </div>`;
}

function updateMdfeSummaryCards(apiCardsData, eficiencia) {
    const cardsData = apiCardsData || {};

    setTextContent('card-total-mdfes', formatNumber(cardsData.total_mdfes || 0));

    const autorizados = cardsData.total_autorizados || 0;
    const encerrados = cardsData.total_encerrados || 0;
    const cancelados = cardsData.total_cancelados || 0;

    // Se sua API `total_autorizados` já significa "autorizados e não cancelados e não encerrados",
    // então autorizadosAtivos = autorizados.
    // Se `total_autorizados` é o total bruto de autorizações, então o cálculo abaixo é mais preciso.
    // A API de exemplo que você forneceu tem `total_autorizados` como o total bruto de autorizados.
    const autorizadosAtivos = autorizados - encerrados - cancelados;
    setTextContent('card-total-autorizados-ativos', formatNumber(Math.max(0, autorizadosAtivos)));

    setTextContent('card-total-encerrados', formatNumber(encerrados));
    setTextContent('card-total-cancelados', formatNumber(cancelados));

    // Usando `total_ctes_em_mdfes` da API para o card de documentos.
    setTextContent('card-total-ctes-em-mdfes', formatNumber(cardsData.total_ctes_em_mdfes || 0));

    const eficienciaNum = parseFloat(eficiencia || 0);
    setTextContent('card-mdfe-eficiencia', `Eficiência CT-e: ${eficienciaNum.toFixed(2)}%`);
}

function setTextContent(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    } else {
        console.warn(`Elemento com ID '${elementId}' não encontrado no DOM para setar o texto.`);
    }
}

function renderGraficoDistribuicaoDocs(apiData) {
    const canvas = document.getElementById('graficoDistribuicaoDocsCanvas');
    const container = document.getElementById('graficoDistribuicaoDocsContainer');
    const noDataEl = document.getElementById('graficoDistribuicaoDocsNoData');
    const loadingEl = document.getElementById('graficoDistribuicaoDocsLoading');

    if (loadingEl) loadingEl.style.display = 'none';

    if (!canvas || !container || !noDataEl) {
        console.error('Elementos do gráfico de distribuição não encontrados.');
        return;
    }

    if (graficoDistribuicaoDocsInstance) {
        graficoDistribuicaoDocsInstance.destroy();
        graficoDistribuicaoDocsInstance = null;
    }

    const hasMeaningfulData = apiData && apiData.length > 0 && apiData.some(item => item.contagem > 0);

    if (!hasMeaningfulData) {
        canvas.style.display = 'none';
        noDataEl.style.display = 'block';
        return;
    }

    canvas.style.display = 'block';
    noDataEl.style.display = 'none';

    const ctx = canvas.getContext('2d');
    graficoDistribuicaoDocsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: apiData.map(item => item.categoria),
            datasets: [{
                label: 'Qtd. MDF-es',
                data: apiData.map(item => item.contagem),
                backgroundColor: 'rgba(27, 77, 62, 0.7)',
                borderColor: 'rgba(27, 77, 62, 1)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { grid: { display: false } }
            },
            plugins: { legend: { display: false }, title: { display: false } }
        }
    });
}

function renderTabelaTopVeiculosMdfe(data) {
    const tbody = document.getElementById('tabelaTopVeiculosMdfe');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-3 text-muted">Sem dados de veículos para o período.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(item => `
        <tr>
            <td><span class="badge bg-secondary text-white">${item.placa}</span></td>
            <td class="text-end">${formatNumber(item.total_mdfes)}</td>
            <td class="text-end">${formatNumber(item.total_documentos)}</td>
            <td class="text-end">${parseFloat(item.media_docs || 0).toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderMDFeTable(mdfes) {
    const tbody = document.getElementById('mdfe-list-table-body');
    if(!tbody) return;

    if (!mdfes || mdfes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-5 text-muted">Nenhum MDF-e encontrado com os filtros aplicados.</td></tr>`;
        return;
    }

    tbody.innerHTML = mdfes.map(mdfe => `
        <tr>
            <td>${mdfe.numero_mdfe || '--'}</td>
            <td class="text-truncate" style="max-width: 150px;" title="${mdfe.chave || ''}">${mdfe.chave ? mdfe.chave.substring(0,6) + '...' + mdfe.chave.substring(mdfe.chave.length - 4) : '--'}</td>
            <td>${mdfe.data_emissao || '--'}</td>
            <td>${mdfe.uf_inicio || '--'} / ${mdfe.uf_fim || '--'}</td>
            <td><span class="badge bg-light text-dark border">${mdfe.placa_tracao || '--'}</span></td>
            <td class="text-center">${mdfe.documentos_count || 0}</td>
            <td>${getMdfeStatusBadge(mdfe.status, mdfe.encerrado)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-primary"
                            onclick="showMDFeDetailsModal('${mdfe.id}', '${mdfe.status}', ${mdfe.encerrado}, ${mdfe.processado})"
                            title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="/api/mdfes/${mdfe.id}/xml/" class="btn btn-outline-success" title="Download XML" target="_blank">
                        <i class="fas fa-file-code"></i>
                    </a>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderMdfePagination() {
    const paginationElement = document.getElementById('pagination-mdfe');
    const paginationInfo = document.getElementById('pagination-info-mdfe');
    if (!paginationElement || !paginationInfo) return;

    const totalPages = Math.ceil(totalMdfeItems / MDFe_PAGE_SIZE);
    paginationInfo.textContent = `Página ${currentMdfePage} de ${totalPages} (${totalMdfeItems} itens)`;

    if (totalPages <= 1) {
        paginationElement.innerHTML = '';
        return;
    }

    let paginationHTML = '';
    const MAX_PAGES_DISPLAYED = 5;

    paginationHTML += `<li class="page-item ${currentMdfePage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentMdfePage - 1}">&laquo;</a></li>`;

    let startPage = Math.max(1, currentMdfePage - Math.floor(MAX_PAGES_DISPLAYED / 2));
    let endPage = Math.min(totalPages, startPage + MAX_PAGES_DISPLAYED - 1);

    if (endPage - startPage + 1 < MAX_PAGES_DISPLAYED && totalPages >= MAX_PAGES_DISPLAYED) {
        startPage = Math.max(1, endPage - MAX_PAGES_DISPLAYED + 1);
    }


    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `<li class="page-item ${i === currentMdfePage ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    }

    paginationHTML += `<li class="page-item ${currentMdfePage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentMdfePage + 1}">&raquo;</a></li>`;
    paginationElement.innerHTML = paginationHTML;

    paginationElement.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (link.parentElement.classList.contains('disabled')) return;
            const page = parseInt(link.dataset.page);
            if (page && page !== currentMdfePage && page >= 1 && page <= totalPages) {
                currentMdfePage = page;
                loadMDFeListTable();
            }
        });
    });
}

function showMDFeDetailsModal(mdfeId, mdfeStatusFromList, isEncerradoFromList, isProcessadoFromList) {
    currentSelectedMDFeId = mdfeId;
    currentSelectedMDFeStatus = mdfeStatusFromList;
    currentSelectedMDFeIsEncerrado = isEncerradoFromList;
    currentSelectedMDFeIsProcessado = isProcessadoFromList;

    const modalInstance = new bootstrap.Modal(document.getElementById('mdfeDetailModal'));
    const contentDiv = document.getElementById('mdfeDetailContent');
    const modalLabel = document.getElementById('mdfeDetailModalLabel');

    modalLabel.textContent = `Detalhes MDF-e: Carregando...`;
    contentDiv.innerHTML = getSpinnerHtml('success', 'Carregando detalhes...');
    modalInstance.show();

    updateDetailModalButtons(currentSelectedMDFeStatus, currentSelectedMDFeIsEncerrado, currentSelectedMDFeIsProcessado);

    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/`)
        .then(response => response.json())
        .then(data => {
            modalLabel.textContent = `Detalhes MDF-e: ${data.identificacao?.n_mdf || data.numero_mdfe || truncateText(data.chave, 20, true)}`;

            const detailedStatus = data.status_geral || (data.protocolo ? (data.protocolo.codigo_status === 100 ? 'Autorizado' : `Rejeitado (${data.protocolo.codigo_status})`) : (data.processado ? 'Processado (s/ Prot.)' : 'Pendente'));
            updateDetailModalButtons(detailedStatus, data.encerrado, data.processado);

            let html = `<div class="container-fluid"><dl class="row gy-2">`;
            const renderDetailSection = (title, obj, parentKey = '') => {
                if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) return '';
                let sectionHtml = `<dt class="col-12 bg-light py-1 mt-2 mb-1 fw-semibold">${title}</dt>`;
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        if (key === 'id' && parentKey !== 'mdfe_root') continue;
                        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                             sectionHtml += renderDetailSection(formatMdfeKeyName(key), obj[key], key);
                        } else if (Array.isArray(obj[key])) {
                            sectionHtml += `<dt class="col-sm-4 text-muted small">${formatMdfeKeyName(key)}</dt>`;
                            sectionHtml += `<dd class="col-sm-8"><ul>`;
                            obj[key].forEach(item => {
                                if (typeof item === 'object' && item !== null) {
                                    sectionHtml += `<li><small class="text-muted">`;
                                    for(const subItemKey in item) {
                                        sectionHtml += `<strong>${formatMdfeKeyName(subItemKey)}:</strong> ${formatMdfeValue(subItemKey, item[subItemKey])}<br>`;
                                    }
                                    sectionHtml += `</small></li>`;
                                } else {
                                    sectionHtml += `<li>${formatMdfeValue(key, item)}</li>`;
                                }
                            });
                            sectionHtml += `</ul></dd>`;
                        } else {
                            sectionHtml += `<dt class="col-sm-4 text-muted small">${formatMdfeKeyName(key)}</dt>
                                            <dd class="col-sm-8">${formatMdfeValue(key, obj[key])}</dd>`;
                        }
                    }
                }
                return sectionHtml;
            };
            html += renderDetailSection('Informações Gerais do MDF-e', {
                chave: data.chave,
                numero_mdfe: data.numero_mdfe || data.identificacao?.n_mdf,
                serie_mdfe: data.serie_mdfe || data.identificacao?.serie,
                data_emissao: data.data_emissao || data.identificacao?.dh_emi,
                status_geral: detailedStatus,
                encerrado: data.encerrado,
                processado: data.processado,
                data_upload: data.data_upload,
                ...(data.encerramento_info && {
                    encerramento_status: data.encerramento_info.status,
                    encerramento_data: data.encerramento_info.data,
                    encerramento_protocolo: data.encerramento_info.protocolo
                }),
            }, 'mdfe_root');

            html += renderDetailSection('Identificação', data.identificacao);
            html += renderDetailSection('Emitente', data.emitente);
            if(data.modal_rodoviario) {
                const modalFieldsToShow = data.modal_rodoviario.ide_modal || data.modal_rodoviario;
                html += renderDetailSection('Modal Rodoviário', modalFieldsToShow);
                html += renderDetailSection('Veículo Tração', data.modal_rodoviario.veiculo_tracao);
                if (data.modal_rodoviario.veiculos_reboque && data.modal_rodoviario.veiculos_reboque.length > 0) {
                    data.modal_rodoviario.veiculos_reboque.forEach((reboque, index) => {
                        html += renderDetailSection(`Reboque ${index + 1}`, reboque);
                    });
                }
            }
             if(data.condutores && data.condutores.length > 0){
                 html += `<dt class="col-12 bg-light py-1 mt-2 mb-1 fw-semibold">Condutores</dt>`;
                 data.condutores.forEach(cond => {
                    html += `<dt class="col-sm-4 text-muted small">Nome</dt><dd class="col-sm-8">${cond.nome}</dd>`;
                    html += `<dt class="col-sm-4 text-muted small">CPF</dt><dd class="col-sm-8">${formatCPF(cond.cpf)}</dd>`;
                 });
            }
            html += renderDetailSection('Produto Predominante', data.prod_pred);
            html += renderDetailSection('Totais', data.totais);
            html += renderDetailSection('Informações Adicionais', data.adicional);
            html += renderDetailSection('Responsável Técnico', data.resp_tecnico);
            html += renderDetailSection('Protocolo SEFAZ', data.protocolo);
            html += renderDetailSection('Dados Suplementares (QR Code)', data.suplementar);
            html += renderDetailSection('Evento de Cancelamento', data.cancelamento);
            html += renderDetailSection('Evento de Cancelamento de Encerramento', data.cancelamento_encerramento);

            html += `</dl></div>`;
            contentDiv.innerHTML = html;
        })
        .catch(error => {
            console.error('Erro ao carregar detalhes do MDF-e:', error);
            contentDiv.innerHTML = `<div class="alert alert-danger m-3">Erro ao carregar detalhes. Tente novamente.</div>`;
            modalLabel.textContent = 'Erro ao Carregar Detalhes';
        });
}

function updateDetailModalButtons(status, isEncerrado, isProcessado) {
    const btnEncerrar = document.getElementById('btnEncerrarMDFe');
    const btnCancelar = document.getElementById('btnCancelarMDFe');
    const btnReprocessar = document.getElementById('btnReprocessMDFe');

    const isAutorizado = status === 'Autorizado' || (status && typeof status === 'string' && status.startsWith('Autorizado'));

    if (btnEncerrar) btnEncerrar.disabled = !(isAutorizado && !isEncerrado);
    if (btnCancelar) btnCancelar.disabled = !(isAutorizado && !isEncerrado);
    if (btnReprocessar) btnReprocessar.disabled = isProcessado && (isAutorizado || isEncerrado || status === 'Cancelado');
}

function showDocumentosVinculadosMdfe(mdfeId) {
    const modal = new bootstrap.Modal(document.getElementById('docsVinculadosMdfeModal'));
    const body = document.getElementById('docsVinculadosMdfeModalBody');
    const label = document.getElementById('docsVinculadosMdfeModalLabel');

    label.textContent = `Documentos Vinculados: Carregando...`;
    body.innerHTML = getSpinnerHtml('info', 'Carregando documentos...');
    modal.show();

    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/documentos/`)
        .then(response => response.json())
        .then(data => {
            label.textContent = `Documentos Vinculados ao MDF-e`;
            if (!data || data.length === 0) {
                body.innerHTML = `<div class="alert alert-light text-center p-3 m-0">Nenhum documento vinculado a este MDF-e.</div>`;
                return;
            }

            let html = '<div class="accordion" id="accordionDocsVinculadosMdfe">';

            const groupByMunicipio = data.reduce((acc, doc) => {
                const municipioNome = doc.municipio?.nome || 'Não Especificado';
                const municipioCodigo = doc.municipio?.codigo || 'N/A';
                const key = `${municipioCodigo} - ${municipioNome}`;

                if (!acc[key]) acc[key] = { municipio: doc.municipio, docs: [] };
                acc[key].docs.push(doc);
                return acc;
            }, {});

            let firstItem = true;
            Object.entries(groupByMunicipio).forEach(([municipioKey, municipioData], index) => {
                const collapseId = `collapseDocMdfe${index}`;
                html += `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingDocMdfe${index}">
                        <button class="accordion-button ${firstItem ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${firstItem}" aria-controls="${collapseId}">
                            Município Descarga: ${municipioKey} (${municipioData.docs.length} doc(s))
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse ${firstItem ? 'show' : ''}" aria-labelledby="headingDocMdfe${index}" data-bs-parent="#accordionDocsVinculadosMdfe">
                        <div class="accordion-body p-0">
                            <ul class="list-group list-group-flush">`;
                municipioData.docs.forEach(doc => {
                    const tipoDocDisplay = doc.tipo || 'N/A';
                    const chaveDocDisplay = truncateText(doc.chave_documento || doc.chave, 20, true);

                    html += `
                                <li class="list-group-item">
                                    <div class="d-flex justify-content-between align-items-start">
                                        <div>
                                            <strong>${tipoDocDisplay}</strong>
                                            <small class="text-muted ms-2">Chave: ${chaveDocDisplay}</small>
                                        </div>
                                        ${doc.cte_info && doc.cte_info.id ? `<a href="/api/ctes/${doc.cte_info.id}/xml/" target="_blank" class="btn btn-sm btn-outline-info"><i class="fas fa-file-code"></i> XML CT-e</a>` : ''}
                                    </div>
                                    ${doc.seg_cod_barras ? `<div><small class="text-muted">2º Cód. Barras: ${doc.seg_cod_barras}</small></div>` : ''}

                                    ${doc.cte_info ? `
                                        <div><small>Nº CT-e: ${doc.cte_info.numero_cte || 'N/A'} | Série: ${doc.cte_info.serie_cte || 'N/A'} | Valor: ${formatCurrency(doc.cte_info.valor_total || 0)}</small></div>
                                        <div><small>Rem: ${truncateText(doc.cte_info.remetente_nome, 20)} | Dest: ${truncateText(doc.cte_info.destinatario_nome, 20)}</small></div>
                                    ` : (tipoDocDisplay === 'NF-e' ? `<div><small class="text-muted">Detalhes da NF-e não disponíveis no momento.</small></div>` : '')}

                                     ${doc.produtos_perigosos && doc.produtos_perigosos.length > 0 ? `
                                        <div class="mt-1"><small class="fw-bold text-danger">Produtos Perigosos:</small>
                                            <ul class="list-unstyled ps-2 small mb-0">
                                            ${doc.produtos_perigosos.map(p => `<li>- ONU ${p.n_onu || 'N/A'}: ${truncateText(p.nome || p.x_nome_ae,30)} (${p.qtd_total || 'N/A'})</li>`).join('')}
                                            </ul>
                                        </div>
                                    ` : ''}
                                </li>`;
                });
                html += `       </ul>
                        </div>
                    </div>
                </div>`;
                firstItem = false;
            });
            html += '</div>';
            body.innerHTML = html;
        })
        .catch(error => {
            console.error('Erro ao carregar documentos vinculados:', error);
            body.innerHTML = `<div class="alert alert-danger m-3">Erro ao carregar documentos vinculados.</div>`;
            label.textContent = 'Erro ao Carregar Documentos';
        });
}

function reprocessMDFe(mdfeId) {
    if (!confirm('Tem certeza que deseja solicitar o reprocessamento deste MDF-e?')) return;

    showNotification('Solicitando reprocessamento do MDF-e...', 'info', 5000);
    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/reprocessar/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': Auth.getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => { throw new Error(err.detail || err.error || 'Falha na API.'); });
        return response.json();
    })
    .then(data => {
        showNotification(data.message || 'MDF-e enviado para reprocessamento com sucesso.', 'success');
        loadAllMdfePanelData();
        bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal'))?.hide();
    })
    .catch(error => {
        console.error('Erro ao reprocessar MDF-e:', error);
        showNotification(error.message || 'Falha ao reprocessar.', 'error');
    });
}

function encerrarMDFe(mdfeId) {
    const dtEnc = prompt("Data do Encerramento (AAAA-MM-DD):", new Date().toISOString().split('T')[0]);
    if (!dtEnc || !/^\d{4}-\d{2}-\d{2}$/.test(dtEnc)) {
        if(dtEnc !== null) alert("Formato de data inválido."); return;
    }
    const cMunEnc = prompt("Código IBGE do Município de Encerramento (7 dígitos):");
    if (!cMunEnc || !/^\d{7}$/.test(cMunEnc)) {
         if(cMunEnc !== null) alert("Código do município inválido."); return;
    }
    const ufEnc = prompt("UF de Encerramento (Sigla, ex: BA):")?.toUpperCase();
     if (!ufEnc || ufEnc.length !== 2) {
        if(ufEnc !== null) alert("UF inválida."); return;
    }

    if (!confirm(`Confirma o encerramento do MDF-e em ${dtEnc} no município ${cMunEnc}-${ufEnc}?`)) return;

    showNotification('Enviando evento de encerramento...', 'info', 5000);
    const payload = { dtEnc: dtEnc, cMun: cMunEnc, UF: ufEnc };

    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/encerrar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': Auth.getCookie('csrftoken') },
        body: JSON.stringify(payload)
    })
    .then(response => response.json().then(data => ({ok: response.ok, data})))
    .then(({ok, data}) => {
        if (!ok) throw new Error(data.message || data.error || data.detail || 'Falha na API de encerramento.');
        showNotification(data.message || 'Evento de encerramento enviado.', 'success');
        loadAllMdfePanelData();
        bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal'))?.hide();
    })
    .catch(error => {
        console.error('Erro ao encerrar MDF-e:', error);
        showNotification(error.message, 'error');
    });
}

function cancelarMDFe(mdfeId) {
    const xJust = prompt("Justificativa para o cancelamento (mínimo 15 caracteres):");
    if (!xJust || xJust.trim().length < 15) {
        alert("Justificativa inválida."); return;
    }

    if (!confirm(`Confirma o CANCELAMENTO do MDF-e: "${xJust.trim()}"?`)) return;

    showNotification('Enviando evento de cancelamento...', 'info', 5000);
    const payload = { xJust: xJust.trim() };
    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/cancelar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': Auth.getCookie('csrftoken') },
        body: JSON.stringify(payload)
    })
    .then(response => response.json().then(data => ({ok: response.ok, data})))
    .then(({ok, data}) => {
        if (!ok) throw new Error(data.message || data.error || data.detail || 'Falha na API de cancelamento.');
        showNotification(data.message || 'Evento de cancelamento enviado.', 'success');
        loadAllMdfePanelData();
        bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal'))?.hide();
    })
    .catch(error => {
        console.error('Erro ao cancelar MDF-e:', error);
        showNotification(error.message, 'error');
    });
}

function getMdfeStatusBadge(status, isEncerrado) {
    let badgeClass = 'bg-secondary';
    let statusText = status || 'Desconhecido';
    let textColor = 'text-white';

    if (isEncerrado) {
        statusText = 'Encerrado';
        badgeClass = 'bg-dark';
    } else if (status === 'Autorizado') {
        badgeClass = 'bg-success';
    } else if (status === 'Cancelado') {
        badgeClass = 'bg-danger';
    } else if (status && status.toLowerCase().includes('rejeitado')) {
        badgeClass = 'bg-warning';
        textColor = 'text-dark';
    } else if (status === 'Pendente' || (status && status.toLowerCase().includes('processado'))) {
        badgeClass = 'bg-info';
        textColor = 'text-dark';
    }
    return `<span class="badge ${badgeClass} ${textColor}">${statusText}</span>`;
}

function formatMdfeKeyName(key) {
    const map = {
        id: 'ID Interno', chave: 'Chave de Acesso', numero_mdfe: 'Número MDF-e', data_emissao: 'Data Emissão',
        uf_inicio: 'UF Início Viagem', uf_fim: 'UF Fim Viagem', placa_tracao: 'Placa Tração',
        documentos_count: 'Qtd. Docs', status_geral: 'Status Geral', processado: 'Processado (Interno)',
        data_upload: 'Data do Upload', encerrado: 'Encerrado (Interno)',
        c_uf: 'Cód. UF Emitente', tp_amb: 'Ambiente', tp_emit: 'Tipo Emitente', tp_transp: 'Tipo Transportador',
        mod: 'Modelo Doc.', serie: 'Série', n_mdf: 'Nº MDF-e (Doc)', c_mdf: 'Cód. Numérico', c_dv: 'DV Chave',
        modal: 'Modal Transporte', dh_emi: 'Data/Hora Emissão (Doc)', tp_emis: 'Tipo Emissão',
        proc_emi: 'Processo Emissão', ver_proc: 'Versão Processo', dh_ini_viagem: 'Data/Hora Início Viagem',
        ind_canal_verde: 'Canal Verde', ind_carga_posterior: 'Carrega Posterior',
        situacao_mdfe: 'Situação MDF-e (SEFAZ)',
        cnpj: 'CNPJ', cpf: 'CPF', ie: 'IE', x_nome: 'Razão Social/Nome',
        x_fant: 'Nome Fantasia', x_lgr: 'Logradouro', nro: 'Número', x_cpl: 'Complemento', x_bairro: 'Bairro',
        c_mun: 'Cód. Município', x_mun: 'Município', cep: 'CEP', uf: 'UF', fone: 'Telefone', email: 'Email',
        rntrc: 'RNTRC', ciot: 'CIOT', codigo_agendamento_porto: 'Cód. Agend. Porto',
        placa: 'Placa', renavam: 'RENAVAM', tara: 'Tara (kg)', cap_kg: 'Capacidade (kg)',
        cap_m3: 'Capacidade (m³)', tp_rod: 'Tipo Rodado', tp_car: 'Tipo Carroceria',
        prop_cnpj: 'CNPJ Prop. Veículo', prop_cpf: 'CPF Prop. Veículo',
        prop_rntrc: 'RNTRC Prop. Veículo', prop_x_nome: 'Nome Prop. Veículo',
        prop_ie: 'IE Prop. Veículo', prop_uf: 'UF Prop. Veículo', prop_tp_prop: 'Tipo Prop. Veículo',
        q_cte: 'Qtd. CT-e Vinculados', q_nfe: 'Qtd. NF-e Vinculadas',
        v_carga: 'Valor Total da Carga', c_unid: 'Unid. Medida (Peso)', q_carga: 'Peso Bruto Total (Qtd.)',
        codigo_status: 'Cód. Status SEFAZ', motivo_status: 'Motivo SEFAZ', numero_protocolo: 'Nº Protocolo',
        data_recebimento: 'Data Recebimento SEFAZ',
        encerramento_status: 'Status Encerramento', encerramento_data: 'Data Encerramento',
        encerramento_protocolo: 'Protocolo Encerramento',
        qr_code_url: 'QR Code URL',
        n_prot: 'Nº Prot. Evento', dh_reg_evento: 'Data/Hora Reg. Evento',
        x_evento: 'Tipo Evento', c_stat: 'Cód. Status Evento', x_motivo: 'Motivo Evento',
        x_just: 'Justificativa',
        municipio_descarga_cod: 'Cód. Mun. Descarga', municipio_descarga_nome: 'Município Descarga',
        chave_documento: 'Chave Documento', tipo_documento: 'Tipo Documento',
        segundo_codigo_barras: '2º Cód. Barras', info_complementar: 'Info. Comp.',
        numero_onu: 'Nº ONU', nome_apropriado_embarque: 'Nome Apropriado Embarque',
        classe_risco: 'Classe Risco', grupo_embalagem: 'Grupo Embalagem',
        quantidade_total_produto: 'Qtd. Total Produto', unidade_medida: 'Unidade Medida (Prod. Perigoso)'
    };
    return map[key] || key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatMdfeValue(key, value) {
    if (value === null || value === undefined || String(value).trim() === '') return '--';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

    const lowerKey = String(key).toLowerCase();

    if (['data_emissao', 'dh_emi', 'dh_ini_viagem', 'data_upload', 'data_recebimento', 'dh_reg_evento', 'encerramento_info_data', 'encerramento_data'].includes(lowerKey)) {
        return formatDateTime(value);
    }
    if (lowerKey.includes('valor_') || lowerKey.includes('v_carga')) {
        if (!isNaN(parseFloat(value))) return formatCurrency(parseFloat(value));
    }
    if (lowerKey === 'cnpj' || lowerKey === 'prop_cnpj' || (lowerKey === 'prop_cpf_cnpj' && String(value).length === 14)) return formatCNPJ(value);
    if (lowerKey === 'cpf' || lowerKey === 'prop_cpf' || (lowerKey === 'prop_cpf_cnpj' && String(value).length === 11)) return formatCPF(value);
    if (lowerKey === 'cep') return formatCEP(value);
    if (lowerKey === 'fone' || lowerKey === 'telefone') return formatFone(value);

    if (lowerKey === 'tp_amb') return value === 1 || value === '1' ? 'Produção' : (value === 2 || value === '2' ? 'Homologação' : value);
    if (lowerKey === 'tp_emit') {
        const map = {'1': 'Prestador de Serviço de Transporte', '2': 'Transportador de Carga Própria', '3':'Prestador de serviço de transporte multimodal'};
        return map[String(value)] || value;
    }
     if (lowerKey === 'modal' && typeof value === 'string') {
        const map = {'01': 'Rodoviário', '1': 'Rodoviário', '02': 'Aéreo', '2': 'Aéreo', '03': 'Aquaviário', '3': 'Aquaviário', '04':'Ferroviário', '4':'Ferroviário'};
        return map[String(value)] || value;
    }
     if (lowerKey === 'tp_rod') {
        const map = {'01': 'Truck', '02': 'Toco', '03': 'Cavalo Mecânico', '04': 'VAN', '05': 'Utilitário', '06': 'Outros'};
        return map[String(value)] || value;
    }
    if (lowerKey === 'tp_car') {
        const map = {'00': 'Não Aplicável', '01': 'Aberta', '02': 'Fechada/Baú', '03': 'Granelera', '04': 'Porta Container', '05': 'Sider'};
        return map[String(value)] || value;
    }
     if (lowerKey === 'c_unid') {
        const map = {'01': 'KG', '02': 'TON'};
        return map[String(value)] || value;
    }
    if (lowerKey === 'status_geral' || lowerKey === 'status') {
        return getMdfeStatusBadge(value, currentSelectedMDFeIsEncerrado);
    }
    if (lowerKey === 'prop_tp_prop'){
        const map = {'0': 'TAC Agregado', '1': 'TAC Independente', '2':'Outros'};
        return map[String(value)] || value;
    }

    if (typeof value === 'object' && value !== null) {
        return Array.isArray(value) ? value.map(v => formatMdfeValue('', v)).join(', ') : JSON.stringify(value);
    }

    return String(value);
}

function exportMDFeToCSV() {
    const filters = getMdfeAppliedFilters(false);
    const url = `/api/mdfes/export/?format=csv&${filters}`;
    showNotification('Preparando CSV para download...', 'info');
    window.open(url, '_blank');
}


// Funções utilitárias (assumindo que `Auth` e `bootstrap` estão globais)
if (typeof Auth === 'undefined') {
    window.Auth = {
        getCookie: function(name) { /* ... (implementação de getCookie) ... */ return ''; },
        fetchWithAuth: function(url, options) { return fetch(url, options); }
    };
    console.warn("Auth não definido globalmente. Usando fallback.");
}

if (typeof formatNumber !== 'function') {
    function formatNumber(value, decimals = 0) { /* ... */ }
}
if (typeof formatCurrency !== 'function') {
    function formatCurrency(value) { /* ... */ }
}
// ... (demais funções utilitárias como truncateText, formatDateTime, etc.)
// ... (showNotification)

// Certifique-se de que TODAS as funções utilitárias usadas acima (formatNumber, formatCurrency, 
// truncateText, formatDateTime, formatCNPJ, formatCPF, formatCEP, formatFone, showNotification)
// estejam definidas aqui ou em um script global (como scripts.js) que é carregado ANTES de mdfe_panel.js.
// Para evitar repetição, vou omitir a re-declaração completa delas aqui, mas elas PRECISAM existir.

// Exemplo rápido de Auth.getCookie se não estiver em auth.js
if (typeof Auth.getCookie !== 'function') {
    Auth.getCookie = function(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
}