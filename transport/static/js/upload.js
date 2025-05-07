/**
 * upload.js
 * Funcionalidades para upload de arquivos XML (CT-e, MDF-e e eventos)
 * Versão: 1.1.0 (Ajustada)
 */

// Assumindo que 'Auth', 'formatDateTime', 'showNotification' (usando Toasts)
// e outras funções de formatação/utilidade estão definidas globalmente (ex: em scripts.js e auth.js)

/**
 * Inicializa a página de upload quando o DOM é carregado
 */
document.addEventListener('DOMContentLoaded', function() {
    // Configurar manipulador de submissão do formulário
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadXML();
        });
    }

    // Carregar histórico de uploads recentes
    loadUploadHistory();

    // Limpar labels dos inputs de arquivo ao selecionar
    // (O navegador geralmente já faz isso, mas garante)
    document.getElementById('arquivo_xml')?.addEventListener('change', function() {
        // Não precisa atualizar label explicitamente em BS5 com input-group
    });
    document.getElementById('arquivo_xml_retorno')?.addEventListener('change', function() {
        // Não precisa atualizar label explicitamente em BS5 com input-group
    });

});

/**
 * Realiza o upload do arquivo XML
 */
function uploadXML() {
    // Obter elementos do formulário e progresso
    const uploadForm = document.getElementById('uploadForm');
    const progressBar = document.querySelector('#uploadProgress .progress-bar');
    const progressContainer = document.getElementById('uploadProgress');
    const submitButton = document.querySelector('#uploadForm button[type="submit"]');
    const fileInput = document.getElementById('arquivo_xml');
    const retornoInput = document.getElementById('arquivo_xml_retorno');

    // Verificar se o arquivo principal foi selecionado
    if (!fileInput || !fileInput.files.length) {
        // Usar a função global de notificação
        if (typeof showNotification === 'function') {
            showNotification('Por favor, selecione um arquivo XML para upload.', 'warning');
        } else {
            alert('Por favor, selecione um arquivo XML para upload.');
        }
        return;
    }

    // --- Feedback de Carregamento ---
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Processando...';
    }
    hideMessages(); // Esconder mensagens de erro/sucesso anteriores
    if (progressContainer && progressBar) {
        progressContainer.classList.remove('d-none');
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
        progressBar.classList.remove('bg-success', 'bg-danger'); // Reseta cor
        progressBar.classList.add('progress-bar-animated');
    }
    // ---------------------------------

    // Preparar FormData
    const formData = new FormData();
    formData.append('arquivo_xml', fileInput.files[0]);
    if (retornoInput && retornoInput.files.length > 0) {
        formData.append('arquivo_xml_retorno', retornoInput.files[0]);
    }

    // Simulação de Progresso (mantida para UX, mas não reflete o upload real com fetch)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 5;
        if (progress <= 95 && progressBar) { // Não ir até 100% imediatamente
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
        }
    }, 150);

    // Realizar o upload com autenticação
    Auth.fetchWithAuth('/api/upload/', {
        method: 'POST',
        // Não incluir 'Content-Type', o navegador define com 'boundary' correto
        body: formData
    })
    .then(response => {
        clearInterval(progressInterval); // Parar simulação
        // Lidar com a resposta
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.setAttribute('aria-valuenow', 100);
            progressBar.classList.remove('progress-bar-animated');
        }
        if (!response.ok) {
            // Se a resposta não for OK, tentar ler o JSON de erro
            return response.json().then(errData => {
                // Anexar o status code ao erro para mais contexto
                errData.statusCode = response.status;
                throw errData; // Lança o objeto de erro para o catch
            }).catch(() => {
                // Se não conseguir ler JSON, lança erro genérico com status
                 throw new Error(`Erro ${response.status}: ${response.statusText}`);
            });
        }
        return response.json(); // Processa a resposta JSON de sucesso
    })
    .then(data => {
        // --- Sucesso ---
        if (progressBar) progressBar.classList.add('bg-success');
        let mensagem = data.message || 'Arquivo processado com sucesso!';
        if (data.chave) {
            mensagem += ` Chave: ${formatChave(data.chave)}`; // Usar função global
        }
        showUploadSuccess(mensagem);
        uploadForm.reset(); // Limpar formulário
        loadUploadHistory(); // Atualizar histórico
        setTimeout(() => {
            progressContainer?.classList.add('d-none'); // Esconder barra após sucesso
            progressBar?.classList.remove('bg-success');
        }, 3000);
        // ----------------
    })
    .catch(error => {
        // --- Erro ---
        clearInterval(progressInterval); // Garante que parou a simulação
        console.error('Erro de upload:', error);
        if (progressBar) {
            progressBar.style.width = '100%'; // Marca 100% mas com erro
             progressBar.classList.remove('progress-bar-animated');
             progressBar.classList.add('bg-danger'); // Cor de erro
        }

        // Formatar a mensagem de erro detalhada
        let detailedMessage = 'Erro ao processar o arquivo. Tente novamente.';
        if (error && (error.error || error.detail)) {
             detailedMessage = error.error || error.detail;
        } else if (error && typeof error === 'object' && error.message) {
            detailedMessage = error.message;
        } else if (typeof error === 'string') {
             detailedMessage = error;
        }
         // Se for um objeto de erros do DRF (ex: validação do serializer)
         else if (typeof error === 'object' && !error.message && Object.keys(error).length > 0 && error.statusCode !== 500) {
             detailedMessage = Object.entries(error)
                 .filter(([key]) => key !== 'statusCode') // Não exibir statusCode na mensagem
                 .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                 .join('; ');
         }

        showUploadError(detailedMessage);
        setTimeout(() => {
            progressContainer?.classList.add('d-none'); // Esconder barra após erro
            progressBar?.classList.remove('bg-danger');
        }, 5000);
        // ---------------
    })
    .finally(() => {
        // --- Sempre Executa ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-upload me-2"></i>Enviar Arquivo';
        }
        // ---------------------
    });
}

/**
 * Mostra mensagem de sucesso na área designada.
 * @param {string} message - Mensagem de sucesso.
 */
function showUploadSuccess(message) {
    const successAlert = document.getElementById('uploadSuccess');
    const successMessage = document.getElementById('successMessage');

    if (successAlert && successMessage) {
        successMessage.textContent = message;
        successAlert.classList.remove('d-none');
        hideMessages('uploadError'); // Esconde erro se sucesso
        successAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        // Fallback se elementos não encontrados
        if (typeof showNotification === 'function') {
             showNotification(message, 'success');
        } else {
             alert(message);
        }
    }
}

/**
 * Mostra mensagem de erro na área designada.
 * @param {string} message - Mensagem de erro.
 */
function showUploadError(message) {
    const errorAlert = document.getElementById('uploadError');
    const errorMessage = document.getElementById('errorMessage');

    if (errorAlert && errorMessage) {
        errorMessage.textContent = message;
        errorAlert.classList.remove('d-none');
        hideMessages('uploadSuccess'); // Esconde sucesso se erro
        errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        // Fallback se elementos não encontrados
        if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            alert(`Erro: ${message}`);
        }
    }
}

/**
 * Esconde uma ou ambas as mensagens de alerta.
 * @param {('uploadSuccess'|'uploadError'|'both')} [which='both'] - Qual alerta esconder.
 */
function hideMessages(which = 'both') {
    if (which === 'both' || which === 'uploadSuccess') {
        document.getElementById('uploadSuccess')?.classList.add('d-none');
    }
    if (which === 'both' || which === 'uploadError') {
        document.getElementById('uploadError')?.classList.add('d-none');
    }
}

/**
 * Carrega o histórico de uploads recentes buscando CTes e MDFes.
 */
function loadUploadHistory() {
    const tbody = document.getElementById('upload-history');
    if (!tbody) return;

    // Mostrar mensagem de carregamento
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                <div class="spinner-border spinner-border-sm text-secondary me-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                Carregando histórico...
            </td>
        </tr>`;

    // Buscar CTes e MDFes mais recentes em paralelo
    Promise.all([
        Auth.fetchWithAuth('/api/ctes/?ordering=-data_upload&limit=10'), // Ordena por data de upload
        Auth.fetchWithAuth('/api/mdfes/?ordering=-data_upload&limit=10') // Ordena por data de upload
    ])
    .then(async ([ctesResponse, mdfesResponse]) => {
        // Processar resultados mesmo se um falhar
        const ctes = ctesResponse.ok ? await ctesResponse.json() : { results: [] };
        const mdfes = mdfesResponse.ok ? await mdfesResponse.json() : { results: [] };

        // Mapear para formato comum e adicionar tipo
        const cteMapped = (ctes.results || []).map(item => ({
            ...item, // Inclui todos os dados originais
            tipo: 'CTE',
            // Usa data_upload se existir, senão data_emissao ou data atual
            data_ordenacao: item.data_upload || item.data_emissao || new Date(0).toISOString(),
            // Status pode precisar de lógica mais complexa baseada nos dados completos
            status: item.status || (item.processado ? (item.autorizado ? 'Autorizado' : (item.cancelado ? 'Cancelado' : 'Processado')) : 'Pendente')
        }));

        const mdfeMapped = (mdfes.results || []).map(item => ({
            ...item, // Inclui todos os dados originais
            tipo: 'MDFE',
            data_ordenacao: item.data_upload || item.data_emissao || new Date(0).toISOString(),
            status: item.status || (item.processado ? (item.autorizado ? 'Autorizado' : (item.cancelado ? 'Cancelado' : (item.encerrado ? 'Encerrado' : 'Processado'))) : 'Pendente')
        }));

        // Combinar, ordenar pela data de ordenação (upload ou emissão) e limitar
        const combined = [...cteMapped, ...mdfeMapped]
            .sort((a, b) => new Date(b.data_ordenacao) - new Date(a.data_ordenacao))
            .slice(0, 10); // Limita aos 10 mais recentes no total

        return combined;
    })
    .then(data => {
        renderUploadHistory(data, tbody);
    })
    .catch(error => {
        console.error('Erro ao carregar histórico de uploads:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Erro ao carregar histórico. Tente novamente.
                </td>
            </tr>`;
        if (typeof showNotification === 'function') {
             showNotification('Erro ao carregar histórico de uploads.', 'error');
        }
    });
}

/**
 * Renderiza o histórico de uploads na tabela.
 * @param {Array} data - Lista de uploads (formato combinado).
 * @param {HTMLElement} tbody - Elemento tbody para renderizar.
 */
function renderUploadHistory(data, tbody) {
    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <i class="fas fa-info-circle me-2 text-info"></i>
                    Nenhum upload encontrado no histórico recente.
                </td>
            </tr>`;
        return;
    }

    // Renderizar linhas da tabela
    let html = '';

    data.forEach(item => {
        const dataFormatada = typeof formatDateTime === 'function' ? formatDateTime(item.data_ordenacao) : item.data_ordenacao;
        const tipoDoc = getTipoDocumento(item); // Função auxiliar
        const statusHTML = getStatusHTML(item); // Função auxiliar
        const chaveFormatada = formatChave(item.chave || ''); // Função auxiliar
        const apiPath = getApiPath(item.tipo); // Função auxiliar

        // Link para detalhes (se houver ID)
        const detailLink = item.id ? `/api/${apiPath}/${item.id}/` : '#';
        // Link para XML (se houver ID)
        const xmlLink = item.id ? `/api/${apiPath}/${item.id}/xml/` : '#';
        const isDisabled = !item.id ? 'disabled' : ''; // Desabilita botões se não houver ID

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${tipoDoc}</td>
                <td title="${item.chave || ''}">${chaveFormatada}</td>
                <td>${statusHTML}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <a href="${detailLink}"
                           class="btn btn-outline-primary ${isDisabled}"
                           title="Ver Detalhes"
                           ${isDisabled ? 'aria-disabled="true"' : ''}
                           target="_blank"> <i class="fas fa-eye"></i>
                        </a>
                        <a href="${xmlLink}"
                           class="btn btn-outline-success ${isDisabled}"
                           title="Download XML"
                           ${isDisabled ? 'aria-disabled="true"' : ''}
                           target="_blank"> <i class="fas fa-file-code"></i>
                        </a>
                    </div>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html;

    // Reativar tooltips após renderização, se Bootstrap estiver disponível
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
        const tooltips = tbody.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltips.forEach(tooltip => new bootstrap.Tooltip(tooltip));
    }
}

// --- Funções Auxiliares Específicas de Upload ---

/**
 * Obtém o tipo de documento formatado.
 * @param {Object} item - Dados do documento.
 * @returns {string} - Tipo de documento formatado.
 */
function getTipoDocumento(item) {
    const tipo = item.tipo?.toUpperCase() || '';
    if (tipo === 'CTE') return 'CT-e';
    if (tipo === 'MDFE') return 'MDF-e';
    // Adicionar lógica para eventos se necessário, baseado em dados extras
    return item.tipo || 'Documento';
}

/**
 * Obtém o caminho da API para o tipo de documento.
 * @param {string} tipo - Tipo de documento ('CTE', 'MDFE').
 * @returns {string} - Caminho da API (ex: 'ctes', 'mdfes').
 */
function getApiPath(tipo) {
    const tipoUpper = (tipo || '').toUpperCase();
    if (tipoUpper === 'CTE') return 'ctes';
    if (tipoUpper === 'MDFE') return 'mdfes';
    return 'documentos'; // Fallback genérico
}

/**
 * Obtém o HTML do badge de status.
 * @param {Object} item - Dados do documento/upload.
 * @returns {string} - HTML para o badge de status.
 */
function getStatusHTML(item) {
    const status = (item.status || '').toLowerCase();

    if (status.includes('cancelado')) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    if (status.includes('encerrado')) {
        return '<span class="badge bg-secondary">Encerrado</span>';
    }
    if (status.includes('autorizado')) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    if (status.includes('processado')) {
        return '<span class="badge bg-info text-dark">Processado</span>';
    }
     if (status.includes('rejeitado')) {
        return '<span class="badge bg-warning text-dark">Rejeitado</span>';
    }
    return '<span class="badge bg-warning text-dark">Pendente</span>'; // Default
}

/**
 * Formata a chave do documento (ex: primeiros 4 e últimos 4 dígitos).
 * @param {string} chave - Chave do documento (44 dígitos).
 * @returns {string} - Chave formatada ou original se não tiver 44 dígitos.
 */
function formatChave(chave) {
    if (!chave) return '--';
    if (chave.length === 44) {
        return `${chave.substring(0, 4)}...${chave.substring(40)}`;
    }
    return chave.length > 20 ? chave.substring(0, 17) + '...' : chave;
}

/**
 * Exporta funções para uso global (ex: botão de refresh manual).
 */
window.UploadXML = {
    uploadFile: uploadXML,
    refreshHistory: loadUploadHistory
};