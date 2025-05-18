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
// Map of plates to vehicle IDs for form submission
let veiculoIdMap = {};

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
    if (document.getElementById('statusChart')) {
        loadDashboardData();
    }
});

/**
 * Sets up all event listeners for the maintenance panel
 */
function setupEventListeners() {
    // Filter button event listener
    const filterBtn = document.querySelector('#filterForm button[type="button"]:first-of-type');
    if (filterBtn) {
        filterBtn.addEventListener('click', function() {
            currentPage = 1; // Reset to first page when applying filters
            loadManutencoesData();
        });
    }
    
    // Reset filters button
    const resetBtn = document.querySelector('#filterForm button[title="Reset filters"]');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
    
    // New maintenance button - updated selector
    const newBtn = document.querySelector('[data-bs-target="#addManutencaoModal"]');
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
    
    // Save button click event
    const saveBtn = document.getElementById('saveManutencao');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            salvarManutencao();
        });
    }
    
    // Calculation of total value when component values change
    const valorPeca = document.getElementById('valor_peca');
    const valorMaoObra = document.getElementById('valor_mao_obra');
    
    if (valorPeca && valorMaoObra) {
        const calcTotal = () => {
            const peca = parseFloat(valorPeca.value) || 0;
            const maoObra = parseFloat(valorMaoObra.value) || 0;
            // Automatically update total (showing in a readonly field would be better)
            console.log('Total calculado:', peca + maoObra);
        };
        
        valorPeca.addEventListener('input', calcTotal);
        valorMaoObra.addEventListener('input', calcTotal);
    }
    
    // Vehicle dropdown change (auto-update details)
    const veiculoSelect = document.getElementById('veiculo');
    if (veiculoSelect) {
        veiculoSelect.addEventListener('change', function() {
            const veiculoId = this.value;
            if (veiculoId && !isNaN(veiculoId)) {
                updateVeiculoDetails(veiculoId);
            } else if (veiculoId) {
                // It's probably a plate, show basic info
                showPlateInfo(veiculoId);
            }
        });
    }
    
    // Modal close event (reset form)
    const manModal = document.getElementById('addManutencaoModal');
    if (manModal) {
        manModal.addEventListener('hidden.bs.modal', function() {
            resetForm();
            currentEditId = null;
        });
    }
    
    // Export CSV button
    const exportBtn = document.querySelector('.btn-sm.btn-light');
    if (exportBtn && exportBtn.textContent.includes('Exportar CSV')) {
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
    const dataInicioInput = document.getElementById('data_inicio');
    const dataFimInput = document.getElementById('data_fim');
    
    if (dataInicioInput) {
        dataInicioInput.value = formatDateForInput(ninetyDaysAgo);
    }
    if (dataFimInput) {
        dataFimInput.value = formatDateForInput(today);
    }
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
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.reset();
    }
    
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
    let apiUrl = `/api/manutencoes/?page=${currentPage}&page_size=${pageSize}`;

    if (dataInicio) apiUrl += `&data_inicio=${dataInicio}`;
    if (dataFim) apiUrl += `&data_fim=${dataFim}`;
    if (placa) apiUrl += `&placa=${encodeURIComponent(placa)}`;
    if (status) apiUrl += `&status=${status}`;
    if (searchText) apiUrl += `&q=${encodeURIComponent(searchText)}`;

    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar lista de manutenções');
            }
            return response.json();
        })
        .then(data => {
            manutencoesList = data.results || [];
            totalItems = data.count || manutencoesList.length;

            renderManutencoesTable();
            updatePagination();
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading maintenance data:', error);
            showNotification('Não foi possível carregar os dados das manutenções. Tente novamente.', 'error');

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

            hideLoading();
        });
}

/**
 * Loads dashboard data from the API
 */
function loadDashboardData() {
    // Get filter values
    const dataInicio = document.getElementById('data_inicio')?.value;
    const dataFim = document.getElementById('data_fim')?.value;

    // Build query params
    const params = [];
    if (dataInicio) params.push(`data_inicio=${dataInicio}`);
    if (dataFim) params.push(`data_fim=${dataFim}`);
    const queryString = params.length > 0 ? '?' + params.join('&') : '';

    // Prepare API URLs
    const apiGraficos = `/api/manutencao/painel/graficos/${queryString}`;
    const apiIndicadores = `/api/manutencao/painel/indicadores/${queryString}`;

    // Fetch both endpoints concurrently
    Promise.all([
        Auth.fetchWithAuth(apiGraficos).then(r => {
            if (!r.ok) throw new Error('Falha ao carregar gráficos');
            return r.json();
        }),
        Auth.fetchWithAuth(apiIndicadores).then(r => {
            if (!r.ok) throw new Error('Falha ao carregar indicadores');
            return r.json();
        })
    ])
        .then(([graficosData, indicadoresData]) => {
            // Render dashboard charts
            const statusChart = document.getElementById('statusChart');
            const veiculoChart = document.getElementById('veiculoChart');

            if (statusChart) {
                renderStatusChart(statusChart, graficosData.por_status || []);
            }
            if (veiculoChart) {
                renderVeiculoChart(veiculoChart, graficosData.por_veiculo || []);
            }

            // Update indicator cards with indicadores endpoint
            updateIndicadorCards(indicadoresData);
        })
        .catch(error => {
            console.error('Error loading dashboard data:', error);
            showNotification('Não foi possível carregar os dados do dashboard. Tente novamente.', 'error');
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
    const pecasCard = document.getElementById('custo-pecas');
    if (pecasCard) {
        pecasCard.textContent = formatCurrency(data.total_pecas || 0);
    }
    
    // Update labor cost
    const maoObraCard = document.getElementById('custo-mao-obra');
    if (maoObraCard) {
        maoObraCard.textContent = formatCurrency(data.total_mao_obra || 0);
    }
    
    // Update total cost
    const totalValorCard = document.getElementById('custo-total');
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
    
    // Prepare canvas element
    container.innerHTML = '<canvas></canvas>';
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    
    // Process chart data
    const labels = [];
    const values = [];
    const colors = [];
    
    // Map status to colors
    const statusColors = {
        'PENDENTE': '#FFC107',
        'AGENDADO': '#17A2B8',
        'PAGO': '#28A745',
        'CANCELADO': '#DC3545'
    };
    
    data.forEach(item => {
        labels.push(item.status || 'Desconhecido');
        values.push(item.total || 0);
        colors.push(statusColors[item.status] || '#6C757D');
    });
    
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
 * Loads vehicles for dropdowns
 */
function loadVeiculos() {
    const veiculoSelect = document.getElementById('veiculo');
    const filtroPlaca = document.getElementById('placa');

    if (!veiculoSelect && !filtroPlaca) return;

    // Reset mapping
    veiculoIdMap = {};
    
    // Clear existing options first (keep the first empty option)
    if (veiculoSelect) {
        while (veiculoSelect.options.length > 1) {
            veiculoSelect.remove(1);
        }
    }
    if (filtroPlaca) {
        while (filtroPlaca.options.length > 1) {
            filtroPlaca.remove(1);
        }
    }
    
    console.log('Iniciando carregamento de placas...');
    showNotification('Carregando placas dos veículos...', 'info', 2000);
    
    // Primeira tentativa: API de veículos com paginação
    console.log('Tentando carregar veículos da API /api/veiculos/...');

    async function fetchAllVeiculos() {
        const allVeiculos = [];
        let url = '/api/veiculos/';
        let page = 1;

        while (url) {
            const requestUrl = page === 1 ? url : `/api/veiculos/?page=${page}`;
            const response = await Auth.fetchWithAuth(requestUrl);
            console.log('Veículos - Response status:', response.status);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Dados recebidos da API veículos:', data);
            const veiculos = data.results || data;
            if (Array.isArray(veiculos)) {
                allVeiculos.push(...veiculos);
            }

            url = data.next;
            page += 1;
        }

        return allVeiculos;
    }

    fetchAllVeiculos()
        .then(veiculos => {
            if (Array.isArray(veiculos) && veiculos.length > 0) {
                // Update form select
                if (veiculoSelect) {
                    veiculos.forEach(veiculo => {
                        if (!veiculo.ativo && veiculo.ativo !== undefined) return; // Skip inactive vehicles

                        const option = document.createElement('option');
                        option.value = veiculo.id;
                        option.textContent = `${veiculo.placa} - ${veiculo.proprietario_nome || 'Próprio'}`;
                        veiculoSelect.appendChild(option);

                        // store mapping id<->placa
                        veiculoIdMap[veiculo.placa] = veiculo.id;
                    });
                }

                // Update filter select with plates
                if (filtroPlaca) {
                    veiculos.forEach(veiculo => {
                        if (veiculo.placa) {
                            const option = document.createElement('option');
                            option.value = veiculo.placa;
                            option.textContent = veiculo.placa;
                            filtroPlaca.appendChild(option);

                            // store mapping for quick lookup
                            veiculoIdMap[veiculo.placa] = veiculo.id;
                        }
                    });
                }

                console.log(`${veiculos.length} veículos carregados com sucesso`);
                showNotification(`${veiculos.length} veículos carregados com sucesso`, 'success', 2000);
                return; // Early return to avoid fallback
            }

            // Sem veículos - tenta carregar placas dos MDF-es
            showNotification(
                'Nenhum veículo cadastrado. Cadastre um veículo antes de registrar manutenções.',
                'warning',
                4000
            );

            return loadPlacasFromMDFe()
                .then(plates => {
                    console.log('Placas carregadas dos MDF-es:', plates.length);
                })
                .catch(error => {
                    console.error('Erro nos MDF-es, tentando CT-es:', error);
                    loadPlacasFromCTe();
                });
        })
        .catch(error => {
            console.error('Erro ao carregar veículos da API:', error);
            console.log('Tentando carregar placas de MDF-es como fallback...');
            showNotification(
                'Nenhum veículo cadastrado ou API indisponível. Placas dos MDF-es serão carregadas apenas para referência.',
                'warning',
                4000
            );

            // Fallback para MDF-es em caso de erro
            loadPlacasFromMDFe()
                .then(plates => {
                    console.log('Placas carregadas dos MDF-es:', plates.length);
                })
                .catch(error => {
                    console.error('Erro nos MDF-es, tentando CT-es:', error);
                    loadPlacasFromCTe();
                });
        });
}

/**
 * Load vehicle plates from MDFe documents as fallback (IMPROVED VERSION)
 */
function loadPlacasFromMDFe() {
    return new Promise((resolve, reject) => {
        const veiculoSelect = document.getElementById('veiculo');
        const filtroPlaca = document.getElementById('placa');
        
        console.log('Carregando placas dos MDF-es...');
        
        // Função para carregar todas as páginas de MDF-es
        async function carregarTodasAsPlacas() {
            const platesSet = new Set();
            let page = 1;
            let totalLoaded = 0;
            let hasMore = true;
            const pageSize = 100;
            let totalPages = null;
            const maxPages = 50;

            while (hasMore) {
                try {
                    console.log(`Carregando página ${page} dos MDF-es...`);
                    showNotification(`Processando página ${page} dos MDF-es...`, 'info', 1000);

                    const response = await Auth.fetchWithAuth(`/api/mdfes/?page=${page}&page_size=${pageSize}`);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    console.log(`Página ${page} - Count: ${data.count}, Results: ${data.results ? data.results.length : 0}`);

                    if (totalPages === null && data.count) {
                        totalPages = Math.ceil(data.count / pageSize);
                    }
                    
                    const mdfes = data.results || data;
                    
                    if (Array.isArray(mdfes)) {
                        mdfes.forEach(mdfe => {
                            if (mdfe.placa_tracao) {
                                platesSet.add(mdfe.placa_tracao);
                                totalLoaded++;
                            }
                        });
                    }
                    
                    // Verifica se há próxima página
                    hasMore = data.next !== null && data.next !== undefined;
                    page++;

                    // Limite de segurança para evitar chamadas infinitas
                    if ((totalPages !== null && page > totalPages) || page > maxPages) {
                        hasMore = false;
                    }
                    
                    // Se não há mais dados, pare
                    if (!mdfes || mdfes.length === 0) {
                        hasMore = false;
                    }
                } catch (error) {
                    console.error(`Erro na página ${page}:`, error);
                    hasMore = false;
                }
            }
            
            return {
                plates: Array.from(platesSet).sort(),
                totalProcessed: totalLoaded,
                pagesLoaded: page - 1
            };
        }
        
        // Executar o carregamento
        carregarTodasAsPlacas()
            .then(result => {
                const { plates, totalProcessed, pagesLoaded } = result;
                console.log(`Placas extraídas dos MDF-es: ${plates.length} únicas de ${totalProcessed} registros em ${pagesLoaded} páginas`);
                
                // Update vehicle select with plates
                if (veiculoSelect && plates.length > 0) {
                    plates.forEach(placa => {
                        const option = document.createElement('option');
                        option.value = placa;
                        option.textContent = `${placa} - (Via MDF-e)`;
                        veiculoSelect.appendChild(option);

                        // store mapping with undefined ID so salvarManutencao can handle
                        if (!(placa in veiculoIdMap)) {
                            veiculoIdMap[placa] = null;
                        }
                    });
                }
                
                // Update filter select with plates
                if (filtroPlaca && plates.length > 0) {
                    plates.forEach(placa => {
                        const option = document.createElement('option');
                        option.value = placa;
                        option.textContent = placa;
                        filtroPlaca.appendChild(option);

                        if (!(placa in veiculoIdMap)) {
                            veiculoIdMap[placa] = null;
                        }
                    });
                }
                
                if (plates.length > 0) {
                    showNotification(
                        `${plates.length} placas carregadas dos MDF-es para referência (${totalProcessed} registros processados)`,
                        'success',
                        4000
                    );
                    resolve(plates);
                } else {
                    showNotification('Nenhuma placa encontrada nos MDF-es', 'warning', 3000);
                    reject(new Error('Nenhuma placa encontrada'));
                }
            })
            .catch(error => {
                console.error('Erro ao carregar placas dos MDF-es:', error);
                showNotification('Erro ao carregar placas dos MDF-es', 'error');
                reject(error);
            });
    });
}

/**
 * Alternative method to load vehicles - try CT-e documents
 */
function loadPlacasFromCTe() {
    const veiculoSelect = document.getElementById('veiculo');
    const filtroPlaca = document.getElementById('placa');
    
    console.log('Tentando carregar placas dos CT-es...');
    showNotification('Tentando carregar placas dos CT-es para referência...', 'info', 2000);
    
    // Função para carregar várias páginas de CT-es
    async function carregarPlacasCTe() {
        const platesSet = new Set();
        let page = 1;
        let hasMore = true;
        let totalProcessed = 0;
        const pageSize = 100;
        let totalPages = null;
        const maxPages = 50;

        while (hasMore) {
            try {
                console.log(`Carregando página ${page} dos CT-es...`);
                const response = await Auth.fetchWithAuth(`/api/ctes/?page=${page}&page_size=${pageSize}`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                const ctes = data.results || data;

                if (totalPages === null && data.count) {
                    totalPages = Math.ceil(data.count / pageSize);
                }
                
                if (Array.isArray(ctes)) {
                    ctes.forEach(cte => {
                        totalProcessed++;
                        // Try different possible field names for plates in CT-e
                        if (cte.placa) platesSet.add(cte.placa);
                        if (cte.veiculo_placa) platesSet.add(cte.veiculo_placa);
                        // Check in modal_rodoviario if available
                        if (cte.modal_rodoviario && cte.modal_rodoviario.veiculos) {
                            cte.modal_rodoviario.veiculos.forEach(veiculo => {
                                if (veiculo.placa) platesSet.add(veiculo.placa);
                            });
                        }
                    });
                }
                
                hasMore = data.next !== null;
                page++;

                if ((totalPages !== null && page > totalPages) || page > maxPages) {
                    hasMore = false;
                }
            } catch (error) {
                console.error(`Erro na página ${page} dos CT-es:`, error);
                hasMore = false;
            }
        }
        
        return {
            plates: Array.from(platesSet).sort(),
            totalProcessed: totalProcessed
        };
    }
    
    carregarPlacasCTe()
        .then(result => {
            const { plates, totalProcessed } = result;
            console.log('Placas extraídas dos CT-es:', plates);
            
            if (plates.length > 0) {
                // Update vehicle select
            if (veiculoSelect) {
                plates.forEach(placa => {
                    const option = document.createElement('option');
                    option.value = placa;
                    option.textContent = `${placa} - (Via CT-e)`;
                    veiculoSelect.appendChild(option);

                    if (!(placa in veiculoIdMap)) {
                        veiculoIdMap[placa] = null;
                    }
                });
            }
                
                // Update filter select
            if (filtroPlaca) {
                plates.forEach(placa => {
                    const option = document.createElement('option');
                    option.value = placa;
                    option.textContent = placa;
                    filtroPlaca.appendChild(option);

                    if (!(placa in veiculoIdMap)) {
                        veiculoIdMap[placa] = null;
                    }
                });
            }
                
                showNotification(
                    `${plates.length} placas carregadas dos CT-es para referência (${totalProcessed} registros processados)`,
                    'success',
                    4000
                );
            } else {
                showNotification('Nenhuma placa encontrada em nenhuma fonte. Verifique se há dados cadastrados.', 'warning');
            }
        })
        .catch(error => {
            console.error('Erro ao carregar placas dos CT-es:', error);
            showNotification('Não foi possível carregar placas de nenhuma fonte disponível.', 'error');
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
            // Display vehicle info (create an info div if it doesn't exist)
            let veiculoInfo = document.getElementById('veiculo_info');
            if (!veiculoInfo) {
                // Create info div after the vehicle select
                veiculoInfo = document.createElement('div');
                veiculoInfo.id = 'veiculo_info';
                veiculoInfo.className = 'mt-2';
                document.getElementById('veiculo').parentNode.appendChild(veiculoInfo);
            }
            
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
 * Shows basic info for a plate (when using fallback data)
 * @param {string} placa - Vehicle plate
 */
function showPlateInfo(placa) {
    let veiculoInfo = document.getElementById('veiculo_info');
    if (!veiculoInfo) {
        // Create info div after the vehicle select
        veiculoInfo = document.createElement('div');
        veiculoInfo.id = 'veiculo_info';
        veiculoInfo.className = 'mt-2';
        document.getElementById('veiculo').parentNode.appendChild(veiculoInfo);
    }
    
    if (veiculoInfo) {
        veiculoInfo.innerHTML = `
        <div class="alert alert-warning">
            <strong>Placa:</strong> ${placa} | 
            <small>Dados obtidos de documentos MDF-e/CT-e. Informações do proprietário não disponíveis.</small>
        </div>`;
    }
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
            <td>${dataServico}</td>
            <td>${truncateText(manutencao.servico_realizado, 30) || '--'}</td>
            <td>${truncateText(manutencao.oficina, 20) || '--'}</td>
            <td>${manutencao.quilometragem || '--'}</td>
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
    const modalTitle = document.getElementById('addManutencaoModalLabel');
    if (modalTitle) {
        modalTitle.textContent = 'Nova Manutenção';
    }
    
    // Set current date as default
    const today = new Date();
    const dataServicoInput = document.getElementById('data_servico');
    if (dataServicoInput) {
        dataServicoInput.value = formatDateForInput(today);
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addManutencaoModal'));
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
    const modalTitle = document.getElementById('addManutencaoModalLabel');
    if (modalTitle) {
        modalTitle.textContent = 'Editar Manutenção';
    }
    
    const form = document.getElementById('manutencaoForm');
    form.classList.add('loading');

    const modal = new bootstrap.Modal(document.getElementById('addManutencaoModal'));
    modal.show();

    Auth.fetchWithAuth(`/api/manutencoes/${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados da manutenção');
            }
            return response.json();
        })
        .then(data => {
            document.getElementById('veiculo').value = data.veiculo || '';
            if (data.veiculo) updateVeiculoDetails(data.veiculo);
            document.getElementById('servico_realizado').value = data.servico_realizado || '';
            document.getElementById('data_servico').value = data.data_servico || '';

            document.getElementById('data_servico').value = formatDateForInput(new Date(data.data_servico)) || '';

            document.getElementById('data_servico').value = data.data_servico || '';
          main
            document.getElementById('quilometragem').value = data.quilometragem || '';
            document.getElementById('oficina').value = data.oficina || '';
            document.getElementById('peca_utilizada').value = data.peca_utilizada || '';
            document.getElementById('valor_peca').value = data.valor_peca || 0;
            document.getElementById('valor_mao_obra').value = data.valor_mao_obra || 0;
            document.getElementById('status_manutencao').value = data.status || 'PENDENTE';
            document.getElementById('observacoes').value = data.observacoes || '';
            document.getElementById('nota_fiscal').value = data.nota_fiscal || '';
        })
        .catch(error => {
            console.error('Error loading maintenance:', error);
            showNotification('Não foi possível carregar os dados da manutenção.', 'error');
            bootstrap.Modal.getInstance(document.getElementById('addManutencaoModal')).hide();
        })
        .finally(() => {
            form.classList.remove('loading');
        });
}

/**
 * Displays a read-only view of a maintenance record
 * @param {string} id - Maintenance ID
 */
function visualizarManutencao(id) {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('detailModalLabel');
    const modalBody = document.getElementById('detailContent');
    const editBtn = document.getElementById('editManutencao');

    if (!modal || !modalTitle || !modalBody || !editBtn) return;

    modalTitle.textContent = 'Detalhes da Manutenção';
    editBtn.onclick = () => editarManutencao(id);
    modalBody.innerHTML = `<div class="d-flex justify-content-center"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Carregando...</span></div></div>`;

    const modalInstance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    modalInstance.show();

    Auth.fetchWithAuth(`/api/manutencoes/${id}/`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar detalhes');
            }
            return response.json();
        })
        .then(manutencao => {
            modalBody.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Veículo:</strong> ${manutencao.veiculo_placa || '--'}</p>
                        <p><strong>Serviço Realizado:</strong> ${manutencao.servico_realizado || '--'}</p>
                        <p><strong>Data do Serviço:</strong> ${formatDate(manutencao.data_servico)}</p>
                        <p><strong>KM:</strong> ${formatNumber(manutencao.quilometragem) || '--'}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Oficina:</strong> ${manutencao.oficina || '--'}</p>
                        <p><strong>Valor Peças:</strong> ${formatCurrency(manutencao.valor_peca)}</p>
                        <p><strong>Valor M. Obra:</strong> ${formatCurrency(manutencao.valor_mao_obra)}</p>
                        <p><strong>Valor Total:</strong> ${formatCurrency(manutencao.valor_total)}</p>
                        <p><strong>Status:</strong> ${getStatusHTML(manutencao.status)}</p>
                    </div>
                </div>
                <div class="mt-3">
                    <h6>Observações:</h6>
                    <p class="text-muted">${manutencao.observacoes || 'Nenhuma.'}</p>
                </div>`;
        })
        .catch(error => {
            console.error('Error loading maintenance details:', error);
            modalBody.innerHTML = '<div class="alert alert-danger">Erro ao carregar dados.</div>';
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
    const saveBtn = document.getElementById('saveManutencao');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
    
    // Get vehicle value and resolve ID if plate selected
    const veiculoValue = document.getElementById('veiculo').value;
    let veiculoId = veiculoValue;
    if (veiculoValue && isNaN(parseInt(veiculoValue))) {
        veiculoId = veiculoIdMap[veiculoValue];
    }

    if (!veiculoId) {
        showNotification('Veículo selecionado não está cadastrado.', 'warning');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar';
        return;
    }

    const formData = {
        veiculo: veiculoId,
        servico_realizado: document.getElementById('servico_realizado').value,
        data_servico: document.getElementById('data_servico').value,
        quilometragem: document.getElementById('quilometragem').value,
        oficina: document.getElementById('oficina').value,
        peca_utilizada: document.getElementById('peca_utilizada').value,
        valor_peca: parseFloat(document.getElementById('valor_peca').value) || 0,
        valor_mao_obra: parseFloat(document.getElementById('valor_mao_obra').value) || 0,
        status: document.getElementById('status_manutencao').value,
        observacoes: document.getElementById('observacoes').value,
        nota_fiscal: document.getElementById('nota_fiscal').value
    };

    const endpoint = currentEditId ? `/api/manutencoes/${currentEditId}/` : '/api/manutencoes/';
    const method = currentEditId ? 'PATCH' : 'POST';

    Auth.fetchWithAuth(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                const errorMessages = Object.values(data).flat().join(' ');
                throw new Error(errorMessages || 'Erro ao salvar manutenção');
            });
        }
        return response.json();
    })
    .then(() => {
        showNotification(currentEditId ? 'Manutenção atualizada com sucesso!' : 'Manutenção criada com sucesso!', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addManutencaoModal')).hide();
        loadManutencoesData();
    })
    .catch(error => {
        console.error('Error saving maintenance:', error);
        showNotification(`Erro ao salvar manutenção: ${error.message}`, 'error');
    })
    .finally(() => {
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

    Auth.fetchWithAuth(`/api/manutencoes/${id}/`, { method: 'DELETE' })
        .then(response => {
            if (response.status === 204) {
                showNotification('Manutenção excluída com sucesso!', 'success');
                loadManutencoesData();
            } else {
                return response.json().then(data => {
                    const msg = data.detail || 'Erro ao excluir manutenção';
                    throw new Error(msg);
                });
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
    // Since we don't have the proper API, we'll export the current table data
    showNotification('Exportando dados visíveis na tabela...', 'info');
    
    // Use the existing table data
    if (manutencoesList.length === 0) {
        showNotification('Nenhum dado disponível para exportar', 'warning');
        return;
    }
    
    // Create CSV content
    const headers = [
        'Placa',
        'Data',
        'Serviço',
        'Oficina',
        'KM',
        'Valor Peça',
        'Valor Mão de Obra',
        'Valor Total',
        'Status',
        'Observações'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    manutencoesList.forEach(manutencao => {
        const row = [
            manutencao.veiculo_placa || '',
            formatDate(manutencao.data_servico),
            `"${manutencao.servico_realizado || ''}"`,
            `"${manutencao.oficina || ''}"`,
            manutencao.quilometragem || '',
            manutencao.valor_peca || 0,
            manutencao.valor_mao_obra || 0,
            manutencao.valor_total || 0,
            manutencao.status || '',
            `"${manutencao.observacoes || ''}"`
        ];
        csvContent += row.join(',') + '\n';
    });
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `manutencoes_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Arquivo CSV baixado com sucesso!', 'success');
    } else {
        showNotification('Erro ao gerar arquivo CSV', 'error');
    }
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