/**
 * upload_batch.js
 * v1.2.0 - Refinamento de seletores, logs e tratamento de erros.
 */
document.addEventListener('DOMContentLoaded', function() {
    const uploadFormBatch = document.getElementById('uploadFormBatch');
    const inputFileBatch = document.getElementById('arquivos_xml_lote');
    const fileInfoBatch = document.getElementById('fileInfoBatch');
    const btnClearBatch = document.getElementById('btnClearBatchUpload');
    const btnSubmitBatch = document.getElementById('btnSubmitBatch');

    const progressBatchContainer = document.getElementById('uploadProgressBatchContainer'); // ID Container
    const progressBatchBar = document.getElementById('uploadProgressBatchBar'); // ID Barra

    const errorAlertBatch = document.getElementById('uploadErrorBatch');
    const errorMessageBatch = document.getElementById('errorMessageBatch');
    const warningAlertBatch = document.getElementById('uploadWarningBatch');
    const warningMessageBatch = document.getElementById('warningMessageBatch');
    const successAlertBatch = document.getElementById('uploadSuccessBatch');
    const successMessageBatch = document.getElementById('successMessageBatch');
    const batchResultSummary = document.getElementById('batchResultSummary');
    const batchResultDetails = document.getElementById('batchResultDetails');

    const dropZoneBatch = document.getElementById('dropZoneBatch');

    function logBatch(message, level = 'info') {
        if (!batchResultDetails) return;
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        // Usar textContent para evitar injeção de HTML se a mensagem vier de fontes não confiáveis
        entry.textContent = `[${timestamp}] ${message}`; 
        
        entry.classList.add('mb-1', 'small');
        if (level === 'error') entry.classList.add('text-danger');
        else if (level === 'warning') entry.classList.add('text-warning');
        else entry.classList.add('text-body-secondary');
        
        // Limpa placeholder se existir antes de adicionar o primeiro log real
        const placeholder = batchResultDetails.querySelector('small.text-muted.placeholder-log');
        if (placeholder) placeholder.remove();

        // Adiciona logs no início ou no fim dependendo da preferência. No fim é mais natural para logs.
        batchResultDetails.appendChild(entry);
        batchResultDetails.scrollTop = batchResultDetails.scrollHeight; // Auto-scroll para o último log
    }


    function displayBatchFileInfo(files, infoElement) {
        if (!infoElement) return;
        if (files && files.length > 0) {
            let fileNames = Array.from(files).map(file => escapeHtml(file.name)).join(', ');
            if (files.length > 3) {
                fileNames = Array.from(files).slice(0, 3).map(file => escapeHtml(file.name)).join(', ') + `... e mais ${files.length - 3} arquivo(s)`;
            }
            infoElement.innerHTML = `<strong>${files.length} arquivo(s) selecionado(s):</strong> ${fileNames}`;
        } else {
            infoElement.innerHTML = '';
        }
    }

    function clearBatchUploadForm() {
        if (uploadFormBatch) uploadFormBatch.reset();
        if (fileInfoBatch) fileInfoBatch.innerHTML = '';
        if (inputFileBatch) inputFileBatch.value = '';
        hideBatchMessages();
        if (progressBatchContainer) progressBatchContainer.classList.add('d-none');
        if (progressBatchBar) {
            progressBatchBar.style.width = '0%';
            progressBatchBar.textContent = '0%';
            progressBatchBar.className = 'progress-bar'; // Reset
        }
        if (batchResultSummary) batchResultSummary.innerHTML = '';
        if (batchResultDetails) {
            batchResultDetails.innerHTML = '<small class="text-muted placeholder-log">Detalhes do processamento em lote aparecerão aqui...</small>';
        }
    }

    function handleSubmitBatchUpload(event) {
        event.preventDefault();
        clearBatchUploadForm(); // Limpa resultados anteriores antes de novo envio
        logBatch("Processando envio em lote...");

        if (!inputFileBatch || !inputFileBatch.files || inputFileBatch.files.length === 0) {
            logBatch("Nenhum arquivo selecionado para o lote.", "error");
            showBatchUploadError("Por favor, selecione um ou mais arquivos XML.");
            return;
        }
        logBatch(`Enviando ${inputFileBatch.files.length} arquivo(s)...`);

        const formData = new FormData();
        for (let i = 0; i < inputFileBatch.files.length; i++) {
            formData.append('arquivos_xml', inputFileBatch.files[i]);
        }

        if (btnSubmitBatch) {
            btnSubmitBatch.disabled = true;
            btnSubmitBatch.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Enviando Lote...`;
        }
        hideBatchMessages();
        if (progressBatchContainer && progressBatchBar) {
            progressBatchContainer.classList.remove('d-none');
            progressBatchBar.style.width = '0%';
            progressBatchBar.textContent = '0%';
            progressBatchBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
        }

        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            if (progress <= 100 && progressBatchBar) {
                progressBatchBar.style.width = `${Math.min(progress, 98)}%`;
                progressBatchBar.textContent = `${Math.min(progress, 98)}%`;
            } else { clearInterval(interval); }
        }, 250);

        const batchUploadUrl = '/api/upload/batch/'; // Verifique esta URL com seu urls.py
        logBatch(`Enviando para ${batchUploadUrl}...`, 'info');

        Auth.fetchWithAuth(batchUploadUrl, { method: 'POST', body: formData })
        .then(response => {
            clearInterval(interval);
            logBatch(`API (lote) respondeu: HTTP ${response.status}.`);
            if (progressBatchBar) {
                progressBatchBar.classList.remove('progress-bar-animated');
                progressBatchBar.style.width = '100%';
            }
            return response.json().then(data => ({ ok: response.ok, status: response.status, data }));
        })
        .then(({ ok, status, data }) => {
            if (progressBatchBar) progressBatchBar.textContent = `Concluído!`;

            if (data && data.resultados_detalhados) {
                const successCount = data.sucesso || 0;
                const errorCount = data.erros || 0;
                const skippedCount = data.ignorados || 0;
                const totalProcessed = successCount + errorCount + skippedCount;

                logBatch(`Processamento em lote finalizado: ${successCount} sucesso(s), ${errorCount} erro(s), ${skippedCount} ignorado(s).`);

                if (progressBatchBar) {
                    if (errorCount > 0 || skippedCount > 0) progressBatchBar.className = 'progress-bar bg-warning';
                    else progressBatchBar.className = 'progress-bar bg-success';
                }

                if (batchResultSummary) {
                    batchResultSummary.innerHTML = `<strong>Resumo:</strong> ${successCount} sucesso(s), ${errorCount} erro(s), ${skippedCount} ignorado(s) de ${totalProcessed}.`;
                }
                renderBatchDetails(data.resultados_detalhados);

                if (errorCount > 0 || skippedCount > 0) {
                    showBatchUploadWarning(data.message || "Lote processado com observações.");
                } else {
                    showBatchUploadSuccess(data.message || "Lote processado com sucesso!");
                }
                // Não limpar o input de arquivos aqui, para o usuário ver o que foi enviado
                // inputFileBatch.value = ''; // Descomente se quiser limpar
            } else if (data && (data.error || data.detail)) {
                const errorMsg = data.error || data.detail;
                logBatch(`Erro geral no lote: ${errorMsg}`, 'error');
                if (progressBatchBar) progressBatchBar.className = 'progress-bar bg-danger';
                showBatchUploadError(errorMsg);
                if (batchResultSummary) batchResultSummary.innerHTML = `<strong class="text-danger">Falha no processamento.</strong>`;
            } else {
                logBatch("Resposta inesperada do servidor (lote).", "error");
                if (progressBatchBar) progressBatchBar.className = 'progress-bar bg-danger';
                showBatchUploadError("Resposta inesperada do servidor.");
                if (batchResultSummary) batchResultSummary.innerHTML = `<strong class="text-danger">Erro.</strong>`;
            }
            if (typeof loadUploadHistory === 'function') loadUploadHistory(); // Chama do upload.js
        })
        .catch(error => {
            clearInterval(interval);
            console.error('Erro de rede (upload em lote):', error);
            logBatch(`Falha de rede: ${error.message}`, 'error');
            if (progressBatchBar) {
                progressBatchBar.style.width = '100%';
                progressBatchBar.textContent = 'Erro de Rede!';
                progressBatchBar.classList.remove('progress-bar-animated');
                progressBatchBar.className = 'progress-bar bg-danger';
            }
            showBatchUploadError(`Erro de comunicação: ${error.message}.`);
            if (batchResultSummary) batchResultSummary.innerHTML = `<strong class="text-danger">Falha na comunicação.</strong>`;
        })
        .finally(() => {
            if (btnSubmitBatch) {
                btnSubmitBatch.disabled = false;
                btnSubmitBatch.innerHTML = `<i class="fas fa-boxes me-2"></i>Enviar Arquivos em Lote`;
            }
             setTimeout(() => {
                if (progressBatchContainer) progressBatchContainer.classList.add('d-none');
            }, 7000);
        });
    }

    function renderBatchDetails(details) {
        if (!batchResultDetails || !details) return;
        // Limpa logs antigos antes de renderizar novos detalhes
        batchResultDetails.innerHTML = ''; 

        let html = '<ul class="list-group list-group-flush">';
        details.forEach(res => {
            const icon = res.status === 'sucesso' ? 'fa-check-circle text-success' : (res.status === 'aviso' ? 'fa-exclamation-triangle text-warning' : 'fa-times-circle text-danger');
            let message = res.status === 'sucesso' ? `OK` : (res.status === 'aviso' ? `Aviso: ${escapeHtml(res.aviso || res.erro || '')}` : `Erro: ${escapeHtml(res.erro || '')}`);
            if (res.chave) message += ` (${globalFormatChave(res.chave)})`;
            if (res.tipo) message += ` - ${res.tipo}`;

            html += `
                <li class="list-group-item list-group-item-sm d-flex justify-content-between align-items-center small py-1 px-2">
                    <span><i class="fas ${icon} me-2"></i>${escapeHtml(res.arquivo)}</span>
                    <span class="text-muted text-break">${message}</span>
                </li>
            `;
        });
        html += '</ul>';
        batchResultDetails.innerHTML = html;
    }

    function showBatchUploadError(m) { if (errorMessageBatch && errorAlertBatch) { errorMessageBatch.textContent = m; errorAlertBatch.classList.remove('d-none'); if(successAlertBatch) successAlertBatch.classList.add('d-none'); if(warningAlertBatch) warningAlertBatch.classList.add('d-none'); } else { globalShowNotification(m, 'error'); } }
    function showBatchUploadWarning(m) { if (warningMessageBatch && warningAlertBatch) { warningMessageBatch.textContent = m; warningAlertBatch.classList.remove('d-none'); if(successAlertBatch) successAlertBatch.classList.add('d-none'); if(errorAlertBatch) errorAlertBatch.classList.add('d-none'); } else { globalShowNotification(m, 'warning'); } }
    function showBatchUploadSuccess(m) { if (successMessageBatch && successAlertBatch) { successMessageBatch.textContent = m; successAlertBatch.classList.remove('d-none'); if(errorAlertBatch) errorAlertBatch.classList.add('d-none'); if(warningAlertBatch) warningAlertBatch.classList.add('d-none'); } else { globalShowNotification(m, 'success'); } }
    function hideBatchMessages() { if (errorAlertBatch) errorAlertBatch.classList.add('d-none'); if (warningAlertBatch) warningAlertBatch.classList.add('d-none'); if (successAlertBatch) successAlertBatch.classList.add('d-none');}

    function setupDropZone(dropZoneEl, inputFileEl) {
        if (!dropZoneEl || !inputFileEl) return;
        dropZoneEl.addEventListener('click', (e) => { if (e.target !== inputFileEl) inputFileEl.click(); });
        dropZoneEl.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneEl.classList.add('dragover'); });
        dropZoneEl.addEventListener('dragleave', () => dropZoneEl.classList.remove('dragover'));
        dropZoneEl.addEventListener('drop', (e) => {
            e.preventDefault(); dropZoneEl.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                inputFileEl.files = e.dataTransfer.files;
                inputFileEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    function escapeHtml(unsafe) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(unsafe) : String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function globalFormatChave(ch) { return typeof window.formatChave === 'function' ? window.formatChave(ch) : ch; }
    function globalShowNotification(msg, type) { if(typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log(`${type}: ${msg}`);}

    // Inicializa o placeholder para logs do batch
    if (batchResultDetails) {
         batchResultDetails.innerHTML = '<small class="text-muted placeholder-log">Detalhes do processamento em lote aparecerão aqui...</small>';
    }
});