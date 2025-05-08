/**
 * upload_batch.js
 * Funcionalidades para o formulário de upload em lote.
 * Versão: 1.0.0
 */

// Assumindo que 'Auth' está definido globalmente (auth.js)
// Assumindo que 'showNotification' está definido globalmente (scripts.js)

document.addEventListener('DOMContentLoaded', function() {
    const batchForm = document.getElementById('batchUploadForm');
    const batchFileInput = document.getElementById('arquivos_xml_batch');
    const batchFileInfo = document.getElementById('fileInfoBatch');
    const batchClearBtn = document.getElementById('btnClearBatch');
    const batchSubmitBtn = document.getElementById('btnSubmitBatch');
    const batchProgressBar = document.querySelector('#batchProgress .progress-bar');
    const batchProgressContainer = document.getElementById('batchProgress');
    const batchErrorAlert = document.getElementById('batchError');
    const batchErrorMessage = document.getElementById('batchErrorMessage');
    const batchSuccessAlert = document.getElementById('batchSuccess');
    const batchSuccessMessage = document.getElementById('batchSuccessMessage');
    const batchResultSummary = document.getElementById('batchResultSummary');
    const batchResultDetails = document.getElementById('batchResultDetails');

    // --- Event Listeners ---

    // Listener do Formulário de Lote
    if (batchForm) {
        batchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log("Batch form submit intercepted.");
            submitBatchUpload();
        });
    } else {
        console.error("Formulário batchUploadForm não encontrado.");
    }

    // Listener de mudança no Input de Arquivo de Lote
    if (batchFileInput) {
        batchFileInput.addEventListener('change', handleBatchFilesSelect);
    }

    // Listener do Botão Limpar Lote
    if (batchClearBtn) {
        batchClearBtn.addEventListener('click', clearBatchSelection);
    }

    // --- Funções ---

    // Lida com a seleção de arquivos (incluindo drag & drop se implementado no futuro)
    function handleBatchFilesSelect(event) {
        const files = event.target.files;
        displayBatchFileInfo(files);
    }

    // Mostra informações dos arquivos selecionados
    function displayBatchFileInfo(files) {
        if (!batchFileInfo) return;
        if (!files || files.length === 0) {
            batchFileInfo.innerHTML = '';
            return;
        }
        let fileNames = Array.from(files).map(file => escapeHtml(file.name)).join(', ');
        if (files.length > 5) { // Limita a exibição para não ficar muito longo
             fileNames = Array.from(files).slice(0, 5).map(file => escapeHtml(file.name)).join(', ') + `... (+${files.length - 5})`;
        }
        batchFileInfo.innerHTML = `<strong>${files.length} arquivo(s) selecionado(s):</strong> ${fileNames}`;
    }

    // Limpa a seleção de arquivos do lote
    function clearBatchSelection() {
        if (batchFileInput) {
            batchFileInput.value = ''; // Limpa o input
        }
        if (batchFileInfo) {
            batchFileInfo.innerHTML = ''; // Limpa a info
        }
        // Opcional: Esconder mensagens de resultado anteriores
        hideBatchMessages();
        if (batchResultSummary) batchResultSummary.innerHTML = '';
        if (batchResultDetails) batchResultDetails.innerHTML = '';
    }

    // Envia os arquivos em lote
    function submitBatchUpload() {
        if (!batchFileInput || !batchFileInput.files || batchFileInput.files.length === 0) {
            showBatchError('Selecione um ou mais arquivos XML para enviar em lote.');
            return;
        }

        // --- Feedback de Carregamento ---
        if (batchSubmitBtn) {
            batchSubmitBtn.disabled = true;
            batchSubmitBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Enviando Lote...
            `;
        }
        hideBatchMessages();
        if(batchResultSummary) batchResultSummary.innerHTML = '';
        if(batchResultDetails) batchResultDetails.innerHTML = '';
        if (batchProgressContainer && batchProgressBar) {
            batchProgressContainer.classList.remove('d-none');
            batchProgressBar.style.width = '0%';
            batchProgressBar.textContent = '0%';
            batchProgressBar.setAttribute('aria-valuenow', 0);
            batchProgressBar.classList.remove('bg-success', 'bg-danger');
            batchProgressBar.classList.add('progress-bar-animated');
        }
        // ---------------------------------

        // Preparar FormData
        const formData = new FormData();
        const files = batchFileInput.files;
        for (let i = 0; i < files.length; i++) {
            // Importante: Usar o mesmo nome de campo ('arquivos_xml') para cada arquivo
            formData.append('arquivos_xml', files[i]);
        }

        // Simulação de Progresso (Simplificada para lote)
        let progress = 0;
        let progressIntervalBatch = null;
        if (batchProgressBar) {
             progressIntervalBatch = setInterval(() => {
                progress += 10; // Incremento maior para lote
                const displayProgress = Math.min(progress, 95);
                batchProgressBar.style.width = `${displayProgress}%`;
                batchProgressBar.textContent = `${displayProgress}%`;
                batchProgressBar.setAttribute('aria-valuenow', displayProgress);
                 if (progress >= 100) {
                     clearInterval(progressIntervalBatch);
                 }
            }, 200);
        }

        // Enviar para a API de Lote
        Auth.fetchWithAuth('/api/upload/batch/', { // Endpoint de Lote
            method: 'POST',
            body: formData
        })
        .then(response => {
            clearInterval(progressIntervalBatch);
            if (batchProgressBar) {
                batchProgressBar.style.width = '100%';
                batchProgressBar.textContent = '100%';
                batchProgressBar.setAttribute('aria-valuenow', 100);
                batchProgressBar.classList.remove('progress-bar-animated');
            }
            // Trata a resposta, mesmo que não seja 'ok', para pegar detalhes do erro
            return response.json().then(data => ({ ok: response.ok, status: response.status, data }));
        })
        .then(({ ok, status, data }) => {
            if (!ok) {
                 // Se a requisição falhou (ex: 400, 500)
                 throw data; // Lança os dados do erro para o catch
            }

            // --- Sucesso (Requisição foi aceita, pode haver erros individuais) ---
            if (batchProgressBar) batchProgressBar.classList.add('bg-success');

            const successCount = data.sucesso || 0;
            const errorCount = data.erros || 0;
            const totalCount = successCount + errorCount;

            // Exibir resumo
            if (batchResultSummary) {
                batchResultSummary.innerHTML = `<strong>Processamento Concluído:</strong> ${successCount} sucesso(s), ${errorCount} erro(s) de ${totalCount} arquivo(s).`;
            }

            // Exibir detalhes
            if (batchResultDetails && data.resultados_detalhados) {
                let detailsHtml = '<ul class="list-group list-group-flush">';
                data.resultados_detalhados.forEach(res => {
                    const icon = res.status === 'sucesso' ? 'fa-check-circle text-success' : 'fa-times-circle text-danger';
                    const message = res.status === 'sucesso' ? `OK ${res.chave ? `(${formatChave(res.chave)})` : ''}` : `Erro: ${res.erro}`;
                     detailsHtml += `
                        <li class="list-group-item list-group-item-sm d-flex justify-content-between align-items-center small py-1">
                             <span><i class="fas ${icon} me-2"></i>${escapeHtml(res.arquivo)}</span>
                             <span class="text-muted">${message}</span>
                        </li>
                    `;
                });
                detailsHtml += '</ul>';
                batchResultDetails.innerHTML = detailsHtml;
            }

            // Mostrar mensagem geral (pode ser adaptada)
             if (errorCount > 0) {
                 showBatchWarning(`Processamento concluído com ${errorCount} erro(s). Verifique os detalhes abaixo.`);
             } else {
                 showBatchSuccess(`Lote de ${successCount} arquivo(s) processado com sucesso.`);
             }

            clearBatchSelection(); // Limpa seleção após processar
            loadUploadHistory(); // Atualiza histórico geral

            setTimeout(() => {
                batchProgressContainer?.classList.add('d-none');
                batchProgressBar?.classList.remove('bg-success');
            }, 3000);
            // ----------------
        })
        .catch(error => {
            // --- Erro na Requisição ou Parsing ---
            if (progressIntervalBatch) clearInterval(progressIntervalBatch);
            console.error('Erro detalhado no upload em lote:', error);
            if (batchProgressBar) {
                batchProgressBar.style.width = '100%';
                batchProgressBar.textContent = 'Erro!';
                batchProgressBar.classList.remove('progress-bar-animated');
                batchProgressBar.classList.add('bg-danger');
            }

            let detailedMessage = 'Erro geral ao enviar o lote. Verifique a conexão e tente novamente.';
            // Tenta extrair mensagens de erro do DRF
             if (error && error.detail) {
                 detailedMessage = error.detail;
             } else if (error && typeof error === 'object' && !error.message && error.statusCode !== 500) {
                 detailedMessage = Object.entries(error)
                    .filter(([key]) => key !== 'statusCode')
                    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                    .join('; ');
                detailedMessage = `Erro de validação: ${detailedMessage}`;
            } else if (error && error.message) {
                 detailedMessage = error.message;
            }

            showBatchError(detailedMessage);

            setTimeout(() => {
                batchProgressContainer?.classList.add('d-none');
                batchProgressBar?.classList.remove('bg-danger');
            }, 5000);
            // ---------------
        })
        .finally(() => {
            // --- Sempre Executa ---
            if (batchSubmitBtn) {
                batchSubmitBtn.disabled = false;
                batchSubmitBtn.innerHTML = `
                    <i class="fas fa-boxes me-2"></i>Enviar Arquivos em Lote
                `;
            }
            // ---------------------
        });
    }

    // Funções específicas para feedback do lote
    function showBatchSuccess(message) {
        if (batchSuccessAlert && batchSuccessMessage) {
            batchSuccessMessage.textContent = message;
            batchSuccessAlert.classList.remove('d-none');
            hideBatchMessages('batchError', 'batchWarning');
        } else if (typeof showNotification === 'function') {
            showNotification(message, 'success');
        }
    }

    function showBatchError(message) {
         if (batchErrorAlert && batchErrorMessage) {
            batchErrorMessage.textContent = message;
            batchErrorAlert.classList.remove('d-none');
            hideBatchMessages('batchSuccess', 'batchWarning');
        } else if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        }
    }

    // Adicionando uma função para warning (caso haja erros parciais no lote)
    function showBatchWarning(message) {
         // Pode usar o mesmo alert de erro ou criar um específico
         if (batchErrorAlert && batchErrorMessage) {
            batchErrorMessage.textContent = message;
            batchErrorAlert.classList.remove('alert-danger'); // Remove a classe de erro
            batchErrorAlert.classList.add('alert-warning'); // Adiciona a classe de aviso
            batchErrorAlert.classList.remove('d-none');
            hideBatchMessages('batchSuccess'); // Esconde sucesso
        } else if (typeof showNotification === 'function') {
            showNotification(message, 'warning');
        }
    }

    function hideBatchMessages(...alertsToHide) {
        if (alertsToHide.length === 0 || alertsToHide.includes('batchSuccess')) {
            batchSuccessAlert?.classList.add('d-none');
        }
        if (alertsToHide.length === 0 || alertsToHide.includes('batchError')) {
            batchErrorAlert?.classList.add('d-none');
             // Restaura a classe de erro caso tenha sido mudada para warning
            batchErrorAlert?.classList.remove('alert-warning');
            batchErrorAlert?.classList.add('alert-danger');
        }
         if (alertsToHide.length === 0 || alertsToHide.includes('batchWarning')) {
             // Se usou o alert de erro para warning, esconde ele também
            batchErrorAlert?.classList.add('d-none');
            batchErrorAlert?.classList.remove('alert-warning');
            batchErrorAlert?.classList.add('alert-danger');
        }
    }

    // Função de escape simples para nomes de arquivos
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }

     // Função auxiliar para formatar chave (pode estar em scripts.js)
     function formatChave(chave) {
         if (!chave || typeof chave !== 'string') return '--';
         if (chave.length === 44) {
             return `${chave.substring(0, 4)}...${chave.substring(40)}`;
         }
         return chave.length > 15 ? chave.substring(0, 12) + '...' : chave;
     }

});