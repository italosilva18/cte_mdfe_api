/**
 * relatorios.js
 * Sistema completo de geração de relatórios
 */

// =============== VARIÁVEIS GLOBAIS ===============
let currentReportData = null;
let currentReportType = null;
let previewChart = null;

// =============== INICIALIZAÇÃO ===============
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sistema de relatórios...');
    
    // Configurar event listeners
    setupEventListeners();
    
    // Configurar datas padrão
    setDefaultDates();
    
    // Carregar dados auxiliares
    loadAuxiliaryData();
});

/**
 * Configurar todos os event listeners
 */
function setupEventListeners() {
    // Seletores principais
    document.getElementById('tipo_relatorio')?.addEventListener('change', onReportTypeChange);
    document.getElementById('periodo')?.addEventListener('change', onPeriodoChange);
    document.getElementById('formato')?.addEventListener('change', onFormatoChange);
    
    // Botões principais
    document.getElementById('btnVisualizarPrevia')?.addEventListener('click', visualizarPrevia);
    document.getElementById('btnBaixarRelatorio')?.addEventListener('click', baixarRelatorio);
    document.getElementById('btnGerarRelatorio')?.addEventListener('click', baixarRelatorio);
    document.getElementById('btnTryAgain')?.addEventListener('click', visualizarPrevia);
    
    // Campos de pagamento
    document.getElementById('tipo_pagamento')?.addEventListener('change', onTipoPagamentoChange);
    
    // Auto preview quando filtros mudam (debounced)
    const debouncedPreview = debounce(autoPreview, 1000);
    document.getElementById('reportFilterForm')?.addEventListener('change', debouncedPreview);
}

/**
 * Configurar datas padrão (mês atual)
 */
function setDefaultDates() {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    const dataInicio = document.getElementById('data_inicio');
    const dataFim = document.getElementById('data_fim');
    
    if (dataInicio) dataInicio.value = formatDateForInput(primeiroDiaMes);
    if (dataFim) dataFim.value = formatDateForInput(ultimoDiaMes);
    
    // Definir período padrão
    const periodo = document.getElementById('periodo');
    if (periodo) periodo.value = 'mes_atual';
}

/**
 * Carregar dados auxiliares (veículos, etc.)
 */
async function loadAuxiliaryData() {
    try {
        // Carregar veículos para os selects
        await loadVeiculosSelect();
    } catch (error) {
        console.error('Erro ao carregar dados auxiliares:', error);
    }
}

// =============== EVENT HANDLERS ===============

/**
 * Mudança no tipo de relatório
 */
function onReportTypeChange() {
    const tipo = document.getElementById('tipo_relatorio').value;
    currentReportType = tipo;
    
    // Ocultar todos os detalhes
    document.querySelectorAll('.report-details').forEach(el => {
        el.classList.add('d-none');
    });
    
    // Mostrar detalhes específicos
    if (tipo) {
        const detailsEl = document.getElementById(`details_${tipo}`);
        if (detailsEl) {
            detailsEl.classList.remove('d-none');
        }
        
        // Configurações específicas por tipo
        configurarTipoRelatorio(tipo);
    }
    
    // Limpar preview
    clearPreview();
}

/**
 * Mudança no período predefinido
 */
function onPeriodoChange() {
    const periodo = document.getElementById('periodo').value;
    const dataInicio = document.getElementById('data_inicio');
    const dataFim = document.getElementById('data_fim');
    
    if (!periodo) return;
    
    const hoje = new Date();
    let inicio, fim;
    
    switch (periodo) {
        case 'hoje':
            inicio = fim = hoje;
            break;
        case 'ontem':
            inicio = fim = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7dias':
            inicio = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
            fim = hoje;
            break;
        case '30dias':
            inicio = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
            fim = hoje;
            break;
        case 'mes_atual':
            inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        case 'mes_anterior':
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
            break;
        case 'ano_atual':
            inicio = new Date(hoje.getFullYear(), 0, 1);
            fim = new Date(hoje.getFullYear(), 11, 31);
            break;
        default:
            return;
    }
    
    if (dataInicio) dataInicio.value = formatDateForInput(inicio);
    if (dataFim) dataFim.value = formatDateForInput(fim);
}

/**
 * Mudança no formato
 */
function onFormatoChange() {
    const formato = document.getElementById('formato').value;
    
    // Mostrar aviso para formatos não implementados
    if (formato === 'xlsx' || formato === 'pdf') {
        showNotification(
            `Formato ${formato.toUpperCase()} ainda não implementado. Será convertido para CSV.`,
            'warning'
        );
    }
}

/**
 * Mudança no tipo de pagamento
 */
function onTipoPagamentoChange() {
    const tipo = document.getElementById('tipo_pagamento').value;
    const agregadoFields = document.getElementById('pagamento_agregado_fields');
    const proprioFields = document.getElementById('pagamento_proprio_fields');
    
    if (tipo === 'proprios') {
        agregadoFields?.classList.add('d-none');
        proprioFields?.classList.remove('d-none');
    } else {
        agregadoFields?.classList.remove('d-none');
        proprioFields?.classList.add('d-none');
    }
}

/**
 * Configurar tipo específico de relatório
 */
function configurarTipoRelatorio(tipo) {
    switch (tipo) {
        case 'faturamento':
            // Configurações específicas para faturamento
            break;
        case 'veiculos':
            // Configurações específicas para veículos
            break;
        case 'ctes':
            // Configurações específicas para CT-es
            break;
        case 'mdfes':
            // Configurações específicas para MDF-es
            break;
        case 'pagamentos':
            // Configurar campos de pagamento
            onTipoPagamentoChange();
            break;
        case 'km_rodado':
            // Configurações específicas para KM
            break;
        case 'manutencoes':
            // Configurações específicas para manutenções
            break;
    }
}

// =============== PREVIEW E VISUALIZAÇÃO ===============

/**
 * Visualizar prévia do relatório
 */
async function visualizarPrevia() {
    const tipo = document.getElementById('tipo_relatorio').value;
    
    if (!tipo) {
        showNotification('Selecione o tipo de relatório', 'warning');
        return;
    }
    
    try {
        showPreviewLoading();
        
        const filtros = getReportFilters();
        const queryString = new URLSearchParams(filtros).toString();
        
        const data = await window.apiClient.get(`/api/relatorios/?tipo=${tipo}&formato=json&${queryString}`);
        currentReportData = data;
        
        renderPreview(data, tipo);
        
    } catch (error) {
        console.error('Erro ao gerar prévia:', error);
        showPreviewError(error.message);
        
        // Mostrar modal de erro para não implementados
        if (error.message.includes('não implementado') || error.message.includes('not implemented')) {
            showNotImplementedModal(tipo);
        }
    }
}

/**
 * Auto preview (debounced)
 */
function autoPreview() {
    const tipo = document.getElementById('tipo_relatorio').value;
    if (tipo) {
        visualizarPrevia();
    }
}

/**
 * Mostrar loading na preview
 */
function showPreviewLoading() {
    const container = document.getElementById('preview-container');
    if (container) {
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center py-5">
                <div class="text-center">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="text-muted">Gerando prévia do relatório...</p>
                </div>
            </div>
        `;
    }
}

/**
 * Mostrar erro na preview
 */
function showPreviewError(mensagem) {
    const container = document.getElementById('preview-container');
    if (container) {
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center py-5">
                <div class="text-center">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <h5 class="text-danger">Erro ao gerar prévia</h5>
                    <p class="text-muted">${mensagem}</p>
                    <button class="btn btn-outline-primary" onclick="visualizarPrevia()">
                        <i class="fas fa-redo me-1"></i>Tentar Novamente
                    </button>
                </div>
            </div>
        `;
    }
}

/**
 * Limpar preview
 */
function clearPreview() {
    const container = document.getElementById('preview-container');
    if (container) {
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center py-5">
                <div class="text-center">
                    <i class="fas fa-file-alt fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Selecione os filtros acima e clique em "Visualizar" para gerar uma prévia do relatório.</p>
                </div>
            </div>
        `;
    }
    currentReportData = null;
}

/**
 * Renderizar preview baseado no tipo e dados
 */
function renderPreview(data, tipo) {
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    // Destruir gráfico anterior se existir
    if (previewChart) {
        previewChart.destroy();
        previewChart = null;
    }
    
    switch (tipo) {
        case 'faturamento':
            renderFaturamentoPreview(data, container);
            break;
        case 'veiculos':
            renderVeiculosPreview(data, container);
            break;
        case 'manutencoes':
            renderManutencoesPreview(data, container);
            break;
        default:
            renderGenericPreview(data, container);
            break;
    }
}

/**
 * Preview para relatório de faturamento
 */
function renderFaturamentoPreview(data, container) {
    if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info m-3">
                <i class="fas fa-info-circle me-2"></i>
                Nenhum dado de faturamento encontrado para o período selecionado.
            </div>
        `;
        return;
    }
    
    // Calcular totais
    const total = data.reduce((sum, item) => sum + (item.valor || 0), 0);
    const meses = data.length;
    const media = total / meses;
    
    container.innerHTML = `
        <div class="p-3">
            <!-- Resumo -->
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card border-primary">
                        <div class="card-body text-center">
                            <i class="fas fa-chart-line fa-2x text-primary mb-2"></i>
                            <h5 class="card-title">Total</h5>
                            <h3 class="text-primary">${formatCurrency(total)}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-success">
                        <div class="card-body text-center">
                            <i class="fas fa-calendar fa-2x text-success mb-2"></i>
                            <h5 class="card-title">Períodos</h5>
                            <h3 class="text-success">${meses}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-info">
                        <div class="card-body text-center">
                            <i class="fas fa-calculator fa-2x text-info mb-2"></i>
                            <h5 class="card-title">Média</h5>
                            <h3 class="text-info">${formatCurrency(media)}</h3>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Gráfico -->
            <div class="mb-4">
                <canvas id="previewChart" style="max-height: 300px;"></canvas>
            </div>
            
            <!-- Tabela -->
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Período</th>
                            <th class="text-end">Valor</th>
                            <th class="text-end">% do Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(item => `
                            <tr>
                                <td><strong>${item.mes || 'N/A'}</strong></td>
                                <td class="text-end">${formatCurrency(item.valor || 0)}</td>
                                <td class="text-end">${((item.valor || 0) / total * 100).toFixed(1)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="table-dark">
                        <tr>
                            <th>Total</th>
                            <th class="text-end">${formatCurrency(total)}</th>
                            <th class="text-end">100.0%</th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
    
    // Renderizar gráfico
    setTimeout(() => renderFaturamentoChart(data), 100);
}

/**
 * Preview para relatório de veículos
 */
function renderVeiculosPreview(data, container) {
    if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info m-3">
                <i class="fas fa-info-circle me-2"></i>
                Nenhum veículo encontrado com os filtros selecionados.
            </div>
        `;
        return;
    }
    
    // Estatísticas
    const total = data.length;
    const ativos = data.filter(v => v.ativo === true).length;
    const inativos = total - ativos;
    const tipos = {};
    
    data.forEach(v => {
        const tipo = getTipoProprietarioName(v.tipo_proprietario);
        tipos[tipo] = (tipos[tipo] || 0) + 1;
    });
    
    container.innerHTML = `
        <div class="p-3">
            <!-- Resumo -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card border-primary">
                        <div class="card-body text-center">
                            <i class="fas fa-truck fa-2x text-primary mb-2"></i>
                            <h5 class="card-title">Total</h5>
                            <h3 class="text-primary">${total}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-success">
                        <div class="card-body text-center">
                            <i class="fas fa-check-circle fa-2x text-success mb-2"></i>
                            <h5 class="card-title">Ativos</h5>
                            <h3 class="text-success">${ativos}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-danger">
                        <div class="card-body text-center">
                            <i class="fas fa-times-circle fa-2x text-danger mb-2"></i>
                            <h5 class="card-title">Inativos</h5>
                            <h3 class="text-danger">${inativos}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-info">
                        <div class="card-body text-center">
                            <i class="fas fa-percentage fa-2x text-info mb-2"></i>
                            <h5 class="card-title">% Ativos</h5>
                            <h3 class="text-info">${((ativos/total)*100).toFixed(1)}%</h3>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Distribuição por tipo -->
            <div class="mb-4">
                <h5>Distribuição por Tipo de Proprietário</h5>
                <div class="row">
                    ${Object.entries(tipos).map(([tipo, count]) => `
                        <div class="col-md-4 mb-2">
                            <div class="bg-light p-2 rounded">
                                <strong>${tipo}:</strong> ${count} veículo(s)
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Tabela (primeiros 10) -->
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Placa</th>
                            <th>Proprietário</th>
                            <th>Tipo</th>
                            <th>Marca/Modelo</th>
                            <th>Capacidade</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.slice(0, 10).map(veiculo => `
                            <tr>
                                <td><span class="badge bg-secondary">${veiculo.placa || 'N/A'}</span></td>
                                <td>${veiculo.proprietario_nome || 'N/A'}</td>
                                <td>${getTipoProprietarioName(veiculo.tipo_proprietario)}</td>
                                <td>${veiculo.marca || 'N/A'} ${veiculo.modelo || ''}</td>
                                <td>${formatNumber(veiculo.capacidade_kg || 0)} kg</td>
                                <td>
                                    <span class="badge bg-${veiculo.ativo ? 'success' : 'danger'}">
                                        ${veiculo.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${data.length > 10 ? `
                    <div class="text-center">
                        <small class="text-muted">Mostrando 10 de ${data.length} veículos. Baixe o relatório completo para ver todos.</small>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Preview para relatório de manutenções
 */
function renderManutencoesPreview(data, container) {
    if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info m-3">
                <i class="fas fa-info-circle me-2"></i>
                Nenhuma manutenção encontrada para o período selecionado.
            </div>
        `;
        return;
    }
    
    // Estatísticas
    const total = data.length;
    const valorTotal = data.reduce((sum, item) => sum + (parseFloat(item.valor_total) || 0), 0);
    const media = valorTotal / total;
    
    const status = {};
    data.forEach(m => {
        const st = m.status || 'N/A';
        status[st] = (status[st] || 0) + 1;
    });
    
    container.innerHTML = `
        <div class="p-3">
            <!-- Resumo -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card border-primary">
                        <div class="card-body text-center">
                            <i class="fas fa-tools fa-2x text-primary mb-2"></i>
                            <h5 class="card-title">Total</h5>
                            <h3 class="text-primary">${total}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-success">
                        <div class="card-body text-center">
                            <i class="fas fa-dollar-sign fa-2x text-success mb-2"></i>
                            <h5 class="card-title">Valor Total</h5>
                            <h3 class="text-success">${formatCurrency(valorTotal)}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-info">
                        <div class="card-body text-center">
                            <i class="fas fa-calculator fa-2x text-info mb-2"></i>
                            <h5 class="card-title">Valor Médio</h5>
                            <h3 class="text-info">${formatCurrency(media)}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-warning">
                        <div class="card-body text-center">
                            <i class="fas fa-wrench fa-2x text-warning mb-2"></i>
                            <h5 class="card-title">Tipos</h5>
                            <h3 class="text-warning">${Object.keys(status).length}</h3>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Distribuição por status -->
            <div class="mb-4">
                <h5>Distribuição por Status</h5>
                <div class="row">
                    ${Object.entries(status).map(([st, count]) => `
                        <div class="col-md-3 mb-2">
                            <div class="bg-light p-2 rounded">
                                <strong>${st}:</strong> ${count} manutenção(ões)
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Tabela (primeiros 10) -->
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Data</th>
                            <th>Veículo</th>
                            <th>Descrição</th>
                            <th>Status</th>
                            <th class="text-end">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.slice(0, 10).map(manutencao => `
                            <tr>
                                <td>${formatDate(manutencao.data_servico)}</td>
                                <td><span class="badge bg-secondary">${manutencao.veiculo_placa || 'N/A'}</span></td>
                                <td>${manutencao.descricao ? manutencao.descricao.substring(0, 50) + '...' : 'N/A'}</td>
                                <td>
                                    <span class="badge bg-${getStatusColor(manutencao.status)}">
                                        ${manutencao.status || 'N/A'}
                                    </span>
                                </td>
                                <td class="text-end">${formatCurrency(manutencao.valor_total || 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="table-dark">
                        <tr>
                            <th colspan="4">Total</th>
                            <th class="text-end">${formatCurrency(valorTotal)}</th>
                        </tr>
                    </tfoot>
                </table>
                ${data.length > 10 ? `
                    <div class="text-center">
                        <small class="text-muted">Mostrando 10 de ${data.length} manutenções. Baixe o relatório completo para ver todas.</small>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Preview genérico para relatórios não implementados
 */
function renderGenericPreview(data, container) {
    if (data.message) {
        container.innerHTML = `
            <div class="alert alert-warning m-3">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Relatório não implementado:</strong> ${data.message}
            </div>
        `;
        return;
    }
    
    // Tentar renderizar dados JSON genéricos
    container.innerHTML = `
        <div class="p-3">
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Preview genérico - dados disponíveis para download
            </div>
            <pre class="bg-light p-3 rounded" style="max-height: 300px; overflow-y: auto;">
${JSON.stringify(data, null, 2)}
            </pre>
        </div>
    `;
}

// =============== DOWNLOAD E GERAÇÃO ===============

/**
 * Baixar relatório
 */
async function baixarRelatorio() {
    const tipo = document.getElementById('tipo_relatorio').value;
    const formato = document.getElementById('formato').value;
    
    if (!tipo) {
        showNotification('Selecione o tipo de relatório', 'warning');
        return;
    }
    
    try {
        const filtros = getReportFilters();
        let finalFormato = formato;
        
        // Converter formatos não implementados para CSV
        if (formato === 'xlsx' || formato === 'pdf') {
            finalFormato = 'csv';
            showNotification(
                `Formato ${formato.toUpperCase()} convertido para CSV automaticamente`,
                'info'
            );
        }
        
        const queryString = new URLSearchParams({
            ...filtros,
            tipo: tipo,
            formato: finalFormato
        }).toString();
        
        // Para JSON, mostrar no preview
        if (finalFormato === 'json') {
            const data = await window.apiClient.get(`/api/relatorios/?${queryString}`);
            renderPreview(data, tipo);
            showNotification('Dados do relatório carregados na prévia', 'success');
            return;
        }
        
        // Para outros formatos, fazer download
        const response = await window.apiClient.request('GET', `/api/relatorios/?${queryString}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_${tipo}_${new Date().toISOString().split('T')[0]}.${finalFormato}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Relatório baixado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao baixar relatório:', error);
        
        // Mostrar modal de erro
        document.getElementById('error-message').textContent = error.message;
        const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
        errorModal.show();
        
        showNotification(`Erro ao gerar relatório: ${error.message}`, 'error');
    }
}

// =============== HELPERS E UTILITÁRIOS ===============

/**
 * Obter filtros do formulário
 */
function getReportFilters() {
    const filtros = {};
    
    // Filtros básicos
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;
    
    if (dataInicio) filtros.data_inicio = dataInicio;
    if (dataFim) filtros.data_fim = dataFim;
    
    // Filtros específicos por tipo
    const tipo = document.getElementById('tipo_relatorio').value;
    
    switch (tipo) {
        case 'veiculos':
            addIfValue(filtros, 'ativo', document.querySelector('input[name="ativo"]:checked')?.value);
            addIfValue(filtros, 'tipo_proprietario', document.getElementById('tipo_proprietario')?.value);
            addIfValue(filtros, 'ordenacao', document.getElementById('ordenacao')?.value);
            break;
            
        case 'ctes':
            addIfValue(filtros, 'status', document.getElementById('status_cte')?.value);
            addIfValue(filtros, 'modalidade', document.getElementById('modalidade_cte')?.value);
            addIfValue(filtros, 'cliente_cnpj', document.getElementById('cliente_cnpj')?.value);
            addIfValue(filtros, 'tipo_cliente', document.getElementById('tipo_cliente_cte')?.value);
            break;
            
        case 'mdfes':
            addIfValue(filtros, 'status', document.getElementById('status_mdfe')?.value);
            addIfValue(filtros, 'placa', document.getElementById('placa_mdfe')?.value);
            break;
            
        case 'pagamentos':
            const tipoPagamento = document.getElementById('tipo_pagamento')?.value;
            addIfValue(filtros, 'tipo', tipoPagamento);
            addIfValue(filtros, 'status', document.getElementById('status_pagamento')?.value);
            
            if (tipoPagamento === 'agregados') {
                addIfValue(filtros, 'placa', document.getElementById('placa_agregado')?.value);
                addIfValue(filtros, 'condutor_cpf', document.getElementById('cpf_condutor')?.value);
            } else if (tipoPagamento === 'proprios') {
                addIfValue(filtros, 'veiculo_id', document.getElementById('veiculo_id')?.value);
                addIfValue(filtros, 'periodo', document.getElementById('periodo_pagamento')?.value);
            }
            break;
            
        case 'km_rodado':
            addIfValue(filtros, 'placa', document.getElementById('placa_km')?.value);
            addIfValue(filtros, 'agrupamento', document.getElementById('agrupamento_km')?.value);
            break;
            
        case 'manutencoes':
            addIfValue(filtros, 'placa', document.getElementById('placa_manutencao')?.value);
            addIfValue(filtros, 'status', document.getElementById('status_manutencao')?.value);
            addIfValue(filtros, 'ordenacao', document.getElementById('ordenacao_manutencao')?.value);
            break;
            
        case 'faturamento':
            addIfValue(filtros, 'agrupamento', document.querySelector('input[name="agrupamento"]:checked')?.value);
            addIfValue(filtros, 'tipo_cliente', document.getElementById('tipo_cliente')?.value);
            addIfValue(filtros, 'modalidade', document.getElementById('modalidade')?.value);
            break;
    }
    
    return filtros;
}

/**
 * Adicionar valor ao objeto se não estiver vazio
 */
function addIfValue(obj, key, value) {
    if (value && value.trim() !== '') {
        obj[key] = value;
    }
}

/**
 * Carregar veículos para selects
 */
async function loadVeiculosSelect() {
    try {
        const data = await window.apiClient.get('/api/veiculos/?ativo=true');
        if (!data) return;
        const veiculos = data.results || data;
        
        const select = document.getElementById('veiculo_id');
        if (select) {
            select.innerHTML = '<option value="">Todos</option>';
            veiculos.forEach(veiculo => {
                const option = document.createElement('option');
                option.value = veiculo.id;
                option.textContent = `${veiculo.placa} - ${veiculo.proprietario_nome || 'Sem proprietário'}`;
                select.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar veículos:', error);
    }
}

/**
 * Mostrar modal para relatórios não implementados
 */
function showNotImplementedModal(tipo) {
    const modal = document.getElementById('errorModal');
    if (modal) {
        document.getElementById('errorModalLabel').textContent = 'Relatório Não Implementado';
        document.getElementById('error-message').innerHTML = `
            O relatório de <strong>${getTipoRelatorioName(tipo)}</strong> ainda não foi implementado.<br>
            <small class="text-muted">Entre em contato com o suporte para mais informações.</small>
        `;
        
        const tryAgainBtn = document.getElementById('btnTryAgain');
        if (tryAgainBtn) {
            tryAgainBtn.style.display = 'none';
        }
        
        const errorModal = new bootstrap.Modal(modal);
        errorModal.show();
    }
}

/**
 * Renderizar gráfico de faturamento
 */
function renderFaturamentoChart(data) {
    const canvas = document.getElementById('previewChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    previewChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.mes || 'N/A'),
            datasets: [{
                label: 'Faturamento',
                data: data.map(item => item.valor || 0),
                backgroundColor: 'rgba(40, 167, 69, 0.8)',
                borderColor: 'rgba(40, 167, 69, 1)',
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
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Faturamento: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Obter nome do tipo de relatório
 */
function getTipoRelatorioName(tipo) {
    const nomes = {
        'faturamento': 'Faturamento',
        'veiculos': 'Veículos',
        'ctes': 'CT-es',
        'mdfes': 'MDF-es',
        'pagamentos': 'Pagamentos',
        'km_rodado': 'Quilometragem Rodada',
        'manutencoes': 'Manutenções'
    };
    return nomes[tipo] || tipo;
}

/**
 * Obter nome do tipo de proprietário
 */
function getTipoProprietarioName(tipo) {
    const tipos = {
        '00': 'Próprio',
        '01': 'Terceiro',
        '02': 'Agregado'
    };
    return tipos[tipo] || 'N/A';
}

/**
 * Obter cor do status
 */
function getStatusColor(status) {
    const cores = {
        'PENDENTE': 'warning',
        'AGENDADO': 'info',
        'PAGO': 'success',
        'CANCELADO': 'danger'
    };
    return cores[status] || 'secondary';
}

// =============== FORMATAÇÃO ===============

/**
 * Formatar data para input
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Formatar data brasileira
 */
function formatDate(dateString) {
    if (!dateString) return '--';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return dateString;
    }
}

/**
 * Formatar moeda
 */
function formatCurrency(value) {
    if (value === null || value === undefined) return 'R$ 0,00';
    const numericValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value);
    if (isNaN(numericValue)) return 'R$ 0,00';
    return numericValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formatar número
 */
function formatNumber(value) {
    if (value === null || value === undefined) return '0';
    const numericValue = Number(value);
    if (isNaN(numericValue)) return '0';
    return numericValue.toLocaleString('pt-BR');
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Mostrar notificação
 */
function showNotification(message, type = 'success', duration = 5000) {
    // Usar a função global se disponível
    if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
        window.showNotification(message, type, duration);
    } else {
        // Fallback simples
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Criar notificação simples no topo da página
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Remover após o tempo especificado
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, duration);
    }
}

// Expor funções globais se necessário
window.visualizarPrevia = visualizarPrevia;
window.baixarRelatorio = baixarRelatorio;