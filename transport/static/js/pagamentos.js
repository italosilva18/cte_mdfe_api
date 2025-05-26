// Variáveis globais
let currentPageAgregados = 1;
let currentPageProprios = 1;
let currentPageFaixas = 1;

// Função para carregar pagamentos agregados
async function loadPagamentosAgregados() {
    try {
        const motorista = document.getElementById('filterMotoristaAgregado').value;
        const status = document.getElementById('filterStatusAgregado').value;
        const periodo = document.getElementById('filterPeriodoAgregado').value;
        
        let url = `/api/pagamentos/agregados/?page=${currentPageAgregados}`;
        if (motorista) url += `&motorista=${motorista}`;
        if (status) url += `&status=${status}`;
        if (periodo) url += `&periodo=${periodo}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayPagamentosAgregados(data.results);
            updatePaginationAgregados(data);
            updateSummaryAgregados(data.summary);
        }
    } catch (error) {
        console.error('Erro ao carregar pagamentos agregados:', error);
    }
}

// Função para exibir pagamentos agregados
function displayPagamentosAgregados(pagamentos) {
    const tbody = document.getElementById('tbodyPagamentosAgregados');
    tbody.innerHTML = '';
    
    if (pagamentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum pagamento encontrado</td></tr>';
        return;
    }
    
    pagamentos.forEach(pagamento => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${pagamento.id}">
                </div>
            </td>
            <td>${pagamento.motorista_nome}</td>
            <td>${formatDate(pagamento.periodo_inicio)} - ${formatDate(pagamento.periodo_fim)}</td>
            <td>${pagamento.total_ctes}</td>
            <td>R$ ${formatCurrency(pagamento.valor_frete_total)}</td>
            <td>${pagamento.percentual_motorista}%</td>
            <td>R$ ${formatCurrency(pagamento.valor_motorista)}</td>
            <td>
                <span class="badge bg-${getStatusColor(pagamento.status)}">${pagamento.status}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewPagamentoAgregado(${pagamento.id})">
                    <i class="bi bi-eye"></i>
                </button>
                ${pagamento.status === 'pendente' ? `
                    <button class="btn btn-sm btn-success" onclick="aprovarPagamento(${pagamento.id}, 'agregado')">
                        <i class="bi bi-check"></i>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-info" onclick="exportarComprovante(${pagamento.id}, 'agregado')">
                    <i class="bi bi-download"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Função para carregar pagamentos próprios
async function loadPagamentosProprios() {
    try {
        const veiculo = document.getElementById('filterVeiculoProprio').value;
        const status = document.getElementById('filterStatusProprio').value;
        const periodo = document.getElementById('filterPeriodoProprio').value;
        
        let url = `/api/pagamentos/proprios/?page=${currentPageProprios}`;
        if (veiculo) url += `&veiculo=${veiculo}`;
        if (status) url += `&status=${status}`;
        if (periodo) url += `&periodo=${periodo}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayPagamentosProprios(data.results);
            updatePaginationProprios(data);
            updateSummaryProprios(data.summary);
        }
    } catch (error) {
        console.error('Erro ao carregar pagamentos próprios:', error);
    }
}

// Função para exibir pagamentos próprios
function displayPagamentosProprios(pagamentos) {
    const tbody = document.getElementById('tbodyPagamentosProprios');
    tbody.innerHTML = '';
    
    if (pagamentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum pagamento encontrado</td></tr>';
        return;
    }
    
    pagamentos.forEach(pagamento => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${pagamento.id}">
                </div>
            </td>
            <td>${pagamento.veiculo_placa}</td>
            <td>${pagamento.motorista_nome}</td>
            <td>${formatDate(pagamento.periodo_inicio)} - ${formatDate(pagamento.periodo_fim)}</td>
            <td>${pagamento.total_viagens}</td>
            <td>${formatNumber(pagamento.km_total)} km</td>
            <td>R$ ${formatCurrency(pagamento.valor_por_km)}</td>
            <td>R$ ${formatCurrency(pagamento.valor_total)}</td>
            <td>
                <span class="badge bg-${getStatusColor(pagamento.status)}">${pagamento.status}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewPagamentoProprio(${pagamento.id})">
                    <i class="bi bi-eye"></i>
                </button>
                ${pagamento.status === 'pendente' ? `
                    <button class="btn btn-sm btn-success" onclick="aprovarPagamento(${pagamento.id}, 'proprio')">
                        <i class="bi bi-check"></i>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-info" onclick="exportarComprovante(${pagamento.id}, 'proprio')">
                    <i class="bi bi-download"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Função para carregar faixas de KM
async function loadFaixasKM() {
    try {
        const response = await fetch(`/api/faixas-km/?page=${currentPageFaixas}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayFaixasKM(data.results);
            updatePaginationFaixas(data);
        }
    } catch (error) {
        console.error('Erro ao carregar faixas de KM:', error);
    }
}

// Função para exibir faixas de KM
function displayFaixasKM(faixas) {
    const tbody = document.getElementById('tbodyFaixasKM');
    tbody.innerHTML = '';
    
    if (faixas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma faixa cadastrada</td></tr>';
        return;
    }
    
    faixas.forEach(faixa => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatNumber(faixa.km_inicial)} km</td>
            <td>${formatNumber(faixa.km_final)} km</td>
            <td>R$ ${formatCurrency(faixa.valor_por_km)}</td>
            <td>${faixa.ativo ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editarFaixa(${faixa.id})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="excluirFaixa(${faixa.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Função para atualizar resumo de agregados
function updateSummaryAgregados(summary) {
    document.getElementById('totalPagamentosAgregados').textContent = summary.total_pagamentos || 0;
    document.getElementById('valorTotalAgregados').textContent = `R$ ${formatCurrency(summary.valor_total || 0)}`;
    document.getElementById('pagamentosPendentesAgregados').textContent = summary.pagamentos_pendentes || 0;
    document.getElementById('valorPendenteAgregados').textContent = `R$ ${formatCurrency(summary.valor_pendente || 0)}`;
}

// Função para atualizar resumo de próprios
function updateSummaryProprios(summary) {
    document.getElementById('totalPagamentosProprios').textContent = summary.total_pagamentos || 0;
    document.getElementById('valorTotalProprios').textContent = `R$ ${formatCurrency(summary.valor_total || 0)}`;
    document.getElementById('kmTotalProprios').textContent = `${formatNumber(summary.km_total || 0)} km`;
    document.getElementById('mediaKmProprios').textContent = `R$ ${formatCurrency(summary.media_valor_km || 0)}`;
}

// Funções de paginação
function updatePaginationAgregados(data) {
    // Implementar paginação
}

function updatePaginationProprios(data) {
    // Implementar paginação
}

function updatePaginationFaixas(data) {
    // Implementar paginação
}

// Função para visualizar pagamento agregado
async function viewPagamentoAgregado(id) {
    try {
        const response = await fetch(`/api/pagamentos/agregados/${id}/`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            const pagamento = await response.json();
            // Mostrar modal com detalhes
            showPagamentoDetalhes(pagamento, 'agregado');
        }
    } catch (error) {
        console.error('Erro ao carregar detalhes do pagamento:', error);
    }
}

// Função para visualizar pagamento próprio
async function viewPagamentoProprio(id) {
    try {
        const response = await fetch(`/api/pagamentos/proprios/${id}/`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            const pagamento = await response.json();
            // Mostrar modal com detalhes
            showPagamentoDetalhes(pagamento, 'proprio');
        }
    } catch (error) {
        console.error('Erro ao carregar detalhes do pagamento:', error);
    }
}

// Função para aprovar pagamento
async function aprovarPagamento(id, tipo) {
    if (!confirm('Confirma a aprovação deste pagamento?')) return;
    
    try {
        const url = tipo === 'agregado' ? 
            `/api/pagamentos/agregados/${id}/aprovar/` : 
            `/api/pagamentos/proprios/${id}/aprovar/`;
            
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showNotification('Pagamento aprovado com sucesso', 'success');
            if (tipo === 'agregado') {
                loadPagamentosAgregados();
            } else {
                loadPagamentosProprios();
            }
        } else {
            showNotification('Erro ao aprovar pagamento', 'danger');
        }
    } catch (error) {
        showNotification('Erro ao aprovar pagamento', 'danger');
    }
}

// Função para exportar comprovante
function exportarComprovante(id, tipo) {
    const url = tipo === 'agregado' ? 
        `/api/pagamentos/agregados/${id}/comprovante/` : 
        `/api/pagamentos/proprios/${id}/comprovante/`;
    
    window.open(url, '_blank');
}

// Função para editar faixa
async function editarFaixa(id) {
    try {
        const response = await fetch(`/api/faixas-km/${id}/`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            const faixa = await response.json();
            document.getElementById('faixaId').value = faixa.id;
            document.getElementById('kmInicial').value = faixa.km_inicial;
            document.getElementById('kmFinal').value = faixa.km_final;
            document.getElementById('valorKM').value = faixa.valor_por_km;
            document.getElementById('modalFaixaKMLabel').textContent = 'Editar Faixa de KM';
            
            const modal = new bootstrap.Modal(document.getElementById('modalFaixaKM'));
            modal.show();
        }
    } catch (error) {
        console.error('Erro ao carregar faixa:', error);
    }
}

// Função para excluir faixa
async function excluirFaixa(id) {
    if (!confirm('Confirma a exclusão desta faixa?')) return;
    
    try {
        const response = await fetch(`/api/faixas-km/${id}/`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (response.ok) {
            showNotification('Faixa excluída com sucesso', 'success');
            loadFaixasKM();
        } else {
            showNotification('Erro ao excluir faixa', 'danger');
        }
    } catch (error) {
        showNotification('Erro ao excluir faixa', 'danger');
    }
}

// Função para exportar pagamentos
function exportarPagamentos(tipo) {
    let url = tipo === 'agregados' ? '/api/pagamentos/agregados/export/' : '/api/pagamentos/proprios/export/';
    
    // Adicionar filtros à URL
    if (tipo === 'agregados') {
        const motorista = document.getElementById('filterMotoristaAgregado').value;
        const status = document.getElementById('filterStatusAgregado').value;
        const periodo = document.getElementById('filterPeriodoAgregado').value;
        
        const params = new URLSearchParams();
        if (motorista) params.append('motorista', motorista);
        if (status) params.append('status', status);
        if (periodo) params.append('periodo', periodo);
        
        if (params.toString()) url += '?' + params.toString();
    } else {
        const veiculo = document.getElementById('filterVeiculoProprio').value;
        const status = document.getElementById('filterStatusProprio').value;
        const periodo = document.getElementById('filterPeriodoProprio').value;
        
        const params = new URLSearchParams();
        if (veiculo) params.append('veiculo', veiculo);
        if (status) params.append('status', status);
        if (periodo) params.append('periodo', periodo);
        
        if (params.toString()) url += '?' + params.toString();
    }
    
    window.open(url, '_blank');
}

// Funções auxiliares
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

function formatCurrency(value) {
    return parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value) {
    return parseFloat(value).toLocaleString('pt-BR');
}

function getStatusColor(status) {
    const colors = {
        'pendente': 'warning',
        'aprovado': 'success',
        'pago': 'info',
        'cancelado': 'danger'
    };
    return colors[status] || 'secondary';
}

// Função para mostrar detalhes do pagamento
function showPagamentoDetalhes(pagamento, tipo) {
    // Implementar modal de detalhes
    const modalContent = tipo === 'agregado' ? 
        `<h5>Pagamento Agregado</h5>
         <p><strong>Motorista:</strong> ${pagamento.motorista_nome}</p>
         <p><strong>Período:</strong> ${formatDate(pagamento.periodo_inicio)} - ${formatDate(pagamento.periodo_fim)}</p>
         <p><strong>Total CTes:</strong> ${pagamento.total_ctes}</p>
         <p><strong>Valor Frete Total:</strong> R$ ${formatCurrency(pagamento.valor_frete_total)}</p>
         <p><strong>Percentual:</strong> ${pagamento.percentual_motorista}%</p>
         <p><strong>Valor Motorista:</strong> R$ ${formatCurrency(pagamento.valor_motorista)}</p>
         <p><strong>Status:</strong> ${pagamento.status}</p>` :
        `<h5>Pagamento Próprio</h5>
         <p><strong>Veículo:</strong> ${pagamento.veiculo_placa}</p>
         <p><strong>Motorista:</strong> ${pagamento.motorista_nome}</p>
         <p><strong>Período:</strong> ${formatDate(pagamento.periodo_inicio)} - ${formatDate(pagamento.periodo_fim)}</p>
         <p><strong>Total Viagens:</strong> ${pagamento.total_viagens}</p>
         <p><strong>KM Total:</strong> ${formatNumber(pagamento.km_total)} km</p>
         <p><strong>Valor por KM:</strong> R$ ${formatCurrency(pagamento.valor_por_km)}</p>
         <p><strong>Valor Total:</strong> R$ ${formatCurrency(pagamento.valor_total)}</p>
         <p><strong>Status:</strong> ${pagamento.status}</p>`;
    
    // Criar e mostrar modal
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = `
        <div class="modal fade" id="modalDetalhes" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Detalhes do Pagamento</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${modalContent}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);
    
    const modal = new bootstrap.Modal(document.getElementById('modalDetalhes'));
    modal.show();
    
    // Remover modal após fechar
    document.getElementById('modalDetalhes').addEventListener('hidden.bs.modal', function() {
        modalDiv.remove();
    });
}

// Função para processar pagamentos em lote
async function processarPagamentosLote(tipo, acao) {
    const checkboxes = document.querySelectorAll(`#tbody${tipo === 'agregados' ? 'PagamentosAgregados' : 'PagamentosProprios'} input[type="checkbox"]:checked`);
    const ids = Array.from(checkboxes).map(cb => cb.value);
    
    if (ids.length === 0) {
        showNotification('Selecione pelo menos um pagamento', 'warning');
        return;
    }
    
    if (!confirm(`Confirma ${acao} de ${ids.length} pagamento(s)?`)) return;
    
    try {
        const url = `/api/pagamentos/${tipo}/lote/${acao}/`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ ids: ids })
        });
        
        if (response.ok) {
            showNotification(`Pagamentos processados com sucesso`, 'success');
            if (tipo === 'agregados') {
                loadPagamentosAgregados();
            } else {
                loadPagamentosProprios();
            }
        } else {
            showNotification('Erro ao processar pagamentos', 'danger');
        }
    } catch (error) {
        showNotification('Erro ao processar pagamentos', 'danger');
    }
}

// Função para mostrar notificações
function showNotification(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Inicializar quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Configurar event listeners para as abas
    const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
    tabButtons.forEach(button => {
        button.addEventListener('shown.bs.tab', function(event) {
            const target = event.target.getAttribute('data-bs-target');
            if (target === '#agregados') {
                loadPagamentosAgregados();
            } else if (target === '#proprios') {
                loadPagamentosProprios();
            } else if (target === '#configuracao') {
                loadFaixasKM();
            }
        });
    });
    
    // Carregar a primeira aba
    loadPagamentosAgregados();
    
    // Event listeners para filtros de Agregados
    document.getElementById('filterMotoristaAgregado').addEventListener('change', loadPagamentosAgregados);
    document.getElementById('filterStatusAgregado').addEventListener('change', loadPagamentosAgregados);
    document.getElementById('filterPeriodoAgregado').addEventListener('change', loadPagamentosAgregados);
    
    // Event listeners para filtros de Próprios
    document.getElementById('filterVeiculoProprio').addEventListener('change', loadPagamentosProprios);
    document.getElementById('filterStatusProprio').addEventListener('change', loadPagamentosProprios);
    document.getElementById('filterPeriodoProprio').addEventListener('change', loadPagamentosProprios);
    
    // Event listener para gerar pagamentos agregados
    document.getElementById('btnGerarPagamentosAgregados').addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('modalGerarPagamentoAgregado'));
        modal.show();
    });
    
    // Event listener para gerar pagamentos próprios
    document.getElementById('btnGerarPagamentosProprios').addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('modalGerarPagamentoProprio'));
        modal.show();
    });
    
    // Event listener para confirmar geração de pagamento agregado
    document.getElementById('confirmarGerarAgregado').addEventListener('click', async function() {
        const motorista = document.getElementById('motoristaGerarAgregado').value;
        const dataInicio = document.getElementById('dataInicioAgregado').value;
        const dataFim = document.getElementById('dataFimAgregado').value;
        
        if (!motorista || !dataInicio || !dataFim) {
            showNotification('Por favor, preencha todos os campos', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/pagamentos/agregados/gerar/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify({
                    motorista_id: motorista,
                    data_inicio: dataInicio,
                    data_fim: dataFim
                })
            });
            
            if (response.ok) {
                showNotification('Pagamento gerado com sucesso', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalGerarPagamentoAgregado')).hide();
                loadPagamentosAgregados();
            } else {
                const error = await response.json();
                showNotification(error.message || 'Erro ao gerar pagamento', 'danger');
            }
        } catch (error) {
            showNotification('Erro ao gerar pagamento', 'danger');
        }
    });
    
    // Event listener para confirmar geração de pagamento próprio
    document.getElementById('confirmarGerarProprio').addEventListener('click', async function() {
        const veiculo = document.getElementById('veiculoGerarProprio').value;
        const dataInicio = document.getElementById('dataInicioProprio').value;
        const dataFim = document.getElementById('dataFimProprio').value;
        
        if (!veiculo || !dataInicio || !dataFim) {
            showNotification('Por favor, preencha todos os campos', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/pagamentos/proprios/gerar/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify({
                    veiculo_id: veiculo,
                    data_inicio: dataInicio,
                    data_fim: dataFim
                })
            });
            
            if (response.ok) {
                showNotification('Pagamento gerado com sucesso', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalGerarPagamentoProprio')).hide();
                loadPagamentosProprios();
            } else {
                const error = await response.json();
                showNotification(error.message || 'Erro ao gerar pagamento', 'danger');
            }
        } catch (error) {
            showNotification('Erro ao gerar pagamento', 'danger');
        }
    });
    
    // Event listener para adicionar nova faixa
    document.getElementById('btnAdicionarFaixa').addEventListener('click', function() {
        document.getElementById('formFaixaKM').reset();
        document.getElementById('faixaId').value = '';
        document.getElementById('modalFaixaKMLabel').textContent = 'Nova Faixa de KM';
        const modal = new bootstrap.Modal(document.getElementById('modalFaixaKM'));
        modal.show();
    });
    
    // Event listener para salvar faixa
    document.getElementById('salvarFaixa').addEventListener('click', async function() {
        const faixaId = document.getElementById('faixaId').value;
        const kmInicial = document.getElementById('kmInicial').value;
        const kmFinal = document.getElementById('kmFinal').value;
        const valor = document.getElementById('valorKM').value;
        
        if (!kmInicial || !kmFinal || !valor) {
            showNotification('Por favor, preencha todos os campos', 'warning');
            return;
        }
        
        const data = {
            km_inicial: parseFloat(kmInicial),
            km_final: parseFloat(kmFinal),
            valor_por_km: parseFloat(valor)
        };
        
        try {
            const url = faixaId ? `/api/faixas-km/${faixaId}/` : '/api/faixas-km/';
            const method = faixaId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showNotification('Faixa salva com sucesso', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalFaixaKM')).hide();
                loadFaixasKM();
            } else {
                const error = await response.json();
                showNotification(error.message || 'Erro ao salvar faixa', 'danger');
            }
        } catch (error) {
            showNotification('Erro ao salvar faixa', 'danger');
        }
    });
    
    // Event listeners para exportar
    document.getElementById('btnExportarAgregados').addEventListener('click', function() {
        exportarPagamentos('agregados');
    });
    
    document.getElementById('btnExportarProprios').addEventListener('click', function() {
        exportarPagamentos('proprios');
    });
});