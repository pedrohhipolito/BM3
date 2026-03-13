# Controle de Processos SEI — CBMMG

Sistema web para gerenciamento e acompanhamento de processos do SEI (Sistema Eletrônico de Informações) no Corpo de Bombeiros Militar de Minas Gerais.

## Como usar

1. Abra o arquivo `index.html` no navegador
2. Os dados ficam salvos no navegador (localStorage)

## Funcionalidades

- Cadastro, edição e exclusão de processos
- Campos: Nº processo, tipo, interessado, assunto, CPF atribuído, unidade, marcador, prioridade, status, prazo, anotações, observações
- Histórico de andamentos por processo
- Filtros por status, prioridade, marcador e busca livre
- Ordenação por qualquer coluna
- Dashboard com contadores (pendentes, em andamento, urgentes, prazos vencidos)
- Alerta visual para prazos vencidos e próximos do vencimento
- Exportar/importar dados em JSON (backup)
- Máscara de CPF automática

## Importação do SEI

### Extensão Chrome BM3 (Recomendado)

Extensão própria que captura processos diretamente da tela do SEI.

**Instalação:**
1. Abra `chrome://extensions` no Chrome
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `extensao/` deste projeto

**Uso:**
1. Acesse o SEI e vá para a tela de **Controle de Processos**
2. Clique no botão **B3** (vermelho, canto inferior direito da tela)
3. Clique em **Capturar Processos** — a extensão lê a tabela do SEI
4. Selecione os processos desejados
5. Clique em **Copiar para BM3** ou **Exportar JSON**
6. No BM3, use **Importar > Colar Dados** e cole (Ctrl+V), ou **Importar JSON**

**Dados capturados automaticamente:**
- Número do processo, tipo/especificação, marcador, atribuição
- Anotações, ponto de controle, data de recebimento, status lido/não lido

### Colar dados
Copie dados do SEI (tabelas, listas) e cole no campo de importação — o sistema interpreta automaticamente números de processo no formato SEI.

### Importar PDF
Exporte um PDF do SEI e importe pelo botão **Importar PDF** — o sistema extrai automaticamente os números de processo.

## Atalhos de teclado

- `Ctrl+N` — Novo processo
- `Ctrl+F` — Focar na busca
- `Esc` — Fechar modais

## Estrutura

```
index.html              — Página principal
css/style.css           — Estilos
js/app.js               — Lógica da aplicação
extensao/               — Extensão Chrome para captura do SEI
  manifest.json         — Configuração da extensão
  popup.html            — Popup da extensão
  js/content.js         — Script que roda na página do SEI
  js/popup.js           — Script do popup
  css/bm3-sei.css       — Estilos injetados no SEI
  icons/                — Ícones da extensão
```
