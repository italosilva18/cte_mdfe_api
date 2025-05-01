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
    
    // Document detail buttons are set up in renderMDFeTable function
    
    // Modal buttons
    setupModalEventListeners();
    
    // Export CSV button
    document.querySelector('button[onclick="exportCSV()"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportTableToCSV();
    });
}

/**
 * Sets up modal event listeners
 */
function setupModalEventListeners() {
    // Get modal elements
    const modal = document.getElementById('mdfeDetailModal');
    const btnPrintMDFe = document.getElementById('btnPrintMDFe');
    const btnDownloadXML = document.getElementById('btnDownloadXML');
    
    if (!modal || !btnPrintMDFe || !btnDownloadXML) return;
    
    // Print DAMDFe button
    btnPrintMDFe.addEventListener('click', function() {
        if (!currentMDFeId) return;
        window.open(`/api/mdfes/${currentMDFeId}/damdfe/`, '_blank');
    });
    
    // Download XML button
    btnDownloadXML.addEventListener('click', function() {
        if (!currentMDFeId) return;
        window.open(`/api/mdfes/${currentMDFeId}/xml/`, '_blank');
    });
    
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
 * Loads MDF-e list from the API
 */
function loadMDFeList() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa')?.value || '';
    
    // Build API URL with query params
    let apiUrl = `/api/mdfes/?page=${currentPage}&page_size=${pageSize}`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    
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
            mdfeList = data.results || [];
            totalItems = data.count || 0;
            
            // Update summary cards if summary data is available
            if (data.summary) {
                updateSummaryCards(data.summary);
            }
            
            // Also fetch panel data for charts and statistics
            fetchMDFePanelData();
            
            // Render table with results
            renderMDFeTable();
            
            // Update pagination controls
            updatePagination();
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading MDF-e data:', error);
            showError('Não foi possível carregar os dados dos MDF-es. Tente novamente.');
            
            // Clear table with error message
            const tbody = document.getElementById('mdfe-list');
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
 * Fetches MDF-e panel data for charts and statistics
 */
function fetchMDFePanelData() {
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    let apiUrl = `/api/mdfe/?`;
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados do painel MDF-e');
            }
            return response.json();
        })
        .then(data => {
            // Update dashboard cards
            updateSummaryCards(data.cards);
            
            // Update CT-e/MDF-e relationship chart
            renderRelationshipChart(data.grafico_cte_mdfe);
            
            // Update top vehicles
            renderTopVehicles(data.top_veiculos);
            
            // Update efficiency display
            document.getElementById('eficiencia').textContent = data.eficiencia + '%';
        })
        .catch(error => {
            console.error('Error loading MDF-e panel data:', error);
        });
}

/**
 * Updates summary cards with API data
 * @param {Object} summary - Summary data from API
 */
function updateSummaryCards(summary) {
    if (!summary) return;
    
    document.getElementById('total-mdfe').textContent = summary.total_mdfes || 0;
    document.getElementById('valor-carga').textContent = formatCurrency(summary.valor_carga_total || 0);
    document.getElementById('total-ctes').textContent = summary.total_ctes || 0;
}

/**
 * Renders the CT-e/MDF-e relationship chart
 * @param {Array} chartData - Chart data from API
 */
function renderRelationshipChart(chartData) {
    if (!chartData || chartData.length === 0) return;
    
    const canvas = document.getElementById('mdfeRelationChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    // Prepare data for chart
    const labels = chartData.map(item => item.mes);
    const mdfeData = chartData.map(item => item.mdfes);
    const cteData = chartData.map(item => item.ctes);
    const ratioData = chartData.map(item => item.ratio);
    
    // Create new chart
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'MDF-es',
                    data: mdfeData,
                    backgroundColor: '#4CAF50',
                    order: 2
                },
                {
                    label: 'CT-es',
                    data: cteData,
                    backgroundColor: '#1b4d3e',
                    order: 1
                },
                {
                    label: 'Relação CT-e/MDF-e',
                    data: ratioData,
                    type: 'line',
                    borderColor: '#FF5722',
                    backgroundColor: 'rgba(255, 87, 34, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y1',
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade'
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Média CT-e/MDF-e'
                    }
                }
            }
        }
    });
}

/**
 * Renders the top vehicles table
 * @param {Array} topVehicles - Top vehicles data from API
 */
function renderTopVehicles(topVehicles) {
    if (!topVehicles || topVehicles.length === 0) return;
    
    const tbody = document.getElementById('top-veiculos');
    if (!tbody) return;
    
    let html = '';
    topVehicles.forEach(vehicle => {
        html += `
        <tr>
            <td>${vehicle.label}</td>
            <td class="text-end">${vehicle.value1}</td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
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
            <td colspan="9" class="text-center">
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
        const docsCount = mdfe.documentos_count || '0';
        
        html += `
        <tr>
            <td>${mdfe.numero_mdfe || '--'}</td>
            <td>${truncateText(mdfe.chave, 15)}</td>
            <td>${dataEmissao}</td>
            <td>${mdfe.uf_inicio || '--'}</td>
            <td>${mdfe.uf_fim || '--'}</td>
            <td>${mdfe.placa_tracao || '--'}</td>
            <td>${docsCount}</td>
            <td>${statusHTML}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary btn-mdfe-detail" data-id="${mdfe.id}" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="/api/mdfes/${mdfe.id}/xml/" class="btn btn-outline-success" title="Download XML" target="_blank">
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
                    <p class="mb-1"><strong>Chave:</strong> ${mdfe.chave || '--'}</p>
                    <p class="mb-1"><strong>Data Emissão:</strong> ${formatDateTime(mdfe.identificacao?.dh_emi_formatada || mdfe.identificacao?.dh_emi)}</p>
                    <p class="mb-1"><strong>Ambiente:</strong> ${getAmbienteText(mdfe.identificacao?.tp_amb)}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>Modal:</strong> ${getModalText(mdfe.identificacao?.modal)}</p>
                    <p class="mb-1"><strong>UF Início:</strong> ${mdfe.identificacao?.uf_ini || '--'}</p>
                    <p class="mb-1"><strong>UF Fim:</strong> ${mdfe.identificacao?.uf_fim || '--'}</p>
                    <p class="mb-1"><strong>Carregamento:</strong> ${renderMunicipiosCarregamento(mdfe.identificacao?.municipios_carregamento)}</p>
                </div>
                <div class="col-md-4">
                    <p class="mb-1"><strong>Tipo Emissor:</strong> ${getTipoEmissorText(mdfe.identificacao?.tp_emit)}</p>
                    <p class="mb-1"><strong>Tipo Transportador:</strong> ${getTipoTransportadorText(mdfe.identificacao?.tp_transp)}</p>
                    <p class="mb-1"><strong>Data Início Viagem:</strong> ${formatDateTime(mdfe.identificacao?.dh_ini_viagem_formatada || mdfe.identificacao?.dh_ini_viagem) || '--'}</p>
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
                    <p class="mb-1"><strong>CNPJ/CPF:</strong> ${formatCNPJorCPF(mdfe.emitente?.cnpj, mdfe.emitente?.cpf)}</p>
                    <p class="mb-1"><strong>IE:</strong> ${mdfe.emitente?.ie || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p class="mb-1"><strong>Município:</strong> ${mdfe.emitente?.nome_municipio || '--'} - ${mdfe.emitente?.uf || '--'}</p>
                    <p class="mb-1"><strong>Endereço:</strong> ${mdfe.emitente?.logradouro || '--'}, ${mdfe.emitente?.numero || '--'}</p>
                    <p class="mb-1"><strong>Telefone:</strong> ${mdfe.emitente?.telefone || '--'}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Vehicle Information
    if (mdfe.modal_rodoviario) {
        html += `
        <div class="card mb-3">
            <div class="card-header bg-light">
                <h5 class="mb-0">Veículo de Tração</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Placa:</strong> ${mdfe.modal_rodoviario.veiculo_tracao?.placa || '--'}</p>
                        <p class="mb-1"><strong>RENAVAM:</strong> ${mdfe.modal_rodoviario.veiculo_tracao?.renavam || '--'}</p>
                        <p class="mb-1"><strong>UF:</strong> ${mdfe.modal_rodoviario.veiculo_tracao?.uf || '--'}</p>
                        <p class="mb-1"><strong>RNTRC:</strong> ${mdfe.modal_rodoviario.rntrc || mdfe.modal_rodoviario.veiculo_tracao?.prop_rntrc || '--'}</p>
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Tara (kg):</strong> ${mdfe.modal_rodoviario.veiculo_tracao?.tara || '--'}</p>
                        <p class="mb-1"><strong>Capacidade (kg):</strong> ${mdfe.modal_rodoviario.veiculo_tracao?.cap_kg || '--'}</p>
                        <p class="mb-1"><strong>Capacidade (m³):</strong> ${mdfe.modal_rodoviario.veiculo_tracao?.cap_m3 || '--'}</p>
                        <p class="mb-1"><strong>Tipo Rodado:</strong> ${getTipoRodadoText(mdfe.modal_rodoviario.veiculo_tracao?.tp_rod)}</p>
                    </div>
                </div>
            </div>
        </div>
        `;
        
        // Veículos Reboque
        if (mdfe.modal_rodoviario.veiculos_reboque && mdfe.modal_rodoviario.veiculos_reboque.length > 0) {
            html += `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Veículos Reboque</h5>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped mb-0">
                            <thead>
                                <tr>
                                    <th>Placa</th>
                                    <th>RENAVAM</th>
                                    <th>UF</th>
                                    <th>Tara (kg)</th>
                                    <th>Capacidade (kg)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderVeiculosReboque(mdfe.modal_rodoviario.veiculos_reboque)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            `;
        }
        
        // Condutores
        if (mdfe.condutores && mdfe.condutores.length > 0) {
            html += `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Condutores</h5>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped mb-0">
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
            </div>
            `;
        }
    }
    
    // Documentos Vinculados (por município)
    if (mdfe.municipios_descarga && mdfe.municipios_descarga.length > 0) {
        html += `
        <div class="card mb-3">
            <div class="card-header bg-light">
                <h5 class="mb-0">Documentos por Município de Descarga</h5>
            </div>
            <div class="card-body p-0">
                ${renderMunicipiosDescarga(mdfe.municipios_descarga)}
            </div>
        </div>
        `;
    }
    
    // Totais
    if (mdfe.totais) {
        html += `
        <div class="card mb-3">
            <div class="card-header bg-light">
                <h5 class="mb-0">Totais</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Quantidade CT-e:</strong> ${mdfe.totais.q_cte || '0'}</p>
                        <p class="mb-1"><strong>Quantidade NF-e:</strong> ${mdfe.totais.q_nfe || '0'}</p>
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Valor Total Carga:</strong> ${formatCurrency(mdfe.totais.v_carga)}</p>
                        <p class="mb-1"><strong>Peso Total (${getUnidadeMedida(mdfe.totais.c_unid)}):</strong> ${formatNumber(mdfe.totais.q_carga)}</p>
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
                    <p class="mb-1"><strong>Status:</strong> ${getStatusText(mdfe)}</p>
                    <p class="mb-1"><strong>Código Status:</strong> ${mdfe.protocolo?.codigo_status || '--'}</p>
                    <p class="mb-1"><strong>Motivo:</strong> ${mdfe.protocolo?.motivo_status || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p class="mb-1"><strong>Número Protocolo:</strong> ${mdfe.protocolo?.numero_protocolo || '--'}</p>
                    <p class="mb-1"><strong>Data Recebimento:</strong> ${formatDateTime(mdfe.protocolo?.data_recebimento_formatada || mdfe.protocolo?.data_recebimento)}</p>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Cancelamento (if applicable)
    if (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135) {
        html += `
        <div class="card mb-3 border-danger">
            <div class="card-header bg-danger text-white">
                <h5 class="mb-0">Cancelamento</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Data/Hora Evento:</strong> ${formatDateTime(mdfe.cancelamento.dh_evento_formatada || mdfe.cancelamento.dh_evento)}</p>
                        <p class="mb-1"><strong>Protocolo Original:</strong> ${mdfe.cancelamento.n_prot_original || '--'}</p>
                        <p class="mb-1"><strong>Protocolo Cancelamento:</strong> ${mdfe.cancelamento.n_prot_retorno || '--'}</p>
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Justificativa:</strong> ${mdfe.cancelamento.x_just || '--'}</p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
    
    return html;
}

/**
 * Renders municipalities of loading
 * @param {Array} municipios - Array of loading municipalities
 * @returns {string} - Formatted string with municipalities
 */
function renderMunicipiosCarregamento(municipios) {
    if (!municipios || municipios.length === 0) return '--';
    
    return municipios.map(m => m.x_mun_carrega).join(', ');
}

/**
 * Renders reboque vehicles table rows
 * @param {Array} veiculos - Array of reboque vehicles
 * @returns {string} - HTML rows for table
 */
function renderVeiculosReboque(veiculos) {
    if (!veiculos || veiculos.length === 0) {
        return `
        <tr>
            <td colspan="5" class="text-center">Nenhum veículo reboque</td>
        </tr>
        `;
    }
    
    let html = '';
    
    veiculos.forEach(veiculo => {
        html += `
        <tr>
            <td>${veiculo.placa || '--'}</td>
            <td>${veiculo.renavam || '--'}</td>
            <td>${veiculo.uf || '--'}</td>
            <td>${veiculo.tara || '--'}</td>
            <td>${veiculo.cap_kg || '--'}</td>
        </tr>
        `;
    });
    
    return html;
}

/**
 * Renders drivers/conductors table rows
 * @param {Array} condutores - Array of conductors
 * @returns {string} - HTML rows for table
 */
function renderCondutores(condutores) {
    if (!condutores || condutores.length === 0) {
        return `
        <tr>
            <td colspan="2" class="text-center">Nenhum condutor</td>
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
 * Renders municipalities of unloading with linked documents
 * @param {Array} municipios - Array of unloading municipalities with documents
 * @returns {string} - HTML content for municipalities and documents
 */
function renderMunicipiosDescarga(municipios) {
    if (!municipios || municipios.length === 0) {
        return `<div class="text-center p-3">Nenhum município de descarga informado</div>`;
    }
    
    let html = '';
    
    municipios.forEach(municipio => {
        html += `
        <div class="municipality-section mb-3">
            <div class="bg-light p-2">
                <strong>${municipio.x_mun_descarga} (${municipio.c_mun_descarga})</strong>
            </div>
            
            <div class="table-responsive">
                <table class="table table-sm table-striped mb-0">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Chave</th>
                            <th>Reentrega</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderDocumentosVinculados(municipio.docs_vinculados)}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    });
    
    return html;
}

/**
 * Renders linked documents
 * @param {Array} documentos - Array of linked documents
 * @returns {string} - HTML rows for table
 */
function renderDocumentosVinculados(documentos) {
    if (!documentos || documentos.length === 0) {
        return `
        <tr>
            <td colspan="3" class="text-center">Nenhum documento vinculado a este município</td>
        </tr>
        `;
    }
    
    let html = '';
    
    documentos.forEach(doc => {
        const tipoDoc = doc.tipo_doc || 'Desconhecido';
        const reentrega = doc.ind_reentrega ? '<span class="badge bg-warning text-dark">Sim</span>' : 'Não';
        
        html += `
        <tr>
            <td>${tipoDoc}</td>
            <td>${doc.chave_documento || '--'}</td>
            <td>${reentrega}</td>
        </tr>
        `;
    });
    
    return html;
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
            }
        });
    });
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
 * Shows error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    // Create toast notification
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '1080';
    
    const toastHTML = `
    <div class="toast align-items-center text-white bg-danger border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                <i class="fas fa-exclamation-circle me-2"></i> ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>
    `;
    
    toastContainer.innerHTML = toastHTML;
    document.body.appendChild(toastContainer);
    
    const toastElement = toastContainer.querySelector('.toast');
    const toast = new bootstrap.Toast(toastElement, {
        delay: 5000
    });
    
    toast.show();
    
    // Remove toast container when hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        document.body.removeChild(toastContainer);
    });
}

/**
 * Exports table data to CSV file
 */
function exportTableToCSV() {
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa')?.value || '';
    
    // Build API URL with query params for export
    let apiUrl = `/api/mdfes/export/?format=csv`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    
    // Redirect to download
    window.location.href = apiUrl;
}

/**
 * Gets status HTML badge
 * @param {Object} mdfe - MDF-e data
 * @returns {string} - HTML for status badge
 */
function getStatusHTML(mdfe) {
    if (mdfe.cancelado || (mdfe.cancelamento && mdfe.cancelamento.c_stat === 135)) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (mdfe.encerrado) {
        return '<span class="badge bg-primary">Encerrado</span>';
    }
    
    if (mdfe.autorizado || (mdfe.status_code_protocolo === 100)) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    
    if (mdfe.processado) {
        return '<span class="badge bg-info">Processado</span>';
    }
    
    return '<span class="badge bg-warning text-dark">Pendente</span>';
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
 * Gets tipo emissor text
 * @param {number} tpEmit - Tipo emissor code
 * @returns {string} - Tipo emissor description
 */
function getTipoEmissorText(tpEmit) {
    switch (tpEmit) {
        case 1: return 'Prestador de serviço de transporte';
        case 2: return 'Transportador de Carga Própria';
        case 3: return 'Prestador de serviço de transporte que emitirá CT-e Globalizado';
        default: return tpEmit || '--';
    }
}

/**
 * Gets tipo transportador text
 * @param {number} tpTransp - Tipo transportador code
 * @returns {string} - Tipo transportador description
 */
function getTipoTransportadorText(tpTransp) {
    switch (tpTransp) {
        case 1: return 'ETC';
        case 2: return 'TAC';
        case 3: return 'CTC';
        default: return tpTransp || '--';
    }
}

/**
 * Gets tipo rodado text
 * @param {string} tpRod - Tipo rodado code
 * @returns {string} - Tipo rodado description
 */
function getTipoRodadoText(tpRod) {
    switch (tpRod) {
        case '01': return 'Truck';
        case '02': return 'Toco';
        case '03': return 'Cavalo Mecânico';
        case '04': return 'VAN';
        case '05': return 'Utilitário';
        case '06': return 'Outros';
        default: return tpRod || '--';
    }
}

/**
 * Gets unidade de medida text
 * @param {string} cUnid - Código unidade
 * @returns {string} - Unidade de medida description
 */
function getUnidadeMedida(cUnid) {
    switch (cUnid) {
        case '01': return 'KG';
        case '02': return 'TON';
        default: return cUnid || '--';
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
 * Formats date
 * @param {string} dateString - Date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return '--';
    
    try {
        return new Date(dateString).toLocaleDateString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Formats date and time
 * @param {string} dateString - Date string
 * @returns {string} - Formatted date and time
 */
function formatDateTime(dateString) {
    if (!dateString) return '--';
    
    try {
        return new Date(dateString).toLocaleString('pt-BR');
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
 * Format number with thousands separator
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted number
 */
function formatNumber(value, decimals = 2) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value || 0);
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