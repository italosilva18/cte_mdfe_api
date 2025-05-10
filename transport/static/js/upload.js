/**
 * upload.js
 * Funcionalidades para upload individual de XML (CT-e, MDF-e, Eventos) e histórico.
 * v1.2.1 - Corrigido IDs de formulário e histórico conforme checklist.
 */

// Assume que 'Auth' (auth.js) e funções globais (scripts.js) estão disponíveis.
// Funções esperadas de scripts.js: showNotification, formatDateTime, formatChave, formatBytes, getDocumentStatusObject (ou getCteStatusObject/getMdfeStatusObjectPanel)

document.addEventListener('DOMContentLoaded', function() {
    // --- Elementos do Formulário de Upload Individual ---
    const uploadFormSingle = document.getElementById('uploadFormSingle'); // ID CORRIGIDO
    const inputFilePrincipal = document.getElementById('arquivo_xml_principal');
    const inputFileRetorno = document.getElementById('arquivo_xml_retorno');
    const fileInfoPrincipal = document.getElementById('fileInfoPrincipal');
    const fileInfoRetorno = document.getElementById('fileInfoRetorno');
    const btnClearSingle = document.getElementById('btnClearSingleUpload');
    const btnSubmitSingle = document.getElementById('btnSubmitSingle');
    
    const progressSingleContainer = document.getElementById('uploadProgressSingleContainer');
    const progressSingleBar = document.getElementById('uploadProgressSingleBar');

    const errorAlertSingle = document.getElementById('uploadErrorSingle');
    const errorMessageSingle = document.getElementById('errorMessageSingle');
    const warningAlertSingle = document.getElementById('uploadWarningSingle');
    const warningMessageSingle = document.getElementById('warningMessageSingle');
    const successAlertSingle = document.getElementById('uploadSuccessSingle');
    const successMessageSingle = document.getElementById('successMessageSingle');
    const singleUploadLogsContainer = document.getElementById('singleUploadLogs');

    const dropZonePrincipal = document.getElementById('dropZonePrincipal');
    const dropZoneRetorno = document.getElementById('dropZoneRetorno');

    // --- Histórico de Uploads ---
    const historyTableBody = document.getElementById('uploadHistoryTableBody'); // ID CORRIGIDO
    const btnRefreshHistory = document.getElementById('btnRefreshUploadHistory');
    const historyLogContainer = document.getElementById('historyLog');

    // --- Verificações Iniciais ---
    if (!uploadFormSingle) console.error("CRÍTICO: Formulário de upload 'uploadFormSingle' não encontrado no HTML.");
    if (!historyTableBody) console.error("CRÍTICO: Tabela de histórico 'uploadHistoryTableBody' não encontrada no HTML.");


    // --- Função de Log para Upload Individual ---
    function logSingle(message, level = 'info') {
        if (!singleUploadLogsContainer) return;
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        entry.innerHTML = `[${timestamp}] ${escapeHtml(message)}`;
        
        entry.classList.add('mb-1', 'small');
        if (level === 'error') entry.classList.add('text-danger');
        else if (level === 'warning') entry.classList.add('text-warning');
        else entry.classList.add('text-body-secondary');

        const placeholder = singleUploadLogsContainer.querySelector('small.text-muted');
        if(placeholder) placeholder.remove();

        singleUploadLogsContainer.appendChild(entry);
        singleUploadLogsContainer.scrollTop = singleUploadLogsContainer.scrollHeight;
    }

    // --- Event Listeners para Upload Individual ---
    if (uploadFormSingle) { // Verificação adicionada
        uploadFormSingle.addEventListener('submit', handleSubmitSingleUpload);
    }

    if (inputFilePrincipal) {
        inputFilePrincipal.addEventListener('change', (e) => {
            const file = e.target.files[0];
            displayFileInfo(e.target.files, fileInfoPrincipal, "Principal");
            if (file) logSingle(`Arquivo principal selecionado: ${file.name}`);
        });
    }
    if (inputFileRetorno) {
        inputFileRetorno.addEventListener('change', (e) => {
            const file = e.target.files[0];
            displayFileInfo(e.target.files, fileInfoRetorno, "Retorno");
            if (file) logSingle(`Arquivo de retorno selecionado: ${file.name}`);
        });
    }

    if (btnClearSingle) {
        btnClearSingle.addEventListener('click', () => {
            clearSingleUploadForm();
            logSingle("Formulário de upload individual limpo.");
        });
    }

    setupDropZone(dropZonePrincipal, inputFilePrincipal);
    setupDropZone(dropZoneRetorno, inputFileRetorno);

    // --- Event Listeners para Histórico ---
    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener('click', loadUploadHistory);
    }

    // --- Funções ---
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
            progressSingleBar.className = 'progress-bar';
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
                clearSingleUploadForm();
                if (singleUploadLogsContainer) {
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
        if (!historyTableBody) { // Verificação crucial
            console.error("Elemento tbody 'uploadHistoryTableBody' não encontrado para exibir histórico.");
            logToHistoryContainer("Erro interno: Tabela de histórico não encontrada no DOM.", "error");
            return;
        }
        logToHistoryContainer("Atualizando histórico de processamento...");
        historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4"><div class="spinner-border spinner-border-sm"></div> Carregando...</td></tr>`;

        try {
            const [ctesResponse, mdfesResponse] = await Promise.all([
                Auth.fetchWithAuth('/api/ctes/?ordering=-data_upload&page_size=5'),
                Auth.fetchWithAuth('/api/mdfes/?ordering=-data_upload&page_size=5')
            ]);

            let combinedHistory = [];
            if (ctesResponse.ok) {
                const ctesData = await ctesResponse.json();
                (ctesData.results || ctesData || []).forEach(item => combinedHistory.push({ ...item, docTipo: 'CT-e' }));
            } else { logToHistoryContainer("Falha ao buscar histórico de CT-es (HTTP " + ctesResponse.status + ")", "warn");}

            if (mdfesResponse.ok) {
                const mdfesData = await mdfesResponse.json();
                (mdfesData.results || mdfesData || []).forEach(item => combinedHistory.push({ ...item, docTipo: 'MDF-e' }));
            } else { logToHistoryContainer("Falha ao buscar histórico de MDF-es (HTTP " + mdfesResponse.status + ")", "warn");}

            combinedHistory.sort((a, b) => new Date(b.data_upload) - new Date(a.data_upload));
            renderUploadHistory(combinedHistory.slice(0, 10));
            logToHistoryContainer("Histórico atualizado com sucesso.");

        } catch (error) {
            console.error('Erro ao carregar histórico de uploads:', error);
            logToHistoryContainer(`Erro ao carregar histórico: ${error.message}`, "error");
            historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erro ao carregar histórico.</td></tr>`;
        }
    }

    function renderUploadHistory(items) {
        if (!historyTableBody) return; // Já verificado em loadUploadHistory, mas bom ter aqui também
        if (!items || items.length === 0) {
            historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3 text-muted">Nenhum processamento recente.</td></tr>`;
            return;
        }
        historyTableBody.innerHTML = items.map(item => {
            const dataProc = item.data_upload ? globalFormatDateTime(item.data_upload) : '--';
            const chave = item.chave || 'N/A';
            const numero = item.numero_cte || item.numero_mdfe || (item.identificacao ? (item.identificacao.n_mdf || item.identificacao.numero_documento) : 'N/A');
            const statusInfo = globalGetDocumentStatusObject(item, item.docTipo);
            const statusBadge = `<span class="badge ${statusInfo.badgeClass} text-dark-emphasis">${statusInfo.text}</span>`;
            // Ajuste para que o link do histórico leve ao painel e filtre/destaque o documento
            const viewUrl = item.docTipo === 'CT-e' ? `/painel-cte/?chave=${chave}` : `/painel-mdfe/?chave=${chave}`;


            return `
                <tr>
                    <td>${dataProc}</td>
                    <td><span class="badge bg-light text-dark border">${item.docTipo}</span></td>
                    <td title="${chave}">${globalFormatChave(chave)}</td>
                    <td>${numero}</td>
                    <td>${statusBadge}</td>
                    <td><a href="${viewUrl}" target="_blank" class="btn btn-sm btn-outline-primary" title="Ver no Painel">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function logToHistoryContainer(message, level = 'info') {
        if (!historyLogContainer) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        historyLogContainer.innerHTML = `[${timestamp}] ${escapeHtml(message)}`;
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
    
    // Funções globais (prefixadas com 'global' para indicar que deveriam vir de scripts.js)
    function escapeHtml(unsafe) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(unsafe) : String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function globalFormatBytes(bytes, d=2) { return typeof window.formatBytes === 'function' ? window.formatBytes(bytes, d) : `${bytes} Bytes`; }
    function globalFormatChave(ch) { return typeof window.formatChave === 'function' ? window.formatChave(ch) : (ch && ch.length === 44 ? `${ch.substring(0,6)}...${ch.substring(ch.length-6)}` : ch || '--'); }
    function globalFormatDateTime(dt) { return typeof window.formatDateTime === 'function' ? window.formatDateTime(dt) : (dt ? new Date(dt).toLocaleString('pt-BR') : '--'); }
    function globalShowNotification(msg, type) { if(typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log(`${type.toUpperCase()}: ${msg}`);}
    function globalGetDocumentStatusObject(doc, tipo) { 
        if(typeof window.getDocumentStatusObject === 'function') return window.getDocumentStatusObject(doc, tipo);
        // Fallback simples se a função global não existir
        if (doc && doc.status) return { text: doc.status, badgeClass: 'bg-light text-dark border' };
        return {text:'N/A', badgeClass:'bg-light text-dark border'}; 
    }

    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener('click', loadUploadHistory);
    }

    // CARREGAMENTO AUTOMÁTICO DO HISTÓRICO
    if (historyTableBody) { // Somente chama se a tabela existir
        loadUploadHistory();
    } else {
        console.error("Não foi possível carregar o histórico automaticamente: 'uploadHistoryTableBody' não encontrado.");
    }
});