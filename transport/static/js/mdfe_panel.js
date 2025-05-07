/**
 * mdfe_panel.js
 * Functions for the MDF-e panel page
 */

// Global variables
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let mdfeList = [];

// Current modal MDF-e data
let currentMDFeId = null;

/**
 * Initializes the MDF-e panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Load initial MDF-e data
    loadMDFeList();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the MDF-e panel
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadMDFeList()"]');
    if (filterBtn) {
        // Replace inline handler with proper event listener
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            currentPage = 1; // Reset to first page when applying filters
            loadMDFeList();
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
    
    // Document detail buttons are set up in renderMDFeTable function
    
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
    const modal = document.getElementById('mdfeDetailModal');
    const btnPrintMDFe = document.getElementById('btnPrintMDFe');
    const btnDownloadXML = document.getElementById('btnDownloadXML');
    const btnReprocessMDFe = document.getElementById('btnReprocessMDFe');
    const btnDocumentos = document.getElementById('btnVerDocumentos');
    
    if (!modal) return;
    
    // Print DAMDFE button
    if (btnPrintMDFe) {
        btnPrintMDFe.addEventListener('click', function() {
            if (!currentMDFeId) return;
            window.open(`/api/mdfes/${currentMDFeId}/damdfe/`, '_blank');
        });
    }
    
    // Download XML button
    if (btnDownloadXML) {
        btnDownloadXML.addEventListener('click', function() {
            if (!currentMDFeId) return;
            window.open(`/api/mdfes/${currentMDFeId}/xml/`, '_blank');
        });
    }
    
    // Reprocess MDF-e button
    if (btnReprocessMDFe) {
        btnReprocessMDFe.addEventListener('click', function() {
            if (!currentMDFeId) return;
            reprocessMDFe(currentMDFeId);
        });
    }
    
    // View documents button
    if (btnDocumentos) {
        btnDocumentos.addEventListener('click', function() {
            if (!currentMDFeId) return;
            showDocumentosVinculados(currentMDFeId);
        });
    }
    
    // When modal is hidden, reset current MDF-e ID
    modal.addEventListener('hidden.bs.modal', function() {
        currentMDFeId = null;
    });
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
    loadMDFeList();
}

/**
 * Loads MDF-e list from the API
 */
function loadMDFeList() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const ufOrigem = document.getElementById('uf_origem')?.value;
    const ufDestino = document.getElementById('uf_destino')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    // Build API URL with query params
    let apiUrl = `/api/mdfes/?page=${currentPage}&page_size=${pageSize}`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (ufOrigem) apiUrl += `&uf_ini=${ufOrigem}`;
    if (ufDestino) apiUrl += `&uf_fim=${ufDestino}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&${status}=true`; // autorizado=true, encerrado=true, etc.
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;
    
    // Fetch data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar lista de MDF-es');
            }
            return response.json();
        })
        .then(data => {
            // Update pagination variables
            if (Array.isArray(data)) {
                // Handle case when API returns array directly
                mdfeList = data;
                totalItems = data.length;
            } else {
                // Handle paginated response
                mdfeList = data.results || [];
                totalItems = data.count || 0;
            }
            
            // Update summary cards if summary data is available
            if (data.summary) {
                updateSummaryCards(data.summary);
            }
            
            // Render table with results
            renderMDFeTable();
            
            // Update pagination controls
            updatePagination();
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading MDF-e data:', error);
            showNotification('Não foi possível carregar os dados dos MDF-es. Tente novamente.', 'error');
            
            // Clear table with error message
            const tbody = document.getElementById('mdfe-list');
            if (tbody) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-danger">
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
    if (document.getElementById('total-mdfe')) {
        document.getElementById('total-mdfe').textContent = summary.total_mdfes || 0;
    }
    if (document.getElementById('total-encerrados')) {
        document.getElementById('total-encerrados').textContent = summary.total_encerrados || 0;
    }
    if (document.getElementById('total-autorizados')) {
        document.getElementById('total-autorizados').textContent = summary.total_autorizados || 0;
    }
    if (document.getElementById('total-documentos')) {
        document.getElementById('total-documentos').textContent = summary.total_documentos || 0;
    }
}

/**
 * Shows loading state
 */
function showLoading() {
    // Display loading message in table
    const tbody = document.getElementById('mdfe-list');
    if (tbody) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
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
 * Renders the MDF-e table with current data
 */
function renderMDFeTable() {
    const tbody = document.getElementById('mdfe-list');
    if (!tbody) return;
    
    if (mdfeList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
                Nenhum MDF-e encontrado para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    mdfeList.forEach(mdfe => {
        // Format values
        const dataEmissao = mdfe.data_emissao ? formatDateTime(new Date(mdfe.data_emissao)) : '--';
        const statusHTML = getStatusHTML(mdfe);
        
        html += `
        <tr>
            <td>${mdfe.numero_mdfe || '--'}</td>
            <td>${truncateText(mdfe.chave, 15)}</td>
            <td>${dataEmissao}</td>
            <td>${mdfe.uf_inicio || '--'} → ${mdfe.uf_fim || '--'}</td>
            <td>${mdfe.placa_tracao || '--'}</td>
            <td>${statusHTML}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary btn-mdfe-detail" data-id="${mdfe.id}" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-success btn-mdfe-docs" data-id="${mdfe.id}" title="Ver Documentos">
                        <i class="fas fa-file-invoice"></i>
                    </button>
                    <a href="/api/mdfes/${mdfe.id}/xml/" class="btn btn-outline-info" title="Download XML" target="_blank">
                        <i class="fas fa-file-code"></i>
                    </a>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Set up detail button click events
    const detailButtons = document.querySelectorAll('.btn-mdfe-detail');
    detailButtons.forEach(button => {
        button.addEventListener('click', function() {
            const mdfeId = this.getAttribute('data-id');
            showMDFeDetails(mdfeId);
        });
    });
    
    // Set up doc button click events
    const docButtons = document.querySelectorAll('.btn-mdfe-docs');
    docButtons.forEach(button => {
        button.addEventListener('click', function() {
            const mdfeId = this.getAttribute('data-id');
            showDocumentosVinculados(mdfeId);
        });
    });
}

/**
 * Shows MDF-e details in modal
 * @param {string} mdfeId - MDF-e ID
 */
function showMDFeDetails(mdfeId) {
    // Save current MDF-e ID
    currentMDFeId = mdfeId;
    
    // Get modal elements
    const modal = document.getElementById('mdfeDetailModal');
    const modalTitle = document.getElementById('mdfeDetailModalLabel');
    const modalBody = document.getElementById('mdfeDetailContent');
    const reprocessButton = document.getElementById('btnReprocessMDFe');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Show loading state in modal
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center p-5">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    <div class="text-center mt-3">Carregando detalhes do MDF-e...</div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Fetch MDF-e details from API
    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes do MDF-e');
            }
            return response.json();
        })
        .then(mdfeData => {
            // Update modal title
            modalTitle.textContent = `MDF-e ${mdfeData.identificacao?.n_mdf || ''} - Detalhes`;
            
            // Render MDF-e details
            modalBody.innerHTML = renderMDFeDetails(mdfeData);
            
            // Toggle reprocess button based on status
            if (reprocessButton) {
                if (mdfeData.cancelamento && mdfeData.cancelamento.c_stat === 135) {
                    // Hide if canceled
                    reprocessButton.classList.add('d-none');
                } else {
                    reprocessButton.classList.remove('d-none');
                }
            }
        })
        .catch(error => {
            console.error('Error loading MDF-e details:', error);
            
            // Show error in modal
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes do MDF-e. Tente novamente.
            </div>
            `;
        });
}

/**
 * Renders MDF-e details HTML
 * @param {Object} mdfe - MDF-e data from API
 * @returns {string} - HTML content for modal
 */
function renderMDFeDetails(mdfe) {
    // Main info card
    let html = `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Informações Básicas</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-4">
                    <p class="mb-1"><strong>Número:</strong> ${mdfe.identificacao?.n_mdf || '--'}</p>
                    <p class="mb-1"><strong>Série:</strong> ${mdfe.identificacao?.serie || '--'}</p>
                    <p class="mb-1"><strong>Data Emissão:</strong> ${formatDateTime(mdfe.identificacao?.dh_emi_formatada || mdfe.identificacao?.dh_emi)}</p>
                    <p class="mb-1"><strong>Chave:</strong> ${mdfe.chave || '--'}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>Modalidade:</strong> ${getModalidadeText(mdfe.identificacao?.modal)}</p>
                    <p class="mb-1"><strong>UF Início:</strong> ${mdfe.identificacao?.uf_ini || '--'}</p>
                    <p class="mb-1"><strong>UF Fim:</strong> ${mdfe.identificacao?.uf_fim || '--'}</p>
                    <p class="mb-1"><strong>Ambiente:</strong> ${getAmbienteText(mdfe.identificacao?.tp_amb)}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>Tipo:</strong> ${getTipoEmissaoText(mdfe.identificacao?.tp_emis)}</p>
                    <p class="mb-1"><strong>Data Início Viagem:</strong> ${formatDateTime(mdfe.identificacao?.dh_ini_viagem_formatada || mdfe.identificacao?.dh_ini_viagem) || '--'}</p>
                    <p class="mb-1"><strong>Qtd. CTs/NFs:</strong> ${mdfe.totais?.qCTe || 0} / ${mdfe.totais?.qNFe || 0}</p>
                    <p class="mb-1"><strong>Carga:</strong> ${formatNumber(mdfe.totais?.carga?.qCarga || 0)} ${mdfe.prod_pred?.tp_carga || 'KG'}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Emitente info
    html += `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Emitente</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-6">
                    <p class="mb-1"><strong>Razão Social:</strong> ${mdfe.emitente?.razao_social || '--'}</p>
                    <p class="mb-1"><strong>CNPJ:</strong> ${formatCNPJ(mdfe.emitente?.cnpj)}</p>
                    <p class="mb-1"><strong>IE:</strong> ${mdfe.emitente?.ie || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p class="mb-1"><strong>Município:</strong> ${mdfe.emitente?.x_mun || '--'}</p>
                    <p class="mb-1"><strong>UF:</strong> ${mdfe.emitente?.uf || '--'}</p>
                    <p class="mb-1"><strong>Telefone:</strong> ${mdfe.emitente?.telefone || '--'}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Vehicle info (if available)
    if (mdfe.modal_rodoviario?.veiculo_tracao) {
        html += `
        <div class="card mb-3">
            <div class="card-header bg-light">
                <h5 class="mb-0">Veículo de Tração</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Placa:</strong> ${mdfe.modal_rodoviario.veiculo_tracao.placa || '--'}</p>
                        <p class="mb-1"><strong>RENAVAM:</strong> ${mdfe.modal_rodoviario.veiculo_tracao.RENAVAM || '--'}</p>
                        <p class="mb-1"><strong>Tara (kg):</strong> ${mdfe.modal_rodoviario.veiculo_tracao.tara || '--'}</p>
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Tipo Rodado:</strong> ${getTipoRodadoText(mdfe.modal_rodoviario.veiculo_tracao.tpRod)}</p>
                        <p class="mb-1"><strong>Tipo Carroceria:</strong> ${getTipoCarroceriaText(mdfe.modal_rodoviario.veiculo_tracao.tpCar)}</p>
                        <p class="mb-1"><strong>UF Licenciamento:</strong> ${mdfe.modal_rodoviario.veiculo_tracao.UF || '--'}</p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
    
    // Condutores info
    if (mdfe.condutores && mdfe.condutores.length > 0) {
        html += `
        <div class="card mb-3">
            <div class="card-header bg-light">
                <h5 class="mb-0">Condutores</h5>
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
                        ${renderCondutores(mdfe.condutores)}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }
    
    // Documento status
    html += `
    <div class="card mb-3">
        <div class="card-header bg-light">
            <h5 class="mb-0">Status do Documento</h5>
        </div>
        <div class="card-body">
        `;
        
    // Status info
    html += `
        <div class="alert ${getAlertClassForStatus(mdfe)} mb-3">
            <h6 class="alert-heading">Status Atual: ${getStatusText(mdfe)}</h6>
            <p class="mb-0">
                <strong>Código Status:</strong> ${mdfe.protocolo?.codigo_status || '--'} |
                <strong>Número Protocolo:</strong> ${mdfe.protocolo?.numero_protocolo || '--'} |
                <strong>Data Recebimento:</strong> ${formatDateTime(mdfe.protocolo?.data_recebimento_formatada || mdfe.protocolo?.data_recebimento)}
            </p>
        </div>
    `;
    
    // Encerramento info (if applicable)
    if (mdfe.encerrado) {
        html += `
        <div class="alert alert-primary">
            <h6 class="alert-heading">MDF-e Encerrado</h6>
            <p class="mb-0">
                <strong>Data:</strong> ${formatDate(mdfe.data_encerramento) || '--'} |
                <strong>Município:</strong> ${mdfe.municipio_encerramento_cod || '--'} |
                <strong>UF:</strong> ${mdfe.uf_encerramento || '--'} |
                <strong>Protocolo:</strong> ${mdfe.protocolo_encerramento || '--'}
            </p>
        </div>
        `;
    }
    
    // Cancelamento info (if applicable)
    if (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135) {
        html += `
        <div class="alert alert-danger">
            <h6 class="alert-heading">MDF-e Cancelado</h6>
            <p class="mb-0">
                <strong>Data/Hora:</strong> ${formatDateTime(mdfe.cancelamento.dh_evento_formatada || mdfe.cancelamento.dh_evento) || '--'} |
                <strong>Protocolo:</strong> ${mdfe.cancelamento.n_prot_retorno || '--'} |
                <strong>Justificativa:</strong> ${mdfe.cancelamento.x_just || '--'}
            </p>
        </div>
        `;
    }
    
    // Close card
    html += `
        </div>
    </div>
    `;
    
    return html;
}

/**
 * Renders the condutores section
 * @param {Array} condutores - List of condutores
 * @returns {string} - HTML content
 */
function renderCondutores(condutores) {
    if (!condutores || condutores.length === 0) {
        return `
        <tr>
            <td colspan="2" class="text-center">Nenhum condutor informado</td>
        </tr>
        `;
    }
    
    let html = '';
    
    condutores.forEach(condutor => {
        html += `
        <tr>
            <td>${condutor.nome || '--'}</td>
            <td>${formatCPF(condutor.cpf)}</td>
        </tr>
        `;
    });
    
    return html;
}

/**
 * Shows documentos vinculados in modal
 * @param {string} mdfeId - MDF-e ID
 */
function showDocumentosVinculados(mdfeId) {
    // Get modal elements
    const modal = document.getElementById('docsVinculadosModal');
    const modalTitle = document.getElementById('docsVinculadosModalLabel');
    const modalBody = document.getElementById('docsVinculadosModalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Show loading state in modal
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center p-5">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    <div class="text-center mt-3">Carregando documentos vinculados...</div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Fetch documentos vinculados from API
    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/documentos/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar documentos vinculados');
            }
            return response.json();
        })
        .then(docs => {
            // Update modal title
            modalTitle.textContent = `Documentos Vinculados ao MDF-e`;
            
            // Render documentos vinculados
            if (!docs || docs.length === 0) {
                modalBody.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Nenhum documento vinculado a este MDF-e.
                </div>
                `;
                return;
            }
            
            // Group documents by municipality
            const docsByMunicipality = {};
            docs.forEach(doc => {
                const munKey = doc.municipio ? `${doc.municipio.codigo}-${doc.municipio.nome}` : 'sem-municipio';
                if (!docsByMunicipality[munKey]) {
                    docsByMunicipality[munKey] = {
                        municipio: doc.municipio,
                        docs: []
                    };
                }
                docsByMunicipality[munKey].docs.push(doc);
            });
            
            // Render by municipality
            let html = '';
            
            for (const [munKey, data] of Object.entries(docsByMunicipality)) {
                const mun = data.municipio;
                const munDocs = data.docs;
                
                html += `
                <div class="card mb-3">
                    <div class="card-header bg-light">
                        <h5 class="mb-0">Município: ${mun ? `${mun.nome} (${mun.codigo})` : 'Não informado'}</h5>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Chave</th>
                                        <th>Informações</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                munDocs.forEach(doc => {
                    const tipoDoc = doc.tipo || getDocumentoTipo(doc.chave);
                    
                    html += `
                    <tr>
                        <td><span class="badge bg-secondary">${tipoDoc}</span></td>
                        <td>${truncateText(doc.chave, 25)}</td>
                        <td>
                    `;
                    
                    // Add CT-e info if available
                    if (doc.cte_info) {
                        html += `
                            <small>
                                <strong>Emitente:</strong> ${truncateText(doc.cte_info.emitente, 20) || '--'}<br>
                                <strong>Remetente:</strong> ${truncateText(doc.cte_info.remetente, 20) || '--'}<br>
                                <strong>Destinatário:</strong> ${truncateText(doc.cte_info.destinatario, 20) || '--'}
                            </small>
                        `;
                    } else {
                        html += `<em>Detalhes não disponíveis</em>`;
                    }
                    
                    html += `
                        </td>
                        <td>
                    `;
                    
                    // Add CT-e actions if info available
                    if (doc.cte_info) {
                        html += `
                            <a href="/api/ctes/${doc.cte_info.id}/xml/" class="btn btn-sm btn-outline-primary" target="_blank" title="Download XML">
                                <i class="fas fa-file-code"></i>
                            </a>
                        `;
                    }
                    
                    html += `
                        </td>
                    </tr>
                    `;
                });
                
                html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                `;
            }
            
            modalBody.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading documentos vinculados:', error);
            
            // Show error in modal
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar documentos vinculados. Tente novamente.
            </div>
            `;
        });
}

/**
 * Reprocesses a MDF-e
 * @param {string} mdfeId - MDF-e ID
 */
function reprocessMDFe(mdfeId) {
    // Get button for visual feedback
    const btn = document.getElementById('btnReprocessMDFe');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Reprocessando...';
    }
    
    // Send reprocess request to API
    Auth.fetchWithAuth(`/api/mdfes/${mdfeId}/reprocessar/`, {
        method: 'POST',
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao reprocessar o MDF-e');
            }
            return response.json();
        })
        .then(data => {
            showNotification('MDF-e reprocessado com sucesso!', 'success');
            
            // Reload data
            loadMDFeList();
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('mdfeDetailModal')).hide();
        })
        .catch(error => {
            console.error('Error reprocessing MDF-e:', error);
            showNotification(`Erro ao reprocessar MDF-e: ${error.message}`, 'error');
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
                loadMDFeList();
                
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
    const ufOrigem = document.getElementById('uf_origem')?.value;
    const ufDestino = document.getElementById('uf_destino')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    // Build API URL with query params
    let apiUrl = `/api/mdfes/export/?format=csv`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (ufOrigem) apiUrl += `&uf_ini=${ufOrigem}`;
    if (ufDestino) apiUrl += `&uf_fim=${ufDestino}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&${status}=true`; // autorizado=true, encerrado=true, etc.
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;
    
    // Trigger download
    window.location.href = apiUrl;
}

/**
 * Gets document type from chave
 * @param {string} chave - Document chave
 * @returns {string} - Document type
 */
function getDocumentoTipo(chave) {
    if (!chave || chave.length < 44) return 'Desconhecido';
    
    // Extract model (positions 20-21)
    const modelo = chave.substr(20, 2);
    
    switch (modelo) {
        case '55': return 'NF-e';
        case '57': return 'CT-e';
        case '67': return 'CT-e OS';
        default: return 'Outro';
    }
}

/**
 * Gets status HTML badge
 * @param {Object} mdfe - MDF-e data
 * @returns {string} - HTML for status badge
 */
function getStatusHTML(mdfe) {
    if (mdfe.status === 'Cancelado' || (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135)) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (mdfe.encerrado) {
        return '<span class="badge bg-primary">Encerrado</span>';
    }
    
    if (mdfe.status === 'Autorizado' || (mdfe.status_code_protocolo === 100)) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    
    if (mdfe.status && mdfe.status.toLowerCase().includes('rejeitado')) {
        return '<span class="badge bg-warning text-dark">Rejeitado</span>';
    }
    
    if (mdfe.processado) {
        return '<span class="badge bg-info">Processado</span>';
    }
    
    return '<span class="badge bg-secondary">Pendente</span>';
}

/**
 * Gets alert class for status
 * @param {Object} mdfe - MDF-e data
 * @returns {string} - Alert class
 */
function getAlertClassForStatus(mdfe) {
    if (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135) {
        return 'alert-danger';
    }
    
    if (mdfe.encerrado) {
        return 'alert-primary';
    }
    
    if (mdfe.protocolo && mdfe.protocolo.codigo_status === 100) {
        return 'alert-success';
    }
    
    if (mdfe.protocolo && mdfe.protocolo.codigo_status !== 100) {
        return 'alert-warning';
    }
    
    return 'alert-secondary';
}

/**
 * Gets status text
 * @param {Object} mdfe - MDF-e data
 * @returns {string} - Status text
 */
function getStatusText(mdfe) {
    if (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135) {
        return 'CANCELADO';
    }
    
    if (mdfe.encerrado) {
        return 'ENCERRADO';
    }
    
    if (mdfe.protocolo && mdfe.protocolo.codigo_status === 100) {
        return 'AUTORIZADO';
    }
    
    if (mdfe.protocolo && mdfe.protocolo.codigo_status) {
        return `REJEITADO (${mdfe.protocolo.codigo_status})`;
    }
    
    if (mdfe.processado) {
        return 'PROCESSADO';
    }
    
    return 'PENDENTE';
}

/**
 * Gets modalidade text
 * @param {string} modal - Modal code
 * @returns {string} - Modal description
 */
function getModalidadeText(modal) {
    switch (modal) {
        case '1': return 'Rodoviário';
        case '2': return 'Aéreo';
        case '3': return 'Aquaviário';
        case '4': return 'Ferroviário';
        default: return modal || '--';
    }
}

/**
 * Gets tipo emissão text
 * @param {string} tipoEmis - Tipo emissão code
 * @returns {string} - Tipo emissão description
 */
function getTipoEmissaoText(tipoEmis) {
    switch (tipoEmis) {
        case '1': return 'Normal';
        case '2': return 'Contingência';
        default: return tipoEmis || '--';
    }
}

/**
 * Gets ambiente text
 * @param {string} ambiente - Ambiente code
 * @returns {string} - Ambiente description
 */
function getAmbienteText(ambiente) {
    switch (ambiente) {
        case '1': return 'Produção';
        case '2': return 'Homologação';
        default: return ambiente || '--';
    }
}

/**
 * Gets tipo rodado text
 * @param {string} tipoRod - Tipo rodado code
 * @returns {string} - Tipo rodado description
 */
function getTipoRodadoText(tipoRod) {
    switch (tipoRod) {
        case '01': return 'Truck';
        case '02': return 'Toco';
        case '03': return 'Cavalo Mecânico';
        case '04': return 'VAN';
        case '05': return 'Utilitário';
        case '06': return 'Outros';
        default: return tipoRod || '--';
    }
}

/**
 * Gets tipo carroceria text
 * @param {string} tipoCar - Tipo carroceria code
 * @returns {string} - Tipo carroceria description
 */
function getTipoCarroceriaText(tipoCar) {
    switch (tipoCar) {
        case '00': return 'Não Aplicável';
        case '01': return 'Aberta';
        case '02': return 'Fechada/Baú';
        case '03': return 'Graneleira';
        case '04': return 'Porta Container';
        case '05': return 'Sider';
        default: return tipoCar || '--';
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
 * Formats number with thousands separator
 * @param {number} value - Value to format
 * @returns {string} - Formatted number
 */
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
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
 * Format date
 * @param {string|Date} date - Date to format
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
 * @param {string|Date} date - Date to format
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