'use strict';
/* Módulo OSCE: telas do Núcleo de Avaliação e das contas operacionais do ambulatório.
   Registra os seus itens em window.SupremaModules e desenha dentro da tela de perfil; não lê nem
   substitui variáveis de outros arquivos da interface. As notas vêm prontas do servidor, calculadas
   pelas fórmulas da planilha da instituição; esta tela só as exibe. */
(() => {
  const {esc, modal, when, toast, guard, panel, table} = window.SupremaUI;
  const api = (route, options = {}) => window.SupremaAPI.request('/api/osce' + route, options);
  const send = (route, body, method = 'POST') => api(route, {method, body: JSON.stringify(body ?? {})});
  const byId = id => document.getElementById(id);
  const content = () => byId('profileContent');
  const STATUS = {RASCUNHO: 'Rascunho', LIBERADO: 'Liberado', ENCERRADO: 'Encerrado'};
  // The answers carry the words of the institution's spreadsheet.
  const VALUE = {SIM: 'Fez', NAO: 'Não fez'};
  const decimal = value =>
    value === null || value === undefined
      ? '—'
      : Number(value).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const plain = value => (value === null || value === undefined ? '—' : String(value).replace('.', ','));

  const badge = status =>
    `<span class="state-badge ${status === 'LIBERADO' ? 'positive-state' : 'muted-state'}">${STATUS[status] || esc(status)}</span>`;
  const heading = (title, subtitle, actions = '') =>
    `<div class="section-heading mod-heading"><div><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div><div class="mod-actions">${actions}</div></div>`;
  const on = (selector, handler) =>
    content()
      .querySelectorAll(selector)
      .forEach(el => {
        el.onclick = guard(() => handler(el));
      });

  // ---------------------------------------------------------------- Núcleo de Avaliação
  async function listEvents() {
    const events = await api('/events');
    const rows = events.map(
      e => `<tr><td><strong>${esc(e.title)}</strong></td><td>${badge(e.status)}</td><td>${e.stations}</td><td>${e.students}</td><td>${e.answered} de ${e.stations * e.students}</td>
      <td class="mod-row-actions"><button class="btn" type="button" data-open="${e.id}">${e.status === 'RASCUNHO' ? 'Montar' : 'Abrir'}</button>${e.status === 'RASCUNHO' ? '' : `<button class="btn" type="button" data-results="${e.id}">Resultados</button>`}</td></tr>`
    );
    content().innerHTML =
      heading(
        'Avaliações OSCE',
        'Monte o OSCE por período e estação, libere para o ambulatório e acompanhe as respostas.',
        '<button class="btn primary" type="button" id="osceNew">Novo OSCE</button>'
      ) +
      panel(
        'OSCE cadastrados',
        table(
          ['OSCE', 'Situação', 'Estações', 'Alunos', 'Respostas', 'Ações'],
          rows,
          'Nenhum OSCE cadastrado. Use "Novo OSCE" para começar.'
        )
      );
    on('[data-open]', el => openEvent(Number(el.dataset.open)));
    on('[data-results]', el => showResults(Number(el.dataset.results)));
    byId('osceNew').onclick = () =>
      modal({
        title: 'Novo OSCE',
        button: 'Criar rascunho',
        body: `<label>Ano<input name="year" type="number" min="2000" max="2200" value="${new Date().getFullYear()}" required></label>
        <label>Semestre<select name="semester" required><option value="1">1º semestre</option><option value="2">2º semestre</option></select></label>
        <label>Rodada<select name="round" required><option value="1">OSCE 1</option><option value="2">OSCE 2</option></select></label>
        <label>Período<input name="period" type="number" min="1" max="30" step="1" required></label>
        <p class="muted">O rascunho começa com quatro estações e com os alunos ativos do período. Tudo pode ser ajustado antes de liberar.</p>`,
        onSubmit: async body => {
          const created = await send('/events', {
            year: Number(body.year),
            semester: body.semester,
            round: Number(body.round),
            period: body.period
          });
          await openEvent(created.id);
        }
      });
  }

  // Editor state of the event being built; kept in memory until "Salvar rascunho".
  let draft = null;

  async function openEvent(id) {
    const d = await api('/events/' + id);
    draft = {
      event: d.event,
      stations: d.stations.map(s => ({name: s.name, questions: s.questions.map(q => ({text: q.text}))})),
      selected: new Set(d.student_ids),
      candidates: d.candidates,
      submissions: d.submissions
    };
    renderEvent();
  }

  function renderEvent() {
    const {event, stations, candidates, selected, submissions} = draft,
      editable = event.status === 'RASCUNHO',
      lock = editable ? '' : 'disabled';
    const actions =
      '<button class="btn" type="button" id="osceBack">Voltar à lista</button>' +
      (editable
        ? '<button class="btn" type="button" id="osceSave">Salvar rascunho</button><button class="btn primary" type="button" id="osceRelease">Liberar para o ambulatório</button><button class="btn" type="button" id="osceDelete">Excluir rascunho</button>'
        : `<button class="btn primary" type="button" id="osceResults">Ver resultados</button>${event.status === 'LIBERADO' ? '<button class="btn" type="button" id="osceClose">Encerrar</button>' : ''}${event.status === 'ENCERRADO' || !submissions ? `<button class="btn" type="button" id="osceReopen">${event.status === 'ENCERRADO' ? 'Reabrir para respostas' : 'Voltar a rascunho'}</button>` : ''}`);
    const identity = `<div class="admin-form">
      <label>Ano<input id="osceYear" type="number" min="2000" max="2200" value="${esc(event.year)}" ${lock}></label>
      <label>Semestre<select id="osceSemester" ${lock}><option value="1" ${event.semester === '1' ? 'selected' : ''}>1º semestre</option><option value="2" ${event.semester === '2' ? 'selected' : ''}>2º semestre</option></select></label>
      <label>Rodada<input id="osceRound" type="number" min="1" max="9" value="${esc(event.round)}" ${lock}></label>
      <label>Período<input id="oscePeriod" type="number" min="1" max="30" value="${esc(event.period)}" ${lock}></label></div>`;
    const key = `<label class="mod-check"><input id="osceKey" type="checkbox" ${event.key_question ? 'checked' : ''} ${lock}> Incluir a pergunta-chave como primeira pergunta de todas as estações</label>
      <label>Texto da pergunta-chave<input id="osceKeyText" maxlength="300" value="${esc(event.key_question_text)}" ${lock}></label>
      <p class="muted">A resposta é registrada em cada estação. O efeito dela na nota depende de definição institucional e ainda não é aplicado em nenhum cálculo.</p>`;
    const stationPanels = stations
      .map((station, s) =>
        panel(
          `Estação ${s + 1}`,
          `<label>Nome da estação<input data-station-name="${s}" maxlength="80" value="${esc(station.name)}" ${lock}></label>
       <div class="mod-questions">${event.key_question ? `<div class="mod-question key"><span class="mod-tag">Pergunta-chave</span><span>${esc(event.key_question_text)}</span></div>` : ''}
        ${station.questions.map((q, i) => `<div class="mod-question"><label class="sr-only" for="osceQ${s}_${i}">Pergunta ${i + 1} da estação ${s + 1}</label><input id="osceQ${s}_${i}" data-question="${s}:${i}" maxlength="300" placeholder="Texto da pergunta (resposta Fez ou Não fez, com comentário)" value="${esc(q.text)}" ${lock}>${editable ? `<button class="btn" type="button" data-remove-question="${s}:${i}" aria-label="Remover pergunta ${i + 1}">Remover</button>` : ''}</div>`).join('')}
        ${!event.key_question && !station.questions.length ? '<p class="muted">Esta estação ainda não tem perguntas.</p>' : ''}</div>
       ${editable ? `<div class="mod-row-actions"><button class="btn" type="button" data-add-question="${s}">Adicionar pergunta</button><button class="btn" type="button" data-remove-station="${s}">Remover estação</button></div>` : ''}`
        )
      )
      .join('');
    const studentRows = candidates.map(
      c =>
        `<tr><td><input type="checkbox" data-student="${c.id}" aria-label="Incluir ${esc(c.name)}" ${selected.has(c.id) ? 'checked' : ''} ${lock}></td><td>${esc(c.matricula)}</td><td>${esc(c.name)}</td></tr>`
    );
    content().innerHTML =
      heading(
        esc(event.title),
        `Situação: ${badge(event.status)}${editable ? '' : ' · a estrutura fica travada depois da liberação, para que as respostas não percam o sentido.'}`,
        actions
      ) +
      panel('Identificação', identity) +
      panel('Pergunta-chave', key) +
      stationPanels +
      (editable ? '<p><button class="btn" type="button" id="osceAddStation">Adicionar estação</button></p>' : '') +
      panel(
        `Alunos (${selected.size} de ${candidates.length} selecionados)`,
        (editable
          ? '<div class="mod-row-actions"><button class="btn" type="button" id="osceAll">Marcar todos</button><button class="btn" type="button" id="osceNone">Desmarcar todos</button></div>'
          : '') + table(['Incluir', 'Matrícula', 'Nome'], studentRows, 'Nenhum aluno ativo cadastrado neste período.'),
        'Lista que o ambulatório verá ao responder. Começa com os alunos ativos do período.'
      );
    wireEvent(editable);
  }

  // Copies what is typed into the in-memory draft, so a re-render never loses text.
  function readInputs() {
    const {event, stations} = draft,
      value = id => byId(id)?.value ?? '';
    Object.assign(event, {
      year: Number(value('osceYear')),
      semester: value('osceSemester'),
      round: Number(value('osceRound')),
      period: value('oscePeriod'),
      key_question: !!byId('osceKey')?.checked,
      key_question_text: value('osceKeyText')
    });
    content()
      .querySelectorAll('[data-station-name]')
      .forEach(el => {
        stations[Number(el.dataset.stationName)].name = el.value;
      });
    content()
      .querySelectorAll('[data-question]')
      .forEach(el => {
        const [s, i] = el.dataset.question.split(':').map(Number);
        stations[s].questions[i].text = el.value;
      });
    content()
      .querySelectorAll('[data-student]')
      .forEach(el => {
        const id = Number(el.dataset.student);
        if (el.checked) draft.selected.add(id);
        else draft.selected.delete(id);
      });
  }

  async function saveDraft() {
    readInputs();
    const {event, stations, selected} = draft;
    await send(
      '/events/' + event.id,
      {
        revision: event.revision,
        year: event.year,
        semester: event.semester,
        round: event.round,
        period: event.period,
        key_question: event.key_question,
        key_question_text: event.key_question_text,
        stations: stations.map(s => ({name: s.name, questions: s.questions.filter(q => q.text.trim())})),
        student_ids: [...selected]
      },
      'PUT'
    );
    await openEvent(event.id);
  }

  function wireEvent(editable) {
    const id = draft.event.id,
      change = fn =>
        guard(el => {
          readInputs();
          fn(el);
          renderEvent();
        });
    byId('osceBack').onclick = guard(listEvents);
    if (editable) {
      byId('osceSave').onclick = guard(async () => {
        await saveDraft();
        toast('Rascunho salvo. O ambulatório só vê o OSCE depois de liberado.');
      });
      byId('osceRelease').onclick = guard(async () => {
        if (
          !confirm(
            'Liberar este OSCE para o ambulatório? Depois da liberação as estações e perguntas não podem mais ser alteradas.'
          )
        )
          return;
        await saveDraft();
        await send(`/events/${id}/release`, {revision: draft.event.revision});
        await openEvent(id);
        toast('OSCE liberado. As contas do ambulatório já podem responder.');
      });
      byId('osceDelete').onclick = guard(async () => {
        if (!confirm('Excluir este rascunho de OSCE?')) return;
        await api('/events/' + id, {method: 'DELETE'});
        await listEvents();
        toast('Rascunho excluído.');
      });
      byId('osceAddStation').onclick = change(() =>
        draft.stations.push({name: 'Estação ' + (draft.stations.length + 1), questions: []})
      );
      byId('osceAll')?.addEventListener(
        'click',
        change(() => {
          draft.selected = new Set(draft.candidates.map(c => c.id));
        })
      );
      byId('osceNone')?.addEventListener(
        'click',
        change(() => {
          draft.selected = new Set();
        })
      );
      byId('osceKey').onchange = change(() => {});
      byId('osceKeyText').onchange = change(() => {});
      content()
        .querySelectorAll('[data-add-question]')
        .forEach(el => {
          el.onclick = change(() => draft.stations[Number(el.dataset.addQuestion)].questions.push({text: ''}));
        });
      content()
        .querySelectorAll('[data-remove-question]')
        .forEach(el => {
          el.onclick = change(() => {
            const [s, i] = el.dataset.removeQuestion.split(':').map(Number);
            draft.stations[s].questions.splice(i, 1);
          });
        });
      content()
        .querySelectorAll('[data-remove-station]')
        .forEach(el => {
          el.onclick = change(() => draft.stations.splice(Number(el.dataset.removeStation), 1));
        });
      return;
    }
    byId('osceResults').onclick = guard(() => showResults(id));
    byId('osceClose')?.addEventListener(
      'click',
      guard(async () => {
        if (!confirm('Encerrar este OSCE? O ambulatório deixa de poder responder.')) return;
        await send(`/events/${id}/close`);
        await openEvent(id);
        toast('OSCE encerrado.');
      })
    );
    byId('osceReopen')?.addEventListener(
      'click',
      guard(async () => {
        await send(`/events/${id}/reopen`);
        await openEvent(id);
        toast('Situação atualizada.');
      })
    );
  }

  async function showResults(id, order = 'name') {
    const d = await api(`/events/${id}/results`);
    const cell = answer =>
      answer
        ? `<strong>${VALUE[answer.value] || esc(answer.value)}</strong>${answer.comment ? `<small class="mod-comment">${esc(answer.comment)}</small>` : ''}`
        : '—';
    const stations = d.stations
      .map(station => {
        const legend = `<ol class="osce-legend">${station.questions.map(q => `<li>${q.is_key ? '<span class="mod-tag">Pergunta-chave</span> ' : ''}${esc(q.text)} <span class="muted">· Fez ${q.sim} · Não fez ${q.nao}</span></li>`).join('')}</ol>`;
        const rows = station.rows.map(
          row => `<tr><td>${esc(row.student.name)}</td><td>${esc(row.student.matricula)}</td>${station.questions.map(q => `<td>${row.submission ? cell(row.submission.answers[q.id]) : '—'}</td>`).join('')}
        <td>${plain(row.hits)}</td><td><strong>${decimal(row.grade)}</strong></td>
        <td>${row.submission ? esc(row.submission.account || '') + '<small class="mod-comment">' + esc(when(row.submission.created_at)) + '</small>' : '<span class="muted">Aguardando</span>'}</td>
        <td>${row.submission ? `<button class="btn" type="button" data-void="${row.submission.id}" data-name="${esc(row.student.name)}">Anular</button>` : ''}</td></tr>`
        );
        const voided = station.voided.length
          ? `<details class="osce-voided"><summary>Respostas anuladas (${station.voided.length})</summary>${table(
              ['Aluno', 'Respostas', 'Registrada por', 'Anulada por', 'Motivo'],
              station.voided.map(
                v =>
                  `<tr><td>${esc(station.rows.find(r => r.student.id === v.student_id)?.student.name || '')}</td><td>${station.questions.map(q => VALUE[v.answers[q.id]?.value] || '—').join(' · ')}</td><td>${esc(v.account || '')} · ${esc(when(v.created_at))}</td><td>${esc(v.voided_by || '')} · ${esc(when(v.voided_at))}</td><td>${esc(v.reason || '')}</td></tr>`
              ),
              ''
            )}</details>`
          : '';
        return panel(
          `${esc(station.name)} · ${station.answered} de ${station.total} alunos avaliados · ${station.items} ${station.items === 1 ? 'item' : 'itens'} · média ${decimal(station.average)}`,
          legend +
            table(
              [
                'Aluno',
                'Matrícula',
                ...station.questions.map(
                  q => `<abbr title="${esc(q.text)}">P${q.position}${q.is_key ? ' (chave)' : ''}</abbr>`
                ),
                'Acertos',
                'Nota',
                'Registrada por',
                'Ação'
              ],
              rows,
              'Nenhum aluno na lista.'
            ) +
            voided
        );
      })
      .join('');
    // "Resultado Final" of the spreadsheet: one row per student, one column per station.
    const listed = [...d.consolidated.students];
    if (order === 'final') listed.sort((a, b) => (b.final ?? -1) - (a.final ?? -1));
    const gradeRows = listed.map(
      row =>
        `<tr><td>${esc(row.student.name)}</td><td>${esc(row.student.matricula)}</td>${row.grades.map(grade => `<td>${decimal(grade)}</td>`).join('')}<td><strong>${decimal(row.final)}</strong></td></tr>`
    );
    if (gradeRows.length)
      gradeRows.push(
        `<tr class="osce-average"><td>Média</td><td></td>${d.stations.map(station => `<td>${decimal(station.average)}</td>`).join('')}<td><strong>${decimal(d.consolidated.average)}</strong></td></tr>`
      );
    const grades = panel(
      'Notas do OSCE · de 0 a 1',
      `<div class="mod-row-actions"><button class="btn" type="button" id="osceOrder">${order === 'final' ? 'Ordenar por nome' : 'Ordenar pela nota final'}</button></div>` +
        table(
          ['Aluno', 'Matrícula', ...d.stations.map(station => esc(station.name)), 'Nota final'],
          gradeRows,
          'Nenhum aluno na lista.'
        ) +
        '<p class="muted">O traço indica estação em que o aluno ainda não foi avaliado; ela fica fora da média.</p>'
    );
    content().innerHTML =
      heading(
        esc(d.event.title),
        `Resultados e notas · situação: ${badge(d.event.status)}`,
        `<button class="btn" type="button" id="osceBack">Voltar à lista</button><button class="btn" type="button" id="osceStructure">Ver montagem</button><a class="btn" href="/api/osce/events/${id}/results/export" download title="Uma aba por estação, a Junção e o Resultado Final, como na planilha da instituição">Baixar notas (Excel)</a><button class="btn primary" type="button" id="osceRefresh">Atualizar</button>`
      ) +
      `<section class="panel admin-panel mod-note" role="note"><h3>Como as notas são calculadas</h3><p>${esc(d.consolidated.message)}</p></section>` +
      grades +
      stations;
    byId('osceBack').onclick = guard(listEvents);
    byId('osceStructure').onclick = guard(() => openEvent(id));
    byId('osceRefresh').onclick = guard(() => showResults(id, order));
    byId('osceOrder').onclick = guard(() => showResults(id, order === 'final' ? 'name' : 'final'));
    content()
      .querySelectorAll('[data-void]')
      .forEach(el => {
        el.onclick = () =>
          modal({
            title: 'Anular resposta',
            button: 'Anular',
            body: `<p>A resposta sobre <strong>${esc(el.dataset.name)}</strong> continua guardada como anulada, e o ambulatório poderá avaliar o aluno de novo nesta estação.</p><label>Motivo<input name="reason" maxlength="300" required></label>`,
            onSubmit: async body => {
              await send(`/submissions/${el.dataset.void}/void`, {reason: body.reason});
              await showResults(id, order);
              toast('Resposta anulada.');
            }
          });
      });
  }

  // ---------------------------------------------------------------- Conta operacional
  async function respondList() {
    const events = await api('/respond/events');
    const periods = [...new Set(events.map(e => e.period))].sort((a, b) => Number(a) - Number(b));
    const folders = periods
      .map(period =>
        panel(
          `${esc(period)}º período`,
          events
            .filter(e => e.period === period)
            .map(
              e =>
                `<div class="osce-folder"><strong>${esc(e.title)}</strong><div class="mod-row-actions">${e.stations.map(s => `<button class="btn" type="button" data-station="${s.id}">${esc(s.name)} <small>${s.answered} de ${e.students}</small></button>`).join('')}</div></div>`
            )
            .join('')
        )
      )
      .join('');
    content().innerHTML =
      heading(
        'Responder OSCE',
        'Escolha o período e a estação em que você está avaliando.',
        '<button class="btn" type="button" id="osceRefresh">Atualizar</button>'
      ) +
      (folders ||
        '<div class="dev-card"><h2>Nenhum OSCE liberado</h2><p>Quando o Núcleo de Avaliação liberar um OSCE, ele aparece aqui.</p></div>');
    byId('osceRefresh').onclick = guard(respondList);
    on('[data-station]', el => respondStation(Number(el.dataset.station)));
  }

  async function respondStation(id) {
    const d = await api('/respond/stations/' + id),
      pending = d.students.filter(s => !s.answered).length;
    const options = d.students
      .map(
        s =>
          `<option value="${s.id}" ${s.answered ? 'disabled' : ''}>${esc(s.name)} · ${esc(s.matricula)}${s.answered ? ' (já avaliado)' : ''}</option>`
      )
      .join('');
    const questions = d.questions
      .map(
        q => `<fieldset class="mod-answer"><legend>${q.position}. ${esc(q.text)}${q.is_key ? ' <span class="mod-tag">Pergunta-chave</span>' : ''}</legend>
      <label><input type="radio" name="q${q.id}" value="SIM" required> Fez</label><label><input type="radio" name="q${q.id}" value="NAO" required> Não fez</label>
      <label class="mod-comment-field">Comentário (opcional)<input name="c${q.id}" maxlength="500"></label></fieldset>`
      )
      .join('');
    content().innerHTML =
      heading(
        esc(d.station.name),
        esc(d.event.title) + ` · ${pending} aluno(s) ainda sem avaliação nesta estação`,
        '<button class="btn" type="button" id="osceBack">Trocar de estação</button>'
      ) +
      panel(
        'Avaliação do aluno',
        `<form id="osceForm" class="mod-form"><label>Aluno<select name="student" required><option value="">Selecione o aluno</option>${options}</select></label>${questions}
        <p class="form-error" role="alert" hidden></p><button class="btn primary" type="submit" ${pending ? '' : 'disabled'}>Enviar resposta</button></form>`
      );
    byId('osceBack').onclick = guard(respondList);
    byId('osceForm').onsubmit = async e => {
      e.preventDefault();
      const form = e.target,
        data = new FormData(form),
        error = form.querySelector('.form-error'),
        button = form.querySelector('[type=submit]');
      button.disabled = true;
      error.hidden = true;
      try {
        const student = d.students.find(s => String(s.id) === data.get('student'));
        await send(`/respond/stations/${id}/submissions`, {
          student_id: student.id,
          answers: d.questions.map(q => ({
            question_id: q.id,
            value: data.get('q' + q.id),
            comment: data.get('c' + q.id) || ''
          }))
        });
        content().innerHTML =
          heading('Resposta registrada', `${esc(student.name)} · ${esc(d.station.name)} · ${esc(d.event.title)}`) +
          `<div class="dev-card"><div class="dev-icon">✓</div><h2>Resposta enviada</h2><p>A avaliação de <strong>${esc(student.name)}</strong> foi registrada nesta estação.</p><div class="mod-row-actions mod-center"><button class="btn primary" type="button" id="osceAgain">Enviar outra resposta</button><button class="btn" type="button" id="osceBack">Trocar de estação</button></div></div>`;
        byId('osceAgain').onclick = guard(() => respondStation(id));
        byId('osceBack').onclick = guard(respondList);
        byId('osceAgain').focus();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        button.disabled = false;
      }
    };
  }

  window.SupremaModules.add('NUCLEO_AVALIACAO', {label: 'Avaliações OSCE', glyph: '◉', start: guard(listEvents)});
  window.SupremaModules.add('OPERACIONAL', {label: 'Responder OSCE', glyph: '◉', start: guard(respondList)});
})();
