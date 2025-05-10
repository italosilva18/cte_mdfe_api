/**
 * upload_batch.js
 * v1.2.2 - Alterado listener para 'click' no botão.
 */
document.addEventListener('DOMContentLoaded', function() {
    const uploadFormBatch = document.getElementById('uploadFormBatch'); // Ainda útil para CSRF
    const inputFileBatch = document.getElementById('arquivos_xml_lote');
    const fileInfoBatch = document.getElementById('fileInfoBatch');
    const btnClearBatch = document.getElementById('btnClearBatchUpload');
    const btnSubmitBatch = document.getElementById('btnSubmitBatch'); // Botão que agora terá o listener 'click'

    const progressBatchContainer = document.getElementById('uploadProgressBatchContainer');
    const progressBatchBar = document.getElementById('uploadProgressBatchBar');

    const errorAlertBatch = document.getElementById('uploadErrorBatch');
    const errorMessageBatch = document.getElementById('errorMessageBatch');
    const warningAlertBatch = document.getElementById('uploadWarningBatch');
    const warningMessageBatch = document.getElementById('warningMessageBatch');
    const successAlertBatch = document.getElementById('uploadSuccessBatch');
    const successMessageBatch = document.getElementById('successMessageBatch');
    const batchResultSummary = document.getElementById('batchResultSummary');
    const batchResultDetails = document.getElementById('batchResultDetails');

    const dropZoneBatch = document.getElementById('dropZoneBatch');

    if (!uploadFormBatch) console.error("CRÍTICO: Elemento form 'uploadFormBatch' NÃO encontrado.");
    if (!btnSubmitBatch) console.error("CRÍTICO: Botão 'btnSubmitBatch' NÃO encontrado.");

    function logBatch(message, level = 'info') {
        if (!batchResultDetails) return;
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        entry.textContent = `[${timestamp}] ${message}`;
        entry.classList.add('mb-1', 'small');
        if (level === 'error') entry.classList.add('text-danger');
        else if (level === 'warning') entry.classList.add('text-warning');
        else entry.classList.add('text-body-secondary');
        const placeholder = batchResultDetails.querySelector('small.text-muted.placeholder-log');
        if (placeholder) placeholder.remove();
        batchResultDetails.appendChild(entry);
        batchResultDetails.scrollTop = batchResultDetails.scrollHeight;
    }

    // Listener alterado do form para o botão
    if (btnSubmitBatch) {
        btnSubmitBatch.addEventListener('click', handleSubmitBatchUpload);
    } else {
        logBatch("Botão de envio em lote não encontrado.", "error");
    }

    if (inputFileBatch) {
        inputFileBatch.addEventListener('change', (e) => {
            const files = e.target.files;
            displayBatchFileInfo(files, fileInfoBatch);
            if (files && files.length > 0) {
                logBatch(`${files.length} arquivo(s) selecionado(s) para lote.`);
            }
        });
    }
    if (btnClearBatch) {
        btnClearBatch.addEventListener('click', () => {
            clearBatchUploadForm();
            logBatch("Formulário de upload em lote limpo.");
        });
    }

    setupDropZone(dropZoneBatch, inputFileBatch);

    function displayBatchFileInfo(files, infoEl) {
        if (!infoEl) return;
        if (files && files.length > 0) {
            let fileNames = Array.from(files).map(f => escapeHtml(f.name)).join(', ');
            if (files.length > 3) fileNames = Array.from(files).slice(0, 3).map(f => escapeHtml(f.name)).join(', ') + `... e mais ${files.length - 3}`;
            infoEl.innerHTML = `<strong>${files.length} arquivo(s):</strong> ${fileNames}`;
        } else { infoEl.innerHTML = ''; }
    }

    function clearBatchUploadForm() {
        if (uploadFormBatch) uploadFormBatch.reset();
        if (fileInfoBatch) fileInfoBatch.innerHTML = '';
        if (inputFileBatch) inputFileBatch.value = '';
        hideBatchMessages();
        if (progressBatchContainer) progressBatchContainer.classList.add('d-none');
        if (progressBatchBar) {
            progressBatchBar.style.width = '0%'; progressBatchBar.textContent = '0%';
            progressBatchBar.className = 'progress-bar';
        }
        if (batchResultSummary) batchResultSummary.innerHTML = '';
        if (batchResultDetails) batchResultDetails.innerHTML = '<small class="text-muted placeholder-log">Detalhes do processamento em lote aparecerão aqui...</small>';
    }

    // A função não recebe mais 'event' como parâmetro obrigatório
    function handleSubmitBatchUpload() {
        clearBatchUploadForm(); 
        logBatch("Processando envio em lote (via clique)...");
        if (!inputFileBatch || !inputFileBatch.files || inputFileBatch.files.length === 0) {
            logBatch("Nenhum arquivo selecionado para o lote.", "error");
            showBatchUploadError("Por favor, selecione um ou mais arquivos XML.");
            return;
        }
        logBatch(`Enviando ${inputFileBatch.files.length} arquivo(s)...`);

        const formData = new FormData();
        // Se o <form id="uploadFormBatch"> ainda existir, pode-se pegar o CSRF token dele
        // const formElement = document.getElementById('uploadFormBatch');
        // if (formElement) {
        //     const csrfToken = formElement.querySelector('[name=csrfmiddlewaretoken]');
        //     if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken.value);
        // }
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
            progressBatchBar.style.width = '0%'; progressBatchBar.textContent = '0%';
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

        // ** IMPORTANTE: Verifique se esta URL está correta conforme seu urls.py **
        const batchUploadUrl = '/api/upload/batch/'; // Ou '/api/upload/batch_upload/' se gerado pelo DRF
        logBatch(`Enviando para ${batchUploadUrl} (POST)...`, 'info');

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
                const s = data.sucesso||0, e=data.erros||0, i=data.ignorados||0, t=s+e+i;
                logBatch(`Lote finalizado: ${s} sucesso(s), ${e} erro(s), ${i} ignorado(s).`);
                if (progressBatchBar) progressBatchBar.className = (e>0||i>0) ? 'progress-bar bg-warning':'progress-bar bg-success';
                if (batchResultSummary) batchResultSummary.innerHTML = `<strong>Resumo:</strong> ${s}s, ${e}e, ${i}i de ${t}.`;
                renderBatchDetails(data.resultados_detalhados);
                if (e>0||i>0) showBatchUploadWarning(data.message || "Lote com observações.");
                else showBatchUploadSuccess(data.message || "Lote processado!");
            } else if (data && (data.error || data.detail)) {
                const errorMsg = data.error || data.detail;
                logBatch(`Erro geral lote: ${errorMsg}`, 'error');
                if (progressBatchBar) progressBatchBar.className = 'progress-bar bg-danger';
                showBatchUploadError(errorMsg);
                if (batchResultSummary) batchResultSummary.innerHTML = `<strong class="text-danger">Falha.</strong>`;
            } else {
                logBatch("Resposta inesperada (lote).", "error");
                if (progressBatchBar) progressBatchBar.className = 'progress-bar bg-danger';
                showBatchUploadError("Resposta inesperada.");
                if (batchResultSummary) batchResultSummary.innerHTML = `<strong class="text-danger">Erro.</strong>`;
            }
            if (typeof loadUploadHistory === 'function') loadUploadHistory();
        })
        .catch(error => {
            clearInterval(interval); console.error('Erro rede (lote):', error);
            logBatch(`Falha de rede: ${error.message}`, 'error');
            if (progressBatchBar) {
                progressBatchBar.style.width = '100%'; progressBatchBar.textContent = 'Erro Rede!';
                progressBatchBar.classList.remove('progress-bar-animated');
                progressBatchBar.className = 'progress-bar bg-danger';
            }
            showBatchUploadError(`Erro comunicação: ${error.message}.`);
            if (batchResultSummary) batchResultSummary.innerHTML = `<strong class="text-danger">Falha comunicação.</strong>`;
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
        batchResultDetails.innerHTML = ''; 
        let html = '<ul class="list-group list-group-flush">';
        details.forEach(res => {
            const icon = res.status === 'sucesso' ? 'fa-check-circle text-success' : (res.status === 'aviso' ? 'fa-exclamation-triangle text-warning' : 'fa-times-circle text-danger');
            let message = res.status === 'sucesso' ? `OK` : (res.status === 'aviso' ? `Aviso: ${escapeHtml(res.aviso || res.erro || '')}` : `Erro: ${escapeHtml(res.erro || '')}`);
            if (res.chave) message += ` (${globalFormatChave(res.chave)})`;
            if (res.tipo) message += ` - ${res.tipo}`;
            html += `<li class="list-group-item list-group-item-sm d-flex justify-content-between align-items-center small py-1 px-2"><span><i class="fas ${icon} me-2"></i>${escapeHtml(res.arquivo)}</span><span class="text-muted text-break">${message}</span></li>`;
        });
        html += '</ul>';
        batchResultDetails.innerHTML = html;
    }

    function showBatchUploadError(m) { if (errorMessageBatch && errorAlertBatch) { errorMessageBatch.textContent = m; errorAlertBatch.classList.remove('d-none'); if(successAlertBatch) successAlertBatch.classList.add('d-none'); if(warningAlertBatch) warningAlertBatch.classList.add('d-none'); } else { globalShowNotification(m, 'error'); } }
    function showBatchUploadWarning(m) { if (warningMessageBatch && warningAlertBatch) { warningMessageBatch.textContent = m; warningAlertBatch.classList.remove('d-none'); if(successAlertBatch) successAlertBatch.classList.add('d-none'); if(errorAlertBatch) errorAlertBatch.classList.add('d-none'); } else { globalShowNotification(m, 'warning'); } }
    function showBatchUploadSuccess(m) { if (successMessageBatch && successAlertBatch) { successMessageBatch.textContent = m; successAlertBatch.classList.remove('d-none'); if(errorAlertBatch) errorAlertBatch.classList.add('d-none'); if(warningAlertBatch) warningAlertBatch.classList.add('d-none'); } else { globalShowNotification(m, 'success'); } }
    function hideBatchMessages() { if (errorAlertBatch) errorAlertBatch.classList.add('d-none'); if (warningAlertBatch) warningAlertBatch.classList.add('d-none'); if (successAlertBatch) successAlertBatch.classList.add('d-none');}

    function setupDropZone(dropEl, inputEl) {
        if (!dropEl || !inputEl) return;
        dropEl.addEventListener('click', (e) => { if (e.target !== inputEl) inputEl.click(); });
        dropEl.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('dragover'); });
        dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragover'));
        dropEl.addEventListener('drop', (e) => {
            e.preventDefault(); dropEl.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                inputEl.files = e.dataTransfer.files;
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    function escapeHtml(unsafe) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(unsafe) : String(unsafe).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]); }
    function globalFormatChave(c) { return typeof window.formatChave === 'function' ? window.formatChave(c) : (c && c.length === 44 ? `${c.substring(0,6)}...${c.substring(c.length-6)}` : c || '--'); }
    function globalShowNotification(m, type) { if(typeof window.showNotification === 'function') window.showNotification(m, type); else console.log(`${type.toUpperCase()}: ${m}`);}

    if (batchResultDetails) batchResultDetails.innerHTML = '<small class="text-muted placeholder-log">Detalhes do processamento em lote aparecerão aqui...</small>';
});