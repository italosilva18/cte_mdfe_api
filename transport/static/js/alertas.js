/**
 * alertas.js
 * Functions for the system alerts panel
 */

// Global variables
let pagamentosList = [];
let manutencoesList = [];
let documentosList = [];
let sistemaList = [];

/**
 * Initializes the alerts panel when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Load initial data
    loadAlertas();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the alerts panel
 */
function setupEventListeners() {
    // Filter form submit
    document.getElementById('filterForm').addEventListener('submit', function(e) {
        e.preventDefault();
        loadAlertas();
    });
    
    // Filter button
    document.querySelector('button[onclick="loadAlertas()"]').addEventListener('click', function(e) {
        e.preventDefault();
        loadAlertas();
    });
    
    // Reset filters button
    document.querySelector('button[onclick="resetFilters()"]').addEventListener('click', function(e) {
        e.preventDefault();
        resetFilters();
    });
    
    // Gerar pagamentos button
    document.querySelector('button[onclick="gerarPagamentos()"]').addEventListener('click', function(e) {
        e.preventDefault();
        gerarPagamentos();
    });
    
    // Export buttons
    document.querySelector('button[onclick="exportarPagamentos()"]').addEventListener('click', function(e) {
        e.preventDefault();
        exportarPagamentos();
    });
    
    document.querySelector('button[onclick="exportarManutencoes()"]').addEventListener('click', function(e) {
        e.preventDefault();
        exportarManutencoes();
    });
    
    document.querySelector('button[onclick="exportarDocumentos()"]').addEventListener('click', function(e) {
        e.preventDefault();
        exportarDocumentos();
    });
    
    // Clear alerts button
    document.querySelector('button[onclick="limparAlertas()"]').addEventListener('click', function(e) {
        e.preventDefault();
        showConfirmModal('Limpar Todos os Alertas', 'Tem certeza que deseja limpar todos os alertas do sistema? Esta ação não pode ser desfeita.', limparAlertas);
    });
    
    // Confirm modal button
    document.getElementById('btnConfirm').addEventListener('click', function() {
        const callback = this.getAttribute('data-callback');
        if (callback && typeof window[callback] === 'function') {
            window[callback]();
        }
        bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();
    });
    
    // Payment modal save button
    document.getElementById('btnSalvarPagamento').addEventListener('click', salvarPagamento);
}

/**
 * Resets filters and loads data
 */
function resetFilters() {
    document.getElementById('filterForm').reset();
    loadAlertas();
}

/**
 * Loads all alerts data
 */
function loadAlertas() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const tipoAlerta = document.getElementById('tipo_alerta').value;
    const prioridade = document.getElementById('prioridade').value;
    const dias = document.getElementById('dias').value;
    
    // Set dias_alerta value in span
    document.getElementById('dias-alerta').textContent = dias;
    
    // Build API URLs
    const apiUrlBase = '/api/alertas/';
    let apiUrlParams = `?dias=${dias}`;
    
    if (prioridade) {
        apiUrlParams += `&prioridade=${prioridade}`;
    }
    
    // Determine which alerts to load based on tipo_alerta
    const loadAll = !tipoAlerta;
    const loadPagamentos = loadAll || tipoAlerta === 'pagamento';
    const loadManutencoes = loadAll || tipoAlerta === 'manutencao';
    const loadDocumentos = loadAll || tipoAlerta === 'documento';
    const loadSistema = loadAll || tipoAlerta === 'sistema';
    
    // Create promises array
    const promises = [];
    
    // Add promises based on filters
    if (loadPagamentos) {
        promises.push(
            Auth.fetchWithAuth(`${apiUrlBase}pagamentos/${apiUrlParams}`)
                .then(response => response.json())
                .then(data => {
                    pagamentosList = data.agregados_pendentes || [];
                    return { total: pagamentosList.length };
                })
        );
    } else {
        promises.push(Promise.resolve({}));
        pagamentosList = [];
    }
    
    if (loadManutencoes) {
        // Adapt this to match the API in views.py that returns alerts for maintenance
        promises.push(
            Auth.fetchWithAuth(`/api/manutencao/?status=PENDENTE${apiUrlParams}`)
                .then(response => response.json())
                .then(data => {
                    manutencoesList = data.results || [];
                    return { total: manutencoesList.length };
                })
        );
    } else {
        promises.push(Promise.resolve({}));
        manutencoesList = [];
    }
    
    if (loadDocumentos) {
        // This should match the API in views.py for documents with pending status
        const docParams = `?processado=false${apiUrlParams.replace('?', '&')}`;
        promises.push(
            Auth.fetchWithAuth(`/api/ctes/${docParams}`)
                .then(response => response.json())
                .then(data => {
                    documentosList = data.results || [];
                    return { total: documentosList.length };
                })
        );
    } else {
        promises.push(Promise.resolve({}));
        documentosList = [];
    }
    
    if (loadSistema) {
        // Assuming there's a system alerts endpoint, adapt based on the actual API
        promises.push(
            Promise.resolve({ total: 0, results: [] }) // Placeholder until API is implemented
        );
    } else {
        promises.push(Promise.resolve({}));
        sistemaList = [];
    }
    
    // Process all promises
    Promise.all(promises)
        .then(([pagamentosSummary, manutencoesSummary, documentosSummary, sistemaSummary]) => {
            // Update summary cards
            updateSummaryCards(
                pagamentosSummary.total || 0,
                manutencoesSummary.total || 0,
                documentosSummary.total || 0,
                sistemaSummary.total || 0
            );
            
            // Render tables
            if (loadPagamentos) renderPagamentosTable();
            if (loadManutencoes) renderManutencoesTable();
            if (loadDocumentos) renderDocumentosTable();
            if (loadSistema) renderSistemaTable();
            
            // Hide loading state
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading alerts:', error);
            showNotification('Erro ao carregar alertas. Tente novamente.', 'error');
            hideLoading();
        });
}

/**
 * Updates summary cards with counts
 * @param {number} pagamentos - Number of payment alerts
 * @param {number} manutencoes - Number of maintenance alerts
 * @param {number} documentos - Number of document alerts
 * @param {number} sistema - Number of system alerts
 */
function updateSummaryCards(pagamentos, manutencoes, documentos, sistema) {
    document.getElementById('pagamentos-pendentes').textContent = pagamentos;
    document.getElementById('manutencoes-pendentes').textContent = manutencoes;
    document.getElementById('ctes-pendentes').textContent = documentos;
    document.getElementById('mdfes-pendentes').textContent = sistema;
}

/**
 * Renders pagamentos table
 */
function renderPagamentosTable() {
    const tbody = document.getElementById('pagamentos-list');
    if (!tbody) return;
    
    if (pagamentosList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center">
                Nenhum pagamento pendente encontrado.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    pagamentosList.forEach(pagamento => {
        const vencimento = formatDate(pagamento.data_prevista);
        const diasAtraso = getDiasAtraso(new Date(pagamento.data_prevista));
        let statusClass = '';
        
        if (diasAtraso > 0) {
            statusClass = 'text-danger fw-bold';
        } else if (diasAtraso === 0) {
            statusClass = 'text-warning fw-bold';
        }
        
        html += `
        <tr${diasAtraso > 0 ? ' class="table-danger"' : (diasAtraso === 0 ? ' class="table-warning"' : '')}>
            <td>${pagamento.tipo_pagamento || 'Agregado'}</td>
            <td>${pagamento.cte_chave || '--'}</td>
            <td>${truncateText(pagamento.condutor_nome, 30) || '--'}</td>
            <td class="${statusClass}">${vencimento} ${diasAtraso > 0 ? `(${diasAtraso} dias atraso)` : ''}</td>
            <td>${formatCurrency(pagamento.valor_frete_total)}</td>
            <td>${getPagamentoStatusHTML(pagamento.status)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-success" onclick="realizarPagamento('${pagamento.id}', 'agregado')" title="Realizar Pagamento">
                        <i class="fas fa-dollar-sign"></i>
                    </button>
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesPagamento('${pagamento.id}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="cancelarPagamento('${pagamento.id}')" title="Cancelar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders manutenções table
 */
function renderManutencoesTable() {
    const tbody = document.getElementById('manutencoes-list');
    if (!tbody) return;
    
    if (manutencoesList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
                Nenhuma manutenção pendente encontrada.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    manutencoesList.forEach(manutencao => {
        const dataAgendada = formatDate(manutencao.data_servico);
        const diasAtraso = getDiasAtraso(new Date(manutencao.data_servico));
        let statusClass = '';
        
        if (diasAtraso > 0) {
            statusClass = 'text-danger fw-bold';
        } else if (diasAtraso === 0) {
            statusClass = 'text-warning fw-bold';
        }
        
        html += `
        <tr${diasAtraso > 0 ? ' class="table-danger"' : (diasAtraso === 0 ? ' class="table-warning"' : '')}>
            <td>${manutencao.veiculo_placa || '--'}</td>
            <td>${truncateText(manutencao.servico_realizado, 30) || 'Manutenção'}</td>
            <td class="${statusClass}">${dataAgendada}</td>
            <td>${manutencao.quilometragem || '--'}</td>
            <td>${truncateText(manutencao.oficina, 20) || '--'}</td>
            <td>${formatCurrency(manutencao.valor_total)}</td>
            <td>${getManutencaoStatusHTML(manutencao.status)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-success" onclick="atualizarManutencao('${manutencao.id}')" title="Concluir">
                        <i class="fas fa-check"></i>
                    </button>
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesManutencao('${manutencao.id}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="cancelarManutencao('${manutencao.id}')" title="Cancelar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders documentos table
 */
function renderDocumentosTable() {
    const tbody = document.getElementById('documentos-list');
    if (!tbody) return;
    
    if (documentosList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center">
                Nenhum documento pendente encontrado.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    documentosList.forEach(documento => {
        const dataEmissao = formatDate(documento.data_emissao || documento.identificacao?.data_emissao);
        const status = documento.processado ? 
                      (documento.protocolo?.codigo_status === 100 ? 'AUTORIZADO' : 'PROCESSADO') : 
                      'PENDENTE';
        
        html += `
        <tr>
            <td>${documento.modalidade === 'CIF' ? 'CT-e' : 'CT-e'}</td>
            <td>${documento.identificacao?.numero || '--'}</td>
            <td>${truncateText(documento.chave, 25) || '--'}</td>
            <td>${dataEmissao}</td>
            <td>${getDocumentoStatusHTML(status)}</td>
            <td>${truncateText(documento.protocolo?.motivo_status || '', 50) || '--'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesDocumento('${documento.id}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="/api/ctes/${documento.id}/xml/" class="btn btn-outline-success" title="Download XML" target="_blank">
                        <i class="fas fa-file-code"></i>
                    </a>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders sistema table
 */
function renderSistemaTable() {
    const tbody = document.getElementById('sistema-list');
    if (!tbody) return;
    
    if (sistemaList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                Nenhum alerta do sistema encontrado.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    sistemaList.forEach(alerta => {
        const dataHora = formatDateTime(alerta.data_hora);
        
        html += `
        <tr>
            <td>${getPrioridadeHTML(alerta.prioridade)}</td>
            <td>${dataHora}</td>
            <td>${alerta.tipo || '--'}</td>
            <td>${alerta.mensagem || '--'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesAlerta('${alerta.id}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="limparAlerta('${alerta.id}')" title="Limpar">
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
 * Shows confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} callback - Callback function name
 */
function showConfirmModal(title, message, callback) {
    const modal = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('confirmModalLabel');
    const modalMessage = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('btnConfirm');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmBtn.setAttribute('data-callback', callback.name);
    
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Shows payment modal
 * @param {string} id - Payment ID
 * @param {string} tipo - Payment type
 */
function realizarPagamento(id, tipo) {
    const modal = document.getElementById('pagamentoModal');
    const form = document.getElementById('pagamentoForm');
    
    // Set payment ID and type
    document.getElementById('pagamento_id').value = id;
    document.getElementById('pagamento_tipo').value = tipo;
    
    // Set current date as default
    document.getElementById('pagamento_data').value = formatDateForInput(new Date());
    
    // Find the payment in the list
    const pagamento = pagamentosList.find(p => p.id === id);
    if (pagamento) {
        document.getElementById('pagamento_valor').value = pagamento.valor_repassado || 
            (pagamento.percentual_repasse/100 * pagamento.valor_frete_total);
    }
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Saves payment
 */
function salvarPagamento() {
    const form = document.getElementById('pagamentoForm');
    
    // Basic validation
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Collect form data
    const formData = {
        id: document.getElementById('pagamento_id').value,
        tipo: document.getElementById('pagamento_tipo').value,
        data_pagamento: document.getElementById('pagamento_data').value,
        valor: parseFloat(document.getElementById('pagamento_valor').value),
        observacoes: document.getElementById('pagamento_observacoes').value,
        status: document.getElementById('pagamento_efetivado').checked ? 'PAGO' : 'PENDENTE'
    };
    
    // Disable save button
    const btn = document.getElementById('btnSalvarPagamento');
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
    
    // Endpoint based on payment type
    const endpoint = formData.tipo === 'agregado' ? 
        `/api/pagamentos/agregados/${formData.id}/` :
        `/api/pagamentos/proprios/${formData.id}/`;
    
    // Send data to API
    Auth.fetchWithAuth(endpoint, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            data_pagamento: formData.data_pagamento,
            obs: formData.observacoes,
            status: formData.status
        })
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.detail || 'Erro ao salvar pagamento');
                });
            }
            return response.json();
        })
        .then(data => {
            // Show success message
            showNotification('Pagamento realizado com sucesso!', 'success');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('pagamentoModal')).hide();
            
            // Reload data
            loadAlertas();
        })
        .catch(error => {
            console.error('Error saving payment:', error);
            showNotification(`Erro ao realizar pagamento: ${error.message}`, 'error');
        })
        .finally(() => {
            // Re-enable save button
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        });
}

/**
 * Shows payment details
 * @param {string} id - Payment ID
 */
function verDetalhesPagamento(id) {
    // Find the payment in the list
    const pagamento = pagamentosList.find(p => p.id === id);
    if (!pagamento) {
        showNotification('Pagamento não encontrado', 'error');
        return;
    }
    
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');
    
    // Update modal title
    modalTitle.textContent = `Detalhes do Pagamento - ${pagamento.cte_numero || 'Pagamento'}`;
    
    // Hide edit button
    editBtn.classList.add('d-none');
    
    // Render payment details
    modalBody.innerHTML = `
    <div class="row">
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Informações Básicas</h6>
            <p><strong>Tipo:</strong> Pagamento Agregado</p>
            <p><strong>CT-e:</strong> ${pagamento.cte_chave || '--'}</p>
            <p><strong>Condutor:</strong> ${pagamento.condutor_nome || '--'}</p>
            <p><strong>Placa:</strong> ${pagamento.placa || '--'}</p>
        </div>
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Valores</h6>
            <p><strong>Data de Vencimento:</strong> ${formatDate(pagamento.data_prevista)}</p>
            <p><strong>Dias para Vencimento:</strong> ${getDiasParaVencimento(new Date(pagamento.data_prevista))}</p>
            <p><strong>Valor Frete Total:</strong> ${formatCurrency(pagamento.valor_frete_total)}</p>
            <p><strong>Percentual Repasse:</strong> ${pagamento.percentual_repasse}%</p>
            <p><strong>Valor Repassado:</strong> ${formatCurrency(pagamento.valor_repassado)}</p>
            <p><strong>Status:</strong> ${getPagamentoStatusHTML(pagamento.status)}</p>
        </div>
    </div>
    
    <div class="row mt-3">
        <div class="col-12">
            <h6 class="border-bottom pb-2 mb-3">Observações</h6>
            <p>${pagamento.obs || 'Nenhuma observação registrada.'}</p>
        </div>
    </div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Cancels payment
 * @param {string} id - Payment ID
 */
function cancelarPagamento(id) {
    // Confirm cancellation
    showConfirmModal(
        'Cancelar Pagamento',
        'Tem certeza que deseja cancelar este pagamento? Esta ação não pode ser desfeita.',
        function cancelPaymentConfirmed() {
            // Send cancellation to API
            Auth.fetchWithAuth(`/api/pagamentos/agregados/${id}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'CANCELADO'
                })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => {
                            throw new Error(data.detail || 'Erro ao cancelar pagamento');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    showNotification('Pagamento cancelado com sucesso!', 'success');
                    loadAlertas();
                })
                .catch(error => {
                    console.error('Error canceling payment:', error);
                    showNotification(`Erro ao cancelar pagamento: ${error.message}`, 'error');
                });
        }
    );
}

/**
 * Shows maintenance details
 * @param {string} id - Maintenance ID
 */
function verDetalhesManutencao(id) {
    // Find the maintenance in the list
    const manutencao = manutencoesList.find(m => m.id === id);
    if (!manutencao) {
        showNotification('Manutenção não encontrada', 'error');
        return;
    }
    
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');
    
    // Update modal title
    modalTitle.textContent = `Detalhes da Manutenção - ${manutencao.veiculo_placa || 'Veículo'}`;
    
    // Show and configure edit button
    editBtn.classList.remove('d-none');
    editBtn.setAttribute('onclick', `location.href='/manutencao/editar/${id}/'`);
    
    // Render maintenance details
    modalBody.innerHTML = `
    <div class="row">
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Informações Básicas</h6>
            <p><strong>Veículo:</strong> ${manutencao.veiculo_placa || '--'}</p>
            <p><strong>Serviço:</strong> ${manutencao.servico_realizado || '--'}</p>
            <p><strong>Oficina:</strong> ${manutencao.oficina || '--'}</p>
            <p><strong>Quilometragem:</strong> ${manutencao.quilometragem || '--'} km</p>
        </div>
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Prazos e Valores</h6>
            <p><strong>Data do Serviço:</strong> ${formatDate(manutencao.data_servico)}</p>
            <p><strong>Valor Peças:</strong> ${formatCurrency(manutencao.valor_peca)}</p>
            <p><strong>Valor Mão de Obra:</strong> ${formatCurrency(manutencao.valor_mao_obra)}</p>
            <p><strong>Valor Total:</strong> ${formatCurrency(manutencao.valor_total)}</p>
            <p><strong>Status:</strong> ${getManutencaoStatusHTML(manutencao.status)}</p>
        </div>
    </div>
    
    <div class="row mt-3">
        <div class="col-12">
            <h6 class="border-bottom pb-2 mb-3">Observações</h6>
            <p>${manutencao.observacoes || 'Nenhuma observação registrada.'}</p>
        </div>
    </div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Updates maintenance status to PAGO
 * @param {string} id - Maintenance ID
 */
function atualizarManutencao(id) {
    // Confirm update
    showConfirmModal(
        'Concluir Manutenção',
        'Tem certeza que deseja marcar esta manutenção como concluída?',
        function updateMaintenanceConfirmed() {
            // Send update to API
            Auth.fetchWithAuth(`/api/manutencao/${id}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'PAGO'
                })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => {
                            throw new Error(data.detail || 'Erro ao concluir manutenção');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    showNotification('Manutenção concluída com sucesso!', 'success');
                    loadAlertas();
                })
                .catch(error => {
                    console.error('Error updating maintenance:', error);
                    showNotification(`Erro ao concluir manutenção: ${error.message}`, 'error');
                });
        }
    );
}

/**
 * Cancels maintenance
 * @param {string} id - Maintenance ID
 */
function cancelarManutencao(id) {
    // Confirm cancellation
    showConfirmModal(
        'Cancelar Manutenção',
        'Tem certeza que deseja cancelar esta manutenção? Esta ação não pode ser desfeita.',
        function cancelMaintenanceConfirmed() {
            // Send cancellation to API
            Auth.fetchWithAuth(`/api/manutencao/${id}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'CANCELADO'
                })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => {
                            throw new Error(data.detail || 'Erro ao cancelar manutenção');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    showNotification('Manutenção cancelada com sucesso!', 'success');
                    loadAlertas();
                })
                .catch(error => {
                    console.error('Error canceling maintenance:', error);
                    showNotification(`Erro ao cancelar manutenção: ${error.message}`, 'error');
                });
        }
    );
}

/**
 * Shows document details
 * @param {string} id - Document ID
 */
function verDetalhesDocumento(id) {
    // Find the document in the list
    const documento = documentosList.find(d => d.id === id);
    if (!documento) {
        showNotification('Documento não encontrado', 'error');
        return;
    }
    
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');
    
    // Update modal title
    modalTitle.textContent = `Detalhes do Documento - ${documento.modalidade === 'CIF' ? 'CT-e' : 'CT-e'} ${documento.identificacao?.numero || ''}`;
    
    // Hide edit button
    editBtn.classList.add('d-none');
    
    // Render document details
    modalBody.innerHTML = `
    <div class="row">
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Informações Básicas</h6>
            <p><strong>Tipo:</strong> CT-e</p>
            <p><strong>Número:</strong> ${documento.identificacao?.numero || '--'}</p>
            <p><strong>Data de Emissão:</strong> ${formatDate(documento.identificacao?.data_emissao)}</p>
            <p><strong>Chave:</strong> ${documento.chave || '--'}</p>
        </div>
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Status e Processamento</h6>
            <p><strong>Status:</strong> ${getDocumentoStatusHTML(documento.processado ? 'PROCESSADO' : 'PENDENTE')}</p>
            <p><strong>Código:</strong> ${documento.protocolo?.codigo_status || '--'}</p>
            <p><strong>Data de Processamento:</strong> ${formatDateTime(documento.data_upload)}</p>
        </div>
    </div>
    
    <div class="row mt-3">
        <div class="col-12">
            <h6 class="border-bottom pb-2 mb-3">Mensagem do Status</h6>
            <div class="alert ${documento.protocolo?.codigo_status !== 100 ? 'alert-danger' : 'alert-info'}">
                ${documento.protocolo?.motivo_status || 'Sem mensagem disponível.'}
            </div>
        </div>
        </div>
        </div>
    </div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Download XML for document
 * @param {string} id - Document ID
 */
function baixarXml(id) {
    const documento = documentosList.find(d => d.id === id);
    if (!documento) {
        showNotification('Documento não encontrado', 'error');
        return;
    }
    
    // Get document type endpoint
    let endpoint = '/api/ctes/';
    
    // Open XML download in new tab
    window.open(`${endpoint}${documento.id}/xml/`, '_blank');
}

/**
 * Shows system alert details
 * @param {string} id - Alert ID
 */
function verDetalhesAlerta(id) {
    // Find the alert in the list
    const alerta = sistemaList.find(a => a.id === id);
    if (!alerta) {
        showNotification('Alerta não encontrado', 'error');
        return;
    }
    
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');
    
    // Update modal title
    modalTitle.textContent = `Detalhes do Alerta - ${alerta.tipo || 'Sistema'}`;
    
    // Hide edit button
    editBtn.classList.add('d-none');
    
    // Render alert details
    modalBody.innerHTML = `
    <div class="row">
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Informações Básicas</h6>
            <p><strong>Tipo:</strong> ${alerta.tipo || '--'}</p>
            <p><strong>Data/Hora:</strong> ${formatDateTime(alerta.data_hora)}</p>
            <p><strong>Prioridade:</strong> ${getPrioridadeHTML(alerta.prioridade)}</p>
        </div>
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Origem</h6>
            <p><strong>Módulo:</strong> ${alerta.modulo || '--'}</p>
            <p><strong>Usuário:</strong> ${alerta.usuario || '--'}</p>
            <p><strong>Referência:</strong> ${alerta.referencia || '--'}</p>
        </div>
    </div>
    
    <div class="row mt-3">
        <div class="col-12">
            <h6 class="border-bottom pb-2 mb-3">Mensagem</h6>
            <div class="alert alert-info">
                ${alerta.mensagem || 'Sem mensagem disponível.'}
            </div>
        </div>
    </div>
    
    <div class="row mt-3">
        <div class="col-12">
            <h6 class="border-bottom pb-2 mb-3">Dados Adicionais</h6>
            <pre class="bg-light p-3 rounded">${formatJson(alerta.dados_adicionais)}</pre>
        </div>
    </div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Clears a single system alert
 * @param {string} id - Alert ID
 */
function limparAlerta(id) {
    // Confirm clearance
    showConfirmModal(
        'Limpar Alerta',
        'Tem certeza que deseja limpar este alerta? Esta ação não pode ser desfeita.',
        function clearAlertConfirmed() {
            // Send clear request to API
            Auth.fetchWithAuth(`/api/alertas/sistema/${id}/limpar/`, {
                method: 'POST'
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => {
                            throw new Error(data.detail || 'Erro ao limpar alerta');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    showNotification('Alerta limpo com sucesso!', 'success');
                    loadAlertas();
                })
                .catch(error => {
                    console.error('Error clearing alert:', error);
                    showNotification(`Erro ao limpar alerta: ${error.message}`, 'error');
                });
        }
    );
}

/**
 * Clears all system alerts
 */
function limparAlertas() {
    // Send clear all request to API
    Auth.fetchWithAuth('/api/alertas/sistema/limpar-todos/', {
        method: 'POST'
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.detail || 'Erro ao limpar alertas');
                });
            }
            return response.json();
        })
        .then(data => {
            showNotification('Todos os alertas foram limpos com sucesso!', 'success');
            loadAlertas();
        })
        .catch(error => {
            console.error('Error clearing all alerts:', error);
            showNotification(`Erro ao limpar alertas: ${error.message}`, 'error');
        });
}

/**
 * Generates payments
 */
function gerarPagamentos() {
    // Confirm generation
    showConfirmModal(
        'Gerar Pagamentos',
        'Tem certeza que deseja gerar pagamentos para as entregas pendentes?',
        function generatePaymentsConfirmed() {
            // Show loading notification
            showNotification('Gerando pagamentos, aguarde...', 'info');
            
            // Send generate request to API
            Auth.fetchWithAuth('/api/pagamentos/agregados/gerar/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data_inicio: document.getElementById('data_inicio').value || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    data_fim: document.getElementById('data_fim').value || new Date().toISOString().split('T')[0],
                    percentual: 25,
                    data_prevista: new Date().toISOString().split('T')[0]
                })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => {
                            throw new Error(data.detail || 'Erro ao gerar pagamentos');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    showNotification(`${data.criados || 0} pagamentos gerados com sucesso!`, 'success');
                    loadAlertas();
                })
                .catch(error => {
                    console.error('Error generating payments:', error);
                    showNotification(`Erro ao gerar pagamentos: ${error.message}`, 'error');
                });
        }
    );
}

/**
 * Exports payments to CSV
 */
function exportarPagamentos() {
    // Get dias para filtro
    const dias = document.getElementById('dias').value;
    
    // Build API URL
    const apiUrl = `/api/pagamentos/agregados/export/?dias=${dias}&format=csv`;
    
    // Trigger download
    window.location.href = apiUrl;
}

/**
 * Exports maintenance to CSV
 */
function exportarManutencoes() {
    // Get dias para filtro
    const dias = document.getElementById('dias').value;
    
    // Build API URL
    const apiUrl = `/api/manutencao/export/?dias=${dias}&format=csv`;
    
    // Trigger download
    window.location.href = apiUrl;
}

/**
 * Exports documents to CSV
 */
function exportarDocumentos() {
    // Build API URL
    const apiUrl = `/api/ctes/export/?status=pendente&format=csv`;
    
    // Trigger download
    window.location.href = apiUrl;
}

/**
 * Shows loading state
 */
function showLoading() {
    // Show loading in tables
    const loadingHTML = `
    <tr>
        <td colspan="7" class="text-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            Carregando dados...
        </td>
    </tr>`;
    
    document.getElementById('pagamentos-list').innerHTML = loadingHTML;
    document.getElementById('manutencoes-list').innerHTML = loadingHTML.replace('colspan="7"', 'colspan="8"');
    document.getElementById('documentos-list').innerHTML = loadingHTML;
    document.getElementById('sistema-list').innerHTML = loadingHTML.replace('colspan="7"', 'colspan="5"');
    
    // Disable filter buttons
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
 * Gets days to expiration
 * @param {Date} date - Expiration date
 * @returns {number} - Days to expiration
 */
function getDiasParaVencimento(date) {
    const hoje = new Date();
    
    // Reset time part for accurate day calculation
    hoje.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    // Calculate difference in days
    const diffTime = date.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * Gets days overdue
 * @param {Date} date - Expiration date
 * @returns {number} - Days overdue
 */
function getDiasAtraso(date) {
    const diffDays = getDiasParaVencimento(date);
    
    // Return days overdue (negative of days to expiration)
    return diffDays <= 0 ? Math.abs(diffDays) : 0;
}

/**
 * Gets payment status HTML badge
 * @param {string} status - Status code
 * @returns {string} - HTML for status badge
 */
function getPagamentoStatusHTML(status) {
    if (!status) return '<span class="badge bg-secondary">--</span>';
    
    const statusMap = {
        'PENDENTE': '<span class="badge bg-warning text-dark">Pendente</span>',
        'PAGO': '<span class="badge bg-success">Pago</span>',
        'ATRASADO': '<span class="badge bg-danger">Atrasado</span>',
        'CANCELADO': '<span class="badge bg-secondary">Cancelado</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Gets maintenance status HTML badge
 * @param {string} status - Status code
 * @returns {string} - HTML for status badge
 */
function getManutencaoStatusHTML(status) {
    if (!status) return '<span class="badge bg-secondary">--</span>';
    
    const statusMap = {
        'PENDENTE': '<span class="badge bg-warning text-dark">Pendente</span>',
        'AGENDADO': '<span class="badge bg-info">Agendado</span>',
        'PAGO': '<span class="badge bg-success">Pago</span>',
        'CANCELADO': '<span class="badge bg-danger">Cancelado</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Gets document status HTML badge
 * @param {string} status - Status code
 * @returns {string} - HTML for status badge
 */
function getDocumentoStatusHTML(status) {
    if (!status) return '<span class="badge bg-secondary">--</span>';
    
    const statusMap = {
        'PENDENTE': '<span class="badge bg-warning text-dark">Pendente</span>',
        'AUTORIZADO': '<span class="badge bg-success">Autorizado</span>',
        'REJEITADO': '<span class="badge bg-danger">Rejeitado</span>',
        'PROCESSADO': '<span class="badge bg-info">Processado</span>',
        'CANCELADO': '<span class="badge bg-secondary">Cancelado</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Gets priority HTML badge
 * @param {string} prioridade - Priority level
 * @returns {string} - HTML for priority badge
 */
function getPrioridadeHTML(prioridade) {
    if (!prioridade) return '<span class="badge bg-secondary">Baixa</span>';
    
    const prioridadeMap = {
        'alta': '<span class="badge bg-danger">Alta</span>',
        'media': '<span class="badge bg-warning text-dark">Média</span>',
        'baixa': '<span class="badge bg-secondary">Baixa</span>'
    };
    
    return prioridadeMap[prioridade.toLowerCase()] || `<span class="badge bg-secondary">${prioridade}</span>`;
}

/**
 * Format date
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return '--';
        }
        
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Format date for input fields
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date string (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    if (!date) return '';
    
    // Format as YYYY-MM-DD
    return date.toISOString().split('T')[0];
}

/**
 * Format date and time
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date and time
 */
function formatDateTime(date) {
    if (!date) return '--';
    
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return '--';
        }
        
        return date.toLocaleString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Format currency value
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
 * Format JSON for display
 * @param {Object|string} data - JSON data or string
 * @returns {string} - Formatted JSON string
 */
function formatJson(data) {
    if (!data) return '';
    
    try {
        // Parse string to object if needed
        const obj = typeof data === 'string' ? JSON.parse(data) : data;
        
        // Format with indentation
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        // Return as-is if not valid JSON
        return String(data);
    }
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    
    if (text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
    }
    
    return text;
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