/**
 * configuracoes.js
 * Lógica para a página de configurações
 */

// Variáveis globais para guardar o ID do item sendo editado
let editandoFaixaId = null;
let editandoUsuarioId = null;

document.addEventListener('DOMContentLoaded', function() {
    // Carregar dados ao iniciar
    carregarConfiguracoesPerfil();
    // carregarConfiguracoesEmpresa(); // Comentado - API não existe
    // carregarConfiguracoesParametros(); // Comentado - API não existe
    carregarFaixasKM();
    carregarUsuarios();
    carregarListaBackups(); // Adicionado para carregar a lista

    // --- Event Listeners para Botões de Salvar ---
    document.getElementById('salvarPerfil')?.addEventListener('click', salvarConfiguracoesPerfil);
    // document.getElementById('salvarEmpresa')?.addEventListener('click', salvarConfiguracoesEmpresa); // Comentado
    // document.getElementById('salvarParametros')?.addEventListener('click', salvarConfiguracoesParametros); // Comentado
    document.getElementById('salvarFaixaKM')?.addEventListener('click', salvarFaixaKM); // Lida com criar/editar
    document.getElementById('salvarUsuario')?.addEventListener('click', salvarUsuario); // Lida com criar/editar

    // --- Event Listeners para Botões de Ação ---
    document.getElementById('gerarBackup')?.addEventListener('click', gerarBackup);
    // document.getElementById('restaurarBackup')?.addEventListener('click', restaurarBackup); // Comentado - API não existe

    // --- Event Listeners para Modais ---
    // Resetar formulário e ID ao fechar modal de Faixa KM
    const addFaixaModalEl = document.getElementById('addFaixaKMModal');
    if (addFaixaModalEl) {
        addFaixaModalEl.addEventListener('hidden.bs.modal', function () {
            document.getElementById('faixaKMForm').reset();
            editandoFaixaId = null;
            document.getElementById('addFaixaKMLabel').textContent = 'Nova Faixa de KM'; // Reseta título
        });
    }
    // Resetar formulário e ID ao fechar modal de Usuário
    const addUserModalEl = document.getElementById('addUserModal');
    if (addUserModalEl) {
        addUserModalEl.addEventListener('hidden.bs.modal', function () {
            document.getElementById('userForm').reset();
            document.getElementById('user_username').readOnly = false; // Permite editar username ao criar
            editandoUsuarioId = null;
            document.getElementById('addUserLabel').textContent = 'Novo Usuário'; // Reseta título
        });
    }
});

// ============================
// === Perfil do Usuário ===
// ============================
function carregarConfiguracoesPerfil() {
    // Usar endpoint correto /api/users/me/
    Auth.fetchWithAuth('/api/users/me/')
        .then(response => {
            if (!response.ok) throw new Error('Falha ao carregar perfil');
            return response.json();
        })
        .then(data => {
            // Ajustar IDs para corresponder ao HTML (verificar HTML depois)
            document.getElementById('user_first_name').value = data.first_name || ''; // Assumindo que ID no HTML é user_first_name
            document.getElementById('user_last_name').value = data.last_name || ''; // Assumindo que ID no HTML é user_last_name
            document.getElementById('user_email').value = data.email || '';
            document.getElementById('user_username').value = data.username || ''; // Manter readonly no HTML
            // Remover campo 'cargo' se não existir no modelo User/Profile
            // const cargoInput = document.getElementById('cargo');
            // if(cargoInput) cargoInput.value = data.profile?.cargo || '';
        })
        .catch(error => {
            console.error('Erro ao carregar configurações do perfil:', error);
            showNotification(`Erro ao carregar perfil: ${error.message}`, 'error');
        });
}

function salvarConfiguracoesPerfil() {
    const btn = document.getElementById('salvarPerfil');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';

    const dadosPerfil = {
        first_name: document.getElementById('user_first_name').value,
        last_name: document.getElementById('user_last_name').value,
        email: document.getElementById('user_email').value,
    };

    const novaSenha = document.getElementById('user_nova_senha').value; // Assumindo ID user_nova_senha
    const confirmaSenha = document.getElementById('user_confirma_senha').value; // Assumindo ID user_confirma_senha

    if (novaSenha) {
        if (novaSenha !== confirmaSenha) {
            showNotification('As novas senhas não coincidem.', 'warning');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar Alterações';
            return;
        }
        dadosPerfil.password = novaSenha;
        // password_confirm não precisa ser enviado se a validação já foi feita
    }

    Auth.fetchWithAuth('/api/users/me/', {
        method: 'PATCH', // Usar PATCH para atualização parcial
        headers: {
            'Content-Type': 'application/json', // Enviar como JSON
        },
        body: JSON.stringify(dadosPerfil) // Converter para JSON
    })
    .then(async response => {
        if (response.ok) {
            showNotification('Perfil atualizado com sucesso!', 'success');
            // Limpar campos de senha após sucesso
            document.getElementById('user_nova_senha').value = '';
            document.getElementById('user_confirma_senha').value = '';
        } else {
            const errorData = await response.json();
            const errorMessage = Object.values(errorData).flat().join(' ') || 'Erro desconhecido.';
            throw new Error(`Falha ao salvar perfil: ${errorMessage}`);
        }
    })
    .catch(error => {
        console.error('Erro ao salvar configurações do perfil:', error);
        showNotification(error.message, 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar Alterações';
    });
}


// ============================
// === Dados da Empresa ===
// ============================
function carregarConfiguracoesEmpresa() {
    console.warn("Funcionalidade 'Dados da Empresa' pendente de implementação no backend.");
    // fetch('/api/configuracoes/empresa/', { ... }) // Comentado - API não existe
}

function salvarConfiguracoesEmpresa() {
    console.warn("Funcionalidade 'Dados da Empresa' pendente de implementação no backend.");
    showNotification("Funcionalidade 'Salvar Empresa' ainda não implementada.", 'info');
    // fetch('/api/configuracoes/empresa/', { ... }) // Comentado - API não existe
}


// ============================
// === Parâmetros do Sistema ===
// ============================
function carregarConfiguracoesParametros() {
    console.warn("Funcionalidade 'Parâmetros do Sistema' pendente de implementação no backend.");
    // fetch('/api/configuracoes/parametros/', { ... }) // Comentado - API não existe
    // Simulação de valores padrão
    document.getElementById('dias_alerta').value = 3;
    document.getElementById('percentual_padrao').value = 25.00;
    document.getElementById('periodo_manutencao').value = 90;
    document.getElementById('km_manutencao').value = 10000;
    document.getElementById('auto_cancelamento').checked = false;
    document.getElementById('alerta_email').checked = false;
}

function salvarConfiguracoesParametros() {
    console.warn("Funcionalidade 'Parâmetros do Sistema' pendente de implementação no backend.");
     showNotification("Funcionalidade 'Salvar Parâmetros' ainda não implementada.", 'info');
    // fetch('/api/configuracoes/parametros/', { ... }) // Comentado - API não existe
}


// ============================
// === Faixas de KM ===
// ============================
function carregarFaixasKM() {
    const faixasContainer = document.getElementById('faixas-list');
    faixasContainer.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>'; // Loading

    Auth.fetchWithAuth('/api/faixas-km/') // Endpoint correto
        .then(response => {
            if (!response.ok) throw new Error('Falha ao carregar faixas de KM');
            return response.json();
        })
        .then(data => { // DRF paginação: data.results
             const faixas = data.results || data; // Acomoda com ou sem paginação
             faixasContainer.innerHTML = ''; // Limpa loading/anterior

             if (faixas.length === 0) {
                 faixasContainer.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma faixa cadastrada.</td></tr>';
                 return;
             }

             faixas.forEach(faixa => {
                const row = `
                    <tr id="faixa-row-${faixa.id}">
                        <td>${faixa.min_km}</td>
                        <td>${faixa.max_km !== null ? faixa.max_km : 'Sem limite'}</td>
                        <td>${formatCurrency(faixa.valor_pago)}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="editarFaixaKM(${faixa.id})">
                                <i class="fas fa-edit"></i> <span class="d-none d-md-inline">Editar</span>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="excluirFaixaKM(${faixa.id})">
                                <i class="fas fa-trash"></i> <span class="d-none d-md-inline">Excluir</span>
                            </button>
                        </td>
                    </tr>
                `;
                faixasContainer.insertAdjacentHTML('beforeend', row);
            });
        })
        .catch(error => {
            console.error('Erro ao carregar faixas de KM:', error);
            faixasContainer.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar faixas.</td></tr>';
            showNotification(`Erro ao carregar faixas de KM: ${error.message}`, 'error');
        });
}

function salvarFaixaKM() {
    const form = document.getElementById('faixaKMForm');
    const minKm = form.min_km.value;
    const maxKm = form.max_km.value; // Pode ser vazio
    const valorPago = form.valor_pago.value;

    if (!minKm || !valorPago) {
        showNotification('KM Mínimo e Valor são obrigatórios.', 'warning');
        return;
    }

    const dados = {
        min_km: parseInt(minKm),
        max_km: maxKm ? parseInt(maxKm) : null, // Envia null se vazio
        valor_pago: parseFloat(valorPago).toFixed(2)
    };

    let url = '/api/faixas-km/';
    let method = 'POST';

    if (editandoFaixaId) {
        url += `${editandoFaixaId}/`;
        method = 'PUT'; // Ou PATCH se o backend suportar atualização parcial
    }

    const btn = document.getElementById('salvarFaixaKM');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';

    Auth.fetchWithAuth(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dados)
    })
    .then(async response => {
        if (response.ok) {
            showNotification(`Faixa de KM ${editandoFaixaId ? 'atualizada' : 'salva'} com sucesso!`, 'success');
            carregarFaixasKM(); // Recarrega a lista
            bootstrap.Modal.getInstance(document.getElementById('addFaixaKMModal')).hide(); // Fecha o modal
        } else {
             const errorData = await response.json();
             const errorMessage = Object.values(errorData).flat().join(' ') || 'Erro desconhecido.';
             throw new Error(`Erro ao salvar Faixa KM: ${errorMessage}`);
        }
    })
    .catch(error => {
        console.error('Erro ao salvar faixa de KM:', error);
        showNotification(error.message, 'error');
    })
    .finally(() => {
         btn.disabled = false;
         btn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar';
         editandoFaixaId = null; // Limpa ID de edição
    });
}

function editarFaixaKM(faixaId) {
    editandoFaixaId = faixaId; // Guarda o ID
    const modalElement = document.getElementById('addFaixaKMModal');
    const modalTitle = document.getElementById('addFaixaKMLabel');
    const form = document.getElementById('faixaKMForm');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modalTitle.textContent = 'Editar Faixa de KM'; // Muda título do modal

    // Busca os dados da faixa específica
    Auth.fetchWithAuth(`/api/faixas-km/${faixaId}/`)
        .then(response => {
            if (!response.ok) throw new Error('Falha ao buscar dados da faixa');
            return response.json();
        })
        .then(data => {
            // Preenche o formulário no modal
            form.min_km.value = data.min_km;
            form.max_km.value = data.max_km || ''; // Usa string vazia se for null
            form.valor_pago.value = parseFloat(data.valor_pago).toFixed(2);
            modal.show(); // Abre o modal
        })
        .catch(error => {
            console.error(`Erro ao carregar faixa ${faixaId}:`, error);
            showNotification(`Erro ao carregar dados da faixa para edição: ${error.message}`, 'error');
            editandoFaixaId = null; // Limpa ID se deu erro
        });
}

function excluirFaixaKM(faixaId) {
    if (!confirm('Tem certeza que deseja excluir esta faixa de KM?')) {
        return;
    }

    Auth.fetchWithAuth(`/api/faixas-km/${faixaId}/`, {
        method: 'DELETE',
    })
    .then(response => {
        if (response.ok || response.status === 204) { // 204 No Content é sucesso para DELETE
            showNotification('Faixa de KM excluída com sucesso!', 'success');
            // Remove a linha da tabela visualmente ou recarrega a lista
            const row = document.getElementById(`faixa-row-${faixaId}`);
            if (row) row.remove();
             // ou carregarFaixasKM();
        } else {
            throw new Error(`Erro ${response.status} ao excluir a faixa de KM.`);
        }
    })
    .catch(error => {
        console.error('Erro ao excluir faixa de KM:', error);
        showNotification(`Erro ao excluir a faixa de KM: ${error.message}`, 'error');
    });
}

// ============================
// === Usuários ===
// ============================
function carregarUsuarios() {
    const usuariosContainer = document.getElementById('usuarios-list');
    usuariosContainer.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>'; // Loading

    Auth.fetchWithAuth('/api/usuarios/') // Endpoint correto
        .then(response => {
             if (!response.ok) throw new Error('Falha ao carregar usuários');
             return response.json();
        })
        .then(data => { // DRF paginação: data.results
            const usuarios = data.results || data; // Acomoda com ou sem paginação
            usuariosContainer.innerHTML = ''; // Limpa loading/anterior

             if (usuarios.length === 0) {
                 usuariosContainer.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum usuário cadastrado.</td></tr>';
                 return;
             }

            usuarios.forEach(usuario => {
                // Define tipo e status visualmente
                let tipoBadge = 'badge bg-secondary';
                let tipoTexto = 'Consulta';
                if (usuario.is_superuser) { tipoBadge = 'badge bg-danger'; tipoTexto = 'Admin'; }
                else if (usuario.is_staff) { tipoBadge = 'badge bg-warning text-dark'; tipoTexto = 'Gerente/Operador'; }

                const statusBadge = usuario.is_active ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>';

                const row = `
                    <tr id="user-row-${usuario.id}">
                        <td>${usuario.first_name || ''} ${usuario.last_name || ''}</td>
                        <td>${usuario.username}</td>
                        <td>${usuario.email || '-'}</td>
                        <td><span class="${tipoBadge}">${tipoTexto}</span></td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="editarUsuario(${usuario.id})">
                                <i class="fas fa-edit"></i> <span class="d-none d-md-inline">Editar</span>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="excluirUsuario(${usuario.id})">
                               <i class="fas fa-trash"></i> <span class="d-none d-md-inline">Excluir</span>
                            </button>
                        </td>
                    </tr>
                `;
                usuariosContainer.insertAdjacentHTML('beforeend', row);
            });
        })
        .catch(error => {
            console.error('Erro ao carregar usuários:', error);
            usuariosContainer.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar usuários.</td></tr>';
            showNotification(`Erro ao carregar usuários: ${error.message}`, 'error');
        });
}

function salvarUsuario() {
    const form = document.getElementById('userForm');
    const dados = {
        username: form.user_username.value,
        first_name: form.user_nome.value.split(' ')[0] || '', // Pega o primeiro nome
        last_name: form.user_nome.value.split(' ').slice(1).join(' ') || '', // Pega o resto como sobrenome
        email: form.user_email.value,
        is_active: form.user_ativo.checked,
        // Mapeia tipo para is_staff e is_superuser (simplificado)
        is_staff: ['admin', 'gerente', 'operador'].includes(form.user_tipo.value),
        is_superuser: form.user_tipo.value === 'admin'
    };

    const password = form.user_senha.value;
    if (password || !editandoUsuarioId) { // Senha obrigatória na criação
        if(!password && !editandoUsuarioId) {
            showNotification('Senha é obrigatória para criar um novo usuário.', 'warning');
            return;
        }
        if (password) dados.password = password;
    }

    let url = '/api/usuarios/';
    let method = 'POST';

    if (editandoUsuarioId) {
        url += `${editandoUsuarioId}/`;
        method = 'PUT'; // Ou PATCH
    }

    const btn = document.getElementById('salvarUsuario');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';

    Auth.fetchWithAuth(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dados)
    })
    .then(async response => {
        if (response.ok) {
            showNotification(`Usuário ${editandoUsuarioId ? 'atualizado' : 'salvo'} com sucesso!`, 'success');
            carregarUsuarios(); // Recarrega a lista
            bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide(); // Fecha o modal
        } else {
            const errorData = await response.json();
            // Formata erros (username, password, email, etc.)
            let errorMessage = "Erro ao salvar usuário:";
            for (const key in errorData) {
                errorMessage += `\n- ${key}: ${errorData[key].join(', ')}`;
            }
            throw new Error(errorMessage);
        }
    })
    .catch(error => {
        console.error('Erro ao salvar usuário:', error);
        showNotification(error.message, 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar';
        editandoUsuarioId = null; // Limpa ID
    });
}

function editarUsuario(usuarioId) {
    editandoUsuarioId = usuarioId;
    const modalElement = document.getElementById('addUserModal');
    const modalTitle = document.getElementById('addUserLabel');
    const form = document.getElementById('userForm');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modalTitle.textContent = 'Editar Usuário';
    form.user_senha.required = false; // Senha não é obrigatória na edição
    form.user_username.readOnly = true; // Não permitir editar username

    Auth.fetchWithAuth(`/api/usuarios/${usuarioId}/`)
        .then(response => {
            if (!response.ok) throw new Error('Falha ao buscar dados do usuário');
            return response.json();
        })
        .then(data => {
            form.user_nome.value = `${data.first_name || ''} ${data.last_name || ''}`.trim();
            form.user_username.value = data.username;
            form.user_email.value = data.email || '';
            form.user_ativo.checked = data.is_active;
            // Define o tipo baseado em is_superuser e is_staff
            if (data.is_superuser) form.user_tipo.value = 'admin';
            else if (data.is_staff) form.user_tipo.value = 'operador'; // Ajuste se tiver mais tipos
            else form.user_tipo.value = 'consulta';

            form.user_senha.value = ''; // Limpa campo senha
            form.user_senha.placeholder = 'Deixe em branco para não alterar';

            modal.show();
        })
        .catch(error => {
            console.error(`Erro ao carregar usuário ${usuarioId}:`, error);
            showNotification(`Erro ao carregar dados do usuário para edição: ${error.message}`, 'error');
            editandoUsuarioId = null;
        });
}

function excluirUsuario(usuarioId) {
    // Evitar excluir o próprio usuário logado (necessário buscar ID do user logado)
    const currentUser = Auth.getUserData();
    if (currentUser && currentUser.id === usuarioId) {
        showNotification("Você não pode excluir seu próprio usuário.", "warning");
        return;
    }

    if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) {
        return;
    }

    Auth.fetchWithAuth(`/api/usuarios/${usuarioId}/`, {
        method: 'DELETE',
    })
    .then(response => {
        if (response.ok || response.status === 204) {
            showNotification('Usuário excluído com sucesso!', 'success');
            const row = document.getElementById(`user-row-${usuarioId}`);
            if (row) row.remove();
            // ou carregarUsuarios();
        } else {
            throw new Error(`Erro ${response.status} ao excluir o usuário.`);
        }
    })
    .catch(error => {
        console.error('Erro ao excluir usuário:', error);
        showNotification(`Erro ao excluir o usuário: ${error.message}`, 'error');
    });
}


// ============================
// === Backup ===
// ============================
function gerarBackup() {
    const btn = document.getElementById('gerarBackup');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Gerando...';

    Auth.fetchWithAuth('/api/backup/gerar/', { // Endpoint correto
        method: 'POST', // Método correto
    })
    .then(async response => {
        if (response.ok) {
            // Pega o nome do arquivo do header Content-Disposition, se disponível
            const disposition = response.headers.get('content-disposition');
            let filename = 'backup.sql'; // Default
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) {
                  filename = matches[1].replace(/['"]/g, '');
                }
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename; // Usa o nome do header ou default
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showNotification('Download do backup iniciado!', 'success');
            carregarListaBackups(); // Atualiza a lista
        } else {
            const errorData = await response.json();
            throw new Error(`Erro ao gerar o backup: ${errorData.detail || response.statusText}`);
        }
    })
    .catch(error => {
        console.error('Erro ao gerar backup:', error);
        showNotification(error.message, 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-database me-2"></i>Gerar Backup Agora';
    });
}

function restaurarBackup() {
     console.warn("Funcionalidade 'Restaurar Backup' via API não implementada no backend.");
     showNotification('Funcionalidade de restauração de backup via interface não disponível.', 'info');
    // const input = document.getElementById('arquivoBackup');
    // ... (lógica comentada pois API não existe) ...
}

function carregarListaBackups() {
    // Esta funcionalidade depende de uma API para listar backups existentes.
    // Como não criamos essa API, vamos apenas mostrar uma mensagem.
    const backupsContainer = document.getElementById('backups-list');
    backupsContainer.innerHTML = '<tr><td colspan="4" class="text-center">Funcionalidade de listar backups não implementada.</td></tr>';
    console.warn("Funcionalidade 'Listar Backups' pendente de implementação no backend.");
}

// ============================
// === Funções Auxiliares ===
// ============================

// Função auxiliar para formatar valores monetários (deve vir de scripts.js ou ser definida aqui)
function formatCurrency(value) {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Função auxiliar para exibir notificações (deve vir de scripts.js ou ser implementada aqui)
function showNotification(message, type = 'info') {
    // Implementação simples com alert, idealmente usar Toasts do Bootstrap
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(`[${type.toUpperCase()}] ${message}`); // Substituir por Toasts

    // Exemplo com Toasts (requer container no HTML e inicialização do Bootstrap)
    /*
    const toastContainer = document.getElementById('toastContainer'); // Precisa existir no base.html ou configuracoes.html
    if (!toastContainer) return;

    const toastId = 'toast-' + Date.now();
    const bgClass = {
        success: 'bg-success',
        error: 'bg-danger',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-dark'
    }[type] || 'bg-secondary';

    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>`;
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    */
}