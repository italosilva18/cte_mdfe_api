/**
 * configuracoes.js
 * Funções para gerenciar as configurações do sistema
 */

// Variáveis globais para guardar o ID do item sendo editado
let editandoFaixaId = null;
let editandoUsuarioId = null;

document.addEventListener('DOMContentLoaded', function() {
    // Carregar dados ao iniciar
    carregarConfiguracoesPerfil();
    carregarConfiguracoesEmpresa();
    carregarConfiguracoesParametros();
    carregarFaixasKM();
    carregarUsuarios();
    carregarListaBackups();

    // --- Event Listeners para Botões de Salvar ---
    document.getElementById('salvarPerfil')?.addEventListener('click', salvarConfiguracoesPerfil);
    document.getElementById('salvarEmpresa')?.addEventListener('click', salvarConfiguracoesEmpresa);
    document.getElementById('salvarParametros')?.addEventListener('click', salvarConfiguracoesParametros);
    document.getElementById('salvarFaixaKM')?.addEventListener('click', salvarFaixaKM);
    document.getElementById('salvarUsuario')?.addEventListener('click', salvarUsuario);

    // --- Event Listeners para Botões de Ação ---
    document.getElementById('gerarBackup')?.addEventListener('click', gerarBackup);
    document.getElementById('restaurarBackup')?.addEventListener('click', restaurarBackup);

    // --- Event Listeners para Modais ---
    // Resetar formulário e ID ao fechar modal de Faixa KM
    const addFaixaModalEl = document.getElementById('addFaixaKMModal');
    if (addFaixaModalEl) {
        addFaixaModalEl.addEventListener('hidden.bs.modal', function () {
            document.getElementById('faixaKMForm').reset();
            editandoFaixaId = null;
            document.getElementById('addFaixaKMLabel').textContent = 'Nova Faixa de KM';
        });
    }
    // Resetar formulário e ID ao fechar modal de Usuário
    const addUserModalEl = document.getElementById('addUserModal');
    if (addUserModalEl) {
        addUserModalEl.addEventListener('hidden.bs.modal', function () {
            document.getElementById('userForm').reset();
            document.getElementById('user_username').readOnly = false;
            editandoUsuarioId = null;
            document.getElementById('addUserLabel').textContent = 'Novo Usuário';
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
            document.getElementById('nome').value = `${data.first_name || ''} ${data.last_name || ''}`.trim();
            document.getElementById('username').value = data.username || '';
            document.getElementById('email').value = data.email || '';
            
            // Se tiver campo para cargo
            const cargoInput = document.getElementById('cargo');
            if(cargoInput) cargoInput.value = data.profile?.cargo || '';
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

    // Processamento do nome completo
    const nomeCompleto = document.getElementById('nome').value;
    const partesNome = nomeCompleto.split(' ');
    const firstName = partesNome[0] || '';
    const lastName = partesNome.slice(1).join(' ') || '';

    const dadosPerfil = {
        first_name: firstName,
        last_name: lastName,
        email: document.getElementById('email').value,
    };

    const senhaAtual = document.getElementById('senha_atual').value;
    const novaSenha = document.getElementById('nova_senha').value;
    const confirmaSenha = document.getElementById('confirma_senha').value;

    if (novaSenha) {
        // Validação da nova senha
        if (novaSenha !== confirmaSenha) {
            showNotification('As novas senhas não coincidem.', 'warning');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar Alterações';
            return;
        }
        dadosPerfil.password = novaSenha;
    }

    Auth.fetchWithAuth('/api/users/me/', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dadosPerfil)
    })
    .then(async response => {
        if (response.ok) {
            // Atualiza dados no localStorage
            fetchUserInfo();
            
            showNotification('Perfil atualizado com sucesso!', 'success');
            document.getElementById('senha_atual').value = '';
            document.getElementById('nova_senha').value = '';
            document.getElementById('confirma_senha').value = '';
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
    // Endpoint não implementado no backend
    console.warn("Funcionalidade 'Dados da Empresa' pendente de implementação no backend.");
    
    // Simulação de dados para o formulário
    document.getElementById('razao_social').value = 'Destack Transportes LTDA';
    document.getElementById('nome_fantasia').value = 'Destack Transportes';
    document.getElementById('cnpj').value = '12.345.678/0001-90';
    document.getElementById('ie').value = '123456789';
    document.getElementById('telefone').value = '(11) 95555-5555';
    document.getElementById('email_empresa').value = 'contato@destacktransportes.com.br';
    document.getElementById('endereco').value = 'Av. Principal';
    document.getElementById('numero').value = '1000';
    document.getElementById('complemento').value = 'Sala 101';
    document.getElementById('bairro').value = 'Centro';
    document.getElementById('cep').value = '01000-000';
    document.getElementById('cidade').value = 'São Paulo';
    document.getElementById('uf').value = 'SP';
}

function salvarConfiguracoesEmpresa() {
    // Implementação futura - backend não tem endpoint
    showNotification("Funcionalidade 'Salvar Empresa' ainda não implementada no backend.", 'info');
}

// ============================
// === Parâmetros do Sistema ===
// ============================
function carregarConfiguracoesParametros() {
    // Endpoint não implementado no backend
    console.warn("Funcionalidade 'Parâmetros do Sistema' pendente de implementação no backend.");
    
    // Simulação de valores padrão
    document.getElementById('dias_alerta').value = 3;
    document.getElementById('percentual_padrao').value = 25.00;
    document.getElementById('periodo_manutencao').value = 90;
    document.getElementById('km_manutencao').value = 10000;
    document.getElementById('auto_cancelamento').checked = false;
    document.getElementById('alerta_email').checked = false;
}

function salvarConfiguracoesParametros() {
    // Implementação futura - backend não tem endpoint
    showNotification("Funcionalidade 'Salvar Parâmetros' ainda não implementada no backend.", 'info');
}

// ============================
// === Faixas de KM ===
// ============================
function carregarFaixasKM() {
    const faixasContainer = document.getElementById('faixas-list');
    if (!faixasContainer) return;
    
    faixasContainer.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

    Auth.fetchWithAuth('/api/faixas-km/')
        .then(response => {
            if (!response.ok) throw new Error('Falha ao carregar faixas de KM');
            return response.json();
        })
        .then(data => {
             const faixas = data.results || data;
             faixasContainer.innerHTML = '';

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
    const maxKm = form.max_km.value;
    const valorPago = form.valor_pago.value;

    if (!minKm || !valorPago) {
        showNotification('KM Mínimo e Valor são obrigatórios.', 'warning');
        return;
    }

    const dados = {
        min_km: parseInt(minKm),
        max_km: maxKm ? parseInt(maxKm) : null,
        valor_pago: parseFloat(valorPago).toFixed(2)
    };

    let url = '/api/faixas-km/';
    let method = 'POST';

    if (editandoFaixaId) {
        url += `${editandoFaixaId}/`;
        method = 'PUT';
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
            carregarFaixasKM();
            bootstrap.Modal.getInstance(document.getElementById('addFaixaKMModal')).hide();
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
         editandoFaixaId = null;
    });
}

function editarFaixaKM(faixaId) {
    editandoFaixaId = faixaId;
    const modalElement = document.getElementById('addFaixaKMModal');
    const modalTitle = document.getElementById('addFaixaKMLabel');
    const form = document.getElementById('faixaKMForm');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modalTitle.textContent = 'Editar Faixa de KM';

    Auth.fetchWithAuth(`/api/faixas-km/${faixaId}/`)
        .then(response => {
            if (!response.ok) throw new Error('Falha ao buscar dados da faixa');
            return response.json();
        })
        .then(data => {
            form.min_km.value = data.min_km;
            form.max_km.value = data.max_km || '';
            form.valor_pago.value = parseFloat(data.valor_pago).toFixed(2);
            modal.show();
        })
        .catch(error => {
            console.error(`Erro ao carregar faixa ${faixaId}:`, error);
            showNotification(`Erro ao carregar dados da faixa para edição: ${error.message}`, 'error');
            editandoFaixaId = null;
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
        if (response.ok || response.status === 204) {
            showNotification('Faixa de KM excluída com sucesso!', 'success');
            const row = document.getElementById(`faixa-row-${faixaId}`);
            if (row) row.remove();
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
    if (!usuariosContainer) return;
    
    usuariosContainer.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';

    Auth.fetchWithAuth('/api/usuarios/')
        .then(response => {
             if (!response.ok) throw new Error('Falha ao carregar usuários');
             return response.json();
        })
        .then(data => {
            const usuarios = data.results || data;
            usuariosContainer.innerHTML = '';

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
    const nomeCompleto = form.user_nome.value;
    const partesNome = nomeCompleto.split(' ');
    const firstName = partesNome[0] || '';
    const lastName = partesNome.slice(1).join(' ') || '';
    
    const dados = {
        username: form.user_username.value,
        first_name: firstName,
        last_name: lastName,
        email: form.user_email.value,
        is_active: form.user_ativo.checked,
        is_staff: ['admin', 'gerente', 'operador'].includes(form.user_tipo.value),
        is_superuser: form.user_tipo.value === 'admin'
    };

    const password = form.user_senha.value;
    if (password || !editandoUsuarioId) {
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
        method = 'PUT';
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
            carregarUsuarios();
            bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
        } else {
            const errorData = await response.json();
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
        editandoUsuarioId = null;
    });
}

function editarUsuario(usuarioId) {
    editandoUsuarioId = usuarioId;
    const modalElement = document.getElementById('addUserModal');
    const modalTitle = document.getElementById('addUserLabel');
    const form = document.getElementById('userForm');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modalTitle.textContent = 'Editar Usuário';
    form.user_senha.required = false;
    form.user_username.readOnly = true;

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
            else if (data.is_staff) form.user_tipo.value = 'operador';
            else form.user_tipo.value = 'consulta';

            form.user_senha.value = '';
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
    // Verificar se é o próprio usuário
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

    Auth.fetchWithAuth('/api/backup/gerar/', {
        method: 'POST',
    })
    .then(async response => {
        if (response.ok) {
            // Pega o nome do arquivo do header Content-Disposition
            const disposition = response.headers.get('content-disposition');
            let filename = 'backup.sql';
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
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showNotification('Download do backup iniciado!', 'success');
            carregarListaBackups();
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
    // Funcionalidade não implementada no backend
    showNotification('Funcionalidade de restauração de backup via interface não disponível.', 'info');
}

function carregarListaBackups() {
    // Esta funcionalidade depende de uma API para listar backups existentes
    const backupsContainer = document.getElementById('backups-list');
    if (!backupsContainer) return;
    
    backupsContainer.innerHTML = '<tr><td colspan="4" class="text-center">Funcionalidade de listar backups não implementada.</td></tr>';
    console.warn("Funcionalidade 'Listar Backups' pendente de implementação no backend.");
}

// ============================
// === Funções Auxiliares ===
// ============================

// Função auxiliar para formatar valores monetários
function formatCurrency(value) {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Função auxiliar para exibir notificações (usa a showNotification do scripts.js)
function showNotification(message, type = 'info') {
    // Verifica se a função global está disponível
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
    }
    
    // Implementação alternativa se a função global não estiver disponível
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Tenta implementar Toasts do Bootstrap
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        // Cria container se não existir
        const newContainer = document.createElement('div');
        newContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        newContainer.style.zIndex = '1080';
        document.body.appendChild(newContainer);
    }
    
    const container = document.querySelector('.toast-container');
    const toastId = 'toast-' + Date.now();
    
    // Mapeia o tipo para classe do Bootstrap
    const bgClass = {
        'success': 'bg-success',
        'error': 'bg-danger',
        'warning': 'bg-warning text-dark',
        'info': 'bg-info text-dark'
    }[type] || 'bg-secondary';
    
    const toastHTML = `
    <div id="${toastId}" class="toast ${bgClass} text-white" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>
    `;
    
    container.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, {
        delay: 5000
    });
    
    toast.show();
    
    // Remove o elemento quando oculto
    toastElement.addEventListener('hidden.bs.toast', function() {
        this.remove();
    });
}