'use strict';
/* Comprovantes das ações do aluno.
   - Aluno: lista os próprios comprovantes e baixa o PDF de cada um.
   - Administrador e CSTI: verificam um código e pesquisam comprovantes.
   O que vale é o registro do sistema: a verificação consulta o servidor pelo código e nunca
   confia no arquivo. Professores e Coordenação não têm estas telas. */
(() => {
  const {esc, when, guard, panel, table} = window.SupremaUI;
  const api = (route, options = {}) => window.SupremaAPI.request('/api/receipts' + route, options);
  const send = (route, body) => api(route, {method: 'POST', body: JSON.stringify(body ?? {})});
  const pdfLink = code =>
    `<a class="btn" href="/api/receipts/${encodeURIComponent(code)}/pdf" download="comprovante-${esc(code)}.pdf">Baixar PDF</a>`;
  const heading = (title, subtitle, actions = '') =>
    `<div class="section-heading mod-heading"><div><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div><div class="mod-actions">${actions}</div></div>`;

  // Shown right after an action that issued a receipt (other modules call it).
  window.SupremaUI.receiptCard =
    code => `<section class="panel admin-panel receipt-card" role="status"><h3>Comprovante gerado</h3>
    <p>Guarde o código de verificação. O CSTI confere a autenticidade no sistema a partir dele.</p>
    <p class="receipt-code">${esc(code)}</p>
    <div class="mod-row-actions">${pdfLink(code).replace('class="btn"', 'class="btn primary"').replace('Baixar PDF', 'Baixar comprovante (PDF)')}</div>
    <p class="muted">O comprovante registra que você enviou, nunca o que você respondeu. Ele também fica em "Meus comprovantes".</p></section>`;

  // ------------------------------------------------------------------------------ Aluno
  async function studentList() {
    const view = window.SupremaUI.studentView(true),
      items = await api('/mine');
    const rows = items.map(
      r =>
        `<tr><td><strong>${esc(r.title)}</strong></td><td>${esc(r.detail)}</td><td>${esc(when(r.issued_at))}</td><td><code class="receipt-code-small">${esc(r.code)}</code></td><td>${pdfLink(r.code)}</td></tr>`
    );
    view.innerHTML =
      heading(
        'Meus comprovantes',
        'Cada envio seu gera um comprovante com código de verificação.',
        '<button class="btn" type="button" id="receiptBack">Voltar às minhas notas</button>'
      ) +
      panel(
        'Comprovantes',
        table(
          ['O que foi feito', 'Referência', 'Registrado em', 'Código de verificação', 'Arquivo'],
          rows,
          'Você ainda não tem comprovantes. Eles aparecem aqui depois de cada envio.'
        ),
        'O comprovante prova que o envio foi registrado. Ele não contém as respostas.'
      );
    document.getElementById('receiptBack').onclick = () => window.SupremaUI.studentView(false);
  }

  // ------------------------------------------------------------- Administrador e CSTI
  async function verifyScreen(container) {
    container.innerHTML =
      heading(
        'Comprovantes',
        'Confira se um comprovante apresentado por um aluno foi realmente emitido pelo sistema.'
      ) +
      panel(
        'Verificar um código',
        `<form id="receiptVerify" class="receipt-verify"><label>Código de verificação<input name="code" autocomplete="off" spellcheck="false" placeholder="AS-XXXX-XXXX-XXXX-XXXX" required></label><button class="btn primary" type="submit">Verificar</button></form><div id="receiptResult" aria-live="polite"></div>`,
        'Digite o código que aparece no PDF. Maiúsculas, minúsculas, espaços e traços não fazem diferença.'
      ) +
      panel(
        'Comprovantes emitidos',
        `<form id="receiptSearch" class="receipt-verify"><label>Pesquisar por aluno, matrícula ou código<input name="search" autocomplete="off"></label><button class="btn" type="submit">Pesquisar</button></form><div id="receiptList"></div>`,
        'Os 200 mais recentes. Cada linha mostra quem enviou, o quê e quando, nunca o conteúdo das respostas.'
      );
    const result = container.querySelector('#receiptResult'),
      list = container.querySelector('#receiptList');
    const show = items => {
      list.innerHTML = table(
        ['Aluno', 'Matrícula', 'O que foi feito', 'Referência', 'Registrado em', 'Código', 'Arquivo'],
        items.map(
          r =>
            `<tr><td>${esc(r.student_name)}</td><td>${esc(r.student_matricula)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td><td>${esc(when(r.issued_at))}</td><td><code class="receipt-code-small">${esc(r.code)}</code></td><td>${pdfLink(r.code)}</td></tr>`
        ),
        'Nenhum comprovante encontrado.'
      );
    };
    container.querySelector('#receiptVerify').onsubmit = guard(async e => {
      e.preventDefault();
      const checked = await send('/verify', {code: new FormData(e.target).get('code')}),
        r = checked.receipt;
      result.innerHTML = checked.valid
        ? `<div class="receipt-result valid"><strong>✓ Comprovante autêntico.</strong> Este código foi emitido pelo sistema.<dl><dt>Aluno</dt><dd>${esc(r.student_name)} · matrícula ${esc(r.student_matricula)}</dd><dt>O que foi feito</dt><dd>${esc(r.title)}</dd><dt>Referência</dt><dd>${esc(r.detail)}</dd><dt>Registrado em</dt><dd>${esc(when(r.issued_at))}</dd><dt>Código</dt><dd>${esc(r.code)}</dd></dl><p class="muted">Compare estes dados com os do PDF apresentado. Se algum for diferente, o arquivo foi alterado.</p></div>`
        : '<div class="receipt-result invalid"><strong>✗ Código não encontrado.</strong> Nenhum comprovante com este código foi emitido pelo sistema. Confira a digitação; se estiver correta, o comprovante não é autêntico.</div>';
    });
    container.querySelector('#receiptSearch').onsubmit = guard(async e => {
      e.preventDefault();
      show(await send('/search', {search: new FormData(e.target).get('search')}));
    });
    show(await send('/search', {search: ''}));
  }

  window.SupremaModules.add('ALUNO', {
    boot: guard(async slot => {
      slot.innerHTML = '<button class="btn student-refresh" type="button">Meus comprovantes</button>';
      slot.querySelector('button').onclick = guard(studentList);
    })
  });
  for (const role of ['ADMIN', 'CSTI'])
    window.SupremaModules.add(role, {label: 'Comprovantes', glyph: '▤', start: guard(verifyScreen)});
})();
