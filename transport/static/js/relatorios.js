/**
 * relatorios.js
 * Functions for the reports generation panel
 */

// Global variables
let previewData = null;
let currentReportType = null;

/**
 * Initializes the reports page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize dynamic filters
    setupDynamicFilters();
});

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
 * Sets up all event listeners for the page
 */
function setupEventListeners() {
    // Report type change
    document.getElementById('tipo_relatorio').addEventListener('change', handleReportTypeChange);
    
    // Predefined period change
    document.getElementById('periodo').addEventListener('change', handlePeriodChange);
    
    // Generate report button
    document.getElementById('btnGerarRelatorio').addEventListener('click', generateReport);
    
    // Preview report button
    document.getElementById('btnVisualizarPrevia').addEventListener('click', previewReport);
    
    // Download report button
    document.getElementById('btnBaixarRelatorio').addEventListener('click', downloadReport);
    
    // Try again button in error modal
    document.getElementById('btnTryAgain').addEventListener('click', function() {
        bootstrap.Modal.getInstance(document.getElementById('errorModal')).hide();
        generateReport();
    });
    
    // Additional report-specific event listeners
    setupReportSpecificListeners();
}

/**
 * Handles report type change
 */
function handleReportTypeChange() {
    const reportType = document.getElementById('tipo_relatorio').value;
    currentReportType = reportType;
    
    // Hide all detail sections
    document.querySelectorAll('.report-details').forEach(section => {
        section.classList.add('d-none');
    });
    
    // Show selected detail section if available
    if (reportType) {
        const detailSection = document.getElementById(`details_${reportType}`);
        if (detailSection) {
            detailSection.classList.remove('d-none');
        }
    }
    
    // Update dynamic filters
    updateDynamicFilters(reportType);
}

/**
 * Handles predefined period change
 */
function handlePeriodChange() {
    const periodo = document.getElementById('periodo').value;
    const dataInicio = document.getElementById('data_inicio');
    const dataFim = document.getElementById('data_fim');
    
    const today = new Date();
    
    switch (periodo) {
        case 'hoje':
            dataInicio.value = formatDateForInput(today);
            dataFim.value = formatDateForInput(today);
            break;
        case 'ontem':
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            dataInicio.value = formatDateForInput(yesterday);
            dataFim.value = formatDateForInput(yesterday);
            break;
        case '7dias':
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            dataInicio.value = formatDateForInput(sevenDaysAgo);
            dataFim.value = formatDateForInput(today);
            break;
        case '30dias':
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(today.getDate() - 30);
            dataInicio.value = formatDateForInput(thirtyDaysAgo);
            dataFim.value = formatDateForInput(today);
            break;
        case 'mes_atual':
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            dataInicio.value = formatDateForInput(firstDayOfMonth);
            dataFim.value = formatDateForInput(today);
            break;
        case 'mes_anterior':
            const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            dataInicio.value = formatDateForInput(firstDayOfLastMonth);
            dataFim.value = formatDateForInput(lastDayOfLastMonth);
            break;
        case 'ano_atual':
            const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
            dataInicio.value = formatDateForInput(firstDayOfYear);
            dataFim.value = formatDateForInput(today);
            break;
        default:
            // Custom range, don't change anything
            break;
    }
    
    // Disable/enable date fields based on selection
    const isCustom = periodo === '';
    dataInicio.disabled = !isCustom;
    dataFim.disabled = !isCustom;
}

/**
 * Sets up dynamic filters based on report type
 */
function setupDynamicFilters() {
    // Set up payment type change
    document.getElementById('tipo_pagamento')?.addEventListener('change', function() {
        const tipoPagamento = this.value;
        const agregadoFields = document.getElementById('pagamento_agregado_fields');
        const proprioFields = document.getElementById('pagamento_proprio_fields');
        
        if (tipoPagamento === 'agregados') {
            agregadoFields.classList.remove('d-none');
            proprioFields.classList.add('d-none');
        } else if (tipoPagamento === 'proprios') {
            agregadoFields.classList.add('d-none');
            proprioFields.classList.remove('d-none');
        }
    });
    
    // Load vehicles for vehicle-specific reports
    loadVehiclesForReports();
}

/**
 * Updates dynamic filters based on report type
 * @param {string} reportType - Type of report
 */
function updateDynamicFilters(reportType) {
    const filterContainer = document.getElementById('filtros_dinamicos');
    filterContainer.innerHTML = '';
    
    switch (reportType) {
        case 'faturamento':
            // No additional dynamic filters for faturamento
            break;
        case 'veiculos':
            // Add vehicle type filter
            filterContainer.innerHTML = `
                <label for="tipo_veiculo" class="form-label">Tipo de Veículo</label>
                <select class="form-select" id="tipo_veiculo" name="tipo_veiculo">
                    <option value="">Todos</option>
                    <option value="01">Truck</option>
                    <option value="02">Toco</option>
                    <option value="03">Cavalo Mecânico</option>
                    <option value="04">VAN</option>
                    <option value="05">Utilitário</option>
                    <option value="06">Outros</option>
                </select>
            `;
            break;
        case 'ctes':
            // Add UF filter for CT-es
            filterContainer.innerHTML = `
                <label for="uf" class="form-label">UF</label>
                <select class="form-select" id="uf" name="uf">
                    <option value="">Todas</option>
                    <option value="AC">AC</option>
                    <option value="AL">AL</option>
                    <option value="AM">AM</option>
                    <option value="AP">AP</option>
                    <option value="BA">BA</option>
                    <option value="CE">CE</option>
                    <option value="DF">DF</option>
                    <option value="ES">ES</option>
                    <option value="GO">GO</option>
                    <option value="MA">MA</option>
                    <option value="MG">MG</option>
                    <option value="MS">MS</option>
                    <option value="MT">MT</option>
                    <option value="PA">PA</option>
                    <option value="PB">PB</option>
                    <option value="PE">PE</option>
                    <option value="PI">PI</option>
                    <option value="PR">PR</option>
                    <option value="RJ">RJ</option>
                    <option value="RN">RN</option>
                    <option value="RO">RO</option>
                    <option value="RR">RR</option>
                    <option value="RS">RS</option>
                    <option value="SC">SC</option>
                    <option value="SE">SE</option>
                    <option value="SP">SP</option>
                    <option value="TO">TO</option>
                </select>
            `;
            break;
        case 'mdfes':
            // Add encerrado filter for MDF-es
            filterContainer.innerHTML = `
                <label for="encerrado" class="form-label">Encerrado</label>
                <select class="form-select" id="encerrado" name="encerrado">
                    <option value="">Todos</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                </select>
            `;
            break;
        case 'km_rodado':
            // No dynamic filters for km_rodado
            break;
        case 'manutencoes':
            // Add tipo_manutencao filter
            filterContainer.innerHTML = `
                <label for="tipo_manutencao" class="form-label">Tipo</label>
                <select class="form-select" id="tipo_manutencao" name="tipo_manutencao">
                    <option value="">Todos</option>
                    <option value="PREVENTIVA">Preventiva</option>
                    <option value="CORRETIVA">Corretiva</option>
                    <option value="PREDITIVA">Preditiva</option>
                </select>
            `;
            break;
        default:
            // No additional filters for other report types
            break;
    }
}

/**
 * Sets up report-specific event listeners
 */
function setupReportSpecificListeners() {
    // Faturamento report listeners
    document.querySelectorAll('input[name="agrupamento"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const isClienteSelected = this.value === 'cliente';
            document.getElementById('tipo_cliente').disabled = !isClienteSelected;
        });
    });
}

/**
 * Loads vehicles for vehicle selection in reports
 */
function loadVehiclesForReports() {
    const veiculoSelect = document.getElementById('veiculo_id');
    if (!veiculoSelect) return;
    
    // Show loading option
    veiculoSelect.innerHTML = '<option value="">Carregando veículos...</option>';
    
    // Fetch vehicle list
    Auth.fetchWithAuth('/api/veiculos/')
        .then(response => {
            if (!response.ok) throw new Error('Falha ao carregar lista de veículos');
            return response.json();
        })
        .then(data => {
            // Clear loading option
            veiculoSelect.innerHTML = '<option value="">Todos</option>';
            
            // Add vehicles to select
            const veiculos = data.results || data;
            veiculos.forEach(veiculo => {
                const option = document.createElement('option');
                option.value = veiculo.id;
                option.textContent = `${veiculo.placa} - ${veiculo.modelo || 'Sem modelo'}`;
                veiculoSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Erro ao carregar veículos:', error);
            veiculoSelect.innerHTML = '<option value="">Erro ao carregar veículos</option>';
        });
}

/**
 * Validates report form
 * @returns {boolean} True if valid, false otherwise
 */
function validateReportForm() {
    const reportType = document.getElementById('tipo_relatorio').value;
    const format = document.getElementById('formato').value;
    
    if (!reportType) {
        showNotification('Selecione um tipo de relatório.', 'warning');
        return false;
    }
    
    if (!format) {
        showNotification('Selecione um formato para o relatório.', 'warning');
        return false;
    }
    
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    if (!dataInicio || !dataFim) {
        showNotification('Selecione um período para o relatório.', 'warning');
        return false;
    }
    
    return true;
}

/**
 * Collects form data for report
 * @returns {Object} Form data object
 */
function collectReportFormData() {
    const formData = {};
    
    // Basic report parameters
    formData.tipo = document.getElementById('tipo_relatorio').value;
    formData.formato = document.getElementById('formato').value;
    formData.data_inicio = document.getElementById('data_inicio').value;
    formData.data_fim = document.getElementById('data_fim').value;
    
    // Add dynamic parameters based on report type
    switch (formData.tipo) {
        case 'faturamento':
            // Add agrupamento
            formData.agrupamento = document.querySelector('input[name="agrupamento"]:checked')?.value || 'mes';
            // Add tipo_cliente if cliente is selected
            if (formData.agrupamento === 'cliente') {
                formData.tipo_cliente = document.getElementById('tipo_cliente').value;
            }
            // Add modalidade
            formData.modalidade = document.getElementById('modalidade').value;
            break;
        case 'veiculos':
            // Add tipo_proprietario
            formData.tipo_proprietario = document.getElementById('tipo_proprietario').value;
            // Add ativo status
            formData.ativo = document.querySelector('input[name="ativo"]:checked')?.value || '';
            // Add ordenacao
            formData.ordenacao = document.getElementById('ordenacao').value;
            // Add tipo_veiculo from dynamic filters
            formData.tipo_veiculo = document.getElementById('tipo_veiculo')?.value || '';
            break;
        case 'ctes':
            // Add status
            formData.status = document.getElementById('status_cte').value;
            // Add modalidade
            formData.modalidade = document.getElementById('modalidade_cte').value;
            // Add cliente_cnpj
            formData.cliente_cnpj = document.getElementById('cliente_cnpj').value;
            // Add tipo_cliente
            formData.tipo_cliente = document.getElementById('tipo_cliente_cte').value;
            // Add UF from dynamic filters
            formData.uf = document.getElementById('uf')?.value || '';
            break;
        case 'mdfes':
            // Add status
            formData.status = document.getElementById('status_mdfe').value;
            // Add placa
            formData.placa = document.getElementById('placa_mdfe').value;
            // Add encerrado from dynamic filters
            formData.encerrado = document.getElementById('encerrado')?.value || '';
            break;
        case 'pagamentos':
            // Add tipo_pagamento
            formData.tipo = document.getElementById('tipo_pagamento').value;
            // Add status
            formData.status = document.getElementById('status_pagamento').value;
            // Add fields based on pagamento type
            if (formData.tipo === 'agregados') {
                formData.placa = document.getElementById('placa_agregado').value;
                formData.condutor_cpf = document.getElementById('cpf_condutor').value;
            } else if (formData.tipo === 'proprios') {
                formData.veiculo_id = document.getElementById('veiculo_id').value;
                formData.periodo = document.getElementById('periodo_pagamento').value;
            }
            break;
        case 'km_rodado':
            // Add placa
            formData.placa = document.getElementById('placa_km').value;
            // Add agrupamento
            formData.agrupamento = document.getElementById('agrupamento_km').value;
            break;
        case 'manutencoes':
            // Add placa
            formData.placa = document.getElementById('placa_manutencao').value;
            // Add status
            formData.status = document.getElementById('status_manutencao').value;
            // Add ordenacao
            formData.ordenacao = document.getElementById('ordenacao_manutencao').value;
            // Add tipo_manutencao from dynamic filters
            formData.tipo_manutencao = document.getElementById('tipo_manutencao')?.value || '';
            break;
    }
    
    return formData;
}

/**
 * Builds query string from form data
 * @param {Object} formData - Form data object
 * @returns {string} - Query string
 */
function buildQueryString(formData) {
    const params = new URLSearchParams();
    
    // Add all form data to params
    Object.entries(formData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            params.append(key, value);
        }
    });
    
    return params.toString();
}

/**
 * Generates a preview of the report
 */
function previewReport() {
    if (!validateReportForm()) {
        return;
    }
    
    const previewContainer = document.getElementById('preview-container');
    
    // Show loading state
    previewContainer.innerHTML = `
    <div class="d-flex justify-content-center align-items-center py-5">
        <div class="text-center">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <p>Gerando prévia do relatório...</p>
        </div>
    </div>
    `;
    
    // Collect form data
    const formData = collectReportFormData();
    formData.preview = 'true'; // Add preview flag
    
    // Build API URL
    const apiUrl = `/api/relatorios/?${buildQueryString(formData)}`;
    
    // Fetch report preview
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Store preview data for later use
            previewData = data;
            
            // Display preview based on report type
            renderPreview(data, formData.tipo);
        })
        .catch(error => {
            console.error('Erro ao gerar prévia:', error);
            previewContainer.innerHTML = `
            <div class="alert alert-danger m-3">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao gerar prévia do relatório: ${error.message}
            </div>
            `;
        });
}

/**
 * Renders report preview
 * @param {Object} data - Report data
 * @param {string} reportType - Type of report
 */
function renderPreview(data, reportType) {
    const previewContainer = document.getElementById('preview-container');
    
    // Common header for all reports
    let html = `
    <div class="p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5>Prévia do Relatório: ${getReportTypeName(reportType)}</h5>
            <span class="badge bg-primary">${data.total_registros || 0} registro(s)</span>
        </div>
    `;
    
    // Check if there are records
    if (!data.registros || data.registros.length === 0) {
        html += `
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum registro encontrado para os filtros selecionados.
        </div>
        </div>
        `;
        previewContainer.innerHTML = html;
        return;
    }
    
    // Render preview table based on report type
    switch (reportType) {
        case 'faturamento':
            html += renderFaturamentoPreview(data);
            break;
        case 'veiculos':
            html += renderVeiculosPreview(data);
            break;
        case 'ctes':
            html += renderCTEsPreview(data);
            break;
        case 'mdfes':
            html += renderMDFEsPreview(data);
            break;
        case 'pagamentos':
            html += renderPagamentosPreview(data);
            break;
        case 'km_rodado':
            html += renderKmRodadoPreview(data);
            break;
        case 'manutencoes':
            html += renderManutencoesPreview(data);
            break;
        default:
            html += `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Prévia não disponível para este tipo de relatório.
            </div>
            `;
            break;
    }
    
    html += '</div>'; // Close the p-3 div
    
    previewContainer.innerHTML = html;
}

/**
 * Renders faturamento preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderFaturamentoPreview(data) {
    const agrupamento = document.querySelector('input[name="agrupamento"]:checked')?.value || 'mes';
    
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
    `;
    
    // Define columns based on agrupamento
    if (agrupamento === 'mes') {
        html += `
                    <th>Período</th>
                    <th class="text-end">Faturamento</th>
                    <th class="text-end">CIF</th>
                    <th class="text-end">FOB</th>
                    <th class="text-end">Qtd. CT-es</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(registro => {
            html += `
                <tr>
                    <td>${registro.periodo}</td>
                    <td class="text-end">${formatCurrency(registro.faturamento)}</td>
                    <td class="text-end">${formatCurrency(registro.cif)}</td>
                    <td class="text-end">${formatCurrency(registro.fob)}</td>
                    <td class="text-end">${registro.qtd_ctes}</td>
                </tr>
            `;
        });
    } else if (agrupamento === 'dia') {
        html += `
                    <th>Data</th>
                    <th class="text-end">Faturamento</th>
                    <th class="text-end">CIF</th>
                    <th class="text-end">FOB</th>
                    <th class="text-end">Qtd. CT-es</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(registro => {
            html += `
                <tr>
                    <td>${formatDate(registro.data)}</td>
                    <td class="text-end">${formatCurrency(registro.faturamento)}</td>
                    <td class="text-end">${formatCurrency(registro.cif)}</td>
                    <td class="text-end">${formatCurrency(registro.fob)}</td>
                    <td class="text-end">${registro.qtd_ctes}</td>
                </tr>
            `;
        });
    } else if (agrupamento === 'cliente') {
        html += `
                    <th>Cliente</th>
                    <th>CNPJ/CPF</th>
                    <th class="text-end">Faturamento</th>
                    <th class="text-end">Qtd. CT-es</th>
                    <th class="text-end">Valor Médio</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(registro => {
            html += `
                <tr>
                    <td>${registro.cliente}</td>
                    <td>${formatDocument(registro.documento)}</td>
                    <td class="text-end">${formatCurrency(registro.faturamento)}</td>
                    <td class="text-end">${registro.qtd_ctes}</td>
                    <td class="text-end">${formatCurrency(registro.valor_medio)}</td>
                </tr>
            `;
        });
    }
    
    // Add totals row
    html += `
            </tbody>
            <tfoot class="table-success">
                <tr>
                    <td><strong>TOTAL</strong></td>
    `;
    
    if (agrupamento === 'mes' || agrupamento === 'dia') {
        html += `
                    <td class="text-end"><strong>${formatCurrency(data.totais?.faturamento)}</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.cif)}</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.fob)}</strong></td>
                    <td class="text-end"><strong>${data.totais?.qtd_ctes}</strong></td>
        `;
    } else if (agrupamento === 'cliente') {
        html += `
                    <td></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.faturamento)}</strong></td>
                    <td class="text-end"><strong>${data.totais?.qtd_ctes}</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.valor_medio)}</strong></td>
        `;
    }
    
    html += `
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Renders veiculos preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderVeiculosPreview(data) {
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
                    <th>Placa</th>
                    <th>RENAVAM</th>
                    <th>Tipo</th>
                    <th>Proprietário</th>
                    <th>Capacidade</th>
                    <th class="text-center">Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add data rows
    data.registros.forEach(veiculo => {
        const statusHtml = veiculo.ativo ? 
            '<span class="badge bg-success">Ativo</span>' : 
            '<span class="badge bg-secondary">Inativo</span>';
        
        html += `
            <tr>
                <td>${veiculo.placa}</td>
                <td>${veiculo.renavam || '--'}</td>
                <td>${getTipoVeiculo(veiculo.tipo_rodado)}</td>
                <td>${veiculo.proprietario || '--'}</td>
                <td>${veiculo.capacidade_kg ? `${veiculo.capacidade_kg} kg` : '--'}</td>
                <td class="text-center">${statusHtml}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Renders CT-es preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderCTEsPreview(data) {
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
                    <th>Nº CT-e</th>
                    <th>Data Emissão</th>
                    <th>Remetente</th>
                    <th>Destinatário</th>
                    <th class="text-end">Valor</th>
                    <th>Modalidade</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add data rows
    data.registros.forEach(cte => {
        const statusHtml = getStatusHtml(cte.status);
        
        html += `
            <tr>
                <td>${cte.numero_cte || '--'}</td>
                <td>${formatDate(cte.data_emissao)}</td>
                <td>${cte.remetente || '--'}</td>
                <td>${cte.destinatario || '--'}</td>
                <td class="text-end">${formatCurrency(cte.valor_total)}</td>
                <td>${cte.modalidade || '--'}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    });
    
    // Add totals row
    html += `
            </tbody>
            <tfoot class="table-success">
                <tr>
                    <td colspan="4"><strong>TOTAL</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.valor_total)}</strong></td>
                    <td colspan="2"></td>
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Renders MDF-es preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderMDFEsPreview(data) {
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
                    <th>Nº MDF-e</th>
                    <th>Data Emissão</th>
                    <th>UF Origem</th>
                    <th>UF Destino</th>
                    <th>Placa</th>
                    <th>CT-es</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add data rows
    data.registros.forEach(mdfe => {
        const statusHtml = getStatusHtml(mdfe.status);
        
        html += `
            <tr>
                <td>${mdfe.numero_mdfe || '--'}</td>
                <td>${formatDate(mdfe.data_emissao)}</td>
                <td>${mdfe.uf_origem || '--'}</td>
                <td>${mdfe.uf_destino || '--'}</td>
                <td>${mdfe.placa || '--'}</td>
                <td>${mdfe.qtd_ctes || '0'}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    });
    
    // Add totals row
    html += `
            </tbody>
            <tfoot class="table-success">
                <tr>
                    <td colspan="5"><strong>TOTAL</strong></td>
                    <td><strong>${data.totais?.qtd_ctes || 0}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Renders pagamentos preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderPagamentosPreview(data) {
    const tipoPagamento = document.getElementById('tipo_pagamento').value;
    
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
    `;
    
    if (tipoPagamento === 'agregados') {
        html += `
                    <th>Agregado</th>
                    <th>Placa</th>
                    <th>Data Vencimento</th>
                    <th>Referência</th>
                    <th class="text-end">Valor</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(pagamento => {
            const statusHtml = getPagamentoStatusHtml(pagamento.status);
            
            html += `
                <tr>
                    <td>${pagamento.nome_agregado || '--'}</td>
                    <td>${pagamento.placa || '--'}</td>
                    <td>${formatDate(pagamento.data_vencimento)}</td>
                    <td>${pagamento.referencia || '--'}</td>
                    <td class="text-end">${formatCurrency(pagamento.valor)}</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        });
    } else {
        html += `
                    <th>Veículo</th>
                    <th>Período</th>
                    <th>Data Vencimento</th>
                    <th>Descrição</th>
                    <th class="text-end">Valor</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(pagamento => {
            const statusHtml = getPagamentoStatusHtml(pagamento.status);
            
            html += `
                <tr>
                    <td>${pagamento.placa || '--'}</td>
                    <td>${pagamento.periodo || '--'}</td>
                    <td>${formatDate(pagamento.data_vencimento)}</td>
                    <td>${pagamento.descricao || '--'}</td>
                    <td class="text-end">${formatCurrency(pagamento.valor)}</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        });
    }
    
    // Add totals row
    html += `
            </tbody>
            <tfoot class="table-success">
                <tr>
                    <td colspan="4"><strong>TOTAL</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.valor_total)}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Renders km rodado preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderKmRodadoPreview(data) {
    const agrupamento = document.getElementById('agrupamento_km').value;
    
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
    `;
    
    if (agrupamento === 'veiculo') {
        html += `
                    <th>Placa</th>
                    <th>Tipo</th>
                    <th>Proprietário</th>
                    <th class="text-end">KM Rodados</th>
                    <th class="text-end">Viagens</th>
                    <th class="text-end">Média KM/Viagem</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(registro => {
            html += `
                <tr>
                    <td>${registro.placa || '--'}</td>
                    <td>${getTipoVeiculo(registro.tipo_rodado)}</td>
                    <td>${registro.proprietario || '--'}</td>
                    <td class="text-end">${formatNumber(registro.km_rodados, 0)}</td>
                    <td class="text-end">${registro.qtd_viagens}</td>
                    <td class="text-end">${formatNumber(registro.media_km, 0)}</td>
                </tr>
            `;
        });
    } else if (agrupamento === 'mes') {
        html += `
                    <th>Período</th>
                    <th class="text-end">KM Rodados</th>
                    <th class="text-end">Viagens</th>
                    <th class="text-end">Média KM/Viagem</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(registro => {
            html += `
                <tr>
                    <td>${registro.periodo}</td>
                    <td class="text-end">${formatNumber(registro.km_rodados, 0)}</td>
                    <td class="text-end">${registro.qtd_viagens}</td>
                    <td class="text-end">${formatNumber(registro.media_km, 0)}</td>
                </tr>
            `;
        });
    } else if (agrupamento === 'tipo_proprietario') {
        html += `
                    <th>Tipo Proprietário</th>
                    <th class="text-end">KM Rodados</th>
                    <th class="text-end">Viagens</th>
                    <th class="text-end">Média KM/Viagem</th>
                    <th class="text-end">Veículos</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        // Add data rows
        data.registros.forEach(registro => {
            html += `
                <tr>
                    <td>${getTipoProprietario(registro.tipo_proprietario)}</td>
                    <td class="text-end">${formatNumber(registro.km_rodados, 0)}</td>
                    <td class="text-end">${registro.qtd_viagens}</td>
                    <td class="text-end">${formatNumber(registro.media_km, 0)}</td>
                    <td class="text-end">${registro.qtd_veiculos}</td>
                </tr>
            `;
        });
    }
    
    // Add totals row
    html += `
            </tbody>
            <tfoot class="table-success">
                <tr>
    `;
    
    if (agrupamento === 'veiculo') {
        html += `
                    <td colspan="3"><strong>TOTAL</strong></td>
                    <td class="text-end"><strong>${formatNumber(data.totais?.km_rodados, 0)}</strong></td>
                    <td class="text-end"><strong>${data.totais?.qtd_viagens}</strong></td>
                    <td class="text-end"><strong>${formatNumber(data.totais?.media_km, 0)}</strong></td>
        `;
    } else if (agrupamento === 'mes') {
        html += `
                    <td><strong>TOTAL</strong></td>
                    <td class="text-end"><strong>${formatNumber(data.totais?.km_rodados, 0)}</strong></td>
                    <td class="text-end"><strong>${data.totais?.qtd_viagens}</strong></td>
                    <td class="text-end"><strong>${formatNumber(data.totais?.media_km, 0)}</strong></td>
        `;
    } else if (agrupamento === 'tipo_proprietario') {
        html += `
                    <td><strong>TOTAL</strong></td>
                    <td class="text-end"><strong>${formatNumber(data.totais?.km_rodados, 0)}</strong></td>
                    <td class="text-end"><strong>${data.totais?.qtd_viagens}</strong></td>
                    <td class="text-end"><strong>${formatNumber(data.totais?.media_km, 0)}</strong></td>
                    <td class="text-end"><strong>${data.totais?.qtd_veiculos}</strong></td>
        `;
    }
    
    html += `
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Renders manutenções preview
 * @param {Object} data - Report data
 * @returns {string} - HTML for preview
 */
function renderManutencoesPreview(data) {
    let html = `
    <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
            <thead class="table-light">
                <tr>
                    <th>Veículo</th>
                    <th>Data</th>
                    <th>Serviço</th>
                    <th>Oficina</th>
                    <th class="text-end">KM</th>
                    <th class="text-end">Valor Peças</th>
                    <th class="text-end">Valor M.O.</th>
                    <th class="text-end">Valor Total</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add data rows
    data.registros.forEach(manutencao => {
        const statusHtml = getManutencaoStatusHtml(manutencao.status);
        
        html += `
            <tr>
                <td>${manutencao.placa || '--'}</td>
                <td>${formatDate(manutencao.data_servico)}</td>
                <td>${manutencao.servico_realizado || '--'}</td>
                <td>${manutencao.oficina || '--'}</td>
                <td class="text-end">${formatNumber(manutencao.quilometragem, 0)}</td>
                <td class="text-end">${formatCurrency(manutencao.valor_peca)}</td>
                <td class="text-end">${formatCurrency(manutencao.valor_mao_obra)}</td>
                <td class="text-end">${formatCurrency(manutencao.valor_total)}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    });
    
    // Add totals row
    html += `
            </tbody>
            <tfoot class="table-success">
                <tr>
                    <td colspan="5"><strong>TOTAL</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.valor_peca)}</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.valor_mao_obra)}</strong></td>
                    <td class="text-end"><strong>${formatCurrency(data.totais?.valor_total)}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </div>
    `;
    
    return html;
}

/**
 * Generates the full report
 */
function generateReport() {
    if (!validateReportForm()) {
        return;
    }
    
    // Show loading state in submit button
    const btn = document.getElementById('btnGerarRelatorio');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Gerando...';
    
    // Collect form data
    const formData = collectReportFormData();
    
    // Build API URL
    const apiUrl = `/api/relatorios/?${buildQueryString(formData)}`;
    
    // Fetch report
    Auth.fetchWithAuth(apiUrl)
        .then(async response => {
            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            
            // Get format from response headers
            const contentType = response.headers.get('Content-Type');
            let filename = getReportFilename(formData.tipo, formData.formato);
            
            // Handle response based on format
            if (contentType.includes('application/json')) {
                // JSON format
                const data = await response.json();
                showSuccessModal(filename, data, formData.formato);
                return null;
            } else {
                // File format (CSV, XLSX, PDF)
                const blob = await response.blob();
                return { blob, filename };
            }
        })
        .then(fileData => {
            if (fileData) {
                // Download file
                downloadFile(fileData.blob, fileData.filename);
                // Show success modal
                showSuccessModal(fileData.filename);
            }
        })
        .catch(error => {
            console.error('Erro ao gerar relatório:', error);
            showErrorModal(error.message);
        })
        .finally(() => {
            // Restore button state
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
}

/**
 * Downloads the report
 */
function downloadReport() {
    if (!validateReportForm()) {
        return;
    }
    
    // Use same logic as generateReport
    generateReport();
}

/**
 * Shows success modal after report generation
 * @param {string} filename - Filename of the report
 * @param {Object} data - Report data (if JSON format)
 * @param {string} format - Format of the report (if JSON format)
 */
function showSuccessModal(filename, data, format) {
    const modal = document.getElementById('successModal');
    const downloadLink = document.getElementById('downloadLink');
    const relatorioInfo = document.getElementById('relatorio-info');
    
    // Update success modal content
    relatorioInfo.textContent = `O relatório foi gerado com sucesso e está pronto para download: ${filename}`;
    
    if (data && format === 'json') {
        // For JSON format, create a data URL
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = filename;
    } else {
        // For other formats, set up a new download
        downloadLink.addEventListener('click', function(e) {
            e.preventDefault();
            downloadReport();
        });
    }
    
    // Show the modal
    const successModal = new bootstrap.Modal(modal);
    successModal.show();
}

/**
 * Shows error modal after report generation failure
 * @param {string} errorMessage - Error message
 */
function showErrorModal(errorMessage) {
    const modal = document.getElementById('errorModal');
    const errorMessageElement = document.getElementById('error-message');
    
    // Update error modal content
    errorMessageElement.textContent = errorMessage || 'Não foi possível gerar o relatório. Por favor, tente novamente.';
    
    // Show the modal
    const errorModal = new bootstrap.Modal(modal);
    errorModal.show();
}

/**
 * Downloads a file from blob
 * @param {Blob} blob - File blob
 * @param {string} filename - Filename
 */
function downloadFile(blob, filename) {
    // Create object URL
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Gets report type name
 * @param {string} type - Report type
 * @returns {string} - Report type name
 */
function getReportTypeName(type) {
    const reportTypes = {
        'faturamento': 'Faturamento',
        'veiculos': 'Veículos',
        'ctes': 'CT-es',
        'mdfes': 'MDF-es',
        'pagamentos': 'Pagamentos',
        'km_rodado': 'Quilometragem Rodada',
        'manutencoes': 'Manutenções'
    };
    
    return reportTypes[type] || type;
}

/**
 * Gets report filename
 * @param {string} type - Report type
 * @param {string} format - Report format
 * @returns {string} - Filename
 */
function getReportFilename(type, format) {
    const date = new Date();
    const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
    const reportName = getReportTypeName(type).toLowerCase().replace(/ /g, '_');
    
    return `relatorio_${reportName}_${timestamp}.${format}`;
}

/**
 * Gets tipo veículo text
 * @param {string} tipo - Vehicle type code
 * @returns {string} - Vehicle type text
 */
function getTipoVeiculo(tipo) {
    const tipos = {
        '01': 'Truck',
        '02': 'Toco',
        '03': 'Cavalo Mecânico',
        '04': 'VAN',
        '05': 'Utilitário',
        '06': 'Outros'
    };
    
    return tipos[tipo] || tipo || '--';
}

/**
 * Gets tipo proprietário text
 * @param {string} tipo - Owner type code
 * @returns {string} - Owner type text
 */
function getTipoProprietario(tipo) {
    const tipos = {
        '00': 'Próprio',
        '01': 'Terceiro',
        '02': 'Agregado'
    };
    
    return tipos[tipo] || tipo || '--';
}

/**
 * Gets status HTML
 * @param {string} status - Status code
 * @returns {string} - Status HTML
 */
function getStatusHtml(status) {
    if (!status) return '--';
    
    const statusLower = status.toLowerCase();
    
    if (statusLower === 'autorizado' || statusLower === 'encerrado') {
        return `<span class="badge bg-success">${status}</span>`;
    } else if (statusLower === 'cancelado') {
        return `<span class="badge bg-danger">${status}</span>`;
    } else if (statusLower === 'rejeitado') {
        return `<span class="badge bg-warning text-dark">${status}</span>`;
    } else if (statusLower === 'pendente' || statusLower === 'processado') {
        return `<span class="badge bg-info">${status}</span>`;
    } else {
        return `<span class="badge bg-secondary">${status}</span>`;
    }
}

/**
 * Gets pagamento status HTML
 * @param {string} status - Status code
 * @returns {string} - Status HTML
 */
function getPagamentoStatusHtml(status) {
    if (!status) return '--';
    
    const statusLower = status.toLowerCase();
    
    if (statusLower === 'pago') {
        return `<span class="badge bg-success">${status}</span>`;
    } else if (statusLower === 'cancelado') {
        return `<span class="badge bg-danger">${status}</span>`;
    } else if (statusLower === 'atrasado') {
        return `<span class="badge bg-danger">${status}</span>`;
    } else if (statusLower === 'pendente') {
        return `<span class="badge bg-warning text-dark">${status}</span>`;
    } else {
        return `<span class="badge bg-secondary">${status}</span>`;
    }
}

/**
 * Gets manutenção status HTML
 * @param {string} status - Status code
 * @returns {string} - Status HTML
 */
function getManutencaoStatusHtml(status) {
    if (!status) return '--';
    
    const statusMap = {
        'PENDENTE': '<span class="badge bg-warning text-dark">Pendente</span>',
        'AGENDADO': '<span class="badge bg-info">Agendado</span>',
        'PAGO': '<span class="badge bg-success">Pago</span>',
        'CANCELADO': '<span class="badge bg-danger">Cancelado</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Formats number with thousands separator
 * @param {number} number - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted number
 */
function formatNumber(number, decimals = 2) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number || 0);
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
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        const dateObj = new Date(date);
        
        // Check if date is valid
        if (isNaN(dateObj.getTime())) {
            return date; // Return as is if not a valid date
        }
        
        return dateObj.toLocaleDateString('pt-BR');
    } catch (e) {
        return date; // Return as is if error
    }
}

/**
 * Formats CNPJ or CPF based on length
 * @param {string} document - Document number
 * @returns {string} - Formatted document
 */
function formatDocument(document) {
    if (!document) return '--';
    
    // Remove non-digits
    const digits = document.replace(/\D/g, '');
    
    if (digits.length === 11) {
        // Format CPF
        return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    } else if (digits.length === 14) {
        // Format CNPJ
        return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    
    // Return as is if not CPF or CNPJ
    return document;
}