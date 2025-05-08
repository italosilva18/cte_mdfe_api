/**
 * upload.js
 * Funcionalidades para upload de arquivos XML (CT-e, MDF-e e eventos)
 * Versão: 1.2.0 (Ajustada para IDs corretos e histórico)
 */

// Assumindo que 'Auth' está definido globalmente (em auth.js)
// Assumindo que funções como showNotification, formatDateTime estão em scripts.js
// Caso não estejam, defina versões básicas aqui.

/**
 * Inicializa a página de upload quando o DOM é carregado
 */
document.addEventListener('DOMContentLoaded', function() {
    // Configurar manipulador de submissão do formulário
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            // Previne o envio padrão do HTML, garantindo que o fetch seja usado
            e.preventDefault();
            console.log("Form submit intercepted."); // Log para depuração
            uploadXML();
        });
    } else {
        console.error("Formulário de upload (uploadForm) não encontrado.");
    }

    // Carregar histórico de uploads recentes
    loadUploadHistory();

    // Botão para atualizar histórico (opcional)
    const refreshHistoryBtn = document.querySelector('button[onclick="UploadXML.refreshHistory()"]');
    if (refreshHistoryBtn) {
        refreshHistoryBtn.removeAttribute('onclick'); // Remove handler inline
        refreshHistoryBtn.addEventListener('click', loadUploadHistory);
    } else {
         // Tenta encontrar pelo ID se o onclick foi removido no HTML
         const refreshBtnById = document.getElementById('refreshHistoryBtn'); // Exemplo de ID
         if(refreshBtnById) refreshBtnById.addEventListener('click', loadUploadHistory);
    }
});

/**
 * Realiza o upload do arquivo XML via API Fetch
 */
function uploadXML() {
    console.log("uploadXML function called."); // Log para depuração

    // Obter elementos do formulário e de feedback
    const uploadForm = document.getElementById('uploadForm');
    const progressBar = document.querySelector('#uploadProgress .progress-bar');
    const progressContainer = document.getElementById('uploadProgress');
    const submitButton = document.getElementById('btnSubmit'); // Usar ID é mais seguro
    const fileInput = document.getElementById('arquivo_xml');
    const retornoInput = document.getElementById('arquivo_xml_retorno');

    // Verificar se o arquivo principal foi selecionado
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showUploadError('Por favor, selecione um arquivo XML principal.');
        return;
    }

    // --- Feedback de Carregamento ---
    if (submitButton) {
        submitButton.disabled = true;
        // Atualiza o conteúdo do botão para mostrar carregamento
        submitButton.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Enviando...
        `;
    }
    hideMessages(); // Esconder mensagens de erro/sucesso anteriores
    if (progressContainer && progressBar) {
        progressContainer.classList.remove('d-none');
        progressBar.style.width = '0%';
        progressBar.textContent = '0%'; // Mostra porcentagem na barra
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

    // Simulação de Progresso (apenas visual, não reflete o upload real do fetch)
    let progress = 0;
    const increment = 5;
    const intervalTime = 150; // ms
    let progressInterval = null; // Declara fora para poder limpar no catch/finally

    if (progressBar) {
        progressInterval = setInterval(() => {
            progress += increment;
            const displayProgress = Math.min(progress, 95); // Não ir até 100% imediatamente
            progressBar.style.width = `${displayProgress}%`;
            progressBar.textContent = `${displayProgress}%`;
            progressBar.setAttribute('aria-valuenow', displayProgress);
            if (progress >= 100) {
                clearInterval(progressInterval); // Para a simulação se atingir 100
            }
        }, intervalTime);
    }

    // Realizar o upload com autenticação (Auth.fetchWithAuth de auth.js)
    Auth.fetchWithAuth('/api/upload/', { // Endpoint da API unificada
        method: 'POST',
        body: formData
        // Nota: Não defina 'Content-Type', o navegador define automaticamente
        // com 'multipart/form-data' e o 'boundary' correto para FormData.
    })
    .then(response => {
        clearInterval(progressInterval); // Para a simulação
        // Lidar com a resposta
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressBar.setAttribute('aria-valuenow', 100);
            progressBar.classList.remove('progress-bar-animated');
        }
        if (!response.ok) {
            // Tenta ler o JSON de erro do backend
            return response.json().then(errData => {
                // Anexa o status code ao erro para mais contexto
                errData.statusCode = response.status;
                throw errData; // Lança o objeto de erro para o catch
            }).catch((jsonParseError) => {
                 // Se não conseguir ler JSON, lança erro genérico com status
                 console.error("Erro ao parsear JSON de erro:", jsonParseError);
                 throw new Error(`Erro ${response.status}: ${response.statusText || 'Falha na comunicação com o servidor.'}`);
            });
        }
        return response.json(); // Processa a resposta JSON de sucesso
    })
    .then(data => {
        // --- Sucesso ---
        if (progressBar) progressBar.classList.add('bg-success');

        let mensagem = data.message || 'Arquivo processado com sucesso!';
        if (data.chave) { // Adiciona a chave se retornada
            mensagem += ` Chave: ${formatChave(data.chave)}`;
        } else if (data.documento && data.documento !== 'N/A') { // Adiciona a chave de evento
             mensagem += ` Documento: ${formatChave(data.documento)}`;
        }
        showUploadSuccess(mensagem);

        // Limpar campos de arquivo após sucesso
        fileInput.value = '';
        if(retornoInput) retornoInput.value = '';

        loadUploadHistory(); // Atualizar histórico

        // Esconder barra de progresso após um tempo
        setTimeout(() => {
            progressContainer?.classList.add('d-none');
            progressBar?.classList.remove('bg-success');
        }, 3000);
        // ----------------
    })
    .catch(error => {
        // --- Erro ---
        if(progressInterval) clearInterval(progressInterval); // Garante que parou a simulação
        console.error('Erro detalhado no upload:', error);
        if (progressBar) {
            progressBar.style.width = '100%'; // Marca 100% mas com erro
            progressBar.textContent = 'Erro!';
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-danger'); // Cor de erro
        }

        // Formatar a mensagem de erro detalhada
        let detailedMessage = 'Erro ao processar o arquivo. Verifique o console (F12) e tente novamente.';
        if (error && error.error) { // Erro estruturado vindo do backend DRF
             detailedMessage = error.error;
             if(error.details) { // Adiciona detalhes se houver
                 detailedMessage += ` Detalhes: ${error.details}`;
             }
        } else if (error && typeof error === 'object' && error.message) { // Erro JS padrão
            detailedMessage = error.message;
        } else if (typeof error === 'string') { // Erro como string
             detailedMessage = error;
        }
        // Se for um objeto de erros de validação do DRF
         else if (error && typeof error === 'object' && !error.message && error.statusCode !== 500) {
             detailedMessage = Object.entries(error)
                 .filter(([key]) => key !== 'statusCode') // Não exibir statusCode na mensagem
                 .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                 .join('; ');
             detailedMessage = `Erro de validação: ${detailedMessage}`;
         }

        showUploadError(detailedMessage);

        // Esconder barra de progresso após um tempo maior em caso de erro
        setTimeout(() => {
            progressContainer?.classList.add('d-none');
            progressBar?.classList.remove('bg-danger');
        }, 5000);
        // ---------------
    })
    .finally(() => {
        // --- Sempre Executa ---
        if (submitButton) {
            submitButton.disabled = false;
            // Restaura o texto e ícone original do botão
            submitButton.innerHTML = `
                <i class="fas fa-upload me-2"></i>Enviar Arquivo
            `;
        }
        // Resetar o formulário aqui pode limpar o arquivo selecionado antes do usuário ver o erro
        // uploadForm.reset();
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
        // Fallback: Usar notificação global se disponível
        if (typeof showNotification === 'function') {
             showNotification(message, 'success');
        } else {
             alert(message); // Fallback simples
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
         // Fallback: Usar notificação global se disponível
        if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            alert(`Erro: ${message}`); // Fallback simples
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
    if (!tbody) {
        console.warn("Elemento tbody 'upload-history' não encontrado para exibir histórico.");
        return;
    }

    // Mostrar mensagem de carregamento
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center p-4">
                <div class="spinner-border spinner-border-sm text-secondary me-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                Carregando histórico...
            </td>
        </tr>`;

    // Buscar CTes e MDFes mais recentes em paralelo (últimos 10 por tipo)
    // A API precisa suportar ordenação por `data_upload` e limitação
    // Usamos 'ordering=-data_upload' para pegar os mais recentes primeiro
    Promise.all([
        Auth.fetchWithAuth('/api/ctes/?ordering=-data_upload&limit=10'),
        Auth.fetchWithAuth('/api/mdfes/?ordering=-data_upload&limit=10')
    ])
    .then(async ([ctesResponse, mdfesResponse]) => {
        let combined = [];
        try {
            // Processar CTes
            if (ctesResponse.ok) {
                const ctesData = await ctesResponse.json();
                const cteMapped = (ctesData.results || []).map(item => mapToHistoryItem(item, 'CTE'));
                combined.push(...cteMapped);
            } else {
                console.error(`Erro ao buscar CTes: ${ctesResponse.status}`);
            }
        } catch (e) {
             console.error("Erro ao processar resposta de CTes:", e);
        }

        try {
            // Processar MDFes
            if (mdfesResponse.ok) {
                const mdfesData = await mdfesResponse.json();
                const mdfeMapped = (mdfesData.results || []).map(item => mapToHistoryItem(item, 'MDFE'));
                combined.push(...mdfeMapped);
            } else {
                 console.error(`Erro ao buscar MDFes: ${mdfesResponse.status}`);
            }
        } catch (e) {
            console.error("Erro ao processar resposta de MDFes:", e);
        }

        // Ordenar combinados pela data de upload (mais recente primeiro) e pegar os top 10 gerais
        combined.sort((a, b) => new Date(b.data_ordenacao) - new Date(a.data_ordenacao));
        return combined.slice(0, 10);
    })
    .then(data => {
        renderUploadHistory(data, tbody);
    })
    .catch(error => {
        console.error('Erro ao carregar histórico de uploads:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger p-4">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Erro ao carregar histórico. Tente atualizar a página.
                </td>
            </tr>`;
        showUploadError('Não foi possível carregar o histórico de uploads.');
    });
}

/**
 * Mapeia dados da API para um formato de item de histórico unificado.
 * @param {Object} item - Item da API (CTe ou MDFe).
 * @param {string} tipo - Tipo do documento ('CTE' ou 'MDFE').
 * @returns {Object} - Objeto formatado para o histórico.
 */
function mapToHistoryItem(item, tipo) {
    return {
        id: item.id,
        chave: item.chave,
        // Usa data_upload como preferência, senão data_emissao, senão data inválida
        data_ordenacao: item.data_upload || (tipo === 'CTE' ? item.data_emissao : item.data_emissao) || '1970-01-01T00:00:00Z',
        tipo: tipo,
        // Passa o objeto inteiro para a função de status poder verificar mais campos
        status_obj: item
    };
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
                <td colspan="5" class="text-center p-4">
                    <i class="fas fa-info-circle me-2 text-muted"></i>
                    Nenhum upload encontrado no histórico recente.
                </td>
            </tr>`;
        return;
    }

    // Renderizar linhas da tabela
    let html = '';

    data.forEach(item => {
        const dataFormatada = formatDateTime(item.data_ordenacao); // Usar função helper
        const tipoDoc = getTipoDocumento(item);
        const statusHTML = getStatusHTML(item.status_obj); // Usar função helper
        const chaveFormatada = formatChave(item.chave || ''); // Usar função helper
        const apiPath = getApiPath(item.tipo); // Usar função helper

        // Link para detalhes (API) - abre em nova aba
        const detailLink = `/api/${apiPath}/${item.id}/`;
        // Link para XML (API) - abre em nova aba
        const xmlLink = `/api/${apiPath}/${item.id}/xml/`;
        // Link para a página de visualização (se existir - adaptar URL conforme necessário)
        const viewPageLink = `/${apiPath.replace('es','e')}/#${item.id}`; // Ex: /cte/#uuid

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${tipoDoc}</td>
                <td title="${item.chave || ''}">${chaveFormatada}</td>
                <td>${statusHTML}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        {# Adapte este link para a URL correta de visualização no seu frontend #}
                        <a href="${viewPageLink}" class="btn btn-outline-primary" title="Ver na Lista">
                           <i class="fas fa-list-alt"></i>
                        </a>
                        <a href="${xmlLink}" class="btn btn-outline-success" title="Download XML" target="_blank">
                            <i class="fas fa-file-code"></i>
                        </a>
                    </div>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html;
}


// --- Funções Auxiliares (Definir aqui se não estiverem em scripts.js) ---

/**
 * Formata data/hora (Exemplo básico)
 * @param {string|Date} dateString - Data/Hora
 * @returns {string} Data/Hora formatada
 */
function formatDateTime(dateString) {
    if (!dateString || dateString === '1970-01-01T00:00:00Z') return '--';
    try {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleString('pt-BR', options);
    } catch (e) {
        return dateString; // Retorna original se falhar
    }
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
    return chave.length > 15 ? chave.substring(0, 12) + '...' : chave;
}

/**
 * Obtém o tipo de documento formatado.
 * @param {Object} item - Dados do documento.
 * @returns {string} - Tipo de documento formatado.
 */
function getTipoDocumento(item) {
    const tipo = item.tipo?.toUpperCase() || '';
    if (tipo === 'CTE') return 'CT-e';
    if (tipo === 'MDFE') return 'MDF-e';
    // Adicionar lógica para eventos se necessário
    return item.tipo || 'Doc.';
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
    return 'documentos'; // Fallback
}

/**
 * Obtém o HTML do badge de status.
 * @param {Object} item - Objeto completo do documento (CTe ou MDFe) vindo da API.
 * @returns {string} - HTML para o badge de status.
 */
function getStatusHTML(item) {
    if (!item) return '<span class="badge bg-secondary">Desconhecido</span>';

    // Lógica de Status (Prioriza Cancelado > Encerrado > Autorizado > Rejeitado > Processado > Pendente)
    if (item.cancelamento && item.cancelamento.c_stat === 135) { // CT-e ou MDF-e
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    if (item.encerrado) { // Apenas MDF-e
        return '<span class="badge bg-dark">Encerrado</span>'; // Usando bg-dark para diferenciar
    }
    if (item.protocolo) { // CT-e ou MDF-e
        if (item.protocolo.codigo_status === 100) {
            return '<span class="badge bg-success">Autorizado</span>';
        } else {
            return `<span class="badge bg-warning text-dark" title="${item.protocolo.motivo_status || ''}">Rejeitado (${item.protocolo.codigo_status})</span>`;
        }
    }
    if (item.processado) { // CT-e ou MDF-e
        return '<span class="badge bg-info text-dark">Processado</span>';
    }

    return '<span class="badge bg-secondary">Pendente</span>'; // Default
}


/**
 * Exporta funções para uso global (ex: botão de refresh manual no HTML).
 */
window.UploadXML = {
    uploadFile: uploadXML,
    refreshHistory: loadUploadHistory
};