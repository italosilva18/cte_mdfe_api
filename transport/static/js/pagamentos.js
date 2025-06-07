/**
 * pagamentos.js
 * Sistema completo de gestão de pagamentos (Agregados, Próprios e Faixas KM)
 */

// =============== VARIÁVEIS GLOBAIS ===============
let currentPageAgregados = 1;
let currentPageProprios = 1;
let pageSizeAgregados = 15;
let pageSizeProprios = 15;
let selectedPagamentosAgregados = new Set();
let chartStatusAgregados = null;
let chartTendenciaAgregados = null;
let chartKmProprios = null;
let chartEvolucaoProprios = null;

// =============== INICIALIZAÇÃO ===============
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sistema de pagamentos...');
    
    // Configurar event listeners
    setupEventListeners();
    
    // Carregar dados iniciais
    loadInitialData();
    
    // Configurar abas
    setupTabs();
});

/**
 * Configurar todos os event listeners
 */
function setupEventListeners() {
    // Botões principais
    document.getElementById('btnAtualizarDados')?.addEventListener('click', refreshAllData);
    
    // Agregados
    document.getElementById('btnFiltrarAgregados')?.addEventListener('click', applyFiltersAgregados);
    document.getElementById('btnGerarPagamentosAgregados')?.addEventListener('click', openModalGerarAgregados);
    document.getElementById('btnExportarAgregados')?.addEventListener('click', exportarAgregados);
    document.getElementById('btnMarcarPagoLote')?.addEventListener('click', marcarPagoLote);
    document.getElementById('selectAllAgregados')?.addEventListener('change', toggleSelectAllAgregados);
    
    // Próprios
    document.getElementById('btnFiltrarProprios')?.addEventListener('click', applyFiltersProprios);
    document.getElementById('btnGerarPagamentosProprios')?.addEventListener('click', openModalGerarProprios);
    document.getElementById('btnExportarProprios')?.addEventListener('click', exportarProprios);
    
    // Faixas KM
    document.getElementById('btnNovaFaixa')?.addEventListener('click', openModalNovaFaixa);
    document.getElementById('btnCalcular')?.addEventListener('click', calcularValorFaixa);
    document.getElementById('kmCalculadora')?.addEventListener('input', calcularValorFaixa);
    
    // Modais - Confirmações
    document.getElementById('btnConfirmarGerarAgregados')?.addEventListener('click', confirmarGerarAgregados);
    document.getElementById('btnConfirmarGerarProprios')?.addEventListener('click', confirmarGerarProprios);
    document.getElementById('btnSalvarEdicao')?.addEventListener('click', salvarEdicaoPagamento);
    document.getElementById('btnSalvarFaixa')?.addEventListener('click', salvarFaixa);
    
    // Event delegation para botões dinâmicos
    document.addEventListener('click', handleDynamicButtons);
}

/**
 * Configurar abas
 */
function setupTabs() {
    const tabButtons = document.querySelectorAll('#pagamentosTab button[data-bs-toggle="tab"]');
    tabButtons.forEach(button => {
        button.addEventListener('shown.bs.tab', function(event) {
            const target = event.target.getAttribute('data-bs-target');
            switch(target) {
                case '#agregados':
                    loadPagamentosAgregados();
                    break;
                case '#proprios':
                    loadPagamentosProprios();
                    break;
                case '#faixas':
                    loadFaixasKM();
                    break;
            }
        });
    });
}

/**
 * Carregar dados iniciais
 */
async function loadInitialData() {
    // Carregar na aba ativa (agregados por padrão)
    await loadPagamentosAgregados();
    await loadVeiculosSelect();
    setDefaultDates();
}

/**
 * Configurar datas padrão
 */
function setDefaultDates() {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    // Agregados
    const dataInicioAgregados = document.getElementById('dataInicioAgregados');
    const dataFimAgregados = document.getElementById('dataFimAgregados');
    if (dataInicioAgregados) dataInicioAgregados.value = formatDateForInput(primeiroDiaMes);
    if (dataFimAgregados) dataFimAgregados.value = formatDateForInput(ultimoDiaMes);
    
    // Modal gerar agregados
    const dataInicioGerar = document.getElementById('dataInicioGerar');
    const dataFimGerar = document.getElementById('dataFimGerar');
    const dataPrevistaGerar = document.getElementById('dataPrevistaGerar');
    if (dataInicioGerar) dataInicioGerar.value = formatDateForInput(primeiroDiaMes);
    if (dataFimGerar) dataFimGerar.value = formatDateForInput(ultimoDiaMes);
    if (dataPrevistaGerar) dataPrevistaGerar.value = formatDateForInput(hoje);
    
    // Período próprios (mês atual)
    const periodoProprios = document.getElementById('periodoProprios');
    if (periodoProprios) periodoProprios.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    
    const periodoGerarProprios = document.getElementById('periodoGerarProprios');
    if (periodoGerarProprios) periodoGerarProprios.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

// =============== PAGAMENTOS AGREGADOS ===============

/**
 * Carregar pagamentos agregados
 */
async function loadPagamentosAgregados() {
    try {
        showLoadingAgregados();
        
        const params = getFiltersAgregados();
        params.page = currentPageAgregados;
        params.page_size = pageSizeAgregados;
        
        const queryString = new URLSearchParams(params).toString();
        const response = await window.apiClient.get(`/api/pagamentos/agregados/?${queryString}`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        renderTabelaAgregados(data.results || []);
        renderPaginacaoAgregados(data);
        await updateSummaryAgregados();
        await renderChartsAgregados();
        
    } catch (error) {
        console.error('Erro ao carregar pagamentos agregados:', error);
        showErrorAgregados('Erro ao carregar pagamentos agregados');
        showNotification('Erro ao carregar pagamentos agregados', 'error');
    }
}

/**
 * Obter filtros dos pagamentos agregados
 */
function getFiltersAgregados() {
    const params = {};
    
    const dataInicio = document.getElementById('dataInicioAgregados')?.value;
    const dataFim = document.getElementById('dataFimAgregados')?.value;
    const status = document.getElementById('statusAgregados')?.value;
    const condutor = document.getElementById('condutorAgregados')?.value;
    const placa = document.getElementById('placaAgregados')?.value;
    
    if (dataInicio) params.data_inicio = dataInicio;
    if (dataFim) params.data_fim = dataFim;
    if (status) params.status = status;
    if (condutor) params.q = condutor;
    if (placa) params.placa = placa;
    
    return params;
}

/**
 * Aplicar filtros agregados
 */
function applyFiltersAgregados() {
    currentPageAgregados = 1;
    loadPagamentosAgregados();
}

/**
 * Mostrar loading na tabela agregados
 */
function showLoadingAgregados() {
    const tbody = document.getElementById('tabelaAgregados');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center p-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0 text-muted">Carregando pagamentos...</p>
                </td>
            </tr>
        `;
    }
}

/**
 * Mostrar erro na tabela agregados
 */
function showErrorAgregados(mensagem) {
    const tbody = document.getElementById('tabelaAgregados');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center p-4 text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>${mensagem}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderizar tabela de pagamentos agregados
 */
function renderTabelaAgregados(pagamentos) {
    const tbody = document.getElementById('tabelaAgregados');
    if (!tbody) return;
    
    if (!pagamentos || pagamentos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center p-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>Nenhum pagamento encontrado
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    pagamentos.forEach(pagamento => {
        const statusClass = pagamento.status === 'pago' ? 'success' : 'warning';
        const dataEmissao = formatDate(pagamento.cte_data_emissao);
        const isSelected = selectedPagamentosAgregados.has(pagamento.id);
        
        html += `
            <tr>
                <td>
                    <input type="checkbox" class="form-check-input pagamento-checkbox" 
                           value="${pagamento.id}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>
                    <div>
                        <strong>CT-e ${pagamento.cte_numero || 'N/A'}</strong>
                        <br><small class="text-muted">${pagamento.cte_chave?.substring(0, 8) || 'N/A'}...</small>
                    </div>
                </td>
                <td>${dataEmissao}</td>
                <td>
                    <div>
                        <strong>${pagamento.condutor_nome || 'N/A'}</strong>
                        <br><small class="text-muted">${pagamento.placa || 'N/A'}</small>
                    </div>
                </td>
                <td>${formatCPF(pagamento.condutor_cpf)}</td>
                <td><span class="badge bg-secondary">${pagamento.placa || 'N/A'}</span></td>
                <td class="text-end"><strong>${formatCurrency(pagamento.valor_frete_total || 0)}</strong></td>
                <td class="text-center">${pagamento.percentual_repasse || 0}%</td>
                <td class="text-end text-success"><strong>${formatCurrency(pagamento.valor_repassado || 0)}</strong></td>
                <td>
                    <span class="badge bg-${statusClass}">${pagamento.status || 'pendente'}</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary btn-edit-pagamento" 
                                data-id="${pagamento.id}" data-tipo="agregado" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-delete-pagamento" 
                                data-id="${pagamento.id}" data-tipo="agregado" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Atualizar event listeners dos checkboxes
    updateCheckboxListeners();
}

/**
 * Atualizar listeners dos checkboxes
 */
function updateCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.pagamento-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const id = parseInt(this.value);
            if (this.checked) {
                selectedPagamentosAgregados.add(id);
            } else {
                selectedPagamentosAgregados.delete(id);
            }
            updateBtnMarcarPagoLote();
        });
    });
}

/**
 * Toggle select all agregados
 */
function toggleSelectAllAgregados() {
    const selectAll = document.getElementById('selectAllAgregados');
    const checkboxes = document.querySelectorAll('.pagamento-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        const id = parseInt(checkbox.value);
        if (selectAll.checked) {
            selectedPagamentosAgregados.add(id);
        } else {
            selectedPagamentosAgregados.delete(id);
        }
    });
    
    updateBtnMarcarPagoLote();
}

/**
 * Atualizar botão marcar como pago em lote
 */
function updateBtnMarcarPagoLote() {
    const btn = document.getElementById('btnMarcarPagoLote');
    if (btn) {
        btn.disabled = selectedPagamentosAgregados.size === 0;
    }
}

/**
 * Renderizar paginação agregados
 */
function renderPaginacaoAgregados(data) {
    const container = document.getElementById('paginacaoAgregados');
    if (!container) return;
    
    const totalPages = Math.ceil((data.count || 0) / pageSizeAgregados);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<ul class="pagination pagination-sm justify-content-center mb-0">';
    
    // Anterior
    html += `
        <li class="page-item ${currentPageAgregados === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="goToPageAgregados(${currentPageAgregados - 1})" 
                    ${currentPageAgregados === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        </li>
    `;
    
    // Páginas
    const startPage = Math.max(1, currentPageAgregados - 2);
    const endPage = Math.min(totalPages, currentPageAgregados + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPageAgregados ? 'active' : ''}">
                <button class="page-link" onclick="goToPageAgregados(${i})">${i}</button>
            </li>
        `;
    }
    
    // Próximo
    html += `
        <li class="page-item ${currentPageAgregados === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="goToPageAgregados(${currentPageAgregados + 1})" 
                    ${currentPageAgregados === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </li>
    `;
    
    html += '</ul>';
    container.innerHTML = html;
}

/**
 * Ir para página específica - agregados
 */
function goToPageAgregados(page) {
    const totalPages = Math.ceil(document.querySelectorAll('#tabelaAgregados tr').length / pageSizeAgregados);
    if (page < 1 || page > totalPages) return;
    currentPageAgregados = page;
    loadPagamentosAgregados();
}

/**
 * Atualizar summary agregados
 */
async function updateSummaryAgregados() {
    try {
        const params = getFiltersAgregados();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await window.apiClient.get(`/api/pagamentos/agregados/?${queryString}&page_size=1000`);
        if (false) return;
        
        const data = await response.json();
        const pagamentos = data.results || [];
        
        let totalPendente = 0;
        let totalPago = 0;
        let qtdPendentes = 0;
        let somaPercentual = 0;
        let countPercentual = 0;
        
        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();
        
        pagamentos.forEach(p => {
            if (p.status === 'pendente') {
                totalPendente += parseFloat(p.valor_repassado || 0);
                qtdPendentes++;
            }
            
            // Total pago no mês atual
            if (p.status === 'pago' && p.data_pagamento) {
                const dataPagamento = new Date(p.data_pagamento);
                if (dataPagamento.getMonth() === mesAtual && dataPagamento.getFullYear() === anoAtual) {
                    totalPago += parseFloat(p.valor_repassado || 0);
                }
            }
            
            if (p.percentual_repasse) {
                somaPercentual += parseFloat(p.percentual_repasse);
                countPercentual++;
            }
        });
        
        const percentualMedio = countPercentual > 0 ? (somaPercentual / countPercentual) : 0;
        
        // Atualizar elementos
        document.getElementById('totalPendenteAgregados').textContent = formatCurrency(totalPendente);
        document.getElementById('totalPagoAgregados').textContent = formatCurrency(totalPago);
        document.getElementById('qtdPendentesAgregados').textContent = qtdPendentes;
        document.getElementById('percentualMedioAgregados').textContent = `${percentualMedio.toFixed(1)}%`;
        
    } catch (error) {
        console.error('Erro ao calcular summary agregados:', error);
    }
}

// =============== PAGAMENTOS PRÓPRIOS ===============

/**
 * Carregar pagamentos próprios
 */
async function loadPagamentosProprios() {
    try {
        showLoadingProprios();
        
        const params = getFiltersProprios();
        params.page = currentPageProprios;
        params.page_size = pageSizeProprios;
        
        const queryString = new URLSearchParams(params).toString();
        const response = await window.apiClient.get(`/api/pagamentos/proprios/?${queryString}`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        renderTabelaProprios(data.results || []);
        renderPaginacaoProprios(data);
        await updateSummaryProprios();
        await renderChartsProprios();
        
    } catch (error) {
        console.error('Erro ao carregar pagamentos próprios:', error);
        showErrorProprios('Erro ao carregar pagamentos próprios');
        showNotification('Erro ao carregar pagamentos próprios', 'error');
    }
}

/**
 * Obter filtros dos pagamentos próprios
 */
function getFiltersProprios() {
    const params = {};
    
    const periodo = document.getElementById('periodoProprios')?.value;
    const status = document.getElementById('statusProprios')?.value;
    const veiculo = document.getElementById('veiculoProprios')?.value;
    
    if (periodo) params.periodo = periodo;
    if (status) params.status = status;
    if (veiculo) params.veiculo = veiculo;
    
    return params;
}

/**
 * Aplicar filtros próprios
 */
function applyFiltersProprios() {
    currentPageProprios = 1;
    loadPagamentosProprios();
}

/**
 * Mostrar loading na tabela próprios
 */
function showLoadingProprios() {
    const tbody = document.getElementById('tabelaProprios');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center p-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0 text-muted">Carregando pagamentos...</p>
                </td>
            </tr>
        `;
    }
}

/**
 * Mostrar erro na tabela próprios
 */
function showErrorProprios(mensagem) {
    const tbody = document.getElementById('tabelaProprios');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center p-4 text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>${mensagem}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderizar tabela de pagamentos próprios
 */
function renderTabelaProprios(pagamentos) {
    const tbody = document.getElementById('tabelaProprios');
    if (!tbody) return;
    
    if (!pagamentos || pagamentos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center p-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>Nenhum pagamento encontrado
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    pagamentos.forEach(pagamento => {
        const statusClass = pagamento.status === 'pago' ? 'success' : 'warning';
        const dataPagamento = pagamento.data_pagamento ? formatDate(pagamento.data_pagamento) : '-';
        
        html += `
            <tr>
                <td><strong>${pagamento.periodo || 'N/A'}</strong></td>
                <td>
                    <span class="badge bg-secondary">${pagamento.veiculo_placa || 'N/A'}</span>
                </td>
                <td class="text-end">${formatNumber(pagamento.km_total_periodo || 0)} km</td>
                <td class="text-end">${formatCurrency(pagamento.valor_base_faixa || 0)}</td>
                <td class="text-end">${formatCurrency(pagamento.ajustes || 0)}</td>
                <td class="text-end"><strong>${formatCurrency(pagamento.valor_total_pagar || 0)}</strong></td>
                <td>
                    <span class="badge bg-${statusClass}">${pagamento.status || 'pendente'}</span>
                </td>
                <td>${dataPagamento}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary btn-edit-pagamento" 
                                data-id="${pagamento.id}" data-tipo="proprio" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-delete-pagamento" 
                                data-id="${pagamento.id}" data-tipo="proprio" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renderizar paginação próprios
 */
function renderPaginacaoProprios(data) {
    const container = document.getElementById('paginacaoProprios');
    if (!container) return;
    
    const totalPages = Math.ceil((data.count || 0) / pageSizeProprios);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<ul class="pagination pagination-sm justify-content-center mb-0">';
    
    // Anterior
    html += `
        <li class="page-item ${currentPageProprios === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="goToPageProprios(${currentPageProprios - 1})" 
                    ${currentPageProprios === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        </li>
    `;
    
    // Páginas
    const startPage = Math.max(1, currentPageProprios - 2);
    const endPage = Math.min(totalPages, currentPageProprios + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPageProprios ? 'active' : ''}">
                <button class="page-link" onclick="goToPageProprios(${i})">${i}</button>
            </li>
        `;
    }
    
    // Próximo
    html += `
        <li class="page-item ${currentPageProprios === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="goToPageProprios(${currentPageProprios + 1})" 
                    ${currentPageProprios === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </li>
    `;
    
    html += '</ul>';
    container.innerHTML = html;
}

/**
 * Ir para página específica - próprios
 */
function goToPageProprios(page) {
    const totalPages = Math.ceil(document.querySelectorAll('#tabelaProprios tr').length / pageSizeProprios);
    if (page < 1 || page > totalPages) return;
    currentPageProprios = page;
    loadPagamentosProprios();
}

/**
 * Atualizar summary próprios
 */
async function updateSummaryProprios() {
    try {
        const params = getFiltersProprios();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await window.apiClient.get(`/api/pagamentos/proprios/?${queryString}&page_size=1000`);
        if (false) return;
        
        const data = await response.json();
        const pagamentos = data.results || [];
        
        let totalPendente = 0;
        let totalPago = 0;
        let veiculosAtivos = new Set();
        let totalKm = 0;
        let countKm = 0;
        
        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();
        
        pagamentos.forEach(p => {
            if (p.status === 'pendente') {
                totalPendente += parseFloat(p.valor_total_pagar || 0);
            }
            
            // Total pago no mês atual
            if (p.status === 'pago' && p.data_pagamento) {
                const dataPagamento = new Date(p.data_pagamento);
                if (dataPagamento.getMonth() === mesAtual && dataPagamento.getFullYear() === anoAtual) {
                    totalPago += parseFloat(p.valor_total_pagar || 0);
                }
            }
            
            if (p.veiculo_placa) {
                veiculosAtivos.add(p.veiculo_placa);
            }
            
            if (p.km_total_periodo) {
                totalKm += parseFloat(p.km_total_periodo);
                countKm++;
            }
        });
        
        const kmMedio = countKm > 0 ? (totalKm / countKm) : 0;
        
        // Atualizar elementos
        document.getElementById('totalPendenteProprios').textContent = formatCurrency(totalPendente);
        document.getElementById('totalPagoProprios').textContent = formatCurrency(totalPago);
        document.getElementById('veiculosAtivos').textContent = veiculosAtivos.size;
        document.getElementById('kmMedioProprios').textContent = `${formatNumber(Math.round(kmMedio))} km`;
        
    } catch (error) {
        console.error('Erro ao calcular summary próprios:', error);
    }
}

// =============== FAIXAS KM ===============

/**
 * Carregar faixas KM
 */
async function loadFaixasKM() {
    try {
        const response = await window.apiClient.get('/api/faixas-km/');
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        renderTabelaFaixas(data.results || data);
        
    } catch (error) {
        console.error('Erro ao carregar faixas KM:', error);
        showErrorFaixas('Erro ao carregar faixas KM');
        showNotification('Erro ao carregar faixas KM', 'error');
    }
}

/**
 * Mostrar erro na tabela faixas
 */
function showErrorFaixas(mensagem) {
    const tbody = document.getElementById('tabelaFaixas');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center p-4 text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>${mensagem}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderizar tabela de faixas KM
 */
function renderTabelaFaixas(faixas) {
    const tbody = document.getElementById('tabelaFaixas');
    if (!tbody) return;
    
    if (!faixas || faixas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center p-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>Nenhuma faixa cadastrada
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    faixas.forEach(faixa => {
        const maxKm = faixa.max_km ? formatNumber(faixa.max_km) : 'Acima de';
        
        html += `
            <tr>
                <td>${formatNumber(faixa.min_km || 0)}</td>
                <td>${maxKm}</td>
                <td class="text-end"><strong>${formatCurrency(faixa.valor_pago || 0)}</strong></td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary btn-edit-faixa" 
                                data-id="${faixa.id}" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-delete-faixa" 
                                data-id="${faixa.id}" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Calcular valor da faixa na calculadora
 */
async function calcularValorFaixa() {
    const kmInput = document.getElementById('kmCalculadora');
    const valorElement = document.getElementById('valorCalculado');
    
    if (!kmInput || !valorElement) return;
    
    const km = parseInt(kmInput.value);
    if (!km || km <= 0) {
        valorElement.textContent = 'R$ 0,00';
        return;
    }
    
    try {
        // Buscar faixas para calcular
        const response = await window.apiClient.get('/api/faixas-km/');
        if (false) return;
        
        const data = await response.json();
        const faixas = data.results || data;
        
        // Encontrar faixa aplicável
        let faixaAplicavel = null;
        for (const faixa of faixas) {
            if (km >= faixa.min_km && (faixa.max_km === null || km <= faixa.max_km)) {
                faixaAplicavel = faixa;
                break;
            }
        }
        
        if (faixaAplicavel) {
            valorElement.textContent = formatCurrency(faixaAplicavel.valor_pago);
        } else {
            valorElement.textContent = 'Sem faixa';
        }
        
    } catch (error) {
        console.error('Erro ao calcular valor:', error);
        valorElement.textContent = 'Erro';
    }
}

// =============== MODAIS E AÇÕES ===============

/**
 * Abrir modal gerar agregados
 */
function openModalGerarAgregados() {
    const modal = new bootstrap.Modal(document.getElementById('modalGerarAgregados'));
    modal.show();
}

/**
 * Confirmar gerar agregados
 */
async function confirmarGerarAgregados() {
    try {
        const dataInicio = document.getElementById('dataInicioGerar').value;
        const dataFim = document.getElementById('dataFimGerar').value;
        const percentual = document.getElementById('percentualGerar').value;
        const dataPrevista = document.getElementById('dataPrevistaGerar').value;
        
        if (!dataInicio || !dataFim || !percentual || !dataPrevista) {
            showNotification('Preencha todos os campos obrigatórios', 'error');
            return;
        }
        
        const payload = {
            data_inicio: dataInicio,
            data_fim: dataFim,
            percentual: parseFloat(percentual),
            data_prevista: dataPrevista
        };
        
        const response = await window.apiClient.get('/api/pagamentos/agregados/gerar/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (false) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ${response.status}`);
        }
        
        const result = await response.json();
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('modalGerarAgregados'));
        modal.hide();
        
        // Mostrar resultado
        const mensagem = `Geração concluída: ${result.criados} criados, ${result.erros} erros, ${result.avisos} avisos`;
        showNotification(mensagem, result.criados > 0 ? 'success' : 'warning');
        
        // Recarregar dados
        loadPagamentosAgregados();
        
    } catch (error) {
        console.error('Erro ao gerar pagamentos:', error);
        showNotification(`Erro ao gerar pagamentos: ${error.message}`, 'error');
    }
}

/**
 * Abrir modal gerar próprios
 */
async function openModalGerarProprios() {
    // Carregar veículos no select
    await loadVeiculosSelectGerar();
    
    const modal = new bootstrap.Modal(document.getElementById('modalGerarProprios'));
    modal.show();
}

/**
 * Confirmar gerar próprios
 */
async function confirmarGerarProprios() {
    try {
        const periodo = document.getElementById('periodoGerarProprios').value;
        const veiculosSelect = document.getElementById('veiculosGerarProprios');
        
        if (!periodo) {
            showNotification('Período é obrigatório', 'error');
            return;
        }
        
        let veiculos = 'todos';
        const selectedOptions = Array.from(veiculosSelect.selectedOptions);
        if (selectedOptions.length > 0 && !selectedOptions.some(opt => opt.value === 'todos')) {
            veiculos = selectedOptions.map(opt => opt.value);
        }
        
        const payload = {
            periodo: periodo,
            veiculos: veiculos
        };
        
        const response = await window.apiClient.get('/api/pagamentos/proprios/gerar/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (false) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ${response.status}`);
        }
        
        const result = await response.json();
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('modalGerarProprios'));
        modal.hide();
        
        // Mostrar resultado
        const mensagem = `Geração concluída: ${result.criados} criados, ${result.ignorados} ignorados, ${result.erros} erros`;
        showNotification(mensagem, result.criados > 0 ? 'success' : 'warning');
        
        // Recarregar dados
        loadPagamentosProprios();
        
    } catch (error) {
        console.error('Erro ao gerar pagamentos:', error);
        showNotification(`Erro ao gerar pagamentos: ${error.message}`, 'error');
    }
}

/**
 * Abrir modal nova faixa
 */
function openModalNovaFaixa() {
    // Limpar formulário
    document.getElementById('formFaixa').reset();
    document.getElementById('idFaixa').value = '';
    document.getElementById('tituloModalFaixa').textContent = 'Nova Faixa de KM';
    
    const modal = new bootstrap.Modal(document.getElementById('modalFaixa'));
    modal.show();
}

/**
 * Salvar faixa
 */
async function salvarFaixa() {
    try {
        const id = document.getElementById('idFaixa').value;
        const minKm = document.getElementById('minKmFaixa').value;
        const maxKm = document.getElementById('maxKmFaixa').value;
        const valor = document.getElementById('valorFaixa').value;
        
        if (!minKm || !valor) {
            showNotification('Preencha os campos obrigatórios', 'error');
            return;
        }
        
        const payload = {
            min_km: parseInt(minKm),
            valor_pago: parseFloat(valor)
        };
        
        if (maxKm) {
            payload.max_km = parseInt(maxKm);
        }
        
        const isEdit = id !== '';
        const url = isEdit ? `/api/faixas-km/${id}/` : '/api/faixas-km/';
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await window.apiClient.get(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (false) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Erro ${response.status}`);
        }
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('modalFaixa'));
        modal.hide();
        
        showNotification(
            isEdit ? 'Faixa atualizada com sucesso!' : 'Faixa criada com sucesso!',
            'success'
        );
        
        // Recarregar dados
        loadFaixasKM();
        
    } catch (error) {
        console.error('Erro ao salvar faixa:', error);
        showNotification(`Erro ao salvar faixa: ${error.message}`, 'error');
    }
}

/**
 * Marcar pagamentos como pago em lote
 */
async function marcarPagoLote() {
    if (selectedPagamentosAgregados.size === 0) {
        showNotification('Selecione pelo menos um pagamento', 'warning');
        return;
    }
    
    if (!confirm(`Confirma marcar ${selectedPagamentosAgregados.size} pagamento(s) como PAGO?`)) {
        return;
    }
    
    try {
        const hoje = new Date().toISOString().split('T')[0];
        const updates = [];
        
        for (const id of selectedPagamentosAgregados) {
            const updatePromise = window.apiClient.get(`/api/pagamentos/agregados/${id}/`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    status: 'pago',
                    data_pagamento: hoje
                })
            });
            updates.push(updatePromise);
        }
        
        await Promise.all(updates);
        
        selectedPagamentosAgregados.clear();
        showNotification('Pagamentos marcados como pagos!', 'success');
        loadPagamentosAgregados();
        
    } catch (error) {
        console.error('Erro ao marcar pagamentos:', error);
        showNotification('Erro ao marcar pagamentos como pagos', 'error');
    }
}

/**
 * Exportar agregados
 */
async function exportarAgregados() {
    try {
        const params = getFiltersAgregados();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await window.apiClient.get(`/api/pagamentos/agregados/export/?${queryString}`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pagamentos_agregados_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Exportação realizada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        showNotification('Erro ao exportar dados', 'error');
    }
}

/**
 * Exportar próprios
 */
async function exportarProprios() {
    try {
        const params = getFiltersProprios();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await window.apiClient.get(`/api/pagamentos/proprios/export/?${queryString}`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pagamentos_proprios_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Exportação realizada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        showNotification('Erro ao exportar dados', 'error');
    }
}

// =============== HELPERS E UTILITÁRIOS ===============

/**
 * Handle dynamic buttons
 */
function handleDynamicButtons(event) {
    const target = event.target.closest('button');
    if (!target) return;
    
    if (target.classList.contains('btn-edit-pagamento')) {
        const id = target.dataset.id;
        const tipo = target.dataset.tipo;
        editarPagamento(id, tipo);
    } else if (target.classList.contains('btn-delete-pagamento')) {
        const id = target.dataset.id;
        const tipo = target.dataset.tipo;
        excluirPagamento(id, tipo);
    } else if (target.classList.contains('btn-edit-faixa')) {
        const id = target.dataset.id;
        editarFaixa(id);
    } else if (target.classList.contains('btn-delete-faixa')) {
        const id = target.dataset.id;
        excluirFaixa(id);
    }
}

/**
 * Editar pagamento
 */
async function editarPagamento(id, tipo) {
    try {
        const endpoint = tipo === 'agregado' ? 'agregados' : 'proprios';
        const response = await window.apiClient.get(`/api/pagamentos/${endpoint}/${id}/`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const pagamento = await response.json();
        
        // Preencher modal
        document.getElementById('idPagamentoEditar').value = id;
        document.getElementById('tipoPagamentoEditar').value = tipo;
        document.getElementById('statusEditar').value = pagamento.status || 'pendente';
        document.getElementById('dataPagamentoEditar').value = pagamento.data_pagamento || '';
        document.getElementById('obsEditar').value = pagamento.obs || '';
        
        // Campos específicos
        if (tipo === 'agregado') {
            document.getElementById('camposAgregadoEditar').style.display = 'block';
            document.getElementById('camposProprioEditar').style.display = 'none';
            document.getElementById('percentualEditar').value = pagamento.percentual_repasse || '';
        } else {
            document.getElementById('camposAgregadoEditar').style.display = 'none';
            document.getElementById('camposProprioEditar').style.display = 'block';
            document.getElementById('ajustesEditar').value = pagamento.ajustes || '0.00';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('modalEditarPagamento'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao carregar pagamento:', error);
        showNotification('Erro ao carregar dados do pagamento', 'error');
    }
}

/**
 * Salvar edição de pagamento
 */
async function salvarEdicaoPagamento() {
    try {
        const id = document.getElementById('idPagamentoEditar').value;
        const tipo = document.getElementById('tipoPagamentoEditar').value;
        const status = document.getElementById('statusEditar').value;
        const dataPagamento = document.getElementById('dataPagamentoEditar').value;
        const obs = document.getElementById('obsEditar').value;
        
        const payload = {
            status: status,
            obs: obs
        };
        
        if (dataPagamento) {
            payload.data_pagamento = dataPagamento;
        }
        
        if (tipo === 'agregado') {
            const percentual = document.getElementById('percentualEditar').value;
            if (percentual) {
                payload.percentual_repasse = parseFloat(percentual);
            }
        } else {
            const ajustes = document.getElementById('ajustesEditar').value;
            if (ajustes) {
                payload.ajustes = parseFloat(ajustes);
            }
        }
        
        const endpoint = tipo === 'agregado' ? 'agregados' : 'proprios';
        const response = await window.apiClient.get(`/api/pagamentos/${endpoint}/${id}/`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (false) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Erro ${response.status}`);
        }
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('modalEditarPagamento'));
        modal.hide();
        
        showNotification('Pagamento atualizado com sucesso!', 'success');
        
        // Recarregar dados
        if (tipo === 'agregado') {
            loadPagamentosAgregados();
        } else {
            loadPagamentosProprios();
        }
        
    } catch (error) {
        console.error('Erro ao salvar pagamento:', error);
        showNotification(`Erro ao salvar pagamento: ${error.message}`, 'error');
    }
}

/**
 * Excluir pagamento
 */
async function excluirPagamento(id, tipo) {
    if (!confirm('Tem certeza que deseja excluir este pagamento?')) {
        return;
    }
    
    try {
        const endpoint = tipo === 'agregado' ? 'agregados' : 'proprios';
        const response = await window.apiClient.delete(`/api/pagamentos/${endpoint}/${id}/`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        showNotification('Pagamento excluído com sucesso!', 'success');
        
        // Recarregar dados
        if (tipo === 'agregado') {
            loadPagamentosAgregados();
        } else {
            loadPagamentosProprios();
        }
        
    } catch (error) {
        console.error('Erro ao excluir pagamento:', error);
        showNotification('Erro ao excluir pagamento', 'error');
    }
}

/**
 * Editar faixa
 */
async function editarFaixa(id) {
    try {
        const response = await window.apiClient.get(`/api/faixas-km/${id}/`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const faixa = await response.json();
        
        // Preencher modal
        document.getElementById('idFaixa').value = id;
        document.getElementById('minKmFaixa').value = faixa.min_km || '';
        document.getElementById('maxKmFaixa').value = faixa.max_km || '';
        document.getElementById('valorFaixa').value = faixa.valor_pago || '';
        document.getElementById('tituloModalFaixa').textContent = 'Editar Faixa de KM';
        
        const modal = new bootstrap.Modal(document.getElementById('modalFaixa'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao carregar faixa:', error);
        showNotification('Erro ao carregar dados da faixa', 'error');
    }
}

/**
 * Excluir faixa
 */
async function excluirFaixa(id) {
    if (!confirm('Tem certeza que deseja excluir esta faixa de KM?')) {
        return;
    }
    
    try {
        const response = await window.apiClient.delete(`/api/faixas-km/${id}/`);
        
        if (false) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        showNotification('Faixa excluída com sucesso!', 'success');
        loadFaixasKM();
        
    } catch (error) {
        console.error('Erro ao excluir faixa:', error);
        showNotification('Erro ao excluir faixa', 'error');
    }
}

/**
 * Carregar veículos para select
 */
async function loadVeiculosSelect() {
    try {
        const response = await window.apiClient.get('/api/veiculos/?ativo=true&tipo_proprietario=00');
        if (false) return;
        
        const data = await response.json();
        const veiculos = data.results || data;
        
        const select = document.getElementById('veiculoProprios');
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
 * Carregar veículos para select do modal gerar
 */
async function loadVeiculosSelectGerar() {
    try {
        const response = await window.apiClient.get('/api/veiculos/?ativo=true&tipo_proprietario=00');
        if (false) return;
        
        const data = await response.json();
        const veiculos = data.results || data;
        
        const select = document.getElementById('veiculosGerarProprios');
        if (select) {
            select.innerHTML = '<option value="todos">Todos os Veículos Ativos</option>';
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
 * Refresh all data
 */
function refreshAllData() {
    const activeTab = document.querySelector('#pagamentosTab .nav-link.active');
    if (!activeTab) return;
    
    const target = activeTab.getAttribute('data-bs-target');
    switch(target) {
        case '#agregados':
            loadPagamentosAgregados();
            break;
        case '#proprios':
            loadPagamentosProprios();
            break;
        case '#faixas':
            loadFaixasKM();
            break;
    }
}

// =============== FORMATAÇÃO E UTILITÁRIOS ===============

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
 * Formatar CPF
 */
function formatCPF(cpf) {
    if (!cpf) return 'N/A';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
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
        alert(`[${type.toUpperCase()}] ${message}`);
    }
}

// =============== GRÁFICOS ===============

/**
 * Renderizar gráficos agregados
 */
async function renderChartsAgregados() {
    try {
        const params = getFiltersAgregados();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await window.apiClient.get(`/api/pagamentos/agregados/?${queryString}&page_size=1000`);
        if (false) return;
        
        const data = await response.json();
        const pagamentos = data.results || [];
        
        // Gráfico de status
        renderChartStatusAgregados(pagamentos);
        
        // Gráfico de tendência por mês
        renderChartTendenciaAgregados(pagamentos);
        
    } catch (error) {
        console.error('Erro ao renderizar gráficos agregados:', error);
    }
}

/**
 * Gráfico de status agregados
 */
function renderChartStatusAgregados(pagamentos) {
    const canvas = document.getElementById('chartStatusAgregados');
    if (!canvas) return;
    
    // Destruir gráfico anterior
    if (chartStatusAgregados) {
        chartStatusAgregados.destroy();
    }
    
    // Contar por status
    const statusCount = {
        'pendente': 0,
        'pago': 0
    };
    
    pagamentos.forEach(p => {
        statusCount[p.status] = (statusCount[p.status] || 0) + 1;
    });
    
    const ctx = canvas.getContext('2d');
    chartStatusAgregados = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pendente', 'Pago'],
            datasets: [{
                data: [statusCount.pendente, statusCount.pago],
                backgroundColor: [
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(40, 167, 69, 0.8)'
                ],
                borderColor: [
                    'rgba(255, 193, 7, 1)',
                    'rgba(40, 167, 69, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed} pagamentos`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Gráfico de tendência agregados
 */
function renderChartTendenciaAgregados(pagamentos) {
    const canvas = document.getElementById('chartTendenciaAgregados');
    if (!canvas) return;
    
    // Destruir gráfico anterior
    if (chartTendenciaAgregados) {
        chartTendenciaAgregados.destroy();
    }
    
    // Agrupar por mês
    const meses = {};
    pagamentos.forEach(p => {
        if (p.cte_data_emissao) {
            const data = new Date(p.cte_data_emissao);
            const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
            if (!meses[mesAno]) {
                meses[mesAno] = { count: 0, valor: 0 };
            }
            meses[mesAno].count++;
            meses[mesAno].valor += parseFloat(p.valor_repassado || 0);
        }
    });
    
    // Ordenar por mês
    const labels = Object.keys(meses).sort();
    const counts = labels.map(label => meses[label].count);
    const valores = labels.map(label => meses[label].valor);
    
    const ctx = canvas.getContext('2d');
    chartTendenciaAgregados = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(label => {
                const [ano, mes] = label.split('-');
                return `${mes}/${ano}`;
            }),
            datasets: [{
                label: 'Quantidade',
                data: counts,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                yAxisID: 'y'
            }, {
                label: 'Valor (R$)',
                data: valores,
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Quantidade'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Valor (R$)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
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
                            if (context.datasetIndex === 1) {
                                return `Valor: ${formatCurrency(context.parsed.y)}`;
                            }
                            return `${context.dataset.label}: ${context.parsed.y}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renderizar gráficos próprios
 */
async function renderChartsProprios() {
    try {
        const params = getFiltersProprios();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await window.apiClient.get(`/api/pagamentos/proprios/?${queryString}&page_size=1000`);
        if (false) return;
        
        const data = await response.json();
        const pagamentos = data.results || [];
        
        // Gráfico de KM por veículo
        renderChartKmProprios(pagamentos);
        
        // Gráfico de evolução dos pagamentos
        renderChartEvolucaoProprios(pagamentos);
        
    } catch (error) {
        console.error('Erro ao renderizar gráficos próprios:', error);
    }
}

/**
 * Gráfico de KM por veículo
 */
function renderChartKmProprios(pagamentos) {
    const canvas = document.getElementById('chartKmProprios');
    if (!canvas) return;
    
    // Destruir gráfico anterior
    if (chartKmProprios) {
        chartKmProprios.destroy();
    }
    
    // Agrupar por veículo
    const veiculos = {};
    pagamentos.forEach(p => {
        const placa = p.veiculo_placa;
        if (placa) {
            if (!veiculos[placa]) {
                veiculos[placa] = { km: 0, valor: 0 };
            }
            veiculos[placa].km += parseInt(p.km_total_periodo || 0);
            veiculos[placa].valor += parseFloat(p.valor_total_pagar || 0);
        }
    });
    
    // Pegar top 10 por KM
    const veiculosArray = Object.entries(veiculos)
        .map(([placa, data]) => ({ placa, ...data }))
        .sort((a, b) => b.km - a.km)
        .slice(0, 10);
    
    const labels = veiculosArray.map(v => v.placa);
    const kms = veiculosArray.map(v => v.km);
    
    const ctx = canvas.getContext('2d');
    chartKmProprios = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'KM Total',
                data: kms,
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
                    title: {
                        display: true,
                        text: 'Quilometragem'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value) + ' km';
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `KM: ${formatNumber(context.parsed.y)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Gráfico de evolução dos pagamentos próprios
 */
function renderChartEvolucaoProprios(pagamentos) {
    const canvas = document.getElementById('chartEvolucaoProprios');
    if (!canvas) return;
    
    // Destruir gráfico anterior
    if (chartEvolucaoProprios) {
        chartEvolucaoProprios.destroy();
    }
    
    // Agrupar por período
    const periodos = {};
    pagamentos.forEach(p => {
        const periodo = p.periodo;
        if (periodo) {
            if (!periodos[periodo]) {
                periodos[periodo] = { count: 0, valor: 0 };
            }
            periodos[periodo].count++;
            periodos[periodo].valor += parseFloat(p.valor_total_pagar || 0);
        }
    });
    
    // Ordenar por período
    const labels = Object.keys(periodos).sort();
    const counts = labels.map(label => periodos[label].count);
    const valores = labels.map(label => periodos[label].valor);
    
    const ctx = canvas.getContext('2d');
    chartEvolucaoProprios = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade',
                data: counts,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                yAxisID: 'y'
            }, {
                label: 'Valor (R$)',
                data: valores,
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Período'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Quantidade'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Valor (R$)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
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
                            if (context.datasetIndex === 1) {
                                return `Valor: ${formatCurrency(context.parsed.y)}`;
                            }
                            return `${context.dataset.label}: ${context.parsed.y}`;
                        }
                    }
                }
            }
        }
    });
}

// Expor funções globais necessárias
window.goToPageAgregados = goToPageAgregados;
window.goToPageProprios = goToPageProprios;