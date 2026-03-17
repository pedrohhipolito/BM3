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
  // Scraping Profundo via IFRAME INVISÍVEL
  // Carrega cada página SEI em um iframe oculto para usar
  // a sessão real do usuário e renderização completa do navegador
  // ============================================================

  function buildSEIUrl(action, params) {
    const base = window.location.href.split('controlador.php')[0] + 'controlador.php';
    const queryParts = [`acao=${action}`];
    for (const [k, v] of Object.entries(params)) {
      queryParts.push(`${k}=${v}`);
    }
    return base + '?' + queryParts.join('&');
  }

  // Iframe reutilizável — criado uma vez, reutilizado em todas as capturas
  let _iframeBM3 = null;

  function getIframe() {
    if (_iframeBM3 && _iframeBM3.parentNode) return _iframeBM3;
    _iframeBM3 = document.createElement('iframe');
    _iframeBM3.id = 'bm3-scraper-iframe';
    _iframeBM3.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(_iframeBM3);
    return _iframeBM3;
  }

  function destroyIframe() {
    if (_iframeBM3 && _iframeBM3.parentNode) {
      _iframeBM3.parentNode.removeChild(_iframeBM3);
    }
    _iframeBM3 = null;
  }

  // Carrega uma URL no iframe e retorna o document quando pronto
  function loadPageInIframe(url, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const iframe = getIframe();
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('BM3: Timeout ao carregar iframe:', url);
          resolve(null);
        }
      }, timeoutMs);

      function onLoad() {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        iframe.removeEventListener('load', onLoad);
        try {
          // Pequeno delay para scripts internos do SEI executarem
          setTimeout(() => {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              resolve(doc);
            } catch (e) {
              console.warn('BM3: Sem acesso ao iframe (cross-origin?):', e);
              resolve(null);
            }
          }, 500);
        } catch (e) {
          console.warn('BM3: Erro ao acessar iframe:', e);
          resolve(null);
        }
      }

      iframe.addEventListener('load', onLoad);
      iframe.src = url;
    });
  }

  // Carrega uma página SEI no iframe invisível
  async function loadSEIPage(action, params) {
    const url = buildSEIUrl(action, params);
    console.log('BM3: Carregando via iframe:', action, params);
    return await loadPageInIframe(url);
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // --- Captura completa de dados de um processo ---
  async function fetchDadosCompletos(idProcedimento, updateStatus) {
    if (!idProcedimento) return {};

    const resultado = {
      documentos: [],
      andamentos: [],
      anotacao_completa: '',
      marcador_detalhado: null,
      interessado: '',
      assunto: '',
      tipo_processo: '',
      observacao_processo: ''
    };

    // 1. Página principal do processo (árvore de documentos)
    if (updateStatus) updateStatus('Abrindo processo...');
    const docPage = await loadSEIPage('procedimento_trabalhar', { id_procedimento: idProcedimento });
    if (docPage) {
      resultado.documentos = extrairDocumentos(docPage);

      // Tentar extrair dados cadastrais da própria página principal
      const dadosPrincipal = extrairDadosCadastrais(docPage);
      Object.assign(resultado, dadosPrincipal);
    }

    // 2. Página de consulta (andamentos + dados cadastrais)
    if (updateStatus) updateStatus('Lendo andamentos...');
    await sleep(300);
    const andPage = await loadSEIPage('procedimento_consultar', { id_procedimento: idProcedimento });
    if (andPage) {
      resultado.andamentos = extrairAndamentos(andPage);
      // Complementar dados cadastrais se não vieram da página principal
      const dadosCadastrais = extrairDadosCadastrais(andPage);
      if (!resultado.interessado) resultado.interessado = dadosCadastrais.interessado;
      if (!resultado.assunto) resultado.assunto = dadosCadastrais.assunto;
      if (!resultado.tipo_processo) resultado.tipo_processo = dadosCadastrais.tipo_processo;
      if (!resultado.observacao_processo) resultado.observacao_processo = dadosCadastrais.observacao_processo;
    }

    // 3. Anotações completas
    if (updateStatus) updateStatus('Lendo anotações...');
    await sleep(300);
    const anotPage = await loadSEIPage('anotacao_registrar', { id_procedimento: idProcedimento });
    if (anotPage) {
      resultado.anotacao_completa = extrairAnotacaoCompleta(anotPage);
    }

    // 4. Marcador detalhado
    if (updateStatus) updateStatus('Lendo marcadores...');
    await sleep(300);
    const marcPage = await loadSEIPage('andamento_marcador_gerenciar', { id_procedimento: idProcedimento });
    if (marcPage) {
      resultado.marcador_detalhado = extrairMarcadorDetalhado(marcPage);
    }

    return resultado;
  }

  // --- Buscar conteúdo de um documento via iframe ---
  async function fetchConteudoDocumento(idDocumento) {
    if (!idDocumento) return { texto: '', completo: false, erro: 'Sem ID' };

    try {
      const doc = await loadSEIPage('documento_visualizar', {
        id_documento: idDocumento,
        id_orgao_acesso_externo: 0
      });
      if (!doc) return { texto: '', completo: false, erro: 'Página não carregou (timeout)' };

      // 1. Container específico de conteúdo do SEI
      const conteudoEl = doc.querySelector(
        '#divConteudo, #divDocumento, .documento-conteudo, .infraAreaTexto, #divVer'
      );
      if (conteudoEl) {
        const texto = conteudoEl.textContent.trim();
        if (texto.length > 10) {
          return { texto, completo: true, erro: null };
        }
      }

      // 2. O SEI pode renderizar o doc dentro de um iframe interno
      //    Nesse caso, precisamos verificar iframes dentro do doc
      const iframeDoc = doc.querySelector('iframe#ifrVisualizacao, iframe[name="ifrVisualizacao"], iframe[src*="documento"]');
      if (iframeDoc) {
        try {
          const iframeContent = iframeDoc.contentDocument || iframeDoc.contentWindow.document;
          if (iframeContent && iframeContent.body) {
            const textoIframe = iframeContent.body.textContent.trim();
            if (textoIframe.length > 10) {
              return { texto: textoIframe, completo: true, erro: null };
            }
          }
        } catch (e) {
          // Iframe pode ser cross-origin para PDFs
        }

        // Verificar se é PDF
        const src = iframeDoc.getAttribute('src') || '';
        if (src.includes('.pdf') || src.includes('anexo_download') || src.includes('tipo=A')) {
          return { texto: '', completo: false, erro: 'PDF/anexo — não extraível como texto' };
        }
      }

      // 3. Fallback: body inteiro limpando navegação
      const body = doc.querySelector('body');
      if (body) {
        body.querySelectorAll('script, style, nav, header, footer, #infraBarraSistema, .infraBarraLocalizacao, #infraMenu').forEach(el => el.remove());
        const texto = body.textContent.trim();
        if (texto.length > 100) {
          return { texto, completo: true, erro: null };
        }
      }

      // 4. Verificar se há objeto embed (PDF inline)
      const embed = doc.querySelector('embed[type="application/pdf"], object[type="application/pdf"]');
      if (embed) {
        return { texto: '', completo: false, erro: 'PDF embutido — não extraível como texto' };
      }

      return { texto: '', completo: false, erro: 'Conteúdo não encontrado na página' };
    } catch (err) {
      console.warn('BM3: Erro ao buscar conteúdo do documento', idDocumento, err);
      return { texto: '', completo: false, erro: `Erro: ${err.message}` };
    }
  }

  // --- Dados cadastrais do processo (interessado, assunto, tipo) ---
  // Extrai de qualquer página do SEI que contenha esses dados
  function extrairDadosCadastrais(doc) {
    const dados = {
      interessado: '',
      assunto: '',
      tipo_processo: '',
      observacao_processo: ''
    };

    // Estratégia 1: TDs com classe de label do SEI (mais comum)
    // <td class="infraLabelCampo">Interessado(s):</td><td class="infraTipoCampo">Nome</td>
    const labelMappings = [
      { field: 'interessado',         patterns: ['interessado', 'interessados'] },
      { field: 'assunto',             patterns: ['especificação', 'especificacao', 'assunto', 'descrição'] },
      { field: 'tipo_processo',       patterns: ['tipo do processo', 'tipo processo', 'tipo'] },
      { field: 'observacao_processo', patterns: ['observação', 'observacao'] }
    ];

    const allLabels = doc.querySelectorAll(
      'td.infraLabelCampo, th.infraLabelCampo, label.infraLabelObrigatorio, label.infraLabel, ' +
      'span.infraLabelCampo, div.infraLabelCampo, label'
    );
    allLabels.forEach(labelEl => {
      const labelText = labelEl.textContent.trim().toLowerCase().replace(/[:\s]+$/, '');

      for (const mapping of labelMappings) {
        if (dados[mapping.field]) continue;
        const matched = mapping.patterns.some(p => labelText.includes(p));
        if (!matched) continue;

        // Tentar vários caminhos para encontrar o valor
        let valor = '';

        // Caminho 1: próximo sibling direto
        const next = labelEl.nextElementSibling;
        if (next) valor = next.textContent.trim();

        // Caminho 2: próximo td na mesma row
        if (!valor && labelEl.tagName === 'TD') {
          const nextTd = labelEl.nextElementSibling;
          if (nextTd && nextTd.tagName === 'TD') valor = nextTd.textContent.trim();
        }

        // Caminho 3: parent td -> next td
        if (!valor && labelEl.parentElement && labelEl.parentElement.tagName === 'TD') {
          const parentTd = labelEl.parentElement;
          const nextTd = parentTd.nextElementSibling;
          if (nextTd) valor = nextTd.textContent.trim();
        }

        // Caminho 4: mesmo parent, próximo elemento
        if (!valor && labelEl.parentElement) {
          const children = Array.from(labelEl.parentElement.children);
          const idx = children.indexOf(labelEl);
          if (idx >= 0 && idx < children.length - 1) {
            valor = children[idx + 1].textContent.trim();
          }
        }

        if (valor && valor.length > 0 && valor.length < 5000) {
          dados[mapping.field] = valor;
        }
      }
    });

    // Estratégia 2: IDs típicos do SEI
    const idMappings = [
      { field: 'interessado',   ids: ['txtInteressados', 'divInteressados', 'lblInteressados', 'spanInteressados'] },
      { field: 'assunto',       ids: ['txtAssunto', 'divAssunto', 'lblAssunto', 'txtEspecificacao', 'spanEspecificacao'] },
      { field: 'tipo_processo', ids: ['txtTipoProcedimento', 'divTipoProcedimento', 'lblTipoProcedimento', 'spanTipoProcedimento'] },
      { field: 'observacao_processo', ids: ['txtObservacao', 'divObservacao'] }
    ];

    for (const mapping of idMappings) {
      if (dados[mapping.field]) continue;
      for (const id of mapping.ids) {
        const el = doc.getElementById(id);
        if (el) {
          const valor = el.value || el.textContent.trim();
          if (valor && valor.length > 0) {
            dados[mapping.field] = valor;
            break;
          }
        }
      }
    }

    // Estratégia 3: Regex no HTML bruto
    if (!dados.interessado || !dados.assunto || !dados.tipo_processo) {
      const html = doc.body ? doc.body.innerHTML : '';

      if (!dados.interessado) {
        const m = html.match(/Interessado\(?s?\)?[:\s]*<\/(?:td|label|span|th)>\s*<(?:td|span|div)[^>]*>\s*([^<]+)/i);
        if (m) dados.interessado = m[1].trim();
      }
      if (!dados.assunto) {
        const m = html.match(/(?:Especifica[çc][ãa]o|Assunto)[:\s]*<\/(?:td|label|span|th)>\s*<(?:td|span|div)[^>]*>\s*([^<]+)/i);
        if (m) dados.assunto = m[1].trim();
      }
      if (!dados.tipo_processo) {
        const m = html.match(/Tipo\s*(?:do\s*)?Processo[:\s]*<\/(?:td|label|span|th)>\s*<(?:td|span|div)[^>]*>\s*([^<]+)/i);
        if (m) dados.tipo_processo = m[1].trim();
      }
    }

    // Log para debug
    console.log('BM3: Dados cadastrais extraídos:', dados);

    return dados;
  }

  // --- Documentos ---
  function extrairDocumentos(doc) {
    const documentos = [];

    // Padrão 1: Links de documentos na árvore do SEI
    const docLinks = doc.querySelectorAll(
      'a[href*="documento_consultar"], a[href*="protocolo_visualizar"], a[href*="documento_visualizar"]'
    );

    docLinks.forEach(link => {
      const texto = link.textContent.trim();
      if (!texto) return;

      const href = link.getAttribute('href') || '';
      const params = getParamsFromUrl(href);
      const idDoc = params.id_documento || params.id_protocolo || '';
      const tooltip = extractTooltipText(link.getAttribute('onmouseover') || '');

      const img = link.querySelector('img') || link.previousElementSibling;
      let tipoDoc = '';
      if (img && img.getAttribute) {
        tipoDoc = img.getAttribute('title') || img.getAttribute('alt') || '';
      }

      documentos.push({
        id_documento: idDoc,
        nome: texto,
        tipo: tipoDoc || extrairTipoDocumento(texto),
        descricao: tooltip,
        conteudo: '' // será preenchido depois se solicitado
      });
    });

    // Padrão 2: Tabela de documentos
    if (documentos.length === 0) {
      const tabelasDocs = doc.querySelectorAll('table[id*="documento"], table[id*="Documento"]');
      tabelasDocs.forEach(tabela => {
        tabela.querySelectorAll('tr').forEach(row => {
          const tds = row.querySelectorAll('td');
          if (tds.length < 2) return;
          const link = row.querySelector('a');
          if (!link) return;

          const nome = link.textContent.trim();
          const href = link.getAttribute('href') || '';
          const params = getParamsFromUrl(href);

          let tipoDoc = '', dataDoc = '';
          tds.forEach(td => {
            const text = td.textContent.trim();
            if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) dataDoc = text;
            else if (text !== nome && text.length > 2 && text.length < 60 && !tipoDoc) tipoDoc = text;
          });

          documentos.push({
            id_documento: params.id_documento || params.id_protocolo || '',
            nome, tipo: tipoDoc || extrairTipoDocumento(nome),
            descricao: dataDoc ? `Data: ${dataDoc}` : '',
            conteudo: ''
          });
        });
      });
    }

    // Padrão 3: Árvore genérica
    if (documentos.length === 0) {
      doc.querySelectorAll('[class*="arvore"] a, [id*="arvore"] a, [class*="tree"] a').forEach(link => {
        const texto = link.textContent.trim();
        if (!texto || texto.length < 3) return;
        const href = link.getAttribute('href') || '';
        if (!href.includes('documento') && !href.includes('protocolo')) return;
        const params = getParamsFromUrl(href);
        documentos.push({
          id_documento: params.id_documento || params.id_protocolo || '',
          nome: texto, tipo: extrairTipoDocumento(texto),
          descricao: '', conteudo: ''
        });
      });
    }

    return documentos;
  }

  // --- Andamentos / Histórico de movimentação ---
  function extrairAndamentos(doc) {
    const andamentos = [];

    // SEI exibe andamentos em tabela (tblHistorico ou similar)
    const tabelas = doc.querySelectorAll(
      '#tblHistorico, table[id*="historico"], table[id*="Historico"], ' +
      '#tblAndamentos, table[id*="andamento"], table[id*="Andamento"], ' +
      'table.infraTable'
    );

    tabelas.forEach(tabela => {
      const rows = tabela.querySelectorAll('tr');
      rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length < 2) return;

        let data = '', unidade = '', usuario = '', descricao = '';

        tds.forEach((td, i) => {
          const text = td.textContent.trim();

          // Detectar data (DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY)
          if (/^\d{2}\/\d{2}\/\d{4}/.test(text) && !data) {
            data = text;
          }
          // Detectar unidade (sigla em maiúsculas com /)
          else if (/^[A-Z]{2,}[\/-]/.test(text) && !unidade) {
            unidade = text;
          }
          // Descrição é geralmente o campo mais longo
          else if (text.length > 5) {
            if (!descricao) descricao = text;
            else if (!usuario && text.length < descricao.length) usuario = text;
          }
        });

        // Também verificar tooltips nas células para mais detalhes
        tds.forEach(td => {
          const links = td.querySelectorAll('a[onmouseover]');
          links.forEach(link => {
            const tip = extractTooltipText(link.getAttribute('onmouseover') || '');
            if (tip && tip.length > descricao.length) descricao = tip;
          });
        });

        if (data || descricao) {
          andamentos.push({ data, unidade, usuario, descricao });
        }
      });
    });

    // Se não encontrou em tabela, tentar em divs/listas
    if (andamentos.length === 0) {
      doc.querySelectorAll('.andamento, .historico-item, [class*="andamento"]').forEach(el => {
        const text = el.textContent.trim();
        const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4}[\s\d:]*)/);
        if (dateMatch) {
          andamentos.push({
            data: dateMatch[1].trim(),
            unidade: '',
            usuario: '',
            descricao: text.replace(dateMatch[0], '').trim()
          });
        }
      });
    }

    return andamentos;
  }

  // --- Anotação completa ---
  function extrairAnotacaoCompleta(doc) {
    // Textarea ou div com o conteúdo da anotação
    const textarea = doc.querySelector(
      '#txaDescricao, textarea[name*="descricao"], textarea[name*="anotacao"], ' +
      '#txaConteudo, textarea[id*="anotacao"]'
    );
    if (textarea) return textarea.value || textarea.textContent || '';

    // Div de visualização
    const divAnot = doc.querySelector(
      '#divDescricao, .anotacao-conteudo, [id*="anotacao"], [class*="anotacao"]'
    );
    if (divAnot) return divAnot.textContent.trim();

    return '';
  }

  // --- Marcador detalhado ---
  function extrairMarcadorDetalhado(doc) {
    // Tabela de marcadores do processo
    const rows = doc.querySelectorAll('tr');
    const marcadores = [];

    rows.forEach(row => {
      const tds = row.querySelectorAll('td');
      if (tds.length < 2) return;

      let nome = '', cor = '', texto = '';

      tds.forEach(td => {
        // Imagem colorida = cor do marcador
        const img = td.querySelector('img');
        if (img) {
          cor = img.getAttribute('title') || img.getAttribute('alt') || '';
          if (!cor) {
            const src = img.getAttribute('src') || '';
            const corMatch = src.match(/marcador_(\w+)/i);
            if (corMatch) cor = corMatch[1];
          }
        }

        const text = td.textContent.trim();
        if (text && text.length > 1) {
          if (!nome) nome = text;
          else if (!texto) texto = text;
        }
      });

      if (nome) {
        marcadores.push({ nome, cor, texto });
      }
    });

    return marcadores.length > 0 ? marcadores : null;
  }

  function extrairTipoDocumento(nome) {
    const tipos = [
      'Ofício', 'Memorando', 'Despacho', 'Portaria', 'Requerimento',
      'Parecer', 'Nota Técnica', 'Relatório', 'Certidão', 'Declaração',
      'Notificação', 'Intimação', 'Edital', 'Contrato', 'Convênio',
      'Ata', 'Resolução', 'Instrução', 'Termo', 'Anexo', 'Informe',
      'Comunicação', 'Circular', 'Aviso', 'Ordem de Serviço'
    ];
    for (const tipo of tipos) {
      if (nome.toLowerCase().includes(tipo.toLowerCase())) return tipo;
    }
    return '';
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
        <button id="bm3-btn-capturar" class="bm3-primary" title="Captura rápida: só dados da tabela">Captura Rápida</button>
        <button id="bm3-btn-capturar-completo" class="bm3-primary bm3-deep" title="Captura completa: documentos, andamentos, anotações e marcadores">Captura Completa</button>
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
    document.getElementById('bm3-btn-capturar-completo').addEventListener('click', capturarCompleto);
    document.getElementById('bm3-btn-select-all').addEventListener('click', toggleSelectAll);
    document.getElementById('bm3-btn-copiar').addEventListener('click', copiarParaBM3);
    document.getElementById('bm3-btn-exportar-json').addEventListener('click', exportarJSON);
  }

  let capturedProcessos = [];
  let capturedDocsReport = [];
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

  async function capturarCompleto() {
    capturedProcessos = scrapeProcessos();
    const count = capturedProcessos.length;

    if (count === 0) {
      showToast('Nenhum processo encontrado na tabela.', true);
      return;
    }

    document.getElementById('bm3-count').textContent = count;

    const btnDeep = document.getElementById('bm3-btn-capturar-completo');
    btnDeep.disabled = true;
    btnDeep.textContent = 'Buscando...';

    const infoEl = document.getElementById('bm3-info');
    let docsTotal = 0, andTotal = 0, docsComConteudo = 0, docsFalharam = [];

    for (let i = 0; i < capturedProcessos.length; i++) {
      const proc = capturedProcessos[i];
      const procLabel = `Processo ${i + 1}/${count}: ${proc.numero}`;

      infoEl.innerHTML = `<strong>${procLabel}</strong><br><em>Abrindo processo...</em>`;

      const dados = await fetchDadosCompletos(proc.id_procedimento, (status) => {
        infoEl.innerHTML = `<strong>${procLabel}</strong><br><em>${status}</em>`;
      });

      proc.documentos = dados.documentos || [];
      proc.andamentos = dados.andamentos || [];
      proc.anotacao_completa = dados.anotacao_completa || proc.anotacao || '';
      proc.marcador_detalhado = dados.marcador_detalhado || null;
      proc.interessado = dados.interessado || '';
      proc.assunto = dados.assunto || '';
      proc.tipo_processo = dados.tipo_processo || '';
      proc.observacao_processo = dados.observacao_processo || '';

      docsTotal += proc.documentos.length;
      andTotal += proc.andamentos.length;

      // Buscar conteúdo de TODOS os documentos via iframe
      for (let j = 0; j < proc.documentos.length; j++) {
        const docItem = proc.documentos[j];
        if (docItem.id_documento) {
          infoEl.innerHTML =
            `<strong>${procLabel}</strong><br>` +
            `<em>Lendo documento ${j + 1}/${proc.documentos.length}: ${docItem.nome}</em>`;

          const resultado = await fetchConteudoDocumento(docItem.id_documento);
          docItem.conteudo = resultado.texto;
          docItem.conteudo_completo = resultado.completo;
          docItem.conteudo_erro = resultado.erro;

          if (resultado.texto) {
            docsComConteudo++;
          }
          if (resultado.erro) {
            docsFalharam.push({ processo: proc.numero, documento: docItem.nome, erro: resultado.erro });
          }

          await sleep(300);
        }
      }

      await sleep(300);
    }

    // Limpar iframe após captura
    destroyIframe();

    btnDeep.disabled = false;
    btnDeep.textContent = 'Captura Completa';

    // Resumo na barra de info
    infoEl.innerHTML =
      `<strong>${count}</strong> processo(s) | <strong>${docsTotal}</strong> doc(s) | ` +
      `<strong>${docsComConteudo}</strong> com conteúdo | <strong>${andTotal}</strong> andamento(s)` +
      (docsFalharam.length > 0 ? ` | <span style="color:#e74c3c"><strong>${docsFalharam.length}</strong> sem conteúdo</span>` : '');

    renderProcessList();

    // Alertar sobre documentos sem conteúdo
    if (docsFalharam.length > 0) {
      showToast(`${docsFalharam.length} documento(s) sem conteúdo extraível. Veja o console (F12) para detalhes.`, true);
      console.group('BM3 — Documentos sem conteúdo');
      console.table(docsFalharam);
      console.groupEnd();
      capturedDocsReport = docsFalharam;
    } else {
      showToast(`Captura completa: ${count} processos, ${docsTotal} documentos (${docsComConteudo} com conteúdo), ${andTotal} andamentos!`);
      capturedDocsReport = [];
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
          ${proc.documentos && proc.documentos.length > 0 ? `<span class="bm3-proc-tag docs">${proc.documentos.length} doc(s)</span>` : ''}
          ${proc.andamentos && proc.andamentos.length > 0 ? `<span class="bm3-proc-tag andamento">${proc.andamentos.length} andamento(s)</span>` : ''}
          ${proc.anotacao_completa ? `<span class="bm3-proc-tag anotacao">Anotação</span>` : ''}
        </div>
        ${proc.documentos && proc.documentos.length > 0 ? `
        <div class="bm3-proc-docs">
          ${proc.documentos.slice(0, 5).map(d => {
            const status = d.conteudo ? '&#9989;' : (d.conteudo_erro ? '&#9888;' : '');
            const statusClass = d.conteudo ? 'bm3-doc-ok' : (d.conteudo_erro ? 'bm3-doc-warn' : '');
            return `<div class="bm3-doc-item ${statusClass}">${status} ${d.tipo ? `<strong>${d.tipo}:</strong> ` : ''}${d.nome}${d.conteudo_erro ? ` <em class="bm3-doc-erro">(${d.conteudo_erro})</em>` : ''}</div>`;
          }).join('')}
          ${proc.documentos.length > 5 ? `<div class="bm3-doc-item bm3-doc-more">... e mais ${proc.documentos.length - 5} documento(s)</div>` : ''}
        </div>` : ''}
        ${proc.andamentos && proc.andamentos.length > 0 ? `
        <div class="bm3-proc-andamentos">
          ${proc.andamentos.slice(0, 3).map(a => `<div class="bm3-doc-item">${a.data ? `<strong>${a.data}</strong> — ` : ''}${a.descricao || a.unidade || ''}</div>`).join('')}
          ${proc.andamentos.length > 3 ? `<div class="bm3-doc-item bm3-doc-more">... e mais ${proc.andamentos.length - 3} andamento(s)</div>` : ''}
        </div>` : ''}
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
    return processos.map(p => ({
      numero: p.numero,
      tipo: p.tipo_processo || p.tipo || p.especificacao || '',
      interessado: p.interessado || '',
      assunto: p.assunto || p.especificacao || '',
      cpf_atribuido: '',
      unidade: p.unidade || '',
      marcador: p.marcador || '',
      prioridade: 'normal',
      status: 'pendente',
      prazo: null,
      anotacoes: p.anotacao_completa || p.anotacao || '',
      observacoes: [
        p.observacao_processo ? `Obs: ${p.observacao_processo}` : '',
        p.ponto_controle ? `Ponto de Controle: ${p.ponto_controle}` : '',
        p.atribuido ? `Atribuído para: ${p.atribuido}` : '',
        p.data_recebimento ? `Recebido em: ${p.data_recebimento}` : '',
        p.id_procedimento ? `ID SEI: ${p.id_procedimento}` : ''
      ].filter(Boolean).join('\n'),
      documentos: (p.documentos || []).map(d => ({
        id_documento: d.id_documento || '',
        nome: d.nome || '',
        tipo: d.tipo || '',
        descricao: d.descricao || '',
        conteudo: d.conteudo || '',
        conteudo_completo: d.conteudo_completo !== false,
        conteudo_erro: d.conteudo_erro || null
      })),
      andamentos: (p.andamentos || []).map(a => ({
        data: a.data || '',
        unidade: a.unidade || '',
        usuario: a.usuario || '',
        descricao: a.descricao || ''
      })),
      marcador_detalhado: p.marcador_detalhado || null
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
