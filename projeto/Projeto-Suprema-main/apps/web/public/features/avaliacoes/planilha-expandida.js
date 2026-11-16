/* PATCH V11.1: modo ampliado da planilha; nao altera dados nem lancamentos. */
(function () {
  'use strict';
  function init() {
    const screen = document.getElementById('appScreen');
    const launch = document.getElementById('launchTab');
    const table = launch && launch.querySelector('.table-wrap');
    if (!screen || !launch || !table || document.getElementById('supremaExpandSheet')) return;
    const tools = document.createElement('div');
    tools.className = 'suprema-sheet-tools';
    const button = document.createElement('button');
    button.id = 'supremaExpandSheet';
    button.type = 'button';
    button.className = 'suprema-expand-btn';
    button.setAttribute('aria-pressed', 'false');
    function update(expanded) {
      screen.classList.toggle('suprema-sheet-expanded', expanded);
      button.setAttribute('aria-pressed', String(expanded));
      button.textContent = expanded ? '↙ Voltar ao modo normal' : '⛶ Expandir planilha';
      button.title = expanded ? 'Restaurar visualizacao original' : 'Aumentar espaco da planilha';
    }
    button.addEventListener('click', () => update(!screen.classList.contains('suprema-sheet-expanded')));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && screen.classList.contains('suprema-sheet-expanded')) update(false);
    });
    tools.appendChild(button);
    table.parentNode.insertBefore(tools, table);
    update(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
