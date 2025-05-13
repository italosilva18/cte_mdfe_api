/**
 * mdfe_panel.js
 * Funções para o painel MDF-e.
 * Versão Corrigida e Padronizada.
 */

// Variáveis Globais
let currentPageMdfe = 1;
const pageSizeMdfe = 10; // Pode ser ajustado ou tornado configurável
let currentMdfeId = null;
let mdfePanelChart = null; // Para o gráfico de relação CT-e/MDF-e

document.addEventListener('DOMContentLoaded', function () {
    setDefaultDateRangeMdfe();
    loadMdfePanelData(); // Carrega dados dos cards e gráficos
    loadMDFeList(); // Carrega a lista de MDF-es
    setupMdfeEventListeners();
});

function setupMdfeEventListeners() {
    const filterButton = document.getElementById('btnFiltrarMdfe');
    if (filterButton) {
        filterButton.addEventListener('click', () => {
            currentPageMdfe = 1;
            loadMdfePanelData();
            loadMDFeList();
        });
    }

    const exportButton = document.getElementById('btnExportarCsvMdfe');
    if (exportButton) {
        exportButton.addEventListener('click', exportMdfeToCSV);
    }
    
    // Listeners para botões dentro do modal de detalhes (se forem adicionados dinamicamente)
    // Ex: Reprocessar, DAMDFE, XML
    const modal = document.getElementById('mdfeDetailModal');
    if(modal){
        const btnPrintMDFe = document.getElementById('btnPrintMDFe');
        const btnDownloadXMLMDFe = document.getElementById('btnDownloadXMLMDFe');
        const btnReprocessMDFe = document.getElementById('btnReprocessMDFe');

        if (btnPrintMDFe) {
            btnPrintMDFe.addEventListener('click', () => {
                if (currentMdfeId) window.open(`/api/mdfes/${currentMdfeId}/damdfe/`, '_blank');
            });
        }
        if (btnDownloadXMLMDFe) {
            btnDownloadXMLMDFe.addEventListener('click', () => {
                if (currentMdfeId) window.open(`/api/mdfes/${currentMdfeId}/xml/`, '_blank');
            });
        }
        if (btnReprocessMDFe) {
            btnReprocessMDFe.addEventListener('click', () => {
                if (currentMdfeId) reprocessMDFeSingle(currentMdfeId);
            });
        }
         modal.addEventListener('hidden.bs.modal', () => {
            currentMdfeId = null; // Limpa ID ao fechar o modal
        });
    }
}

function setDefaultDateRangeMdfe() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('data_inicio').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('data_fim').value = today.toISOString().split('T')[0];
}

function showLoadingStateMdfePanel(isLoading, section = 'all') {
    const cardIds = [
        'card-mdfes-total', 'card-mdfes-autorizados', 'card-mdfes-encerrados',
        'card-mdfes-cancelados', 'card-mdfes-docs', 'card-mdfes-eficiencia'
    ];
    const tableBodyId = 'mdfe-list-table-body';
    const paginationId = 'pagination-mdfe';
    const topVeiculosBodyId = 'top-veiculos-table-body';
    const relationChartId = 'mdfeRelationChart';

    const loadingHtml = `<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Carregando...</span></div>`;
    const tableLoadingHtml = `<tr><td colspan="9" class="text-center">${loadingHtml} Carregando...</td></tr>`;

    if (isLoading) {
        if (section === 'all' || section === 'cards') {
            cardIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = loadingHtml;
            });
        }
        if (section === 'all' || section === 'list') {
            const tbody = document.getElementById(tableBodyId);
            if (tbody) tbody.innerHTML = tableLoadingHtml;
            const pagination = document.getElementById(paginationId);
            if (pagination) pagination.innerHTML = '';
        }
        if (section === 'all' || section === 'charts') {
            const topVeiculosBody = document.getElementById(topVeiculosBodyId);
             if (topVeiculosBody) topVeiculosBody.innerHTML = `<tr><td colspan="2" class="text-center">${loadingHtml} Carregando...</td></tr>`;
            // Para o gráfico, pode-se mostrar um spinner no container dele
            const chartContainer = document.getElementById(relationChartId)?.parentElement;
            if(chartContainer) chartContainer.innerHTML = `<div class="d-flex justify-content-center align-items-center h-100">${loadingHtml} Carregando gráfico...</div>`;
        }
    }
}

function loadMdfePanelData() {
    showLoadingStateMdfePanel(true, 'cards');
    showLoadingStateMdfePanel(true, 'charts');

    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    // Adicionar outros filtros se o endpoint do painel os aceitar (ex: placa)
    const placa = document.getElementById('placa')?.value;

    let apiUrl = `/api/painel/mdfe/?data_inicio=${dataInicio}&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;


    Auth.fetchWithAuth(apiUrl)
        .then(response => response.json())
        .then(data => {
            updateMdfeSummaryCardsPanel(data);
            renderMdfeRelationChart(data.grafico_cte_mdfe || []);
            updateTopVeiculosTable(data.top_veiculos || []);
        })
        .catch(error => {
            console.error('Erro ao carregar dados do painel MDF-e:', error);
            showNotification('Erro ao carregar dados do painel MDF-e.', 'error');
            // Limpar cards em caso de erro
            updateMdfeSummaryCardsPanel({});
        });
}

function updateMdfeSummaryCardsPanel(data) {
    const cards = data.cards || {};
    const cardMapping = {
        'card-mdfes-total': cards.total_mdfes || 0,
        'card-mdfes-autorizados': cards.total_autorizados || 0,
        'card-mdfes-encerrados': cards.total_encerrados || 0,
        'card-mdfes-cancelados': cards.total_cancelados || 0,
        'card-mdfes-docs': cards.total_ctes_em_mdfes || 0
    };

    for (const [id, value] of Object.entries(cardMapping)) {
        const el = document.getElementById(id);
        if (el) el.textContent = formatNumber(value);
    }

    const eficienciaEl = document.getElementById('card-mdfes-eficiencia');
    if (eficienciaEl) {
        eficienciaEl.textContent = `${(data.eficiencia || 0).toFixed(1)} %`;
    }
}

function renderMdfeRelationChart(chartData) {
    const canvasContainer = document.getElementById('mdfeRelationChart')?.parentElement;
    if (!canvasContainer) return;

    // Limpar container e recriar canvas para destruir instância anterior do Chart.js
    canvasContainer.innerHTML = '<canvas id="mdfeRelationChart"></canvas>';
    const canvas = document.getElementById('mdfeRelationChart');
     if (!canvas) return;

    if (!chartData || chartData.length === 0) {
        canvasContainer.innerHTML = `<div class="text-center p-3 text-muted">Nenhum dado para o gráfico de relação CT-e/MDF-e.</div>`;
        return;
    }

    const labels = chartData.map(item => item.categoria);
    const values = chartData.map(item => item.contagem);

    if (mdfePanelChart) {
        mdfePanelChart.destroy();
    }

    mdfePanelChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Qtd. MDF-es',
                data: values,
                backgroundColor: 'rgba(27, 77, 62, 0.7)', // Cor --verde-primario com opacidade
                borderColor: 'rgba(27, 77, 62, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 // Para contagens inteiras
                    }
                }
            }
        }
    });
}

function updateTopVeiculosTable(veiculosData) {
    const tbody = document.getElementById('top-veiculos-table-body');
    if (!tbody) return;

    if (!veiculosData || veiculosData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted p-3">Nenhum veículo no top.</td></tr>`;
        return;
    }

    tbody.innerHTML = veiculosData.map(v => `
        <tr>
            <td>${v.placa || 'N/A'}</td>
            <td class="text-end">${formatNumber(v.total || 0)}</td>
        </tr>
    `).join('');
}


function loadMDFeList() {
    showLoadingStateMdfePanel(true, 'list');
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa')?.value;
    // Outros filtros da tabela principal podem ser adicionados aqui, se houver inputs para eles
    // const status = document.getElementById('status_filtro_tabela')?.value; 

    let apiUrl = `/api/mdfes/?page=${currentPageMdfe}&page_size=${pageSizeMdfe}`;
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    // if (status) apiUrl += `&status=${status}`; 
    // (assumindo que o backend suporta um filtro 'status' mais genérico ou você mapeia para os booleanos: autorizado, cancelado, etc.)

    Auth.fetchWithAuth(apiUrl)
        .then(response => response.json())
        .then(data => {
            renderMDFeTable(data.results || []);
            updateMdfePagination(data.count || 0);
        })
        .catch(error => {
            console.error('Erro ao carregar lista de MDF-e:', error);
            const tbody = document.getElementById('mdfe-list-table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Erro ao carregar MDF-es.</td></tr>`;
        });
}

function renderMDFeTable(mdfes) {
    const tbody = document.getElementById('mdfe-list-table-body');
    if (!tbody) return;

    if (mdfes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted p-3">Nenhum MDF-e encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = mdfes.map(mdfe => `
        <tr>
            <td>${mdfe.numero_mdfe || '--'}</td>
            <td title="${mdfe.chave}">${truncateText(mdfe.chave, 15)}</td>
            <td>${formatDateTime(mdfe.data_emissao)}</td>
            <td>${mdfe.uf_inicio || '--'}</td>
            <td>${mdfe.uf_fim || '--'}</td>
            <td>${mdfe.placa_tracao || '--'}</td>
            <td>${formatNumber(mdfe.documentos_count || 0)}</td>
            <td>${getMdfeStatusBadge(mdfe.status)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-primary btn-mdfe-detail" data-id="${mdfe.id}" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-info btn-mdfe-docs-vinculados" data-id="${mdfe.id}" title="Ver Documentos Vinculados">
                        <i class="fas fa-file-invoice"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Adicionar listeners para os novos botões de detalhe
    document.querySelectorAll('.btn-mdfe-detail').forEach(btn => {
        btn.addEventListener('click', function() {
            showMDFeDetailsSingle(this.dataset.id);
        });
    });
    document.querySelectorAll('.btn-mdfe-docs-vinculados').forEach(btn => {
        btn.addEventListener('click', function() {
            showMDFeDocsVinculadosModal(this.dataset.id);
        });
    });
}

function showMDFeDetailsSingle(mdfeId) {
    currentMdfeId = mdfeId;
    const modal = document.getElementById('mdfeDetailModal');
    const modalBody = document.getElementById('mdfeDetailContent');
    const modalTitle = document.getElementById('mdfeDetailModalLabel');
    
    if (!modal || !modalBody || !modalTitle) return;

    modalBody.innerHTML = `<div class="text-center p-4"><div class="spinner-border text-success"></div> <p class="mt-2">Carregando detalhes...</p></div>`;
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/`)
        .then(response => response.json())
        .then(data => {
            modalTitle.textContent = `Detalhes do MDF-e: ${data.identificacao?.n_mdf || data.chave.substring(0,6)}`;
            
            let html = `<dl class="row">`;
            html += `<dt class="col-sm-3">Chave:</dt><dd class="col-sm-9">${data.chave}</dd>`;
            html += `<dt class="col-sm-3">Número:</dt><dd class="col-sm-9">${data.identificacao?.n_mdf || '--'}</dd>`;
            html += `<dt class="col-sm-3">Série:</dt><dd class="col-sm-9">${data.identificacao?.serie || '--'}</dd>`;
            html += `<dt class="col-sm-3">Emissão:</dt><dd class="col-sm-9">${formatDateTime(data.identificacao?.dh_emi)}</dd>`;
            html += `<dt class="col-sm-3">UF Início:</dt><dd class="col-sm-9">${data.identificacao?.uf_ini || '--'}</dd>`;
            html += `<dt class="col-sm-3">UF Fim:</dt><dd class="col-sm-9">${data.identificacao?.uf_fim || '--'}</dd>`;
            html += `<dt class="col-sm-3">Placa Tração:</dt><dd class="col-sm-9">${data.modal_rodoviario?.veiculo_tracao?.placa || '--'}</dd>`;
            html += `<dt class="col-sm-3">Status:</dt><dd class="col-sm-9">${getMdfeStatusBadge(data.status_geral)}</dd>`;
             html += `<dt class="col-sm-3">Encerrado:</dt><dd class="col-sm-9">${data.encerrado ? 'Sim' : 'Não'}</dd>`;
            if(data.encerrado && data.encerramento_info){
                html += `<dt class="col-sm-3">Data Encerramento:</dt><dd class="col-sm-9">${formatDate(data.encerramento_info.data)}</dd>`;
                html += `<dt class="col-sm-3">Município Encerramento:</dt><dd class="col-sm-9">${data.encerramento_info.municipio} / ${data.encerramento_info.uf}</dd>`;
            }
            html += `</dl>`;
            // Adicionar mais detalhes conforme necessário (emitente, totais, etc.)
            modalBody.innerHTML = html;
        })
        .catch(error => {
            console.error('Erro ao carregar detalhes do MDF-e:', error);
            modalBody.innerHTML = `<div class="alert alert-danger">Erro ao carregar detalhes.</div>`;
        });
}

function reprocessMDFeSingle(mdfeId) {
    const btn = document.getElementById('btnReprocessMDFe');
    if(btn) btn.disabled = true;

    showNotification('Reprocessando MDF-e...', 'info', 3000);

    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/reprocessar/`, { method: 'POST' })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ ok, data}) => {
            if (ok) {
                showNotification(data.message || 'MDF-e reprocessado com sucesso!', 'success');
                const modalInstance = bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal'));
                if(modalInstance) modalInstance.hide();
                loadMdfePanelData();
                loadMDFeList();
            } else {
                throw new Error(data.error || 'Falha ao reprocessar.');
            }
        })
        .catch(error => {
            console.error('Erro ao reprocessar MDF-e:', error);
            showNotification(error.message || 'Erro desconhecido ao reprocessar.', 'error');
        })
        .finally(() => {
             if(btn) btn.disabled = false;
        });
}


function showMDFeDocsVinculadosModal(mdfeId) {
    const modal = document.getElementById('docsVinculadosModal');
    const modalBody = document.getElementById('docsVinculadosModalBody');
    const modalTitle = document.getElementById('docsVinculadosModalLabel');

    if (!modal || !modalBody || !modalTitle) return;

    modalBody.innerHTML = `<div class="text-center p-4"><div class="spinner-border text-primary"></div> <p class="mt-2">Carregando documentos...</p></div>`;
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/documentos/`)
        .then(response => response.json())
        .then(docs => {
            const mdfe = (document.getElementById('mdfe-list-table-body').querySelector(`button[data-id="${mdfeId}"]`))?.closest('tr')?.querySelector('td:first-child')?.textContent || mdfeId.substring(0,6);
            modalTitle.textContent = `Documentos Vinculados ao MDF-e Nº ${mdfe}`;
            
            if (!docs || docs.length === 0) {
                modalBody.innerHTML = `<div class="alert alert-info m-3">Nenhum documento vinculado a este MDF-e.</div>`;
                return;
            }

            let html = '<ul class="list-group">';
            docs.forEach(doc => {
                html += `
                    <li class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${doc.tipo}: ${doc.chave}</h6>
                            <small>${doc.municipio ? doc.municipio.nome + '/' + doc.municipio.codigo.substring(0,2) : 'N/A'}</small>
                        </div>
                        ${doc.cte ? `
                            <p class="mb-1 small">
                                CT-e Nº: ${doc.cte.numero_cte || '-'} | 
                                Rem: ${truncateText(doc.cte.remetente_nome, 15) || '-'} | 
                                Dest: ${truncateText(doc.cte.destinatario_nome, 15) || '-'} | 
                                Valor: ${formatCurrency(doc.cte.valor_total)}
                            </p>
                        ` : ''}
                        ${doc.produtos_perigosos && doc.produtos_perigosos.length > 0 ? `
                            <small class="text-danger">Contém Produtos Perigosos (${doc.produtos_perigosos.length})</small>
                        ` : ''}
                    </li>
                `;
            });
            html += '</ul>';
            modalBody.innerHTML = html;
        })
        .catch(error => {
            console.error('Erro ao carregar documentos vinculados:', error);
            modalBody.innerHTML = `<div class="alert alert-danger">Erro ao carregar documentos.</div>`;
        });
}


function updateMdfePagination(totalItems) {
    const paginationElement = document.getElementById('pagination-mdfe');
    if (!paginationElement) return;

    const totalPages = Math.ceil(totalItems / pageSizeMdfe);
    paginationElement.innerHTML = '';

    if (totalPages <= 1) return;

    // Botão Anterior
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPageMdfe === 1 ? 'disabled' : ''}`;
    const prevA = document.createElement('a');
    prevA.className = 'page-link';
    prevA.href = '#';
    prevA.innerHTML = '&laquo;';
    prevA.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPageMdfe > 1) {
            currentPageMdfe--;
            loadMDFeList();
        }
    });
    prevLi.appendChild(prevA);
    paginationElement.appendChild(prevLi);

    // Números das Páginas (simplificado)
    let startPage = Math.max(1, currentPageMdfe - 2);
    let endPage = Math.min(totalPages, currentPageMdfe + 2);

    if (currentPageMdfe <= 3) {
        endPage = Math.min(totalPages, 5);
    }
    if (currentPageMdfe > totalPages - 3) {
        startPage = Math.max(1, totalPages - 4);
    }


    for (let i = startPage; i <= endPage; i++) {
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${i === currentPageMdfe ? 'active' : ''}`;
        const pageA = document.createElement('a');
        pageA.className = 'page-link';
        pageA.href = '#';
        pageA.textContent = i;
        pageA.addEventListener('click', (e) => {
            e.preventDefault();
            currentPageMdfe = i;
            loadMDFeList();
        });
        pageLi.appendChild(pageA);
        paginationElement.appendChild(pageLi);
    }

    // Botão Próximo
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPageMdfe === totalPages ? 'disabled' : ''}`;
    const nextA = document.createElement('a');
    nextA.className = 'page-link';
    nextA.href = '#';
    nextA.innerHTML = '&raquo;';
    nextA.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPageMdfe < totalPages) {
            currentPageMdfe++;
            loadMDFeList();
        }
    });
    nextLi.appendChild(nextA);
    paginationElement.appendChild(nextLi);
}

function getMdfeStatusBadge(statusText) {
    if (!statusText) return `<span class="badge bg-secondary">Desconhecido</span>`;
    const lowerStatus = statusText.toLowerCase();
    if (lowerStatus.includes('cancelado')) return `<span class="badge bg-danger">${statusText}</span>`;
    if (lowerStatus.includes('encerrado')) return `<span class="badge bg-dark">${statusText}</span>`; // Usando bg-dark para Encerrado
    if (lowerStatus.includes('autorizado')) return `<span class="badge bg-success">${statusText}</span>`;
    if (lowerStatus.includes('rejeitado')) return `<span class="badge bg-warning text-dark">${statusText}</span>`;
    if (lowerStatus.includes('processado')) return `<span class="badge bg-info text-dark">${statusText}</span>`;
    return `<span class="badge bg-secondary">${statusText}</span>`;
}

function exportMdfeToCSV() {
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa')?.value;
    // Adicionar outros filtros relevantes para a exportação, se houver

    let apiUrl = `/api/mdfes/export/?format=csv`; // O endpoint /export já deve ter o serializer correto
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    // ... outros filtros ...

    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) throw new Error('Falha ao exportar CSV.');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `mdfes_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showNotification('Download do CSV iniciado.', 'success');
        })
        .catch(error => {
            console.error('Erro ao exportar MDF-es para CSV:', error);
            showNotification('Erro ao gerar CSV. ' + error.message, 'error');
        });
}


// Funções utilitárias (formatDateTime, truncateText, formatNumber, showNotification)
// Devem estar disponíveis globalmente (ex: em scripts.js) ou definidas aqui.
// Exemplo, se não estiverem globais:
function formatDateTime(dateString) {
    if (!dateString) return '--';
    try {
        return new Date(dateString).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) { return dateString; }
}

function truncateText(text, maxLength = 15) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatNumber(value) {
    if (typeof value !== 'number') return value || '0';
    return value.toLocaleString('pt-BR');
}

function formatCurrency(value) {
    if (typeof value !== 'number') return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Se showNotification não estiver em scripts.js:
/*
function showNotification(message, type = 'success', duration = 3000) {
    // Implementação básica de um toast/alert
    const notificationArea = document.getElementById('notification-area') || document.body; // Crie uma <div id="notification-area"></div> no seu base.html
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    notificationArea.prepend(alertDiv); // Adiciona no topo
    setTimeout(() => {
        bootstrap.Alert.getOrCreateInstance(alertDiv).close();
    }, duration);
}
*/