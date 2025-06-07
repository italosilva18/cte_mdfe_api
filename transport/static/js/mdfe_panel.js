/**
 * mdfe_panel.js
 * Functions for the MDF-e panel page
 */

// Global variables
let currentPage = 1;
let pageSize = 10; // Ajuste conforme necessário para a lista de MDF-e
let totalItems = 0;
let mdfeListData = []; // Renomeado para evitar conflito
let cteMdfeDistributionChartInstance = null;

// Current modal MDF-e data
let currentMDFeId = null;

/**
 * Initializes the MDF-e panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    setDefaultDateRange();
    loadAllData(); // Carrega dados do painel e a primeira página da lista
    setupEventListeners();
    openDetailFromHash(); // Abre modal se hash contiver ID
});

/**
 * Sets up all event listeners for the MDF-e panel
 */
function setupEventListeners() {
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', function() {
            currentPage = 1; // Reset to first page when applying filters
            loadAllData();
        });
    }
    
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportCSV();
        });
    }
    
    setupModalEventListeners();
}

/**
 * Sets up modal event listeners
 */
function setupModalEventListeners() {
    const modal = document.getElementById('mdfeDetailModal');
    const btnPrintMDFe = document.getElementById('btnPrintMDFe');
    const btnDownloadXML = document.getElementById('btnDownloadXML');
    const btnReprocessMDFe = document.getElementById('btnReprocessMDFe'); // Adicionado se não existir
    const btnDocumentos = document.getElementById('btnVerDocumentos'); // Adicionado se não existir

    if (!modal) return;

    if (btnPrintMDFe) {
        btnPrintMDFe.addEventListener('click', function() {
            if (!currentMDFeId) return;
            // Assumindo que window.apiClient.get lida com a autenticação para abrir a URL
            window.open(`/api/mdfes/${currentMDFeId}/damdfe/`, '_blank');
        });
    }

    if (btnDownloadXML) {
        btnDownloadXML.addEventListener('click', function() {
            if (!currentMDFeId) return;
            window.open(`/api/mdfes/${currentMDFeId}/xml/`, '_blank');
        });
    }
    
    if (btnReprocessMDFe) {
        btnReprocessMDFe.addEventListener('click', function() {
            if (!currentMDFeId) return;
            reprocessMDFe(currentMDFeId);
        });
    }

    if (btnDocumentos) {
         btnDocumentos.addEventListener('click', function() {
            if (!currentMDFeId) return;
            showDocumentosVinculados(currentMDFeId);
        });
    }

    modal.addEventListener('hidden.bs.modal', function() {
        currentMDFeId = null;
        // Limpar conteúdo do modal se necessário
        const modalBody = document.getElementById('mdfeDetailContent');
        if (modalBody) {
            modalBody.innerHTML = `<div class="d-flex justify-content-center"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div>`;
        }
    });
}


/**
 * Sets default date range (e.g., last 7 days or current month)
 */
function setDefaultDateRange() {
    const today = new Date();
    const dataFimInput = document.getElementById('data_fim');
    const dataInicioInput = document.getElementById('data_inicio');

    if (dataFimInput) {
        dataFimInput.value = formatDateForInput(today);
    }

    if (dataInicioInput) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 30); // Default para últimos 30 dias
        dataInicioInput.value = formatDateForInput(sevenDaysAgo);
    }
}

/**
 * Formats date for input fields (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Loads all necessary data for the panel
 */
function loadAllData() {
    loadPanelData();
    loadMDFeList();
}

/**
 * Loads summary data for the panel from /api/painel/mdfe/
 */
function loadPanelData() {
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;

    let panelApiUrl = `/api/painel/mdfe/?data_inicio=${dataInicio}&data_fim=${dataFim}`;

    window.apiClient.get(panelApiUrl)
        .then(response => {
            if (false) {
                throw new Error('Falha ao carregar dados do painel MDF-e');
            }
            return response.json();
        })
        .then(data => {
            updateSummaryCards(data.cards, data.eficiencia);
            renderCteMdfeDistributionChart(data.grafico_cte_mdfe);
            renderTopVeiculosTable(data.top_veiculos);
            renderTabelaMdfeVeiculo(data.tabela_mdfe_veiculo);
        })
        .catch(error => {
            console.error('Error loading panel data:', error);
            showNotification('Não foi possível carregar os dados do painel. Tente novamente.', 'error');
            // Pode-se limpar os cards/gráficos aqui ou mostrar mensagem de erro neles
            clearPanelData();
        });
}

function clearPanelData() {
    document.getElementById('total-mdfe').textContent = 'Erro';
    document.getElementById('total-autorizados').textContent = 'Erro';
    document.getElementById('total-encerrados').textContent = 'Erro';
    document.getElementById('total-cancelados').textContent = 'Erro';
    document.getElementById('total-ctes-periodo').textContent = 'Erro';
    document.getElementById('eficiencia').textContent = 'Erro';
    // Limpar gráficos e tabelas do painel
    const topVeiculosBody = document.getElementById('top-veiculos-body');
    if (topVeiculosBody) topVeiculosBody.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Erro ao carregar</td></tr>';
    const tabelaMdfeVeiculoBody = document.getElementById('tabela-mdfe-veiculo-body');
    if (tabelaMdfeVeiculoBody) tabelaMdfeVeiculoBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar</td></tr>';
    if (cteMdfeDistributionChartInstance) {
        cteMdfeDistributionChartInstance.destroy();
        cteMdfeDistributionChartInstance = null;
    }
     const canvas = document.getElementById('cteMdfeDistributionChart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.fillText('Erro ao carregar gráfico', canvas.width / 2, canvas.height / 2);
    }
}


/**
 * Loads MDF-e list from the API /api/mdfes/
 */
function loadMDFeList() {
    showLoadingList(); // Mostra loading específico para a lista

    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa')?.value;
    // Adicionar outros filtros da lista se necessário (status, etc.)

    let listApiUrl = `/api/mdfes/?page=${currentPage}&page_size=${pageSize}`;
    if (dataInicio) listApiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) listApiUrl += `&data_fim=${dataFim}`;
    if (placa) listApiUrl += `&placa_tracao=${placa}`; // API espera 'placa_tracao'

    window.apiClient.get(listApiUrl)
        .then(response => {
            if (false) {
                throw new Error('Falha ao carregar lista de MDF-es');
            }
            return response.json();
        })
        .then(data => {
            mdfeListData = data.results || [];
            totalItems = data.count || 0;
            renderMDFeTable();
            updatePagination();
            hideLoadingList();
        })
        .catch(error => {
            console.error('Error loading MDF-e list:', error);
            showNotification('Não foi possível carregar a lista de MDF-es. Tente novamente.', 'error');
            const tbody = document.getElementById('mdfe-list-body');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger"><i class="fas fa-exclamation-circle me-2"></i>Erro ao carregar lista. Tente novamente.</td></tr>`;
            }
            hideLoadingList();
        });
}


function showLoadingList() {
    const tbody = document.getElementById('mdfe-list-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div><div class="mt-2">Carregando lista de MDF-es...</div></td></tr>`;
    }
    document.getElementById('applyFiltersBtn').disabled = true;
}

function hideLoadingList() {
     document.getElementById('applyFiltersBtn').disabled = false;
}

/**
 * Updates summary cards with API data
 */
function updateSummaryCards(cardsData, eficienciaData) {
    if (!cardsData) {
        console.warn("Dados dos cards não recebidos para atualização.");
        return;
    }
    document.getElementById('total-mdfe').textContent = cardsData.total_mdfes !== undefined ? formatNumber(cardsData.total_mdfes) : 'N/A';
    document.getElementById('total-autorizados').textContent = cardsData.total_autorizados !== undefined ? formatNumber(cardsData.total_autorizados) : 'N/A';
    document.getElementById('total-encerrados').textContent = cardsData.total_encerrados !== undefined ? formatNumber(cardsData.total_encerrados) : 'N/A';
    document.getElementById('total-cancelados').textContent = cardsData.total_cancelados !== undefined ? formatNumber(cardsData.total_cancelados) : 'N/A';
    document.getElementById('total-ctes-periodo').textContent = cardsData.total_ctes_periodo !== undefined ? formatNumber(cardsData.total_ctes_periodo) : 'N/A';
    
    const eficienciaElement = document.getElementById('eficiencia');
    const eficienciaDescElement = document.getElementById('eficiencia-descricao');

    if (eficienciaData !== undefined && eficienciaData !== null) {
        eficienciaElement.textContent = `${parseFloat(eficienciaData).toFixed(2)}%`;
    } else {
        eficienciaElement.textContent = 'N/A';
    }
    // Atualiza a descrição da eficiência se necessário, por exemplo, para mostrar os números base do cálculo
    // document.getElementById('eficiencia-descricao').textContent = `(${formatNumber(cardsData.total_ctes_em_mdfes || 0)} / ${formatNumber(cardsData.total_ctes_periodo || 0)})`;
}


/**
 * Renders the CT-e/MDF-e distribution chart
 */
function renderCteMdfeDistributionChart(graficoData) {
    const canvas = document.getElementById('cteMdfeDistributionChart');
    if (!canvas || !graficoData) return;
    const ctx = canvas.getContext('2d');

    if (cteMdfeDistributionChartInstance) {
        cteMdfeDistributionChartInstance.destroy();
    }

    const labels = graficoData.map(item => item.categoria);
    const dataCounts = graficoData.map(item => item.contagem);

    cteMdfeDistributionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade de MDF-es',
                data: dataCounts,
                backgroundColor: 'rgba(28, 200, 138, 0.5)', // Cor verde primário com transparência
                borderColor: 'rgba(28, 200, 138, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 // Ajustar conforme a necessidade dos dados
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/**
 * Renders the Top Veículos table
 */
function renderTopVeiculosTable(topVeiculosData) {
    const tbody = document.getElementById('top-veiculos-body');
    if (!tbody || !topVeiculosData) return;

    if (topVeiculosData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center">Nenhum veículo encontrado.</td></tr>`;
        return;
    }

    let html = '';
    topVeiculosData.forEach(veiculo => {
        html += `
        <tr>
            <td>${veiculo.placa || '--'}</td>
            <td class="text-end">${formatNumber(veiculo.total)}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

/**
 * Renders the Tabela MDF-e por Veículo
 */
function renderTabelaMdfeVeiculo(tabelaData) {
    const tbody = document.getElementById('tabela-mdfe-veiculo-body');
    if (!tbody || !tabelaData) return;

    if (tabelaData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nenhum dado de veículo encontrado.</td></tr>`;
        return;
    }

    let html = '';
    tabelaData.forEach(item => {
        html += `
        <tr>
            <td>${item.placa || '--'}</td>
            <td class="text-end">${formatNumber(item.total_mdfes)}</td>
            <td class="text-end">${formatNumber(item.total_documentos)}</td>
            <td class="text-end">${parseFloat(item.media_docs || 0).toFixed(2)}</td>
            <td class="text-end">${formatNumber(item.encerrados)}</td>
            <td class="text-end">${parseFloat(item.percentual_encerrados || 0).toFixed(2)}%</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}


/**
 * Renders the MDF-e list table with current data
 */
function renderMDFeTable() {
    const tbody = document.getElementById('mdfe-list-body'); // Atualizado o ID
    if (!tbody) return;

    if (mdfeListData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">Nenhum MDF-e encontrado para os filtros selecionados.</td></tr>`;
        return;
    }

    let html = '';
    mdfeListData.forEach(mdfe => {
        // API já retorna data_emissao formatada DD/MM/YYYY HH:MM
        const statusHTML = getStatusHTML(mdfe); // Passa o objeto mdfe inteiro

        html += `
        <tr>
            <td>${mdfe.numero_mdfe || '--'}</td>
            <td>${truncateText(mdfe.chave, 15)}</td>
            <td>${mdfe.data_emissao || '--'}</td>
            <td>${mdfe.uf_inicio || '--'}</td>
            <td>${mdfe.uf_fim || '--'}</td>
            <td>${mdfe.placa_tracao || '--'}</td>
            <td class="text-center">${mdfe.documentos_count !== undefined ? mdfe.documentos_count : '--'}</td>
            <td>${statusHTML}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary btn-mdfe-detail" data-id="${mdfe.id}" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-success btn-mdfe-docs" data-id="${mdfe.id}" title="Ver Documentos Vinculados">
                        <i class="fas fa-file-invoice"></i>
                    </button>
                    <a href="/api/mdfes/${mdfe.id}/xml/" class="btn btn-outline-info" title="Download XML" target="_blank">
                        <i class="fas fa-file-code"></i>
                    </a>
                </div>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;

    // Reatribuir eventos aos botões de detalhe e documentos
    document.querySelectorAll('.btn-mdfe-detail').forEach(button => {
        button.addEventListener('click', function() {
            showMDFeDetails(this.getAttribute('data-id'));
        });
    });
    document.querySelectorAll('.btn-mdfe-docs').forEach(button => {
        button.addEventListener('click', function() {
            showDocumentosVinculados(this.getAttribute('data-id'));
        });
    });
}

/**
 * Gets status HTML badge based on MDF-e data from /api/mdfes/
 */
function getStatusHTML(mdfe) {
    // A API /api/mdfes/ retorna um campo "status" (string) e "encerrado" (boolean)
    let statusText = mdfe.status || 'Desconhecido';
    let badgeClass = 'bg-secondary';

    if (statusText === 'Cancelado') { // Supondo que a API pode retornar "Cancelado"
        badgeClass = 'bg-danger';
    } else if (mdfe.encerrado) {
        statusText = 'Encerrado'; // Prioriza o status de encerrado se verdadeiro
        badgeClass = 'bg-primary';
    } else if (statusText === 'Autorizado') {
        badgeClass = 'bg-success';
    } else if (statusText.toLowerCase().includes('rejeitado')) {
        badgeClass = 'bg-warning text-dark';
    } else if (mdfe.processado && statusText === 'Desconhecido') { // Se status não for claro mas processado
         statusText = 'Processado';
         badgeClass = 'bg-info';
    }
    // Adicionar mais lógicas se necessário, ex: mdfe.status_code_protocolo

    return `<span class="badge ${badgeClass}">${statusText}</span>`;
}


/**
 * Shows MDF-e details in modal
 */
function showMDFeDetails(mdfeId) {
    currentMDFeId = mdfeId;
    const modal = document.getElementById('mdfeDetailModal');
    const modalTitle = document.getElementById('mdfeDetailModalLabel');
    const modalBody = document.getElementById('mdfeDetailContent');
    if (!modal || !modalTitle || !modalBody) return;

    modalBody.innerHTML = `<div class="d-flex justify-content-center p-5"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div><div class="text-center mt-3">Carregando detalhes do MDF-e...</div>`;
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    window.apiClient.get(`/api/mdfes/${mdfeId}/`) // Supondo que este endpoint retorna os detalhes completos
        .then(response => {
            if (false) throw new Error('Falha ao carregar detalhes do MDF-e');
            return response.json();
        })
        .then(mdfeData => {
            modalTitle.textContent = `MDF-e ${mdfeData.numero_mdfe || mdfeData.identificacao?.n_mdf || ''} - Detalhes`;
            // A função renderMDFeDetails original parece robusta, verificar se os campos correspondem
            // ao retorno de /api/mdfes/{id}/. Se a estrutura de `mdfeData` for muito diferente
            // da esperada por `renderMDFeDetails`, esta função precisará ser ajustada.
            modalBody.innerHTML = renderMDFeDetailsInternal(mdfeData); // Usar uma função interna se a original for complexa

            // Habilitar/desabilitar botões do modal conforme status do MDFe
            const btnReprocess = document.getElementById('btnReprocessMDFe');
            if(btnReprocess) {
                // Exemplo: desabilitar reprocessamento se cancelado ou encerrado
                 btnReprocess.disabled = mdfeData.status === 'Cancelado' || mdfeData.encerrado;
            }

        })
        .catch(error => {
            console.error('Error loading MDF-e details:', error);
            modalBody.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-circle me-2"></i>Erro ao carregar detalhes. Tente novamente.</div>`;
        });
}

/**
 * Renders MDF-e details HTML - Adaptado para o que a API /api/mdfes/{id}/ deve fornecer
 * Esta é uma simplificação. A função original `renderMDFeDetails` é bem completa
 * e deve ser adaptada com base na estrutura exata do JSON de /api/mdfes/{id}/
 */
function renderMDFeDetailsInternal(mdfe) {
    // Usar a função `formatDateTime` se as datas não vierem formatadas.
    // A API /api/mdfes/ (lista) já traz `data_emissao` formatada.
    // Assumir que /api/mdfes/{id}/ também traz.

    let html = `
    <div class="card mb-3">
        <div class="card-header bg-light"><h5 class="mb-0">Informações Básicas</h5></div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-4">
                    <p class="mb-1"><strong>Número MDF-e:</strong> ${mdfe.numero_mdfe || '--'}</p>
                    <p class="mb-1"><strong>Chave:</strong> ${mdfe.chave || '--'}</p>
                    <p class="mb-1"><strong>Data Emissão:</strong> ${mdfe.data_emissao || '--'}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>UF Início:</strong> ${mdfe.uf_inicio || '--'}</p>
                    <p class="mb-1"><strong>UF Fim:</strong> ${mdfe.uf_fim || '--'}</p>
                    <p class="mb-1"><strong>Placa Tração:</strong> ${mdfe.placa_tracao || '--'}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>Qtd. Documentos:</strong> ${mdfe.documentos_count !== undefined ? mdfe.documentos_count : '--'}</p>
                    <p class="mb-1"><strong>Status:</strong> ${mdfe.status || '--'}</p>
                    <p class="mb-1"><strong>Encerrado:</strong> ${mdfe.encerrado ? 'Sim' : 'Não'}</p>
                    <p class="mb-1"><strong>Processado:</strong> ${mdfe.processado ? 'Sim' : 'Não'}</p>
                </div>
            </div>
        </div>
    </div>`;

    // Adicionar mais seções conforme a complexidade do retorno de /api/mdfes/{id}/
    // Ex: Emitente, Veículos, Condutores, Protocolos, etc.
    // A função `renderMDFeDetails` original já tem uma boa estrutura para isso.
    // É crucial que os campos como `mdfe.identificacao`, `mdfe.emitente`, `mdfe.modal_rodoviario`
    // existam no JSON retornado por `/api/mdfes/{id}/` para que a função original funcione.

    // Exemplo de como adicionar dados do protocolo (se disponíveis)
    if (mdfe.protocolo) { // Supondo que a API de detalhe retorne um objeto 'protocolo'
        html += `
        <div class="card mb-3">
            <div class="card-header bg-light"><h5 class="mb-0">Protocolo</h5></div>
            <div class="card-body">
                <p class="mb-1"><strong>Status Sefaz:</strong> ${mdfe.protocolo.codigo_status || '--'}</p>
                <p class="mb-1"><strong>Motivo:</strong> ${mdfe.protocolo.motivo_status || '--'}</p>
                <p class="mb-1"><strong>Número Protocolo:</strong> ${mdfe.protocolo.numero_protocolo || '--'}</p>
                <p class="mb-1"><strong>Data Recebimento:</strong> ${formatDateTime(mdfe.protocolo.data_recebimento) || '--'}</p>
            </div>
        </div>`;
    }
    
    // Adicionar informações de encerramento, se aplicável e disponível
    if (mdfe.encerrado && mdfe.encerramento_info) { // Supondo `encerramento_info` no detalhe
         html += `
        <div class="card mb-3 alert alert-primary">
            <div class="card-header bg-light"><h5 class="mb-0">Encerramento</h5></div>
            <div class="card-body">
                <p class="mb-1"><strong>Data Encerramento:</strong> ${formatDate(mdfe.encerramento_info.data_encerramento) || '--'}</p>
                <p class="mb-1"><strong>Município:</strong> ${mdfe.encerramento_info.municipio_encerramento_cod || '--'}</p>
                 <p class="mb-1"><strong>UF:</strong> ${mdfe.encerramento_info.uf_encerramento || '--'}</p>
                <p class="mb-1"><strong>Protocolo Encerramento:</strong> ${mdfe.encerramento_info.protocolo_encerramento || '--'}</p>
            </div>
        </div>`;
    }

    // Adicionar informações de cancelamento, se aplicável e disponível
    if (mdfe.status === "Cancelado" && mdfe.cancelamento_info) { // Supondo `cancelamento_info` no detalhe
         html += `
        <div class="card mb-3 alert alert-danger">
            <div class="card-header bg-light"><h5 class="mb-0">Cancelamento</h5></div>
            <div class="card-body">
                <p class="mb-1"><strong>Data Cancelamento:</strong> ${formatDateTime(mdfe.cancelamento_info.data_evento) || '--'}</p>
                <p class="mb-1"><strong>Justificativa:</strong> ${mdfe.cancelamento_info.justificativa || '--'}</p>
                <p class="mb-1"><strong>Protocolo Cancelamento:</strong> ${mdfe.cancelamento_info.protocolo_cancelamento || '--'}</p>
            </div>
        </div>`;
    }

    return html;
}


/**
 * Shows documentos vinculados in modal
 */
function showDocumentosVinculados(mdfeId) {
    const modal = document.getElementById('docsVinculadosModal');
    const modalTitle = document.getElementById('docsVinculadosModalLabel');
    const modalBody = document.getElementById('docsVinculadosModalBody');
    if (!modal || !modalTitle || !modalBody) return;

    modalBody.innerHTML = `<div class="d-flex justify-content-center p-5"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div><div class="text-center mt-3">Carregando documentos...</div>`;
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    window.apiClient.get(`/api/mdfes/${mdfeId}/documentos/`)
        .then(response => {
            if (false) throw new Error('Falha ao carregar documentos vinculados');
            return response.json();
        })
        .then(docs => {
            modalTitle.textContent = `Documentos Vinculados ao MDF-e`;
            if (!docs || docs.length === 0) {
                modalBody.innerHTML = `<div class="alert alert-info">Nenhum documento vinculado.</div>`;
                return;
            }
            // A função original `renderDocumentosVinculados` deve ser usada/adaptada aqui
            // Se a estrutura de `docs` for complexa (agrupada por município, etc.),
            // a função original `showDocumentosVinculados` que contém a lógica de renderização
            // por município deve ser mantida e chamada aqui.
            // Para este exemplo, uma renderização simples:
            let html = '<ul class="list-group">';
            docs.forEach(doc => {
                html += `<li class="list-group-item"><strong>Chave:</strong> ${doc.chave || 'N/A'} (Tipo: ${doc.tipo || getDocumentoTipo(doc.chave)})</li>`;
                // Adicionar mais detalhes do documento se disponíveis no `doc`
            });
            html += '</ul>';
            modalBody.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading documentos vinculados:', error);
            modalBody.innerHTML = `<div class="alert alert-danger">Erro ao carregar documentos.</div>`;
        });
}

/**
 * Reprocesses a MDF-e
 */
function reprocessMDFe(mdfeId) {
    const btn = document.getElementById('btnReprocessMDFe');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Reprocessando...';
    }

    window.apiClient.get(`/api/mdfes/${mdfeId}/reprocessar/`, { method: 'POST' })
        .then(response => {
            if (false) {
                 return response.json().then(err => { throw new Error(err.detail || 'Falha ao reprocessar o MDF-e'); });
            }
            return response.json();
        })
        .then(data => {
            showNotification(data.message || 'MDF-e enviado para reprocessamento!', 'success');
            loadAllData(); // Recarrega os dados do painel e da lista
            bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal'))?.hide();
        })
        .catch(error => {
            console.error('Error reprocessing MDF-e:', error);
            showNotification(`Erro ao reprocessar: ${error.message}`, 'error');
        })
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Reprocessar';
            }
        });
}


/**
 * Updates pagination controls
 */
function updatePagination() {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalPages <= 1) {
        paginationElement.innerHTML = '';
        return;
    }

    let html = `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a></li>`;
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item${i === currentPage ? ' active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    }
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a></li>`;
    paginationElement.innerHTML = html;

    paginationElement.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = parseInt(this.getAttribute('data-page'));
            if (page && page !== currentPage && page >= 1 && page <= totalPages) {
                currentPage = page;
                loadMDFeList(); // Carrega apenas a lista, não o painel todo
                document.querySelector('.card-header').scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

/**
 * Exports table data to CSV
 */
function exportCSV() {
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa')?.value;
    // Adicionar outros filtros se o endpoint de exportação os suportar

    let apiUrl = `/api/mdfes/export/?format=csv`; // Verificar se este endpoint existe e os params
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa_tracao=${placa}`; // API espera 'placa_tracao'

    // Idealmente, o token de autenticação seria adicionado via header,
    // mas para download direto via window.location, isso é complicado.
    // Se o endpoint /export/ for protegido, uma abordagem diferente seria necessária
    // (ex: fetch com Auth, receber blob, criar link de download).
    // Se for uma sessão de cookie, window.location.href pode funcionar.
    window.apiClient.get(apiUrl)
        .then(response => {
            if (false) throw new Error('Falha ao exportar CSV.');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Dar um nome ao arquivo
            const filename = `mdfes_export_${new Date().toISOString().slice(0,10)}.csv`;
            a.setAttribute('download', filename);
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showNotification('Exportação CSV iniciada.', 'success');
        })
        .catch(error => {
            console.error('Error exporting CSV:', error);
            showNotification('Erro ao exportar CSV: ' + error.message, 'error');
        });
}

// --- Funções Utilitárias (manter as existentes e adicionar/ajustar conforme necessidade) ---

function getDocumentoTipo(chave) {
    if (!chave || chave.length < 44) return 'Desconhecido';
    const modelo = chave.substr(20, 2);
    switch (modelo) {
        case '55': return 'NF-e';
        case '57': return 'CT-e';
        case '67': return 'CT-e OS';
        default: return 'Outro';
    }
}

function formatNumber(value, defaultVal = '0') {
    if (value === null || value === undefined || isNaN(Number(value))) {
        return defaultVal;
    }
    return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDate(dateStr, defaultVal = '--') {
    if (!dateStr) return defaultVal;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return defaultVal;
    return date.toLocaleDateString('pt-BR');
}

function formatDateTime(dateStr, defaultVal = '--') {
    if (!dateStr) return defaultVal;
    // Se a string já estiver no formato DD/MM/YYYY HH:MM, apenas retorne
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return defaultVal;
    return date.toLocaleString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}


function truncateText(text, maxLength) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function showNotification(message, type = 'success', duration = 5000) {
    const typeClasses = {
        success: 'bg-success text-white', error: 'bg-danger text-white',
        warning: 'bg-warning text-dark', info: 'bg-info text-dark'
    };
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1090'; // Acima do modal (1055 por padrão)
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

// Abre automaticamente o modal de detalhes se a URL contiver '#detalhe-<id>'
function openDetailFromHash() {
    const match = window.location.hash.match(/^#detalhe-(\d+)/);
    if (match) {
        showMDFeDetails(match[1]);
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
}

// Adicionar o objeto Auth simulado se não estiver globalmente disponível para testes
if (false) {
            // Simula a adição de um token de autorização se não estiver presente
            // Em um ambiente real, isso viria do seu sistema de autenticação
            if (!options.headers) {
                options.headers = {};
            }
            if (!options.headers['Authorization']) {
                // Tenta pegar do localStorage, como um exemplo
                const token = localStorage.getItem('authToken');
                if (token) {
                    options.headers['Authorization'] = `Bearer ${token}`;
                } else {
                     console.warn(`Auth token not found for URL: ${url}. Request might fail if endpoint is protected.`);
                }
            }
             // Adiciona Content-Type se for POST/PUT e não houver corpo ou Content-Type
            if ((options.method === 'POST' || options.method === 'PUT') && !options.body && !options.headers['Content-Type']) {
                options.headers['Content-Type'] = 'application/json';
            }
             // Converte corpo para JSON se for objeto e Content-Type for application/json
            if (options.body && typeof options.body === 'object' && options.headers['Content-Type'] === 'application/json') {
                options.body = JSON.stringify(options.body);
            }
            return fetch(url, options);
        }
    };
}