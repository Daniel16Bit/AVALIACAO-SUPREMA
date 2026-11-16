'use strict';
// Admin-only workbook workflow. No account is created by upload or review.
(() => {
  const {esc} = window.SupremaUI;
  let state = null,
    opened = false,
    rendered = null,
    notify = () => {},
    epoch = 0;
  const labels = {
    READY: 'Pronto',
    EXISTING: 'J\u00e1 cadastrado',
    DUPLICATE: 'Matr\u00edcula repetida',
    REVIEW_PERIOD: 'Revisar per\u00edodo',
    INVALID: 'Inv\u00e1lido',
    EXCLUDED: 'N\u00e3o selecionado'
  };
  const $ = s => rendered?.querySelector(s);
  const request = async (url, opt = {}) => {
    const r = await fetch(url, {credentials: 'same-origin', ...opt}),
      d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) window.dispatchEvent(new Event('suprema-session-expired'));
      throw Error(d.error || 'N\u00e3o foi poss\u00edvel concluir esta opera\u00e7\u00e3o.');
    }
    return d;
  };
  const post = (path, body) =>
    request('/api/admin/student-import/' + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
  function options(value) {
    return (
      '<option value="">Revisar</option>' +
      Array.from(
        {length: 30},
        (_, i) =>
          `<option value="${i + 1}" ${String(value) === String(i + 1) ? 'selected' : ''}>${i + 1}\u00ba per\u00edodo</option>`
      ).join('')
    );
  }
  function markup() {
    return `<section id="studentImportPanel" class="panel admin-panel student-import" ${opened ? '' : 'hidden'} aria-label="Importa\u00e7\u00e3o de alunos"></section>`;
  }
  function mount(onComplete) {
    rendered = document.querySelector('#studentImportPanel');
    notify = onComplete || (() => {});
    const entry = document.querySelector('#openStudentImport');
    if (entry)
      entry.onclick = () => {
        opened = true;
        draw();
        rendered.scrollIntoView({block: 'start', behavior: 'smooth'});
      };
    if (rendered) draw();
  }
  function message(text, bad = false) {
    const el = $('#importMessage');
    if (el) {
      el.textContent = text;
      el.hidden = !text;
      el.classList.toggle('import-error', bad);
    }
  }
  function counters(s, finished = false) {
    const items = finished
      ? [
          ['Contas criadas', s.created],
          ['Registros ignorados', s.ignored],
          ['Erros', s.errors]
        ]
      : [
          ['Alunos lidos', s.total],
          ['Prontos para criar', s.ready],
          ['J\u00e1 cadastrados', s.existing],
          ['Precisam de revis\u00e3o', s.invalid + s.review + s.duplicates]
        ];
    return `<div class="import-counters">${items.map(([label, n]) => `<div><span>${label}</span><strong>${n}</strong></div>`).join('')}</div>`;
  }
  function draw() {
    if (!rendered) return;
    rendered.hidden = !opened;
    if (!opened) return;
    const busy = state?.busy;
    rendered.innerHTML = `<div class="import-heading"><div><span class="eyebrow">CADASTRO EM LOTE</span><h3>Importar Alunos via Excel</h3><p>1. Escolha o arquivo &nbsp; 2. Revise os per\u00edodos &nbsp; 3. Confirme as contas</p></div><button type="button" class="btn" id="closeStudentImport" ${busy ? 'disabled' : ''}>Fechar</button></div>
   <div class="import-upload"><label class="btn ${state ? '' : 'primary'} file-btn">${state ? 'Escolher outra planilha' : 'Escolher planilha'}<input id="studentImportFile" type="file" accept=".xlsx,.xls" aria-label="Planilha de alunos" ${busy ? 'disabled' : ''}></label><div><strong>${esc(state?.preview?.file_name || state?.fileName || 'Arquivos .xlsx ou .xls (Excel 97-2003)')}</strong><span>At\u00e9 8 MB e 2.000 alunos. Matr\u00edcula em B3, Aluno em C3; dados a partir da linha 4. Todas as abas ser\u00e3o verificadas.</span></div></div>
   <p id="importMessage" class="import-message" role="status" aria-live="polite" ${busy ? '' : 'hidden'}>${busy ? esc(busy) : ''}</p><div id="importBody"></div>`;
    $('#closeStudentImport').onclick = () => {
      opened = false;
      rendered.hidden = true;
      document.querySelector('#openStudentImport')?.focus();
    };
    $('#studentImportFile').onchange = e => upload(e.target.files?.[0]);
    if (state?.report) {
      drawReport();
      return;
    }
    if (state?.preview) {
      drawPreview();
      if (busy) setDisabled(true);
    }
  }
  async function upload(file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name) || file.size > 8 * 1024 * 1024) {
      message('Escolha uma planilha .xlsx ou .xls de at\u00e9 8 MB.', true);
      return;
    }
    const turn = epoch;
    state = {
      fileName: file.name,
      busy: 'Lendo as abas e validando os alunos. Nenhuma conta est\u00e1 sendo criada.',
      page: 0,
      sheet: '',
      status: '',
      dirty: false
    };
    draw();
    try {
      const preview = await request('/api/admin/student-import/preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name)},
        body: file
      });
      if (turn !== epoch) return;
      state.preview = preview;
      state.busy = null;
      draw();
    } catch (e) {
      if (turn !== epoch) return;
      state.busy = null;
      draw();
      message(e.message, true);
    }
  }
  function drawPreview() {
    const p = state.preview,
      accepted = p.sheets.filter(s => s.accepted),
      ignored = p.sheets.filter(s => !s.accepted),
      count = p.summary.ready;
    $('#importBody').innerHTML = `${counters(p.summary)}
   <div class="import-note"><strong>Login pela matr\u00edcula.</strong> Como a planilha n\u00e3o informa e-mails, as novas contas usar\u00e3o um identificador interno <code>@alunos.suprema.local</code>, n\u00e3o um endere\u00e7o de contato. Nome e permiss\u00f5es seguem o cadastro individual de Aluno. Cadastros existentes n\u00e3o ser\u00e3o alterados.</div>
   ${ignored.length ? `<details class="import-details"><summary>${ignored.length} aba(s) n\u00e3o s\u00e3o listas de alunos e foram ignoradas</summary><ul>${ignored.map(s => `<li><strong>${esc(s.name)}</strong>: ${esc(s.reason)}</li>`).join('')}</ul></details>` : ''}
   <details class="import-details" ${accepted.some(s => !s.detected_period) ? 'open' : ''}><summary>Revisar per\u00edodo por aba (${accepted.length})</summary><div class="import-sheet-grid">${accepted
     .map(s => {
       const rows = p.rows.filter(r => r.sheet_id === s.id),
         periods = [...new Set(rows.map(r => r.period || ''))],
         period = periods.length === 1 ? periods[0] : '';
       return `<label><span>Aba ${esc(s.name)} <small>${s.rows} alunos${s.hidden ? ' \u00b7 oculta no Excel' : ''}</small></span><select data-sheet-period="${s.id}" aria-label="Per\u00edodo da aba ${esc(s.name)}">${options(period)}</select></label>`;
     })
     .join(
       ''
     )}</div><p class="muted">A altera\u00e7\u00e3o aplica-se \u00e0s linhas dessa aba. Voc\u00ea tamb\u00e9m pode editar cada aluno na tabela.</p></details>
   <div class="import-toolbar"><label>Mostrar aba<select id="importSheetFilter"><option value="">Todas as abas</option>${accepted.map(s => `<option value="${s.id}" ${s.id === state.sheet ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><label>Valida\u00e7\u00e3o<select id="importStatusFilter"><option value="">Todos os registros</option>${Object.entries(
     labels
   )
     .map(([k, v]) => `<option value="${k}" ${k === state.status ? 'selected' : ''}>${v}</option>`)
     .join(
       ''
     )}</select></label><button type="button" class="btn" id="reviewStudentImport">Validar altera\u00e7\u00f5es</button><span id="importDirty" class="import-dirty" ${state.dirty ? '' : 'hidden'}>Existem altera\u00e7\u00f5es pendentes de valida\u00e7\u00e3o.</span></div>
   <div id="importRows"></div>
   <div class="import-confirm"><div><h4>Confirmar cria\u00e7\u00e3o das contas</h4><p>Somente os registros v\u00e1lidos e selecionados ser\u00e3o criados. Os demais constar\u00e3o no relat\u00f3rio.</p></div>
   <p class="muted">Cada conta recebe uma senha provis\u00f3ria individual, gerada pelo sistema. A lista aparece uma \u00fanica vez ao concluir, para download; o aluno define a pr\u00f3pria senha no primeiro acesso. O per\u00edodo cadastral n\u00e3o matricula o aluno automaticamente em disciplinas.</p>
   <button type="button" class="btn primary" id="confirmStudentImport" ${state.dirty ? 'disabled' : ''}>${count ? 'Criar ' + count + ' conta(s) v\u00e1lida(s)' : 'Gerar relat\u00f3rio sem criar contas'}</button></div>`;
    drawRows();
    $('#importSheetFilter').onchange = e => {
      state.sheet = e.target.value;
      state.page = 0;
      drawRows();
    };
    $('#importStatusFilter').onchange = e => {
      state.status = e.target.value;
      state.page = 0;
      drawRows();
    };
    rendered.querySelectorAll('[data-sheet-period]').forEach(
      s =>
        (s.onchange = () => {
          p.rows.filter(r => r.sheet_id === s.dataset.sheetPeriod).forEach(r => (r.period = s.value || null));
          markDirty();
          drawRows();
        })
    );
    $('#reviewStudentImport').onclick = review;
    $('#confirmStudentImport').onclick = confirm;
  }
  function markDirty() {
    state.dirty = true;
    $('#importDirty').hidden = false;
    $('#confirmStudentImport').disabled = true;
  }
  function filtered() {
    return state.preview.rows.filter(
      r => (!state.sheet || r.sheet_id === state.sheet) && (!state.status || r.status === state.status)
    );
  }
  function drawRows() {
    const rows = filtered(),
      size = 50,
      pages = Math.max(1, Math.ceil(rows.length / size));
    state.page = Math.min(state.page, pages - 1);
    const page = rows.slice(state.page * size, (state.page + 1) * size);
    $('#importRows').innerHTML =
      `<div class="admin-scroll import-table-scroll"><table class="admin-table import-table"><thead><tr><th>Incluir</th><th>Nome do aluno</th><th>Matr\u00edcula</th><th>Per\u00edodo</th><th>Origem</th><th>Status da valida\u00e7\u00e3o</th></tr></thead><tbody>${page.map(r => `<tr data-import-row="${r.row_id}"><td><input type="checkbox" data-select-row="${r.row_id}" aria-label="Incluir ${esc(r.name || 'linha ' + r.excel_row)}" ${r.selected ? 'checked' : ''}></td><td><strong>${esc(r.name) || '<span class="muted">Nome ausente</span>'}</strong></td><td class="import-matricula">${esc(r.matricula) || '\u2014'}</td><td><input type="number" min="1" max="30" step="1" data-period-row="${r.row_id}" aria-label="Per\u00edodo de ${esc(r.name || 'linha ' + r.excel_row)}" value="${esc(r.period || '')}" placeholder="Revisar"></td><td>${esc(r.sheet)}<small class="cell-sub">Linha ${r.excel_row}</small></td><td><span class="import-status status-${r.status.toLowerCase()}">${labels[r.status]}</span><small class="cell-sub">${esc(r.message)}</small></td></tr>`).join('') || '<tr><td colspan="6">Nenhum registro neste filtro.</td></tr>'}</tbody></table></div>
   <div class="import-pagination"><span>${rows.length} registro(s) neste filtro \u00b7 P\u00e1gina ${state.page + 1} de ${pages}</span><div><button class="btn" type="button" id="importPrevious" ${state.page === 0 ? 'disabled' : ''}>Anterior</button><button class="btn" type="button" id="importNext" ${state.page >= pages - 1 ? 'disabled' : ''}>Pr\u00f3xima</button></div></div>`;
    $('#importPrevious').onclick = () => {
      state.page--;
      drawRows();
    };
    $('#importNext').onclick = () => {
      state.page++;
      drawRows();
    };
    rendered.querySelectorAll('[data-period-row]').forEach(
      input =>
        (input.oninput = () => {
          state.preview.rows.find(r => r.row_id === input.dataset.periodRow).period = input.value || null;
          markDirty();
        })
    );
    rendered.querySelectorAll('[data-select-row]').forEach(
      input =>
        (input.onchange = () => {
          state.preview.rows.find(r => r.row_id === input.dataset.selectRow).selected = input.checked;
          markDirty();
        })
    );
  }
  function setDisabled(disabled) {
    rendered.querySelectorAll('input,select,button').forEach(el => (el.disabled = disabled));
  }
  async function review() {
    if (state.busy) return;
    const turn = epoch;
    state.busy = 'Validando altera\u00e7\u00f5es e cadastros existentes...';
    setDisabled(true);
    message(state.busy);
    try {
      const p = state.preview;
      const next = await post('review', {
        token: p.token,
        revision: p.revision,
        rows: p.rows.map(r => ({row_id: r.row_id, period: r.period, selected: r.selected}))
      });
      if (turn !== epoch) return;
      state.preview = next;
      state.dirty = false;
      state.busy = null;
      draw();
      message('Revis\u00e3o atualizada. Nenhuma conta foi criada.');
    } catch (e) {
      if (turn !== epoch) return;
      state.busy = null;
      draw();
      message(e.message, true);
    }
  }
  async function confirm() {
    if (state.busy || state.dirty) return;
    const p = state.preview;
    const turn = epoch;
    state.busy = 'Criando somente as contas v\u00e1lidas. N\u00e3o feche esta tela.';
    setDisabled(true);
    message(state.busy);
    try {
      // As senhas provis\u00f3rias ficam fora do relat\u00f3rio: n\u00e3o entram nos downloads CSV/JSON dele.
      const {
        credentials = [],
        credentials_notice = '',
        ...report
      } = await post('confirm', {token: p.token, revision: p.revision});
      if (turn !== epoch) return;
      state.report = report;
      state.credentials = credentials;
      state.credentialsNotice = credentials_notice;
      state.busy = null;
      draw();
      await notify();
    } catch (e) {
      if (turn !== epoch) return;
      state.busy = null;
      draw();
      message(
        e.message +
          ' Voc\u00ea pode tentar confirmar novamente; a mesma importa\u00e7\u00e3o n\u00e3o cria contas em duplicidade.',
        true
      );
    }
  }
  const csvCell = v => {
    let s = String(v ?? '');
    if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function drawReport() {
    const r = state.report;
    const creds = state.credentials || [];
    const credsBox = creds.length
      ? `<div class="import-note"><strong>${creds.length} senha(s) provis\u00f3ria(s) individual(is).</strong> ${esc(state.credentialsNotice)} <button type="button" class="btn primary" id="downloadImportCredentials">Baixar senhas provis\u00f3rias (CSV)</button></div>`
      : state.credentialsNotice
        ? `<div class="import-note">${esc(state.credentialsNotice)}</div>`
        : '';
    $('#importBody').innerHTML =
      `<div class="import-report-title"><h4>Importa\u00e7\u00e3o conclu\u00edda</h4><p>Revise o resumo e baixe o relat\u00f3rio. Contas que j\u00e1 existiam mantiveram os dados e as senhas.</p></div>${counters(r.summary, true)}${credsBox}<div class="import-report-actions"><button type="button" class="btn primary" id="downloadImportCsv">Baixar relat\u00f3rio CSV</button><button type="button" class="btn" id="downloadImportJson">Baixar relat\u00f3rio JSON</button></div><ul class="import-report-notes">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul><details class="import-details"><summary>Ver detalhes das ${r.summary.total} linhas</summary><div class="admin-scroll import-table-scroll"><table class="admin-table"><thead><tr><th>Aluno</th><th>Matr\u00edcula</th><th>Per\u00edodo</th><th>Resultado</th><th>Detalhe</th></tr></thead><tbody>${r.rows.map(row => `<tr><td>${esc(row.name)}</td><td>${esc(row.matricula)}</td><td>${esc(row.period) || '\u2014'}</td><td>${esc(row.result)}</td><td>${esc(row.reason)}</td></tr>`).join('')}</tbody></table></div></details>`;
    const credsButton = $('#downloadImportCredentials');
    if (credsButton)
      credsButton.onclick = () => {
        const rows = [
          ['Aluno', 'Matricula (login)', 'Periodo', 'Senha provisoria'],
          ...creds.map(c => [c.name, c.matricula, c.period, c.password])
        ];
        download(
          'SENHAS_PROVISORIAS_' + r.import_id + '.csv',
          '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'),
          'text/csv;charset=utf-8'
        );
      };
    $('#downloadImportJson').onclick = () =>
      download(
        'RELATORIO_IMPORTACAO_' + r.import_id + '.json',
        JSON.stringify(r, null, 2),
        'application/json;charset=utf-8'
      );
    $('#downloadImportCsv').onclick = () => {
      const cell = csvCell;
      const rows = [
        ['Aluno', 'Matricula', 'Periodo', 'Aba', 'Linha', 'Resultado', 'Detalhe', 'Identificador interno'],
        ...r.rows.map(x => [x.name, x.matricula, x.period, x.sheet, x.excel_row, x.result, x.reason, x.email])
      ];
      download(
        'RELATORIO_IMPORTACAO_' + r.import_id + '.csv',
        '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n'),
        'text/csv;charset=utf-8'
      );
    };
  }
  window.SupremaStudentImport = {
    markup,
    mount,
    reset() {
      epoch++;
      state = null;
      opened = false;
      rendered = null;
    }
  };
  window.addEventListener('suprema-session-expired', () => window.SupremaStudentImport.reset());
})();
