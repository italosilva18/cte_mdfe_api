/**
 * upload.js
 * Funcionalidades para upload de arquivos XML (CT-e, MDF-e e eventos) - Individual e Eventos
 * Versão: 1.3.0 (Melhorias no drag-and-drop e feedback)
 */

// Assumindo que 'Auth' está definido globalmente (em auth.js)
// Assumindo que funções como showNotification, formatDateTime, formatChave, getStatusBadgeHTML estão em scripts.js

let selectedFilePrincipal = null;
let selectedFileRetorno = null;

document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadSingleXML();
        });
    }

    // Histórico
    loadUploadHistory();
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', loadUploadHistory);
    }

    // Configurar Drop Zones para Upload Individual
    setupDropZone('dropZonePrincipal', 'arquivo_xml', 'fileInfoPrincipal', (file) => { selectedFilePrincipal = file; });
    setupDropZone('dropZoneRetorno', 'arquivo_xml_retorno', 'fileInfoRetorno', (file) => { selectedFileRetorno = file; });

    // Botão Limpar Seleção Individual
    const btnClearSingle = document.getElementById('btnClearSingle');
    if (btnClearSingle) {
        btnClearSingle.addEventListener('click', clearSingleSelection);
    }
});

function setupDropZone(dropZoneId, fileInputId, fileInfoId, fileSetterCallback) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    const fileInfo = document.getElementById(fileInfoId);

    if (!dropZone || !fileInput || !fileInfo) {
        console.warn(`Elementos da drop zone ${dropZoneId} não encontrados.`);
        return;
    }

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files; // Atribui os arquivos ao input
            displayFileInfo(files[0], fileInfo);
            if (fileSetterCallback) fileSetterCallback(files[0]);
        }
    });

    fileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            displayFileInfo(files[0], fileInfo);
            if (fileSetterCallback) fileSetterCallback(files[0]);
        } else {
            fileInfo.innerHTML = ''; // Limpa se nenhum arquivo for selecionado
            if (fileSetterCallback) fileSetterCallback(null);
        }
    });
}

function displayFileInfo(file, fileInfoElement) {
    if (file && fileInfoElement) {
        fileInfoElement.innerHTML = `<strong>Arquivo:</strong> ${escapeHtml(file.name)} <span class="text-muted">(${formatFileSize(file.size)})</span>`;
    }
}

function clearSingleSelection() {
    const fileInputPrincipal = document.getElementById('arquivo_xml');
    const fileInfoPrincipal = document.getElementById('fileInfoPrincipal');
    const fileInputRetorno = document.getElementById('arquivo_xml_retorno');
    const fileInfoRetorno = document.getElementById('fileInfoRetorno');

    if (fileInputPrincipal) fileInputPrincipal.value = '';
    if (fileInfoPrincipal) fileInfoPrincipal.innerHTML = '';
    selectedFilePrincipal = null;

    if (fileInputRetorno) fileInputRetorno.value = '';
    if (fileInfoRetorno) fileInfoRetorno.innerHTML = '';
    selectedFileRetorno = null;

    hideUploadMessages();
    const progressContainer = document.getElementById('uploadProgress');
    if(progressContainer) progressContainer.classList.add('d-none');
}


function uploadSingleXML() {
    const progressBar = document.querySelector('#uploadProgress .progress-bar');
    const progressContainer = document.getElementById('uploadProgress');
    const submitButton = document.getElementById('btnSubmit');
    const fileInputPrincipal = document.getElementById('arquivo_xml');
    const fileInputRetorno = document.getElementById('arquivo_xml_retorno');

    if (!fileInputPrincipal || fileInputPrincipal.files.length === 0) {
        showUploadError('Por favor, selecione um arquivo XML principal.');
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Enviando...`;
    }
    hideUploadMessages();
    if (progressContainer && progressBar) {
        progressContainer.classList.remove('d-none');
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
        progressBar.classList.remove('bg-success', 'bg-danger', 'bg-info');
        progressBar.classList.add('progress-bar-animated');
    }

    const formData = new FormData();
    formData.append('arquivo_xml', fileInputPrincipal.files[0]);
    if (fileInputRetorno && fileInputRetorno.files.length > 0) {
        formData.append('arquivo_xml_retorno', fileInputRetorno.files[0]);
    }

    let progress = 0;
    const progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 95);
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
        }
    }, 200);

    Auth.fetchWithAuth('/api/upload/', {
        method: 'POST',
        body: formData,
    })
    .then(response => {
        clearInterval(progressInterval);
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressBar.setAttribute('aria-valuenow', 100);
            progressBar.classList.remove('progress-bar-animated');
        }
        // Devolve a resposta e o status para tratamento unificado
        return response.json().then(data => ({ ok: response.ok, status: response.status, data }));
    })
    .then(({ ok, status, data }) => {
        if (!ok) {
            // Se a API retornou um erro (4xx, 5xx), lança para o catch
            throw { ...data, statusCode: status }; // Adiciona statusCode ao objeto de erro
        }

        // Sucesso (200, 201, 202)
        let mensagem = data.message || 'Arquivo processado.';
        let alertType = 'success';
        let progressBarClass = 'bg-success';

        if (status === 202) { // Evento recebido, mas sem ação direta ou falha SEFAZ
            mensagem = data.message || "Evento recebido.";
            if(data.warning) mensagem += ` Aviso: ${data.warning}`;
            alertType = 'info';
            progressBarClass = 'bg-info';
        } else { // 200 ou 201
            if (data.chave) mensagem += ` Chave: ${formatChave(data.chave)}`;
            else if (data.documento_chave && data.documento_chave !== 'N/A') mensagem += ` Documento: ${formatChave(data.documento_chave)}`;
            if (data.reprocessamento) mensagem += " (Reprocessado)";
        }

        if (progressBar) progressBar.classList.add(progressBarClass);
        showUploadMessage(mensagem, alertType);
        clearSingleSelection(); // Limpa campos após sucesso
        loadUploadHistory();

        setTimeout(() => {
            progressContainer?.classList.add('d-none');
            progressBar?.classList.remove(progressBarClass);
        }, 3000);
    })
    .catch(error => {
        clearInterval(progressInterval);
        console.error('Erro detalhado no upload individual:', error);
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.textContent = 'Erro!';
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-danger');
        }

        let detailedMessage = 'Erro ao processar o arquivo.';
        if (error && error.error) {
            detailedMessage = error.error;
        } else if (error && error.detail) {
            detailedMessage = error.detail;
        } else if (error && error.message) {
            detailedMessage = error.message;
        } else if (typeof error === 'object') {
            // Para erros de validação do DRF que vêm como um objeto de campos
            const fieldErrors = Object.entries(error)
                .filter(([key]) => key !== 'statusCode')
                .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                .join('; ');
            if (fieldErrors) detailedMessage = `Erro de validação: ${fieldErrors}`;
        }


        showUploadError(detailedMessage);
        setTimeout(() => {
            progressContainer?.classList.add('d-none');
            progressBar?.classList.remove('bg-danger');
        }, 5000);
    })
    .finally(() => {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i class="fas fa-paper-plane me-2"></i>Enviar Arquivo Único`;
        }
    });
}

function showUploadMessage(message, type = 'success') {
    const alertElement = type === 'success' ? document.getElementById('uploadSuccess') : (type === 'info' ? document.getElementById('uploadSuccess') : document.getElementById('uploadError')); // Reutiliza success para info
    const messageElement = type === 'success' ? document.getElementById('successMessage') : (type === 'info' ? document.getElementById('successMessage') : document.getElementById('errorMessage'));

    if (alertElement && messageElement) {
        messageElement.textContent = message;
        alertElement.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-info');
        if (type === 'success') alertElement.classList.add('alert-success');
        else if (type === 'info') alertElement.classList.add('alert-info');
        else alertElement.classList.add('alert-danger');
        
        hideUploadMessages(type === 'success' || type === 'info' ? 'uploadError' : 'uploadSuccess');
        alertElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        showNotification(message, type);
    }
}
function showUploadSuccess(message) { showUploadMessage(message, 'success'); }
function showUploadError(message) { showUploadMessage(message, 'error'); }


function hideUploadMessages(which = 'both') {
    if (which === 'both' || which === 'uploadSuccess') {
        document.getElementById('uploadSuccess')?.classList.add('d-none');
    }
    if (which === 'both' || which === 'uploadError') {
        document.getElementById('uploadError')?.classList.add('d-none');
    }
}

function loadUploadHistory() {
    const tbody = document.getElementById('upload-history');
    if (!tbody) {
        console.warn("Elemento 'upload-history' não encontrado.");
        return;
    }
    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4"><div class="spinner-border spinner-border-sm"></div> Carregando histórico...</td></tr>`;

    // A API /api/upload/history/ não existe, então buscamos os 5 últimos CTes e 5 últimos MDFes
    // ordenados por data_upload e combinamos.
    Promise.all([
        Auth.fetchWithAuth('/api/ctes/?ordering=-data_upload&limit=5&page_size=5'),
        Auth.fetchWithAuth('/api/mdfes/?ordering=-data_upload&limit=5&page_size=5')
    ])
    .then(async ([ctesResponse, mdfesResponse]) => {
        let combined = [];
        if (ctesResponse.ok) {
            const ctesData = await ctesResponse.json();
            combined.push(...(ctesData.results || []).map(item => mapToHistoryItem(item, 'CT-e')));
        } else { console.error("Erro ao buscar CT-es para histórico:", ctesResponse.status); }

        if (mdfesResponse.ok) {
            const mdfesData = await mdfesResponse.json();
            combined.push(...(mdfesData.results || []).map(item => mapToHistoryItem(item, 'MDF-e')));
        } else { console.error("Erro ao buscar MDF-es para histórico:", mdfesResponse.status); }

        combined.sort((a, b) => new Date(b.data_upload_raw) - new Date(a.data_upload_raw));
        return combined.slice(0, 10); // Pega os 10 mais recentes no geral
    })
    .then(data => {
        renderUploadHistory(data, tbody);
    })
    .catch(error => {
        console.error('Erro ao carregar histórico de uploads:', error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger p-4">Erro ao carregar histórico.</td></tr>`;
    });
}

function mapToHistoryItem(item, tipoDoc) {
    return {
        id: item.id,
        chave: item.chave,
        data_upload_raw: item.data_upload, // Para ordenação
        data_upload: formatDateTime(item.data_upload),
        tipo_doc: tipoDoc,
        numero_doc: tipoDoc === 'CT-e' ? item.numero_cte : item.numero_mdfe,
        status: item.status, // O serializer de lista já deve ter um campo 'status'
        api_path: tipoDoc === 'CT-e' ? 'ctes' : 'mdfes'
    };
}

function renderUploadHistory(data, tbody) {
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted p-4">Nenhum upload recente.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${item.data_upload}</td>
            <td>${item.tipo_doc} ${item.numero_doc || ''}</td>
            <td title="${item.chave}">${formatChave(item.chave)}</td>
            <td>${getStatusBadgeHTML(item.status)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <a href="/${item.api_path.slice(0,-1)}/" class="btn btn-outline-primary" title="Ver na Lista de Documentos">
                       <i class="fas fa-list-alt"></i>
                    </a>
                    <a href="/api/${item.api_path}/${item.id}/xml/" class="btn btn-outline-secondary" title="Download XML" target="_blank" rel="noopener noreferrer">
                        <i class="fas fa-file-code"></i>
                    </a>
                </div>
            </td>
        </tr>
    `).join('');
}

// --- Funções Utilitárias (idealmente em scripts.js global) ---
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatDateTime(dateString) {
    if (!dateString) return '--';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateString; }
}
function formatChave(chave) {
    if (!chave || typeof chave !== 'string') return '--';
    return chave.length === 44 ? `${chave.substring(0, 6)}...${chave.substring(38)}` : (chave.length > 15 ? chave.substring(0, 12) + '...' : chave);
}
function getStatusBadgeHTML(statusText) {
    if (!statusText) return '<span class="badge bg-secondary rounded-pill">Desconhecido</span>';
    const lowerStatus = String(statusText).toLowerCase();
    let badgeClass = 'bg-secondary';
    if (lowerStatus.includes('autorizado')) badgeClass = 'bg-success';
    else if (lowerStatus.includes('cancelado')) badgeClass = 'bg-danger';
    else if (lowerStatus.includes('rejeitado')) badgeClass = 'bg-warning text-dark';
    else if (lowerStatus.includes('processado')) badgeClass = 'bg-info text-dark';
    else if (lowerStatus.includes('pendente')) badgeClass = 'bg-light text-dark border'; // Padrão mais neutro
    return `<span class="badge rounded-pill ${badgeClass}">${escapeHtml(statusText)}</span>`;
}
// Fallback para showNotification se não estiver globalmente disponível
if (typeof showNotification !== 'function') {
    window.showNotification = function(message, type = 'info', duration = 3000) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // Implementação de Toast simples se Bootstrap estiver disponível
        const toastContainer = document.querySelector('.toast-container.position-fixed.bottom-0.end-0.p-3') || (() => {
            const container = document.createElement('div');
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            container.style.zIndex = "1100";
            document.body.appendChild(container);
            return container;
        })();
        const toastId = `toast-${Date.now()}`;
        const toastTypeClass = { success: 'bg-success text-white', error: 'bg-danger text-white', warning: 'bg-warning text-dark', info: 'bg-info text-dark' }[type] || 'bg-secondary text-white';
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center ${toastTypeClass}" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="${duration}">
              <div class="d-flex"> <div class="toast-body">${message}</div>
                <button type="button" class="btn-close me-2 m-auto ${type === 'success' || type === 'error' ? 'btn-close-white' : ''}" data-bs-dismiss="toast" aria-label="Close"></button>
              </div></div>`;
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        const toastElement = document.getElementById(toastId);
        if (window.bootstrap && bootstrap.Toast) {
            const toast = new bootstrap.Toast(toastElement);
            toast.show();
            toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove());
        } else { // Fallback se Bootstrap Toast não estiver carregado
            setTimeout(() => toastElement.remove(), duration);
        }
    };
}