/**
 * geografico.js
 * Functions for the geographical analysis panel
 */

// Map instance
let map = null;
let markers = [];
let routeLines = [];

/**
 * Initializes the geographical panel when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Initialize map
    initMap();
    
    // Load initial data
    loadGeograficoData();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadGeograficoData()"]');
    if (filterBtn) {
        // Replace inline handler with proper event listener
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            loadGeograficoData();
        });
    }
    
    // Export CSV button
    document.querySelector('button[onclick="exportTableToCSV(\'rotas-table\', \'rotas_frequentes.csv\')"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportTableToCSV('rotas-table', 'rotas_frequentes.csv');
    });
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
 * Initializes the map
 */
function initMap() {
    const mapContainer = document.getElementById('mapa-brasil');
    if (!mapContainer) return;
    
    // Create map focused on Brazil
    map = L.map('mapa-brasil').setView([-15.77972, -47.92972], 4); // Brasília coordinates
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Add scale control
    L.control.scale({imperial: false}).addTo(map);
}

/**
 * Loads geographical data from the API
 */
function loadGeograficoData() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    const uf = document.getElementById('uf').value;
    
    // Build API URL with query params
    let apiUrl = `/api/geografico/?`;
    
    if (dataInicio) apiUrl += `&date_from=${dataInicio}`;
    if (dataFim) apiUrl += `&date_to=${dataFim}`;
    if (uf) apiUrl += `&uf=${uf}`;
    
    // Fetch data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados geográficos');
            }
            return response.json();
        })
        .then(data => {
            // Update map
            updateMap(data.rotas);
            
            // Update top origins
            renderTopOrigins(data.top_origens);
            
            // Update top destinations
            renderTopDestinations(data.top_destinos);
            
            // Update frequent routes
            renderFrequentRoutes(data.rotas_frequentes);
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading geographical data:', error);
            showError('Não foi possível carregar os dados geográficos. Tente novamente.');
            
            // Clear tables with error message
            const errorHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Erro ao carregar dados. Tente novamente.
                    </td>
                </tr>`;
            
            document.getElementById('top-origens').innerHTML = errorHTML;
            document.getElementById('top-destinos').innerHTML = errorHTML;
            document.getElementById('rotas-frequentes').innerHTML = errorHTML.replace('colspan="4"', 'colspan="6"');
            
            // Hide loading indicator
            hideLoading();
        });
}

/**
 * Updates the map with routes data
 * @param {Array} rotas - Routes data from API
 */
function updateMap(rotas) {
    if (!map) return;
    
    // Clear previous markers and routes
    clearMap();
    
    // Get UF coordinates (simplified for Brazil states)
    const ufCoordinates = getUFCoordinates();
    
    // Create route connections
    rotas.forEach(rota => {
        if (rota.contagem < 1) return; // Skip routes with zero count
        
        const origem = rota.uf_ini;
        const destino = rota.uf_fim;
        
        // Skip if origin or destination coordinates not found
        if (!ufCoordinates[origem] || !ufCoordinates[destino]) return;
        
        const origemCoord = ufCoordinates[origem];
        const destinoCoord = ufCoordinates[destino];
        
        // Create origin marker if not exists
        let origemMarker = markers.find(m => m.uf === origem);
        if (!origemMarker) {
            const marker = L.circleMarker(origemCoord, {
                radius: 7,
                fillColor: '#1b4d3e',
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
            
            marker.bindTooltip(`<strong>${origem}</strong><br>Origem de ${rota.contagem} rotas`);
            markers.push({ uf: origem, marker: marker });
            origemMarker = markers[markers.length - 1];
        } else {
            // Update existing marker tooltip
            const currentTooltip = origemMarker.marker.getTooltip();
            const currentCount = parseInt(currentTooltip._content.match(/Origem de (\d+) rotas/)[1]);
            origemMarker.marker.setTooltipContent(`<strong>${origem}</strong><br>Origem de ${currentCount + rota.contagem} rotas`);
        }
        
        // Create destination marker if not exists
        let destinoMarker = markers.find(m => m.uf === destino);
        if (!destinoMarker) {
            const marker = L.circleMarker(destinoCoord, {
                radius: 7,
                fillColor: '#4CAF50',
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
            
            marker.bindTooltip(`<strong>${destino}</strong><br>Destino de ${rota.contagem} rotas`);
            markers.push({ uf: destino, marker: marker });
            destinoMarker = markers[markers.length - 1];
        } else {
            // Update existing marker tooltip
            const currentTooltip = destinoMarker.marker.getTooltip();
            const currentCount = parseInt(currentTooltip._content.match(/Destino de (\d+) rotas/)[1]);
            destinoMarker.marker.setTooltipContent(`<strong>${destino}</strong><br>Destino de ${currentCount + rota.contagem} rotas`);
        }
        
        // Create route line
        const intensity = Math.min(rota.contagem / 5, 1); // Normalize for line opacity
        const line = L.polyline([origemCoord, destinoCoord], {
            color: '#FF5722',
            weight: 2 + (rota.contagem / 10), // Line thickness based on count
            opacity: 0.4 + (intensity * 0.6),
            dashArray: '5, 5'
        }).addTo(map);
        
        // Add tooltip with route info
        line.bindTooltip(`${origem} → ${destino}<br>${rota.contagem} transporte(s)`);
        
        // Store line reference
        routeLines.push(line);
    });
}

/**
 * Clears all markers and routes from the map
 */
function clearMap() {
    // Remove markers
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    
    // Remove route lines
    routeLines.forEach(line => map.removeLayer(line));
    routeLines = [];
}

/**
 * Gets UF coordinates (simplified for Brazil states)
 * @returns {Object} - Object with UF codes as keys and coordinates as values
 */
function getUFCoordinates() {
    return {
        'AC': [-9.0238, -70.8120],
        'AL': [-9.6660, -36.7093],
        'AM': [-3.4168, -65.8561],
        'AP': [1.4078, -51.7774],
        'BA': [-12.2015, -41.6024],
        'CE': [-5.4984, -39.3206],
        'DF': [-15.7801, -47.9292],
        'ES': [-19.1834, -40.3089],
        'GO': [-16.6864, -49.2643],
        'MA': [-5.0421, -45.0979],
        'MG': [-18.5122, -44.5550],
        'MS': [-20.4428, -54.6464],
        'MT': [-12.6819, -56.9211],
        'PA': [-5.5296, -52.2900],
        'PB': [-7.1219, -36.7289],
        'PE': [-8.8137, -36.9541],
        'PI': [-7.7183, -42.7289],
        'PR': [-24.8951, -51.6584],
        'RJ': [-22.0698, -43.2392],
        'RN': [-5.8103, -36.2691],
        'RO': [-10.8304, -63.3403],
        'RR': [2.7376, -62.0751],
        'RS': [-30.0346, -53.2081],
        'SC': [-27.2423, -50.9578],
        'SE': [-10.5741, -37.3857],
        'SP': [-22.1894, -48.7944],
        'TO': [-10.1753, -48.2982]
    };
}

/**
 * Renders top origins table
 * @param {Array} origens - Top origins data from API
 */
function renderTopOrigins(origens) {
    const tbody = document.getElementById('top-origens');
    if (!tbody) return;
    
    if (!origens || origens.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center">
                Nenhuma origem encontrada para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    origens.forEach(origem => {
        html += `
        <tr>
            <td>${origem.uf_ini || '--'}</td>
            <td>${origem.nome_mun_ini || '--'}</td>
            <td class="text-end">${origem.contagem || 0}</td>
            <td class="text-end">${formatCurrency(origem.valor || 0)}</td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders top destinations table
 * @param {Array} destinos - Top destinations data from API
 */
function renderTopDestinations(destinos) {
    const tbody = document.getElementById('top-destinos');
    if (!tbody) return;
    
    if (!destinos || destinos.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center">
                Nenhum destino encontrado para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    destinos.forEach(destino => {
        html += `
        <tr>
            <td>${destino.uf_fim || '--'}</td>
            <td>${destino.nome_mun_fim || '--'}</td>
            <td class="text-end">${destino.contagem || 0}</td>
            <td class="text-end">${formatCurrency(destino.valor || 0)}</td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Renders frequent routes table
 * @param {Array} rotas - Frequent routes data from API
 */
function renderFrequentRoutes(rotas) {
    const tbody = document.getElementById('rotas-frequentes');
    if (!tbody) return;
    
    if (!rotas || rotas.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center">
                Nenhuma rota encontrada para os filtros selecionados.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    rotas.forEach(rota => {
        // Calculate Valor/Km
        const valorKm = rota.km_total > 0 ? rota.valor_total / rota.km_total : 0;
        
        html += `
        <tr>
            <td>${rota.uf_ini || '--'}</td>
            <td>${rota.uf_fim || '--'}</td>
            <td class="text-end">${rota.contagem || 0}</td>
            <td class="text-end">${formatNumber(rota.km_total || 0, 0)}</td>
            <td class="text-end">${formatCurrency(rota.valor_total || 0)}</td>
            <td class="text-end">${formatCurrency(valorKm)}</td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Shows loading state
 */
function showLoading() {
    // Show loading indicator for map
    const mapContainer = document.getElementById('mapa-brasil');
    if (mapContainer) {
        const loadingHTML = `
        <div class="d-flex justify-content-center align-items-center h-100 loading-overlay">
            <div class="spinner-border text-success me-2" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <span>Carregando mapa...</span>
        </div>`;
        
        // Append loading overlay if not exists
        if (!mapContainer.querySelector('.loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'position-absolute top-0 start-0 w-100 h-100 bg-white bg-opacity-75';
            overlay.innerHTML = loadingHTML;
            mapContainer.style.position = 'relative';
            mapContainer.appendChild(overlay);
        }
    }
    
    // Show loading states for tables
    const loadingHTML = `
    <tr>
        <td colspan="4" class="text-center">
            <div class="spinner-border spinner-border-sm text-success me-2" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            Carregando dados...
        </td>
    </tr>`;
    
    document.getElementById('top-origens')?.innerHTML = loadingHTML;
    document.getElementById('top-destinos')?.innerHTML = loadingHTML;
    document.getElementById('rotas-frequentes')?.innerHTML = loadingHTML.replace('colspan="4"', 'colspan="6"');
    
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
    // Remove map loading overlay
    const mapContainer = document.getElementById('mapa-brasil');
    if (mapContainer) {
        const overlay = mapContainer.querySelector('.loading-overlay');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }
    
    // Re-enable filter buttons
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = false;
    });
}

/**
 * Shows error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    // Create toast notification
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '1080';
    
    const toastHTML = `
    <div class="toast align-items-center text-white bg-danger border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                <i class="fas fa-exclamation-circle me-2"></i> ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>
    `;
    
    toastContainer.innerHTML = toastHTML;
    document.body.appendChild(toastContainer);
    
    const toastElement = toastContainer.querySelector('.toast');
    const toast = new bootstrap.Toast(toastElement, {
        delay: 5000
    });
    
    toast.show();
    
    // Remove toast container when hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        document.body.removeChild(toastContainer);
    });
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
 * Format number with thousands separator
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted number
 */
function formatNumber(value, decimals = 2) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value || 0);
}