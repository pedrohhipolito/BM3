// ============================================================
// BM3 SEI - Content Script
// Captura processos da tela do SEI e exporta para o BM3
// ============================================================

(function() {
  'use strict';

  // Detectar versão do SEI (novo layout vs clássico)
  const isNewSEI = document.querySelector('#divInfraSidebarMenu ul#infraMenu') !== null;

  // ============================================================
  // Scraping: Extrai processos da tabela do SEI
  // ============================================================

  function extractTooltipText(onmouseover) {
    // SEI usa infraTooltipMostrar('texto') nos onmouseover
    if (!onmouseover) return '';
    const match = onmouseover.match(/infraTooltipMostrar\('([^']+)'\)/);
    return match ? match[1] : '';
  }

  function getParamsFromUrl(url) {
    if (!url) return {};
    const params = {};
    const queryString = url.includes('?') ? url.split('?')[1] : url;
    queryString.split('&').forEach(pair => {
      const [key, val] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = val ? decodeURIComponent(val) : '';
    });
    return params;
  }

  function scrapeProcessos() {
    const processos = [];
    const tables = document.querySelectorAll(
      '#tblProcessosRecebidos, #tblProcessosGerados, #tblProcessosDetalhado'
    );

    if (tables.length === 0) return processos;

    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length < 3) return; // pular header ou rows vazias

        const processo = extractProcessoFromRow(row, tds);
        if (processo) {
          processos.push(processo);
        }
      });
    });

    return processos;
  }

  function extractProcessoFromRow(row, tds) {
    // Coluna 2 (index 2) geralmente tem o link do processo
    // SEI usa: <a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=XXX">NUMERO</a>
    const linkProc = row.querySelector('a[href*="procedimento_trabalhar"]');
    if (!linkProc) return null;

    const numero = linkProc.textContent.trim();
    if (!numero) return null;

    const href = linkProc.getAttribute('href') || '';
    const params = getParamsFromUrl(href);
    const idProcedimento = params.id_procedimento || '';

    // Especificação (tooltip do link do processo)
    const onmouseover = linkProc.getAttribute('onmouseover') || '';
    const especificacao = extractTooltipText(onmouseover);

    // Tipo do processo (extraído da especificação ou de outra coluna)
    let tipo = '';
    if (especificacao) {
      // Formato comum: "Tipo: Valor - Detalhes"
      const tipoMatch = especificacao.match(/^([^-:]+)/);
      tipo = tipoMatch ? tipoMatch[1].trim() : especificacao;
    }

    // Marcador (ícone de tag/marcador na linha)
    const linkMarcador = row.querySelector('a[href*="andamento_marcador_gerenciar"]');
    let marcador = '';
    if (linkMarcador) {
      const marcadorTooltip = extractTooltipText(linkMarcador.getAttribute('onmouseover') || '');
      marcador = marcadorTooltip || linkMarcador.textContent.trim();
    }

    // Atribuição (link de atribuição na linha)
    const linkAtribuicao = row.querySelector('a[href*="procedimento_atribuicao_listar"]');
    let atribuido = '';
    if (linkAtribuicao) {
      atribuido = linkAtribuicao.getAttribute('title') || linkAtribuicao.textContent.trim();
      atribuido = atribuido.replace('Atribuído para', '').trim();
    }

    // Anotação (ícone de anotação/post-it)
    const linkAnotacao = row.querySelector('a[href*="anotacao"], img[title*="nota"], a[onmouseover*="nota"]');
    let anotacao = '';
    if (linkAnotacao) {
      const anotTooltip = extractTooltipText(linkAnotacao.getAttribute('onmouseover') || '');
      anotacao = anotTooltip || '';
    }

    // Ponto de controle / situação
    const linkSituacao = row.querySelector('a[href*="andamento_situacao_gerenciar"]');
    let pontoControle = '';
    if (linkSituacao) {
      pontoControle = extractTooltipText(linkSituacao.getAttribute('onmouseover') || '')
                      || linkSituacao.textContent.trim();
    }

    // Verificar se processo está lido ou não lido
    const isNaoLido = linkProc.classList.contains('processoNaoVisualizado');

    // Data de recebimento (geralmente última coluna com data)
    let dataRecebimento = '';
    tds.forEach(td => {
      const text = td.textContent.trim();
      if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) {
        dataRecebimento = text;
      }
    });

    // Unidade atual
    const unidade = isNewSEI
      ? (document.querySelector('#lnkInfraUnidade')?.textContent?.trim() || '')
      : (document.querySelector('#selInfraUnidades option:checked')?.textContent?.trim() || '');

    return {
      numero,
      id_procedimento: idProcedimento,
      especificacao,
      tipo,
      marcador,
      atribuido,
      anotacao,
      ponto_controle: pontoControle,
      nao_lido: isNaoLido,
      data_recebimento: dataRecebimento,
      unidade
    };
  }

  // ============================================================
  // UI: Painel lateral e botão flutuante
  // ============================================================

  function createUI() {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'bm3-overlay';
    overlay.addEventListener('click', togglePanel);
    document.body.appendChild(overlay);

    // Botão flutuante
    const btn = document.createElement('button');
    btn.id = 'bm3-float-btn';
    btn.innerHTML = 'B3<span class="bm3-badge" id="bm3-count">0</span>';
    btn.title = 'BM3 - Capturar Processos SEI';
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    // Painel lateral
    const panel = document.createElement('div');
    panel.id = 'bm3-panel';
    panel.innerHTML = `
      <div class="bm3-panel-header">
        <h2>BM3 - Processos SEI</h2>
        <button class="bm3-close" id="bm3-close-btn">&times;</button>
      </div>
      <div class="bm3-toolbar">
        <button id="bm3-btn-capturar" class="bm3-primary">Capturar Processos</button>
        <button id="bm3-btn-select-all">Selecionar Todos</button>
        <button id="bm3-btn-copiar" class="bm3-success">Copiar para BM3</button>
        <button id="bm3-btn-exportar-json">Exportar JSON</button>
      </div>
      <div class="bm3-info" id="bm3-info">
        Clique em "Capturar Processos" para ler a tabela do SEI.
      </div>
      <div class="bm3-process-list" id="bm3-process-list">
        <div style="text-align:center; padding:40px; color:#999;">
          Nenhum processo capturado ainda.
        </div>
      </div>
      <div class="bm3-footer">
        BM3 Controle de Processos - CBMMG
      </div>
    `;
    document.body.appendChild(panel);

    // Event listeners
    document.getElementById('bm3-close-btn').addEventListener('click', togglePanel);
    document.getElementById('bm3-btn-capturar').addEventListener('click', capturarProcessos);
    document.getElementById('bm3-btn-select-all').addEventListener('click', toggleSelectAll);
    document.getElementById('bm3-btn-copiar').addEventListener('click', copiarParaBM3);
    document.getElementById('bm3-btn-exportar-json').addEventListener('click', exportarJSON);
  }

  let capturedProcessos = [];
  let allSelected = false;

  function togglePanel() {
    const panel = document.getElementById('bm3-panel');
    const overlay = document.getElementById('bm3-overlay');
    panel.classList.toggle('open');
    overlay.classList.toggle('show');
  }

  function capturarProcessos() {
    capturedProcessos = scrapeProcessos();
    renderProcessList();

    const count = capturedProcessos.length;
    document.getElementById('bm3-count').textContent = count;
    document.getElementById('bm3-info').textContent =
      count > 0
        ? `${count} processo(s) encontrado(s) na tela. Selecione e exporte.`
        : 'Nenhum processo encontrado na tabela atual.';

    if (count === 0) {
      showToast('Nenhum processo encontrado. Verifique se está na tela de Controle de Processos.', true);
    } else {
      showToast(`${count} processo(s) capturado(s) com sucesso!`);
    }
  }

  function renderProcessList() {
    const container = document.getElementById('bm3-process-list');

    if (capturedProcessos.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">Nenhum processo capturado.</div>';
      return;
    }

    container.innerHTML = capturedProcessos.map((proc, idx) => `
      <div class="bm3-process-item ${proc._selected ? 'selected' : ''}" data-index="${idx}">
        <input type="checkbox" ${proc._selected ? 'checked' : ''} data-idx="${idx}" class="bm3-check">
        <div class="bm3-proc-number">${proc.numero}</div>
        <div class="bm3-proc-detail">
          ${proc.especificacao ? `<div><strong>Espec.:</strong> ${proc.especificacao}</div>` : ''}
          ${proc.tipo ? `<div><strong>Tipo:</strong> ${proc.tipo}</div>` : ''}
          ${proc.data_recebimento ? `<div><strong>Recebido:</strong> ${proc.data_recebimento}</div>` : ''}
        </div>
        <div>
          ${proc.atribuido ? `<span class="bm3-proc-tag atribuido">Atrib.: ${proc.atribuido}</span>` : ''}
          ${proc.marcador ? `<span class="bm3-proc-tag marcador">Marc.: ${proc.marcador}</span>` : ''}
          ${proc.anotacao ? `<span class="bm3-proc-tag anotacao">Anot.: ${proc.anotacao}</span>` : ''}
          ${proc.ponto_controle ? `<span class="bm3-proc-tag">PC: ${proc.ponto_controle}</span>` : ''}
          ${proc.nao_lido ? `<span class="bm3-proc-tag" style="background:#e74c3c;color:#fff;">Novo</span>` : ''}
        </div>
      </div>
    `).join('');

    // Checkbox listeners
    container.querySelectorAll('.bm3-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        capturedProcessos[idx]._selected = e.target.checked;
        e.target.closest('.bm3-process-item').classList.toggle('selected', e.target.checked);
        updateInfo();
      });
    });

    // Click na row para toggle
    container.querySelectorAll('.bm3-process-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        const cb = item.querySelector('.bm3-check');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      });
    });
  }

  function updateInfo() {
    const selected = capturedProcessos.filter(p => p._selected).length;
    const total = capturedProcessos.length;
    document.getElementById('bm3-info').textContent =
      `${total} processo(s) encontrado(s) | ${selected} selecionado(s)`;
  }

  function toggleSelectAll() {
    allSelected = !allSelected;
    capturedProcessos.forEach(p => p._selected = allSelected);
    renderProcessList();
    updateInfo();
    document.getElementById('bm3-btn-select-all').textContent =
      allSelected ? 'Desmarcar Todos' : 'Selecionar Todos';
  }

  // ============================================================
  // Export: Formatos de saída para o BM3
  // ============================================================

  function getSelectedProcessos() {
    const selected = capturedProcessos.filter(p => p._selected);
    if (selected.length === 0) {
      showToast('Selecione ao menos um processo!', true);
      return null;
    }
    return selected;
  }

  function formatForBM3(processos) {
    // Formata no formato que o BM3 app.js parseSEIData() e processPastedData() esperam
    return processos.map(p => ({
      numero: p.numero,
      tipo: p.tipo || p.especificacao || '',
      interessado: '', // SEI não mostra interessado na tabela principal
      assunto: p.especificacao || '',
      cpf_atribuido: '',
      unidade: p.unidade || '',
      marcador: p.marcador || '',
      prioridade: 'normal',
      status: 'pendente',
      prazo: null,
      anotacoes: p.anotacao || '',
      observacoes: [
        p.ponto_controle ? `Ponto de Controle: ${p.ponto_controle}` : '',
        p.atribuido ? `Atribuído para: ${p.atribuido}` : '',
        p.data_recebimento ? `Recebido em: ${p.data_recebimento}` : '',
        p.id_procedimento ? `ID SEI: ${p.id_procedimento}` : ''
      ].filter(Boolean).join('\n')
    }));
  }

  function copiarParaBM3() {
    const selected = getSelectedProcessos();
    if (!selected) return;

    const bm3Data = formatForBM3(selected);
    const json = JSON.stringify(bm3Data, null, 2);

    navigator.clipboard.writeText(json).then(() => {
      showToast(`${selected.length} processo(s) copiado(s)! Cole no campo "Colar Dados" do BM3.`);
    }).catch(() => {
      // Fallback: textarea temporário
      const ta = document.createElement('textarea');
      ta.value = json;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`${selected.length} processo(s) copiado(s)! Cole no campo "Colar Dados" do BM3.`);
    });
  }

  function exportarJSON() {
    const selected = getSelectedProcessos();
    if (!selected) return;

    const bm3Data = formatForBM3(selected);
    const json = JSON.stringify(bm3Data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `sei_processos_bm3_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${selected.length} processo(s) exportado(s) como JSON! Importe no BM3.`);
  }

  // ============================================================
  // Toast notification
  // ============================================================

  function showToast(msg, isError) {
    const existing = document.querySelector('.bm3-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'bm3-toast' + (isError ? ' error' : '');
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  }

  // ============================================================
  // Init: Aguarda DOM e injeta a UI
  // ============================================================

  function init() {
    // Só injeta se estiver em uma tela com tabela de processos ou controle
    const hasTable = document.querySelector(
      '#tblProcessosRecebidos, #tblProcessosGerados, #tblProcessosDetalhado'
    );
    const isControle = window.location.href.includes('procedimento_controlar')
                     || window.location.href.includes('procedimento_trabalhar');

    if (hasTable || isControle) {
      createUI();

      // Auto-captura ao abrir
      setTimeout(() => {
        capturedProcessos = scrapeProcessos();
        document.getElementById('bm3-count').textContent = capturedProcessos.length;
        if (capturedProcessos.length > 0) {
          document.getElementById('bm3-info').textContent =
            `${capturedProcessos.length} processo(s) detectado(s). Clique para abrir.`;
        }
      }, 1000);
    }
  }

  // Garantir que DOM está pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
