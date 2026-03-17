/**
 * Controle de Processos SEI — CBMMG
 * Aplicação web para gerenciamento de processos do SEI
 */

// ============================================================
// Data Layer
// ============================================================

const STORAGE_KEY = 'sei_processos_cbmmg';

function loadProcessos() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveProcessos(processos) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processos));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() {
    return new Date().toISOString();
}

// ============================================================
// State
// ============================================================

let processos = loadProcessos();
let currentSort = { field: 'prazo', asc: true };
let editingId = null;
let viewingId = null;

// ============================================================
// DOM References
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const tableBody = $('#table-body');
const emptyState = $('#empty-state');
const searchInput = $('#search-input');
const filterStatus = $('#filter-status');
const filterPrioridade = $('#filter-prioridade');
const filterMarcador = $('#filter-marcador');
const statsCards = $('#stats-cards');

// Modal elements
const modalOverlay = $('#modal-overlay');
const modalTitle = $('#modal-title');
const processForm = $('#process-form');

// Detail modal
const detailOverlay = $('#detail-overlay');
const detailContent = $('#detail-content');
const historyList = $('#history-list');

// Bookmarklet modal
const bookmarkletOverlay = $('#bookmarklet-overlay');

// ============================================================
// Rendering
// ============================================================

function renderStats() {
    const today = new Date().toISOString().split('T')[0];
    const active = processos.filter(p => !['concluido', 'arquivado'].includes(p.status));
    const pendentes = processos.filter(p => p.status === 'pendente').length;
    const emAndamento = processos.filter(p => p.status === 'em_andamento').length;
    const aguardando = processos.filter(p => p.status === 'aguardando').length;
    const concluidos = processos.filter(p => p.status === 'concluido').length;
    const urgentes = active.filter(p => p.prioridade === 'urgente').length;
    const vencidos = active.filter(p => p.prazo && p.prazo < today).length;

    statsCards.innerHTML = `
        <div class="stat-card total">
            <div class="stat-number">${processos.length}</div>
            <div class="stat-label">Total</div>
        </div>
        <div class="stat-card pendente">
            <div class="stat-number">${pendentes}</div>
            <div class="stat-label">Pendentes</div>
        </div>
        <div class="stat-card em_andamento">
            <div class="stat-number">${emAndamento}</div>
            <div class="stat-label">Em Andamento</div>
        </div>
        <div class="stat-card aguardando">
            <div class="stat-number">${aguardando}</div>
            <div class="stat-label">Aguardando</div>
        </div>
        <div class="stat-card concluido">
            <div class="stat-number">${concluidos}</div>
            <div class="stat-label">Concluídos</div>
        </div>
        ${urgentes > 0 ? `
        <div class="stat-card urgente">
            <div class="stat-number">${urgentes}</div>
            <div class="stat-label">Urgentes</div>
        </div>` : ''}
        ${vencidos > 0 ? `
        <div class="stat-card vencido">
            <div class="stat-number">${vencidos}</div>
            <div class="stat-label">Prazos Vencidos</div>
        </div>` : ''}
    `;
}

function renderMarcadoresFilter() {
    const marcadores = [...new Set(processos.map(p => p.marcador).filter(Boolean))].sort();
    const current = filterMarcador.value;
    filterMarcador.innerHTML = '<option value="">Todos os Marcadores</option>';
    marcadores.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        filterMarcador.appendChild(opt);
    });
    filterMarcador.value = current;

    // Also update datalist for form
    const datalist = $('#marcadores-list');
    if (datalist) {
        datalist.innerHTML = '';
        marcadores.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            datalist.appendChild(opt);
        });
    }
}

function getFilteredProcessos() {
    const search = searchInput.value.toLowerCase().trim();
    const status = filterStatus.value;
    const prioridade = filterPrioridade.value;
    const marcador = filterMarcador.value;

    let filtered = processos.filter(p => {
        if (status && p.status !== status) return false;
        if (prioridade && p.prioridade !== prioridade) return false;
        if (marcador && p.marcador !== marcador) return false;
        if (search) {
            const haystack = [
                p.numero, p.tipo, p.interessado, p.assunto,
                p.cpf_atribuido, p.unidade, p.marcador,
                p.anotacoes, p.observacoes
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    // Sort
    const { field, asc } = currentSort;
    filtered.sort((a, b) => {
        let va = (a[field] || '').toString().toLowerCase();
        let vb = (b[field] || '').toString().toLowerCase();
        if (field === 'prioridade') {
            const order = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
            va = order[a.prioridade] ?? 2;
            vb = order[b.prioridade] ?? 2;
        }
        if (va < vb) return asc ? -1 : 1;
        if (va > vb) return asc ? 1 : -1;
        return 0;
    });

    return filtered;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function prazoClass(prazo, status) {
    if (!prazo || ['concluido', 'arquivado'].includes(status)) return '';
    const today = new Date().toISOString().split('T')[0];
    if (prazo < today) return 'prazo-vencido';
    // within 3 days
    const diff = (new Date(prazo) - new Date(today)) / (1000 * 60 * 60 * 24);
    if (diff <= 3) return 'prazo-proximo';
    return '';
}

function statusLabel(s) {
    const map = {
        pendente: 'Pendente',
        em_andamento: 'Em Andamento',
        aguardando: 'Aguardando',
        concluido: 'Concluído',
        arquivado: 'Arquivado'
    };
    return map[s] || s;
}

function prioridadeLabel(p) {
    const map = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
    return map[p] || p;
}

function renderTable() {
    const filtered = getFilteredProcessos();
    const today = new Date().toISOString().split('T')[0];

    if (filtered.length === 0) {
        tableBody.innerHTML = '';
        emptyState.style.display = processos.length === 0 ? 'block' : 'block';
        emptyState.querySelector('p:last-child').textContent =
            processos.length === 0
                ? 'Clique em + Novo Processo ou use o bookmarklet para importar do SEI.'
                : 'Nenhum processo corresponde aos filtros aplicados.';
        return;
    }

    emptyState.style.display = 'none';

    tableBody.innerHTML = filtered.map(p => {
        const isVencido = p.prazo && p.prazo < today && !['concluido', 'arquivado'].includes(p.status);
        return `
        <tr data-id="${p.id}" class="${isVencido ? 'vencido' : ''}">
            <td><strong>${escapeHtml(p.numero)}</strong>${p.documentos && p.documentos.length > 0 ? ` <span class="doc-badge" title="${p.documentos.length} documento(s)">&#128196; ${p.documentos.length}</span>` : ''}</td>
            <td>${escapeHtml(p.tipo || '—')}</td>
            <td>${escapeHtml(p.interessado || '—')}</td>
            <td>${p.marcador ? `<span class="marcador-tag">${escapeHtml(p.marcador)}</span>` : '—'}</td>
            <td><span class="badge badge-${p.status}">${statusLabel(p.status)}</span></td>
            <td><span class="badge badge-${p.prioridade}">${prioridadeLabel(p.prioridade)}</span></td>
            <td class="${prazoClass(p.prazo, p.status)}">${formatDate(p.prazo)}</td>
            <td>${escapeHtml(p.cpf_atribuido || '—')}</td>
            <td class="actions-cell" onclick="event.stopPropagation()">
                <button class="btn-icon" onclick="editProcesso('${p.id}')" title="Editar">&#9998;</button>
                <button class="btn-icon" onclick="deleteProcesso('${p.id}')" title="Excluir">&#128465;</button>
            </td>
        </tr>`;
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function render() {
    renderStats();
    renderMarcadoresFilter();
    renderTable();
}

// ============================================================
// CRUD Operations
// ============================================================

function openModal(processo) {
    editingId = processo ? processo.id : null;
    modalTitle.textContent = processo ? 'Editar Processo' : 'Novo Processo';

    $('#f-numero').value = processo?.numero || '';
    $('#f-tipo').value = processo?.tipo || '';
    $('#f-interessado').value = processo?.interessado || '';
    $('#f-assunto').value = processo?.assunto || '';
    $('#f-cpf').value = processo?.cpf_atribuido || '';
    $('#f-unidade').value = processo?.unidade || '';
    $('#f-marcador').value = processo?.marcador || '';
    $('#f-prioridade').value = processo?.prioridade || 'normal';
    $('#f-status').value = processo?.status || 'pendente';
    $('#f-prazo').value = processo?.prazo || '';
    $('#f-anotacoes').value = processo?.anotacoes || '';
    $('#f-observacoes').value = processo?.observacoes || '';

    modalOverlay.style.display = 'flex';
    $('#f-numero').focus();
}

function closeModal() {
    modalOverlay.style.display = 'none';
    editingId = null;
    processForm.reset();
}

function saveProcesso(e) {
    e.preventDefault();

    const data = {
        numero: $('#f-numero').value.trim(),
        tipo: $('#f-tipo').value.trim(),
        interessado: $('#f-interessado').value.trim(),
        assunto: $('#f-assunto').value.trim(),
        cpf_atribuido: $('#f-cpf').value.trim(),
        unidade: $('#f-unidade').value.trim(),
        marcador: $('#f-marcador').value.trim(),
        prioridade: $('#f-prioridade').value,
        status: $('#f-status').value,
        prazo: $('#f-prazo').value || null,
        anotacoes: $('#f-anotacoes').value.trim(),
        observacoes: $('#f-observacoes').value.trim(),
    };

    if (editingId) {
        const idx = processos.findIndex(p => p.id === editingId);
        if (idx !== -1) {
            processos[idx] = { ...processos[idx], ...data, updated_at: now() };
            // Add to history if status changed
            const old = processos[idx];
            if (old.status !== data.status) {
                addHistoryEntry(editingId, `Status alterado para: ${statusLabel(data.status)}`);
            }
        }
    } else {
        const novo = {
            id: generateId(),
            ...data,
            documentos: [],
            historico: [],
            created_at: now(),
            updated_at: now()
        };
        novo.historico.push({
            data: now(),
            texto: 'Processo cadastrado no sistema'
        });
        processos.unshift(novo);
    }

    saveProcessos(processos);
    closeModal();
    render();
}

function editProcesso(id) {
    const p = processos.find(p => p.id === id);
    if (p) openModal(p);
}

function deleteProcesso(id) {
    const p = processos.find(p => p.id === id);
    if (!p) return;
    if (!confirm(`Excluir o processo ${p.numero}?`)) return;
    processos = processos.filter(p => p.id !== id);
    saveProcessos(processos);
    render();
}

// ============================================================
// Detail View
// ============================================================

function renderDocumentos(p) {
    const docs = p.documentos || [];
    if (docs.length === 0) return '';

    const docItems = docs.map(d => `
        <div class="doc-item">
            <span class="doc-icon">&#128196;</span>
            <div class="doc-info">
                <div class="doc-nome">${escapeHtml(d.nome)}</div>
                ${d.tipo ? `<span class="doc-tipo">${escapeHtml(d.tipo)}</span>` : ''}
                ${d.descricao ? `<div class="doc-descricao">${escapeHtml(d.descricao)}</div>` : ''}
            </div>
        </div>
    `).join('');

    return `
        <div class="detail-field full-width detail-documentos">
            <label>Documentos / Anexos (${docs.length})</label>
            <div class="doc-list">${docItems}</div>
        </div>
    `;
}

function openDetail(id) {
    const p = processos.find(p => p.id === id);
    if (!p) return;
    viewingId = id;

    $('#detail-title').textContent = `Processo ${p.numero}`;

    detailContent.innerHTML = `
        <div class="detail-grid">
            <div class="detail-field">
                <label>Nº Processo</label>
                <div class="value"><strong>${escapeHtml(p.numero)}</strong></div>
            </div>
            <div class="detail-field">
                <label>Tipo</label>
                <div class="value">${escapeHtml(p.tipo || '—')}</div>
            </div>
            <div class="detail-field">
                <label>Interessado</label>
                <div class="value">${escapeHtml(p.interessado || '—')}</div>
            </div>
            <div class="detail-field">
                <label>Assunto</label>
                <div class="value">${escapeHtml(p.assunto || '—')}</div>
            </div>
            <div class="detail-field">
                <label>CPF Atribuído</label>
                <div class="value">${escapeHtml(p.cpf_atribuido || '—')}</div>
            </div>
            <div class="detail-field">
                <label>Unidade/Seção</label>
                <div class="value">${escapeHtml(p.unidade || '—')}</div>
            </div>
            <div class="detail-field">
                <label>Marcador</label>
                <div class="value">${p.marcador ? `<span class="marcador-tag">${escapeHtml(p.marcador)}</span>` : '—'}</div>
            </div>
            <div class="detail-field">
                <label>Prioridade</label>
                <div class="value"><span class="badge badge-${p.prioridade}">${prioridadeLabel(p.prioridade)}</span></div>
            </div>
            <div class="detail-field">
                <label>Status</label>
                <div class="value"><span class="badge badge-${p.status}">${statusLabel(p.status)}</span></div>
            </div>
            <div class="detail-field">
                <label>Prazo</label>
                <div class="value ${prazoClass(p.prazo, p.status)}">${formatDate(p.prazo)}</div>
            </div>
            <div class="detail-field full-width">
                <label>Anotações</label>
                <div class="value">${escapeHtml(p.anotacoes || '—').replace(/\n/g, '<br>')}</div>
            </div>
            <div class="detail-field full-width">
                <label>Observações</label>
                <div class="value">${escapeHtml(p.observacoes || '—').replace(/\n/g, '<br>')}</div>
            </div>
            <div class="detail-field">
                <label>Criado em</label>
                <div class="value">${p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : '—'}</div>
            </div>
            <div class="detail-field">
                <label>Atualizado em</label>
                <div class="value">${p.updated_at ? new Date(p.updated_at).toLocaleString('pt-BR') : '—'}</div>
            </div>
            ${renderDocumentos(p)}
        </div>
    `;

    renderHistory(p);
    detailOverlay.style.display = 'flex';
}

function renderHistory(p) {
    const entries = p.historico || [];
    if (entries.length === 0) {
        historyList.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem">Nenhum andamento registrado.</p>';
        return;
    }

    historyList.innerHTML = entries.slice().reverse().map(h => `
        <div class="history-entry">
            <div class="history-date">${new Date(h.data).toLocaleString('pt-BR')}</div>
            <div>${escapeHtml(h.texto)}</div>
        </div>
    `).join('');
}

function addHistoryEntry(id, texto) {
    const p = processos.find(p => p.id === id);
    if (!p) return;
    if (!p.historico) p.historico = [];
    p.historico.push({ data: now(), texto });
    p.updated_at = now();
    saveProcessos(processos);
}

function closeDetail() {
    detailOverlay.style.display = 'none';
    viewingId = null;
}

// ============================================================
// Import/Export
// ============================================================

function exportData() {
    const dataStr = JSON.stringify(processos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sei_processos_cbmmg_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Formato inválido');

            const existingIds = new Set(processos.map(p => p.numero));
            let added = 0;
            let updated = 0;

            imported.forEach(item => {
                if (!item.numero) return;
                const existing = processos.find(p => p.numero === item.numero);
                if (existing) {
                    Object.assign(existing, item, { id: existing.id, updated_at: now() });
                    updated++;
                } else {
                    processos.push({
                        id: item.id || generateId(),
                        numero: item.numero,
                        tipo: item.tipo || '',
                        interessado: item.interessado || '',
                        assunto: item.assunto || '',
                        cpf_atribuido: item.cpf_atribuido || '',
                        unidade: item.unidade || '',
                        marcador: item.marcador || '',
                        prioridade: item.prioridade || 'normal',
                        status: item.status || 'pendente',
                        prazo: item.prazo || null,
                        anotacoes: item.anotacoes || '',
                        observacoes: item.observacoes || '',
                        documentos: item.documentos || [],
                        historico: item.historico || [],
                        created_at: item.created_at || now(),
                        updated_at: now()
                    });
                    added++;
                }
            });

            saveProcessos(processos);
            render();
            alert(`Importação concluída: ${added} adicionados, ${updated} atualizados.`);
        } catch (err) {
            alert('Erro ao importar: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// ============================================================
// SEI Data Parser (for bookmarklet/paste)
// ============================================================

function parseSEIData(text) {
    const results = [];

    // Try JSON format first
    try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) return json;
        if (json.numero) return [json];
    } catch {
        // Not JSON, try text parsing
    }

    const lines = text.trim().split('\n').filter(l => l.trim());

    // SEI process number patterns:
    // Full: 00000.000000/0000-00
    // Short: 0000000 (7+ digits)
    // With dots: 00090.000123/2024-01
    const seiPatternFull = /\d{4,6}\.\d{4,8}\/\d{4}-\d{2}/;
    const seiPatternShort = /\b\d{7,17}\b/;

    for (const line of lines) {
        // Try full pattern first
        let match = line.match(seiPatternFull);
        if (!match) {
            // Try short numeric pattern (only if line looks like process data)
            match = line.match(seiPatternShort);
        }

        if (match) {
            // Split by tab, multiple spaces, or pipe
            const parts = line.split(/\t|  +|\|/).map(s => s.trim()).filter(Boolean);
            const processo = {
                numero: match[0],
                tipo: '',
                interessado: '',
                assunto: '',
                marcador: '',
                status: 'pendente',
                prioridade: 'normal'
            };

            // Find which part has the number and extract others in order
            const numIdx = parts.findIndex(p => p.includes(match[0]));
            const afterNum = parts.slice(numIdx + 1);

            if (afterNum.length >= 1) processo.tipo = afterNum[0];
            if (afterNum.length >= 2) processo.interessado = afterNum[1];
            if (afterNum.length >= 3) processo.assunto = afterNum[2];
            if (afterNum.length >= 4) processo.marcador = afterNum[3];

            // If no tab-separated data, put everything after number as assunto
            if (afterNum.length === 0) {
                const remaining = line.replace(match[0], '').trim().replace(/^[-|:]\s*/, '');
                if (remaining) processo.assunto = remaining;
            }

            results.push(processo);
        }
    }

    return results;
}

function processPastedData() {
    const text = $('#paste-sei-data').value.trim();
    const resultDiv = $('#parse-result');

    if (!text) {
        resultDiv.textContent = 'Cole algum dado primeiro.';
        resultDiv.className = 'error';
        return;
    }

    const parsed = parseSEIData(text);

    if (parsed.length === 0) {
        resultDiv.textContent = 'Não foi possível identificar processos nos dados colados. Verifique o formato.';
        resultDiv.className = 'error';
        return;
    }

    let added = 0;
    parsed.forEach(item => {
        if (!item.numero) return;
        const exists = processos.find(p => p.numero === item.numero);
        if (!exists) {
            processos.push({
                id: generateId(),
                numero: item.numero,
                tipo: item.tipo || '',
                interessado: item.interessado || '',
                assunto: item.assunto || '',
                cpf_atribuido: item.cpf_atribuido || '',
                unidade: item.unidade || '',
                marcador: item.marcador || '',
                prioridade: item.prioridade || 'normal',
                status: item.status || 'pendente',
                prazo: item.prazo || null,
                anotacoes: item.anotacoes || '',
                observacoes: item.observacoes || '',
                documentos: item.documentos || [],
                historico: [{ data: now(), texto: 'Importado do SEI' }],
                created_at: now(),
                updated_at: now()
            });
            added++;
        }
    });

    saveProcessos(processos);
    render();

    resultDiv.textContent = `${added} processo(s) importado(s) com sucesso! ${parsed.length - added} já existiam.`;
    resultDiv.className = 'success';
    $('#paste-sei-data').value = '';
}

// ============================================================
// PDF Import
// ============================================================

let pdfParsedProcessos = [];

async function extractTextFromPDF(file) {
    const statusEl = $('#pdf-status');
    const statusText = $('#pdf-status-text');
    const progressBar = $('#pdf-progress-bar');
    const previewEl = $('#pdf-preview');
    const rawTextEl = $('#pdf-raw-text');

    // Reset UI
    statusEl.style.display = 'block';
    previewEl.style.display = 'none';
    rawTextEl.style.display = 'none';
    progressBar.style.width = '10%';
    statusText.textContent = 'Lendo PDF...';

    try {
        const arrayBuffer = await file.arrayBuffer();
        progressBar.style.width = '30%';

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        let fullText = '';

        for (let i = 1; i <= totalPages; i++) {
            statusText.textContent = `Lendo página ${i} de ${totalPages}...`;
            progressBar.style.width = `${30 + (60 * i / totalPages)}%`;

            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        progressBar.style.width = '95%';
        statusText.textContent = 'Analisando dados...';

        // Parse the extracted text
        const parsed = parseSEIPdfText(fullText);
        pdfParsedProcessos = parsed;

        progressBar.style.width = '100%';

        if (parsed.length > 0) {
            statusText.textContent = `${parsed.length} processo(s) encontrado(s)!`;
            renderPdfPreview(parsed);
            previewEl.style.display = 'block';
        } else {
            statusText.textContent = 'Nenhum processo encontrado automaticamente.';
            $('#pdf-extracted-text').value = fullText.trim();
            rawTextEl.style.display = 'block';
        }

    } catch (err) {
        statusText.textContent = 'Erro ao ler PDF: ' + err.message;
        progressBar.style.width = '100%';
        progressBar.style.background = 'var(--danger)';
    }
}

function parseSEIPdfText(text) {
    const results = [];
    const seen = new Set();

    // SEI process number patterns
    const seiPatternFull = /\d{4,6}\.\d{4,8}\/\d{4}-\d{2}/g;

    // Find all process numbers
    const matches = text.match(seiPatternFull) || [];

    for (const num of matches) {
        if (seen.has(num)) continue;
        seen.add(num);

        const processo = {
            numero: num,
            tipo: '',
            interessado: '',
            assunto: '',
            marcador: '',
            status: 'pendente',
            prioridade: 'normal'
        };

        // Try to extract context around the process number
        const idx = text.indexOf(num);
        const context = text.substring(Math.max(0, idx - 200), Math.min(text.length, idx + 300));

        // Try to find tipo de documento
        const tipoMatch = context.match(/(?:Tipo|Documento|Espécie)[:\s]*([\w\sÀ-ú]+?)(?:\n|Interessad|Assunto|Unidade|\d{4,})/i);
        if (tipoMatch) processo.tipo = tipoMatch[1].trim();

        // Try to find interessado
        const intMatch = context.match(/(?:Interessado|Requerente|Solicitante)[:\s]*([\w\sÀ-ú.,'-]+?)(?:\n|Assunto|Tipo|Unidade|\d{4,}\.|Observ)/i);
        if (intMatch) processo.interessado = intMatch[1].trim();

        // Try to find assunto
        const assMatch = context.match(/(?:Assunto|Descrição|Objeto)[:\s]*([\w\sÀ-ú.,;:'-]+?)(?:\n|Interessad|Tipo|Unidade|\d{4,}\.|Observ)/i);
        if (assMatch) processo.assunto = assMatch[1].trim();

        // Try to find unidade
        const unidMatch = context.match(/(?:Unidade|Seção|Setor|Órgão)[:\s]*([\w\sÀ-ú./-]+?)(?:\n|Interessad|Assunto|Tipo|\d{4,}\.)/i);
        if (unidMatch) processo.unidade = unidMatch[1].trim();

        results.push(processo);
    }

    return results;
}

function renderPdfPreview(parsed) {
    const list = $('#pdf-preview-list');
    const existingNums = new Set(processos.map(p => p.numero));

    list.innerHTML = parsed.map((p, i) => {
        const exists = existingNums.has(p.numero);
        const details = [p.tipo, p.interessado, p.assunto].filter(Boolean).join(' — ');
        return `
            <div class="pdf-preview-item">
                <input type="checkbox" id="pdf-check-${i}" ${exists ? '' : 'checked'}>
                <span class="pdf-preview-num">${escapeHtml(p.numero)}</span>
                <span class="pdf-preview-detail">${details ? escapeHtml(details) : 'Sem detalhes extras'}</span>
                ${exists ? '<span class="pdf-preview-exists">Já existe</span>' : ''}
            </div>
        `;
    }).join('');
}

function importFromPdf() {
    const resultEl = $('#pdf-import-result');
    let added = 0;

    pdfParsedProcessos.forEach((item, i) => {
        const checkbox = $(`#pdf-check-${i}`);
        if (!checkbox || !checkbox.checked) return;
        if (!item.numero) return;

        const exists = processos.find(p => p.numero === item.numero);
        if (exists) return;

        processos.push({
            id: generateId(),
            numero: item.numero,
            tipo: item.tipo || '',
            interessado: item.interessado || '',
            assunto: item.assunto || '',
            cpf_atribuido: item.cpf_atribuido || '',
            unidade: item.unidade || '',
            marcador: item.marcador || '',
            prioridade: item.prioridade || 'normal',
            status: item.status || 'pendente',
            prazo: item.prazo || null,
            anotacoes: item.anotacoes || '',
            observacoes: item.observacoes || '',
            documentos: item.documentos || [],
            historico: [{ data: now(), texto: 'Importado via PDF do SEI' }],
            created_at: now(),
            updated_at: now()
        });
        added++;
    });

    saveProcessos(processos);
    render();

    resultEl.textContent = `${added} processo(s) importado(s)!`;
    resultEl.className = 'success';

    if (added > 0) {
        setTimeout(() => {
            bookmarkletOverlay.style.display = 'none';
            resetPdfImport();
        }, 1500);
    }
}

function resetPdfImport() {
    $('#pdf-status').style.display = 'none';
    $('#pdf-preview').style.display = 'none';
    $('#pdf-raw-text').style.display = 'none';
    $('#pdf-progress-bar').style.width = '0%';
    $('#pdf-progress-bar').style.background = 'var(--primary)';
    $('#pdf-import-result').textContent = '';
    $('#pdf-file-input').value = '';
    pdfParsedProcessos = [];
}

// ============================================================
// Event Handlers
// ============================================================

function init() {
    // Buttons
    $('#btn-add').addEventListener('click', () => openModal(null));
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-import-file').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    });

    // Import modal
    $('#btn-bookmarklet-info').addEventListener('click', () => {
        bookmarkletOverlay.style.display = 'flex';
    });
    $('#bookmarklet-close').addEventListener('click', () => {
        bookmarkletOverlay.style.display = 'none';
        resetPdfImport();
    });
    $('#btn-parse-paste').addEventListener('click', processPastedData);

    // Import tabs
    $$('.import-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.import-tab').forEach(t => t.classList.remove('active'));
            $$('.import-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            $(`#tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // PDF upload
    const dropZone = $('#pdf-drop-zone');
    const pdfInput = $('#pdf-file-input');

    dropZone.addEventListener('click', () => pdfInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            extractTextFromPDF(file);
        }
    });

    pdfInput.addEventListener('change', (e) => {
        if (e.target.files[0]) extractTextFromPDF(e.target.files[0]);
    });

    $('#btn-import-pdf').addEventListener('click', importFromPdf);
    $('#btn-pdf-cancel').addEventListener('click', resetPdfImport);

    // Modal
    $('#modal-close').addEventListener('click', closeModal);
    $('#btn-cancel').addEventListener('click', closeModal);
    processForm.addEventListener('submit', saveProcesso);

    // Detail modal
    $('#detail-close').addEventListener('click', closeDetail);
    $('#btn-add-history').addEventListener('click', () => {
        const text = $('#new-history-entry').value.trim();
        if (!text || !viewingId) return;
        addHistoryEntry(viewingId, text);
        const p = processos.find(p => p.id === viewingId);
        if (p) renderHistory(p);
        $('#new-history-entry').value = '';
    });

    // Table row click -> detail
    tableBody.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (row) openDetail(row.dataset.id);
    });

    // Sorting
    $$('.process-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (currentSort.field === field) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort = { field, asc: true };
            }
            // Update sort icons
            $$('.process-table th .sort-icon').forEach(s => s.textContent = '');
            th.querySelector('.sort-icon').textContent = currentSort.asc ? ' ▲' : ' ▼';
            renderTable();
        });
    });

    // Filters
    searchInput.addEventListener('input', debounce(renderTable, 200));
    filterStatus.addEventListener('change', renderTable);
    filterPrioridade.addEventListener('change', renderTable);
    filterMarcador.addEventListener('change', renderTable);

    // Close modals on overlay click
    [modalOverlay, detailOverlay, bookmarkletOverlay].forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
                if (overlay === modalOverlay) editingId = null;
                if (overlay === detailOverlay) viewingId = null;
            }
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [modalOverlay, detailOverlay, bookmarkletOverlay].forEach(o => {
                if (o.style.display !== 'none') o.style.display = 'none';
            });
            editingId = null;
            viewingId = null;
        }
        // Ctrl+N for new process
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            openModal(null);
        }
        // Ctrl+F to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !modalOverlay.style.display.includes('flex')) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // CPF mask
    $('#f-cpf').addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        e.target.value = v;
    });

    // Initial render
    render();
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// Make functions available globally for inline handlers
window.editProcesso = editProcesso;
window.deleteProcesso = deleteProcesso;

// Initialize
document.addEventListener('DOMContentLoaded', init);
