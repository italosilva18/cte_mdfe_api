/**
 * manutencao.js
 * Functions for the maintenance panel and forms
 */

// Global variables for pagination
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let manutencoesList = [];

// Current item being edited
let currentEditId = null;

/**
 * Initializes the maintenance panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 90 days)
    setDefaultDateRange();
    
    // Load initial data
    loadManutencoesData();
    
    // Load vehicles for dropdowns
    loadVeiculos();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update dashboard charts if on dashboard page
    if (document.getElementById('manutencao-chart-status')) {
        loadDashboardData();
    }
});

/**
 * Sets up all event listeners for the maintenance panel
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadManutencoesData()"]');
    if (filterBtn) {
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            currentPage = 1; // Reset to first page when applying filters
            loadManutencoesData();
        });
    }
    
    // Reset filters button
    const resetBtn = document.querySelector('button[onclick="resetFilters()"]');
    if (resetBtn) {
        resetBtn.removeAttribute('onclick');
        resetBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
    
    // New maintenance button
    const newBtn = document.getElementById('btnNewManutencao');
    if (newBtn) {
        newBtn.addEventListener('click', function() {
            showManutencaoForm();
        });
    }
    
    // Form submission
    const form = document.getElementById('manutencaoForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            salvarManutencao();
        });
    }
    
    // Calculation of total value when component values change
    const valorPeca = document.getElementById('valor_peca');
    const valorMaoObra = document.getElementById('valor_mao_obra');
    const valorTotal = document.getElementById('valor_total');
    
    if (valorPeca && valorMaoObra && valorTotal) {
        const calcTotal = () => {
            const peca = parseFloat(valorPeca.value) || 0;
            const maoObra = parseFloat(valorMaoObra.value) || 0;
            valorTotal.value = (peca + maoObra).toFixed(2);
        };
        
        valorPeca.addEventListener('input', calcTotal);
        valorMaoObra.addEventListener('input', calcTotal);
    }
    
    // Vehicle dropdown change (auto-update details)
    const veiculoSelect = document.getElementById('veiculo');
    if (veiculoSelect) {
        veiculoSelect.addEventListener('change', function() {
            const veiculoId = this.value;
            if (veiculoId) {
                updateVeiculoDetails(veiculoId);
            }
        });
    }
    
    // Modal close event (reset form)
    const manModal = document.getElementById('manutencaoModal');
    if (manModal) {
        manModal.addEventListener('hidden.bs.modal', function() {
            resetForm();
            currentEditId = null;
        });
    }
    
    // Export CSV button
    const exportBtn = document.getElementById('exportarCSV');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            exportarCSV();
        });
    }
}

/**
 * Sets default date range (last 90 days)
 */
function setDefaultDateRange() {
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    
    // Format dates for input fields (YYYY-MM-DD)
    document.getElementById('data_inicio')?.value = formatDateForInput(ninetyDaysAgo);
    document.getElementById('data_fim')?.value = formatDateForInput(today);
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
 * Resets filters and loads data
 */
function resetFilters() {
    // Reset form
    document.getElementById('filterForm')?.reset();
    
    // Set default date range
    setDefaultDateRange();
    
    // Reset to first page
    currentPage = 1;
    
    // Load data with reset filters
    loadManutencoesData();
}

/**
 * Loads maintenance data from the API
 */
function loadManutencoesData() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    // Build API URL with query params
    let apiUrl = `/api/manutencao/?page=${currentPage}&page_size=${pageSize}`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&status=${status}`;
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;
    
    // Fetch data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar lista de manutenções');
            }
            return response.json();
        })
        .then(data => {
            // Update pagination variables
            if (Array.isArray(data)) {
                // Handle case when API returns array directly
                manutencoesList = data;
                totalItems = data.length;
            } else {
                // Handle paginated response
                manutencoesList = data.results || [];
                totalItems = data.count || 0;
            }
            
            // Render table with results
            renderManutencoesTable();
            
            // Update pagination controls
            updatePagination();
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading maintenance data:', error);
            showNotification('Não foi possível carregar os dados das manutenções. Tente novamente.', 'error');
            
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
 * Loads dashboard data from the API
 */
function loadDashboardData() {
    // Get dashboard chart containers
    const statusChart = document.getElementById('manutencao-chart-status');
    const veiculoChart = document.getElementById('manutencao-chart-veiculo');
    const periodoChart = document.getElementById('manutencao-chart-periodo');
    
    if (!statusChart && !veiculoChart && !periodoChart) return;
    
    // Show loading states
    if (statusChart) statusChart.innerHTML = '<div class="d-flex justify-content-center p-5"><div class="spinner-border text-primary"></div></div>';
    if (veiculoChart) veiculoChart.innerHTML = '<div class="d-flex justify-content-center p-5"><div class="spinner-border text-primary"></div></div>';
    if (periodoChart) periodoChart.innerHTML = '<div class="d-flex justify-content-center p-5"><div class="spinner-border text-primary"></div></div>';
    
    // Fetch dashboard data
    Auth.fetchWithAuth('/api/manutencao/graficos/')
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados do dashboard');
            }
            return response.json();
        })
        .then(data => {
            // Render dashboard charts
            if (statusChart) renderStatusChart(statusChart, data.por_status || []);
            if (veiculoChart) renderVeiculoChart(veiculoChart, data.por_veiculo || []);
            if (periodoChart) renderPeriodoChart(periodoChart, data.por_periodo || []);
            
            // Update indicator cards
            updateIndicadorCards(data);
        })
        .catch(error => {
            console.error('Error loading dashboard data:', error);
            showNotification('Não foi possível carregar os dados do dashboard. Tente novamente.', 'error');
            
            // Clear charts with error message
            const errorHTML = `
            <div class="alert alert-danger m-3">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar dados do dashboard.
            </div>`;
            
            if (statusChart) statusChart.innerHTML = errorHTML;
            if (veiculoChart) veiculoChart.innerHTML = errorHTML;
            if (periodoChart) periodoChart.innerHTML = errorHTML;
        });
}

/**
 * Updates indicator cards with dashboard data
 * @param {Object} data - Dashboard data
 */
function updateIndicadorCards(data) {
    // Update total maintenance count
    const totalCard = document.getElementById('total-manutencoes');
    if (totalCard) {
        totalCard.textContent = formatNumber(data.total_manutencoes || 0);
    }
    
    // Update parts cost
    const pecasCard = document.getElementById('total-pecas');
    if (pecasCard) {
        pecasCard.textContent = formatCurrency(data.total_pecas || 0);
    }
    
    // Update labor cost
    const maoObraCard = document.getElementById('total-mao-obra');
    if (maoObraCard) {
        maoObraCard.textContent = formatCurrency(data.total_mao_obra || 0);
    }
    
    // Update total cost
    const totalValorCard = document.getElementById('total-valor');
    if (totalValorCard) {
        totalValorCard.textContent = formatCurrency(data.valor_total || 0);
    }
}

/**
 * Renders the status distribution chart
 * @param {Element} container - Chart container element
 * @param {Array} data - Status data
 */
function renderStatusChart(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Process chart data
    const labels = [];
    const values = [];
    const colors = [];
    
    // Map status to colors
    const statusColors = {
        'PENDENTE': '#FFC107',
        'AGENDADO': '#17A2B8',
        'CONCLUIDO': '#28A745',
        'PAGO': '#28A745',
        'CANCELADO': '#DC3545'
    };
    
    data.forEach(item => {
        labels.push(item.status || 'Desconhecido');
        values.push(item.total || 0);
        colors.push(statusColors[item.status] || '#6C757D');
    });
    
    // Prepare canvas element
    container.innerHTML = '<canvas></canvas>';
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    
    // Create chart
    new Chart(ctx, {
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
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${context.label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders the maintenance by vehicle chart
 * @param {Element} container - Chart container element
 * @param {Array} data - Vehicle data
 */
function renderVeiculoChart(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Process chart data (limit to top 8 for better visualization)
    const displayData = data.slice(0, 8);
    
    const labels = displayData.map(item => item.veiculo__placa || 'Desconhecido');
    const values = displayData.map(item => parseFloat(item.valor) || 0);
    
    // Prepare canvas element
    container.innerHTML = '<canvas></canvas>';
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    
    // Create chart
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Total (R$)',
                data: values,
                backgroundColor: '#4285F4',
                borderColor: '#3367D6',
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
                            return `${formatCurrency(context.raw)}`;
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
 * Renders the maintenance by period chart
 * @param {Element} container - Chart container element
 * @param {Array} data - Period data
 */
function renderPeriodoChart(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = `
        <div class="alert alert-info m-3">
            <i class="fas fa-info-circle me-2"></i>
            Nenhum dado disponível para o período selecionado.
        </div>`;
        return;
    }
    
    // Sort data by date
    data.sort((a, b) => new Date(a.mes) - new Date(b.mes));
    
    // Process chart data
    const labels = data.map(item => {
        const date = new Date(item.mes);
        return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    });
    
    const values = data.map(item => parseFloat(item.valor) || 0);
    const counts = data.map(item => parseInt(item.total) || 0);
    
    // Prepare canvas element
    container.innerHTML = '<canvas></canvas>';
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    
    // Create chart
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valor Total (R$)',
                    data: values,
                    backgroundColor: 'rgba(66, 133, 244, 0.2)',
                    borderColor: '#4285F4',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Quantidade',
                    data: counts,
                    backgroundColor: 'rgba(234, 67, 53, 0.2)',
                    borderColor: '#EA4335',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === 'Valor Total (R$)') {
                                return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                            }
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Valor (R$)'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                },
                y1: {
                    beginAtZero: true,
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Quantidade'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

/**
 * Loads vehicles for dropdowns
 */
function loadVeiculos() {
    const veiculoSelect = document.getElementById('veiculo');
    const filtroPlaca = document.getElementById('placa');
    
    if (!veiculoSelect && !filtroPlaca) return;
    
    Auth.fetchWithAuth('/api/veiculos/')
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar lista de veículos');
            }
            return response.json();
        })
        .then(data => {
            const veiculos = data.results || data;
            
            // Populate form select
            if (veiculoSelect) {
                // Clear existing options (except the first empty option)
                while (veiculoSelect.options.length > 1) {
                    veiculoSelect.remove(1);
                }
                
                // Add options for each vehicle
                veiculos.forEach(veiculo => {
                    if (!veiculo.ativo) return; // Skip inactive vehicles
                    
                    const option = document.createElement('option');
                    option.value = veiculo.id;
                    option.textContent = `${veiculo.placa} - ${veiculo.proprietario_nome || 'Próprio'}`;
                    veiculoSelect.appendChild(option);
                });
            }
            
            // Populate filter select
            if (filtroPlaca) {
                // Clear existing options (except the first empty option)
                while (filtroPlaca.options.length > 1) {
                    filtroPlaca.remove(1);
                }
                
                // Add options for each vehicle
                veiculos.forEach(veiculo => {
                    const option = document.createElement('option');
                    option.value = veiculo.placa;
                    option.textContent = veiculo.placa;
                    filtroPlaca.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading vehicles:', error);
            showNotification('Não foi possível carregar a lista de veículos.', 'error');
        });
}

/**
 * Updates vehicle details when a vehicle is selected
 * @param {string} veiculoId - Vehicle ID
 */
function updateVeiculoDetails(veiculoId) {
    Auth.fetchWithAuth(`/api/veiculos/${veiculoId}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes do veículo');
            }
            return response.json();
        })
        .then(veiculo => {
            // Update form fields
            const veiculoInfo = document.getElementById('veiculo_info');
            if (veiculoInfo) {
                veiculoInfo.innerHTML = `
                <div class="alert alert-info">
                    <strong>Placa:</strong> ${veiculo.placa} | 
                    <strong>Proprietário:</strong> ${veiculo.proprietario_nome || 'Próprio'} | 
                    <strong>RENAVAM:</strong> ${veiculo.renavam || 'N/A'}
                </div>`;
            }
        })
        .catch(error => {
            console.error('Error loading vehicle details:', error);
            showNotification('Não foi possível carregar os detalhes do veículo.', 'warning');
        });
}

/**
 * Shows loading state
 */
function showLoading() {
    // Display loading message in table
    const tbody = document.getElementById('manutencoes-list');
    if (tbody) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <div class="mt-2">Carregando dados...</div>
            </td>
        </tr>`;
    }
    
    // Disable filter buttons during loading
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
 * Renders the maintenance table with current data
 */
function renderManutencoesTable() {
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
        const dataServico = formatDate(manutencao.data_servico);
        const valorTotal = formatCurrency(manutencao.valor_total);
        const statusHTML = getStatusHTML(manutencao.status);
        
        html += `
        <tr>
            <td>${manutencao.veiculo_placa || '--'}</td>
            <td>${truncateText(manutencao.servico_realizado, 30) || '--'}</td>
            <td>${dataServico}</td>
            <td>${manutencao.quilometragem || '--'}</td>
            <td>${truncateText(manutencao.oficina, 20) || '--'}</td>
            <td>${valorTotal}</td>
            <td>${statusHTML}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary" onclick="editarManutencao('${manutencao.id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-outline-info" onclick="visualizarManutencao('${manutencao.id}')" title="Visualizar">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="excluirManutencao('${manutencao.id}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
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
                loadManutencoesData();
                
                // Scroll to top of table
                document.querySelector('.table-responsive').scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Shows the maintenance form modal for new record
 */
function showManutencaoForm() {
    // Reset form for new record
    resetForm();
    currentEditId = null;
    
    // Update modal title
    document.getElementById('manutencaoModalLabel').textContent = 'Nova Manutenção';
    
    // Set current date as default
    const today = new Date();
    document.getElementById('data_servico').value = formatDateForInput(today);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('manutencaoModal'));
    modal.show();
}

/**
 * Edits an existing maintenance record
 * @param {string} id - Maintenance ID
 */
function editarManutencao(id) {
    // Set current edit ID
    currentEditId = id;
    
    // Update modal title
    document.getElementById('manutencaoModalLabel').textContent = 'Editar Manutenção';
    
    // Show loading state in form
    const form = document.getElementById('manutencaoForm');
    form.classList.add('loading');
    
    // Show modal while loading
    const modal = new bootstrap.Modal(document.getElementById('manutencaoModal'));
    modal.show();
    
    // Fetch maintenance details
    Auth.fetchWithAuth(`/api/manutencao/${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes da manutenção');
            }
            return response.json();
        })
        .then(manutencao => {
            // Fill form with maintenance data
            document.getElementById('veiculo').value = manutencao.veiculo;
            document.getElementById('servico_realizado').value = manutencao.servico_realizado || '';
            document.getElementById('data_servico').value = formatDateForInput(new Date(manutencao.data_servico));
            document.getElementById('quilometragem').value = manutencao.quilometragem || '';
            document.getElementById('oficina').value = manutencao.oficina || '';
            document.getElementById('peca_utilizada').value = manutencao.peca_utilizada || '';
            document.getElementById('valor_peca').value = manutencao.valor_peca || 0;
            document.getElementById('valor_mao_obra').value = manutencao.valor_mao_obra || 0;
            document.getElementById('valor_total').value = manutencao.valor_total || 0;
            document.getElementById('status').value = manutencao.status || 'PENDENTE';
            document.getElementById('observacoes').value = manutencao.observacoes || '';
            document.getElementById('nota_fiscal').value = manutencao.nota_fiscal || '';
            
            // Update vehicle details if available
            if (manutencao.veiculo) {
                updateVeiculoDetails(manutencao.veiculo);
            }
            
            // Remove loading state
            form.classList.remove('loading');
        })
        .catch(error => {
            console.error('Error loading maintenance details:', error);
            showNotification('Não foi possível carregar os detalhes da manutenção.', 'error');
            
            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('manutencaoModal')).hide();
        });
}

/**
 * Displays a read-only view of a maintenance record
 * @param {string} id - Maintenance ID
 */
function visualizarManutencao(id) {
    // Fetch maintenance details
    Auth.fetchWithAuth(`/api/manutencao/${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes da manutenção');
            }
            return response.json();
        })
        .then(manutencao => {
            // Fill detail modal
            const modalTitle = document.getElementById('detailModalLabel');
            const modalBody = document.getElementById('detailModalBody');
            
            modalTitle.textContent = `Manutenção de ${manutencao.veiculo_placa || 'Veículo'}`;
            
            const dataServico = formatDate(manutencao.data_servico);
            const valorPeca = formatCurrency(manutencao.valor_peca || 0);
            const valorMaoObra = formatCurrency(manutencao.valor_mao_obra || 0);
            const valorTotal = formatCurrency(manutencao.valor_total || 0);
            const statusHTML = getStatusHTML(manutencao.status);
            
            modalBody.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Veículo:</strong> ${manutencao.veiculo_placa || '--'}</p>
                    <p><strong>Serviço Realizado:</strong> ${manutencao.servico_realizado || '--'}</p>
                    <p><strong>Data do Serviço:</strong> ${dataServico}</p>
                    <p><strong>Quilometragem:</strong> ${manutencao.quilometragem || '--'} km</p>
                    <p><strong>Oficina:</strong> ${manutencao.oficina || '--'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Peça Utilizada:</strong> ${manutencao.peca_utilizada || '--'}</p>
                    <p><strong>Valor da Peça:</strong> ${valorPeca}</p>
                    <p><strong>Valor da Mão de Obra:</strong> ${valorMaoObra}</p>
                    <p><strong>Valor Total:</strong> ${valorTotal}</p>
                    <p><strong>Status:</strong> ${statusHTML}</p>
                </div>
            </div>
            
            <div class="row mt-3">
                <div class="col-12">
                    <p><strong>Observações:</strong></p>
                    <div class="border p-2 rounded bg-light">
                        ${manutencao.observacoes || 'Nenhuma observação'}
                    </div>
                </div>
            </div>
            
            <div class="row mt-3">
                <div class="col-12">
                    <p><strong>Nota Fiscal:</strong> ${manutencao.nota_fiscal || 'Não informada'}</p>
                </div>
            </div>
            `;
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('detailModal'));
            modal.show();
        })
        .catch(error => {
            console.error('Error loading maintenance details:', error);
            showNotification('Não foi possível carregar os detalhes da manutenção.', 'error');
        });
}

/**
 * Saves maintenance data (create or update)
 */
function salvarManutencao() {
    // Get form data
    const form = document.getElementById('manutencaoForm');
    
    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Disable save button
    const saveBtn = document.getElementById('salvarBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
    
    // Collect form data
    const formData = {
        veiculo: document.getElementById('veiculo').value,
        servico_realizado: document.getElementById('servico_realizado').value,
        data_servico: document.getElementById('data_servico').value,
        quilometragem: document.getElementById('quilometragem').value,
        oficina: document.getElementById('oficina').value,
        peca_utilizada: document.getElementById('peca_utilizada').value,
        valor_peca: parseFloat(document.getElementById('valor_peca').value) || 0,
        valor_mao_obra: parseFloat(document.getElementById('valor_mao_obra').value) || 0,
        status: document.getElementById('status').value,
        observacoes: document.getElementById('observacoes').value,
        nota_fiscal: document.getElementById('nota_fiscal').value
    };
    
    // Determine if it's a create or update
    const isUpdate = !!currentEditId;
    const method = isUpdate ? 'PUT' : 'POST';
    const url = isUpdate ? `/api/manutencao/${currentEditId}/` : '/api/manutencao/';
    
    // Send request
    Auth.fetchWithAuth(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n'));
                });
            }
            return response.json();
        })
        .then(data => {
            // Show success notification
            showNotification(`Manutenção ${isUpdate ? 'atualizada' : 'cadastrada'} com sucesso!`, 'success');
            
            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('manutencaoModal')).hide();
            
            // Reload data
            loadManutencoesData();
            
            // Reload dashboard data if on dashboard page
            if (document.getElementById('manutencao-chart-status')) {
                loadDashboardData();
            }
        })
        .catch(error => {
            console.error('Error saving maintenance:', error);
            showNotification(`Erro ao salvar manutenção: ${error.message}`, 'error');
        })
        .finally(() => {
            // Re-enable save button
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar';
        });
}

/**
 * Deletes a maintenance record
 * @param {string} id - Maintenance ID
 */
function excluirManutencao(id) {
    // Show confirmation dialog
    if (!confirm('Tem certeza que deseja excluir esta manutenção?')) {
        return;
    }
    
    // Send delete request
    Auth.fetchWithAuth(`/api/manutencao/${id}/`, {
        method: 'DELETE'
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao excluir manutenção');
            }
            
            // Show success notification
            showNotification('Manutenção excluída com sucesso!', 'success');
            
            // Reload data
            loadManutencoesData();
            
            // Reload dashboard data if on dashboard page
            if (document.getElementById('manutencao-chart-status')) {
                loadDashboardData();
            }
        })
        .catch(error => {
            console.error('Error deleting maintenance:', error);
            showNotification(`Erro ao excluir manutenção: ${error.message}`, 'error');
        });
}

/**
 * Exports maintenance table to CSV
 */
function exportarCSV() {
    // Get filter values
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;
    const placa = document.getElementById('placa')?.value;
    const status = document.getElementById('status')?.value;
    const searchText = document.getElementById('search_text')?.value;
    
    // Build API URL with query params
    let apiUrl = `/api/manutencao/export/?format=csv`;
    
    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa=${placa}`;
    if (status) apiUrl += `&status=${status}`;
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;
    
    // Trigger download
    window.location.href = apiUrl;
}

/**
 * Resets the form
 */
function resetForm() {
    const form = document.getElementById('manutencaoForm');
    if (!form) return;
    
    form.reset();
    
    // Clear vehicle info
    const veiculoInfo = document.getElementById('veiculo_info');
    if (veiculoInfo) {
        veiculoInfo.innerHTML = '';
    }
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
        'CONCLUIDO': '<span class="badge bg-success">Concluído</span>',
        'PAGO': '<span class="badge bg-success">Pago</span>',
        'CANCELADO': '<span class="badge bg-danger">Cancelado</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Formats currency value
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
 * Formats number with thousands separator
 * @param {number} value - Value to format
 * @returns {string} - Formatted number
 */
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
}

/**
 * Format date
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return '--';
    
    try {
        return new Date(date).toLocaleDateString('pt-BR');
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