'use strict';
(() => {
  const notice = document.createElement('div');
  notice.id = 'serviceStatus';
  notice.className = 'service-status';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  document.body.prepend(notice);
  let busy = false;
  async function check() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/health', {signal: AbortSignal.timeout(4000), cache: 'no-store'});
      if (!response.ok) throw Error('offline');
      const status = await response.json();
      const failed = (status.modules || []).filter(module => module.status !== 'ready');
      notice.hidden = failed.length === 0;
      notice.textContent = failed.length
        ? 'Algumas funcoes estao temporariamente indisponiveis. As demais continuam acessiveis.'
        : '';
    } catch {
      notice.hidden = false;
      notice.textContent =
        'Servidor de dados indisponivel. A interface continua aberta. Aguarde a reconexao antes de salvar.';
    } finally {
      busy = false;
    }
  }
  void check();
  setInterval(() => void check(), 15000);
  window.addEventListener('online', () => void check());
})();
