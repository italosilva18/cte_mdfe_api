/**
 * manutencao.js
 * Functions for the vehicle maintenance panel
 */

// Global variables
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let manutencoesList = [];
let veiculosList = [];
let editingMaintenanceId = null;

/**
 * Initializes the maintenance panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Load initial data
    loadVeiculos();
    loadManutencoes();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the maintenance panel
 */
function setupEventListeners() {
    // Filter form submit
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            currentPage = 1; // Reset to first page when applying filters
            loadManutencoes();
        });
    }
    
    // Filter button
    const filterBtn = document.querySelector('#filterForm button[type="button"]');
    if (filterBtn) {
        filterBtn.addEventListener('click', function() {
            currentPage = 1; // Reset to first page when applying filters
            loadManutencoes();
        });
    }
    
    // Reset filters button
    const resetBtn = document.querySelector('#filterForm button[onclick="resetFilters()"]');
    if (resetBtn) {
        resetBtn.removeAttribute('onclick');
        resetBtn.addEventListener('click', resetFilters);
    }
    
    // Export CSV button
    const exportBtn = document.querySelector('button[onclick="exportCSV()"]');
    if (exportBtn) {
        exportBtn.removeAttribute('onclick');
        exportBtn.addEventListener('click', exportCSV);
    }
    
    // Add maintenance form submit
    const addForm = document.getElementById('manutencaoForm');
    if (addForm) {
        addForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveManutencao();
        });
    }
    
    // Save maintenance button
    const saveBtn = document.getElementById('saveManutencao');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveManutencao);
    }
    
    // Calculate total value when parts or labor value changes
    const partValue = document.getElementById('valor_peca');
    const laborValue = document.getElementById('valor_mao_obra');
    
    if (partValue && laborValue) {
        partValue.addEventListener('input', updateTotalValue);
        laborValue.addEventListener('input', updateTotalValue);
    }
    
    // Modal event listeners
    setupModalListeners();
}

/**
 * Set up modal event listeners
 */
function setupModalListeners() {
    // Reset form and ID when closing the maintenance modal
    const addMaintenanceModal = document.getElementById('addManutencaoModal');
    if (addMaintenanceModal) {
        addMaintenanceModal.addEventListener('hidden.bs.modal', function() {
            resetMaintenanceForm();
        });
    }
    
    // Edit button in detail modal
    const editMaintenanceBtn = document.getElementById('editManutencao');
    if (editMaintenanceBtn) {
        editMaintenanceBtn.addEventListener('click', function() {
            const maintenanceId = this.getAttribute('data-id');
            if (maintenanceId) {
                editManutencao(maintenanceId);
                // Close detail modal
                bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
            }
        });
    }
}

/**
 * Sets default date range (last 30 days)
 */
function setDefaultDateRange() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Format dates for input fields (YYYY-MM-DD)
    document.getElementById('data_inicio').value = formatDateForInput(thirtyDaysAgo);
    document.getElementById('data_fim').value = formatDateForInput(today);
}

/**
 * Formats date for input fields
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date string (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Loads vehicles list from API
 */
function loadVeiculos() {
    Auth.fetchWithAuth('/api/veiculos/')
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar lista de veículos');
            }
            return response.json();
        })
        .then(data => {
            // Store vehicles list
            veiculosList = data.results || data;
            
            // Populate select in form
            populateVeiculoSelect(veiculosList);
        })
        .catch(error => {
            console.error('Error loading vehicles:', error);
            showNotification('Erro ao carregar veículos. Tente novamente.', 'error');
        });
}

/**
 * Populates vehicle select with options
 * @param {Array} veiculos - List of vehicles
 */
function populateVeiculoSelect(veiculos) {
    const select = document.getElementById('veiculo');
    if (!select) return;
    
    // Clear current options
    select.innerHTML = '<option value="">Selecione um veículo</option>';
    
    // Add vehicles as options
    veiculos.forEach(veiculo => {
        const option = document.createElement('option');
        option.value = veiculo.id;
        option.textContent = `${veiculo.placa} - ${veiculo.modelo || 'Sem modelo'}`;
        select.appendChild(option);
    });
}

/**
 * Resets filters and loads data
 */
function resetFilters() {
    // Reset form
    document.getElementById('filterForm').reset();
    
    // Set default date range
    setDefaultDateRange();
    
    // Reset to first page
    currentPage = 1;
    
    // Load data with reset filters
    loadManutencoes();
}

/**
 * Loads maintenance list from API
 */
function loadManutencoes() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa').value;
    const status = document.getElementById('status').value;
    
    // Build API URL with query params
    let apiUrl = `/api/manutencoes/?page=${currentPage}&page_size=${pageSize}`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&status=${status}`;
    
    // Fetch data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar lista de manutenções');
            }
            return response.json();
        })
        .then(data => {
            // Update maintenance list and pagination
            manutencoesList = data.results || [];
            totalItems = data.count || 0;
            
            // Update summary cards if summary data is available
            if (data.summary) {
                updateSummaryCards(data.summary);
            }
            
            // Load chart data
            loadChartData();
            
            // Render table with results
            renderMaintenanceTable();
            
            // Update pagination controls
            updatePagination();
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading maintenance data:', error);
            showNotification('Erro ao carregar dados de manutenções. Tente novamente.', 'error');
            
            // Clear table with error message
            const tbody = document.getElementById('manutencoes-list');
            if (tbody) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Erro ao carregar dados. Tente novamente.
                    </td>
                </tr>`;
            }
            
            // Hide loading indicator
            hideLoading();
        });
}

/**
 * Loads chart data for dashboard
 */
function loadChartData() {
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    // Build API URL for chart data
    let apiUrl = `/api/manutencoes/charts/?`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    
    // Fetch chart data
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados para gráficos');
            }
            return response.json();
        })
        .then(data => {
            // Render charts
            renderStatusChart(data.status_chart || []);
            renderVeiculoChart(data.veiculo_chart || []);
        })
        .catch(error => {
            console.error('Error loading chart data:', error);
        });
}

/**
 * Updates summary cards with data
 * @param {Object} summary - Summary data
 */
function updateSummaryCards(summary) {
    document.getElementById('total-manutencoes').textContent = summary.total_manutencoes || 0;
    document.getElementById('custo-pecas').textContent = formatCurrency(summary.custo_pecas || 0);
    document.getElementById('custo-mao-obra').textContent = formatCurrency(summary.custo_mao_obra || 0);
    document.getElementById('custo-total').textContent = formatCurrency(summary.custo_total || 0);
}

/**
 * Renders maintenance status chart
 * @param {Array} data - Chart data
 */
function renderStatusChart(data) {
    const canvas = document.getElementById('statusChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    // Format data for chart
    const labels = [];
    const values = [];
    const colors = [];
    
    data.forEach(item => {
        labels.push(item.status);
        values.push(item.count);
        
        // Assign colors based on status
        switch (item.status) {
            case 'PENDENTE':
                colors.push('#ffc107');
                break;
            case 'AGENDADO':
                colors.push('#17a2b8');
                break;
            case 'PAGO':
                colors.push('#28a745');
                break;
            case 'CANCELADO':
                colors.push('#dc3545');
                break;
            default:
                colors.push('#6c757d');
        }
    });
    
    // Create chart
    new Chart(canvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${context.label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders vehicle maintenance costs chart
 * @param {Array} data - Chart data
 */
function renderVeiculoChart(data) {
    const canvas = document.getElementById('veiculoChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    // Sort data by cost in descending order and take top 10
    const sortedData = [...data].sort((a, b) => b.valor_total - a.valor_total).slice(0, 10);
    
    // Format data for chart
    const labels = sortedData.map(item => item.placa);
    const values = sortedData.map(item => item.valor_total);
    
    // Create chart
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Total (R$)',
                data: values,
                backgroundColor: '#4CAF50',
                borderColor: '#1b4d3e',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders the maintenance table
 */
function renderMaintenanceTable() {
    const tbody = document.getElementById('manutencoes-list');
    if (!tbody) return;
    
    if (manutencoesList.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
                Nenhuma manutenção encontrada para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    manutencoesList.forEach(manutencao => {
        // Format values
        const dataServico = manutencao.data_servico ? formatDate(new Date(manutencao.data_servico)) : '--';
        const valorTotal = manutencao.valor_peca + manutencao.valor_mao_obra;
        const statusHTML = getStatusHTML(manutencao.status);
        
        html += `
        <tr>
            <td>${manutencao.veiculo?.placa || '--'}</td>
            <td>${dataServico}</td>
            <td>${truncateText(manutencao.servico_realizado, 30) || '--'}</td>
            <td>${truncateText(manutencao.oficina, 20) || '--'}</td>
            <td>${manutencao.quilometragem || '--'}</td>
            <td>${formatCurrency(valorTotal)}</td>
            <td>${statusHTML}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary view-maintenance" data-id="${manutencao.id}" title="Ver Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-success edit-maintenance" data-id="${manutencao.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Add event listeners to buttons
    addTableButtonListeners();
}

/**
 * Adds event listeners to table buttons
 */
function addTableButtonListeners() {
    // View buttons
    document.querySelectorAll('.view-maintenance').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            viewMaintenanceDetails(id);
        });
    });
    
    // Edit buttons
    document.querySelectorAll('.edit-maintenance').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            editManutencao(id);
        });
    });
}

/**
 * Shows maintenance details in modal
 * @param {string} id - Maintenance ID
 */
function viewMaintenanceDetails(id) {
    // Get modal elements
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('editManutencao');
    
    // Set maintenance ID to edit button
    editBtn.setAttribute('data-id', id);
    
    // Show loading state in modal
    modalBody.innerHTML = `
    <div class="d-flex justify-content-center p-5">
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
    </div>
    <div class="text-center mt-3">Carregando detalhes da manutenção...</div>
    `;
    
    // Show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Fetch maintenance details
    Auth.fetchWithAuth(`/api/manutencoes/${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes da manutenção');
            }
            return response.json();
        })
        .then(data => {
            // Update modal title
            modalTitle.textContent = `Manutenção - ${data.veiculo?.placa || 'Veículo'} (${formatDate(data.data_servico)})`;
            
            // Render maintenance details
            renderMaintenanceDetails(modalBody, data);
        })
        .catch(error => {
            console.error('Error loading maintenance details:', error);
            
            // Show error in modal
            modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes da manutenção. Tente novamente.
            </div>
            `;
        });
}

/**
 * Renders maintenance details in modal
 * @param {Element} container - Container element
 * @param {Object} data - Maintenance data
 */
function renderMaintenanceDetails(container, data) {
    const valorTotal = data.valor_peca + data.valor_mao_obra;
    const statusHTML = getStatusHTML(data.status);
    
    let html = `
    <div class="row">
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Informações Básicas</h6>
            <p><strong>Veículo:</strong> ${data.veiculo?.placa || '--'}</p>
            <p><strong>Data do Serviço:</strong> ${formatDate(data.data_servico)}</p>
            <p><strong>Serviço Realizado:</strong> ${data.servico_realizado || '--'}</p>
            <p><strong>Quilometragem:</strong> ${data.quilometragem || '--'} km</p>
            <p><strong>Status:</strong> ${statusHTML}</p>
        </div>
        <div class="col-md-6">
            <h6 class="border-bottom pb-2 mb-3">Valores</h6>
            <p><strong>Valor da Peça:</strong> ${formatCurrency(data.valor_peca)}</p>
            <p><strong>Valor da Mão de Obra:</strong> ${formatCurrency(data.valor_mao_obra)}</p>
            <p><strong>Valor Total:</strong> ${formatCurrency(valorTotal)}</p>
            <p><strong>Oficina:</strong> ${data.oficina || '--'}</p>
            <p><strong>Nota Fiscal:</strong> ${data.nota_fiscal || '--'}</p>
        </div>
    </div>

    <div class="row mt-3">
        <div class="col-12">
            <h6 class="border-bottom pb-2 mb-3">Detalhes</h6>
            <p><strong>Peça Utilizada:</strong> ${data.peca_utilizada || '--'}</p>
            <p><strong>Observações:</strong> ${data.observacoes || '--'}</p>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Opens maintenance form for editing
 * @param {string} id - Maintenance ID
 */
function editManutencao(id) {
    // Set global editing ID
    editingMaintenanceId = id;
    
    // Get modal elements
    const modal = document.getElementById('addManutencaoModal');
    const modalTitle = document.getElementById('addManutencaoModalLabel');
    
    // Update modal title
    modalTitle.textContent = 'Editar Manutenção';
    
    // Fetch maintenance details
    Auth.fetchWithAuth(`/api/manutencoes/${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados da manutenção');
            }
            return response.json();
        })
        .then(data => {
            // Fill form with maintenance data
            fillMaintenanceForm(data);
            
            // Show modal
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();
        })
        .catch(error => {
            console.error('Error loading maintenance for editing:', error);
            showNotification('Erro ao carregar dados da manutenção. Tente novamente.', 'error');
        });
}

/**
 * Fills maintenance form with data
 * @param {Object} data - Maintenance data
 */
function fillMaintenanceForm(data) {
    document.getElementById('veiculo').value = data.veiculo?.id || '';
    document.getElementById('data_servico').value = formatDateForInput(new Date(data.data_servico));
    document.getElementById('servico_realizado').value = data.servico_realizado || '';
    document.getElementById('oficina').value = data.oficina || '';
    document.getElementById('quilometragem').value = data.quilometragem || '';
    document.getElementById('peca_utilizada').value = data.peca_utilizada || '';
    document.getElementById('nota_fiscal').value = data.nota_fiscal || '';
    document.getElementById('valor_peca').value = data.valor_peca || 0;
    document.getElementById('valor_mao_obra').value = data.valor_mao_obra || 0;
    document.getElementById('status_manutencao').value = data.status || 'PENDENTE';
    document.getElementById('observacoes').value = data.observacoes || '';
}

/**
 * Resets maintenance form
 */
function resetMaintenanceForm() {
    // Reset form fields
    document.getElementById('manutencaoForm').reset();
    
    // Reset global editing ID
    editingMaintenanceId = null;
    
    // Reset modal title
    document.getElementById('addManutencaoModalLabel').textContent = 'Nova Manutenção';
    
    // Set default date to today
    document.getElementById('data_servico').value = formatDateForInput(new Date());
}

/**
 * Updates total value when parts or labor value changes
 */
function updateTotalValue() {
    const valorPeca = parseFloat(document.getElementById('valor_peca').value) || 0;
    const valorMaoObra = parseFloat(document.getElementById('valor_mao_obra').value) || 0;
    const valorTotal = valorPeca + valorMaoObra;
    
    // Update total value display if it exists
    const totalDisplay = document.getElementById('valor_total');
    if (totalDisplay) {
        totalDisplay.value = valorTotal.toFixed(2);
    }
}

/**
 * Saves maintenance data
 */
function saveManutencao() {
    // Get form
    const form = document.getElementById('manutencaoForm');
    
    // Basic validation
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Collect form data
    const formData = {
        veiculo: document.getElementById('veiculo').value,
        data_servico: document.getElementById('data_servico').value,
        servico_realizado: document.getElementById('servico_realizado').value,
        oficina: document.getElementById('oficina').value,
        quilometragem: document.getElementById('quilometragem').value,
        peca_utilizada: document.getElementById('peca_utilizada').value,
        nota_fiscal: document.getElementById('nota_fiscal').value,
        valor_peca: parseFloat(document.getElementById('valor_peca').value) || 0,
        valor_mao_obra: parseFloat(document.getElementById('valor_mao_obra').value) || 0,
        status: document.getElementById('status_manutencao').value,
        observacoes: document.getElementById('observacoes').value
    };
    
    // Set API URL and method
    let apiUrl = '/api/manutencoes/';
    let method = 'POST';
    
    if (editingMaintenanceId) {
        apiUrl += `${editingMaintenanceId}/`;
        method = 'PUT';
    }
    
    // Disable save button
    const saveBtn = document.getElementById('saveManutencao');
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
    
    // Send data to API
    Auth.fetchWithAuth(apiUrl, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.detail || 'Erro ao salvar manutenção');
                });
            }
            return response.json();
        })
        .then(data => {
            // Show success message
            showNotification(
                `Manutenção ${editingMaintenanceId ? 'atualizada' : 'cadastrada'} com sucesso!`, 
                'success'
            );
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('addManutencaoModal')).hide();
            
            // Reload data
            loadManutencoes();
        })
        .catch(error => {
            console.error('Error saving maintenance:', error);
            showNotification(`Erro ao salvar manutenção: ${error.message}`, 'error');
        })
        .finally(() => {
            // Re-enable save button
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnText;
        });
}

/**
 * Updates pagination controls
 */
function updatePagination() {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;
    
    const totalPages = Math.ceil(totalItems / pageSize);
    
    if (totalPages <= 1) {
        paginationElement.innerHTML = '';
        return;
    }
    
    let html = `
    <li class="page-item${currentPage === 1 ? ' disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage - 1}" aria-label="Anterior">
            <span aria-hidden="true">&laquo;</span>
        </a>
    </li>
    `;
    
    // Determine page range
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
        <li class="page-item${i === currentPage ? ' active' : ''}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
        `;
    }
    
    html += `
    <li class="page-item${currentPage === totalPages ? ' disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage + 1}" aria-label="Próximo">
            <span aria-hidden="true">&raquo;</span>
        </a>
    </li>
    `;
    
    paginationElement.innerHTML = html;
    
    // Add click event listeners
    const pageLinks = paginationElement.querySelectorAll('.page-link');
    pageLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = parseInt(this.getAttribute('data-page'));
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                loadManutencoes();
                
                // Scroll to top of table
                document.querySelector('.card-header').scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Shows loading state
 */
function showLoading() {
    // Show loading in table
    const tbody = document.getElementById('manutencoes-list');
    if (tbody) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
                <div class="spinner-border spinner-border-sm text-success me-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                Carregando dados...
            </td>
        </tr>`;
    }
    
    // Disable filter buttons
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = true;
    });
}

/**
 * Hides loading state
 */
function hideLoading() {
    // Re-enable filter buttons
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = false;
    });
}

/**
 * Exports table to CSV
 */
function exportCSV() {
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const placa = document.getElementById('placa').value;
    const status = document.getElementById('status').value;
    
    // Build API URL with query params
    let apiUrl = `/api/manutencoes/export/?format=csv`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&status=${status}`;
    
    // Redirect to download URL
    window.location.href = apiUrl;
}

/**
 * Gets status HTML badge
 * @param {string} status - Status code
 * @returns {string} - HTML for status badge
 */
function getStatusHTML(status) {
    if (!status) return '<span class="badge bg-secondary">--</span>';
    
    const statusMap = {
        'PENDENTE': '<span class="badge bg-warning text-dark">Pendente</span>',
        'AGENDADO': '<span class="badge bg-info">Agendado</span>',
        'PAGO': '<span class="badge bg-success">Pago</span>',
        'CANCELADO': '<span class="badge bg-danger">Cancelado</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Format currency value
 * @param {number} value - Value to format
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Format date
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return '--';
        }
        
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    
    if (text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
    }
    
    return text;
}

/**
 * Show notification toast
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'success', duration = 5000) {
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