/**
 * upload.js
 * Functions for the XML upload functionality
 */

/**
 * Initializes the upload page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set up form submission handler
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadXML();
        });
    }
    
    // Load upload history
    loadUploadHistory();
});

/**
 * Handles XML file upload
 */
function uploadXML() {
    // Get form and progress elements
    const uploadForm = document.getElementById('uploadForm');
    const progressBar = document.querySelector('#uploadProgress .progress-bar');
    const progressContainer = document.getElementById('uploadProgress');
    
    // Check if file is selected
    const fileInput = document.getElementById('arquivoXML');
    if (!fileInput.files.length) {
        showUploadError('Por favor, selecione um arquivo XML para upload.');
        return;
    }
    
    // Hide previous messages
    hideMessages();
    
    // Show progress bar at 0%
    progressContainer.classList.remove('d-none');
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', 0);
    
    // Prepare form data
    const formData = new FormData(uploadForm);
    
    // Start progress animation (simulated)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 5;
        if (progress <= 90) {
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
        }
    }, 150);
    
    // Upload file with authentication
    fetch('/api/upload/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        },
        body: formData
    })
    .then(response => {
        // Stop progress animation
        clearInterval(progressInterval);
        
        // Complete progress bar
        progressBar.style.width = '100%';
        progressBar.setAttribute('aria-valuenow', 100);
        
        // Handle response
        if (!response.ok) {
            // Handle 409 (Document already exists)
            if (response.status === 409) {
                return response.json().then(data => {
                    throw new Error(data.detail || 'Documento já existe no sistema.');
                });
            }
            
            // Handle other errors
            return response.json().then(data => {
                throw new Error(data.detail || 'Erro no processamento do arquivo.');
            });
        }
        
        return response.json();
    })
    .then(data => {
        // Show success message
        showUploadSuccess(`Arquivo processado com sucesso! Tipo: ${data.tipo || 'Documento'}`);
        
        // Reset form
        uploadForm.reset();
        
        // Update upload history
        setTimeout(() => {
            loadUploadHistory();
        }, 1000);
        
        // Hide progress bar after delay
        setTimeout(() => {
            progressContainer.classList.add('d-none');
        }, 2000);
    })
    .catch(error => {
        console.error('Upload error:', error);
        
        // Show error message
        showUploadError(error.message || 'Erro ao processar o arquivo. Tente novamente.');
        
        // Hide progress bar after delay
        setTimeout(() => {
            progressContainer.classList.add('d-none');
        }, 1000);
    });
}

/**
 * Shows upload success message
 * @param {string} message - Success message
 */
function showUploadSuccess(message) {
    const successAlert = document.getElementById('uploadSuccess');
    const successMessage = document.getElementById('successMessage');
    
    if (successAlert && successMessage) {
        successMessage.textContent = message;
        successAlert.classList.remove('d-none');
    }
}

/**
 * Shows upload error message
 * @param {string} message - Error message
 */
function showUploadError(message) {
    const errorAlert = document.getElementById('uploadError');
    const errorMessage = document.getElementById('errorMessage');
    
    if (errorAlert && errorMessage) {
        errorMessage.textContent = message;
        errorAlert.classList.remove('d-none');
    }
}

/**
 * Hides all alert messages
 */
function hideMessages() {
    document.getElementById('uploadSuccess')?.classList.add('d-none');
    document.getElementById('uploadError')?.classList.add('d-none');
}

/**
 * Loads upload history from API
 */
function loadUploadHistory() {
    const tbody = document.getElementById('upload-history');
    if (!tbody) return;
    
    // Show loading message
    tbody.innerHTML = `
    <tr>
        <td colspan="5" class="text-center">
            <div class="spinner-border spinner-border-sm text-success me-2" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            Carregando histórico...
        </td>
    </tr>`;
    
    // Fetch upload history
    Auth.fetchWithAuth('/api/uploads/recent/')
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro ao buscar histórico de uploads');
            }
            return response.json();
        })
        .then(data => {
            if (!data || data.length === 0) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        Nenhum upload encontrado.
                    </td>
                </tr>`;
                return;
            }
            
            // Render table rows
            let html = '';
            
            data.forEach(item => {
                const dataFormatada = formatDateTime(item.data_upload);
                const tipoDoc = getTipoDocumento(item);
                const statusHTML = getStatusHTML(item);
                
                html += `
                <tr>
                    <td>${dataFormatada}</td>
                    <td>${tipoDoc}</td>
                    <td>${truncateText(item.chave || '', 20)}</td>
                    <td>${statusHTML}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <a href="/api/${getApiPath(item.tipo)}/${item.id}/" class="btn btn-outline-primary" title="Ver Detalhes">
                                <i class="fas fa-eye"></i>
                            </a>
                            <a href="/api/${getApiPath(item.tipo)}/${item.id}/xml/" class="btn btn-outline-success" title="Download XML">
                                <i class="fas fa-file-code"></i>
                            </a>
                        </div>
                    </td>
                </tr>
                `;
            });
            
            tbody.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading upload history:', error);
            
            tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Erro ao carregar histórico. Tente novamente.
                </td>
            </tr>`;
        });
}

/**
 * Gets formatted document type
 * @param {Object} item - Document data
 * @returns {string} - Formatted document type
 */
function getTipoDocumento(item) {
    switch (item.tipo?.toUpperCase()) {
        case 'CTE': return 'CT-e';
        case 'MDFE': return 'MDF-e';
        case 'EVENTO':
            // Format event type if available
            if (item.evento_tipo) {
                // Map event type codes to readable names
                const eventTypesMap = {
                    '110111': 'Cancelamento',
                    '110110': 'Carta Correção',
                    // Add more event types as needed
                };
                
                const eventName = eventTypesMap[item.evento_tipo] || item.evento_tipo;
                return `Evento (${eventName})`;
            }
            return 'Evento';
        default: return item.tipo || 'Documento';
    }
}

/**
 * Gets API path for document type
 * @param {string} tipo - Document type
 * @returns {string} - API path
 */
function getApiPath(tipo) {
    switch (tipo?.toUpperCase()) {
        case 'CTE': return 'ctes';
        case 'MDFE': return 'mdfes';
        case 'EVENTO': return 'eventos';
        default: return 'documentos';
    }
}

/**
 * Gets status HTML badge
 * @param {Object} item - Document data
 * @returns {string} - HTML for status badge
 */
function getStatusHTML(item) {
    if (item.cancelado) {
        return '<span class="badge bg-danger">Cancelado</span>';
    }
    
    if (item.autorizado) {
        return '<span class="badge bg-success">Autorizado</span>';
    }
    
    if (item.processado) {
        return '<span class="badge bg-info">Processado</span>';
    }
    
    return '<span class="badge bg-warning text-dark">Pendente</span>';
}

/**
 * Formats date and time
 * @param {string} dateString - Date string
 * @returns {string} - Formatted date and time
 */
function formatDateTime(dateString) {
    if (!dateString) return '--';
    
    try {
        return new Date(dateString).toLocaleString('pt-BR');
    } catch (e) {
        return '--';
    }
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