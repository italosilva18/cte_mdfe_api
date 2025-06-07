/**
 * upload_batch.js
 * Funcionalidades para o formulário de upload em lote simplificado.
 * Versão: 1.3.0
 */

document.addEventListener('DOMContentLoaded', function() {
    const batchForm = document.getElementById('batchUploadForm');
    const batchClearBtn = document.getElementById('btnClearBatch');

    if (batchForm) {
        batchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitBatchUploadSimplified();
        });
    }

    // Configurar Drop Zone ÚNICA para Upload em Lote
    setupDropZoneEnhanced('dropZoneBatchUnified', 'arquivos_xml_batch_unified', 'fileInfoBatchUnified');

    if (batchClearBtn) {
        batchClearBtn.addEventListener('click', clearBatchSelectionSimplified);
    }
});

// setupDropZoneEnhanced (mantida da versão anterior, mas agora só será chamada uma vez para o lote)
function setupDropZoneEnhanced(dropZoneId, fileInputId, fileInfoId) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    const fileInfoDisplay = document.getElementById(fileInfoId);

    if (!dropZone || !fileInput || !fileInfoDisplay) {
        console.warn(`Elementos da drop zone ${dropZoneId} não encontrados.`);
        return;
    }

    const updateFileInfo = () => {
        const files = fileInput.files;
        if (!files || files.length === 0) {
            fileInfoDisplay.innerHTML = '';
            return;
        }
        let fileNamesText = Array.from(files).map(f => escapeHtml(f.name)).join(', ');
        const maxDisplay = 5; 
        if (files.length > maxDisplay) {
            fileNamesText = Array.from(files).slice(0, maxDisplay).map(f => escapeHtml(f.name)).join(', ') + `... (+${files.length - maxDisplay} arquivos)`;
        }
        fileInfoDisplay.innerHTML = `<strong>${files.length} arquivo(s) selecionado(s):</strong> ${fileNamesText}`;
    };

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files; // Atribui todos os arquivos soltos
            updateFileInfo();
        }
    });
    fileInput.addEventListener('change', updateFileInfo);
}


function clearBatchSelectionSimplified() {
    const inputUnified = document.getElementById('arquivos_xml_batch_unified');
    const infoUnified = document.getElementById('fileInfoBatchUnified');
    
    if (inputUnified) inputUnified.value = '';
    if (infoUnified) infoUnified.innerHTML = '';
    
    document.getElementById('batchResultSummary').innerHTML = '';
    document.getElementById('batchResultDetails').innerHTML = '';
    const batchLogList = document.getElementById('batchLogList');
    if (batchLogList) batchLogList.innerHTML = '';
    document.getElementById('batchLogs').style.display = 'none';
    
    hideBatchMessagesEnhanced(); // Reutiliza a função de esconder mensagens
    const progressContainer = document.getElementById('batchProgress');
    if(progressContainer) progressContainer.classList.add('d-none');
}

// logBatch (mantida da versão anterior)
function logBatch(message, level = 'info') {
    // ... (implementação mantida)
    const logContainer = document.getElementById('batchLogs');
    const logList = document.getElementById('batchLogList');
    if (!logContainer || !logList) return;

    logContainer.style.display = 'block';
    const li = document.createElement('li');
    // Adiciona classes do Bootstrap para estilização simples
    li.classList.add('list-group-item', 'list-group-item-light', 'p-1', 'border-0');
    if (level === 'error') li.classList.add('text-danger');
    else if (level === 'warning') li.classList.add('text-warning');
    else li.classList.add('text-muted');
    
    li.innerHTML = `<small><i class="fas fa-${level === 'error' ? 'times-circle' : (level === 'warning' ? 'exclamation-triangle' : 'info-circle')} me-1"></i>${new Date().toLocaleTimeString()}: ${escapeHtml(message)}</small>`;
    logList.appendChild(li);
    logContainer.scrollTop = logContainer.scrollHeight;
}


async function submitBatchUploadSimplified() {
    const inputUnified = document.getElementById('arquivos_xml_batch_unified'); // ÚNICO INPUT
    const submitBtn = document.getElementById('btnSubmitBatch');
    const progressBar = document.querySelector('#batchProgress .progress-bar');
    const progressContainer = document.getElementById('batchProgress');
    const resultSummary = document.getElementById('batchResultSummary');
    const resultDetails = document.getElementById('batchResultDetails');
    const logContainer = document.getElementById('batchLogs');
    const logList = document.getElementById('batchLogList');

    if (!inputUnified || inputUnified.files.length === 0) {
        showBatchMessageEnhanced('Selecione um ou mais arquivos XML.', 'error');
        return;
    }

    if (logList) logList.innerHTML = '';
    if (logContainer) logContainer.style.display = 'none';
    logBatch("Iniciando upload em lote simplificado...");

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Enviando...`;
    }
    hideBatchMessagesEnhanced();
    if (resultSummary) resultSummary.innerHTML = '';
    if (resultDetails) resultDetails.innerHTML = '';

    if (progressContainer && progressBar) {
        progressContainer.classList.remove('d-none');
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
    }

    const formData = new FormData();
    for (const file of inputUnified.files) { // Adiciona todos os arquivos sob o mesmo nome de campo
        formData.append('arquivos_xml', file);
    }

    let progress = 0;
    const progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 95);
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
        }
    }, 300);

    try {
        // O endpoint e a action no backend permanecem os mesmos
        const response = await window.apiClient.uploadFile('/api/upload/batch_upload/', formData, (progress) => {
            updateBatchProgress(Math.round(progress));
        });
        
        clearInterval(progressInterval);
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressBar.classList.remove('progress-bar-animated');
        }

        // uploadFile já retorna dados parseados
        const data = response;
        
        logBatch("Resposta da API recebida. Processando resultados...");
        const { sucesso, erros, ignorados, resultados_detalhados } = data;

        if (resultSummary) {
            resultSummary.innerHTML = `<strong>Concluído:</strong> ${sucesso || 0} sucesso(s), ${erros || 0} erro(s), ${ignorados || 0} ignorado(s) de ${inputUnified.files.length} arquivo(s) enviados.`;
        }

        if (resultDetails && resultados_detalhados) {
            let detailsHtml = '<ul class="list-group list-group-flush small">';
            resultados_detalhados.forEach(res => {
                let iconClass = 'fa-question-circle text-muted';
                let itemMessage = res.erro || res.mensagem || res.aviso || 'Status desconhecido';
                // O backend agora retorna 'arquivo_principal_nome' e 'arquivo_retorno_nome'
                let fileNameDisplay = res.arquivo_principal_nome ? escapeHtml(res.arquivo_principal_nome) : (res.arquivo ? escapeHtml(res.arquivo) : 'Arquivo Desconhecido');
                let fileRetornoInfo = res.arquivo_retorno_nome ? ` (+ Ret: ${escapeHtml(res.arquivo_retorno_nome)})` : (res.arquivo_retorno ? ` (+ Ret: ${escapeHtml(res.arquivo_retorno)})` : '');


                if (res.status === 'sucesso') {
                    iconClass = 'fa-check-circle text-success';
                } else if (res.status === 'erro') {
                    iconClass = 'fa-times-circle text-danger';
                } else if (res.status === 'ignorado') {
                    iconClass = 'fa-minus-circle text-secondary';
                }
                 if (res.aviso && res.status !== 'erro') {
                    iconClass = 'fa-exclamation-triangle text-warning';
                 }

                detailsHtml += `
                    <li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2">
                        <span><i class="fas ${iconClass} me-2"></i>${fileNameDisplay}${fileRetornoInfo}</span>
                        <span class="text-muted" title="${escapeHtml(itemMessage)}">${truncateText(escapeHtml(itemMessage), 60)}</span>
                    </li>`;
            });
            detailsHtml += '</ul>';
            resultDetails.innerHTML = detailsHtml;
        }

        if (erros > 0 || ignorados > 0) {
            showBatchMessageEnhanced(`Lote processado. ${sucesso || 0} com sucesso, ${erros || 0} com erro(s), ${ignorados || 0} ignorado(s).`, 'warning');
            if (progressBar) progressBar.className = 'progress-bar bg-warning';
        } else if (sucesso > 0) {
            showBatchMessageEnhanced(`Lote de ${sucesso} arquivo(s) processado(s) com sucesso.`, 'success');
            if (progressBar) progressBar.className = 'progress-bar bg-success';
        } else {
            showBatchMessageEnhanced('Nenhum arquivo foi processado ou todos foram ignorados.', 'info');
            if (progressBar) progressBar.className = 'progress-bar bg-secondary';
        }
        
        logBatch("Renderização dos detalhes do lote concluída.");
        if(typeof loadUploadHistory === 'function') loadUploadHistory(); // Atualiza o histórico geral

    } catch (error) {
        clearInterval(progressInterval);
        console.error('Erro crítico no upload em lote simplificado:', error);
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.textContent = 'Erro Crítico!';
            progressBar.className = 'progress-bar bg-danger';
        }
        const errorMessage = error.detail || error.error || error.message || (typeof error === 'object' ? JSON.stringify(error) : 'Erro desconhecido ao contatar o servidor.');
        showBatchMessageEnhanced(`Erro crítico ao enviar o lote: ${errorMessage}`, 'error');
        logBatch(`Erro crítico: ${errorMessage}`, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-boxes me-2"></i>Enviar Lote de Arquivos`;
        }
        setTimeout(() => {
            if(progressContainer) progressContainer.classList.add('d-none');
        }, 7000);
    }
}


// showBatchMessageEnhanced e hideBatchMessagesEnhanced (mantidas da versão anterior)
function showBatchMessageEnhanced(message, type = 'success') {
    const successAlert = document.getElementById('batchSuccess');
    const successMsgEl = document.getElementById('batchSuccessMessage');
    const errorAlert = document.getElementById('batchError');
    const errorMsgEl = document.getElementById('batchErrorMessage');
    const warningAlert = document.getElementById('batchWarning');
    const warningMsgEl = document.getElementById('batchWarningMessage');

    if(successAlert) successAlert.classList.add('d-none');
    if(errorAlert) errorAlert.classList.add('d-none');
    if(warningAlert) warningAlert.classList.add('d-none');
    
    let targetAlert, targetMessageEl;

    if (type === 'success') {
        targetAlert = successAlert; targetMessageEl = successMsgEl;
    } else if (type === 'warning') {
        targetAlert = warningAlert; targetMessageEl = warningMsgEl;
    } else { // error ou info
        targetAlert = errorAlert; targetMessageEl = errorMsgEl;
        // Para info, poderíamos usar o warningAlert também ou um novo alert-info
        if(type === 'info' && warningAlert) { // Reutiliza warning para info se quiser
            targetAlert = warningAlert; targetMessageEl = warningMsgEl;
            targetAlert.classList.remove('alert-warning'); targetAlert.classList.add('alert-info');
        } else if (type === 'info' && !warningAlert) { // Fallback se não houver warningAlert
             if(typeof showNotification === 'function') showNotification(message, type); return;
        }
    }

    if (targetAlert && targetMessageEl) {
        targetMessageEl.textContent = message;
        targetAlert.classList.remove('d-none');
        // Garante que as classes corretas de alerta (danger, success, warning, info) sejam aplicadas
        targetAlert.className = 'alert mt-3'; // Reseta classes
        if (type === 'success') targetAlert.classList.add('alert-success');
        else if (type === 'warning') targetAlert.classList.add('alert-warning');
        else if (type === 'info') targetAlert.classList.add('alert-info');
        else targetAlert.classList.add('alert-danger'); // default para error
        
        // Adiciona ícones
        let iconHtml = '';
        if (type === 'success') iconHtml = '<i class="fas fa-check-circle me-2"></i>';
        else if (type === 'warning') iconHtml = '<i class="fas fa-exclamation-triangle me-2"></i>';
        else if (type === 'info') iconHtml = '<i class="fas fa-info-circle me-2"></i>';
        else iconHtml = '<i class="fas fa-exclamation-circle me-2"></i>'; // error
        targetMessageEl.innerHTML = iconHtml + message;


        targetAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        if(typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            alert(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

function hideBatchMessagesEnhanced() {
    document.getElementById('batchSuccess')?.classList.add('d-none');
    document.getElementById('batchError')?.classList.add('d-none');
    document.getElementById('batchWarning')?.classList.add('d-none');
    // Se você adicionou um batchInfo, esconda-o também
    // document.getElementById('batchInfo')?.classList.add('d-none');
}

// Funções utilitárias (assumindo que estarão globais ou são copiadas/importadas)
if (typeof escapeHtml !== 'function') {
    window.escapeHtml = function(unsafe) { /* ... */ return unsafe; };
}
if (typeof formatChave !== 'function') {
    window.formatChave = function(chave) { /* ... */ return chave; };
}
if (typeof formatFileSize !== 'function') {
    window.formatFileSize = function(bytes) { /* ... */ return bytes + " B"; };
}
if (typeof truncateText !== 'function') {
    window.truncateText = function(text, maxLength) { /* ... */ return text; };
}
if (typeof loadUploadHistory !== 'function' && document.getElementById('upload-history')) {
    // Se loadUploadHistory não estiver global (em upload.js ou scripts.js),
    // você precisará garantir que ela seja chamada corretamente ou recriá-la aqui.
    // Por ora, apenas um aviso se ela for chamada e não existir.
    window.loadUploadHistory = function() { console.warn("loadUploadHistory foi chamada mas não está definida globalmente neste contexto."); };
}
if (typeof showNotification !== 'function') {
    window.showNotification = function(message, type = 'info') { console.log(`[${type.toUpperCase()}] ${message}`); };
}