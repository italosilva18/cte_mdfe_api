/**
 * configuracoes.js
 * Funções para a página de Configurações do sistema
 */

// Global variables
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let cteList = [];

// Current modal CT-e data
let currentCTeId = null;

/**
 * Initializes the CT-e panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Load initial CT-e data
    loadCTeList();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the CT-e panel
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadCTeList()"]');
    if (filterBtn) {
        // Replace inline handler with proper event listener
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            currentPage = 1; // Reset to first page when applying filters
            loadCTeList();
        });
    }
    
    // Reset filters button
    const resetBtn = document.querySelector('button[onclick="resetFilters()"]');
    if (resetBtn) {
        resetBtn.removeAttribute('onclick');
        resetBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
    
    // Document detail buttons are set up in renderCTeTable function
    
    // Modal buttons
    setupModalEventListeners();
    
    // Export CSV button
    const exportBtn = document.querySelector('button[onclick="exportCSV()"]');
    if (exportBtn) {
        exportBtn.removeAttribute('onclick');
        exportBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportCSV();
        });
    }
    
    // Pagination handling is in updatePagination function
}

/**
 * Sets up modal event listeners
 */
function setupModalEventListeners() {
    // Get modal elements
    const modal = document.getElementById('cteDetailModal');
    const btnPrintCTe = document.getElementById('btnPrintCTe');
    const btnDownloadXML = document.getElementById('btnDownloadXML');
    const btnReprocessCTe = document.getElementById('btnReprocessCTe');
    
    if (!modal) return;
    
    // Print DACTe button
    if (btnPrintCTe) {
        btnPrintCTe.addEventListener('click', function() {
            if (!currentCTeId) return;
            window.open(`/api/ctes/${currentCTeId}/dacte/`, '_blank');
        });
    }
    
    // Download XML button
    if (btnDownloadXML) {
        btnDownloadXML.addEventListener('click', function() {
            if (!currentCTeId) return;
            window.open(`/api/ctes/${currentCTeId}/xml/`, '_blank');
        });
    }
    
    // Reprocess CT-e button
    if (btnReprocessCTe) {
        btnReprocessCTe.addEventListener('click', function() {
            if (!currentCTeId) return;
            reprocessCTe(currentCTeId);
        });
    }
    
    // When modal is hidden, reset current CT-e ID
    modal.addEventListener('hidden.bs.modal', function() {
        currentCTeId = null;
    });
}

/**
 * Resets filters and loads data
 */
function resetFilters() {
    // Reset form
    document.getElementById('filterForm')?.reset();
    
    // Set default date range
    setDefaultDateRange();
    
    // Reset to first page
    currentPage = 1;
    
    // Load data with reset filters
    loadCTeList();
}

/**
 * Sets default date range (last 30 days)
 */
function setDefaultDateRange() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Format dates for input fields (YYYY-MM-DD)
    document.getElementById('data_inicio').value = formatDateForInput(thirtyDaysAgo);
    document.getElementById('data_fim').value = formatDateForInput(today);
}

/**
 * Formats date for input fields
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date string (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Loads CT-e list from the API
 */
function loadCTeList() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const modalidade = document.getElementById('modalidade').value;
    const remetenteCnpj = document.getElementById('remetente_cnpj')?.value;
    const destinatarioCnpj = document.getElementById('destinatario_cnpj')?.value;
    const ufOrigem = document.getElementById('uf_origem')?.value;
    const ufDestino = document.getElementById('uf_destino')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    // Build API URL with query params
    let apiUrl = `/api/ctes/?page=${currentPage}&page_size=${pageSize}`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (modalidade) apiUrl += `&modalidade=${modalidade}`;
    if (remetenteCnpj) apiUrl += `&remetente_cnpj=${remetenteCnpj}`;
    if (destinatarioCnpj) apiUrl += `&destinatario_cnpj=${destinatarioCnpj}`;
    if (ufOrigem) apiUrl += `&uf_ini=${ufOrigem}`;
    if (ufDestino) apiUrl += `&uf_fim=${ufDestino}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&${status}=true`; // autorizado=true, cancelado=true, etc.
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;
    
    // Fetch data with authentication
    window.apiClient.get(apiUrl)
        .then(data => {
            // Update pagination variables
            if (Array.isArray(data)) {
                // Handle case when API returns array directly
                cteList = data;
                totalItems = data.length;
            } else {
                // Handle paginated response
                cteList = data.results || [];
                totalItems = data.count || 0;
            }
            
            // Update summary cards if summary data is available
            if (data.summary) {
                updateSummaryCards(data.summary);
            }
            
            // Render table with results
            renderCTeTable();
            
            // Update pagination controls
            updatePagination();
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading CT-e data:', error);
            showNotification('Não foi possível carregar os dados dos CT-es. Tente novamente.', 'error');
            
            // Clear table with error message
            const tbody = document.getElementById('cte-list');
            if (tbody) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Erro ao carregar dados. Tente novamente.
                    </td>
                </tr>`;
            }
            
            // Hide loading indicator
            hideLoading();
        });
}

/**
 * Updates summary cards with API data
 * @param {Object} summary - Summary data from API
 */
function updateSummaryCards(summary) {
    if (document.getElementById('total-cte')) {
        document.getElementById('total-cte').textContent = summary.total_ctes || 0;
    }
    if (document.getElementById('valor-total')) {
        document.getElementById('valor-total').textContent = formatCurrency(summary.valor_total || 0);
    }
    if (document.getElementById('total-cif')) {
        document.getElementById('total-cif').textContent = summary.total_cif || 0;
    }
    if (document.getElementById('total-fob')) {
        document.getElementById('total-fob').textContent = summary.total_fob || 0;
    }
}

/**
 * Shows loading state
 */
function showLoading() {
    // Display loading message in table
    const tbody = document.getElementById('cte-list');
    if (tbody) {
        tbody.innerHTML = `
        <tr>
            <td colspan="9" class="text-center">
                <div class="d-flex justify-content-center">
                    <div class="spinner-border text-success" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                </div>
                <div class="mt-2">Carregando dados...</div>
            </td>
        </tr>`;
    }
    
    // Disable filter buttons during loading
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = true;
    });
}

/**
 * Hides loading state
 */
function hideLoading() {
    // Re-enable filter buttons
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = false;
    });
}

/**
 * Renders the CT-e table with current data
 */
function renderCTeTable() {
    const tbody = document.getElementById('cte-list');
    if (!tbody) return;
    
    if (cteList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="9" class="text-center">
                Nenhum CT-e encontrado para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    cteList.forEach(cte => {
        // Format values
        const dataEmissao = cte.data_emissao ? formatDateTime(new Date(cte.data_emissao)) : '--';
        const statusHTML = getStatusHTML(cte);
        
        html += `
        <tr>
            <td>${cte.numero_cte || '--'}</td>
            <td>${truncateText(cte.chave, 15)}</td>
            <td>${dataEmissao}</td>
            <td>${truncateText(cte.remetente_nome, 15)}</td>
            <td>${truncateText(cte.destinatario_nome, 15)}</td>
            <td>${formatCurrency(cte.valor_total)}</td>
            <td>${cte.modalidade || '--'}</td>
            <td>${statusHTML}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary btn-cte-detail" data-id="${cte.id}" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="/api/ctes/${cte.id}/xml/" class="btn btn-outline-success" title="Download XML" target="_blank">
                        <i class="fas fa-file-code"></i>
                    </a>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Set up detail button click events
    const detailButtons = document.querySelectorAll('.btn-cte-detail');
    detailButtons.forEach(button => {
        button.addEventListener('click', function() {
            const cteId = this.getAttribute('data-id');
            showCTeDetails(cteId);
        });
    });
}

/**
 * Shows CT-e details in modal
 * @param {string} cteId - CT-e ID
 */
function showCTeDetails(cteId) {
    // Save current CT-e ID
    currentCTeId = cteId;
    
    // Get modal elements
    const modal = document.getElementById('cteDetailModal');
    const modalTitle = document.getElementById('cteDetailModalLabel');
    const modalBody = document.getElementById('cteDetailContent');
    const reprocessButton = document.getElementById('btnReprocessCTe');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Show loading state in modal
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center p-5">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    <div class="text-center mt-3">Carregando detalhes do CT-e...</div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Fetch CT-e details from API
    window.apiClient.get(`/api/ctes/${cteId}/`)
        .then(cteData => {
            // Update modal title
            modalTitle.textContent = `CT-e ${cteData.identificacao?.numero || ''} - Detalhes`;
            
            // Render CT-e details
            modalBody.innerHTML = renderCTeDetails(cteData);
            
            // Toggle reprocess button based on status
            if (reprocessButton) {
                if (cteData.cancelamento && cteData.cancelamento.c_stat === 135) {
                    // Hide if canceled
                    reprocessButton.classList.add('d-none');
                } else {
                    reprocessButton.classList.remove('d-none');
                }
            }
        })
        .catch(error => {
            console.error('Error loading CT-e details:', error);
            
            // Show error in modal
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes do CT-e. Tente novamente.
            </div>
            `;
        });
}

/**
 * Renders CT-e details HTML
 * @param {Object} cte - CT-e data from API
 * @returns {string} - HTML content for modal
 */
function renderCTeDetails(cte) {
    // Main info card
    let html = `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Informações Básicas</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-4">
                    <p class="mb-1"><strong>Número:</strong> ${cte.identificacao?.numero || '--'}</p>
                    <p class="mb-1"><strong>Série:</strong> ${cte.identificacao?.serie || '--'}</p>
                    <p class="mb-1"><strong>Data Emissão:</strong> ${formatDateTime(cte.identificacao?.data_emissao_formatada || cte.identificacao?.data_emissao)}</p>
                    <p class="mb-1"><strong>Chave:</strong> ${cte.chave || '--'}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>CFOP:</strong> ${cte.identificacao?.cfop || '--'}</p>
                    <p class="mb-1"><strong>Natureza Operação:</strong> ${cte.identificacao?.natureza_operacao || '--'}</p>
                    <p class="mb-1"><strong>Modalidade:</strong> ${cte.modalidade || '--'}</p>
                    <p class="mb-1"><strong>Ambiente:</strong> ${getAmbienteText(cte.identificacao?.ambiente)}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>Modal:</strong> ${getModalText(cte.identificacao?.modal)}</p>
                    <p class="mb-1"><strong>UF Início:</strong> ${cte.identificacao?.uf_ini || '--'}</p>
                    <p class="mb-1"><strong>UF Fim:</strong> ${cte.identificacao?.uf_fim || '--'}</p>
                    <p class="mb-1"><strong>Distância:</strong> ${cte.identificacao?.dist_km || '0'} km</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Emitente, Remetente, Destinatário
    html += `
    <div class="row mb-3">
        <div class="col-md-4">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Emitente</h5>
                </div>
                <div class="card-body">
                    <p class="mb-1"><strong>Razão Social:</strong> ${cte.emitente?.razao_social || '--'}</p>
                    <p class="mb-1"><strong>CNPJ:</strong> ${formatCNPJ(cte.emitente?.cnpj)}</p>
                    <p class="mb-1"><strong>IE:</strong> ${cte.emitente?.ie || '--'}</p>
                    <p class="mb-1"><strong>UF:</strong> ${cte.emitente?.uf || '--'}</p>
                </div>
            </div>
        </div>
        
        <div class="col-md-4">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Remetente</h5>
                </div>
                <div class="card-body">
                    <p class="mb-1"><strong>Razão Social:</strong> ${cte.remetente?.razao_social || '--'}</p>
                    <p class="mb-1"><strong>CNPJ/CPF:</strong> ${formatCNPJorCPF(cte.remetente?.cnpj, cte.remetente?.cpf)}</p>
                    <p class="mb-1"><strong>IE:</strong> ${cte.remetente?.ie || '--'}</p>
                    <p class="mb-1"><strong>Município:</strong> ${cte.remetente?.nome_municipio || '--'} - ${cte.remetente?.uf || '--'}</p>
                </div>
            </div>
        </div>
        
        <div class="col-md-4">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Destinatário</h5>
                </div>
                <div class="card-body">
                    <p class="mb-1"><strong>Razão Social:</strong> ${cte.destinatario?.razao_social || '--'}</p>
                    <p class="mb-1"><strong>CNPJ/CPF:</strong> ${formatCNPJorCPF(cte.destinatario?.cnpj, cte.destinatario?.cpf)}</p>
                    <p class="mb-1"><strong>IE:</strong> ${cte.destinatario?.ie || '--'}</p>
                    <p class="mb-1"><strong>Município:</strong> ${cte.destinatario?.nome_municipio || '--'} - ${cte.destinatario?.uf || '--'}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Valores e Tributos
    html += `
    <div class="row mb-3">
        <div class="col-md-6">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Valores</h5>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm mb-0">
                        <thead>
                            <tr>
                                <th>Componente</th>
                                <th class="text-end">Valor (R$)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${renderComponentesValor(cte.prestacao?.componentes)}
                            <tr class="table-success fw-bold">
                                <td>VALOR TOTAL</td>
                                <td class="text-end">${formatCurrency(cte.prestacao?.valor_total_prestado)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="col-md-6">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Impostos</h5>
                </div>
                <div class="card-body">
                    <p class="mb-1"><strong>Valor Total Tributos:</strong> ${formatCurrency(cte.tributos?.valor_total_tributos)}</p>
                    <p class="mb-3"><strong>Informações Adicionais Fisco:</strong> ${cte.tributos?.info_ad_fisco || '--'}</p>
                    
                    <div class="alert alert-info mb-0">
                        <i class="fas fa-info-circle me-2"></i>
                        Detalhes do ICMS estão disponíveis no XML completo.
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Documentos transportados
    html += `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Documentos Transportados</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-sm mb-0">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Número</th>
                            <th>Chave NF-e</th>
                            <th>Emissão</th>
                            <th class="text-end">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderDocumentosTransportados(cte.documentos_transportados)}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
    
    // Veículos e motoristas (if available)
    if (cte.modal_rodoviario) {
        html += `
        <div class="row mb-3">
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-header bg-light">
                        <h5 class="mb-0">Veículos</h5>
                    </div>
                    <div class="card-body p-0">
                        <table class="table table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Placa</th>
                                    <th>RNTRC</th>
                                    <th>UF</th>
                                    <th>Tara (kg)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderVeiculos(cte.modal_rodoviario.veiculos)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-header bg-light">
                        <h5 class="mb-0">Motoristas</h5>
                    </div>
                    <div class="card-body p-0">
                        <table class="table table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>CPF</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderMotoristas(cte.modal_rodoviario.motoristas)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
    
    // Protocolo e status
    html += `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Protocolo de Autorização</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p class="mb-1"><strong>Status:</strong> ${getStatusText(cte)}</p>
                    <p class="mb-1"><strong>Código Status:</strong> ${cte.protocolo?.codigo_status || '--'}</p>
                    <p class="mb-1"><strong>Motivo:</strong> ${cte.protocolo?.motivo_status || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p class="mb-1"><strong>Número Protocolo:</strong> ${cte.protocolo?.numero_protocolo || '--'}</p>
                    <p class="mb-1"><strong>Data Recebimento:</strong> ${formatDateTime(cte.protocolo?.data_recebimento_formatada || cte.protocolo?.data_recebimento)}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Cancelamento (if applicable)
    if (cte.cancelamento && cte.cancelamento.c_stat === 135) {
        html += `
        <div class="card mb-3 border-danger">
            <div class="card-header bg-danger text-white">
                <h5 class="mb-0">Cancelamento</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Data/Hora Evento:</strong> ${formatDateTime(cte.cancelamento.dh_evento_formatada || cte.cancelamento.dh_evento)}</p>
                        <p class="mb-1"><strong>Protocolo Original:</strong> ${cte.cancelamento.n_prot_original || '--'}</p>
                        <p class="mb-1"><strong>Protocolo Cancelamento:</strong> ${cte.cancelamento.n_prot_retorno || '--'}</p>
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Justificativa:</strong> ${cte.cancelamento.x_just || '--'}</p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
    
    return html;
}

/**
 * Renders the componentes de valor section
 * @param {Array} componentes - List of componentes de valor
 * @returns {string} - HTML content
 */
function renderComponentesValor(componentes) {
    if (!componentes || componentes.length === 0) {
        return `
        <tr>
            <td colspan="2" class="text-center">Nenhum componente de valor</td>
        </tr>
        `;
    }
    
    let html = '';
    
    componentes.forEach(comp => {
        html += `
        <tr>
            <td>${comp.nome || '--'}</td>
            <td class="text-end">${formatCurrency(comp.valor)}</td>
        </tr>
        `;
    });
    
    return html;
}

/**
 * Renders the documentos transportados section
 * @param {Array} documentos - List of documentos transportados
 * @returns {string} - HTML content
 */
function renderDocumentosTransportados(documentos) {
    if (!documentos || documentos.length === 0) {
        return `
        <tr>
            <td colspan="5" class="text-center">Nenhum documento transportado</td>
        </tr>
        `;
    }
    
    let html = '';
    
    documentos.forEach(doc => {
        const dataEmissao = formatDate(doc.data_emissao_nf || doc.data_emissao_outros);
        
        html += `
        <tr>
            <td>${doc.tipo_documento || '--'}</td>
            <td>${doc.numero_nf || doc.numero_outros || '--'}</td>
            <td>${doc.chave_nfe || '--'}</td>
            <td>${dataEmissao}</td>
            <td class="text-end">${formatCurrency(doc.valor_total_nf || doc.valor_doc_outros)}</td>
        </tr>
        `;
    });
    
    return html;
}

/**
 * Renders the veículos section
 * @param {Array} veiculos - List of veículos
 * @returns {string} - HTML content
 */
function renderVeiculos(veiculos) {
    if (!veiculos || veiculos.length === 0) {
        return `
        <tr>
            <td colspan="4" class="text-center">Nenhum veículo</td>
        </tr>
        `;
    }
    
    let html = '';
    
    veiculos.forEach(veiculo => {
        html += `
        <tr>
            <td>${veiculo.placa || '--'}</td>
            <td>${veiculo.prop_rntrc || '--'}</td>
            <td>${veiculo.uf_licenciamento || '--'}</td>
            <td>${veiculo.tara || '--'}</td>
        </tr>
        `;
    });
    
    return html;
}

/**
 * Renders the motoristas section
 * @param {Array} motoristas - List of motoristas
 * @returns {string} - HTML content
 */
function renderMotoristas(motoristas) {
    if (!motoristas || motoristas.length === 0) {
        return `
        <tr>
            <td colspan="2" class="text-center">Nenhum motorista</td>
        </tr>
        `;
    }
    
    let html = '';
    
    motoristas.forEach(motorista => {
        html += `
        <tr>
            <td>${motorista.nome || '--'}</td>
            <td>${formatCPF(motorista.cpf)}</td>
        </tr>
        `;
    });
    
    return html;
}

/**
 * Reprocesses a CT-e
 * @param {string} cteId - CT-e ID
 */
function reprocessCTe(cteId) {
    // Get button for visual feedback
    const btn = document.getElementById('btnReprocessCTe');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Reprocessando...';
    }
    
    // Send reprocess request to API
    window.apiClient.get(`/api/ctes/${cteId}/reprocessar/`, {
        method: 'POST',
    })
        .then(data => {
            showNotification('CT-e reprocessado com sucesso!', 'success');
            
            // Reload data
            loadCTeList();
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('cteDetailModal')).hide();
        })
        .catch(error => {
            console.error('Error reprocessing CT-e:', error);
            showNotification(`Erro ao reprocessar CT-e: ${error.message}`, 'error');
        })
        .finally(() => {
            // Re-enable button
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
    
    let html = `
    <li class="page-item${currentPage === 1 ? ' disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Anterior">
            <span aria-hidden="true">&laquo;</span>
        </a>
    </li>
    `;
    
    // Determine page range
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
        <li class="page-item${i === currentPage ? ' active' : ''}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
        `;
    }
    
    html += `
    <li class="page-item${currentPage === totalPages ? ' disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Próximo">
            <span aria-hidden="true">&raquo;</span>
        </a>
    </li>
    `;
    
    paginationElement.innerHTML = html;
    
    // Add click event listeners
    const pageLinks = paginationElement.querySelectorAll('.page-link');
    pageLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = parseInt(this.getAttribute('data-page'));
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                loadCTeList();
                
                // Scroll to top of table
                document.querySelector('.card-header').scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Exports table data to CSV
 */
function exportCSV() {
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const modalidade = document.getElementById('modalidade').value;
    const remetenteCnpj = document.getElementById('remetente_cnpj')?.value;
    const destinatarioCnpj = document.getElementById('destinatario_cnpj')?.value;
    const ufOrigem = document.getElementById('uf_origem')?.value;
    const ufDestino = document.getElementById('uf_destino')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    // Build API URL with query params
    let apiUrl = `/api/ctes/export/?format=csv`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (modalidade) apiUrl += `&modalidade=${modalidade}`;
    if (remetenteCnpj) apiUrl += `&remetente_cnpj=${remetenteCnpj}`;
    if (destinatarioCnpj) apiUrl += `&destinatario_cnpj=${destinatarioCnpj}`;
    if (ufOrigem) apiUrl += `&uf_ini=${ufOrigem}`;
    if (ufDestino) apiUrl += `&uf_fim=${ufDestino}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&${status}=true`; // autorizado=true, cancelado=true, etc.
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;
    
    // Trigger download
    window.location.href = apiUrl;
}

/**
 * Gets status HTML badge
 * @param {Object} cte - CT-e data
 * @returns {string} - HTML for status badge
 */
function getStatusHTML(cte) {
    if (cte.status === 'Cancelado' || (cte.cancelamento && cte.cancelamento.c_stat === 135)) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (cte.status === 'Autorizado' || (cte.status_code_protocolo === 100)) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    
    if (cte.status && cte.status.toLowerCase().includes('rejeitado')) {
        return '<span class="badge bg-warning text-dark">Rejeitado</span>';
    }
    
    if (cte.processado) {
        return '<span class="badge bg-info">Processado</span>';
    }
    
    return '<span class="badge bg-secondary">Pendente</span>';
}

/**
 * Gets status text
 * @param {Object} cte - CT-e data
 * @returns {string} - Status text
 */
function getStatusText(cte) {
    if (cte.cancelamento && cte.cancelamento.c_stat === 135) {
        return 'CANCELADO';
    }
    
    if (cte.protocolo && cte.protocolo.codigo_status === 100) {
        return 'AUTORIZADO';
    }
    
    if (cte.protocolo && cte.protocolo.codigo_status) {
        return `REJEITADO (${cte.protocolo.codigo_status})`;
    }
    
    if (cte.processado) {
        return 'PROCESSADO';
    }
    
    return 'PENDENTE';
}

/**
 * Gets ambiente text
 * @param {number} ambiente - Ambiente code
 * @returns {string} - Ambiente description
 */
function getAmbienteText(ambiente) {
    switch (ambiente) {
        case 1: return 'Produção';
        case 2: return 'Homologação';
        default: return ambiente || '--';
    }
}

/**
 * Gets modal text
 * @param {string} modal - Modal code
 * @returns {string} - Modal description
 */
function getModalText(modal) {
    switch (modal) {
        case '01': return 'Rodoviário';
        case '02': return 'Aéreo';
        case '03': return 'Aquaviário';
        case '04': return 'Ferroviário';
        case '05': return 'Dutoviário';
        case '06': return 'Multimodal';
        default: return modal || '--';
    }
}

/**
 * Formats currency value
 * @param {number} value - Value to format
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Format date
 * @param {string} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        return new Date(date).toLocaleDateString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Format date and time
 * @param {string} date - Date to format
 * @returns {string} - Formatted date and time
 */
function formatDateTime(date) {
    if (!date) return '--';
    
    try {
        return new Date(date).toLocaleString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Formats CNPJ with mask
 * @param {string} cnpj - CNPJ number
 * @returns {string} - Formatted CNPJ
 */
function formatCNPJ(cnpj) {
    if (!cnpj) return '--';
    
    // Remove non-digits
    cnpj = cnpj.replace(/\D/g, '');
    
    // Apply mask
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Formats CPF with mask
 * @param {string} cpf - CPF number
 * @returns {string} - Formatted CPF
 */
function formatCPF(cpf) {
    if (!cpf) return '--';
    
    // Remove non-digits
    cpf = cpf.replace(/\D/g, '');
    
    // Apply mask
    return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/**
 * Formats CNPJ or CPF depending on which is provided
 * @param {string} cnpj - CNPJ number
 * @param {string} cpf - CPF number
 * @returns {string} - Formatted CNPJ or CPF
 */
function formatCNPJorCPF(cnpj, cpf) {
    if (cnpj) return formatCNPJ(cnpj);
    if (cpf) return formatCPF(cpf);
    return '--';
}

/**
 * Truncates text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Show notification toast
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'success', duration = 5000) {
    // If a global notification function exists, use it
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
        return;
    }
    
    // Define type colors
    const typeClasses = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-dark'
    };
    
    // Get or create toast container
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1080';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastID = 'toast-' + Date.now();
    const toastHTML = `
    <div id="${toastID}" class="toast ${typeClasses[type] || typeClasses.info}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close ${type === 'success' || type === 'error' ? 'btn-close-white' : ''} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>
    `;
    
    // Add toast to container
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    // Initialize and show toast
    const toastElement = document.getElementById(toastID);
    const toast = new bootstrap.Toast(toastElement, {
        delay: duration
    });
    
    toast.show();
    
    // Remove toast element when hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        this.remove();
        
        // Remove container if empty
        if (toastContainer.children.length === 0) {
            toastContainer.remove();
        }
    });
}