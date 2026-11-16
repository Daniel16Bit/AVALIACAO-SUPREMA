'use strict';
/* Módulo Avaliação Docente (anônima): telas do CSTI, do aluno, do professor e da Coordenação.
   Registra os seus itens nos pontos de extensão (window.SupremaModules e window.SupremaViews) e desenha
   no contêiner que recebe; não lê nem substitui variáveis de outros arquivos da interface.
   Nenhuma "média" ou nota do professor é calculada aqui: só contagens e percentuais. */
(() => {
  const {esc, modal, toast, guard, panel, table} = window.SupremaUI;
  const api = (route, options = {}) => window.SupremaAPI.request('/api/teacher-eval' + route, options);
  const send = (route, body, method = 'POST') => api(route, {method, body: JSON.stringify(body ?? {})});
  const byId = id => document.getElementById(id);
  const STATUS = {RASCUNHO: 'Rascunho', LIBERADO: 'Liberada', ENCERRADO: 'Encerrada'};
  const badge = status =>
    `<span class="state-badge ${status === 'LIBERADO' ? 'positive-state' : 'muted-state'}">${STATUS[status] || esc(status)}</span>`;
  const heading = (title, subtitle, actions = '') =>
    `<div class="section-heading mod-heading"><div><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div><div class="mod-actions">${actions}</div></div>`;
  const note = (title, ...paragraphs) =>
    `<section class="panel admin-panel mod-note" role="note"><h3>${title}</h3>${paragraphs.map(p => `<p>${p}</p>`).join('')}</section>`;
  const offer = item => esc(item.discipline_name) + (item.class_name ? ' · ' + esc(item.class_name) : '');
  const on = (root, selector, handler) =>
    root.querySelectorAll(selector).forEach(el => {
      el.onclick = guard(() => handler(el));
    });

  // ------------------------------------------------------------------------------ CSTI
  let root = null,
    draft = null;

  async function listCampaigns() {
    const campaigns = await api('/campaigns');
    const rows = campaigns.map(
      c => `<tr><td><strong>${esc(c.title)}</strong></td><td>${badge(c.status)}</td><td>${c.targets}</td><td>${c.answered}</td>
      <td class="mod-row-actions"><button class="btn" type="button" data-open="${c.id}">${c.status === 'RASCUNHO' ? 'Montar' : 'Abrir'}</button></td></tr>`
    );
    root.innerHTML =
      heading(
        'Avaliação Docente',
        'Monte a avaliação de um período, libere para os alunos, acompanhe a adesão e encerre.',
        '<button class="btn primary" type="button" id="docNew">Nova avaliação</button>'
      ) +
      panel(
        'Avaliações cadastradas',
        table(
          ['Avaliação', 'Situação', 'Professores', 'Respostas', 'Ações'],
          rows,
          'Nenhuma avaliação cadastrada. Use "Nova avaliação" para começar.'
        )
      );
    on(root, '[data-open]', el => openCampaign(Number(el.dataset.open)));
    byId('docNew').onclick = () =>
      modal({
        title: 'Nova avaliação docente',
        button: 'Criar rascunho',
        body: `<label>Ano<input name="year" type="number" min="2000" max="2200" value="${new Date().getFullYear()}" required></label>
        <label>Semestre<select name="semester" required><option value="1">1º semestre</option><option value="2">2º semestre</option></select></label>
        <label>Nome da rodada<input name="round_name" maxlength="60" value="Fim do semestre" required></label>
        <label>Período<input name="period" type="number" min="1" max="30" step="1" required></label>
        <p class="muted">O rascunho começa com todos os professores que lecionam no período. A lista e as perguntas podem ser ajustadas antes de liberar.</p>`,
        onSubmit: async body => {
          const created = await send('/campaigns', {
            year: Number(body.year),
            semester: body.semester,
            round_name: body.round_name,
            period: body.period
          });
          await openCampaign(created.id);
        }
      });
  }

  async function openCampaign(id) {
    const d = await api('/campaigns/' + id);
    draft = {
      campaign: d.campaign,
      loaded: {...d.campaign},
      questions: d.questions.map(q => ({text: q.text})),
      selected: new Set(d.assignment_ids),
      candidates: d.candidates,
      adherence: d.adherence
    };
    renderCampaign();
  }

  function renderCampaign() {
    const {campaign, questions, candidates, selected, adherence} = draft,
      editable = campaign.status === 'RASCUNHO',
      lock = editable ? '' : 'disabled';
    const answered = adherence.reduce((sum, a) => sum + a.answered, 0);
    const actions =
      '<button class="btn" type="button" id="docBack">Voltar à lista</button>' +
      (editable
        ? '<button class="btn" type="button" id="docSave">Salvar rascunho</button><button class="btn primary" type="button" id="docRelease">Liberar para os alunos</button><button class="btn" type="button" id="docDelete">Excluir rascunho</button>'
        : campaign.status === 'LIBERADO'
          ? `<button class="btn" type="button" id="docRefresh">Atualizar adesão</button><button class="btn primary" type="button" id="docClose">Encerrar</button>${answered ? '' : '<button class="btn" type="button" id="docReopen">Voltar a rascunho</button>'}`
          : '');
    const identity = `<div class="admin-form">
      <label>Ano<input id="docYear" type="number" min="2000" max="2200" value="${esc(campaign.year)}" ${lock}></label>
      <label>Semestre<select id="docSemester" ${lock}><option value="1" ${campaign.semester === '1' ? 'selected' : ''}>1º semestre</option><option value="2" ${campaign.semester === '2' ? 'selected' : ''}>2º semestre</option></select></label>
      <label>Nome da rodada<input id="docRound" maxlength="60" value="${esc(campaign.round_name)}" ${lock}></label>
      <label>Período<input id="docPeriod" type="number" min="1" max="30" value="${esc(campaign.period)}" ${lock}></label>
      <label>Mínimo de respostas para exibir<input id="docMin" type="number" min="3" max="1000" value="${esc(campaign.min_responses)}" ${lock}></label></div>
      <p class="muted">O resultado de um professor só aparece quando ele recebe pelo menos essa quantidade de respostas. O menor valor aceito é 3.</p>`;
    const questionList = `<div class="mod-questions">${questions.map((q, i) => `<div class="mod-question"><label class="sr-only" for="docQ${i}">Pergunta ${i + 1}</label><input id="docQ${i}" data-question="${i}" maxlength="300" placeholder="Texto da pergunta" value="${esc(q.text)}" ${lock}>${editable ? `<button class="btn" type="button" data-remove-question="${i}" aria-label="Remover pergunta ${i + 1}">Remover</button>` : ''}</div>`).join('')}
      ${questions.length ? '' : '<p class="muted">Esta avaliação ainda não tem perguntas.</p>'}</div>${editable ? '<div class="mod-row-actions"><button class="btn" type="button" id="docAddQuestion">Adicionar pergunta</button></div>' : ''}`;
    const teachers = editable
      ? table(
          ['Incluir', 'Professor', 'Disciplina', 'Alunos matriculados'],
          candidates.map(
            c =>
              `<tr><td><input type="checkbox" data-assignment="${c.assignment_id}" aria-label="Incluir ${esc(c.professor_name)}" ${selected.has(c.assignment_id) ? 'checked' : ''}></td><td>${esc(c.professor_name)}</td><td>${offer(c)}</td><td>${c.eligible}</td></tr>`
          ),
          'Nenhum professor com vínculo ativo neste período, ano e semestre.'
        )
      : table(
          ['Professor', 'Disciplina', 'Responderam'],
          adherence.map(
            a => `<tr><td>${esc(a.professor_name)}</td><td>${offer(a)}</td><td>${a.answered} de ${a.eligible}</td></tr>`
          ),
          'Nenhum professor na lista.'
        );
    root.innerHTML =
      heading(
        esc(campaign.title),
        `Situação: ${badge(campaign.status)}${campaign.status === 'ENCERRADO' ? ' · encerrada em definitivo; os resultados estão disponíveis para os professores e para a Coordenação.' : ''}`,
        actions
      ) +
      note(
        'Avaliação anônima',
        'As respostas são guardadas sem nenhuma ligação com o aluno. Aqui aparece apenas quantos responderam, nunca quem.',
        'Os resultados só ficam visíveis depois do encerramento, que é definitivo, e apenas para professores que atingirem o mínimo de respostas.'
      ) +
      panel('Identificação', identity) +
      panel(
        'Perguntas',
        questionList,
        'As mesmas perguntas valem para todos os professores. O aluno responde Sim, Não ou Não se aplica, com comentário opcional.'
      ) +
      panel(
        editable ? `Professores (${selected.size} de ${candidates.length} selecionados)` : 'Adesão por professor',
        teachers,
        editable
          ? 'Cada aluno avalia os professores das disciplinas em que está matriculado.'
          : 'Contagem de alunos que já responderam sobre cada professor.'
      );
    wireCampaign(editable);
  }

  function readInputs() {
    const {campaign, questions} = draft,
      value = id => byId(id)?.value ?? '';
    Object.assign(campaign, {
      year: Number(value('docYear')),
      semester: value('docSemester'),
      round_name: value('docRound'),
      period: value('docPeriod'),
      min_responses: Number(value('docMin'))
    });
    root.querySelectorAll('[data-question]').forEach(el => {
      questions[Number(el.dataset.question)].text = el.value;
    });
    root.querySelectorAll('[data-assignment]').forEach(el => {
      const id = Number(el.dataset.assignment);
      if (el.checked) draft.selected.add(id);
      else draft.selected.delete(id);
    });
  }

  async function saveDraft() {
    readInputs();
    const {campaign, loaded, questions, selected} = draft;
    // Changing year, semester or period changes which teachers exist: the list starts over.
    const moved = ['year', 'semester', 'period'].some(key => String(campaign[key]) !== String(loaded[key]));
    await send(
      '/campaigns/' + campaign.id,
      {
        revision: campaign.revision,
        year: campaign.year,
        semester: campaign.semester,
        round_name: campaign.round_name,
        period: campaign.period,
        min_responses: campaign.min_responses,
        questions: questions.filter(q => q.text.trim()),
        assignment_ids: moved ? [] : [...selected]
      },
      'PUT'
    );
    await openCampaign(campaign.id);
    return moved;
  }

  function wireCampaign(editable) {
    const id = draft.campaign.id,
      change = fn =>
        guard(() => {
          readInputs();
          fn();
          renderCampaign();
        });
    byId('docBack').onclick = guard(listCampaigns);
    if (editable) {
      byId('docSave').onclick = guard(async () => {
        toast(
          (await saveDraft())
            ? 'Rascunho salvo. O período mudou: selecione de novo os professores.'
            : 'Rascunho salvo. Os alunos só veem a avaliação depois de liberada.'
        );
      });
      byId('docRelease').onclick = guard(async () => {
        if (
          !confirm(
            'Liberar esta avaliação para os alunos? Depois da liberação as perguntas e a lista de professores não podem mais ser alteradas.'
          )
        )
          return;
        if (await saveDraft()) return toast('O período mudou: selecione os professores e libere de novo.');
        await send(`/campaigns/${id}/release`, {revision: draft.campaign.revision});
        await openCampaign(id);
        toast('Avaliação liberada. Os alunos já podem responder.');
      });
      byId('docDelete').onclick = guard(async () => {
        if (!confirm('Excluir este rascunho de avaliação?')) return;
        await api('/campaigns/' + id, {method: 'DELETE'});
        await listCampaigns();
        toast('Rascunho excluído.');
      });
      byId('docAddQuestion').onclick = change(() => draft.questions.push({text: ''}));
      root.querySelectorAll('[data-remove-question]').forEach(el => {
        el.onclick = change(() => draft.questions.splice(Number(el.dataset.removeQuestion), 1));
      });
      return;
    }
    byId('docRefresh')?.addEventListener(
      'click',
      guard(() => openCampaign(id))
    );
    byId('docClose')?.addEventListener(
      'click',
      guard(async () => {
        if (
          !confirm(
            'Encerrar esta avaliação? O encerramento é definitivo: os alunos deixam de responder, os resultados ficam visíveis e a avaliação não pode ser reaberta.'
          )
        )
          return;
        await send(`/campaigns/${id}/close`);
        await openCampaign(id);
        toast('Avaliação encerrada. Os resultados estão disponíveis.');
      })
    );
    byId('docReopen')?.addEventListener(
      'click',
      guard(async () => {
        await send(`/campaigns/${id}/reopen`);
        await openCampaign(id);
        toast('A avaliação voltou a rascunho.');
      })
    );
  }

  // ------------------------------------------------------------------------------ Aluno
  let studentRoot = null,
    studentSlot = null;

  async function studentBoot() {
    studentRoot = byId('studentModuleView');
    const pending = (await api('/pending')).filter(item => !item.answered).length;
    studentSlot.innerHTML = `<button class="btn student-refresh" type="button" id="docStudentOpen">Avaliação Docente${pending ? ` <span class="mod-tag">${pending} pendente${pending > 1 ? 's' : ''}</span>` : ''}</button>`;
    byId('docStudentOpen').onclick = guard(studentList);
  }
  const showStudentView = visible => window.SupremaUI.studentView(visible);

  async function studentList() {
    const items = await api('/pending');
    const rows = items.map(
      item => `<tr><td>${esc(item.professor_name)}</td><td>${offer(item)}</td><td>${esc(item.campaign)}</td>
      <td>${item.answered ? '<span class="state-badge positive-state">Respondida</span>' : `<button class="btn primary" type="button" data-target="${item.id}">Responder</button>`}</td></tr>`
    );
    studentRoot.innerHTML =
      heading(
        'Avaliação Docente',
        'Avalie os professores das disciplinas em que você está matriculado.',
        '<button class="btn" type="button" id="docStudentBack">Voltar às minhas notas</button>'
      ) +
      note(
        'Sua resposta é anônima',
        'O sistema registra que você respondeu, para não aceitar a mesma avaliação duas vezes, mas guarda as respostas sem nenhuma ligação com você.',
        'Por isso uma resposta enviada não pode ser consultada nem alterada depois.'
      ) +
      panel(
        'Avaliações liberadas',
        table(
          ['Professor', 'Disciplina', 'Avaliação', 'Situação'],
          rows,
          'Não há avaliações liberadas para você no momento.'
        )
      );
    showStudentView(true);
    byId('docStudentBack').onclick = () => showStudentView(false);
    on(studentRoot, '[data-target]', el => studentForm(Number(el.dataset.target)));
  }

  async function studentForm(id) {
    const d = await api('/targets/' + id);
    const questions = d.questions
      .map(
        q => `<fieldset class="mod-answer"><legend>${q.position}. ${esc(q.text)}</legend>
      <label><input type="radio" name="q${q.id}" value="SIM" required> Sim</label><label><input type="radio" name="q${q.id}" value="NAO" required> Não</label><label><input type="radio" name="q${q.id}" value="NA" required> Não se aplica</label>
      <label class="mod-comment-field">Comentário (opcional)<input name="c${q.id}" maxlength="500"></label></fieldset>`
      )
      .join('');
    studentRoot.innerHTML =
      heading(
        esc(d.professor_name),
        offer(d) + ' · ' + esc(d.campaign),
        '<button class="btn" type="button" id="docStudentList">Voltar à lista</button>'
      ) +
      note(
        'Antes de enviar',
        'Depois de enviada, a resposta não pode ser alterada.',
        'Os comentários são mostrados ao professor e à Coordenação sem o seu nome, mas o que você escrever pode permitir que reconheçam quem escreveu.'
      ) +
      panel(
        'Avaliação do professor',
        `<form id="docForm" class="mod-form">${questions}<p class="form-error" role="alert" hidden></p><button class="btn primary" type="submit">Enviar avaliação</button></form>`
      );
    byId('docStudentList').onclick = guard(studentList);
    byId('docForm').onsubmit = async e => {
      e.preventDefault();
      const form = e.target,
        data = new FormData(form),
        error = form.querySelector('.form-error'),
        button = form.querySelector('[type=submit]');
      if (!confirm('Enviar esta avaliação? Ela é anônima e não poderá ser alterada depois.')) return;
      button.disabled = true;
      error.hidden = true;
      try {
        const sent = await send(`/targets/${id}/answers`, {
          answers: d.questions.map(q => ({
            question_id: q.id,
            value: data.get('q' + q.id),
            comment: data.get('c' + q.id) || ''
          }))
        });
        await studentBoot();
        // O comprovante prova que a avaliação foi enviada; ele não contém as respostas.
        studentRoot.innerHTML =
          heading('Avaliação enviada', esc(d.professor_name) + ' · ' + offer(d) + ' · ' + esc(d.campaign)) +
          window.SupremaUI.receiptCard(sent.receipt.code) +
          '<div class="mod-row-actions"><button class="btn" type="button" id="docStudentList">Voltar à lista de avaliações</button></div>';
        byId('docStudentList').onclick = guard(studentList);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        button.disabled = false;
      }
    };
  }

  // ------------------------------------------------------- Resultados (professor e Coordenação)
  // Percentual de Sim sobre Sim + Não. "Não se aplica" fica à parte e não entra na conta.
  const ratio = counts =>
    counts && counts.sim + counts.nao > 0 ? (counts.sim / (counts.sim + counts.nao)) * 100 : null;
  const pct = value => (value === null ? '—' : value.toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%');
  const bar = value =>
    `<div class="h-track docente-track">${value === null ? '' : `<div class="h-fill" style="width:${Math.min(100, value)}%"></div>`}</div>`;

  function resultCard(r, withTeacher) {
    const name = (withTeacher ? esc(r.professor_name) + ' · ' : '') + offer(r);
    if (!r.sufficient)
      return panel(
        name,
        `<p class="docente-insufficient"><strong>Respostas insuficientes.</strong> Foram ${r.responses} resposta(s); o resultado só é exibido a partir de ${r.min_responses}, para preservar o anonimato.</p>`,
        esc(r.campaign)
      );
    const rows = r.questions.map(
      q =>
        `<tr><td>${q.position}. ${esc(q.text)}</td><td>${q.sim}</td><td>${q.nao}</td><td>${q.na}</td><td class="docente-pct">${bar(ratio(q))}<b>${pct(ratio(q))}</b></td></tr>`
    );
    rows.push(
      `<tr class="total-row"><td>Todas as perguntas</td><td>${r.total.sim}</td><td>${r.total.nao}</td><td>${r.total.na}</td><td class="docente-pct">${bar(ratio(r.total))}<b>${pct(ratio(r.total))}</b></td></tr>`
    );
    const comments = r.questions
      .filter(q => q.comments.length)
      .map(
        q =>
          `<details class="docente-comments"><summary>${q.position}. ${esc(q.text)} · ${q.comments.length} comentário(s)</summary><ul>${q.comments.map(c => `<li>${esc(c)}</li>`).join('')}</ul></details>`
      )
      .join('');
    return panel(
      name,
      table(['Pergunta', 'Sim', 'Não', 'Não se aplica', '% de Sim (sobre Sim + Não)'], rows) +
        (comments
          ? `<h4 class="docente-subtitle">Comentários</h4><p class="muted">Texto como foi escrito, em ordem sorteada, sem data e sem autor.</p>${comments}`
          : ''),
      `${esc(r.campaign)} · ${r.responses} resposta(s)`
    );
  }

  // One line per closed campaign, oldest first: shows whether the percentage rises or falls.
  const history = items =>
    `<div class="h-chart">${items.map(i => `<div class="h-row docente-history"><span>${i.label}</span>${bar(i.value)}<b>${i.value === null ? 'insuficiente' : pct(i.value)}</b></div>`).join('')}</div>`;

  async function teacherView(container) {
    container.classList.add('mod-root');
    const results = await api('/mine');
    if (!results.length) {
      container.innerHTML =
        heading('Avaliação Docente', 'Seus resultados nas avaliações feitas pelos alunos.') +
        '<div class="dev-card"><h2>Ainda não há resultados</h2><p>Os resultados aparecem aqui depois que uma avaliação com o seu nome é encerrada.</p></div>';
      return;
    }
    const disciplines = [...new Set(results.map(r => r.discipline_name))];
    const evolution = disciplines
      .map(
        d =>
          `<h4 class="docente-subtitle">${esc(d)}</h4>` +
          history(
            results.filter(r => r.discipline_name === d).map(r => ({label: esc(r.campaign), value: ratio(r.total)}))
          )
      )
      .join('');
    container.innerHTML =
      heading('Avaliação Docente', 'Seus resultados nas avaliações feitas pelos alunos. As respostas são anônimas.') +
      panel(
        'Evolução entre avaliações',
        evolution,
        'Percentual de Sim sobre Sim + Não, somando todas as perguntas, em cada avaliação encerrada.'
      ) +
      [...results]
        .reverse()
        .map(r => resultCard(r, false))
        .join('');
  }

  async function coordinationView() {
    const data = await api('/results');
    if (!data.campaigns.length) {
      root.innerHTML =
        heading('Avaliação Docente', 'Resultados de todos os professores.') +
        '<div class="dev-card"><h2>Ainda não há resultados</h2><p>Os resultados aparecem aqui depois que o CSTI encerra uma avaliação.</p></div>';
      return;
    }
    const chosen = Number(root.dataset.campaign) || data.campaigns[data.campaigns.length - 1].campaign_id;
    const campaign = data.campaigns.find(c => c.campaign_id === chosen),
      targets = data.targets.filter(r => r.campaign_id === chosen);
    const overview = table(
      ['Professor', 'Disciplina', 'Respostas', '% de Sim'],
      targets.map(
        r =>
          `<tr><td>${esc(r.professor_name)}</td><td>${offer(r)}</td><td>${r.responses}</td><td class="docente-pct">${r.sufficient ? bar(ratio(r.total)) + '<b>' + pct(ratio(r.total)) + '</b>' : '<span class="muted">insuficiente</span>'}</td></tr>`
      ),
      'Nenhum professor nesta avaliação.'
    );
    // Same teacher and discipline across campaigns, for the semester and year comparison.
    const keys = [...new Set(targets.map(r => r.professor_id + '|' + r.discipline_name))];
    const perTeacher = keys
      .map(key => {
        const items = data.targets.filter(r => r.professor_id + '|' + r.discipline_name === key);
        return (
          `<h4 class="docente-subtitle">${esc(items[0].professor_name)} · ${esc(items[0].discipline_name)}</h4>` +
          history(items.map(r => ({label: esc(r.campaign), value: ratio(r.total)})))
        );
      })
      .join('');
    root.innerHTML =
      heading(
        'Avaliação Docente',
        'Resultados de todos os professores. As respostas são anônimas.',
        `<label class="docente-filter">Avaliação<select id="docCampaign">${data.campaigns.map(c => `<option value="${c.campaign_id}" ${c.campaign_id === chosen ? 'selected' : ''}>${esc(c.campaign)}</option>`).join('')}</select></label>`
      ) +
      panel(
        'Resultado geral por avaliação',
        history(data.campaigns.map(c => ({label: esc(c.campaign), value: ratio(c.total)}))),
        'Percentual de Sim sobre Sim + Não de todos os professores com respostas suficientes. Professores abaixo do mínimo não entram na soma.'
      ) +
      panel(
        `Professores · ${esc(campaign.campaign)}`,
        overview,
        campaign.insufficient
          ? `${campaign.insufficient} de ${campaign.targets} professor(es) abaixo do mínimo de respostas.`
          : ''
      ) +
      panel(
        'Comparação entre avaliações, por professor',
        perTeacher,
        'Mesma disciplina e mesmo professor ao longo dos semestres e anos.'
      ) +
      targets.map(r => resultCard(r, true)).join('');
    byId('docCampaign').onchange = guard(async e => {
      root.dataset.campaign = e.target.value;
      await coordinationView();
    });
  }

  // --------------------------------------------------------------------- Pontos de extensão
  const inProfile = view =>
    guard(async container => {
      root = container;
      await view();
    });
  window.SupremaModules.add('CSTI', {label: 'Avaliação Docente', glyph: '▢', start: inProfile(listCampaigns)});
  window.SupremaModules.add('COORDENACAO', {
    label: 'Avaliação Docente',
    glyph: '▢',
    start: inProfile(coordinationView)
  });
  window.SupremaModules.add('ALUNO', {
    boot: guard(async slot => {
      studentSlot = slot;
      await studentBoot();
    })
  });
  window.SupremaViews = Object.assign(window.SupremaViews || {}, {'Avaliação Docente': {render: guard(teacherView)}});
})();
