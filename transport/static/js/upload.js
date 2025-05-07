/**
 * upload.js
 * Functions for the XML upload and processing feature
 */

// Global variables
let uploadedFiles = [];
let processingResults = [];
let batchMode = false;

/**
 * Initializes the upload functionality when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set up event listeners
    setupEventListeners();
    
    // Check for URL parameters
    checkUrlParameters();
    
    // Update upload mode based on default setting
    updateUploadMode(batchMode);
});

/**
 * Sets up all event listeners for the upload feature
 */
function setupEventListeners() {
    // File input change
    const fileInput = document.getElementById('xmlFile');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            handleFileSelection(e.target.files);
        });
    }
    
    // Multiple file input change
    const multipleFileInput = document.getElementById('xmlFiles');
    if (multipleFileInput) {
        multipleFileInput.addEventListener('change', function(e) {
            handleMultipleFileSelection(e.target.files);
        });
    }
    
    // Upload mode toggle
    const uploadModeSwitch = document.getElementById('uploadMode');
    if (uploadModeSwitch) {
        uploadModeSwitch.addEventListener('change', function() {
            updateUploadMode(this.checked);
        });
    }
    
    // Drag and drop zone
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
        
        dropZone.addEventListener('drop', handleDrop, false);
    }
    
    // Upload button
    const uploadButton = document.getElementById('uploadButton');
    if (uploadButton) {
        uploadButton.addEventListener('click', function() {
            processFiles();
        });
    }
    
    // Clear button
    const clearButton = document.getElementById('clearFiles');
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            clearFileList();
        });
    }
    
    // Upload retorno standalone button
    const uploadRetornoButton = document.getElementById('uploadRetornoButton');
    if (uploadRetornoButton) {
        uploadRetornoButton.addEventListener('click', function() {
            uploadRetornoFile();
        });
    }
}

/**
 * Checks for URL parameters that might affect the upload behavior
 */
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for batch mode parameter
    if (urlParams.has('batch')) {
        batchMode = urlParams.get('batch') === 'true';
        
        // Update UI to match
        const uploadModeSwitch = document.getElementById('uploadMode');
        if (uploadModeSwitch) {
            uploadModeSwitch.checked = batchMode;
        }
    }
    
    // Check for type parameter
    if (urlParams.has('type')) {
        const type = urlParams.get('type');
        const typeSelect = document.getElementById('xmlType');
        if (typeSelect && (type === 'cte' || type === 'mdfe' || type === 'evento')) {
            typeSelect.value = type;
        }
    }
}

/**
 * Prevents default behavior for drag and drop events
 * @param {Event} e - Event object
 */
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

/**
 * Highlights the drop zone when files are dragged over
 * @param {Event} e - Event object
 */
function highlight(e) {
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.classList.add('highlight');
    }
}

/**
 * Removes highlight from drop zone
 * @param {Event} e - Event object
 */
function unhighlight(e) {
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.classList.remove('highlight');
    }
}

/**
 * Handles file drop event
 * @param {Event} e - Drop event
 */
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (batchMode) {
        handleMultipleFileSelection(files);
    } else {
        handleFileSelection(files);
    }
}

/**
 * Updates the upload mode UI based on batch mode setting
 * @param {boolean} isBatchMode - Whether batch mode is enabled
 */
function updateUploadMode(isBatchMode) {
    batchMode = isBatchMode;
    
    // Update UI components
    const singleUploadControls = document.getElementById('singleUploadControls');
    const batchUploadControls = document.getElementById('batchUploadControls');
    const dropZoneText = document.getElementById('dropZoneText');
    
    if (singleUploadControls && batchUploadControls) {
        if (isBatchMode) {
            singleUploadControls.classList.add('d-none');
            batchUploadControls.classList.remove('d-none');
            if (dropZoneText) {
                dropZoneText.textContent = 'Arraste vários arquivos XML aqui ou clique para selecionar';
            }
        } else {
            singleUploadControls.classList.remove('d-none');
            batchUploadControls.classList.add('d-none');
            if (dropZoneText) {
                dropZoneText.textContent = 'Arraste um arquivo XML aqui ou clique para selecionar';
            }
        }
    }
    
    // Clear existing file lists
    clearFileList();
}

/**
 * Handles file selection for single file mode
 * @param {FileList} files - Selected files
 */
function handleFileSelection(files) {
    if (files.length === 0) return;
    
    // For single upload mode, only use the first file
    const file = files[0];
    
    // Check if it's an XML file
    if (!file.name.toLowerCase().endsWith('.xml')) {
        showNotification('Por favor, selecione apenas arquivos XML.', 'error');
        return;
    }
    
    // Update file info display
    const fileInfo = document.getElementById('fileInfo');
    if (fileInfo) {
        fileInfo.innerHTML = `
        <div class="alert alert-info">
            <strong>Arquivo:</strong> ${file.name} (${formatFileSize(file.size)})
            <button type="button" class="btn-close float-end" aria-label="Close" onclick="clearFileList()"></button>
        </div>`;
    }
    
    // Update selected file info
    document.getElementById('xmlFile').setAttribute('data-filename', file.name);
    
    // Store file for later processing
    uploadedFiles = [file];
    
    // Enable upload button
    document.getElementById('uploadButton').disabled = false;
}

/**
 * Handles multiple file selection for batch mode
 * @param {FileList} files - Selected files
 */
function handleMultipleFileSelection(files) {
    if (files.length === 0) return;
    
    // Filter XML files
    const xmlFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.xml'));
    
    if (xmlFiles.length === 0) {
        showNotification('Por favor, selecione apenas arquivos XML.', 'error');
        return;
    }
    
    if (xmlFiles.length !== files.length) {
        showNotification(`Apenas os ${xmlFiles.length} arquivos XML foram selecionados.`, 'warning');
    }
    
    // Store files for later processing
    uploadedFiles = [...uploadedFiles, ...xmlFiles];
    
    // Update file list display
    updateFileListDisplay();
    
    // Enable upload button if files selected
    document.getElementById('uploadButton').disabled = uploadedFiles.length === 0;
}

/**
 * Updates the file list display
 */
function updateFileListDisplay() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '<p>Nenhum arquivo selecionado.</p>';
        return;
    }
    
    let html = '<div class="list-group">';
    
    uploadedFiles.forEach((file, index) => {
        html += `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <i class="fas fa-file-code text-primary me-2"></i>
                ${file.name} <small class="text-muted">(${formatFileSize(file.size)})</small>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    });
    
    html += '</div>';
    html += `<p class="mt-2 text-muted small">${uploadedFiles.length} arquivo(s) selecionado(s).</p>`;
    
    fileList.innerHTML = html;
}

/**
 * Removes a file from the list
 * @param {number} index - File index to remove
 */
function removeFile(index) {
    if (index >= 0 && index < uploadedFiles.length) {
        uploadedFiles.splice(index, 1);
        updateFileListDisplay();
        
        // Disable upload button if no files left
        document.getElementById('uploadButton').disabled = uploadedFiles.length === 0;
    }
}

/**
 * Clears the file list
 */
function clearFileList() {
    uploadedFiles = [];
    
    // Reset file inputs
    const fileInput = document.getElementById('xmlFile');
    if (fileInput) {
        fileInput.value = '';
        fileInput.removeAttribute('data-filename');
    }
    
    const multipleFileInput = document.getElementById('xmlFiles');
    if (multipleFileInput) {
        multipleFileInput.value = '';
    }
    
    // Clear file displays
    const fileInfo = document.getElementById('fileInfo');
    if (fileInfo) {
        fileInfo.innerHTML = '';
    }
    
    const fileList = document.getElementById('fileList');
    if (fileList) {
        fileList.innerHTML = '<p>Nenhum arquivo selecionado.</p>';
    }
    
    // Disable upload button
    document.getElementById('uploadButton').disabled = true;
}

/**
 * Processes the uploaded files
 */
function processFiles() {
    if (uploadedFiles.length === 0) {
        showNotification('Nenhum arquivo selecionado para upload.', 'warning');
        return;
    }
    
    // Disable upload button
    const uploadButton = document.getElementById('uploadButton');
    uploadButton.disabled = true;
    uploadButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processando...';
    
    // Reset results
    processingResults = [];
    
    // Show progress container
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.classList.remove('d-none');
    }
    
    // Update progress
    updateProgressBar(0, uploadedFiles.length);
    
    // Process files based on mode
    if (batchMode) {
        processBatchFiles();
    } else {
        processSingleFile();
    }
}

/**
 * Processes single file upload
 */
function processSingleFile() {
    const file = uploadedFiles[0];
    const xmlType = document.getElementById('xmlType').value;
    const retornoFile = document.getElementById('xmlRetornoFile').files[0];
    
    const formData = new FormData();
    formData.append('arquivo_xml', file);
    
    if (retornoFile) {
        formData.append('arquivo_xml_retorno', retornoFile);
    }
    
    // Send request to API
    Auth.fetchWithAuth(`/api/upload/${xmlType}/`, {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || 'Erro ao processar arquivo');
        }
        
        // Save result
        processingResults.push({
            filename: file.name,
            success: true,
            result: result
        });
        
        // Update progress
        updateProgressBar(1, 1);
        
        // Show success
        showUploadSuccess(result);
    })
    .catch(error => {
        console.error('Error processing file:', error);
        
        // Save error
        processingResults.push({
            filename: file.name,
            success: false,
            error: error.message
        });
        
        // Update progress
        updateProgressBar(1, 1);
        
        // Show error
        showUploadError(error.message);
    })
    .finally(() => {
        // Reset upload button
        uploadButton.disabled = false;
        uploadButton.innerHTML = '<i class="fas fa-upload me-2"></i>Processar';
    });
}

/**
 * Processes batch file upload
 */
function processBatchFiles() {
    const formData = new FormData();
    
    // Append all files
    uploadedFiles.forEach(file => {
        formData.append('arquivos_xml', file);
    });
    
    // Send request to API
    Auth.fetchWithAuth('/api/upload/batch/', {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || 'Erro ao processar arquivos em lote');
        }
        
        // Process batch results
        handleBatchResults(result);
    })
    .catch(error => {
        console.error('Error processing batch:', error);
        
        // Show error
        showNotification(`Erro ao processar lote: ${error.message}`, 'error');
        
        // Update progress to complete
        updateProgressBar(uploadedFiles.length, uploadedFiles.length);
    })
    .finally(() => {
        // Reset upload button
        const uploadButton = document.getElementById('uploadButton');
        uploadButton.disabled = false;
        uploadButton.innerHTML = '<i class="fas fa-upload me-2"></i>Processar';
    });
}

/**
 * Handles batch upload results
 * @param {Object} result - Batch processing result
 */
function handleBatchResults(result) {
    // Save results
    if (result.resultados && Array.isArray(result.resultados)) {
        processingResults = result.resultados.map(item => ({
            filename: item.arquivo || 'Desconhecido',
            success: item.sucesso,
            result: item.resultado,
            error: item.erro
        }));
    }
    
    // Update progress to complete
    updateProgressBar(uploadedFiles.length, uploadedFiles.length);
    
    // Show summary
    showBatchSummary(result);
}

/**
 * Updates the progress bar
 * @param {number} processed - Number of processed files
 * @param {number} total - Total number of files
 */
function updateProgressBar(processed, total) {
    const progressBar = document.getElementById('uploadProgress');
    const progressLabel = document.getElementById('progressLabel');
    
    if (progressBar && progressLabel) {
        const percentage = Math.round((processed / total) * 100);
        progressBar.style.width = `${percentage}%`;
        progressBar.setAttribute('aria-valuenow', percentage);
        progressLabel.textContent = `${processed} de ${total} arquivo(s) (${percentage}%)`;
    }
}

/**
 * Shows success message for single file upload
 * @param {Object} result - Processing result
 */
function showUploadSuccess(result) {
    const resultContainer = document.getElementById('resultContainer');
    if (!resultContainer) return;
    
    resultContainer.classList.remove('d-none');
    
    let html = `
    <div class="alert alert-success">
        <h5><i class="fas fa-check-circle me-2"></i>Arquivo processado com sucesso!</h5>
    `;
    
    if (result.tipo === 'CT-e' || result.tipo === 'MDF-e') {
        const tipo = result.tipo;
        const chave = result.chave;
        const id = result.id;
        
        html += `
        <p><strong>Tipo:</strong> ${tipo}</p>
        <p><strong>Chave:</strong> ${chave}</p>
        <div class="mt-3">
            <a href="/api/${tipo === 'CT-e' ? 'ctes' : 'mdfes'}/${id}/" class="btn btn-sm btn-outline-primary me-2" target="_blank">
                <i class="fas fa-eye me-1"></i> Ver Detalhes
            </a>
            <a href="/api/${tipo === 'CT-e' ? 'ctes' : 'mdfes'}/${id}/xml/" class="btn btn-sm btn-outline-info me-2" target="_blank">
                <i class="fas fa-file-code me-1"></i> Download XML
            </a>
            <a href="/api/${tipo === 'CT-e' ? 'ctes' : 'mdfes'}/${id}/${tipo === 'CT-e' ? 'dacte' : 'damdfe'}/" class="btn btn-sm btn-outline-success" target="_blank">
                <i class="fas fa-file-pdf me-1"></i> ${tipo === 'CT-e' ? 'DACTE' : 'DAMDFE'}
            </a>
        </div>
        `;
    } else if (result.tipo === 'Evento') {
        html += `
        <p><strong>Tipo:</strong> ${result.evento || 'Evento'}</p>
        <p><strong>Chave Documento:</strong> ${result.chave_documento || '--'}</p>
        <p><strong>Status:</strong> ${result.status || '--'}</p>
        `;
    }
    
    html += '</div>';
    
    resultContainer.innerHTML = html;
    
    // Scroll to result
    resultContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Shows error message for single file upload
 * @param {string} errorMessage - Error message
 */
function showUploadError(errorMessage) {
    const resultContainer = document.getElementById('resultContainer');
    if (!resultContainer) return;
    
    resultContainer.classList.remove('d-none');
    
    const html = `
    <div class="alert alert-danger">
        <h5><i class="fas fa-exclamation-circle me-2"></i>Erro ao processar arquivo</h5>
        <p>${errorMessage}</p>
    </div>
    `;
    
    resultContainer.innerHTML = html;
    
    // Scroll to result
    resultContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Shows summary for batch upload
 * @param {Object} result - Batch processing result
 */
function showBatchSummary(result) {
    const resultContainer = document.getElementById('resultContainer');
    if (!resultContainer) return;
    
    resultContainer.classList.remove('d-none');
    
    const processados = result.processados || 0;
    const sucesso = result.sucesso || 0;
    const erros = result.erros || 0;
    
    let html = `
    <div class="card">
        <div class="card-header bg-light">
            <h5 class="card-title mb-0">Resultado do Processamento em Lote</h5>
        </div>
        <div class="card-body">
            <div class="row text-center mb-4">
                <div class="col-md-4">
                    <h2>${processados}</h2>
                    <p class="text-muted">Total Processados</p>
                </div>
                <div class="col-md-4">
                    <h2 class="text-success">${sucesso}</h2>
                    <p class="text-muted">Sucessos</p>
                </div>
                <div class="col-md-4">
                    <h2 class="text-danger">${erros}</h2>
                    <p class="text-muted">Erros</p>
                </div>
            </div>
    `;
    
    // Add detailed results table
    html += `
        <h6>Detalhamento do Processamento</h6>
        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead>
                    <tr>
                        <th>Arquivo</th>
                        <th>Status</th>
                        <th>Detalhes</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Add rows for each result
    processingResults.forEach(item => {
        html += `
        <tr>
            <td>${item.filename}</td>
            <td>${item.success ? 
                '<span class="badge bg-success">Sucesso</span>' : 
                '<span class="badge bg-danger">Erro</span>'}</td>
            <td>
                ${item.success ? 
                    `Tipo: ${item.result?.tipo || '--'}, Chave: ${truncateText(item.result?.chave || '--', 20)}` : 
                    `Erro: ${item.error || 'Desconhecido'}`}
            </td>
        </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    // Add download report button
    html += `
        <div class="mt-3">
            <button class="btn btn-outline-primary" onclick="exportarRelatorio()">
                <i class="fas fa-file-download me-2"></i>Exportar Relatório
            </button>
        </div>
    `;
    
    html += `
        </div>
    </div>
    `;
    
    resultContainer.innerHTML = html;
    
    // Scroll to result
    resultContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Uploads retorno file as standalone
 */
function uploadRetornoFile() {
    const retornoFile = document.getElementById('xmlRetornoStandalone').files[0];
    
    if (!retornoFile) {
        showNotification('Selecione um arquivo de retorno para upload.', 'warning');
        return;
    }
    
    // Check if it's an XML file
    if (!retornoFile.name.toLowerCase().endsWith('.xml')) {
        showNotification('Por favor, selecione apenas arquivos XML.', 'error');
        return;
    }
    
    // Disable upload button
    const uploadButton = document.getElementById('uploadRetornoButton');
    uploadButton.disabled = true;
    uploadButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processando...';
    
    const formData = new FormData();
    formData.append('arquivo_xml_retorno', retornoFile);
    
    // Send request to API
    Auth.fetchWithAuth('/api/upload/retorno/', {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || 'Erro ao processar arquivo de retorno');
        }
        
        showNotification('Arquivo de retorno processado com sucesso!', 'success');
        
        // Show result
        const resultContainer = document.getElementById('resultRetornoContainer');
        if (resultContainer) {
            resultContainer.classList.remove('d-none');
            resultContainer.innerHTML = `
            <div class="alert alert-success">
                <h5><i class="fas fa-check-circle me-2"></i>Arquivo de retorno processado com sucesso!</h5>
                <p><strong>Tipo:</strong> ${result.tipo || 'Retorno'}</p>
                <p><strong>Chave Documento:</strong> ${result.chave_documento || '--'}</p>
                <p><strong>Status:</strong> ${result.status || '--'}</p>
            </div>
            `;
        }
    })
    .catch(error => {
        console.error('Error processing retorno file:', error);
        showNotification(`Erro ao processar arquivo de retorno: ${error.message}`, 'error');
        
        // Show error
        const resultContainer = document.getElementById('resultRetornoContainer');
        if (resultContainer) {
            resultContainer.classList.remove('d-none');
            resultContainer.innerHTML = `
            <div class="alert alert-danger">
                <h5><i class="fas fa-exclamation-circle me-2"></i>Erro ao processar arquivo de retorno</h5>
                <p>${error.message}</p>
            </div>
            `;
        }
    })
    .finally(() => {
        // Reset upload button
        uploadButton.disabled = false;
        uploadButton.innerHTML = '<i class="fas fa-upload me-2"></i>Processar';
    });
}

/**
 * Exports batch processing report to CSV
 */
function exportarRelatorio() {
    if (processingResults.length === 0) {
        showNotification('Não há resultados para exportar.', 'warning');
        return;
    }
    
    // Prepare CSV content
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Arquivo,Status,Tipo,Chave,Detalhes\n';
    
    processingResults.forEach(item => {
        const filename = item.filename ? item.filename.replace(/,/g, ' ') : '';
        const status = item.success ? 'Sucesso' : 'Erro';
        const tipo = item.success ? (item.result?.tipo || '') : '';
        const chave = item.success ? (item.result?.chave || '') : '';
        const detalhes = item.success ? '' : (item.error || '').replace(/,/g, ' ');
        
        csvContent += `${filename},${status},${tipo},${chave},${detalhes}\n`;
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_upload_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Truncates text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Shows notification toast
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'success', duration = 5000) {
    // Use global function if available
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
        return;
    }
    
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