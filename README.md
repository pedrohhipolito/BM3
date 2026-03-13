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

### Bookmarklet
1. Acesse o sistema e clique em **Importar do SEI**
2. Arraste o botão "Capturar SEI" para a barra de favoritos
3. No SEI, clique no favorito para copiar os dados dos processos
4. Cole os dados no campo de importação

### Colar dados
Copie dados do SEI (tabelas, listas) e cole no campo de importação — o sistema interpreta automaticamente números de processo no formato SEI.

## Atalhos de teclado

- `Ctrl+N` — Novo processo
- `Ctrl+F` — Focar na busca
- `Esc` — Fechar modais

## Estrutura

```
index.html       — Página principal
css/style.css    — Estilos
js/app.js        — Lógica da aplicação
```
