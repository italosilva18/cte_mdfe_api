/**
 * upload.js
 * v1.2.0 - Refinamento de seletores, logs e tratamento de erros.
 */
document.addEventListener('DOMContentLoaded', function() {
    const uploadFormSingle = document.getElementById('uploadFormSingle');
    const inputFilePrincipal = document.getElementById('arquivo_xml_principal');
    const inputFileRetorno = document.getElementById('arquivo_xml_retorno');
    const fileInfoPrincipal = document.getElementById('fileInfoPrincipal');
    const fileInfoRetorno = document.getElementById('fileInfoRetorno');
    const btnClearSingle = document.getElementById('btnClearSingleUpload');
    const btnSubmitSingle = document.getElementById('btnSubmitSingle');
    
    const progressSingleContainer = document.getElementById('uploadProgressSingleContainer'); // ID Container
    const progressSingleBar = document.getElementById('uploadProgressSingleBar'); // ID Barra

    const errorAlertSingle = document.getElementById('uploadErrorSingle');
    const errorMessageSingle = document.getElementById('errorMessageSingle');
    const warningAlertSingle = document.getElementById('uploadWarningSingle');
    const warningMessageSingle = document.getElementById('warningMessageSingle');
    const successAlertSingle = document.getElementById('uploadSuccessSingle');
    const successMessageSingle = document.getElementById('successMessageSingle');
    const singleUploadLogsContainer = document.getElementById('singleUploadLogs');

    const dropZonePrincipal = document.getElementById('dropZonePrincipal');
    const dropZoneRetorno = document.getElementById('dropZoneRetorno');

    const historyTableBody = document.getElementById('uploadHistoryTableBody');
    const btnRefreshHistory = document.getElementById('btnRefreshUploadHistory');
    const historyLogContainer = document.getElementById('historyLog');

    function logSingle(message, level = 'info') {
        if (!singleUploadLogsContainer) return;
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        entry.innerHTML = `[${timestamp}] ${escapeHtml(message)}`; // Usar innerHTML para formatar se necessário
        
        entry.classList.add('mb-1', 'small');
        if (level === 'error') entry.classList.add('text-danger');
        else if (level === 'warning') entry.classList.add('text-warning');
        else entry.classList.add('text-body-secondary');

        const placeholder = singleUploadLogsContainer.querySelector('small.text-muted');
        if(placeholder) placeholder.remove();

        singleUploadLogsContainer.appendChild(entry);
        singleUploadLogsContainer.scrollTop = singleUploadLogsContainer.scrollHeight;
    }

    function displayFileInfo(files, infoElement, typeLabel) {
        if (!infoElement) return;
        if (files && files.length > 0) {
            const file = files[0];
            infoElement.innerHTML = `<strong>${typeLabel}:</strong> ${escapeHtml(file.name)} <small class="text-muted">(${globalFormatBytes(file.size)})</small>`;
        } else {
            infoElement.innerHTML = '';
        }
    }

    function clearSingleUploadForm() {
        if (uploadFormSingle) uploadFormSingle.reset();
        if (fileInfoPrincipal) fileInfoPrincipal.innerHTML = '';
        if (fileInfoRetorno) fileInfoRetorno.innerHTML = '';
        if (inputFilePrincipal) inputFilePrincipal.value = '';
        if (inputFileRetorno) inputFileRetorno.value = '';
        hideSingleMessages();
        if (progressSingleContainer) progressSingleContainer.classList.add('d-none');
        if (progressSingleBar) {
            progressSingleBar.style.width = '0%';
            progressSingleBar.textContent = '0%';
            progressSingleBar.className = 'progress-bar'; // Reset classes
        }
        if(singleUploadLogsContainer) {
            singleUploadLogsContainer.innerHTML = '<small class="text-muted">Logs do upload aparecerão aqui...</small>';
        }
    }

    function handleSubmitSingleUpload(event) {
        event.preventDefault();
        logSingle('Processando envio individual...');
        if (!inputFilePrincipal || !inputFilePrincipal.files || inputFilePrincipal.files.length === 0) {
            logSingle("Arquivo XML principal não selecionado.", 'error');
            showSingleUploadError("Por favor, selecione o arquivo XML principal.");
            return;
        }
        logSingle(`Arquivo principal: ${inputFilePrincipal.files[0].name}`);
        if (inputFileRetorno && inputFileRetorno.files.length > 0) {
            logSingle(`Arquivo de retorno: ${inputFileRetorno.files[0].name}`);
        }

        const formData = new FormData();
        formData.append('arquivo_xml', inputFilePrincipal.files[0]);
        if (inputFileRetorno && inputFileRetorno.files.length > 0) {
            formData.append('arquivo_xml_retorno', inputFileRetorno.files[0]);
        }

        if (btnSubmitSingle) {
            btnSubmitSingle.disabled = true;
            btnSubmitSingle.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Enviando...`;
        }
        hideSingleMessages();
        if (progressSingleContainer && progressSingleBar) {
            progressSingleContainer.classList.remove('d-none');
            progressSingleBar.style.width = '0%';
            progressSingleBar.textContent = '0%';
            progressSingleBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
        }

        logSingle('Enviando para /api/upload/...', 'info');
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            if (progress <= 100 && progressSingleBar) {
                const currentProgress = Math.min(progress, 95);
                progressSingleBar.style.width = `${currentProgress}%`;
                progressSingleBar.textContent = `${currentProgress}%`;
            } else { clearInterval(interval); }
        }, 150);

        Auth.fetchWithAuth('/api/upload/', { method: 'POST', body: formData })
        .then(response => {
            clearInterval(interval);
            if (progressSingleBar) {
                progressSingleBar.classList.remove('progress-bar-animated');
                progressSingleBar.style.width = '100%';
            }
            logSingle(`API respondeu: HTTP ${response.status}.`);
            return response.json().then(data => ({ ok: response.ok, status: response.status, data }));
        })
        .then(({ ok, status, data }) => {
            if (progressSingleBar) progressSingleBar.textContent = 'Concluído!';
            
            let message = data.message || "Operação finalizada.";
            if (data.chave) message += ` Chave: ${globalFormatChave(data.chave)}`;

            if (ok && status !== 400 && status !== 500) {
                if (status === 202) {
                    logSingle(`Aviso (202): ${message}. ${data.warning || ''}`, 'warning');
                    if (progressSingleBar) progressSingleBar.className = 'progress-bar bg-warning';
                    showSingleUploadWarning(message + (data.warning ? ` Aviso: ${data.warning}` : ''));
                } else {
                    logSingle(`Sucesso (${status}): ${message}`, 'info');
                    if (progressSingleBar) progressSingleBar.className = 'progress-bar bg-success';
                    showSingleUploadSuccess(message);
                }
                clearSingleUploadForm(); // Limpa form
                if (singleUploadLogsContainer) { // Adiciona mensagem de novo upload
                     singleUploadLogsContainer.innerHTML += '<div class="border-top my-2"></div><small class="text-muted">Aguardando novo upload...</small>';
                }
                loadUploadHistory();
            } else {
                const errorMsg = data.error || data.detail || JSON.stringify(data) || "Erro desconhecido.";
                logSingle(`Erro (${status}): ${errorMsg}`, 'error');
                if (progressSingleBar) progressSingleBar.className = 'progress-bar bg-danger';
                showSingleUploadError(errorMsg);
            }
        })
        .catch(error => {
            clearInterval(interval);
            console.error('Erro de rede (upload individual):', error);
            logSingle(`Falha de rede: ${error.message}`, 'error');
            if (progressSingleBar) {
                progressSingleBar.style.width = '100%';
                progressSingleBar.textContent = 'Erro de Rede!';
                progressSingleBar.classList.remove('progress-bar-animated');
                progressSingleBar.className = 'progress-bar bg-danger';
            }
            showSingleUploadError(`Erro de comunicação: ${error.message}.`);
        })
        .finally(() => {
            if (btnSubmitSingle) {
                btnSubmitSingle.disabled = false;
                btnSubmitSingle.innerHTML = `<i class="fas fa-paper-plane me-2"></i>Enviar Arquivo Único`;
            }
            setTimeout(() => {
                if (progressSingleContainer) progressSingleContainer.classList.add('d-none');
            }, 5000);
        });
    }

    function showSingleUploadError(message) {
        if (errorMessageSingle && errorAlertSingle) {
            errorMessageSingle.textContent = message; errorAlertSingle.classList.remove('d-none');
            if(successAlertSingle) successAlertSingle.classList.add('d-none');
            if(warningAlertSingle) warningAlertSingle.classList.add('d-none');
        } else { globalShowNotification(message, 'error'); }
    }
    function showSingleUploadWarning(message) {
        if (warningMessageSingle && warningAlertSingle) {
            warningMessageSingle.textContent = message; warningAlertSingle.classList.remove('d-none');
            if(successAlertSingle) successAlertSingle.classList.add('d-none');
            if(errorAlertSingle) errorAlertSingle.classList.add('d-none');
        } else { globalShowNotification(message, 'warning'); }
    }
    function showSingleUploadSuccess(message) {
        if (successMessageSingle && successAlertSingle) {
            successMessageSingle.textContent = message; successAlertSingle.classList.remove('d-none');
            if(errorAlertSingle) errorAlertSingle.classList.add('d-none');
            if(warningAlertSingle) warningAlertSingle.classList.add('d-none');
        } else { globalShowNotification(message, 'success'); }
    }
    function hideSingleMessages() {
        if (errorAlertSingle) errorAlertSingle.classList.add('d-none');
        if (warningAlertSingle) warningAlertSingle.classList.add('d-none');
        if (successAlertSingle) successAlertSingle.classList.add('d-none');
    }

    async function loadUploadHistory() {
        if (!historyTableBody) return;
        logToHistoryContainer("Atualizando histórico...");
        historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4"><div class="spinner-border spinner-border-sm"></div> Carregando...</td></tr>`;

        try {
            const [ctesResponse, mdfesResponse] = await Promise.all([
                Auth.fetchWithAuth('/api/ctes/?ordering=-data_upload&page_size=5'), // Usando page_size
                Auth.fetchWithAuth('/api/mdfes/?ordering=-data_upload&page_size=5') // Usando page_size
            ]);

            let combinedHistory = [];
            if (ctesResponse.ok) {
                const ctesData = await ctesResponse.json();
                (ctesData.results || ctesData || []).forEach(item => combinedHistory.push({ ...item, docTipo: 'CT-e' }));
            } else { logToHistoryContainer("Falha ao buscar histórico de CT-es.", "warn");}

            if (mdfesResponse.ok) {
                const mdfesData = await mdfesResponse.json();
                (mdfesData.results || mdfesData || []).forEach(item => combinedHistory.push({ ...item, docTipo: 'MDF-e' }));
            } else { logToHistoryContainer("Falha ao buscar histórico de MDF-es.", "warn");}

            combinedHistory.sort((a, b) => new Date(b.data_upload) - new Date(a.data_upload));
            renderUploadHistory(combinedHistory.slice(0, 10)); // Pega os 10 mais recentes no geral
            logToHistoryContainer("Histórico atualizado.");

        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            logToHistoryContainer(`Erro ao carregar histórico: ${error.message}`, "error");
            historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erro ao carregar.</td></tr>`;
        }
    }

    function renderUploadHistory(items) {
        if (!historyTableBody) return;
        if (!items || items.length === 0) {
            historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3 text-muted">Nenhum processamento recente.</td></tr>`;
            return;
        }
        historyTableBody.innerHTML = items.map(item => {
            const dataProc = item.data_upload ? globalFormatDateTime(item.data_upload) : '--';
            const chave = item.chave || 'N/A';
            const numero = item.numero_cte || item.numero_mdfe || (item.identificacao ? (item.identificacao.n_mdf || item.identificacao.numero_documento) : 'N/A');
            const statusInfo = globalGetDocumentStatusObject(item, item.docTipo); // Usando função global
            const statusBadge = `<span class="badge ${statusInfo.badgeClass} text-dark-emphasis">${statusInfo.text}</span>`;
            const viewUrl = item.docTipo === 'CT-e' ? `/cte/#doc=${item.id}` : `/mdfe/#doc=${item.id}`;

            return `
                <tr>
                    <td>${dataProc}</td>
                    <td><span class="badge bg-light text-dark border">${item.docTipo}</span></td>
                    <td title="${chave}">${globalFormatChave(chave)}</td>
                    <td>${numero}</td>
                    <td>${statusBadge}</td>
                    <td><a href="${viewUrl}" class="btn btn-sm btn-outline-primary" title="Ver no Painel"><i class="fas fa-eye"></i></a></td>
                </tr>
            `;
        }).join('');
    }

    function logToHistoryContainer(message, level = 'info') {
        if (!historyLogContainer) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        historyLogContainer.innerHTML = `[${timestamp}] ${escapeHtml(message)}`; // Sobrescreve log anterior
        historyLogContainer.className = 'p-2 small text-monospace border-bottom';
        if (level === 'error') historyLogContainer.classList.add('text-danger');
        else if (level === 'warn') historyLogContainer.classList.add('text-warning');
        else historyLogContainer.classList.add('text-muted');
    }
    
    function setupDropZone(dropZoneElement, inputFileElement) {
        if (!dropZoneElement || !inputFileElement) return;
        dropZoneElement.addEventListener('click', (e) => { if (e.target !== inputFileElement) inputFileElement.click(); });
        dropZoneElement.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneElement.classList.add('dragover'); });
        dropZoneElement.addEventListener('dragleave', () => dropZoneElement.classList.remove('dragover'));
        dropZoneElement.addEventListener('drop', (e) => {
            e.preventDefault(); dropZoneElement.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                inputFileElement.files = e.dataTransfer.files;
                inputFileElement.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    
    // Prefixo global para funções que deveriam estar em scripts.js
    function escapeHtml(unsafe) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(unsafe) : String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function globalFormatBytes(bytes, d=2) { return typeof window.formatBytes === 'function' ? window.formatBytes(bytes, d) : `${bytes} Bytes`; }
    function globalFormatChave(ch) { return typeof window.formatChave === 'function' ? window.formatChave(ch) : ch; }
    function globalFormatDateTime(dt) { return typeof window.formatDateTime === 'function' ? window.formatDateTime(dt) : dt; }
    function globalShowNotification(msg, type) { if(typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log(`${type}: ${msg}`);}
    function globalGetDocumentStatusObject(doc, tipo) { return typeof window.getDocumentStatusObject === 'function' ? window.getDocumentStatusObject(doc, tipo) : {text:'N/A', badgeClass:'bg-light'}; }

    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener('click', loadUploadHistory);
    }

    loadUploadHistory(); // Carrega histórico ao iniciar a página
});