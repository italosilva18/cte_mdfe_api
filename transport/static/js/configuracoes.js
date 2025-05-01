document.addEventListener('DOMContentLoaded', function() {
    // Carregar configurações ao carregar a página
    carregarConfiguracoesPerfil();
    carregarConfiguracoesEmpresa();
    carregarConfiguracoesParametros();
    carregarFaixasKM();
    carregarUsuarios();

    // Adicionar event listeners aos botões de salvar
    document.getElementById('salvarPerfil').addEventListener('click', salvarConfiguracoesPerfil);
    document.getElementById('salvarEmpresa').addEventListener('click', salvarConfiguracoesEmpresa);
    document.getElementById('salvarParametros').addEventListener('click', salvarConfiguracoesParametros);
    document.getElementById('salvarFaixaKM').addEventListener('click', salvarFaixaKM);
    document.getElementById('salvarUsuario').addEventListener('click', salvarUsuario);

    // Adicionar event listener ao botão de gerar backup
    document.getElementById('gerarBackup').addEventListener('click', gerarBackup);

    // Adicionar event listener ao botão de restaurar backup
    document.getElementById('restaurarBackup').addEventListener('click', restaurarBackup);
});

// Configurações do Perfil
function carregarConfiguracoesPerfil() {
    fetch('/api/configuracoes/perfil/', {
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('nome').value = data.nome || '';
        document.getElementById('email').value = data.email || '';
        document.getElementById('cargo').value = data.cargo || '';
        // Preencher outros campos de perfil com os dados recebidos
    })
    .catch(error => {
        console.error('Erro ao carregar configurações do perfil:', error);
        showNotification('Erro ao carregar configurações do perfil.', 'error');
    });
}

function salvarConfiguracoesPerfil() {
    const form = document.getElementById('formPerfil');
    const dados = new FormData(form);

    fetch('/api/configuracoes/perfil/', {
        method: 'POST',
        body: dados,
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            showNotification('Configurações do perfil salvas com sucesso!', 'success');
        } else {
            showNotification('Erro ao salvar as configurações do perfil.', 'error');
        }
    })
    .catch(error => {
        console.error('Erro ao salvar configurações do perfil:', error);
        showNotification('Erro ao salvar as configurações do perfil.', 'error');
    });
}

// Configurações da Empresa
function carregarConfiguracoesEmpresa() {
    fetch('/api/configuracoes/empresa/', {
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('razao_social').value = data.razao_social || '';
        document.getElementById('nome_fantasia').value = data.nome_fantasia || '';
        document.getElementById('cnpj').value = data.cnpj || '';
        // Preencher outros campos de empresa com os dados recebidos
    })
    .catch(error => {
        console.error('Erro ao carregar configurações da empresa:', error);
        showNotification('Erro ao carregar configurações da empresa.', 'error');
    });
}

function salvarConfiguracoesEmpresa() {
    const form = document.getElementById('formEmpresa');
    const dados = new FormData(form);

    fetch('/api/configuracoes/empresa/', {
        method: 'POST',
        body: dados,
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            showNotification('Configurações da empresa salvas com sucesso!', 'success');
        } else {
            showNotification('Erro ao salvar as configurações da empresa.', 'error');
        }
    })
    .catch(error => {
        console.error('Erro ao salvar configurações da empresa:', error);
        showNotification('Erro ao salvar as configurações da empresa.', 'error');
    });
}

// Configurações de Parâmetros do Sistema
function carregarConfiguracoesParametros() {
    fetch('/api/configuracoes/parametros/', {
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('dias_alerta').value = data.dias_alerta || '';
        document.getElementById('percentual_padrao').value = data.percentual_padrao || '';
        document.getElementById('periodo_manutencao').value = data.periodo_manutencao || '';
        // Preencher outros campos de parâmetros com os dados recebidos
    })
    .catch(error => {
        console.error('Erro ao carregar configurações de parâmetros:', error);
        showNotification('Erro ao carregar configurações de parâmetros.', 'error');
    });
}

function salvarConfiguracoesParametros() {
    const form = document.getElementById('formParametros');
    const dados = new FormData(form);

    fetch('/api/configuracoes/parametros/', {
        method: 'POST',
        body: dados,
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            showNotification('Configurações de parâmetros salvas com sucesso!', 'success');
        } else {
            showNotification('Erro ao salvar as configurações de parâmetros.', 'error');
        }
    })
    .catch(error => {
        console.error('Erro ao salvar configurações de parâmetros:', error);
        showNotification('Erro ao salvar as configurações de parâmetros.', 'error');
    });
}

// Configurações de Faixas de KM
function carregarFaixasKM() {
    fetch('/api/faixas-km/', {
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => response.json())
    .then(data => {
        const faixasContainer = document.getElementById('faixas-list');
        faixasContainer.innerHTML = '';

        data.forEach(faixa => {
            const row = `
                <tr>
                    <td>${faixa.min_km}</td>
                    <td>${faixa.max_km || 'Sem limite'}</td>
                    <td>${formatCurrency(faixa.valor_pago)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="editarFaixaKM(${faixa.id})">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="excluirFaixaKM(${faixa.id})">Excluir</button>
                    </td>
                </tr>
            `;
            faixasContainer.insertAdjacentHTML('beforeend', row);
        });
    })
    .catch(error => {
        console.error('Erro ao carregar faixas de KM:', error);
        showNotification('Erro ao carregar faixas de KM.', 'error');
    });
}

function salvarFaixaKM() {
    const form = document.getElementById('faixaKMForm');
    const dados = new FormData(form);

    fetch('/api/faixas-km/', {
        method: 'POST',
        body: dados,
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            showNotification('Faixa de KM salva com sucesso!', 'success');
            carregarFaixasKM();
            form.reset();
            bootstrap.Modal.getInstance(document.getElementById('addFaixaKMModal')).hide();
        } else {
            showNotification('Erro ao salvar a faixa de KM.', 'error');
        }
    })
    .catch(error => {
        console.error('Erro ao salvar faixa de KM:', error);
        showNotification('Erro ao salvar a faixa de KM.', 'error');
    });
}

// Funções para editar e excluir faixas de KM (implementar conforme necessário)
function editarFaixaKM(faixaId) {
    // Lógica para editar a faixa de KM
}

function excluirFaixaKM(faixaId) {
    // Lógica para excluir a faixa de KM
}

// Configurações de Usuários
function carregarUsuarios() {
    fetch('/api/usuarios/', {
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => response.json())
    .then(data => {
        const usuariosContainer = document.getElementById('usuarios-list');
        usuariosContainer.innerHTML = '';

        data.forEach(usuario => {
            const row = `
                <tr>
                    <td>${usuario.nome}</td>
                    <td>${usuario.username}</td>
                    <td>${usuario.email}</td>
                    <td>${usuario.tipo}</td>
                    <td>${usuario.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="editarUsuario(${usuario.id})">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="excluirUsuario(${usuario.id})">Excluir</button>
                    </td>
                </tr>
            `;
            usuariosContainer.insertAdjacentHTML('beforeend', row);
        });
    })
    .catch(error => {
        console.error('Erro ao carregar usuários:', error);
        showNotification('Erro ao carregar usuários.', 'error');
    });
}

function salvarUsuario() {
    const form = document.getElementById('userForm');
    const dados = new FormData(form);

    fetch('/api/usuarios/', {
        method: 'POST',
        body: dados,
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            showNotification('Usuário salvo com sucesso!', 'success');
            carregarUsuarios();
            form.reset();
            bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
        } else {
            showNotification('Erro ao salvar o usuário.', 'error');
        }
    })
    .catch(error => {
        console.error('Erro ao salvar usuário:', error);
        showNotification('Erro ao salvar o usuário.', 'error');
    });
}

// Funções para editar e excluir usuários (implementar conforme necessário)
function editarUsuario(usuarioId) {
    // Lógica para editar o usuário
}

function excluirUsuario(usuarioId) {
    // Lógica para excluir o usuário
}

// Backup
function gerarBackup() {
    fetch('/api/backup/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        } else {
            throw new Error('Erro ao gerar o backup.');
        }
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'backup.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showNotification('Backup gerado com sucesso!', 'success');
    })
    .catch(error => {
        console.error('Erro ao gerar backup:', error);
        showNotification('Erro ao gerar o backup.', 'error');
    });
}

function restaurarBackup() {
    const input = document.getElementById('arquivoBackup');
    const arquivo = input.files[0];

    if (!arquivo) {
        showNotification('Selecione um arquivo de backup.', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('arquivo', arquivo);

    fetch('/api/backup/restaurar/', {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${Auth.getToken()}`
        }
    })
    .then(response => {
        if (response.ok) {
            showNotification('Backup restaurado com sucesso!', 'success');
            // Atualizar os dados na página, se necessário
        } else {
            showNotification('Erro ao restaurar o backup.', 'error');
        }
    })
    .catch(error => {
        console.error('Erro ao restaurar backup:', error);
        showNotification('Erro ao restaurar o backup.', 'error');
    });
}

// Função auxiliar para formatar valores monetários
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Função auxiliar para exibir notificações
function showNotification(message, type) {
    // Implementar a lógica para exibir notificações (toasts)
    // Você pode usar uma biblioteca como o Bootstrap Toast ou criar sua própria implementação
}