/**
 * scripts.js
 * Funções utilitárias compartilhadas em todo o sistema
 */

// Inicialização quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar tooltips do Bootstrap
    initializeTooltips();
    
    // Inicializar popovers do Bootstrap
    initializePopovers();
    
    // Configurar o tema (claro/escuro) baseado nas preferências do usuário
    setupThemeToggle();
    
    // Inicializar máscaras de entrada para campos específicos
    setupInputMasks();
    
    // Configurar comportamento dos painéis colapsáveis
    setupCollapsibles();
    
    // Configurar comportamento de animações de carregamento
    setupLoadingAnimations();
    
    // Detectar se há um token válido e ajustar a UI
    checkAuthenticationStatus();
});

/**
 * Inicializa todos os tooltips do Bootstrap
 */
function initializeTooltips() {
    // Seleciona todos os elementos com atributo data-bs-toggle="tooltip"
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    
    // Inicializa tooltips usando a API do Bootstrap
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            boundary: document.body, // Evita recortes por overflow
            placement: tooltipTriggerEl.getAttribute('data-bs-placement') || 'top'
        });
    });
}

/**
 * Inicializa todos os popovers do Bootstrap
 */
function initializePopovers() {
    // Seleciona todos os elementos com atributo data-bs-toggle="popover"
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    
    // Inicializa popovers usando a API do Bootstrap
    popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl, {
            html: popoverTriggerEl.getAttribute('data-bs-html') === 'true',
            trigger: popoverTriggerEl.getAttribute('data-bs-trigger') || 'click',
            placement: popoverTriggerEl.getAttribute('data-bs-placement') || 'top'
        });
    });
}

/**
 * Configura o alternador de tema (claro/escuro)
 */
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Se não tiver o botão de alternância, não faz nada
    if (!themeToggleBtn) return;
    
    // Função para aplicar tema
    const applyTheme = (isDark) => {
        const html = document.documentElement;
        
        if (isDark) {
            html.setAttribute('data-bs-theme', 'dark');
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            themeToggleBtn.setAttribute('title', 'Mudar para Tema Claro');
            localStorage.setItem('theme', 'dark');
        } else {
            html.setAttribute('data-bs-theme', 'light');
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            themeToggleBtn.setAttribute('title', 'Mudar para Tema Escuro');
            localStorage.setItem('theme', 'light');
        }
        
        // Atualizar tooltip se existir
        if (bootstrap.Tooltip.getInstance(themeToggleBtn)) {
            bootstrap.Tooltip.getInstance(themeToggleBtn).dispose();
            new bootstrap.Tooltip(themeToggleBtn);
        }
    };
    
    // Verificar preferência salva ou usar preferência do sistema
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme === 'dark');
    } else {
        applyTheme(prefersDarkScheme.matches);
    }
    
    // Adicionar listener para o botão
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        applyTheme(currentTheme !== 'dark');
    });
    
    // Atualizar quando a preferência do sistema mudar
    prefersDarkScheme.addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            applyTheme(e.matches);
        }
    });
}

/**
 * Configura máscaras para inputs específicos
 */
function setupInputMasks() {
    // Configurar máscara para campos de CPF
    const cpfInputs = document.querySelectorAll('.cpf-mask');
    cpfInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 11) value = value.substring(0, 11);
            
            if (value.length > 9) {
                value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
            } else if (value.length > 6) {
                value = value.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
            } else if (value.length > 3) {
                value = value.replace(/^(\d{3})(\d{3})$/, "$1.$2");
            }
            
            e.target.value = value;
        });
    });
    
    // Configurar máscara para campos de CNPJ
    const cnpjInputs = document.querySelectorAll('.cnpj-mask');
    cnpjInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 14) value = value.substring(0, 14);
            
            if (value.length > 12) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
            } else if (value.length > 8) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/, "$1.$2.$3/$4");
            } else if (value.length > 5) {
                value = value.replace(/^(\d{2})(\d{3})(\d+)$/, "$1.$2.$3");
            } else if (value.length > 2) {
                value = value.replace(/^(\d{2})(\d+)$/, "$1.$2");
            }
            
            e.target.value = value;
        });
    });
    
    // Configurar máscara para campos de placa de veículo (formato Mercosul)
    const placaInputs = document.querySelectorAll('.placa-mask');
    placaInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (value.length > 7) value = value.substring(0, 7);
            
            if (value.length > 3) {
                value = value.replace(/^([A-Z]{3})([0-9A-Z]{1})(.+)$/, "$1$2$3");
            }
            
            e.target.value = value;
        });
    });
    
    // Configurar máscara para campos de valor monetário
    const moneyInputs = document.querySelectorAll('.money-mask');
    moneyInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            
            // Converte para formato decimal
            value = (parseInt(value) / 100).toFixed(2);
            
            // Formata com separadores
            value = value.replace('.', ',');
            value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            
            e.target.value = value;
        });
    });
}

/**
 * Configura comportamento dos painéis colapsáveis
 */
function setupCollapsibles() {
    // Selecionar todos os headers de painéis colapsáveis
    const collapsibleHeaders = document.querySelectorAll('[data-toggle="collapse"]');
    
    collapsibleHeaders.forEach(header => {
        // Obter o elemento alvo a partir do atributo data-target
        const targetId = header.getAttribute('data-target') || header.getAttribute('href');
        if (!targetId) return;
        
        const target = document.querySelector(targetId);
        if (!target) return;
        
        // Configurar ícone de expansão/colapso
        const updateIcon = (isOpen) => {
            const icon = header.querySelector('.collapse-icon');
            if (icon) {
                icon.classList.remove('fa-chevron-down', 'fa-chevron-up');
                icon.classList.add(isOpen ? 'fa-chevron-up' : 'fa-chevron-down');
            }
        };
        
        // Inicializar com o estado correto
        updateIcon(target.classList.contains('show'));
        
        // Adicionar listener para atualizar o ícone quando o painel mudar de estado
        target.addEventListener('shown.bs.collapse', () => updateIcon(true));
        target.addEventListener('hidden.bs.collapse', () => updateIcon(false));
    });
}

/**
 * Configura comportamento de animações de carregamento
 */
function setupLoadingAnimations() {
    // Adiciona listener para todos os formulários que devem mostrar animação de carregamento
    const forms = document.querySelectorAll('form[data-loading]');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            // Evita animação em validação do cliente
            if (!form.checkValidity()) return;
            
            // Desabilita botão de submit e mostra spinner
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processando...`;
                
                // Armazenar o texto original para restaurar depois
                submitBtn.setAttribute('data-original-text', originalText);
            }
        });
    });
    
    // Restaurar botões após erros de validação do servidor
    document.addEventListener('formError', function(e) {
        const form = e.detail.form;
        const submitBtn = form.querySelector('button[type="submit"]');
        
        if (submitBtn && submitBtn.hasAttribute('data-original-text')) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.getAttribute('data-original-text');
        }
    });
}

/**
 * Verifica o status de autenticação e ajusta a UI
 */
function checkAuthenticationStatus() {
    // Esta função verificará se o token está presente e ajustará elementos da UI
    // que dependem do estado de autenticação
    
    const isAuthenticated = !!localStorage.getItem('authToken');
    
    // Ajustar elementos baseado no status de autenticação
    const authElements = document.querySelectorAll('[data-auth-required]');
    const guestElements = document.querySelectorAll('[data-guest-only]');
    
    // Mostrar/esconder elementos que exigem autenticação
    authElements.forEach(element => {
        element.style.display = isAuthenticated ? '' : 'none';
    });
    
    // Mostrar/esconder elementos apenas para visitantes
    guestElements.forEach(element => {
        element.style.display = isAuthenticated ? 'none' : '';
    });
    
    // Se estiver autenticado, buscar informações do usuário para exibir na UI
    if (isAuthenticated && Auth) {
        const userInfo = Auth.getUserData();
        updateUserInfoUI(userInfo);
    }
}

/**
 * Atualiza a UI com informações do usuário
 * @param {Object} userInfo - Dados do usuário
 */
function updateUserInfoUI(userInfo) {
    if (!userInfo) return;
    
    // Atualizar display do nome do usuário
    const userNameDisplays = document.querySelectorAll('.user-name-display');
    userNameDisplays.forEach(element => {
        element.textContent = userInfo.first_name || userInfo.username || 'Usuário';
    });
    
    // Atualizar role/tipo do usuário
    const userRoleDisplays = document.querySelectorAll('.user-role-display');
    userRoleDisplays.forEach(element => {
        let role = 'Usuário';
        if (userInfo.is_superuser) role = 'Administrador';
        else if (userInfo.is_staff) role = 'Operador';
        
        element.textContent = role;
    });
}

/**
 * Função global para mostrar notificações toast
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo de notificação (success, error, warning, info)
 * @param {number} duration - Duração em milissegundos
 */
function showNotification(message, type = 'success', duration = 5000) {
    // Define cores baseadas no tipo
    const typeClasses = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-dark'
    };
    
    // Obter ou criar container de toasts
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1080';
        document.body.appendChild(toastContainer);
    }
    
    // Criar elemento toast
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
    
    // Adicionar toast ao container
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    // Inicializar e mostrar toast
    const toastElement = document.getElementById(toastID);
    const toast = new bootstrap.Toast(toastElement, {
        delay: duration
    });
    
    toast.show();
    
    // Remover elemento toast quando escondido
    toastElement.addEventListener('hidden.bs.toast', function() {
        this.remove();
        
        // Remover container se vazio
        if (toastContainer.children.length === 0) {
            toastContainer.remove();
        }
    });
}

/**
 * Formata valor monetário 
 * @param {number} value - Valor a ser formatado
 * @returns {string} - String formatada
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Formata número com separador de milhares
 * @param {number} value - Valor a ser formatado
 * @returns {string} - String formatada
 */
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
}

/**
 * Formata valor percentual
 * @param {number} value - Valor a ser formatado (ex: 25.5 para 25,5%)
 * @returns {string} - String formatada
 */
function formatPercent(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(value / 100 || 0);
}

/**
 * Formata data
 * @param {string|Date} date - Data a ser formatada
 * @returns {string} - String formatada
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
 * Formata data e hora
 * @param {string|Date} date - Data a ser formatada
 * @returns {string} - String formatada
 */
function formatDateTime(date) {
    if (!date) return '--';
    
    try {
        return new Date(date).toLocaleString('pt-BR');
    } catch (e) {
        return '--';
    }
}

/**
 * Trunca texto com reticências
 * @param {string} text - Texto a ser truncado
 * @param {number} maxLength - Comprimento máximo
 * @returns {string} - Texto truncado
 */
function truncateText(text, maxLength) {
    if (!text) return '--';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Verifica se uma string é um CPF válido
 * @param {string} cpf - CPF a ser validado
 * @returns {boolean} - true se for válido
 */
function validateCPF(cpf) {
    cpf = cpf.replace(/[^\d]/g, '');
    
    if (cpf.length !== 11) return false;
    
    // Elimina CPFs inválidos conhecidos
    if (/^(\d)\1+$/.test(cpf)) return false;
    
    // Valida 1º dígito
    let add = 0;
    for (let i = 0; i < 9; i++) {
        add += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let rev = 11 - (add % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(9))) return false;
    
    // Valida 2º dígito
    add = 0;
    for (let i = 0; i < 10; i++) {
        add += parseInt(cpf.charAt(i)) * (11 - i);
    }
    rev = 11 - (add % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(10))) return false;
    
    return true;
}

/**
 * Verifica se uma string é um CNPJ válido
 * @param {string} cnpj - CNPJ a ser validado
 * @returns {boolean} - true se for válido
 */
function validateCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]/g, '');
    
    if (cnpj.length !== 14) return false;
    
    // Elimina CNPJs inválidos conhecidos
    if (/^(\d)\1+$/.test(cnpj)) return false;
    
    // Valida DVs
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    const digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    
    return true;
}

/**
 * Exporta uma tabela HTML para CSV
 * @param {string} tableId - ID da tabela
 * @param {string} filename - Nome do arquivo
 */
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = table.querySelectorAll('tr');
    const csvContent = [];
    
    // Extrair linha de cabeçalho
    const headerRow = [];
    const headers = rows[0].querySelectorAll('th');
    headers.forEach(header => {
        headerRow.push(header.textContent.trim());
    });
    csvContent.push(headerRow.join(','));
    
    // Extrair linhas de dados (pular primeira linha que é o cabeçalho)
    for (let i = 1; i < rows.length; i++) {
        const row = [];
        const cells = rows[i].querySelectorAll('td');
        
        cells.forEach((cell, index) => {
            // Pular a última coluna se contiver botões
            if (index === cells.length - 1 && cell.querySelector('button')) {
                return;
            }
            
            // Remover símbolos de moeda e formatação para números
            let content = cell.textContent.trim();
            if (content.includes('R$')) {
                content = content.replace('R$', '').replace(/\./g, '').replace(/,/g, '.');
            }
            
            row.push(content);
        });
        
        csvContent.push(row.join(','));
    }
    
    // Criar e acionar download
    const csv = csvContent.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Copia texto para a área de transferência
 * @param {string} text - Texto a ser copiado
 * @returns {Promise} - Promise com resultado da operação
 */
function copyToClipboard(text) {
    // Usar a API de área de transferência moderna se disponível
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text)
            .then(() => {
                showNotification('Texto copiado para a área de transferência!', 'success');
                return true;
            })
            .catch(err => {
                console.error('Erro ao copiar texto:', err);
                return false;
            });
    } else {
        // Fallback para método alternativo
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                showNotification('Texto copiado para a área de transferência!', 'success');
                return Promise.resolve(true);
            } else {
                return Promise.resolve(false);
            }
        } catch (err) {
            console.error('Erro ao copiar texto:', err);
            return Promise.resolve(false);
        }
    }
}