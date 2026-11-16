'use strict';
/* Módulo Articulação Interdisciplinar: telas do CSTI, do aluno, da Coordenação e do tutor.
   Registra os seus itens nos pontos de extensão (window.SupremaModules e window.SupremaViews) e
   desenha no contêiner que recebe; não lê nem substitui variáveis de outros arquivos.
   O que aparece são as contagens das respostas e os números do relatório da instituição (média,
   menor e maior nota e percentual de cada resposta), que chegam prontos do servidor: nada é
   calculado aqui. Não existe número único de desempenho por tutor nem classificação de tutores. */
(() => {
  const {esc, modal, toast, guard, panel, table, when} = window.SupremaUI;
  const api = (route, options = {}) => window.SupremaAPI.request('/api/articulation' + route, options);
  const send = (route, body, method = 'POST') => api(route, {method, body: JSON.stringify(body ?? {})});
  const byId = id => document.getElementById(id);
  const STATUS = {
    RASCUNHO: 'Rascunho',
    LIBERADO: 'Liberada para os alunos',
    FINALIZADO: 'Coleta finalizada',
    RESULTADOS_LIBERADOS: 'Resultados liberados'
  };
  const KINDS = {
    NOTA_0_10: 'Nota de 0 a 10',
    SIM_NAO: 'Sim ou Não',
    SIM_NAO_PARCIAL: 'Sim, Não ou Parcialmente',
    PERIODO: 'Lista de períodos',
    TUTOR: 'Lista de tutores',
    ESTACAO: 'Lista de estações de apoio'
  };
  const LISTS = [
    ['PERIODO', 'Períodos', 'Período'],
    ['TUTOR', 'Tutores', 'Tutor'],
    ['ESTACAO', 'Estações de apoio', 'Estação de apoio']
  ];
  const ANSWERS = {SIM: 'Sim', NAO: 'Não', PARCIAL: 'Parcialmente'};
  const badge = status =>
    `<span class="state-badge ${status === 'RASCUNHO' ? 'muted-state' : 'positive-state'}">${STATUS[status] || esc(status)}</span>`;
  const heading = (title, subtitle, actions = '') =>
    `<div class="section-heading mod-heading"><div><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div><div class="mod-actions">${actions}</div></div>`;
  const note = (title, ...paragraphs) =>
    `<section class="panel admin-panel mod-note" role="note"><h3>${title}</h3>${paragraphs.map(p => `<p>${p}</p>`).join('')}</section>`;
  const on = (root, selector, handler) =>
    root.querySelectorAll(selector).forEach(el => {
      el.onclick = guard(() => handler(el));
    });
  const term = form => `${esc(form.year)}.${esc(form.semester)}`;
  const empty = (title, text) => `<div class="dev-card"><h2>${title}</h2><p>${text}</p></div>`;

  // ------------------------------------------------------------------------- Resultados
  // Usado pelo CSTI, pela Coordenação (com os nomes dos alunos) e pelo tutor (sem nomes).
  const decimal = value => Number(value).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  function answerSummary(q) {
    if (q.distribution)
      return (
        (q.average === null || q.average === undefined
          ? ''
          : `<p class="art-figures">Média <b>${decimal(q.average)}</b> · menor nota <b>${esc(q.lowest)}</b> · maior nota <b>${esc(q.highest)}</b></p>`) +
        `<div class="art-grades" role="img" aria-label="Quantidade de respostas por nota, de 0 a 10">${q.distribution.map((count, grade) => `<span class="${count ? 'has' : ''}"><b>${grade}</b><i>${count}</i></span>`).join('')}</div>`
      );
    if (q.counts)
      return `<div class="art-chips">${Object.entries(q.counts)
        .map(
          ([value, count]) =>
            `<span>${ANSWERS[value] || esc(value)} <b>${count}</b>${q.shares?.[value] === null || q.shares?.[value] === undefined ? '' : ` <em>${esc(q.shares[value])}%</em>`}</span>`
        )
        .join('')}</div>`;
    return q.choices?.length
      ? `<div class="art-chips">${q.choices.map(c => `<span>${esc(c.label)} <b>${c.count}</b></span>`).join('')}</div>`
      : '<span class="muted">Sem respostas</span>';
  }
  const justifications = q =>
    q.justifications?.length
      ? `<details class="art-details"><summary>${q.justifications.length} justificativa(s)</summary><ul>${q.justifications.map(j => `<li>${j.student_name ? `<strong>${esc(j.student_name)}:</strong> ` : ''}${esc(j.text)}</li>`).join('')}</ul></details>`
      : '';
  const questionTable = list =>
    table(
      ['Pergunta', 'Respostas', 'Como responderam'],
      list.map(
        q => `<tr><td>${esc(q.text)}${justifications(q)}</td><td>${q.answered}</td><td>${answerSummary(q)}</td></tr>`
      ),
      'Nenhuma pergunta.'
    );
  const pending = performance =>
    note(
      'Como ler estes números',
      esc(performance.message),
      'A média e os percentuais são sempre sobre o total de alunos que responderam em cada quadro.'
    );
  // O relatório da instituição tem um quadro por tutor e período. Com um período só, o quadro
  // do tutor já é esse; com mais de um, cada período aparece separado.
  const periodBoards = t =>
    t.periods?.length > 1
      ? t.periods
          .map(
            p =>
              `<h4 class="art-period">${esc(p.period)} · ${p.responses} resposta(s)</h4>${questionTable(p.questions)}`
          )
          .join('')
      : questionTable(t.questions);
  const periodNames = t => (t.periods?.length ? ' · ' + t.periods.map(p => esc(p.period)).join(', ') : '');

  function reportHtml(data) {
    const value = a =>
      !a
        ? '—'
        : esc(ANSWERS[a.value] || a.value) +
          (a.justification ? '<span class="mod-comment">' + esc(a.justification) + '</span>' : '');
    const tutors = data.tutors
      .map(
        t =>
          `<details class="art-details art-tutor"><summary>${esc(t.label)}${periodNames(t)} · ${t.responses} resposta(s)${t.professor_name ? ' · conta: ' + esc(t.professor_name) : ' · sem conta de professor vinculada'}</summary>${t.responses ? periodBoards(t) : '<p class="muted">Nenhum aluno escolheu este tutor.</p>'}</details>`
      )
      .join('');
    const rows = data.rows.map(
      r =>
        `<tr><td>${esc(r.student_name)}<small class="cell-sub">${esc(r.student_matricula)}</small></td><td>${esc(when(r.created_at))}</td>${data.questions.map(q => `<td>${value(r.answers[q.id])}</td>`).join('')}</tr>`
    );
    return (
      pending(data.performance) +
      panel(
        `Resultado geral · ${data.responses} resposta(s)`,
        questionTable(data.general),
        'Respostas de todos os alunos, pergunta por pergunta: contagem, percentual e, nas notas, média, menor e maior.'
      ) +
      panel(
        'Por tutor',
        tutors || '<p class="muted">Nenhum tutor na lista.</p>',
        'Um quadro por tutor e período, como no relatório da instituição, só com as respostas dos alunos que escolheram cada tutor. O tutor com conta vinculada vê o próprio quadro, sem os nomes dos alunos.'
      ) +
      panel(
        'Respostas identificadas',
        table(
          ['Aluno', 'Enviada em', ...data.questions.map(q => `<abbr title="${esc(q.text)}">P${q.position}</abbr>`)],
          rows,
          'Nenhuma resposta recebida.'
        ),
        'Uma linha por aluno, como na planilha do formulário anterior. Passe o cursor sobre P1, P2… para ler a pergunta.'
      )
    );
  }
  const exportLink = id =>
    `<a class="btn" href="/api/articulation/results/${id}/export" download title="Uma aba de relatório por tutor, como na planilha da instituição, e uma aba com todas as respostas">Baixar respostas e relatório (Excel)</a>`;

  // ------------------------------------------------------------------------------ CSTI
  let root = null,
    draft = null;

  async function listForms() {
    const forms = await api('/forms');
    const rows = forms.map(
      f => `<tr><td><strong>${esc(f.title)}</strong></td><td>${term(f)}</td><td>${badge(f.status)}</td><td>${f.responses}</td>
      <td class="mod-row-actions"><button class="btn" type="button" data-open="${f.id}">${f.status === 'RASCUNHO' ? 'Montar' : 'Abrir'}</button></td></tr>`
    );
    root.innerHTML =
      heading(
        'Articulação Interdisciplinar',
        'Monte a avaliação de cada caso, libere para os alunos, finalize a coleta e libere os resultados.',
        '<button class="btn primary" type="button" id="artNew">Nova avaliação</button>'
      ) +
      panel(
        'Avaliações cadastradas',
        table(
          ['Avaliação', 'Ano.semestre', 'Situação', 'Respostas', 'Ações'],
          rows,
          'Nenhuma avaliação cadastrada. Use "Nova avaliação" para começar.'
        )
      );
    on(root, '[data-open]', el => openForm(Number(el.dataset.open)));
    byId('artNew').onclick = () =>
      modal({
        title: 'Nova avaliação de Articulação',
        button: 'Criar rascunho',
        body: `<label>Nome da avaliação<input name="title" maxlength="160" placeholder="Avaliação Caso 6 - Articulação Interdisciplinar" required></label>
        <label>Ano<input name="year" type="number" min="2000" max="2200" value="${new Date().getFullYear()}" required></label>
        <label>Semestre<select name="semester" required><option value="1">1º semestre</option><option value="2">2º semestre</option></select></label>
        <p class="muted">O nome é livre e pode ser alterado enquanto a avaliação for rascunho. O rascunho começa com as perguntas do formulário atual e com a lista padrão de períodos, tutores e estações.</p>`,
        onSubmit: async body => {
          const created = await send('/forms', {title: body.title, year: Number(body.year), semester: body.semester});
          await openForm(created.id);
        }
      });
  }

  async function openForm(id) {
    const d = await api('/forms/' + id);
    draft = {...d, results: d.form.status === 'RASCUNHO' ? null : await api('/results/' + id)};
    if (d.form.status === 'RASCUNHO') renderEditor();
    else renderReleased();
  }

  function renderEditor() {
    const {form, questions, options, teachers} = draft;
    const kindSelect = (q, i) =>
      `<select data-q="${i}" data-field="kind" aria-label="Tipo de resposta da pergunta ${i + 1}">${Object.entries(
        KINDS
      )
        .map(([kind, label]) => `<option value="${kind}" ${q.kind === kind ? 'selected' : ''}>${label}</option>`)
        .join('')}</select>`;
    const questionRows = questions
      .map(
        (q, i) => `<div class="art-question">
      <span class="art-number">${i + 1}</span>
      <label>Seção<input data-q="${i}" data-field="section" maxlength="80" value="${esc(q.section)}" placeholder="Ex.: Abertura do caso"></label>
      <label class="art-wide">Pergunta<input data-q="${i}" data-field="text" maxlength="300" value="${esc(q.text)}" placeholder="Texto da pergunta"></label>
      <label>Tipo de resposta${kindSelect(q, i)}</label>
      <label class="mod-check"><input type="checkbox" data-q="${i}" data-field="justify" ${q.justify ? 'checked' : ''}> Pede justificativa</label>
      <div class="mod-actions"><button class="btn" type="button" data-move="${i}" data-by="-1" aria-label="Subir pergunta ${i + 1}" ${i ? '' : 'disabled'}>↑</button><button class="btn" type="button" data-move="${i}" data-by="1" aria-label="Descer pergunta ${i + 1}" ${i < questions.length - 1 ? '' : 'disabled'}>↓</button><button class="btn" type="button" data-remove-question="${i}" aria-label="Remover pergunta ${i + 1}">Remover</button></div>
    </div>`
      )
      .join('');
    const teacherSelect = (o, i) =>
      `<select data-list="TUTOR" data-o="${i}" data-field="professor_id" aria-label="Conta de professor do tutor ${i + 1}"><option value="">Sem conta vinculada</option>${teachers.map(p => `<option value="${p.id}" ${o.professor_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
    const listBlock = ([
      list,
      plural,
      singular
    ]) => `<div class="art-list"><h4>${plural} <span class="mod-tag">${options[list].length}</span></h4>
      ${options[list].map((o, i) => `<div class="mod-question"><input data-list="${list}" data-o="${i}" data-field="label" maxlength="120" value="${esc(o.label)}" aria-label="${singular} ${i + 1}" placeholder="${singular}">${list === 'TUTOR' ? teacherSelect(o, i) : ''}<button class="btn" type="button" data-remove-option="${list}" data-o="${i}" aria-label="Remover ${singular.toLowerCase()} ${i + 1}">Remover</button></div>`).join('')}
      ${options[list].length ? '' : '<p class="muted">Lista vazia.</p>'}
      <div class="mod-row-actions"><button class="btn" type="button" data-add-option="${list}">Adicionar</button><button class="btn" type="button" data-paste="${list}">Colar vários de uma vez</button>${options[list].length ? `<button class="btn" type="button" data-clear="${list}">Esvaziar lista</button>` : ''}</div></div>`;
    root.innerHTML =
      heading(
        esc(form.title),
        `Situação: ${badge(form.status)} · os alunos só veem a avaliação depois de liberada.`,
        '<button class="btn" type="button" id="artBack">Voltar à lista</button><button class="btn" type="button" id="artSave">Salvar rascunho</button><button class="btn primary" type="button" id="artRelease">Liberar para os alunos</button><button class="btn" type="button" id="artDelete">Excluir rascunho</button>'
      ) +
      panel(
        'Identificação',
        `<div class="admin-form art-identity"><label class="art-wide">Nome da avaliação<input id="artTitle" maxlength="160" value="${esc(form.title)}"></label>
        <label>Ano<input id="artYear" type="number" min="2000" max="2200" value="${esc(form.year)}"></label>
        <label>Semestre<select id="artSemester"><option value="1" ${form.semester === '1' ? 'selected' : ''}>1º semestre</option><option value="2" ${form.semester === '2' ? 'selected' : ''}>2º semestre</option></select></label></div>`,
        'O nome é livre: escreva o número do caso como preferir.'
      ) +
      panel(
        `Perguntas (${questions.length})`,
        `<div class="art-questions">${questionRows || '<p class="muted">Esta avaliação ainda não tem perguntas.</p>'}</div><div class="mod-row-actions"><button class="btn" type="button" id="artAddQuestion">Adicionar pergunta</button></div>`,
        'Todas as perguntas são obrigatórias para o aluno; a justificativa, quando pedida, é opcional. É preciso exatamente uma pergunta do tipo "Lista de tutores": é ela que separa os resultados por tutor.'
      ) +
      panel(
        'Listas de opções',
        `<div class="art-lists">${LISTS.map(listBlock).join('')}</div><div class="mod-row-actions"><button class="btn" type="button" id="artDefaults">Salvar estas listas como padrão</button></div>`,
        'Coloque quantos períodos, tutores e estações quiser. A lista padrão é copiada para cada nova avaliação e pode ser alterada aqui sem afetar as outras. Vincular um tutor a uma conta de professor permite que ele veja o próprio resultado consolidado.'
      );
    wireEditor();
  }

  function readInputs() {
    const {form, questions, options} = draft,
      value = id => byId(id)?.value ?? '';
    Object.assign(form, {title: value('artTitle'), year: Number(value('artYear')), semester: value('artSemester')});
    root.querySelectorAll('[data-q]').forEach(el => {
      questions[Number(el.dataset.q)][el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    });
    root.querySelectorAll('[data-list][data-field]').forEach(el => {
      options[el.dataset.list][Number(el.dataset.o)][el.dataset.field] =
        el.dataset.field === 'professor_id' ? Number(el.value) || null : el.value;
    });
  }
  const cleanLists = () =>
    Object.fromEntries(LISTS.map(([list]) => [list, draft.options[list].filter(o => o.label.trim())]));

  async function saveDraft() {
    readInputs();
    const {form, questions} = draft;
    await send(
      '/forms/' + form.id,
      {
        revision: form.revision,
        title: form.title,
        year: form.year,
        semester: form.semester,
        questions: questions.filter(q => q.text.trim()),
        options: cleanLists()
      },
      'PUT'
    );
    await openForm(form.id);
  }

  function wireEditor() {
    const id = draft.form.id,
      change = fn =>
        guard(el => {
          readInputs();
          fn(el);
          renderEditor();
        });
    byId('artBack').onclick = guard(listForms);
    byId('artSave').onclick = guard(async () => {
      await saveDraft();
      toast('Rascunho salvo. Os alunos só veem a avaliação depois de liberada.');
    });
    byId('artRelease').onclick = guard(async () => {
      if (
        !confirm(
          'Liberar esta avaliação para os alunos? Depois da liberação as perguntas e as listas não podem mais ser alteradas.'
        )
      )
        return;
      await saveDraft();
      await send(`/forms/${id}/release`, {revision: draft.form.revision});
      await openForm(id);
      toast('Avaliação liberada. Os alunos já podem responder.');
    });
    byId('artDelete').onclick = guard(async () => {
      if (!confirm('Excluir este rascunho de avaliação?')) return;
      await api('/forms/' + id, {method: 'DELETE'});
      await listForms();
      toast('Rascunho excluído.');
    });
    byId('artAddQuestion').onclick = change(() =>
      draft.questions.push({
        section: draft.questions.at(-1)?.section || '',
        text: '',
        kind: 'SIM_NAO_PARCIAL',
        justify: false
      })
    );
    byId('artDefaults').onclick = guard(async () => {
      if (
        !confirm(
          'Salvar estas listas de períodos, tutores e estações como padrão? As próximas avaliações começam com elas.'
        )
      )
        return;
      readInputs();
      await send('/defaults', {options: cleanLists()}, 'PUT');
      toast('Lista padrão salva. Ela será usada nas próximas avaliações.');
    });
    const each = (selector, handler) =>
      root.querySelectorAll(selector).forEach(el => {
        el.onclick = change(() => handler(el));
      });
    each('[data-remove-question]', el => draft.questions.splice(Number(el.dataset.removeQuestion), 1));
    each('[data-move]', el => {
      const i = Number(el.dataset.move),
        j = i + Number(el.dataset.by),
        q = draft.questions;
      [q[i], q[j]] = [q[j], q[i]];
    });
    each('[data-add-option]', el => draft.options[el.dataset.addOption].push({label: '', professor_id: null}));
    each('[data-remove-option]', el => draft.options[el.dataset.removeOption].splice(Number(el.dataset.o), 1));
    each('[data-clear]', el => {
      if (confirm('Esvaziar esta lista nesta avaliação? A lista padrão não muda.'))
        draft.options[el.dataset.clear] = [];
    });
    root.querySelectorAll('[data-paste]').forEach(el => {
      el.onclick = () => {
        const list = el.dataset.paste;
        modal({
          title: 'Colar vários de uma vez',
          button: 'Acrescentar à lista',
          body: '<label>Um por linha<textarea name="lines" rows="10" required></textarea></label><p class="muted">Cada linha vira um item. Linhas em branco e nomes repetidos são ignorados ao salvar.</p>',
          onSubmit: async body => {
            readInputs();
            for (const line of String(body.lines).split(/\r?\n/))
              if (line.trim()) draft.options[list].push({label: line.trim().slice(0, 120), professor_id: null});
            renderEditor();
          }
        });
      };
    });
  }

  function renderReleased() {
    const {form, questions, options, responses, results} = draft,
      id = form.id;
    const steps = {
      LIBERADO: [
        'Os alunos estão respondendo. Finalize a coleta quando o prazo terminar.',
        `<button class="btn" type="button" id="artRefresh">Atualizar</button><button class="btn primary" type="button" data-step="finish">Finalizar coleta</button>${responses ? '' : '<button class="btn" type="button" data-step="reopen">Voltar a rascunho</button>'}`
      ],
      FINALIZADO: [
        'A coleta terminou: ninguém mais responde. Os resultados ainda não foram liberados para a Coordenação nem para os tutores.',
        '<button class="btn primary" type="button" data-step="publish">Liberar resultados</button><button class="btn" type="button" data-step="reopen">Reabrir a coleta</button>'
      ],
      RESULTADOS_LIBERADOS: [
        'A Coordenação vê os resultados identificados e cada tutor com conta vinculada vê o próprio quadro, sem nomes.',
        '<button class="btn" type="button" data-step="reopen">Recolher os resultados</button>'
      ]
    }[form.status];
    const structure = table(
      ['Nº', 'Seção', 'Pergunta', 'Tipo de resposta', 'Justificativa'],
      questions.map(
        (q, i) =>
          `<tr><td>${i + 1}</td><td>${esc(q.section)}</td><td>${esc(q.text)}</td><td>${KINDS[q.kind]}</td><td>${q.justify ? 'Sim' : 'Não'}</td></tr>`
      )
    );
    const lists = `<div class="art-lists">${LISTS.map(([list, plural]) => `<div class="art-list"><h4>${plural} <span class="mod-tag">${options[list].length}</span></h4><ul>${options[list].map(o => `<li>${esc(o.label)}</li>`).join('')}</ul></div>`).join('')}</div>`;
    root.innerHTML =
      heading(
        esc(form.title),
        `${term(form)} · Situação: ${badge(form.status)} · ${responses} resposta(s). ${steps[0]}`,
        '<button class="btn" type="button" id="artBack">Voltar à lista</button>' + steps[1] + exportLink(id)
      ) +
      reportHtml(results) +
      `<details class="art-details art-structure"><summary>Perguntas e listas desta avaliação</summary>${panel('Perguntas', structure)}${panel('Listas de opções', lists)}</details>`;
    byId('artBack').onclick = guard(listForms);
    byId('artRefresh')?.addEventListener(
      'click',
      guard(() => openForm(id))
    );
    const confirmations = {
      finish: 'Finalizar a coleta? Os alunos deixam de responder.',
      publish: 'Liberar os resultados para a Coordenação e para os tutores com conta vinculada?',
      reopen: null
    };
    const done = {
      finish: 'Coleta finalizada.',
      publish: 'Resultados liberados.',
      reopen: 'Situação anterior restaurada.'
    };
    on(root, '[data-step]', async el => {
      const step = el.dataset.step;
      if (confirmations[step] && !confirm(confirmations[step])) return;
      await send(`/forms/${id}/${step}`);
      await openForm(id);
      toast(done[step]);
    });
  }

  // ------------------------------------------------------------------------------ Aluno
  let studentRoot = null,
    studentSlot = null;
  const showStudentView = visible => window.SupremaUI.studentView(visible);

  async function studentBoot() {
    studentRoot = byId('studentModuleView');
    const waiting = (await api('/open')).filter(item => !item.answered).length;
    studentSlot.innerHTML = `<button class="btn student-refresh" type="button" id="artStudentOpen">Articulação Interdisciplinar${waiting ? ` <span class="mod-tag">${waiting} pendente${waiting > 1 ? 's' : ''}</span>` : ''}</button>`;
    byId('artStudentOpen').onclick = guard(studentList);
  }

  async function studentList() {
    const items = await api('/open');
    const rows = items.map(
      item => `<tr><td><strong>${esc(item.title)}</strong></td><td>${term(item)}</td>
      <td>${item.answered ? '<span class="state-badge positive-state">Respondida</span>' : `<button class="btn primary" type="button" data-form="${item.id}">Responder</button>`}</td></tr>`
    );
    studentRoot.innerHTML =
      heading(
        'Articulação Interdisciplinar',
        'Avalie a semana de Articulação: abertura do caso, estações de apoio e fechamento.',
        '<button class="btn" type="button" id="artStudentBack">Voltar às minhas notas</button>'
      ) +
      panel(
        'Avaliações liberadas',
        table(['Avaliação', 'Ano.semestre', 'Situação'], rows, 'Não há avaliações de Articulação liberadas no momento.')
      );
    showStudentView(true);
    byId('artStudentBack').onclick = () => showStudentView(false);
    on(studentRoot, '[data-form]', el => studentForm(Number(el.dataset.form)));
  }

  function field(q) {
    const name = 'q' + q.id,
      radio = (value, label) => `<label><input type="radio" name="${name}" value="${value}" required> ${label}</label>`;
    if (q.options)
      return `<label class="art-select"><span class="sr-only">${esc(q.text)}</span><select name="${name}" required><option value="">Selecione…</option>${q.options.map(o => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}</select></label>`;
    if (q.kind === 'NOTA_0_10')
      return `<div class="art-scale">${Array.from({length: 11}, (_, grade) => radio(grade, grade)).join('')}</div>`;
    return (
      radio('SIM', 'Sim') + radio('NAO', 'Não') + (q.kind === 'SIM_NAO_PARCIAL' ? radio('PARCIAL', 'Parcialmente') : '')
    );
  }

  async function studentForm(id) {
    const d = await api('/open/' + id);
    const blocks = d.questions
      .map(
        (q, i) =>
          (q.section && q.section !== d.questions[i - 1]?.section
            ? `<h4 class="art-section">${esc(q.section)}</h4>`
            : '') +
          `<fieldset class="mod-answer"><legend>${esc(q.text)}</legend>${field(q)}${q.justify ? `<label class="mod-comment-field">Justifique (opcional)<textarea name="j${q.id}" maxlength="1000" rows="2"></textarea></label>` : ''}</fieldset>`
      )
      .join('');
    studentRoot.innerHTML =
      heading(
        esc(d.title),
        'Todas as perguntas são obrigatórias. As justificativas são opcionais.',
        '<button class="btn" type="button" id="artStudentList">Voltar à lista</button>'
      ) +
      note(
        'Antes de enviar',
        'Esta avaliação é identificada, como o formulário usado até agora: a sua resposta fica registrada com o seu nome e é lida pelo CSTI e pela Coordenação.',
        'O tutor vê apenas o resultado consolidado do seu grupo, sem os nomes. Depois de enviada, a resposta não pode ser alterada.'
      ) +
      panel(
        'Avaliação',
        `<form id="artForm" class="mod-form">${blocks}<p class="form-error" role="alert" hidden></p><button class="btn primary" type="submit">Enviar avaliação</button></form>`
      );
    byId('artStudentList').onclick = guard(studentList);
    byId('artForm').onsubmit = async e => {
      e.preventDefault();
      const form = e.target,
        data = new FormData(form),
        error = form.querySelector('.form-error'),
        button = form.querySelector('[type=submit]');
      if (!confirm('Enviar esta avaliação? Ela não poderá ser alterada depois.')) return;
      button.disabled = true;
      error.hidden = true;
      try {
        const answers = d.questions.map(q => {
          const raw = data.get('q' + q.id),
            justification = q.justify ? String(data.get('j' + q.id) || '') : undefined;
          return {
            question_id: q.id,
            ...(q.options ? {option_id: Number(raw)} : {value: q.kind === 'NOTA_0_10' ? Number(raw) : raw}),
            ...(justification ? {justification} : {})
          };
        });
        const sent = await send(`/open/${id}/answers`, {answers});
        await studentBoot();
        // O comprovante prova que a avaliação foi enviada; ele não contém as respostas.
        studentRoot.innerHTML =
          heading('Avaliação enviada', esc(d.title)) +
          window.SupremaUI.receiptCard(sent.receipt.code) +
          '<div class="mod-row-actions"><button class="btn" type="button" id="artStudentList">Voltar à lista de avaliações</button></div>';
        byId('artStudentList').onclick = guard(studentList);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        button.disabled = false;
      }
    };
  }

  // ------------------------------------------------------------------------ Coordenação
  async function coordinationView() {
    const forms = await api('/results');
    if (!forms.length) {
      root.innerHTML =
        heading('Articulação Interdisciplinar', 'Resultados das avaliações respondidas pelos alunos.') +
        empty(
          'Ainda não há resultados',
          'Os resultados aparecem aqui depois que o CSTI finaliza a coleta e libera os resultados.'
        );
      return;
    }
    const chosen = forms.find(f => f.id === Number(root.dataset.form)) || forms[0],
      data = await api('/results/' + chosen.id);
    root.innerHTML =
      heading(
        'Articulação Interdisciplinar',
        'Resultados das avaliações respondidas pelos alunos.',
        `<label class="art-filter">Avaliação<select id="artChoose">${forms.map(f => `<option value="${f.id}" ${f.id === chosen.id ? 'selected' : ''}>${esc(f.title)} · ${term(f)}</option>`).join('')}</select></label>${exportLink(chosen.id)}`
      ) + reportHtml(data);
    byId('artChoose').onchange = guard(async e => {
      root.dataset.form = e.target.value;
      await coordinationView();
    });
  }

  // ------------------------------------------------------------------------------ Tutor
  async function tutorView(container) {
    container.classList.add('mod-root');
    const results = await api('/mine');
    const title = heading(
      'Articulação Interdisciplinar',
      'O que os alunos do seu grupo responderam nas avaliações de Articulação. Os nomes dos alunos não aparecem.'
    );
    if (!results.length) {
      container.innerHTML =
        title +
        empty(
          'Ainda não há resultados',
          'Os resultados aparecem aqui quando o CSTI libera uma avaliação em que você está na lista de tutores, com a sua conta vinculada.'
        );
      return;
    }
    container.innerHTML =
      title +
      pending(results[0].performance) +
      [...results]
        .reverse()
        .map(r =>
          panel(
            `${esc(r.form.title)} · ${term(r.form)}`,
            r.withheld
              ? `<p class="art-withheld"><strong>Respostas insuficientes.</strong> Foram ${r.responses} resposta(s); o quadro só é exibido a partir de ${r.minimum}, para que uma resposta não possa ser atribuída a um aluno.</p>`
              : periodBoards(r),
            `${esc(r.tutor)}${r.withheld ? '' : periodNames(r)} · ${r.responses} resposta(s)`
          )
        )
        .join('');
  }

  // --------------------------------------------------------------------- Pontos de extensão
  const inProfile = view =>
    guard(async container => {
      root = container;
      await view();
    });
  window.SupremaModules.add('CSTI', {label: 'Articulação Interdisciplinar', glyph: '⌘', start: inProfile(listForms)});
  window.SupremaModules.add('COORDENACAO', {
    label: 'Articulação Interdisciplinar',
    glyph: '⌘',
    start: inProfile(coordinationView)
  });
  window.SupremaModules.add('ALUNO', {
    boot: guard(async slot => {
      studentSlot = slot;
      await studentBoot();
    })
  });
  window.SupremaViews = Object.assign(window.SupremaViews || {}, {
    'Articulação Interdisciplinar': {render: guard(tutorView)}
  });
})();
