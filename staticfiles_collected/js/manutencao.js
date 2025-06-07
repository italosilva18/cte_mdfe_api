/**
 * manutencao.js
 * Sistema completo de manutenção de veículos
 */

// Variáveis globais
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let currentEditId = null;
let veiculosList = [];
let manutencoesList = [];
let statusChart = null;
let veiculoChart = null;

/**
 * Inicialização quando a página carrega
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando painel de manutenção...');
    
    // Configurar data padrão (últimos 90 dias)
    setDefaultDateRange();
    
    // Carregar dados iniciais
    loadVeiculos();
    loadIndicadores();
    loadGraficos();
    loadManutencoes();
    
    // Configurar event listeners
    setupEventListeners();
});

/**
 * Configurar todas as escutas de eventos
 */
function setupEventListeners() {
    // Botões de filtro
    document.getElementById('btnFiltrar')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnResetFiltros')?.addEventListener('click', resetarFiltros);
    document.getElementById('btnExportar')?.addEventListener('click', exportarCSV);
    
    // Botões de modal
    document.getElementById('btnNewManutencao')?.addEventListener('click', abrirModalNovaManutencao);
    document.getElementById('btnOpenVeiculoModal')?.addEventListener('click', abrirModalNovoVeiculo);
    
    // Botões de salvamento
    document.getElementById('saveManutencao')?.addEventListener('click', salvarManutencao);
    document.getElementById('saveVeiculo')?.addEventListener('click', salvarVeiculo);
    
    // Cálculo automático do valor total
    document.getElementById('valor_peca')?.addEventListener('input', calcularValorTotal);
    document.getElementById('valor_mao_obra')?.addEventListener('input', calcularValorTotal);
    
    // Evento para mudança de veículo no modal
    document.getElementById('veiculo')?.addEventListener('change', mostrarInfoVeiculo);
    
    // Event delegation para botões da tabela
    document.addEventListener('click', function(e) {
        if (e.target.closest('.btn-detail')) {
            const id = e.target.closest('.btn-detail').dataset.id;
            visualizarManutencao(id);
        }
        if (e.target.closest('.btn-edit')) {
            const id = e.target.closest('.btn-edit').dataset.id;
            editarManutencao(id);
        }
        if (e.target.closest('.btn-delete')) {
            const id = e.target.closest('.btn-delete').dataset.id;
            confirmarExclusao(id);
        }
    });
}

/**
 * Configurar intervalo de datas padrão (últimos 90 dias)
 */
function setDefaultDateRange() {
    const hoje = new Date();
    const tresMesesAtras = new Date();
    tresMesesAtras.setDate(hoje.getDate() - 90);
    
    const dataInicio = document.getElementById('data_inicio');
    const dataFim = document.getElementById('data_fim');
    
    if (dataInicio) dataInicio.value = formatDateForInput(tresMesesAtras);
    if (dataFim) dataFim.value = formatDateForInput(hoje);
}

/**
 * Formatar data para input (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Carregar lista de veículos
 */
async function loadVeiculos() {
    try {
        console.log('Carregando veículos...');
        const response = await Auth.fetchWithAuth('/api/veiculos/?ativo=true');
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        veiculosList = data.results || data;
        
        atualizarSelectVeiculos();
        atualizarSelectPlacas();
        
        console.log(`${veiculosList.length} veículos carregados`);
    } catch (error) {
        console.error('Erro ao carregar veículos:', error);
        showNotification('Erro ao carregar lista de veículos', 'error');
    }
}

/**
 * Atualizar select de veículos no modal
 */
function atualizarSelectVeiculos() {
    const select = document.getElementById('veiculo');
    if (!select) return;
    
    // Limpar opções existentes (mantendo a primeira)
    select.innerHTML = '<option value="">Selecione um veículo</option>';
    
    // Adicionar veículos
    veiculosList.forEach(veiculo => {
        const option = document.createElement('option');
        option.value = veiculo.id;
        option.textContent = `${veiculo.placa} - ${veiculo.proprietario_nome || 'Sem proprietário'}`;
        option.dataset.veiculo = JSON.stringify(veiculo);
        select.appendChild(option);
    });
}

/**
 * Atualizar select de placas no filtro
 */
function atualizarSelectPlacas() {
    const select = document.getElementById('placa');
    if (!select) return;
    
    // Limpar opções existentes (mantendo a primeira)
    select.innerHTML = '<option value="">Todas as placas</option>';
    
    // Adicionar placas
    veiculosList.forEach(veiculo => {
        const option = document.createElement('option');
        option.value = veiculo.placa;
        option.textContent = veiculo.placa;
        select.appendChild(option);
    });
}

/**
 * Carregar indicadores do dashboard
 */
async function loadIndicadores() {
    try {
        const params = obterParametrosFiltro();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await Auth.fetchWithAuth(`/api/manutencao/painel/indicadores/?${queryString}`);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        atualizarCardsIndicadores(data);
        
    } catch (error) {
        console.error('Erro ao carregar indicadores:', error);
        showNotification('Erro ao carregar indicadores', 'error');
    }
}

/**
 * Atualizar cards com indicadores
 */
function atualizarCardsIndicadores(data) {
    document.getElementById('total-manutencoes').textContent = data.total_manutencoes || 0;
    document.getElementById('custo-pecas').textContent = formatCurrency(data.total_pecas || 0);
    document.getElementById('custo-mao-obra').textContent = formatCurrency(data.total_mao_obra || 0);
    document.getElementById('custo-total').textContent = formatCurrency(data.valor_total || 0);
}

/**
 * Carregar dados para gráficos
 */
async function loadGraficos() {
    try {
        const params = obterParametrosFiltro();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await Auth.fetchWithAuth(`/api/manutencao/painel/graficos/?${queryString}`);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        renderizarGraficos(data);
        
    } catch (error) {
        console.error('Erro ao carregar gráficos:', error);
        showNotification('Erro ao carregar gráficos', 'error');
    }
}

/**
 * Renderizar gráficos com Chart.js
 */
function renderizarGraficos(data) {
    renderizarGraficoStatus(data.por_status || []);
    renderizarGraficoVeiculos(data.por_veiculo || []);
}

/**
 * Renderizar gráfico de status
 */
function renderizarGraficoStatus(dados) {
    const container = document.getElementById('statusChart');
    if (!container) return;
    
    // Limpar container
    container.innerHTML = '<canvas id="statusChartCanvas"></canvas>';
    const canvas = document.getElementById('statusChartCanvas');
    const ctx = canvas.getContext('2d');
    
    // Destruir gráfico anterior se existir
    if (statusChart) {
        statusChart.destroy();
    }
    
    if (!dados || dados.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted">Nenhum dado disponível</div>';
        return;
    }
    
    const labels = dados.map(item => item.status || 'Indefinido');
    const valores = dados.map(item => item.total || 0);
    const cores = [
        'rgba(255, 193, 7, 0.8)',  // PENDENTE - Amarelo
        'rgba(23, 162, 184, 0.8)', // AGENDADO - Azul
        'rgba(40, 167, 69, 0.8)',  // PAGO - Verde
        'rgba(220, 53, 69, 0.8)'   // CANCELADO - Vermelho
    ];
    
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: cores.slice(0, dados.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed} manutenções`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renderizar gráfico de veículos
 */
function renderizarGraficoVeiculos(dados) {
    const container = document.getElementById('veiculoChart');
    if (!container) return;
    
    // Limpar container
    container.innerHTML = '<canvas id="veiculoChartCanvas"></canvas>';
    const canvas = document.getElementById('veiculoChartCanvas');
    const ctx = canvas.getContext('2d');
    
    // Destruir gráfico anterior se existir
    if (veiculoChart) {
        veiculoChart.destroy();
    }
    
    if (!dados || dados.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted">Nenhum dado disponível</div>';
        return;
    }
    
    // Limitar aos 8 primeiros
    const dadosLimitados = dados.slice(0, 8);
    const labels = dadosLimitados.map(item => item.veiculo__placa || 'N/A');
    const valores = dadosLimitados.map(item => item.valor || 0);
    
    veiculoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Total (R$)',
                data: valores,
                backgroundColor: 'rgba(40, 167, 69, 0.8)',
                borderColor: 'rgba(40, 167, 69, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Valor: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Carregar manutenções com paginação
 */
async function loadManutencoes() {
    try {
        showLoadingTable();
        
        const params = obterParametrosFiltro();
        params.page = currentPage;
        params.page_size = pageSize;
        
        const queryString = new URLSearchParams(params).toString();
        const response = await Auth.fetchWithAuth(`/api/manutencoes/?${queryString}`);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        manutencoesList = data.results || data;
        totalItems = data.count || manutencoesList.length;
        
        renderizarTabelaManutencoes();
        renderizarPaginacao();
        
    } catch (error) {
        console.error('Erro ao carregar manutenções:', error);
        showErrorTable('Erro ao carregar manutenções');
        showNotification('Erro ao carregar manutenções', 'error');
    }
}

/**
 * Obter parâmetros de filtro do formulário
 */
function obterParametrosFiltro() {
    const params = {};
    
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    if (dataInicio) params.data_inicio = dataInicio;
    if (dataFim) params.data_fim = dataFim;
    if (placa) params.placa = placa;
    if (status) params.status = status;
    if (searchText) params.q = searchText;
    
    return params;
}

/**
 * Mostrar loading na tabela
 */
function showLoadingTable() {
    const tbody = document.getElementById('manutencoes-list');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0 text-muted">Carregando dados...</p>
                </td>
            </tr>
        `;
    }
}

/**
 * Mostrar erro na tabela
 */
function showErrorTable(mensagem) {
    const tbody = document.getElementById('manutencoes-list');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-4 text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>${mensagem}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderizar tabela de manutenções
 */
function renderizarTabelaManutencoes() {
    const tbody = document.getElementById('manutencoes-list');
    if (!tbody) return;
    
    if (!manutencoesList || manutencoesList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>Nenhuma manutenção encontrada
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    manutencoesList.forEach(manutencao => {
        const statusClass = getStatusClass(manutencao.status);
        const dataFormatada = formatDate(manutencao.data_servico);
        
        html += `
            <tr>
                <td>
                    <strong>${manutencao.veiculo_placa || 'N/A'}</strong>
                    <br><small class="text-muted">${manutencao.veiculo_proprietario || ''}</small>
                </td>
                <td>${dataFormatada}</td>
                <td>
                    <span title="${manutencao.servico_realizado || ''}">${truncateText(manutencao.servico_realizado || 'N/A', 30)}</span>
                </td>
                <td>${manutencao.oficina || '-'}</td>
                <td>${manutencao.quilometragem ? formatNumber(manutencao.quilometragem) + ' km' : '-'}</td>
                <td class="text-end"><strong>${formatCurrency(manutencao.valor_total || 0)}</strong></td>
                <td>
                    <span class="badge bg-${statusClass}">${manutencao.status || 'N/A'}</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary btn-detail" data-id="${manutencao.id}" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-edit" data-id="${manutencao.id}" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-delete" data-id="${manutencao.id}" title="Excluir">
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
 * Obter classe CSS do status
 */
function getStatusClass(status) {
    const classes = {
        'PENDENTE': 'warning',
        'AGENDADO': 'info',
        'PAGO': 'success',
        'CANCELADO': 'danger'
    };
    return classes[status] || 'secondary';
}

/**
 * Renderizar paginação
 */
function renderizarPaginacao() {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;
    
    const totalPages = Math.ceil(totalItems / pageSize);
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Botão Anterior
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="irParaPagina(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        </li>
    `;
    
    // Páginas
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <button class="page-link" onclick="irParaPagina(${i})">${i}</button>
            </li>
        `;
    }
    
    // Botão Próximo
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="irParaPagina(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </li>
    `;
    
    paginationContainer.innerHTML = html;
}

/**
 * Ir para página específica
 */
function irParaPagina(pagina) {
    if (pagina < 1 || pagina > Math.ceil(totalItems / pageSize)) return;
    currentPage = pagina;
    loadManutencoes();
}

/**
 * Aplicar filtros
 */
function aplicarFiltros() {
    currentPage = 1; // Reset para primeira página
    loadIndicadores();
    loadGraficos();
    loadManutencoes();
}

/**
 * Resetar filtros
 */
function resetarFiltros() {
    document.getElementById('filterForm').reset();
    setDefaultDateRange();
    aplicarFiltros();
}

/**
 * Exportar para CSV
 */
async function exportarCSV() {
    try {
        const params = obterParametrosFiltro();
        const queryString = new URLSearchParams(params).toString();
        
        const response = await Auth.fetchWithAuth(`/api/manutencoes/export/?${queryString}`);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `manutencoes_${new Date().toISOString().split('T')[0]}.csv`;
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
 * Abrir modal de nova manutenção
 */
function abrirModalNovaManutencao() {
    currentEditId = null;
    limparFormularioManutencao();
    document.getElementById('addManutencaoModalLabel').textContent = 'Nova Manutenção';
    
    // Definir data atual
    const hoje = new Date();
    document.getElementById('data_servico').value = formatDateForInput(hoje);
}

/**
 * Abrir modal de novo veículo
 */
function abrirModalNovoVeiculo() {
    limparFormularioVeiculo();
    document.getElementById('addVeiculoModalLabel').textContent = 'Novo Veículo';
}

/**
 * Limpar formulário de manutenção
 */
function limparFormularioManutencao() {
    document.getElementById('manutencaoForm').reset();
    document.getElementById('veiculo_info').innerHTML = '';
    calcularValorTotal(); // Recalcular total
}

/**
 * Limpar formulário de veículo
 */
function limparFormularioVeiculo() {
    document.getElementById('veiculoForm').reset();
    document.getElementById('ativo').checked = true; // Ativo por padrão
}

/**
 * Mostrar informações do veículo selecionado
 */
function mostrarInfoVeiculo() {
    const select = document.getElementById('veiculo');
    const infoContainer = document.getElementById('veiculo_info');
    
    if (!select.value || !infoContainer) return;
    
    const selectedOption = select.selectedOptions[0];
    if (!selectedOption.dataset.veiculo) return;
    
    try {
        const veiculo = JSON.parse(selectedOption.dataset.veiculo);
        
        infoContainer.innerHTML = `
            <div class="card card-body bg-light p-2">
                <small>
                    <strong>Proprietário:</strong> ${veiculo.proprietario_nome || 'N/A'}<br>
                    <strong>Tipo:</strong> ${getTipoProprietarioDisplay(veiculo.tipo_proprietario)}<br>
                    <strong>RNTRC:</strong> ${veiculo.rntrc_proprietario || 'N/A'}
                </small>
            </div>
        `;
    } catch (error) {
        console.error('Erro ao mostrar info do veículo:', error);
        infoContainer.innerHTML = '';
    }
}

/**
 * Obter display do tipo de proprietário
 */
function getTipoProprietarioDisplay(tipo) {
    const tipos = {
        '00': 'Próprio',
        '01': 'Arrendado',
        '02': 'Agregado'
    };
    return tipos[tipo] || 'N/A';
}

/**
 * Calcular valor total automaticamente
 */
function calcularValorTotal() {
    const valorPeca = parseFloat(document.getElementById('valor_peca')?.value || 0);
    const valorMaoObra = parseFloat(document.getElementById('valor_mao_obra')?.value || 0);
    const total = valorPeca + valorMaoObra;
    
    // O valor total é calculado automaticamente no backend
    // Aqui apenas mostramos uma prévia visual
    const servicoField = document.getElementById('servico_realizado');
    if (servicoField && total > 0) {
        servicoField.title = `Total estimado: ${formatCurrency(total)}`;
    }
}

/**
 * Salvar manutenção (criar ou editar)
 */
async function salvarManutencao() {
    try {
        const form = document.getElementById('manutencaoForm');
        const formData = new FormData(form);
        
        // Validar campos obrigatórios
        if (!formData.get('veiculo')) {
            showNotification('Selecione um veículo', 'error');
            return;
        }
        
        if (!formData.get('data_servico')) {
            showNotification('Data do serviço é obrigatória', 'error');
            return;
        }
        
        if (!formData.get('servico_realizado')) {
            showNotification('Descrição do serviço é obrigatória', 'error');
            return;
        }
        
        // Converter FormData para objeto
        const data = {};
        formData.forEach((value, key) => {
            if (value) data[key] = value;
        });
        
        // Definir método e URL
        const isEdit = currentEditId !== null;
        const method = isEdit ? 'PUT' : 'POST';
        const url = isEdit ? `/api/manutencoes/${currentEditId}/` : '/api/manutencoes/';
        
        const response = await Auth.fetchWithAuth(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Erro ${response.status}`);
        }
        
        // Fechar modal e recarregar dados
        const modal = bootstrap.Modal.getInstance(document.getElementById('addManutencaoModal'));
        modal.hide();
        
        showNotification(
            isEdit ? 'Manutenção atualizada com sucesso!' : 'Manutenção cadastrada com sucesso!',
            'success'
        );
        
        // Recarregar dados
        loadIndicadores();
        loadGraficos();
        loadManutencoes();
        
    } catch (error) {
        console.error('Erro ao salvar manutenção:', error);
        showNotification(`Erro ao salvar: ${error.message}`, 'error');
    }
}

/**
 * Salvar veículo
 */
async function salvarVeiculo() {
    try {
        const form = document.getElementById('veiculoForm');
        const formData = new FormData(form);
        
        // Validar placa obrigatória
        if (!formData.get('placa')) {
            showNotification('Placa é obrigatória', 'error');
            return;
        }
        
        // Converter FormData para objeto
        const data = {};
        formData.forEach((value, key) => {
            if (key === 'ativo') {
                data[key] = document.getElementById('ativo').checked;
            } else if (value) {
                data[key] = value;
            }
        });
        
        const response = await Auth.fetchWithAuth('/api/veiculos/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Erro ${response.status}`);
        }
        
        // Fechar modal e recarregar veículos
        const modal = bootstrap.Modal.getInstance(document.getElementById('addVeiculoModal'));
        modal.hide();
        
        showNotification('Veículo cadastrado com sucesso!', 'success');
        
        // Recarregar lista de veículos
        await loadVeiculos();
        
    } catch (error) {
        console.error('Erro ao salvar veículo:', error);
        showNotification(`Erro ao salvar: ${error.message}`, 'error');
    }
}

/**
 * Visualizar detalhes da manutenção
 */
async function visualizarManutencao(id) {
    try {
        const response = await Auth.fetchWithAuth(`/api/manutencoes/${id}/`);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const manutencao = await response.json();
        
        // Montar HTML dos detalhes
        const detailContent = document.getElementById('detailContent');
        detailContent.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="fw-bold text-primary">Informações do Veículo</h6>
                    <p><strong>Placa:</strong> ${manutencao.veiculo_placa || 'N/A'}</p>
                    <p><strong>Proprietário:</strong> ${manutencao.veiculo_proprietario || 'N/A'}</p>
                </div>
                <div class="col-md-6">
                    <h6 class="fw-bold text-primary">Dados do Serviço</h6>
                    <p><strong>Data:</strong> ${formatDate(manutencao.data_servico)}</p>
                    <p><strong>Status:</strong> <span class="badge bg-${getStatusClass(manutencao.status)}">${manutencao.status}</span></p>
                </div>
            </div>
            <hr>
            <div class="row">
                <div class="col-12">
                    <h6 class="fw-bold text-primary">Serviço Realizado</h6>
                    <p>${manutencao.servico_realizado || 'N/A'}</p>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Oficina:</strong> ${manutencao.oficina || 'N/A'}</p>
                    <p><strong>Quilometragem:</strong> ${manutencao.quilometragem ? formatNumber(manutencao.quilometragem) + ' km' : 'N/A'}</p>
                    <p><strong>Peça Utilizada:</strong> ${manutencao.peca_utilizada || 'N/A'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Nota Fiscal:</strong> ${manutencao.nota_fiscal || 'N/A'}</p>
                    <p><strong>Valor Peça:</strong> ${formatCurrency(manutencao.valor_peca || 0)}</p>
                    <p><strong>Valor Mão de Obra:</strong> ${formatCurrency(manutencao.valor_mao_obra || 0)}</p>
                    <p><strong>Valor Total:</strong> <strong>${formatCurrency(manutencao.valor_total || 0)}</strong></p>
                </div>
            </div>
            ${manutencao.observacoes ? `
                <hr>
                <div class="row">
                    <div class="col-12">
                        <h6 class="fw-bold text-primary">Observações</h6>
                        <p>${manutencao.observacoes}</p>
                    </div>
                </div>
            ` : ''}
        `;
        
        // Configurar botão de edição
        document.getElementById('editManutencao').onclick = () => {
            const modal = bootstrap.Modal.getInstance(document.getElementById('detailModal'));
            modal.hide();
            setTimeout(() => editarManutencao(id), 300);
        };
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('detailModal'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        showNotification('Erro ao carregar detalhes da manutenção', 'error');
    }
}

/**
 * Editar manutenção
 */
async function editarManutencao(id) {
    try {
        const response = await Auth.fetchWithAuth(`/api/manutencoes/${id}/`);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const manutencao = await response.json();
        
        // Preencher formulário
        currentEditId = id;
        document.getElementById('addManutencaoModalLabel').textContent = 'Editar Manutenção';
        
        // Preencher campos
        document.getElementById('veiculo').value = manutencao.veiculo || '';
        document.getElementById('data_servico').value = manutencao.data_servico || '';
        document.getElementById('servico_realizado').value = manutencao.servico_realizado || '';
        document.getElementById('oficina').value = manutencao.oficina || '';
        document.getElementById('quilometragem').value = manutencao.quilometragem || '';
        document.getElementById('peca_utilizada').value = manutencao.peca_utilizada || '';
        document.getElementById('nota_fiscal').value = manutencao.nota_fiscal || '';
        document.getElementById('valor_peca').value = manutencao.valor_peca || '0.00';
        document.getElementById('valor_mao_obra').value = manutencao.valor_mao_obra || '0.00';
        document.getElementById('status_manutencao').value = manutencao.status || 'PENDENTE';
        document.getElementById('observacoes').value = manutencao.observacoes || '';
        
        // Mostrar info do veículo
        mostrarInfoVeiculo();
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('addManutencaoModal'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao carregar manutenção para edição:', error);
        showNotification('Erro ao carregar dados para edição', 'error');
    }
}

/**
 * Confirmar exclusão
 */
function confirmarExclusao(id) {
    if (confirm('Tem certeza que deseja excluir esta manutenção? Esta ação não pode ser desfeita.')) {
        excluirManutencao(id);
    }
}

/**
 * Excluir manutenção
 */
async function excluirManutencao(id) {
    try {
        const response = await Auth.fetchWithAuth(`/api/manutencoes/${id}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        showNotification('Manutenção excluída com sucesso!', 'success');
        
        // Recarregar dados
        loadIndicadores();
        loadGraficos();
        loadManutencoes();
        
    } catch (error) {
        console.error('Erro ao excluir manutenção:', error);
        showNotification('Erro ao excluir manutenção', 'error');
    }
}

// ============ FUNÇÕES UTILITÁRIAS ============

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
 * Formatar data
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
 * Truncar texto
 */
function truncateText(text, maxLength) {
    if (!text) return '--';
    const str = String(text);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
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

// Expor funções globais necessárias
window.irParaPagina = irParaPagina;