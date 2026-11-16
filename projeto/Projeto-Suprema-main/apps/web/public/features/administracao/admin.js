'use strict';
(() => {
  const $ = s => document.querySelector(s),
    {esc, modal} = window.SupremaUI;
  const api = (url, opt = {}) => window.SupremaAPI.request(url, opt);
  const send = (route, body, method = 'POST') => api('/api/admin/' + route, {method, body: JSON.stringify(body)});
  let view = 'dashboard',
    data = {},
    generation = 0;
  const searchText = v =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  let userSearch = '';
  const field = (name, label, type = 'text', value = '', extra = '') =>
    `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const options = (items, label = 'name', selected = '') =>
    items
      .map(
        i =>
          `<option value="${esc(i.id)}" ${String(i.id) === String(selected) ? 'selected' : ''}>${esc(typeof label === 'function' ? label(i) : i[label])}</option>`
      )
      .join('');
  const select = (name, label, items, text = 'name', selected = '') =>
    `<label>${esc(label)}<select name="${name}" required><option value="">Selecione</option>${options(items, text, selected)}</select></label>`;
  const periodField = (role, value = '') =>
    `<label data-student-period ${role === 'ALUNO' ? '' : 'hidden'}>Per\u00edodo do aluno<input name="period" type="number" min="1" max="30" step="1" value="${esc(value || '')}" ${role === 'ALUNO' ? '' : 'disabled'} placeholder="N\u00e3o informado"></label>`;
  function connectPeriod(container) {
    const role = container.querySelector('[name=role]'),
      field = container.querySelector('[data-student-period]');
    if (!role || !field) return;
    const update = () => {
      const isStudent = role.value === 'ALUNO';
      field.hidden = !isStudent;
      field.querySelector('input').disabled = !isStudent;
    };
    role.addEventListener('change', update);
    update();
  }
  const form = (id, body, button = 'Salvar cadastro') =>
    `<form class="admin-form" id="${id}">${body}<button class="btn primary" type="submit">${button}</button></form>`;
  const panel = (title, body, description = '') =>
    `<section class="panel admin-panel"><div class="panel-title"><div><h3>${title}</h3>${description ? `<p>${description}</p>` : ''}</div></div>${body}</section>`;
  const badge = (on, yes = 'Ativo', no = 'Inativo') =>
    `<span class="state-badge ${on ? 'positive-state' : 'muted-state'}">${on ? yes : no}</span>`;
  const table = (head, rows, empty = 'Nenhum cadastro encontrado.') =>
    `<div class="admin-scroll"><table class="admin-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td class="empty-inline" colspan="${head.length}">${empty}</td></tr>`}</tbody></table></div>`;
  const action = (name, id, label) =>
    `<button class="admin-small" data-action="${name}" data-id="${id}" type="button">${label}</button>`;
  const notice = (message, error = false) => {
    const e = $('#adminMessage');
    if (e) {
      e.textContent = message;
      e.hidden = false;
      e.classList.toggle('error-message', error);
      e.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }
  };
  const activeSubjects = () => data.disciplines.filter(d => d.active && d.course_active);
  const subjectLabel = d => `${d.name} \u00b7 ${d.period}\u00ba per\u00edodo \u00b7 ${d.course_name}`;
  const termFields = () =>
    field('year', 'Ano letivo', 'number', new Date().getFullYear(), 'required min="2000" max="2200"') +
    `<label>Semestre<select name="semester"><option value="1">1\u00ba semestre</option><option value="2" ${new Date().getMonth() >= 6 ? 'selected' : ''}>2\u00ba semestre</option></select></label>` +
    field(
      'class_name',
      'Grupo (opcional)',
      'text',
      '',
      'maxlength="70" placeholder="Deixe vazio para grupo \u00fanico"'
    );
  // Perfis v\u00eam do servidor (/api/admin/roles); o administrador nunca \u00e9 criado nem alterado por esta tela.
  const managedRoles = () => (data.roles || []).filter(r => r.managed);
  const roleName = id => (data.roles || []).find(r => r.id === id)?.name || id;
  async function load() {
    const names = {
      dashboard: ['summary', 'health'],
      users: ['users', 'roles'],
      courses: ['courses'],
      disciplines: ['courses', 'disciplines'],
      assignments: ['users', 'disciplines', 'assignments'],
      enrollments: ['students', 'disciplines', 'enrollments', 'assignments', 'courses'],
      assessments: ['assessments'],
      controls: ['controls', 'health'],
      audit: ['audit']
    }[view];
    const next = {};
    await Promise.all(names.map(async n => (next[n] = await api('/api/admin/' + n))));
    return next;
  }
  function summary() {
    const s = data.summary;
    return (
      `<div class="admin-welcome"><div><span class="eyebrow">ADMINISTRA\u00c7\u00c3O GERAL</span><h1>Uma vis\u00e3o completa.<br>Um fluxo conectado.</h1><p>Organize os cadastros, vincule as disciplinas e acompanhe a publica\u00e7\u00e3o dos resultados.</p></div><span class="system-pill">${data.health.sqlite ? '\u25cf Banco verificado' : '\u25cf Banco requer revis\u00e3o'}</span></div>` +
      `<div class="admin-stats">${[
        ['Professores ativos', s.professors],
        ['Alunos cadastrados', s.students],
        ['Disciplinas ativas', s.disciplines],
        ['Avalia\u00e7\u00f5es publicadas', s.published]
      ]
        .map(([k, v]) => `<div class="panel admin-stat"><span>${k}</span><strong>${v}</strong></div>`)
        .join('')}</div>` +
      panel(
        'Comece por aqui',
        `<div class="workflow-grid">${[
          ['01', 'users', 'Pessoas', 'Crie os acessos de professores e alunos.'],
          ['02', 'disciplines', 'Estrutura', 'Organize cursos, disciplinas e per\u00edodos.'],
          ['03', 'assignments', 'V\u00ednculos', 'Vincule professores. A1, A2 e A3 ser\u00e3o criadas.'],
          ['04', 'enrollments', 'Matr\u00edculas', 'Os alunos aparecem nas avalia\u00e7\u00f5es vinculadas.']
        ]
          .map(
            ([n, target, title, desc]) =>
              `<button class="workflow-card" data-view-link="${target}"><span>${n}</span><h3>${title}</h3><p>${desc}</p><b>Abrir \u2192</b></button>`
          )
          .join('')}</div>`
      ) +
      panel(
        'Funcionamento da publica\u00e7\u00e3o',
        '<p>O professor pode salvar rascunhos incompletos. O aluno s\u00f3 consulta o resultado depois de <strong>Publicar</strong>. Novas edi\u00e7\u00f5es ficam privadas at\u00e9 a pr\u00f3xima publica\u00e7\u00e3o.</p>'
      )
    );
  }
  function users() {
    return (
      panel(
        'Criar usu\u00e1rios',
        `<div class="user-import-entry"><span>Cadastro individual ou importa\u00e7\u00e3o de uma planilha de alunos.</span><button type="button" class="btn primary" id="openStudentImport">Importar Alunos via Excel</button></div>` +
          form(
            'newUser',
            `<label>Perfil<select name="role" required>${options(managedRoles())}</select></label>` +
              field('name', 'Nome completo', 'text', '', 'required maxlength="150"') +
              field('email', 'E-mail de acesso', 'email', '', 'required maxlength="240"') +
              field('matricula', 'Matr\u00edcula / identificador', 'text', '', 'required maxlength="70"') +
              periodField('PROFESSOR') +
              field(
                'password',
                'Senha provis\u00f3ria',
                'password',
                '',
                'required minlength="8" maxlength="128" autocomplete="new-password"'
              ),
            'Criar usu\u00e1rio'
          ),
        'O perfil escolhido define o ambiente. Este formul\u00e1rio n\u00e3o cria administradores. A senha \u00e9 provis\u00f3ria: a pessoa define a pr\u00f3pria no primeiro acesso.'
      ) +
      window.SupremaStudentImport.markup() +
      panel(
        'Pessoas cadastradas',
        `<label class="user-search-label" for="userSearch">Pesquisar usuários por nome, matrícula ou e-mail/login</label><input id="userSearch" class="user-search" type="search" autocomplete="off" placeholder="Pesquisar usuários..." value="${esc(userSearch)}"><p id="userSearchCount" class="cell-sub"></p>` +
          table(
            [
              'Pessoa',
              'Perfil',
              'Per\u00edodo',
              'E-mail / identifica\u00e7\u00e3o',
              'Situa\u00e7\u00e3o',
              'A\u00e7\u00f5es'
            ],
            data.users.map(
              u =>
                `<tr data-user-search="${esc(searchText([u.name, u.matricula, u.email].join(' ')))}"><td><strong>${esc(u.name)}</strong></td><td>${esc(roleName(u.role))}</td><td>${u.role === 'ALUNO' && u.period ? esc(u.period) + '\u00ba' : '\u2014'}</td><td>${esc(u.email)}<small class="cell-sub">${esc(u.matricula)}</small></td><td>${badge(u.active)}${u.must_change_password ? '<small class="cell-sub">Senha provis\u00f3ria</small>' : ''}</td><td class="action-cell">${action('password', u.id, 'Redefinir senha')} ${u.role !== 'ADMIN' ? action('edituser', u.id, 'Editar') + ' ' + action('deleteuser', u.id, 'Excluir') : ''}</td></tr>`
            )
          )
      )
    );
  }
  function courses() {
    return (
      panel(
        'Novo curso',
        form('newCourse', field('name', 'Nome do curso', 'text', '', 'required maxlength="150"'), 'Criar curso')
      ) +
      panel(
        'Cursos',
        table(
          ['Curso', 'Situa\u00e7\u00e3o', 'A\u00e7\u00f5es'],
          data.courses.map(
            c =>
              `<tr><td>${esc(c.name)}</td><td>${badge(c.active)}</td><td>${action('editcourse', c.id, 'Editar')}</td></tr>`
          )
        )
      )
    );
  }
  function disciplines() {
    return (
      panel(
        'Nova disciplina',
        form(
          'newDiscipline',
          select(
            'course_id',
            'Curso',
            data.courses.filter(c => c.active)
          ) +
            field('name', 'Nome da disciplina', 'text', '', 'required maxlength="150"') +
            field('period', 'Per\u00edodo', 'number', '', 'required min="1" max="30"'),
          'Criar disciplina'
        ),
        'Cadastre o curso primeiro. Per\u00edodo \u00e9 num\u00e9rico: 1, 2, 3...'
      ) +
      panel(
        'Disciplinas',
        table(
          ['Disciplina', 'Curso', 'Per\u00edodo', 'Situa\u00e7\u00e3o', 'A\u00e7\u00f5es'],
          data.disciplines.map(
            d =>
              `<tr><td><strong>${esc(d.name)}</strong></td><td>${esc(d.course_name)}</td><td>${esc(d.period)}\u00ba</td><td>${badge(d.active)}</td><td>${action('editdiscipline', d.id, 'Editar')}</td></tr>`
          )
        )
      )
    );
  }
  function assignments() {
    return (
      panel(
        'Vincular professor',
        form(
          'newAssignment',
          select(
            'professor_id',
            'Professor',
            data.users.filter(u => u.role === 'PROFESSOR' && u.active)
          ) +
            select('discipline_id', 'Disciplina / per\u00edodo', activeSubjects(), subjectLabel) +
            termFields(),
          'Vincular e criar A1 / A2 / A3'
        ),
        'Ao salvar, a disciplina e as avalia\u00e7\u00f5es ficam dispon\u00edveis no ambiente desse professor.'
      ) +
      panel(
        'V\u00ednculos ativos',
        table(
          ['Professor', 'Disciplina', 'Per\u00edodo', 'Ano / semestre', 'Grupo', 'A\u00e7\u00f5es'],
          data.assignments.map(
            a =>
              `<tr><td>${esc(a.professor_name)}</td><td>${esc(a.discipline_name)}<small class="cell-sub">${esc(a.course_name)}</small></td><td>${esc(a.period)}\u00ba</td><td>${a.year}.${esc(a.semester)}</td><td>${esc(a.class_name) || '\u00danico'}</td><td>${action('delassignment', a.id, 'Desativar v\u00ednculo')}</td></tr>`
          )
        )
      )
    );
  }
  function offerings() {
    const seen = new Set();
    return data.assignments
      .filter(a => {
        const k = JSON.stringify([a.discipline_id, a.year, a.semester, a.class_name]);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((a, i) => ({
        ...a,
        id: i + 1,
        label: `${a.discipline_name} \u00b7 ${a.period}\u00ba \u00b7 ${a.year}.${a.semester}${a.class_name ? ' \u00b7 ' + a.class_name : ''} \u00b7 ${a.course_name}`
      }));
  }
  function enrollments() {
    data.offerings = offerings();
    return (
      panel(
        'Matricular na disciplina',
        form(
          'newEnrollment',
          select('offering_key', 'Oferta cadastrada', data.offerings, 'label') +
            select(
              'student_id',
              'Aluno',
              data.students,
              s => s.name + ' \u00b7 ' + s.matricula + (s.has_active_login ? '' : ' (sem acesso ativo)')
            ),
          'Matricular'
        ),
        'A oferta j\u00e1 inclui ano, semestre e grupo do v\u00ednculo docente. Isso evita matr\u00edculas no contexto errado.'
      ) +
      `<details class="panel admin-panel"><summary>Matricular alunos em todas as disciplinas de um per\u00edodo</summary><p>Esta a\u00e7\u00e3o cria v\u00ednculos expl\u00edcitos nas disciplinas ativas do curso/per\u00edodo selecionado. N\u00e3o estabelece regras de depend\u00eancia.</p>${form(
        'periodEnrollment',
        select(
          'course_id',
          'Curso',
          data.courses.filter(c => c.active)
        ) +
          `<label>Per\u00edodo<select name="period" required disabled><option value="">Selecione primeiro o curso</option></select></label>` +
          termFields() +
          `<label class="wide-field">Alunos do per\u00edodo (Ctrl para selecionar mais de um)<select multiple name="student_ids" id="periodEnrollmentStudents" size="6" required disabled aria-describedby="periodEnrollmentStatus"><option value="" disabled>Selecione um per\u00edodo para listar os alunos</option></select></label><p id="periodEnrollmentStatus" class="muted wide-field" role="status" aria-live="polite">Selecione o curso e o per\u00edodo para carregar os alunos.</p>`,
        'Matricular no per\u00edodo'
      )}</details>` +
      panel(
        'Matr\u00edculas ativas',
        table(
          ['Aluno', 'Disciplina', 'Per\u00edodo', 'Ano / semestre', 'Grupo', 'A\u00e7\u00f5es'],
          data.enrollments.map(
            e =>
              `<tr><td>${esc(e.student_name)}</td><td>${esc(e.discipline_name)}<small class="cell-sub">${esc(e.course_name)}</small></td><td>${esc(e.period)}\u00ba</td><td>${e.year}.${esc(e.semester)}</td><td>${esc(e.class_name) || '\u00danico'}</td><td>${action('delenrollment', e.id, 'Desativar matr\u00edcula')}</td></tr>`
          )
        )
      )
    );
  }

  // Bulk enrollment uses the student's registered period, not old enrollments.
  // Single-discipline enrollment remains independent for exceptional cases.
  function enrollmentPeriod(value) {
    const match = String(value ?? '')
      .trim()
      .match(/^(\d{1,2})(?:\s*[\u00ba\u00b0o]?\s*(?:per[i\u00ed]odo)?)?$/i);
    return match && Number(match[1]) >= 1 && Number(match[1]) <= 30 ? String(Number(match[1])) : '';
  }
  function updatePeriodEnrollmentButton(f) {
    if (!f) return;
    const students = f.querySelector('[name=student_ids]');
    const selected = Array.from(students.selectedOptions).some(o => o.value && !o.disabled);
    f.querySelector('[type=submit]').disabled = students.disabled || !selected || f.dataset.submitting === 'true';
  }
  function connectPeriodEnrollment(f) {
    if (!f) return;
    const course = f.querySelector('[name=course_id]'),
      period = f.querySelector('[name=period]'),
      students = f.querySelector('[name=student_ids]'),
      status = f.querySelector('#periodEnrollmentStatus');
    const refreshStudents = () => {
      // Replacing options intentionally clears selections from the previous context.
      const p = period.disabled ? '' : enrollmentPeriod(period.value);
      const matching = p ? data.students.filter(s => enrollmentPeriod(s.period) === p) : [];
      students.innerHTML = matching.length
        ? options(matching, s => s.name + ' \u00b7 ' + s.matricula + (s.has_active_login ? '' : ' (sem acesso ativo)'))
        : `<option value="" disabled>${p ? 'Nenhum aluno cadastrado neste per\u00edodo' : 'Selecione um per\u00edodo para listar os alunos'}</option>`;
      students.disabled = matching.length === 0;
      if (p) {
        status.textContent = matching.length
          ? `${matching.length} aluno(s) cadastrado(s) no ${p}\u00ba per\u00edodo. Selecione quem deseja matricular.`
          : `Nenhum aluno cadastrado no ${p}\u00ba per\u00edodo. Confira o campo Per\u00edodo em Usu\u00e1rios.`;
      } else {
        status.textContent =
          course.value && period.disabled
            ? 'Nenhuma disciplina ativa neste curso. Cadastre as disciplinas e seus per\u00edodos.'
            : 'Selecione o curso e o per\u00edodo para carregar os alunos.';
      }
      updatePeriodEnrollmentButton(f);
    };
    const refreshPeriods = () => {
      const periods = [
        ...new Set(
          activeSubjects()
            .filter(d => String(d.course_id) === course.value)
            .map(d => enrollmentPeriod(d.period))
            .filter(Boolean)
        )
      ].sort((a, b) => Number(a) - Number(b));
      period.innerHTML =
        `<option value="">${!course.value ? 'Selecione primeiro o curso' : periods.length ? 'Selecione o per\u00edodo' : 'Nenhum per\u00edodo dispon\u00edvel'}</option>` +
        options(periods.map(p => ({id: p, name: p + '\u00ba per\u00edodo'})));
      period.disabled = !course.value || !periods.length;
      refreshStudents();
    };
    course.addEventListener('change', refreshPeriods);
    period.addEventListener('change', refreshStudents);
    students.addEventListener('change', () => updatePeriodEnrollmentButton(f));
    refreshPeriods();
  }
  function assessments() {
    return panel(
      'Supervis\u00e3o das avalia\u00e7\u00f5es',
      table(
        ['Etapa / disciplina', 'Professor', 'Contexto', 'Alunos / publicados', 'Situa\u00e7\u00e3o', 'A\u00e7\u00f5es'],
        data.assessments.map(
          a =>
            `<tr><td><strong>${esc(a.type)} \u00b7 ${esc(a.discipline)}</strong></td><td>${esc(a.professor_name)}</td><td>${a.year}.${esc(a.semester)} \u00b7 ${esc(a.period)}\u00ba<small class="cell-sub">${esc(a.class_name)}</small></td><td>${a.students} / ${a.published_students}</td><td>${badge(!a.locked, 'Aberta', 'Encerrada')}${a.revision > a.published_revision ? '<small class="cell-sub">Rascunho alterado</small>' : ''}</td><td class="action-cell">${action('lock', a.id, a.locked ? 'Reabrir edi\u00e7\u00e3o' : 'Bloquear edi\u00e7\u00e3o')} ${action('gradehistory', a.id, 'Hist\u00f3rico de notas')}</td></tr>`
        )
      ),
      'O administrador acompanha e controla a edi\u00e7\u00e3o. N\u00e3o altera notas em nome do professor.'
    );
  }
  function controls() {
    const control = (key, title, desc) => {
      const v = data.controls.find(c => c.key === key)?.value;
      return `<div class="control-row"><div><h3>${title}</h3><p>${desc}</p></div>${badge(!v, 'Liberado', 'Pausado')}<button class="btn ${v ? 'primary' : ''}" data-action="control" data-key="${key}" data-value="${v ? 0 : 1}">${v ? 'Liberar' : 'Pausar'}</button></div>`;
    };
    return (
      panel(
        'Controle operacional',
        control(
          'pause_scores',
          'Lan\u00e7amento de notas',
          'Pausa salvamento, importa\u00e7\u00e3o e configura\u00e7\u00e3o de quest\u00f5es.'
        ) +
          control(
            'pause_publication',
            'Publica\u00e7\u00e3o de resultados',
            'Pausa novas publica\u00e7\u00f5es. Resultados j\u00e1 publicados continuam acess\u00edveis.'
          )
      ) +
      panel(
        'Diagn\u00f3stico do aplicativo',
        `<div class="health-grid"><div>Banco SQLite<strong>${data.health.sqlite ? 'Integridade OK' : 'Requer revis\u00e3o'}</strong></div><div>Refer\u00eancias inconsistentes<strong>${data.health.foreignKeyProblems}</strong></div><div>Servidor ativo<strong>${Math.floor(data.health.uptimeSeconds / 60)} min</strong></div><div>Vers\u00e3o<strong>${esc(data.health.version)}</strong></div></div><p class="muted">Este painel controla a aplica\u00e7\u00e3o, n\u00e3o reinicia o equipamento nem o servi\u00e7o de hospedagem.</p>`
      )
    );
  }
  function audit() {
    return panel(
      'Atividades recentes',
      table(
        ['Data / hora', 'Opera\u00e7\u00e3o', 'Quem', 'Origem', 'Detalhes'],
        data.audit.map(
          a =>
            `<tr><td>${esc(window.SupremaUI.when(a.created_at))}</td><td>${esc(a.action)}</td><td>${esc(a.actor_name || '\u2014')}</td><td>${esc(a.origin || '\u2014')}</td><td class="audit-detail">${esc(a.details)}</td></tr>`
        )
      ),
      '\u00daltimos 200 registros. Senhas n\u00e3o s\u00e3o registradas.'
    );
  }
  const renders = {
    dashboard: summary,
    users,
    courses,
    disciplines,
    assignments,
    enrollments,
    assessments,
    controls,
    audit
  };
  const titles = {
    dashboard: 'Vis\u00e3o geral',
    users: 'Gest\u00e3o de usu\u00e1rios',
    courses: 'Cursos',
    disciplines: 'Disciplinas',
    assignments: 'Professores e v\u00ednculos',
    enrollments: 'Matr\u00edculas de alunos',
    assessments: 'Supervis\u00e3o acad\u00eamica',
    controls: 'Controle operacional',
    audit: 'Hist\u00f3rico de atividades'
  };
  async function render() {
    const current = ++generation;
    $('#adminContent').setAttribute('aria-busy', 'true');
    try {
      const next = await load();
      if (current !== generation) return;
      data = next;
      $('#adminContent').innerHTML =
        `<div class="section-heading"><div><span class="eyebrow">AVALIA\u00c7\u00c3O SUPREMA</span><h2>${titles[view]}</h2></div><button class="btn" data-action="refresh">Atualizar</button></div><p id="adminMessage" role="status" class="admin-message" hidden></p>${renders[view]()}`;
      $('#adminNav')
        .querySelectorAll('button')
        .forEach(b => b.classList.toggle('active', b.dataset.adminView === view));
      if (view === 'enrollments') connectPeriodEnrollment($('#periodEnrollment'));
      if (view === 'users') {
        filterUserRows();
        connectPeriod($('#newUser'));
        window.SupremaStudentImport.mount(async () => {
          if (view === 'users') await render();
        });
      }
    } catch (e) {
      if (current === generation)
        $('#adminContent').innerHTML =
          `<div class="panel"><h2>N\u00e3o foi poss\u00edvel carregar</h2><p class="form-error">${esc(e.message)}</p><button class="btn" data-action="refresh">Tentar novamente</button></div>`;
    } finally {
      $('#adminContent').removeAttribute('aria-busy');
    }
  }
  window.bootAdmin = () => {
    window.SupremaStudentImport.reset();
    view = 'dashboard';
    data = {};
    return render();
  };
  $('#adminNav').addEventListener('click', e => {
    const b = e.target.closest('[data-admin-view]');
    if (b) {
      view = b.dataset.adminView;
      render();
    }
  });
  $('#adminLogoutBtn').onclick = async () => {
    window.SupremaStudentImport.reset();
    await api('/api/logout', {method: 'POST'}).catch(() => {});
    location.reload();
  };
  $('#adminContent').addEventListener('submit', async e => {
    if (!e.target.matches('form')) return;
    e.preventDefault();
    const f = e.target,
      b = f.querySelector('[type=submit]');
    b.disabled = true;
    let body = Object.fromEntries(new FormData(f)),
      route = {
        newUser: 'users',
        newCourse: 'courses',
        newDiscipline: 'disciplines',
        newAssignment: 'assignments',
        newEnrollment: 'enrollments',
        periodEnrollment: 'enrollments/period'
      }[f.id];
    try {
      if (f.id === 'newEnrollment') {
        const a = data.offerings.find(a => String(a.id) === body.offering_key);
        if (!a) throw Error('Selecione uma oferta vinculada.');
        body = {
          student_id: body.student_id,
          discipline_id: a.discipline_id,
          year: a.year,
          semester: a.semester,
          class_name: a.class_name
        };
      }
      if (f.id === 'periodEnrollment') {
        body.student_ids = new FormData(f).getAll('student_ids').filter(Boolean);
        const p = enrollmentPeriod(body.period),
          allowed = new Set(data.students.filter(s => p && enrollmentPeriod(s.period) === p).map(s => String(s.id)));
        if (!body.student_ids.length || body.student_ids.some(id => !allowed.has(id)))
          throw Error('Selecione apenas alunos do per\u00edodo informado.');
        if (!confirm('Matricular os alunos selecionados em todas as disciplinas ativas deste per\u00edodo?')) return;
        f.dataset.submitting = 'true';
      }
      const result = await send(route, body);
      await render();
      notice(
        f.id === 'newAssignment'
          ? 'V\u00ednculo salvo. A1, A2 e A3 j\u00e1 est\u00e3o dispon\u00edveis para o professor.'
          : result.existing
            ? 'Esta matr\u00edcula j\u00e1 estava ativa.'
            : 'Registro salvo com sucesso.'
      );
    } catch (err) {
      notice(err.message, true);
    } finally {
      delete f.dataset.submitting;
      b.disabled = false;
      if (f.id === 'periodEnrollment' && f.isConnected) updatePeriodEnrollmentButton(f);
    }
  });
  $('#adminContent').addEventListener('input', e => {
    if (e.target.id !== 'userSearch') return;
    userSearch = e.target.value;
    filterUserRows();
  });
  function filterUserRows() {
    const el = $('#userSearch'),
      rows = [...document.querySelectorAll('#adminContent tr[data-user-search]')];
    if (!el) return;
    const query = searchText(el.value);
    let visible = 0;
    for (const row of rows) {
      const show = row.dataset.userSearch.includes(query);
      row.hidden = !show;
      if (show) visible++;
    }
    const count = $('#userSearchCount');
    if (count) count.textContent = `${visible} de ${rows.length} usuário(s)`;
  }
  $('#adminContent').addEventListener('click', async e => {
    const link = e.target.closest('[data-view-link]');
    if (link) {
      view = link.dataset.viewLink;
      return render();
    }
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const id = Number(b.dataset.id),
      what = b.dataset.action;
    const saved = async (route, body, method = 'PUT') => {
      await send(route, body, method);
      await render();
      notice('Opera\u00e7\u00e3o conclu\u00edda.');
    };
    try {
      if (what === 'refresh') return render();
      if (what === 'password') {
        const u = data.users.find(u => Number(u.id) === id);
        return modal({
          title: 'Redefinir senha',
          body:
            `<p>Usu\u00e1rio: <strong>${esc(u.name)}</strong>. As sess\u00f5es anteriores ser\u00e3o encerradas. A senha informada \u00e9 provis\u00f3ria: ao entrar, a pessoa dever\u00e1 definir a pr\u00f3pria.</p>` +
            field(
              'password',
              'Nova senha',
              'password',
              '',
              'required minlength="8" maxlength="128" autocomplete="new-password"'
            ) +
            field('confirmation', 'Repita a senha', 'password', '', 'required minlength="8" maxlength="128"'),
          button: 'Redefinir senha',
          onSubmit: async body => {
            if (body.password !== body.confirmation) throw Error('As senhas n\u00e3o coincidem.');
            await saved('users/' + id + '/password', {password: body.password}, 'POST');
          }
        });
      }
      if (what === 'edituser') {
        const preview = await api('/api/admin/users/' + id + '/impact'),
          u = preview.user;
        const dialog = modal({
          title: 'Editar usu\u00e1rio',
          body:
            field('name', 'Nome', 'text', u.name, 'required maxlength="150"') +
            field('email', 'E-mail', 'email', u.email, 'required maxlength="240"') +
            field('matricula', 'Matr\u00edcula / identificador', 'text', u.matricula, 'required maxlength="70"') +
            select('role', 'Fun\u00e7\u00e3o', managedRoles(), 'name', u.role) +
            periodField(u.role, u.period) +
            `<div class="role-change-notice" hidden><p><strong>Altera\u00e7\u00e3o de fun\u00e7\u00e3o</strong><br>O e-mail e a senha continuam os mesmos. As sess\u00f5es atuais ser\u00e3o encerradas e os v\u00ednculos ativos da fun\u00e7\u00e3o anterior ser\u00e3o desativados. Notas e resultados j\u00e1 registrados ser\u00e3o preservados.</p><p>V\u00ednculos docentes ativos: ${preview.counts.active_assignments}. Matr\u00edculas ativas: ${preview.counts.active_enrollments}.</p><label class="check-field"><input type="checkbox" name="confirm_role_change"> Confirmo a altera\u00e7\u00e3o. Organizarei os novos v\u00ednculos depois de salvar.</label></div>` +
            `<label class="check-field"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Acesso ativo</label>`,
          onSubmit: async body => {
            const result = await send(
              'users/' + id,
              {
                ...body,
                active: body.active === 'on',
                expected_version: u.session_version,
                confirm_role_change: body.confirm_role_change === 'on'
              },
              'PUT'
            );
            await render();
            notice(
              result.role_changed
                ? 'Fun\u00e7\u00e3o alterada. O usu\u00e1rio pode entrar com o mesmo e-mail e senha no novo ambiente. Confira os novos v\u00ednculos acad\u00eamicos.'
                : 'Cadastro atualizado.'
            );
          }
        });
        connectPeriod(dialog);
        dialog.querySelector('[name=role]').addEventListener('change', e => {
          const changed = e.target.value !== u.role,
            warning = dialog.querySelector('.role-change-notice'),
            confirmation = dialog.querySelector('[name=confirm_role_change]');
          warning.hidden = !changed;
          confirmation.required = changed;
          confirmation.checked = false;
        });
        return;
      }
      if (what === 'deleteuser') {
        const preview = await api('/api/admin/users/' + id + '/impact'),
          u = preview.user,
          c = preview.counts;
        if (!preview.can_delete)
          return modal({
            title: 'Exclus\u00e3o protegida',
            body: `<p><strong>${esc(u.name)}</strong> \u00b7 ${esc(u.email)}</p><p class="user-delete-warning">${esc(preview.reason)}</p><p>Registros com notas: ${c.graded_rows}. Resultados publicados: ${c.published_rows}. Nenhum dado foi exclu\u00eddo.</p>`,
            button: 'Entendi',
            onSubmit: async () => {}
          });
        const dialog = modal({
          title: 'Excluir usu\u00e1rio',
          body:
            `<p>Excluir definitivamente o acesso de <strong>${esc(u.name)}</strong>?</p><p><strong>${esc(u.email)}</strong> \u00b7 ${u.role === 'ALUNO' ? 'Aluno' : 'Professor'}</p><p class="user-delete-warning">Esta a\u00e7\u00e3o n\u00e3o \u00e9 apenas uma desativa\u00e7\u00e3o. O cadastro ser\u00e1 removido, o acesso encerrado e o e-mail ficar\u00e1 dispon\u00edvel para um novo cadastro.</p><p>Ser\u00e3o removidos: ${c.assignments} v\u00ednculo(s) docente(s), ${c.assessments} avalia\u00e7\u00e3o(\u00f5es) sem notas, ${c.enrollments} matr\u00edcula(s) e ${c.score_rows} linha(s) de notas vazias. Nenhuma nota preenchida ou publica\u00e7\u00e3o ser\u00e1 apagada.</p>` +
            field(
              'confirmation_email',
              'Digite o e-mail desta conta para confirmar',
              'email',
              '',
              'required maxlength="240" autocomplete="off"'
            ),
          button: 'Excluir definitivamente',
          onSubmit: async body => {
            await send(
              'users/' + id,
              {confirmation_email: body.confirmation_email, expected_version: u.session_version},
              'DELETE'
            );
            await render();
            notice('Usu\u00e1rio exclu\u00eddo. O e-mail e o identificador podem ser usados novamente.');
          }
        });
        dialog.querySelector('[type=submit]').classList.add('delete-user-confirm');
        return;
      }
      if (what === 'editcourse') {
        const c = data.courses.find(c => Number(c.id) === id);
        return modal({
          title: 'Editar curso',
          body:
            field('name', 'Nome', 'text', c.name, 'required') +
            `<label class="check-field"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Curso ativo</label>`,
          onSubmit: body => saved('courses/' + id, {...body, active: body.active === 'on'})
        });
      }
      if (what === 'editdiscipline') {
        const d = data.disciplines.find(d => Number(d.id) === id);
        return modal({
          title: 'Editar disciplina',
          body:
            select('course_id', 'Curso', data.courses, 'name', d.course_id) +
            field('name', 'Nome', 'text', d.name, 'required') +
            field('period', 'Per\u00edodo', 'number', d.period, 'required min="1" max="30"') +
            `<label class="check-field"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> Disciplina ativa</label><p class="muted">Curso e per\u00edodo com v\u00ednculos s\u00e3o preservados. O nome pode ser corrigido.</p>`,
          onSubmit: body => saved('disciplines/' + id, {...body, active: body.active === 'on'})
        });
      }
      if (what.startsWith('del')) {
        if (!confirm('Desativar este v\u00ednculo? Notas e resultados publicados ser\u00e3o preservados.')) return;
        await api('/api/admin/' + (what === 'delassignment' ? 'assignments' : 'enrollments') + '/' + id, {
          method: 'DELETE'
        });
        await render();
        return notice('V\u00ednculo desativado. Hist\u00f3rico preservado.');
      }
      if (what === 'gradehistory') {
        const a = data.assessments.find(a => Number(a.id) === id);
        return window.SupremaUI.overlay({
          title: 'Hist\u00f3rico de notas',
          subtitle: `${a.type} \u00b7 ${a.discipline} \u00b7 ${a.professor_name} \u00b7 ${a.year}.${a.semester}`,
          load: async content => {
            const h = await api('/api/admin/assessments/' + id + '/history');
            content.innerHTML = window.SupremaUI.gradeHistory(h);
          }
        });
      }
      if (what === 'lock') {
        const a = data.assessments.find(a => Number(a.id) === id);
        if (
          !confirm(
            a.locked
              ? 'Reabrir edi\u00e7\u00e3o desta avalia\u00e7\u00e3o?'
              : 'Bloquear edi\u00e7\u00e3o desta avalia\u00e7\u00e3o?'
          )
        )
          return;
        return saved('assessments/' + id + '/lock', {locked: !a.locked}, 'POST');
      }
      if (what === 'control') {
        if (
          !confirm(
            Number(b.dataset.value)
              ? 'Pausar esta opera\u00e7\u00e3o para todos os professores?'
              : 'Liberar esta opera\u00e7\u00e3o?'
          )
        )
          return;
        await saved('controls', {key: b.dataset.key, value: Number(b.dataset.value)});
      }
    } catch (err) {
      notice(err.message, true);
    }
  });
})();
