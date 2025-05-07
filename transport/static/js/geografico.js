/**
 * geografico.js
 * Functions for the geographic dashboard panel
 */

// Global variables
let mapInstance = null;
let heatmapInstance = null;
let mapMarkers = [];
let routePolylines = [];

// Data cache
let geographicData = {};

/**
 * Initializes geographic dashboard when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    setDefaultDateRange();
    
    // Initialize map if element exists
    initializeMap();
    
    // Load initial data
    loadGeographicData();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Sets up all event listeners for the geographic panel
 */
function setupEventListeners() {
    // Filter button
    const filterBtn = document.querySelector('button[onclick="loadGeographicData()"]');
    if (filterBtn) {
        filterBtn.removeAttribute('onclick');
        filterBtn.addEventListener('click', function() {
            loadGeographicData();
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
    
    // View type buttons
    const viewTypeButtons = document.querySelectorAll('button[data-view]');
    viewTypeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const viewType = this.getAttribute('data-view');
            updateMapView(viewType);
            
            // Update active button
            viewTypeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Map mode buttons
    const mapModeButtons = document.querySelectorAll('button[data-mode]');
    mapModeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const mapMode = this.getAttribute('data-mode');
            updateMapMode(mapMode);
            
            // Update active button
            mapModeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Origin and destination filters
    const originFilter = document.getElementById('origin-filter');
    if (originFilter) {
        originFilter.addEventListener('change', function() {
            filterMapByOrigin(this.value);
        });
    }
    
    const destFilter = document.getElementById('destination-filter');
    if (destFilter) {
        destFilter.addEventListener('change', function() {
            filterMapByDestination(this.value);
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
 * Resets filters and loads data
 */
function resetFilters() {
    // Reset form
    document.getElementById('filterForm')?.reset();
    
    // Set default date range
    setDefaultDateRange();
    
    // Reset origin and destination filters
    if (document.getElementById('origin-filter')) {
        document.getElementById('origin-filter').value = 'all';
    }
    if (document.getElementById('destination-filter')) {
        document.getElementById('destination-filter').value = 'all';
    }
    
    // Reset map view
    const defaultViewBtn = document.querySelector('button[data-view="rotas"]');
    if (defaultViewBtn) {
        defaultViewBtn.click();
    }
    
    // Load data with reset filters
    loadGeographicData();
}

/**
 * Loads geographic data from the API
 */
function loadGeographicData() {
    // Show loading state
    showLoading();
    
    // Get filter values
    const dataInicio = document.getElementById('data_inicio').value;
    const dataFim = document.getElementById('data_fim').value;
    
    // Build API URL with query params
    const apiUrl = `/api/geografico/?data_inicio=${dataInicio}&data_fim=${dataFim}`;
    
    // Fetch data with authentication
    Auth.fetchWithAuth(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao carregar dados geográficos');
            }
            return response.json();
        })
        .then(data => {
            // Store data globally
            geographicData = data;
            
            // Update UI components
            updateOriginDestinationFilters(data);
            updateTopOrigins(data.top_origens || []);
            updateTopDestinations(data.top_destinos || []);
            updateTopRoutes(data.rotas_frequentes || []);
            updateMap(data.rotas || []);
            
            // Hide loading indicator
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading geographic data:', error);
            showNotification('Não foi possível carregar os dados geográficos. Tente novamente.', 'error');
            hideLoading();
        });
}

/**
 * Shows loading state
 */
function showLoading() {
    // Display loading overlay for map
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
        <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Carregando...</span>
        </div>
        <p class="mt-2 text-white">Carregando dados geográficos...</p>
        `;
        mapContainer.appendChild(loadingOverlay);
    }
    
    // Loading indicators for list tables
    const tableBodies = document.querySelectorAll('.list-table tbody');
    tableBodies.forEach(tbody => {
        tbody.innerHTML = `
        <tr>
            <td colspan="3" class="text-center">
                <div class="spinner-border spinner-border-sm text-success me-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <span>Carregando dados...</span>
            </td>
        </tr>`;
    });
    
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
    // Remove loading overlay for map
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
    
    // Re-enable filter buttons
    const buttons = document.querySelectorAll('#filterForm button');
    buttons.forEach(button => {
        button.disabled = false;
    });
}

/**
 * Initializes the map
 */
function initializeMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    
    // Check if the map libraries are loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded.');
        return;
    }
    
    // Initialize map
    mapInstance = L.map('map', {
        center: [-15.7801, -47.9292], // Brasília (center of Brazil)
        zoom: 5,
        minZoom: 4,
        maxZoom: 18
    });
    
    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);
    
    // Initialize empty heatmap layer
    heatmapInstance = L.heatLayer([], {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        gradient: {0.4: 'blue', 0.65: 'lime', 0.85: 'yellow', 1: 'red'}
    });
}

/**
 * Updates origin and destination filter dropdowns
 * @param {Object} data - Geographic data
 */
function updateOriginDestinationFilters(data) {
    // Get filter elements
    const originFilter = document.getElementById('origin-filter');
    const destFilter = document.getElementById('destination-filter');
    
    if (!originFilter || !destFilter) return;
    
    // Clear existing options (except the first 'All' option)
    while (originFilter.options.length > 1) {
        originFilter.remove(1);
    }
    
    while (destFilter.options.length > 1) {
        destFilter.remove(1);
    }
    
    // Create sets to track unique origins and destinations
    const origins = new Set();
    const destinations = new Set();
    
    // Process routes
    if (data.top_origens) {
        data.top_origens.forEach(origin => {
            origins.add(`${origin.uf}:${origin.municipio}`);
        });
    }
    
    if (data.top_destinos) {
        data.top_destinos.forEach(dest => {
            destinations.add(`${dest.uf}:${dest.municipio}`);
        });
    }
    
    // Add options for origins
    origins.forEach(origin => {
        const [uf, municipio] = origin.split(':');
        const option = document.createElement('option');
        option.value = origin;
        option.textContent = `${municipio}/${uf}`;
        originFilter.appendChild(option);
    });
    
    // Add options for destinations
    destinations.forEach(dest => {
        const [uf, municipio] = dest.split(':');
        const option = document.createElement('option');
        option.value = dest;
        option.textContent = `${municipio}/${uf}`;
        destFilter.appendChild(option);
    });
}

/**
 * Updates top origins list
 * @param {Array} origins - Top origins data
 */
function updateTopOrigins(origins) {
    const tbody = document.getElementById('top-origins-body');
    if (!tbody) return;
    
    if (!origins || origins.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="3" class="text-center">
                Nenhum dado disponível.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    origins.forEach((origin, index) => {
        html += `
        <tr>
            <td>${index + 1}</td>
            <td>${origin.municipio}/${origin.uf}</td>
            <td class="text-end">${formatNumber(origin.total)}</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

/**
 * Updates top destinations list
 * @param {Array} destinations - Top destinations data
 */
function updateTopDestinations(destinations) {
    const tbody = document.getElementById('top-destinations-body');
    if (!tbody) return;
    
    if (!destinations || destinations.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="3" class="text-center">
                Nenhum dado disponível.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    destinations.forEach((dest, index) => {
        html += `
        <tr>
            <td>${index + 1}</td>
            <td>${dest.municipio}/${dest.uf}</td>
            <td class="text-end">${formatNumber(dest.total)}</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

/**
 * Updates top routes list
 * @param {Array} routes - Top routes data
 */
function updateTopRoutes(routes) {
    const tbody = document.getElementById('top-routes-body');
    if (!tbody) return;
    
    if (!routes || routes.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center">
                Nenhum dado disponível.
            </td>
        </tr>`;
        return;
    }
    
    let html = '';
    
    routes.forEach((route, index) => {
        const origem = `${route.origem.municipio}/${route.origem.uf}`;
        const destino = `${route.destino.municipio}/${route.destino.uf}`;
        
        html += `
        <tr>
            <td>${index + 1}</td>
            <td>${origem}</td>
            <td>${destino}</td>
            <td class="text-end">${formatNumber(route.total)}</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

/**
 * Updates the map with routes data
 * @param {Array} routes - Routes data
 */
function updateMap(routes) {
    if (!mapInstance) return;
    
    // Clear existing markers and routes
    clearMap();
    
    if (!routes || routes.length === 0) {
        showNotification('Nenhum dado de rota disponível para o período selecionado.', 'info');
        return;
    }
    
    // Process routes
    const heatmapPoints = [];
    
    routes.forEach(route => {
        // Create origin marker
        const originLatLng = getLatLngFromLocation(route.origem);
        if (originLatLng) {
            const originMarker = createMarker(originLatLng, route.origem, 'origem');
            if (originMarker) {
                mapMarkers.push(originMarker);
                heatmapPoints.push([originLatLng.lat, originLatLng.lng, route.fluxo || 1]);
            }
        }
        
        // Create destination marker
        const destLatLng = getLatLngFromLocation(route.destino);
        if (destLatLng) {
            const destMarker = createMarker(destLatLng, route.destino, 'destino');
            if (destMarker) {
                mapMarkers.push(destMarker);
                heatmapPoints.push([destLatLng.lat, destLatLng.lng, route.fluxo || 1]);
            }
        }
        
        // Create route line if both points exist
        if (originLatLng && destLatLng) {
            const routeLine = createRouteLine(originLatLng, destLatLng, route);
            if (routeLine) {
                routePolylines.push(routeLine);
            }
        }
    });
    
    // Update heatmap data
    if (heatmapPoints.length > 0) {
        heatmapInstance.setLatLngs(heatmapPoints);
    }
    
    // Fit map bounds to include all markers
    if (mapMarkers.length > 0) {
        const group = new L.featureGroup(mapMarkers);
        mapInstance.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
    
    // Set default view (routes)
    document.querySelector('button[data-view="rotas"]')?.click();
}

/**
 * Creates a marker on the map
 * @param {Object} latLng - Lat/Lng coordinates
 * @param {Object} location - Location data
 * @param {string} type - Marker type (origem, destino)
 * @returns {Object} - Leaflet marker
 */
function createMarker(latLng, location, type) {
    if (!mapInstance) return null;
    
    // Icon based on type
    const iconUrl = type === 'origem' ? 
        'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-icon.png' : 
        'https://cdn.jsdelivr.net/npm/leaflet-color-markers@1.0.0/img/marker-icon-red.png';
    
    const icon = L.icon({
        iconUrl: iconUrl,
        shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
    
    // Create marker
    const marker = L.marker(latLng, { icon }).addTo(mapInstance);
    
    // Add popup with info
    const typeLabel = type === 'origem' ? 'Origem' : 'Destino';
    marker.bindPopup(`
        <strong>${typeLabel}:</strong> ${location.municipio}/${location.uf}<br>
        <strong>Total:</strong> ${formatNumber(location.total || 0)}
    `);
    
    return marker;
}

/**
 * Creates a route line between two points
 * @param {Object} origin - Origin coordinates
 * @param {Object} destination - Destination coordinates
 * @param {Object} routeData - Route data
 * @returns {Object} - Leaflet polyline
 */
function createRouteLine(origin, destination, routeData) {
    if (!mapInstance) return null;
    
    // Calculate line weight based on flow
    const weight = Math.max(1, Math.min(8, Math.log(routeData.fluxo || 1) + 1));
    
    // Create line
    const polyline = L.polyline([origin, destination], {
        color: '#FF5722',
        weight: weight,
        opacity: 0.6,
        dashArray: '5, 10'
    }).addTo(mapInstance);
    
    // Add popup with info
    const fromTo = `${routeData.origem.municipio}/${routeData.origem.uf} → ${routeData.destino.municipio}/${routeData.destino.uf}`;
    polyline.bindPopup(`
        <strong>Rota:</strong> ${fromTo}<br>
        <strong>Entregas:</strong> ${formatNumber(routeData.fluxo || 0)}<br>
        <strong>Valor Total:</strong> ${formatCurrency(routeData.valor || 0)}
    `);
    
    return polyline;
}

/**
 * Updates the map view type
 * @param {string} viewType - View type (rotas, pontos, calor)
 */
function updateMapView(viewType) {
    if (!mapInstance) return;
    
    // Show/hide elements based on view type
    switch (viewType) {
        case 'rotas':
            // Show routes and markers
            showMapElements('routes');
            showMapElements('markers');
            hideMapElements('heatmap');
            break;
        case 'pontos':
            // Show only markers
            hideMapElements('routes');
            showMapElements('markers');
            hideMapElements('heatmap');
            break;
        case 'calor':
            // Show heatmap and hide markers/routes
            hideMapElements('routes');
            hideMapElements('markers');
            showMapElements('heatmap');
            break;
    }
}

/**
 * Updates the map mode
 * @param {string} mode - Map mode (hybrid, streets, satellite)
 */
function updateMapMode(mode) {
    if (!mapInstance) return;
    
    // Clear existing tile layers
    mapInstance.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            mapInstance.removeLayer(layer);
        }
    });
    
    // Add new tile layer based on mode
    switch (mode) {
        case 'streets':
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapInstance);
            break;
        case 'satellite':
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }).addTo(mapInstance);
            break;
        case 'hybrid':
            // First add satellite
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }).addTo(mapInstance);
            
            // Then add transparent labels
            L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}{r}.{ext}', {
                attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                subdomains: 'abcd',
                ext: 'png'
            }).addTo(mapInstance);
            break;
    }
}

/**
 * Filters the map by origin
 * @param {string} origin - Origin filter value
 */
function filterMapByOrigin(origin) {
    if (origin === 'all') {
        // Show all markers and routes
        showAllMapElements();
        return;
    }
    
    // Parse origin value
    const [uf, municipio] = origin.split(':');
    
    // Hide all markers and routes
    hideMapElements('routes');
    hideMapElements('markers');
    
    // Show only markers and routes for this origin
    mapMarkers.forEach(marker => {
        const popup = marker._popup;
        if (popup && popup._content.includes(`Origem: ${municipio}/${uf}`)) {
            marker.addTo(mapInstance);
        }
    });
    
    routePolylines.forEach(line => {
        const popup = line._popup;
        if (popup && popup._content.includes(`${municipio}/${uf} →`)) {
            line.addTo(mapInstance);
        }
    });
}

/**
 * Filters the map by destination
 * @param {string} destination - Destination filter value
 */
function filterMapByDestination(destination) {
    if (destination === 'all') {
        // Show all markers and routes
        showAllMapElements();
        return;
    }
    
    // Parse destination value
    const [uf, municipio] = destination.split(':');
    
    // Hide all markers and routes
    hideMapElements('routes');
    hideMapElements('markers');
    
    // Show only markers and routes for this destination
    mapMarkers.forEach(marker => {
        const popup = marker._popup;
        if (popup && popup._content.includes(`Destino: ${municipio}/${uf}`)) {
            marker.addTo(mapInstance);
        }
    });
    
    routePolylines.forEach(line => {
        const popup = line._popup;
        if (popup && popup._content.includes(`→ ${municipio}/${uf}`)) {
            line.addTo(mapInstance);
        }
    });
}

/**
 * Shows all map elements
 */
function showAllMapElements() {
    showMapElements('routes');
    showMapElements('markers');
}

/**
 * Shows specific map elements
 * @param {string} elementType - Element type (routes, markers, heatmap)
 */
function showMapElements(elementType) {
    if (!mapInstance) return;
    
    switch (elementType) {
        case 'routes':
            routePolylines.forEach(line => line.addTo(mapInstance));
            break;
        case 'markers':
            mapMarkers.forEach(marker => marker.addTo(mapInstance));
            break;
        case 'heatmap':
            heatmapInstance.addTo(mapInstance);
            break;
    }
}

/**
 * Hides specific map elements
 * @param {string} elementType - Element type (routes, markers, heatmap)
 */
function hideMapElements(elementType) {
    if (!mapInstance) return;
    
    switch (elementType) {
        case 'routes':
            routePolylines.forEach(line => mapInstance.removeLayer(line));
            break;
        case 'markers':
            mapMarkers.forEach(marker => mapInstance.removeLayer(marker));
            break;
        case 'heatmap':
            mapInstance.removeLayer(heatmapInstance);
            break;
    }
}

/**
 * Clears all map elements
 */
function clearMap() {
    // Clear routes
    routePolylines.forEach(line => {
        if (mapInstance.hasLayer(line)) {
            mapInstance.removeLayer(line);
        }
    });
    routePolylines = [];
    
    // Clear markers
    mapMarkers.forEach(marker => {
        if (mapInstance.hasLayer(marker)) {
            mapInstance.removeLayer(marker);
        }
    });
    mapMarkers = [];
    
    // Clear heatmap
    if (mapInstance.hasLayer(heatmapInstance)) {
        mapInstance.removeLayer(heatmapInstance);
    }
}

/**
 * Gets LatLng from location data
 * @param {Object} location - Location data
 * @returns {Object|null} - LatLng object or null
 */
function getLatLngFromLocation(location) {
    // Check if location has coordinates
    if (location.lat && location.lng) {
        return L.latLng(location.lat, location.lng);
    }
    
    // Use geocoder service for real implementation
    // This is a simplified version using hardcoded values for common cities
    const cityCoords = {
        'São Paulo-SP': [-23.5505, -46.6333],
        'Rio de Janeiro-RJ': [-22.9068, -43.1729],
        'Brasília-DF': [-15.7801, -47.9292],
        'Salvador-BA': [-12.9714, -38.5014],
        'Fortaleza-CE': [-3.7172, -38.5431],
        'Belo Horizonte-MG': [-19.9167, -43.9345],
        'Manaus-AM': [-3.1019, -60.0251],
        'Curitiba-PR': [-25.4297, -49.2719],
        'Recife-PE': [-8.0476, -34.8770],
        'Porto Alegre-RS': [-30.0346, -51.2177],
        'Belém-PA': [-1.4558, -48.4902],
        'Goiânia-GO': [-16.6799, -49.2550],
        'Guarulhos-SP': [-23.4558, -46.5306],
        'Campinas-SP': [-22.9099, -47.0626],
        'São Luís-MA': [-2.5391, -44.2829],
        'São Gonçalo-RJ': [-22.8268, -43.0634],
        'Maceió-AL': [-9.6658, -35.7350],
        'Duque de Caxias-RJ': [-22.7855, -43.3168],
        'Natal-RN': [-5.7945, -35.2120],
        'Teresina-PI': [-5.0919, -42.8034]
    };
    
    const key = `${location.municipio}-${location.uf}`;
    if (cityCoords[key]) {
        return L.latLng(cityCoords[key][0], cityCoords[key][1]);
    }
    
    // Fallback to random location in Brazil (for demo purposes)
    const centerLat = -15.7801;
    const centerLng = -47.9292;
    const latVariation = Math.random() * 10 - 5; // -5 to 5
    const lngVariation = Math.random() * 10 - 5; // -5 to 5
    
    return L.latLng(centerLat + latVariation, centerLng + lngVariation);
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