// Popup script - verifica se estamos em uma página SEI
(function() {
  const statusEl = document.getElementById('status');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) {
      statusEl.textContent = 'Não foi possível verificar a aba atual.';
      statusEl.className = 'status warn';
      return;
    }

    const url = tab.url;
    const isSEI = url.includes('/sei/') ||
                  url.includes('controlador.php?acao=procedimento');

    if (isSEI) {
      statusEl.textContent = 'SEI detectado! Use o botão B3 na página.';
      statusEl.className = 'status ok';
    } else {
      statusEl.textContent = 'Navegue até o SEI para capturar processos.';
      statusEl.className = 'status warn';
    }
  });
})();
