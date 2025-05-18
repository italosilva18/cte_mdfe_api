/**
 * alertas.js
 * Functions for the system alerts panel
 * Continuar ajustes para integração completa com backend e frontend.
 */

// Global variables
let pagamentosList = [];
let manutencoesList = [];
let documentosList = []; // Para CT-es/MDF-es pendentes/rejeitados
let sistemaList = []; // Para alertas gerais do sistema (placeholder)

/**
 * Initializes the alerts panel when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default filter for 'dias' (dias para vencimento)
    const diasSelect = document.getElementById('dias');
    if (diasSelect && diasSelect.value) {
        document.getElementById('dias-alerta').textContent = diasSelect.value;
    } else if (diasSelect) {
        diasSelect.value = "7"; // Default para 7 dias se não houver valor
        document.getElementById('dias-alerta').textContent = "7";
    }

    // Load initial data
    loadAlertas();

    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the alerts panel
 */
function setupEventListeners() {
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            loadAlertas();
        });
    }

    const filterButton = document.querySelector('button[onclick="loadAlertas()"]');
    if (filterButton) {
        filterButton.removeAttribute('onclick'); // Remover handler inline se existir
        filterButton.addEventListener('click', function(e) {
            e.preventDefault();
            loadAlertas();
        });
    }

    const resetFiltersButton = document.querySelector('button[onclick="resetFilters()"]');
    if (resetFiltersButton) {
        resetFiltersButton.removeAttribute('onclick');
        resetFiltersButton.addEventListener('click', function(e) {
            e.preventDefault();
            resetFilters();
        });
    }

    const gerarPagamentosButton = document.querySelector('button[onclick="gerarPagamentos()"]');
    if (gerarPagamentosButton) {
        gerarPagamentosButton.removeAttribute('onclick');
        gerarPagamentosButton.addEventListener('click', function(e) {
            e.preventDefault();
            // A função gerarPagamentos precisa ser implementada ou ajustada
            // para chamar o endpoint correto do backend.
            // Ex: showConfirmModal('Gerar Pagamentos', 'Deseja gerar pagamentos pendentes?', () => console.log("Gerar Pagamentos Confirmado"));
            showNotification('Funcionalidade "Gerar Pagamentos" a ser implementada.', 'info');
        });
    }

    // Export buttons
    const exportPagamentosBtn = document.querySelector('button[onclick="exportarPagamentos()"]');
    if (exportPagamentosBtn) {
        exportPagamentosBtn.removeAttribute('onclick');
        exportPagamentosBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportarAlertas('pagamentos');
        });
    }

    const exportManutencoesBtn = document.querySelector('button[onclick="exportarManutencoes()"]');
    if (exportManutencoesBtn) {
        exportManutencoesBtn.removeAttribute('onclick');
        exportManutencoesBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportarAlertas('manutencoes');
        });
    }

    const exportDocumentosBtn = document.querySelector('button[onclick="exportarDocumentos()"]');
    if (exportDocumentosBtn) {
        exportDocumentosBtn.removeAttribute('onclick');
        exportDocumentosBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportarAlertas('documentos');
        });
    }
    
    const limparAlertasBtn = document.querySelector('button[onclick="limparAlertas()"]');
    if (limparAlertasBtn) {
        limparAlertasBtn.removeAttribute('onclick');
        limparAlertasBtn.addEventListener('click', function(e){
            e.preventDefault();
            showConfirmModal(
                'Limpar Todos os Alertas do Sistema',
                'Tem certeza que deseja limpar todos os alertas do sistema? Esta ação não pode ser desfeita.',
                confirmLimparAlertasSistema // Passa a função de callback
            );
        });
    }


    // Confirm modal button (genérico, o callback é definido dinamicamente)
    const btnConfirm = document.getElementById('btnConfirm');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', function() {
            const callbackName = this.getAttribute('data-callback-name'); // Usar um atributo para nome da função
            if (callbackName && typeof window[callbackName] === 'function') {
                window[callbackName](); // Chama a função global pelo nome
            }
            const confirmModalInstance = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
            if (confirmModalInstance) {
                confirmModalInstance.hide();
            }
        });
    }


    const btnSalvarPagamento = document.getElementById('btnSalvarPagamento');
    if (btnSalvarPagamento) {
        btnSalvarPagamento.addEventListener('click', salvarPagamento);
    }

    // Listener para mudança no select de dias para atualizar o span
    const diasSelect = document.getElementById('dias');
    if (diasSelect) {
        diasSelect.addEventListener('change', function() {
            const diasAlertaSpan = document.getElementById('dias-alerta');
            if (diasAlertaSpan) {
                diasAlertaSpan.textContent = this.value;
            }
        });
    }
}

/**
 * Resets filters and loads data
 */
function resetFilters() {
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.reset();
        // Reset 'dias' select to default and update span
        const diasSelect = document.getElementById('dias');
        if (diasSelect) {
            diasSelect.value = "7"; // Default value
            const diasAlertaSpan = document.getElementById('dias-alerta');
            if (diasAlertaSpan) {
                diasAlertaSpan.textContent = "7";
            }
        }
    }
    loadAlertas();
}

/**
 * Loads all alerts data based on filters
 */
function loadAlertas() {
    showLoading();

    const tipoAlertaFilter = document.getElementById('tipo_alerta').value;
    const prioridadeFilter = document.getElementById('prioridade').value; // Não usado na API de alertas de pagamento ainda
    const diasFilter = document.getElementById('dias').value;

    const promises = [];
    let pagamentosCount = 0, manutencoesCount = 0, documentosCount = 0, sistemaCount = 0;

    // Pagamentos Pendentes
    if (!tipoAlertaFilter || tipoAlertaFilter === 'pagamento') {
        promises.push(
            Auth.fetchWithAuth(`/api/alertas/pagamentos/?dias=${diasFilter}`)
                .then(response => response.json())
                .then(data => {
                    pagamentosList = (data.agregados_pendentes || []).concat(data.proprios_pendentes || []);
                    pagamentosCount = pagamentosList.length;
                    renderPagamentosTable();
                }).catch(err => {
                    console.error("Erro ao carregar alertas de pagamento:", err);
                    document.getElementById('pagamentos-list').innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar pagamentos.</td></tr>`;
                })
        );
    } else {
        document.getElementById('pagamentos-list').innerHTML = `<tr><td colspan="7" class="text-center">Filtro aplicado.</td></tr>`;
    }

    // Manutenções Pendentes (Exemplo: buscar manutenções com status PENDENTE)
    if (!tipoAlertaFilter || tipoAlertaFilter === 'manutencao') {
        // TODO: Adicionar filtro de data_servico próximo, se necessário e suportado pela API de manutenção
        promises.push(
            Auth.fetchWithAuth(`/api/manutencao/painel/ultimos/?limit=50`) // /api/manutencao/?status=PENDENTE&data_fim_prevista=${diasFilterPrazo}
                .then(response => response.json())
                .then(data => {
                    // A API de ultimos retorna ManutencaoVeiculoSerializer, que pode ser filtrado no frontend por status PENDENTE
                    manutencoesList = data.filter(m => m.status === 'PENDENTE');
                    // Para ser mais preciso, a API de alertas de manutenção deveria considerar o prazo.
                    // Aqui é uma simplificação.
                    manutencoesCount = manutencoesList.length;
                    renderManutencoesTable();
                }).catch(err => {
                    console.error("Erro ao carregar alertas de manutenção:", err);
                    document.getElementById('manutencoes-list').innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erro ao carregar manutenções.</td></tr>`;
                })
        );
    } else {
        document.getElementById('manutencoes-list').innerHTML = `<tr><td colspan="8" class="text-center">Filtro aplicado.</td></tr>`;
    }

    // Documentos Pendentes (Exemplo: CT-es não autorizados ou rejeitados)
    if (!tipoAlertaFilter || tipoAlertaFilter === 'documento') {
        promises.push(
            Auth.fetchWithAuth(`/api/ctes/?autorizado=false&limit=50`) // Busca CTes não autorizados (inclui rejeitados e pendentes)
                .then(response => response.json())
                .then(data => {
                    documentosList = data.results || [];
                    documentosCount = documentosList.length; // Ou data.count se a API retornar assim
                    renderDocumentosTable();
                }).catch(err => {
                    console.error("Erro ao carregar alertas de documentos:", err);
                    document.getElementById('documentos-list').innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar documentos.</td></tr>`;
                })
        );
    } else {
        document.getElementById('documentos-list').innerHTML = `<tr><td colspan="7" class="text-center">Filtro aplicado.</td></tr>`;
    }

    // Alertas do Sistema (Placeholder)
    if (!tipoAlertaFilter || tipoAlertaFilter === 'sistema') {
        // Esta seção é um placeholder, pois não há endpoint de API definido para "alertas do sistema"
        sistemaList = [
            // {id: 'sys1', prioridade: 'alta', data_hora: new Date().toISOString(), tipo: 'Backup', mensagem: 'Falha no último backup automático.', dados_adicionais: {detail: 'Disk full'}},
            // {id: 'sys2', prioridade: 'media', data_hora: new Date(Date.now() - 3600000).toISOString(), tipo: 'Certificado', mensagem: 'Certificado digital expira em 15 dias.'}
        ]; // Exemplo de dados
        sistemaCount = sistemaList.length;
        renderSistemaTable();
    } else {
         document.getElementById('sistema-list').innerHTML = `<tr><td colspan="5" class="text-center">Filtro aplicado.</td></tr>`;
    }

    Promise.all(promises).then(() => {
        updateSummaryCards(pagamentosCount, manutencoesCount, documentosCount, sistemaCount);
        hideLoading();
    }).catch(() => {
        // Erros individuais já são tratados
        hideLoading();
    });
}


/**
 * Updates summary cards with counts
 */
function updateSummaryCards(pagamentos, manutencoes, documentos, sistema) {
    document.getElementById('pagamentos-pendentes').textContent = formatNumber(pagamentos);
    document.getElementById('manutencoes-pendentes').textContent = formatNumber(manutencoes);
    document.getElementById('ctes-pendentes').textContent = formatNumber(documentos); // Renomeado de ctes-pendentes para documentos-pendentes
    document.getElementById('mdfes-pendentes').textContent = formatNumber(sistema); // Renomeado de mdfes-pendentes para sistema-pendentes
}

/**
 * Renders pagamentos table
 */
function renderPagamentosTable() {
    const tbody = document.getElementById('pagamentos-list');
    if (!tbody) return;

    if (pagamentosList.length === 0 && (!document.getElementById('tipo_alerta').value || document.getElementById('tipo_alerta').value === 'pagamento')) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">Nenhum pagamento pendente encontrado.</td></tr>`;
        return;
    }
    if (document.getElementById('tipo_alerta').value && document.getElementById('tipo_alerta').value !== 'pagamento') {
        return; // Não renderiza se o filtro não for para pagamentos
    }


    let html = '';
    pagamentosList.forEach(pagamento => {
        const vencimento = formatDate(pagamento.data_prevista);
        const diasRestantes = getDiasParaVencimento(new Date(pagamento.data_prevista));
        let statusClass = '';
        let statusText = '';

        if (diasRestantes < 0) {
            statusClass = 'text-danger fw-bold';
            statusText = `(Vencido há ${Math.abs(diasRestantes)} dia(s))`;
        } else if (diasRestantes === 0) {
            statusClass = 'text-warning fw-bold';
            statusText = '(Vence Hoje)';
        } else {
            statusText = `(Vence em ${diasRestantes} dia(s))`;
        }

        html += `
        <tr class="${diasRestantes < 0 ? 'table-danger' : (diasRestantes < 3 ? 'table-warning' : '')}">
            <td>${pagamento.cte ? 'Agregado (CT-e)' : 'Próprio (Período)'}</td>
            <td>${pagamento.cte_chave || pagamento.periodo || '--'}</td>
            <td>${truncateText(pagamento.condutor_nome || pagamento.veiculo_placa, 30) || '--'}</td>
            <td class="${statusClass}">${vencimento} ${statusText}</td>
            <td>${formatCurrency(pagamento.valor_repassado || pagamento.valor_total_pagar)}</td>
            <td>${getPagamentoStatusHTML(pagamento.status)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-success" onclick="abrirModalPagamento('${pagamento.id}', '${pagamento.cte ? 'agregado' : 'proprio'}')" title="Realizar Pagamento">
                        <i class="fas fa-dollar-sign"></i>
                    </button>
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesPagamento('${pagamento.id}', '${pagamento.cte ? 'agregado' : 'proprio'}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="confirmarCancelarPagamento('${pagamento.id}', '${pagamento.cte ? 'agregado' : 'proprio'}')" title="Cancelar Pagamento">
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

    if (manutencoesList.length === 0 && (!document.getElementById('tipo_alerta').value || document.getElementById('tipo_alerta').value === 'manutencao')) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center">Nenhuma manutenção pendente encontrada.</td></tr>`;
        return;
    }
    if (document.getElementById('tipo_alerta').value && document.getElementById('tipo_alerta').value !== 'manutencao') {
        return;
    }

    let html = '';
    manutencoesList.forEach(manutencao => {
        const dataAgendada = formatDate(manutencao.data_servico);
        // Adicionar lógica de "prazo" se a data_servico for uma data futura para agendamento
        // Por ora, apenas exibe a data do serviço
        html += `
        <tr>
            <td>${manutencao.veiculo_placa || '--'}</td>
            <td>${truncateText(manutencao.servico_realizado, 30) || 'Manutenção'}</td>
            <td>${dataAgendada}</td>
            <td>${formatNumber(manutencao.quilometragem) || '--'}</td>
            <td>${truncateText(manutencao.oficina, 20) || '--'}</td>
            <td>${formatCurrency(manutencao.valor_total)}</td>
            <td>${getManutencaoStatusHTML(manutencao.status)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-success" onclick="confirmarAtualizarManutencao('${manutencao.id}', 'PAGO')" title="Marcar como Paga">
                        <i class="fas fa-check"></i>
                    </button>
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesManutencao('${manutencao.id}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="confirmarAtualizarManutencao('${manutencao.id}', 'CANCELADO')" title="Cancelar Manutenção">
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

    if (documentosList.length === 0 && (!document.getElementById('tipo_alerta').value || document.getElementById('tipo_alerta').value === 'documento')) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">Nenhum documento pendente encontrado.</td></tr>`;
        return;
    }
     if (document.getElementById('tipo_alerta').value && document.getElementById('tipo_alerta').value !== 'documento') {
        return;
    }

    let html = '';
    documentosList.forEach(doc => {
        // Assumindo que 'doc' é um objeto CT-e vindo da API /api/ctes/
        const dataEmissao = formatDate(doc.data_emissao); // Usar o campo correto do serializer de lista
        const statusHTML = getDocumentoStatusHTML(doc.status); // O serializer de lista já tem um campo status
        const tipoDoc = doc.chave.substring(20,22) === '57' ? 'CT-e' : (doc.chave.substring(20,22) === '58' ? 'MDF-e' : 'Outro');
        const numeroDoc = tipoDoc === 'CT-e' ? doc.numero_cte : (tipoDoc === 'MDF-e' ? doc.numero_mdfe : 'N/A');


        html += `
        <tr>
            <td>${tipoDoc}</td>
            <td>${numeroDoc || '--'}</td>
            <td>${truncateText(doc.chave, 25) || '--'}</td>
            <td>${dataEmissao}</td>
            <td>${statusHTML}</td>
            <td>${truncateText(doc.protocolo_motivo || doc.status, 50) || '--'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesDocumento('${doc.id}', '${tipoDoc.toLowerCase()}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="/api/${tipoDoc.toLowerCase()}s/${doc.id}/xml/" class="btn btn-outline-info" title="Download XML" target="_blank">
                        <i class="fas fa-file-code"></i>
                    </a>
                     <button type="button" class="btn btn-outline-warning" onclick="reprocessarDocumento('${doc.id}', '${tipoDoc.toLowerCase()}')" title="Reprocessar Documento">
                        <i class="fas fa-sync-alt"></i>
                    </button>
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

    if (sistemaList.length === 0 && (!document.getElementById('tipo_alerta').value || document.getElementById('tipo_alerta').value === 'sistema')) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">Nenhum alerta do sistema encontrado.</td></tr>`;
        return;
    }
    if (document.getElementById('tipo_alerta').value && document.getElementById('tipo_alerta').value !== 'sistema') {
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
            <td>${truncateText(alerta.mensagem, 70) || '--'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary" onclick="verDetalhesAlertaSistema('${alerta.id}')" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="confirmLimparAlertaSistema('${alerta.id}')" title="Limpar Alerta">
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
 */
function showConfirmModal(title, message, callbackName) {
    const modal = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('confirmModalLabel');
    const modalMessage = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('btnConfirm');

    if(modalTitle) modalTitle.textContent = title;
    if(modalMessage) modalMessage.textContent = message;
    if(confirmBtn) confirmBtn.setAttribute('data-callback-name', callbackName.name || callbackName); // Armazena o NOME da função

    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
}


/**
 * Opens the payment modal.
 */
function abrirModalPagamento(id, tipo) {
    const modal = document.getElementById('pagamentoModal');
    const form = document.getElementById('pagamentoForm');
    if (!modal || !form) return;

    form.reset(); // Limpa o formulário

    document.getElementById('pagamento_id').value = id;
    document.getElementById('pagamento_tipo').value = tipo; // 'agregado' ou 'proprio'
    document.getElementById('pagamento_data').value = formatDateForInput(new Date()); // Data atual

    const pagamento = pagamentosList.find(p => p.id.toString() === id.toString() && ( (tipo === 'agregado' && p.cte_chave) || (tipo === 'proprio' && p.periodo) ));

    if (pagamento) {
        const valorAPagar = parseFloat(pagamento.valor_repassado || pagamento.valor_total_pagar || 0).toFixed(2);
        document.getElementById('pagamento_valor').value = valorAPagar;
        document.getElementById('pagamentoModalLabel').textContent = `Realizar Pagamento (${tipo.charAt(0).toUpperCase() + tipo.slice(1)}): ${pagamento.condutor_nome || pagamento.veiculo_placa}`;
    } else {
        document.getElementById('pagamentoModalLabel').textContent = `Realizar Pagamento (${tipo.charAt(0).toUpperCase() + tipo.slice(1)})`;
        document.getElementById('pagamento_valor').value = '0.00';
        showNotification('Detalhes do pagamento original não encontrados na lista.', 'warning');
    }
    
    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Saves payment
 */
function salvarPagamento() {
    const form = document.getElementById('pagamentoForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const pagamentoId = document.getElementById('pagamento_id').value;
    const tipoPagamento = document.getElementById('pagamento_tipo').value; // 'agregado' ou 'proprio'
    const dataPagamento = document.getElementById('pagamento_data').value;
    const valorPago = parseFloat(document.getElementById('pagamento_valor').value); // Valor efetivamente pago
    const observacoes = document.getElementById('pagamento_observacoes').value;
    const marcarComoPago = document.getElementById('pagamento_efetivado').checked;

    const btn = document.getElementById('btnSalvarPagamento');
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';

    const endpoint = tipoPagamento === 'agregado' ?
        `/api/pagamentos/agregados/${pagamentoId}/` :
        `/api/pagamentos/proprios/${pagamentoId}/`;

    const payload = {
        data_pagamento: dataPagamento,
        obs: observacoes,
        // O backend deve calcular o valor_pago se necessário ou aceitar o valor.
        // Vamos assumir que o backend atualiza o status. Se o valor for editável, enviar 'valor_pago': valorPago
    };
    if (marcarComoPago) {
        payload.status = 'pago';
    }


    Auth.fetchWithAuth(endpoint, {
        method: 'PATCH', // Usar PATCH para atualização parcial
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                const errorMessages = Object.values(data).flat().join(' ');
                throw new Error(errorMessages || 'Erro ao salvar pagamento');
            });
        }
        return response.json();
    })
    .then(data => {
        showNotification('Pagamento salvo com sucesso!', 'success');
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('pagamentoModal'));
        if (modalInstance) modalInstance.hide();
        loadAlertas(); // Recarrega a lista de alertas
    })
    .catch(error => {
        console.error('Error saving payment:', error);
        showNotification(`Erro ao salvar pagamento: ${error.message || 'Verifique os campos.'}`, 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    });
}

/**
 * Shows payment details
 */
function verDetalhesPagamento(id, tipo) {
    const pagamento = pagamentosList.find(p => p.id.toString() === id.toString() && ( (tipo === 'agregado' && p.cte_chave) || (tipo === 'proprio' && p.periodo) ));
    if (!pagamento) {
        showNotification('Detalhes do pagamento não encontrados.', 'warning');
        return;
    }

    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');

    if (!modal || !modalTitle || !modalBody || !editBtn) return;

    modalTitle.textContent = `Detalhes do Pagamento - ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
    editBtn.classList.add('d-none'); // Geralmente não se edita por aqui, mas sim pelo modal de pagamento

    let contentHtml = `<div class="row">`;
    if (tipo === 'agregado') {
        contentHtml += `
            <div class="col-md-6">
                <p><strong>Tipo:</strong> Pagamento Agregado</p>
                <p><strong>CT-e Chave:</strong> ${pagamento.cte_chave || '--'}</p>
                <p><strong>CT-e Número:</strong> ${pagamento.cte_numero || '--'}</p>
                <p><strong>Data Emissão CT-e:</strong> ${formatDate(pagamento.cte_data_emissao)}</p>
                <p><strong>Condutor:</strong> ${pagamento.condutor_nome || '--'} (CPF: ${formatCPF(pagamento.condutor_cpf)})</p>
                <p><strong>Placa:</strong> ${pagamento.placa || '--'}</p>
            </div>
            <div class="col-md-6">
                <p><strong>Valor Frete CT-e:</strong> ${formatCurrency(pagamento.valor_frete_total)}</p>
                <p><strong>% Repasse:</strong> ${pagamento.percentual_repasse}%</p>
                <p><strong>Valor a Repassar:</strong> ${formatCurrency(pagamento.valor_repassado)}</p>
                <p><strong>Data Prevista:</strong> ${formatDate(pagamento.data_prevista)}</p>
                <p><strong>Data Pagamento:</strong> ${pagamento.data_pagamento ? formatDate(pagamento.data_pagamento) : 'Não pago'}</p>
                <p><strong>Status:</strong> ${getPagamentoStatusHTML(pagamento.status)}</p>
            </div>`;
    } else { // tipo 'proprio'
        contentHtml += `
            <div class="col-md-6">
                <p><strong>Tipo:</strong> Pagamento Próprio</p>
                <p><strong>Veículo Placa:</strong> ${pagamento.veiculo_placa || '--'}</p>
                <p><strong>Período:</strong> ${pagamento.periodo || '--'}</p>
                <p><strong>KM Total Período:</strong> ${formatNumber(pagamento.km_total_periodo)} km</p>
            </div>
            <div class="col-md-6">
                <p><strong>Valor Base (Faixa):</strong> ${formatCurrency(pagamento.valor_base_faixa)}</p>
                <p><strong>Ajustes:</strong> ${formatCurrency(pagamento.ajustes)}</p>
                <p><strong>Valor Total a Pagar:</strong> ${formatCurrency(pagamento.valor_total_pagar)}</p>
                 <p><strong>Data Pagamento:</strong> ${pagamento.data_pagamento ? formatDate(pagamento.data_pagamento) : 'Não pago'}</p>
                <p><strong>Status:</strong> ${getPagamentoStatusHTML(pagamento.status)}</p>
            </div>`;
    }
    contentHtml += `</div>
        <div class="row mt-3">
            <div class="col-12">
                <h6>Observações:</h6>
                <p>${pagamento.obs || 'Nenhuma observação.'}</p>
            </div>
        </div>`;

    modalBody.innerHTML = contentHtml;
    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Confirms and cancels a payment.
 */
function confirmarCancelarPagamento(id, tipo) {
    showConfirmModal(
        'Cancelar Pagamento',
        'Tem certeza que deseja cancelar este pagamento? Esta ação não pode ser desfeita.',
        () => cancelarPagamento(id, tipo) // Passa uma função anônima para chamar com os args corretos
    );
}
window.confirmarCancelarPagamento = confirmarCancelarPagamento; // Torna global para o data-callback-name

function cancelarPagamento(id, tipo) {
    const endpoint = tipo === 'agregado' ?
        `/api/pagamentos/agregados/${id}/` :
        `/api/pagamentos/proprios/${id}/`;

    Auth.fetchWithAuth(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' }) // Assumindo que 'cancelado' é um status válido
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.detail || 'Erro ao cancelar pagamento');
            });
        }
        return response.json();
    })
    .then(() => {
        showNotification('Pagamento cancelado com sucesso!', 'success');
        loadAlertas();
    })
    .catch(error => {
        console.error('Error canceling payment:', error);
        showNotification(`Erro ao cancelar pagamento: ${error.message}`, 'error');
    });
}


/**
 * Shows maintenance details
 */
function verDetalhesManutencao(id) {
    const manutencao = manutencoesList.find(m => m.id.toString() === id.toString());
    if (!manutencao) {
        showNotification('Manutenção não encontrada.', 'warning');
        return;
    }

    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');

    if (!modal || !modalTitle || !modalBody || !editBtn) return;

    modalTitle.textContent = `Detalhes da Manutenção - ${manutencao.veiculo_placa || 'Veículo'}`;
    editBtn.classList.remove('d-none');
    editBtn.onclick = () => {
        // Redirecionar para a página de manutenção ou abrir modal de edição
        // Exemplo: window.location.href = `/manutencao/editar/${id}/`;
        // Ou, se o modal de edição de manutenção for o mesmo que o de adicionar:
        // abrirModalManutencao(id); // Você precisaria de uma função para popular e abrir o modal de edição
        showNotification('Funcionalidade de editar manutenção a ser implementada a partir daqui.', 'info');
         const detailModalInstance = bootstrap.Modal.getInstance(modal);
         if(detailModalInstance) detailModalInstance.hide();
    };


    modalBody.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <p><strong>Veículo:</strong> ${manutencao.veiculo_placa || '--'}</p>
                <p><strong>Serviço Realizado:</strong> ${manutencao.servico_realizado || '--'}</p>
                <p><strong>Data do Serviço:</strong> ${formatDate(manutencao.data_servico)}</p>
                <p><strong>KM:</strong> ${formatNumber(manutencao.quilometragem) || '--'}</p>
            </div>
            <div class="col-md-6">
                <p><strong>Oficina:</strong> ${manutencao.oficina || '--'}</p>
                <p><strong>Valor Peças:</strong> ${formatCurrency(manutencao.valor_peca)}</p>
                <p><strong>Valor M. Obra:</strong> ${formatCurrency(manutencao.valor_mao_obra)}</p>
                <p><strong>Valor Total:</strong> ${formatCurrency(manutencao.valor_total)}</p>
                <p><strong>Status:</strong> ${getManutencaoStatusHTML(manutencao.status)}</p>
            </div>
        </div>
        <div class="mt-3">
            <h6>Observações:</h6>
            <p class="text-muted">${manutencao.observacoes || 'Nenhuma.'}</p>
        </div>`;

    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Confirms and updates maintenance status.
 */
function confirmarAtualizarManutencao(id, novoStatus) {
    const acao = novoStatus === 'PAGO' ? 'Marcar como Paga' : 'Cancelar';
    showConfirmModal(
        `${acao} Manutenção`,
        `Tem certeza que deseja ${acao.toLowerCase()} esta manutenção?`,
        () => atualizarManutencao(id, novoStatus)
    );
}
window.confirmarAtualizarManutencao = confirmarAtualizarManutencao;

function atualizarManutencao(id, novoStatus) {
    Auth.fetchWithAuth(`/api/manutencoes/${id}/`, { // Certifique-se que este é o endpoint correto (plural ou singular)
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.detail || `Erro ao atualizar manutenção para ${novoStatus}`);
            });
        }
        return response.json();
    })
    .then(() => {
        showNotification(`Manutenção atualizada para ${novoStatus} com sucesso!`, 'success');
        loadAlertas();
    })
    .catch(error => {
        console.error('Error updating maintenance:', error);
        showNotification(error.message, 'error');
    });
}


/**
 * Shows document details
 */
function verDetalhesDocumento(id, tipo) { // tipo can be 'cte' or 'mdfe'
    const documento = documentosList.find(d => d.id.toString() === id.toString());
     if (!documento) {
        showNotification('Documento não encontrado.', 'warning');
        return;
    }

    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');

    if (!modal || !modalTitle || !modalBody || !editBtn) return;

    const tipoDocDisplay = tipo.toUpperCase();
    modalTitle.textContent = `Detalhes do ${tipoDocDisplay} - ${documento.numero_cte || documento.numero_mdfe || documento.chave.substring(25,34)}`;
    editBtn.classList.add('d-none'); // Geralmente não se edita CT-e/MDF-e assim

    // Usar o serializer de detalhe da API para popular o modal
    Auth.fetchWithAuth(`/api/${tipo}s/${id}/`) // Ex: /api/ctes/{id}/ ou /api/mdfes/{id}/
        .then(res => res.ok ? res.json() : Promise.reject(res))
        .then(data => {
            let contentHtml = `<div class="row">
                <div class="col-md-6">
                    <p><strong>Chave:</strong> ${data.chave || '--'}</p>
                    <p><strong>Número:</strong> ${data.identificacao?.numero || data.identificacao?.n_mdf || '--'}</p>
                    <p><strong>Série:</strong> ${data.identificacao?.serie || '--'}</p>
                    <p><strong>Data Emissão:</strong> ${formatDateTime(data.identificacao?.data_emissao || data.identificacao?.dh_emi)}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Status Protocolo:</strong> ${data.protocolo?.codigo_status || 'N/A'} - ${data.protocolo?.motivo_status || 'N/A'}</p>
                    <p><strong>Cancelado:</strong> ${data.cancelamento ? 'Sim' : 'Não'}</p>
                    ${tipo === 'mdfe' ? `<p><strong>Encerrado:</strong> ${data.encerrado ? 'Sim' : 'Não'}</p>` : ''}
                    <p><strong>Processado:</strong> ${data.processado ? 'Sim' : 'Não'}</p>
                </div>
            </div>`;
            if (data.emitente) {
                contentHtml += `<h6 class="mt-3">Emitente</h6>
                                <p>${data.emitente.razao_social || data.emitente.xNome || '--'} (CNPJ: ${formatCNPJ(data.emitente.cnpj)})</p>`;
            }
            // Adicionar mais detalhes conforme necessário (remetente, destinatário, etc.)
            modalBody.innerHTML = contentHtml;
        })
        .catch(err => {
            console.error(`Erro ao buscar detalhes do ${tipoDocDisplay}:`, err);
            modalBody.innerHTML = `<p class="text-danger">Não foi possível carregar os detalhes.</p>`;
        });
    
    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
}

function reprocessarDocumento(id, tipo) {
    const endpoint = tipo === 'cte' ? `/api/ctes/${id}/reprocessar/` : `/api/mdfes/${id}/reprocessar/`;
    showConfirmModal(
        `Reprocessar ${tipo.toUpperCase()}`,
        `Tem certeza que deseja solicitar o reprocessamento deste ${tipo.toUpperCase()}?`,
        () => {
            Auth.fetchWithAuth(endpoint, { method: 'POST' })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => Promise.reject(err.error || `Falha ao reprocessar ${tipo.toUpperCase()}`));
                    }
                    return response.json();
                })
                .then(data => {
                    showNotification(data.message || `${tipo.toUpperCase()} enviado para reprocessamento.`, 'success');
                    loadAlertas(); // Recarregar para atualizar status
                })
                .catch(error => {
                    showNotification(error.toString(), 'error');
                });
        }
    );
}
window.reprocessarDocumento = reprocessarDocumento;


/**
 * Shows system alert details
 */
function verDetalhesAlertaSistema(id) {
    const alerta = sistemaList.find(a => a.id.toString() === id.toString());
    if (!alerta) {
        showNotification('Alerta não encontrado.', 'warning');
        return;
    }

    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('btnEditarItem');

    if (!modal || !modalTitle || !modalBody || !editBtn) return;

    modalTitle.textContent = `Detalhes do Alerta - ${alerta.tipo || 'Sistema'}`;
    editBtn.classList.add('d-none');

    modalBody.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <p><strong>Tipo:</strong> ${alerta.tipo || '--'}</p>
                <p><strong>Data/Hora:</strong> ${formatDateTime(alerta.data_hora)}</p>
                <p><strong>Prioridade:</strong> ${getPrioridadeHTML(alerta.prioridade)}</p>
            </div>
             <div class="col-md-6">
                <p><strong>Módulo:</strong> ${alerta.modulo || '--'}</p>
                <p><strong>Usuário:</strong> ${alerta.usuario || '--'}</p>
                <p><strong>Referência:</strong> ${alerta.referencia || '--'}</p>
            </div>
        </div>
        <div class="mt-3">
            <h6>Mensagem:</h6>
            <p class="alert alert-info">${alerta.mensagem || 'Nenhuma mensagem.'}</p>
        </div>
        ${alerta.dados_adicionais ? `
            <div class="mt-3">
                <h6>Dados Adicionais:</h6>
                <pre class="bg-light p-2 rounded small">${escapeHtml(formatJson(alerta.dados_adicionais))}</pre>
            </div>` : ''
        }`;
    
    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();
}

/**
 * Confirms and clears a system alert.
 */
function confirmLimparAlertaSistema(id) {
    showConfirmModal(
        'Limpar Alerta do Sistema',
        'Tem certeza que deseja limpar este alerta?',
        () => limparAlertaSistema(id)
    );
}
window.confirmLimparAlertaSistema = confirmLimparAlertaSistema;

function limparAlertaSistema(id) {
    Auth.fetchWithAuth(`/api/alertas/sistema/${id}/`, { method: 'DELETE' })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => Promise.reject(err));
            }
            showNotification('Alerta removido com sucesso.', 'success');
            // Remover localmente
            sistemaList = sistemaList.filter(a => a.id.toString() !== id.toString());
            renderSistemaTable();
            updateSummaryCards(pagamentosList.length, manutencoesList.length, documentosList.length, sistemaList.length);
        })
        .catch(() => {
            showNotification('Falha ao remover alerta.', 'error');
        });
}

/**
 * Confirms and clears all system alerts.
 */
function confirmLimparAlertasSistema() {
    Auth.fetchWithAuth('/api/alertas/sistema/limpar_todos/', { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => Promise.reject(err));
            }
            showNotification('Todos os alertas do sistema foram limpos.', 'success');
            sistemaList = [];
            renderSistemaTable();
            updateSummaryCards(pagamentosList.length, manutencoesList.length, documentosList.length, 0);
        })
        .catch(() => {
            showNotification('Falha ao limpar alertas do sistema.', 'error');
        });
}
window.confirmLimparAlertasSistema = confirmLimparAlertasSistema; // Torna global para o data-callback-name


function exportarAlertas(tipo) {
    let dataToExport = [];
    let filename = `alertas_${tipo}_${formatDateForInput(new Date())}.csv`;
    let headers = [];

    switch (tipo) {
        case 'pagamentos':
            dataToExport = pagamentosList;
            headers = ["Tipo Pgto", "Documento Ref.", "Destinatário/Veículo", "Vencimento", "Valor (R$)", "Status"];
            dataToExport = dataToExport.map(p => [
                p.cte_chave ? 'Agregado (CT-e)' : 'Próprio (Período)',
                p.cte_chave || p.periodo || '',
                p.condutor_nome || p.veiculo_placa || '',
                formatDate(p.data_prevista),
                (p.valor_repassado || p.valor_total_pagar || 0).toString().replace('.',','),
                p.status
            ]);
            break;
        case 'manutencoes':
            dataToExport = manutencoesList;
            headers = ["Veículo", "Serviço", "Data Agendada", "KM", "Oficina", "Valor Total (R$)", "Status"];
            dataToExport = dataToExport.map(m => [
                m.veiculo_placa || '',
                m.servico_realizado || '',
                formatDate(m.data_servico),
                m.quilometragem || '',
                m.oficina || '',
                (m.valor_total || 0).toString().replace('.',','),
                m.status
            ]);
            break;
        case 'documentos':
            dataToExport = documentosList;
            headers = ["Tipo Doc.", "Número", "Chave", "Data Emissão", "Status API", "Mensagem API"];
            dataToExport = dataToExport.map(d => {
                const tipoDoc = d.chave.substring(20,22) === '57' ? 'CT-e' : (d.chave.substring(20,22) === '58' ? 'MDF-e' : 'Outro');
                const numeroDoc = tipoDoc === 'CT-e' ? d.numero_cte : (tipoDoc === 'MDF-e' ? d.numero_mdfe : 'N/A');
                return [
                    tipoDoc,
                    numeroDoc || '',
                    d.chave || '',
                    formatDate(d.data_emissao),
                    d.status || '',
                    d.protocolo_motivo || ''
                ];
            });
            break;
        default:
            showNotification("Tipo de exportação desconhecido.", "error");
            return;
    }

    if (dataToExport.length === 0) {
        showNotification(`Nenhum dado de ${tipo} para exportar.`, "info");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n"
                   + dataToExport.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


/**
 * Shows loading state
 */
function showLoading() {
    const loadingHTML = (cols) => `<tr><td colspan="${cols}" class="text-center"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>Carregando...</td></tr>`;
    document.getElementById('pagamentos-list').innerHTML = loadingHTML(7);
    document.getElementById('manutencoes-list').innerHTML = loadingHTML(8);
    document.getElementById('documentos-list').innerHTML = loadingHTML(7);
    document.getElementById('sistema-list').innerHTML = loadingHTML(5);

    const filterButton = document.querySelector('#filterForm button[type="button"]');
    if (filterButton) filterButton.disabled = true;
}

/**
 * Hides loading state
 */
function hideLoading() {
    const filterButton = document.querySelector('#filterForm button[type="button"]');
    if (filterButton) filterButton.disabled = false;
}

// --- Funções utilitárias (algumas podem estar em scripts.js) ---

function getDiasParaVencimento(dataVencimento) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Normaliza para comparar apenas a data
    dataVencimento.setHours(0, 0, 0, 0);
    const diffTime = dataVencimento - hoje;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getPagamentoStatusHTML(status) {
    const map = {
        'pendente': '<span class="badge bg-warning text-dark">Pendente</span>',
        'pago': '<span class="badge bg-success">Pago</span>',
        'atrasado': '<span class="badge bg-danger">Atrasado</span>',
        'cancelado': '<span class="badge bg-secondary">Cancelado</span>'
    };
    return map[status.toLowerCase()] || `<span class="badge bg-light text-dark">${status}</span>`;
}

function getManutencaoStatusHTML(status) {
    const map = {
        'PENDENTE': '<span class="badge bg-warning text-dark">Pendente</span>',
        'AGENDADO': '<span class="badge bg-info">Agendado</span>',
        'PAGO': '<span class="badge bg-success">Pago</span>',
        'CANCELADO': '<span class="badge bg-danger">Cancelado</span>'
    };
    return map[status] || `<span class="badge bg-secondary">${status}</span>`;
}

function getDocumentoStatusHTML(status) {
     // O 'status' aqui é o campo 'status' do CTeDocumentoListSerializer
    if (!status) return '<span class="badge bg-secondary">--</span>';
    if (status.startsWith("Cancelado")) return '<span class="badge bg-danger">Cancelado</span>';
    if (status.startsWith("Autorizado")) return '<span class="badge bg-success">Autorizado</span>';
    if (status.startsWith("Rejeitado")) return `<span class="badge bg-warning text-dark">${status}</span>`;
    if (status.startsWith("Processado")) return '<span class="badge bg-info">Processado (s/ Prot.)</span>';
    return `<span class="badge bg-secondary">${status}</span>`;
}


function getPrioridadeHTML(prioridade) {
    if (!prioridade) return '<span class="badge bg-info">Normal</span>'; // Default
    const map = {
        'alta': '<span class="badge bg-danger">Alta</span>',
        'media': '<span class="badge bg-warning text-dark">Média</span>',
        'baixa': '<span class="badge bg-info">Baixa</span>'
    };
    return map[prioridade.toLowerCase()] || `<span class="badge bg-secondary">${prioridade}</span>`;
}

// Funções de formatação (presumindo que estão em scripts.js ou definidas globalmente)
// Se não estiverem, descomente e ajuste ou importe de scripts.js
/*
function formatDate(dateStr) {
    if (!dateStr) return '--';
    try { return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR'); } // Adiciona T00:00:00 para evitar problemas de fuso com datas
    catch (e) { return dateStr; }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    try { return new Date(dateStr).toLocaleString('pt-BR'); }
    catch (e) { return dateStr; }
}

function formatCurrency(value) {
    return parseFloat(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value) {
    return parseInt(value || 0).toLocaleString('pt-BR');
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }
 function formatJson(data) {
    if (!data) return '';
    try {
        const obj = typeof data === 'string' ? JSON.parse(data) : data;
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        return String(data);
    }
}
*/

// Certifique-se que `showNotification` e `Auth.fetchWithAuth` estão disponíveis globalmente (de scripts.js e auth.js)
if (typeof showNotification !== 'function') {
    console.warn("Função global showNotification não encontrada. Defina-a em scripts.js.");
    window.showNotification = (message, type) => console.log(`[${type}] ${message}`);
}
if (typeof Auth !== 'object' || typeof Auth.fetchWithAuth !== 'function') {
    console.error("Objeto Auth ou Auth.fetchWithAuth não encontrado. Certifique-se que auth.js foi carregado.");
    // Fallback muito básico
    window.Auth = { fetchWithAuth: (url, options) => fetch(url, options) };
}

// Funções de formatação já devem estar em scripts.js, mas para garantir:
function formatCPF(cpf) {
    if (!cpf) return '--';
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return cpf;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}