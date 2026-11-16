'use strict';
const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)],
  {esc, modal} = window.SupremaUI;
let assessments = [],
  currentType = 'A2',
  currentAssessment = null,
  currentRows = [],
  currentStats = null,
  currentHeaders = {},
  currentQuestionConfig = [],
  currentInstrumentConfig = [];
let dirty = false,
  busy = false,
  loadToken = 0,
  currentUser = null,
  refreshRunning = false;
const profileDefault = document.querySelector('#profileContent').innerHTML; // tela neutra, restaurada a cada entrada
const questionKeys = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'me1', 'me2', 'me3', 'me4'],
  osceKeys = ['osce1', 'osce2', 'osce3', 'osce4'];
const defaultHeaders = {
  q7: 'Outros 1',
  q8: 'Outros 2',
  q9: 'Outros 3',
  nota_prova: 'Nota da Prova',
  pbl1: 'SAI 1',
  pbl2: 'SAI 2',
  osce: 'OSCE',
  trabalho: 'Trabalho Rev. Sist.',
  nota_final: 'Nota Final',
  status: 'Status'
};
function present(v) {
  return v !== null && v !== undefined && v !== '';
}
function fmt(v, d = 2) {
  if (!present(v) || !Number.isFinite(Number(v))) return '\u2014';
  return Number(v).toLocaleString('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d});
}
function toast(message, ms = 5000) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}
function loggedOut(message = '') {
  loadToken++;
  currentUser = null;
  currentStats = null;
  dirty = false;
  for (const id of ['appScreen', 'adminScreen', 'studentScreen', 'profileScreen']) $('#' + id).classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
  $('#passwordInput').value = '';
  $('#loginError').textContent = message;
}
window.addEventListener('suprema-session-expired', () => loggedOut('Sua sess\u00e3o terminou. Entre novamente.'));
const api = (url, opt = {}) => window.SupremaAPI.request(url, opt);
function h(k) {
  return currentHeaders[k] || defaultHeaders[k] || k;
}
function reportH(k) {
  return currentStats?.headers?.[k] || defaultHeaders[k] || k;
}
function qlabel(k) {
  const i = questionKeys.indexOf(k);
  return k.startsWith('me') ? `M\u00faltipla Escolha ${i - 5}` : `Quest\u00e3o ${i + 1}`;
}
function qcfg(k) {
  return currentQuestionConfig.find(q => q.field_key === k) || {field_key: k, area: '', max_value: null};
}
async function showUser(user) {
  if (!user || typeof user.role !== 'string' || !user.role) throw Error('Perfil n\u00e3o reconhecido.');
  // Uma senha escolhida por outra pessoa \u00e9 provis\u00f3ria: nada \u00e9 exibido antes da troca.
  if (user.mustChangePassword) {
    if (!(await changePassword(true))) {
      await api('/api/logout', {method: 'POST'}).catch(() => {});
      loggedOut('Para entrar, defina uma nova senha.');
      return;
    }
    user = {...user, mustChangePassword: false};
  }
  currentUser = user;
  dirty = false;
  currentAssessment = null;
  currentRows = [];
  currentStats = null;
  assessments = [];
  for (const k of contextFields) contextState[k] = '';
  for (const id of ['loginScreen', 'appScreen', 'adminScreen', 'studentScreen', 'profileScreen'])
    $('#' + id).classList.add('hidden');
  // Perfis sem tela própria entram em uma tela neutra, sem dados. Um módulo que atende o perfil
  // acrescenta itens em window.SupremaModules (shared/ui.js) e desenha dentro dessa tela: é o
  // ponto de extensão para módulos novos, que assim não precisam substituir funções deste
  // arquivo. Um perfil pode ter itens de vários módulos; o primeiro abre ao entrar.
  if (!['ADMIN', 'PROFESSOR', 'ALUNO'].includes(user.role)) {
    const label = user.roleLabel || user.role;
    $('#profileNav').innerHTML = '';
    $('#profileContent').innerHTML = profileDefault;
    $('#profileName').textContent = user.name;
    $('#profileRole').textContent = label;
    $('#profileTitle').textContent = label;
    $('#profileScreen').classList.remove('hidden');
    const items = window.SupremaModules.of(user.role);
    if (items.length) {
      $('#profileNav').innerHTML = items
        .map(
          item =>
            `<button class="nav-item" type="button">${esc(item.glyph || '\u25a2')} <span>${esc(item.label)}</span></button>`
        )
        .join('');
      const buttons = $$('#profileNav .nav-item'),
        open = async i => {
          buttons.forEach((b, n) => b.classList.toggle('active', n === i));
          await items[i].start($('#profileContent'));
        };
      buttons.forEach((b, i) => (b.onclick = () => open(i)));
      await open(0);
    }
  }
  if (user.role === 'ADMIN') {
    $('#adminName').textContent = user.name;
    $('#adminScreen').classList.remove('hidden');
    await window.bootAdmin();
    mountAdminModules();
  }
  if (user.role === 'PROFESSOR') {
    $('#profName').textContent = 'Ol\u00e1, ' + user.name;
    $('#appScreen').classList.remove('hidden');
    $('#mainView').classList.remove('hidden');
    $('#devView').classList.add('hidden');
    await refreshTeacher(true);
  }
  if (user.role === 'ALUNO') {
    $('#studentName').textContent = user.name;
    $('#studentScreen').classList.remove('hidden');
    // Módulos com tela para o aluno entram pela barra lateral (#studentModuleNav) e desenham em #studentModuleView.
    $('#studentModuleNav').innerHTML = '';
    $('#studentModuleView').classList.add('hidden');
    $('#studentResultBody').classList.remove('hidden');
    await bootStudent();
    for (const item of window.SupremaModules.of('ALUNO')) {
      const slot = document.createElement('div');
      $('#studentModuleNav').append(slot);
      await item.boot(slot);
    }
  }
  $('#passwordInput').value = '';
}
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const b = e.target.querySelector('[type=submit]');
  b.disabled = true;
  $('#loginError').textContent = '';
  try {
    const d = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({login: $('#loginInput').value, password: $('#passwordInput').value})
    });
    await showUser(d.user);
  } catch (err) {
    $('#loginError').textContent = err.message;
    toast(err.message);
  } finally {
    b.disabled = false;
  }
};
async function doLogout() {
  if (dirty && !confirm('H\u00e1 altera\u00e7\u00f5es n\u00e3o salvas. Sair e descart\u00e1-las?')) return;
  dirty = false;
  await api('/api/logout', {method: 'POST'}).catch(() => {});
  location.reload();
}
$('#logoutBtn').onclick = doLogout;
$('#studentLogoutBtn').onclick = doLogout;
$('#profileLogoutBtn').onclick = doLogout;
// Troca da pr\u00f3pria senha, para os tr\u00eas perfis. Resolve true quando a senha foi alterada.
function changePassword(forced = false) {
  return new Promise(resolve => {
    let changed = false;
    const dialog = modal({
      title: forced ? 'Defina sua senha' : 'Alterar senha',
      button: 'Salvar nova senha',
      body:
        (forced
          ? '<p>Sua senha atual \u00e9 provis\u00f3ria. Para continuar, escolha uma senha que s\u00f3 voc\u00ea conhe\u00e7a.</p>'
          : '') +
        '<label>Senha atual<input name="current_password" type="password" autocomplete="current-password" required maxlength="128"></label>' +
        '<label>Nova senha<input name="new_password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>' +
        '<label>Repita a nova senha<input name="confirmation" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>' +
        '<p class="muted">De 8 a 128 caracteres. As outras sess\u00f5es desta conta ser\u00e3o encerradas.</p>',
      onSubmit: async body => {
        if (body.new_password !== body.confirmation) throw Error('As senhas n\u00e3o coincidem.');
        await api('/api/me/password', {
          method: 'POST',
          body: JSON.stringify({current_password: body.current_password, new_password: body.new_password})
        });
        changed = true;
        toast('Senha alterada.');
      }
    });
    // No primeiro acesso a pessoa acabou de digitar a senha provis\u00f3ria na tela de entrada.
    if (forced) dialog.querySelector('[name=current_password]').value = $('#passwordInput').value || '';
    dialog.addEventListener('close', () => resolve(changed), {once: true});
  });
}
$$('.change-password-btn').forEach(b => (b.onclick = () => changePassword(false)));
const contextFields = ['year', 'semester', 'period', 'discipline'],
  contextIds = {year: 'yearSelect', semester: 'semesterSelect', period: 'periodSelect', discipline: 'disciplineSelect'},
  contextState = {year: '', semester: '', period: '', discipline: ''};
function academicNumber(v) {
  const m = String(v ?? '')
    .trim()
    .match(/^([0-9]{1,2})(?:\s|[\u00ba\u00b0o]|$)/);
  return m ? String(Number(m[1])) : String(v ?? '');
}
const contextValue = (a, k) =>
  String(k === 'discipline' ? a.context_key : ['semester', 'period'].includes(k) ? academicNumber(a[k]) : a[k]);
function contextValues(field) {
  const index = contextFields.indexOf(field),
    eligible = assessments.filter(a =>
      contextFields.slice(0, index).every(k => contextValue(a, k) === contextState[k])
    );
  return [...new Set(eligible.map(a => contextValue(a, field)))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', {numeric: true})
  );
}
function refreshContext(start = 0) {
  for (let i = start; i < contextFields.length; i++) {
    const k = contextFields[i],
      el = $('#' + contextIds[k]),
      values = contextValues(k);
    contextState[k] = values.includes(contextState[k]) ? contextState[k] : values[0] || '';
    el.replaceChildren(
      ...values.map(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent =
          k === 'semester'
            ? v + '\u00ba semestre'
            : k === 'period'
              ? v.replace(/\D/g, '') + '\u00ba per\u00edodo'
              : k === 'discipline'
                ? assessments.find(a => a.context_key === v)?.context_label || v
                : v;
        return o;
      })
    );
    if (!values.length) {
      const o = document.createElement('option');
      o.textContent = 'Sem v\u00ednculos';
      o.value = '';
      el.append(o);
    }
    el.value = contextState[k];
    el.disabled = !values.length;
  }
}
async function refreshTeacher(force = false) {
  if (refreshRunning || busy || dirty) return;
  refreshRunning = true;
  try {
    const rows = await api('/api/assessments'),
      changed = JSON.stringify(rows) !== JSON.stringify(assessments);
    if (force || changed) {
      assessments = rows;
      refreshContext();
      await selectType(currentType, false);
    }
  } catch (e) {
    toast(e.message);
  } finally {
    refreshRunning = false;
  }
}
for (const [i, k] of contextFields.entries())
  $('#' + contextIds[k]).onchange = async e => {
    if (dirty && !confirm('Descartar altera\u00e7\u00f5es n\u00e3o salvas e mudar de contexto?')) {
      e.target.value = contextState[k];
      return;
    }
    dirty = false;
    contextState[k] = e.target.value;
    refreshContext(i + 1);
    await selectType(currentType, false);
  };
async function selectType(type, ask = true) {
  if (!['A1', 'A2', 'A3'].includes(type)) return;
  if (ask && dirty && !confirm('Descartar altera\u00e7\u00f5es n\u00e3o salvas e mudar de avalia\u00e7\u00e3o?'))
    return;
  dirty = false;
  currentType = type;
  currentStats = null;
  for (const id of [
    'resultCards',
    'histChart',
    'componentChart',
    'classInsights',
    'questionAnalysis',
    'rankingTable',
    'studentSummary',
    'individualCards',
    'comparisonChart',
    'individualComponentChart',
    'individualTable'
  ])
    $('#' + id).innerHTML = '';
  $$('.type-switch button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const matches = assessments.filter(
    a => contextFields.every(k => contextValue(a, k) === contextState[k]) && a.type === type
  );
  currentAssessment = matches.length === 1 ? matches[0] : null;
  $('#contextNotice').textContent = currentAssessment
    ? `${currentAssessment.type} \u00b7 ${currentAssessment.discipline} \u00b7 ${String(currentAssessment.period).replace(/\D/g, '')}\u00ba per\u00edodo \u00b7 ${currentAssessment.year}.${academicNumber(currentAssessment.semester)}`
    : matches.length > 1
      ? 'Contexto duplicado: solicite revis\u00e3o ao administrador.'
      : 'Nenhuma disciplina vinculada. O administrador precisa cadastrar seu v\u00ednculo de doc\u00eancia. Use Atualizar ap\u00f3s o cadastro.';
  if (!currentAssessment) {
    currentRows = [];
    $('#scoresTable tbody').innerHTML =
      '<tr><td colspan="30" class="empty-inline">As avalia\u00e7\u00f5es aparecer\u00e3o aqui quando houver um v\u00ednculo acad\u00eamico ativo.</td></tr>';
    setTab('launch');
    updateLocked();
    return;
  }
  try {
    await loadAssessment();
    setTab('launch');
  } catch (e) {
    toast(e.message);
    updateLocked();
  }
}
$$('.type-switch button').forEach(b => (b.onclick = () => selectType(b.dataset.type)));
$('#refreshTeacherBtn').onclick = () => {
  if (dirty) return toast('Salve o rascunho antes de atualizar.');
  refreshTeacher(true);
};
setInterval(() => {
  if (currentUser?.role === 'PROFESSOR' && !document.hidden) refreshTeacher();
}, 15000);
async function loadAssessment() {
  const wanted = currentAssessment?.id,
    token = ++loadToken;
  if (!wanted) return;
  const d = await api(`/api/assessment/${wanted}`);
  if (token !== loadToken || currentAssessment?.id !== wanted) return;
  currentAssessment = d.assessment;
  currentRows = d.rows;
  currentHeaders = {...defaultHeaders, ...d.headers};
  currentQuestionConfig = d.questionConfig || [];
  currentInstrumentConfig = d.instrumentConfig || [];
  dirty = false;
  renderHeaders();
  renderQuestionHeaders();
  renderTable();
  fillStudentSelect();
  await loadStats();
  updateLocked();
}
// Valor máximo declarado de um instrumento (SAI, estações do OSCE, trabalho, outros); null quando não há.
function imax(k) {
  const c = currentInstrumentConfig.find(i => i.field_key === k);
  return c && present(c.max_value) ? Number(c.max_value) : null;
}
function instrumentName(k) {
  const i = osceKeys.indexOf(k);
  return i >= 0 ? 'OSCE — Estação ' + (i + 1) : k === 'osce' ? 'Total OSCE' : h(k);
}
function renderHeaders() {
  $$('.editable-th,.instrument-th').forEach(th => {
    const k = th.dataset.headerKey || th.dataset.instrumentKey,
      named = !!th.dataset.headerKey,
      max = imax(k);
    if (named) th.querySelector('span').textContent = h(k);
    let em = th.querySelector('em');
    if (!em) {
      em = document.createElement('em');
      th.append(em);
    }
    em.textContent = max === null ? (k === 'osce' ? '' : 'Definir valor') : 'Máx. ' + fmt(max);
    th.title = named ? 'Editar nome e valor máximo' : 'Definir valor máximo';
    th.setAttribute('tabindex', '0');
    th.setAttribute('role', 'button');
    th.onclick = () => editInstrument(k, named);
    th.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        editInstrument(k, named);
      }
    };
  });
}
function editInstrument(k, named) {
  if (!currentAssessment || currentAssessment.locked) return toast('Avaliação bloqueada para edição.');
  const max = imax(k);
  modal({
    title: instrumentName(k),
    body:
      (named ? `<label>Nome<input name="label" value="${esc(h(k))}" maxlength="80" required></label>` : '') +
      `<label>Valor máximo (opcional)<input type="number" step="0.01" min="0.01" name="max_value" value="${max ?? ''}"></label>` +
      `<p class="muted">${k === 'osce' ? 'Use somente quando o OSCE é lançado como valor único, sem estações. Com estações, o máximo do total é a soma dos máximos das estações utilizadas.' : 'O valor máximo não altera a soma da nota final. Ele permite calcular o aproveitamento nos gráficos e impede publicar nota acima dele.'}</p>`,
    onSubmit: async body => {
      const id = currentAssessment.id;
      if (named && body.label !== h(k)) {
        const d = await api(`/api/assessment/${id}/headers`, {
          method: 'PUT',
          body: JSON.stringify({revision: currentAssessment.revision, headers: {[k]: body.label}})
        });
        currentAssessment.revision = d.revision;
        currentHeaders = d.headers;
      }
      const wanted = body.max_value === '' ? null : Number(body.max_value);
      if (wanted !== max) {
        const d = await api(`/api/assessment/${id}/instrument-config`, {
          method: 'PUT',
          body: JSON.stringify({revision: currentAssessment.revision, field_key: k, max_value: wanted})
        });
        currentAssessment.revision = d.revision;
        currentInstrumentConfig = d.instrumentConfig;
      }
      renderHeaders();
      updateLocked();
      toast('Configuração salva no rascunho. Publique para liberar a alteração.');
    }
  });
}
function renderQuestionHeaders() {
  $$('.question-config').forEach(th => {
    const k = th.dataset.questionKey,
      c = qcfg(k);
    th.querySelector('small').textContent = c.area || 'Definir \u00e1rea de conhecimento';
    th.querySelector('em').textContent = present(c.max_value) ? `M\u00e1x. ${fmt(c.max_value)}` : 'Definir valor';
    th.setAttribute('tabindex', '0');
    th.setAttribute('role', 'button');
    th.title = 'Configurar ' + qlabel(k);
    th.onclick = () => editQuestionConfig(k);
    th.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        editQuestionConfig(k);
      }
    };
  });
}
function editQuestionConfig(k) {
  if (!currentAssessment || currentAssessment.locked)
    return toast('Avalia\u00e7\u00e3o bloqueada para edi\u00e7\u00e3o.');
  const c = qcfg(k);
  modal({
    title: qlabel(k),
    body: `<p>Rascunho pode ficar incompleto. Para publicar uma quest\u00e3o utilizada, informe a \u00e1rea e o valor.</p><label>\u00c1rea de conhecimento<input name="area" value="${esc(c.area)}" maxlength="160"></label><label>Valor m\u00e1ximo<input type="number" step="0.01" min="0.01" name="max_value" value="${c.max_value ?? ''}"></label>`,
    onSubmit: async body => {
      const d = await api(`/api/assessment/${currentAssessment.id}/question-config`, {
        method: 'PUT',
        body: JSON.stringify({
          revision: currentAssessment.revision,
          field_key: k,
          area: body.area,
          max_value: body.max_value === '' ? null : Number(body.max_value)
        })
      });
      currentAssessment.revision = d.revision;
      currentQuestionConfig = d.questionConfig;
      renderQuestionHeaders();
      updateLocked();
      toast('Quest\u00e3o configurada no rascunho.');
    }
  });
}
function inputCell(r, k) {
  return `<input type="number" min="0" step="0.01" data-id="${r.id}" data-key="${k}" aria-label="${esc((questionKeys.includes(k) ? qlabel(k) : h(k)) + ' de ' + r.name)}" value="${esc(r[k] ?? '')}" ${currentAssessment.locked ? 'disabled' : ''}>`;
}
function renderTable() {
  const tb = $('#scoresTable tbody');
  if (!currentRows.length) {
    tb.innerHTML =
      '<tr><td colspan="30" class="empty-inline">Disciplina vinculada. Falta o administrador matricular os alunos nesta oferta (mesmo ano, semestre e grupo).</td></tr>';
    return;
  }
  tb.innerHTML = currentRows
    .map(
      (r, i) =>
        `<tr><td class="identity-number">${i + 1}</td><td class="identity-registration">${esc(r.matricula)}</td><td class="identity-name"><span class="student-name" title="${esc(r.name)}">${esc(r.name)}</span></td>${questionKeys.map(k => `<td>${inputCell(r, k)}</td>`).join('')}<td class="note-cell">${fmt(r.nota_prova)}</td><td>${inputCell(r, 'pbl1')}</td><td>${inputCell(r, 'pbl2')}</td>${osceKeys.map(k => `<td>${inputCell(r, k)}</td>`).join('')}<td class="osce-total">${fmt(r.osce)}</td>${['q7', 'q8', 'q9', 'trabalho'].map(k => `<td>${inputCell(r, k)}</td>`).join('')}<td class="final-cell">${fmt(r.nota_final)}</td><td><span class="status ${r.is_published ? 'sent' : ''}">${r.has_draft ? 'Rascunho alterado' : r.is_published ? 'Publicado' : 'Rascunho'}</span></td></tr>`
    )
    .join('');
  tb.querySelectorAll('input').forEach(
    inp =>
      (inp.oninput = () => {
        const r = currentRows.find(x => String(x.id) === inp.dataset.id);
        r[inp.dataset.key] = inp.value === '' ? null : Number(inp.value);
        if (osceKeys.includes(inp.dataset.key) && !osceKeys.some(k => present(r[k]))) r.osce = null;
        dirty = true;
        recalcLocal(r);
        const tr = inp.closest('tr');
        tr.querySelector('.note-cell').textContent = fmt(r.nota_prova);
        tr.querySelector('.osce-total').textContent = fmt(r.osce);
        tr.querySelector('.final-cell').textContent = fmt(r.nota_final);
        markBelowAverage();
        updateDraftState();
      })
  );
  markBelowAverage();
}
// PATCH V11.6: Colagem em bloco do Excel, sem alterar o fluxo de rascunho/publicacao.
// A colagem nunca grava no banco; so atualiza os campos editaveis apos confirmacao.
function parseExcelNumber(raw, label) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const value = Number(text.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 1000000)
    throw Error(`${label}: informe uma nota numerica nao negativa.`);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function pasteScoreField(label) {
  const n = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  for (let i = 1; i <= 6; i++) if (n === `c${i}` || n === `q${i}` || n.startsWith(`questao${i}`)) return 'c' + i;
  for (let i = 1; i <= 4; i++) if (n === `me${i}` || n.startsWith(`multiplaescolha${i}`)) return 'me' + i;
  for (let i = 1; i <= 4; i++)
    if (n === `estacao${i}` || n === `osceestacao${i}` || n === `osce${i}`) return 'osce' + i;
  for (let i = 1; i <= 2; i++) if (n === `sai${i}` || n === `pbl${i}`) return 'pbl' + i;
  for (let i = 1; i <= 3; i++) if (n === `outros${i}`) return 'q' + (i + 6);
  if (n.startsWith('trabalho')) return 'trabalho';
  return null;
}
function applyExcelPaste(changes, assessmentId, revision) {
  if (currentAssessment?.id !== assessmentId || currentAssessment?.revision !== revision || currentAssessment.locked)
    throw Error('A avaliacao foi alterada. Refaça a colagem.');
  const byId = new Map(currentRows.map(r => [String(r.id), r]));
  for (const c of changes) {
    if (!byId.has(c.id)) throw Error('Aluno nao encontrado. Refaça a colagem.');
  }
  for (const c of changes) {
    byId.get(c.id)[c.key] = c.value;
    recalcLocal(byId.get(c.id));
  }
  dirty = true;
  renderTable();
  updateDraftState();
  toast(`${changes.length} nota(s) inserida(s). Confira e clique em Salvar rascunho.`);
}
$('#scoresTable tbody').addEventListener('paste', e => {
  const focused = e.target.closest('input[data-id][data-key]');
  if (!focused || !currentAssessment || currentAssessment.locked || busy) return;
  const raw = e.clipboardData?.getData('text/plain') || '';
  if (!raw.includes('\t') && !/[\r\n]/.test(raw)) return; // Uma nota isolada continua com a colagem nativa.
  e.preventDefault();
  try {
    const matrix = raw
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.split('\t'));
    while (matrix.length && matrix[matrix.length - 1].every(v => !v.trim())) matrix.pop();
    if (!matrix.length || matrix.length > 1000 || matrix.some(row => row.length > 40))
      throw Error('Selecione ate 1.000 linhas e 40 colunas por colagem.');
    const norm = s =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const headers = matrix[0].map(norm),
      idCol = headers.findIndex(h => h === 'matricula' || h === 'registro' || h === 'ra');
    const withHeader = idCol >= 0;
    // Ao copiar somente os dados de uma planilha inteira (sem o cabecalho),
    // identifica os alunos pela matricula da segunda coluna, sem depender da ordem.
    const withRoster =
      !withHeader &&
      matrix[0].length >= 3 &&
      currentRows.some(
        r =>
          String(r.matricula).trim().toLowerCase() ===
          String(matrix[0][1] || '')
            .trim()
            .toLowerCase()
      ) &&
      Number.isNaN(Number(String(matrix[0][0] || '').replace(',', '.')));
    const planned = new Map(),
      maxes = new Map(
        [...currentQuestionConfig, ...currentInstrumentConfig].map(c => [c.field_key, Number(c.max_value) || null])
      );
    const existingIds = new Map(currentRows.map(r => [String(r.matricula).trim().toLowerCase(), r]));
    const tableRows = [...document.querySelectorAll('#scoresTable tbody tr')];
    const firstRow = focused.closest('tr'),
      start = tableRows.indexOf(firstRow),
      firstCol = focused.closest('td').cellIndex;
    if (start < 0 || firstCol < 3) throw Error('Selecione a primeira celula de nota onde deseja colar.');
    const editableByIndex = tableRows[0]
      ? [...tableRows[0].cells].map(td => td.querySelector('input[data-key]')?.dataset.key || null)
      : [];
    const add = (row, key, cell, line) => {
      if (cell === undefined || String(cell).trim() === '') return; // Vazios nunca apagam notas.
      if (!row) throw Error(`Linha ${line}: aluno nao encontrado.`);
      if (!key) return; // Ignora totais e colunas calculadas, sem deslocar as outras notas.
      const value = parseExcelNumber(cell, `Linha ${line}, ${key}`),
        max = maxes.get(key);
      if (max > 0 && value > max + 1e-8) throw Error(`Linha ${line}: ${key} excede o maximo ${fmt(max)}.`);
      planned.set(row.id + '|' + key, {id: String(row.id), key, value});
    };
    if (withHeader) {
      if (matrix.length < 2) throw Error('A tabela copiada tem cabecalho, mas nao tem alunos.');
      const keys = headers.map(pasteScoreField);
      if (!keys.some(Boolean))
        throw Error('Nenhuma coluna de nota reconhecida. Copie o modelo Excel com as colunas de questoes.');
      const seen = new Set();
      matrix.slice(1).forEach((cells, i) => {
        const mat = String(cells[idCol] || '')
          .trim()
          .toLowerCase();
        if (!mat && cells.every(v => !String(v).trim())) return;
        const row = existingIds.get(mat);
        if (!row) throw Error(`Linha ${i + 2}: matricula nao encontrada nesta avaliacao (${mat || 'vazia'}).`);
        if (seen.has(mat)) throw Error(`Linha ${i + 2}: matricula duplicada.`);
        seen.add(mat);
        keys.forEach((key, col) => add(row, key, cells[col], i + 2));
      });
    } else if (withRoster) {
      const exportedFields = [
        ...questionKeys,
        'nota_prova',
        'pbl1',
        'pbl2',
        ...osceKeys,
        'osce',
        'q7',
        'q8',
        'q9',
        'trabalho',
        'outros_final',
        'nota_final'
      ];
      const readonly = new Set(['nota_prova', 'osce', 'outros_final', 'nota_final']);
      const seen = new Set();
      matrix.forEach((cells, i) => {
        const mat = String(cells[1] || '')
            .trim()
            .toLowerCase(),
          row = existingIds.get(mat);
        if (!row) throw Error(`Linha ${i + 1}: matricula nao encontrada (${mat || 'vazia'}).`);
        if (seen.has(mat)) throw Error(`Linha ${i + 1}: matricula duplicada.`);
        seen.add(mat);
        cells
          .slice(2)
          .forEach((cell, j) => add(row, readonly.has(exportedFields[j]) ? null : exportedFields[j], cell, i + 1));
      });
    } else {
      matrix.forEach((cells, i) => {
        const tr = tableRows[start + i];
        if (!tr) throw Error(`A colagem ultrapassa a ultima linha da planilha (linha ${i + 1}).`);
        const student = currentRows.find(r => String(r.id) === tr.querySelector('input[data-id]')?.dataset.id);
        if (!student) throw Error(`Aluno da linha ${i + 1} nao encontrado.`);
        cells.forEach((cell, j) => {
          const targetCol = firstCol + j;
          if (targetCol >= editableByIndex.length && String(cell).trim())
            throw Error(`Linha ${i + 1}: a colagem ultrapassa a ultima coluna.`);
          add(student, editableByIndex[targetCol], cell, i + 1);
        });
      });
    }
    const changes = [...planned.values()];
    if (!changes.length) throw Error('Nenhuma nota foi encontrada. Confira o intervalo copiado.');
    const aid = currentAssessment.id,
      rev = currentAssessment.revision;
    modal({
      title: 'Conferir colagem do Excel',
      body: `<p><b>${changes.length} notas</b> de <b>${new Set(changes.map(c => c.id)).size} aluno(s)</b> serao inseridas somente na tela da avaliacao <b>${esc(currentAssessment.type)}</b>.</p><p>Celulas vazias e colunas de totais nao substituem notas anteriores. Nenhum dado foi salvo ou publicado.</p><p class="muted">Revise os valores depois de colar; use <b>Salvar rascunho</b> somente quando estiver tudo correto.</p>`,
      button: 'Aplicar notas na tela',
      onSubmit: async () => applyExcelPaste(changes, aid, rev)
    });
  } catch (err) {
    toast(err.message, 9000);
  }
});
// Prévia dos totais enquanto o professor digita. A nota que vale é a calculada pelo servidor
// (calcScore, em core/domain.js) ao salvar. A prévia faz a mesma conta: cada nota entra com duas
// casas decimais, como o servidor grava, e o total é arredondado do mesmo jeito.
// tests/integration/calculo_tela.test.js compara as duas contas.
function recalcLocal(r) {
  const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const sum = keys =>
    keys.some(k => present(r[k])) ? round(keys.reduce((s, k) => s + round(Number(r[k] || 0)), 0)) : null;
  r.nota_prova = sum(questionKeys);
  if (osceKeys.some(k => present(r[k]))) r.osce = sum(osceKeys);
  r.nota_final = sum([...questionKeys, 'pbl1', 'pbl2', 'osce', 'q7', 'q8', 'q9', 'trabalho', 'outros_final']);
}
function updateDraftState() {
  const e = $('#draftState');
  e.textContent = !currentAssessment
    ? 'Selecione uma avalia\u00e7\u00e3o'
    : dirty
      ? 'Altera\u00e7\u00f5es n\u00e3o salvas'
      : currentAssessment.locked
        ? 'Avalia\u00e7\u00e3o encerrada'
        : currentAssessment.revision > currentAssessment.published_revision
          ? 'Rascunho salvo \u00b7 aguarda publica\u00e7\u00e3o'
          : 'Somente Publicar libera resultados ao aluno';
  e.classList.toggle('unsaved', dirty);
}
function updateLocked() {
  const locked = !currentAssessment || !!currentAssessment.locked;
  $('#lockBanner').classList.toggle('hidden', !currentAssessment?.locked);
  for (const id of ['saveBtn', 'publishBtn', 'sendAllBtn', 'importFile']) $('#' + id).disabled = locked || busy;
  $('#exportBtn').disabled = !currentAssessment || busy;
  $('#modeloBtn').disabled = !currentAssessment || busy;
  updateDraftState();
}
async function persistDraft() {
  if (!currentAssessment) throw Error('Selecione uma avalia\u00e7\u00e3o.');
  const d = await api(`/api/assessment/${currentAssessment.id}/scores`, {
    method: 'PUT',
    body: JSON.stringify({revision: currentAssessment.revision, rows: currentRows})
  });
  currentAssessment.revision = d.revision;
  dirty = false;
  updateDraftState();
}
async function runAction(fn) {
  if (busy || !currentAssessment) return;
  busy = true;
  updateLocked();
  try {
    await fn();
  } catch (e) {
    toast(e.message, 7000);
  } finally {
    busy = false;
    updateLocked();
  }
}
$('#saveBtn').onclick = () =>
  runAction(async () => {
    await persistDraft();
    await loadAssessment();
    toast('Rascunho salvo. O aluno ainda n\u00e3o recebe estas altera\u00e7\u00f5es.');
  });
$('#publishBtn').onclick = () =>
  runAction(async () => {
    if (!confirm('Salvar e publicar os resultados para os alunos? Quest\u00f5es utilizadas ser\u00e3o validadas.'))
      return;
    if (dirty) await persistDraft();
    const d = await api(`/api/assessment/${currentAssessment.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({revision: currentAssessment.revision})
    });
    await loadAssessment();
    toast(
      d.updated
        ? 'Resultados publicados. Os alunos j\u00e1 podem consultar.'
        : 'Nenhuma altera\u00e7\u00e3o nova para publicar.'
    );
  });
$('#exportBtn').onclick = () => {
  if (currentAssessment) location.href = `/api/assessment/${currentAssessment.id}/export`;
};
$('#modeloBtn').onclick = () => {
  if (currentAssessment) location.href = `/api/assessment/${currentAssessment.id}/export?modelo=1`;
};
$('#sendAllBtn').onclick = () =>
  runAction(async () => {
    if (dirty) throw Error('Salve e publique as altera\u00e7\u00f5es antes de encerrar.');
    if (!confirm('Encerrar edi\u00e7\u00e3o desta avalia\u00e7\u00e3o? O administrador pode reabrir.')) return;
    await api(`/api/assessment/${currentAssessment.id}/send-all`, {
      method: 'POST',
      body: JSON.stringify({revision: currentAssessment.revision})
    });
    await loadAssessment();
    toast('Avalia\u00e7\u00e3o encerrada para edi\u00e7\u00e3o.');
  });
$('#sendOneBtn').onclick = () => setTab('individual');
$('#sendSelectedBtn').onclick = () =>
  toast('Publicar j\u00e1 libera o resultado. N\u00e3o h\u00e1 um segundo envio obrigat\u00f3rio.');
$('#importFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file || !currentAssessment) return;
  e.target.value = '';
  if (dirty) return toast('Salve ou descarte as alteracoes anteriores antes de importar.');
  if (!/\.xlsx$/i.test(file.name)) return toast('Selecione um arquivo Excel .xlsx.');
  const aid = currentAssessment.id,
    revision = currentAssessment.revision;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const d = await api(`/api/assessment/${aid}/import`, {method: 'POST', body: fd});
    modal({
      title: 'Conferir importacao de notas',
      body: `<p><b>${d.updated} aluno(s)</b> com notas preenchidas. Nenhuma nota foi alterada no banco.</p>
  <div class="admin-scroll"><table class="detail-table"><thead><tr><th>Aluno</th><th>Matricula</th><th>Nota da prova</th><th>Nota final</th></tr></thead>
  <tbody>${d.sample.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.matricula)}</td><td>${fmt(r.nota_prova)}</td><td>${fmt(r.nota_final)}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted">Previa de ate 8 linhas. Campos vazios no Excel preservam notas atuais. Depois de aplicar, revise a planilha e clique em <b>Salvar rascunho</b>. A publicacao continua separada.</p>`,
      button: 'Colocar notas na planilha',
      onSubmit: async () => {
        if (currentAssessment?.id !== aid || currentAssessment.revision !== revision || dirty)
          throw Error('A avaliacao mudou. Importe novamente.');
        const byId = new Map(currentRows.map(r => [Number(r.id), r]));
        for (const change of d.changes) {
          const row = byId.get(Number(change.id));
          if (!row || row.matricula !== change.matricula) throw Error('A lista de alunos mudou. Importe novamente.');
        }
        for (const change of d.changes) {
          const row = byId.get(Number(change.id));
          Object.assign(row, change.values);
          recalcLocal(row);
        }
        dirty = true;
        renderTable();
        updateDraftState();
        toast('Notas inseridas na planilha. Revise e clique em Salvar rascunho.');
      }
    });
  } catch (err) {
    toast(err.message, 8000);
  }
};
function setTab(name) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  for (const n of ['launch', 'results', 'individual']) $('#' + n + 'Tab').classList.toggle('hidden', n !== name);
  if (name === 'results') renderStats();
  if (name === 'individual') renderIndividual();
}
$$('.tab').forEach(b => (b.onclick = () => setTab(b.dataset.tab)));
async function loadStats() {
  if (!currentAssessment) return;
  const id = currentAssessment.id,
    d = await api(`/api/assessment/${id}/stats`);
  if (currentAssessment?.id === id) currentStats = d;
}
window.addEventListener('beforeunload', e => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
function median(arr) {
  if (!arr.length) return null;
  const x = [...arr].sort((a, b) => a - b),
    m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}
// Aba Resultados do professor: a tela base e, em seguida, os complementos registrados.
function renderStats() {
  drawStats();
  window.SupremaHooks.run('teacher.results');
}
function drawStats() {
  if (!currentStats) return;
  const s = currentStats,
    rows = s.rows || [],
    finals = rows.filter(r => present(r.nota_final)).map(r => Number(r.nota_final));
  const high = finals.length ? Math.max(...finals) : null,
    low = finals.length ? Math.min(...finals) : null,
    med = median(finals);
  $('#resultCards').innerHTML = [
    ['Alunos com nota', s.count, 'neutral', 'Registros considerados'],
    ['Média da prova', fmt(s.avgProva), 'blue', `de ${fmt(s.provaMax || 0)}`],
    ['Média final', fmt(s.avgFinal), 'green', 'resultado consolidado'],
    ['Questões utilizadas', (s.questionStats || []).filter(q => q.used).length, 'neutral', 'na publicação'],
    ['Mediana final', fmt(med), 'purple', 'ponto central da turma'],
    ['Maior nota', fmt(high), 'good', 'melhor resultado final'],
    ['Menor nota', fmt(low), 'bad', 'menor resultado final'],
    ['Desvio-padrão', fmt(s.stdFinal), 'orange', 'dispersão das notas']
  ]
    .map(
      ([a, b, c, d]) => `<div class="card metric-card ${c}"><small>${a}</small><strong>${b}</strong><em>${d}</em></div>`
    )
    .join('');
  renderDistribution();
  renderComponents();
  const pctAbove = s.count ? Math.round((s.above / s.count) * 100) : 0,
    pctBelow = s.count ? Math.round((s.below / s.count) * 100) : 0,
    range = high - low;
  const usable = (s.questionStats || []).filter(q => q.used && q.max_value);
  const ranked = usable.map(q => ({...q, pct: q.max_value ? (Number(q.mean || 0) / Number(q.max_value)) * 100 : 0}));
  const best = ranked.length ? [...ranked].sort((a, b) => b.pct - a.pct)[0] : null,
    hard = ranked.length ? [...ranked].sort((a, b) => a.pct - b.pct)[0] : null;
  $('#classInsights').innerHTML =
    `<div class="insight-row"><span>Acima da média final</span><b>${s.above} alunos</b><i style="--w:${pctAbove}%"></i><small>${pctAbove}% da turma</small></div><div class="insight-row below"><span>Abaixo da média final</span><b>${s.below} alunos</b><i style="--w:${pctBelow}%"></i><small>${pctBelow}% da turma</small></div><div class="insight-stat"><span>Melhor aproveitamento</span><strong>${best ? Math.round(best.pct) + '%' : '—'}</strong><small>${best ? best.label : ''}</small></div><div class="insight-stat attention"><span>Maior dificuldade</span><strong>${hard ? Math.round(hard.pct) + '%' : '—'}</strong><small>${hard ? hard.label : ''}</small></div><div class="insight-stat"><span>Amplitude das notas finais</span><strong>${fmt(range)}</strong></div><div class="insight-stat"><span>DP da prova</span><strong>${fmt(s.stdProva)}</strong></div>`;
  renderQuestionAnalysis();
  renderRanking();
}
function renderDistribution() {
  if (!currentStats) return;
  const mode = $('#distributionMetric')?.value || 'final';
  const vals = (currentStats.rows || [])
    .map(r => (mode === 'prova' ? r.nota_prova : r.nota_final))
    .filter(present)
    .map(Number);
  const maxScore = mode === 'prova' ? Math.max(1, Number(currentStats.provaMax || 0), ...vals) : Math.max(1, ...vals),
    step = maxScore / 5,
    bins = [0, 0, 0, 0, 0];
  vals.forEach(v => {
    let idx = Math.floor(v / step);
    if (idx >= 5) idx = 4;
    if (idx < 0) idx = 0;
    bins[idx]++;
  });
  const labs = Array.from({length: 5}, (_, i) => `${fmt(i * step, 1)}–${fmt((i + 1) * step, 1)}`);
  $('#distributionTitle').textContent =
    mode === 'prova' ? 'Distribuição da Nota da Prova' : 'Distribuição da Nota Final';
  renderHist(bins, labs);
}
function renderHist(bins, labs) {
  const max = Math.max(1, ...bins);
  $('#histChart').innerHTML = bins
    .map(
      (v, i) =>
        `<div class="bar-item"><b>${v}</b><div class="bar bar-${i}" style="height:${Math.max(4, (v / max) * 190)}px"></div><span>${labs[i]}</span></div>`
    )
    .join('');
}
// Média de cada instrumento em relação ao valor máximo declarado. Sem máximo não há percentual nem barra.
function renderComponents() {
  const s = currentStats || {},
    byKey = new Map((s.instrumentStats || []).map(i => [i.field_key, i]));
  const item = (label, k) => {
    const i = byKey.get(k);
    return i && i.used ? [label, i.mean, i.max_value] : null;
  };
  const rows = [
    present(s.avgProva) ? ['Avaliação teórica (prova)', s.avgProva, s.provaMax > 0 ? s.provaMax : null] : null,
    item(reportH('pbl1'), 'pbl1'),
    item(reportH('pbl2'), 'pbl2'),
    item('OSCE (total)', 'osce'),
    ...osceKeys.map((k, i) => item('OSCE — Estação ' + (i + 1), k)),
    item(reportH('q7'), 'q7'),
    item(reportH('q8'), 'q8'),
    item(reportH('q9'), 'q9'),
    item(reportH('trabalho'), 'trabalho')
  ].filter(Boolean);
  $('#componentChart').innerHTML = rows.length
    ? rows
        .map(([label, mean, max]) => {
          const pct = max > 0 && present(mean) ? Math.min(100, (Number(mean) / Number(max)) * 100) : null;
          return `<div class="h-row instrument-row"><span>${esc(label)}</span><div class="h-track">${pct === null ? '' : `<div class="h-fill" style="width:${pct}%"></div><i class="h-mark60" aria-hidden="true"></i>`}</div><b>${fmt(mean)}${max > 0 ? ` <small>de ${fmt(max)}</small>` : ''}</b><em>${pct === null ? 'Sem valor máximo declarado: defina-o no cabeçalho da planilha para comparar' : Math.round(pct) + '% do valor máximo'}</em></div>`;
        })
        .join('')
    : '<div class="empty-inline">Sem instrumentos publicados.</div>';
}
// Destaque da nota abaixo da média da turma, sobre o que está na tela (rascunho).
// É estatística descritiva da coluna, não critério de aprovação; a marca "↓" não depende de cor.
function markBelowAverage() {
  const tb = $('#scoresTable tbody');
  for (const [cls, key] of [
    ['note-cell', 'nota_prova'],
    ['final-cell', 'nota_final']
  ]) {
    const vals = currentRows.filter(r => present(r[key])).map(r => Number(r[key])),
      mean = vals.length > 1 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    tb.querySelectorAll('td.' + cls).forEach((td, i) => {
      const r = currentRows[i],
        below = mean !== null && !!r && present(r[key]) && Number(r[key]) < mean - 1e-9;
      td.classList.toggle('below-average', below);
      if (below) {
        td.title = `Abaixo da média da turma nesta coluna (${fmt(mean)})`;
        td.setAttribute('aria-label', `${fmt(r[key])}, abaixo da média da turma`);
      } else {
        td.removeAttribute('title');
        td.removeAttribute('aria-label');
      }
    });
  }
}
function renderQuestionAnalysis() {
  const qs = (currentStats.questionStats || []).filter(q => q.used);
  $('#questionAnalysis').innerHTML = qs.length
    ? qs
        .map(q => {
          const max = Number(q.max_value || 0),
            m = Number(q.mean || 0),
            cut = max * 0.6,
            pct = max ? (m / max) * 100 : 0,
            ok = max && m >= cut;
          return `<div class="question-card ${ok ? 'ok' : 'below'}"><div><strong>${esc(q.label)}</strong><small>${esc(q.area || 'Área não informada')}</small></div><b>${fmt(m)} <small>de ${max ? fmt(max, 1) : '—'}</small></b><div class="question-ruler"><i style="width:${Math.min(100, pct)}%"></i><span style="left:60%">60%</span></div><em>${max ? (ok ? 'Acima ou igual a 60%' : 'Abaixo de 60%') : 'Valor não definido'}</em></div>`;
        })
        .join('')
    : '<div class="empty-inline">Publique notas para visualizar a média por questão.</div>';
}
function renderRanking() {
  const rows = [...(currentStats?.rows || [])].sort((a, b) => Number(b.nota_final || 0) - Number(a.nota_final || 0));
  $('#rankingTable').innerHTML = rows.length
    ? `<div class="ranking-wrap"><table class="detail-table ranking-table"><thead><tr><th>#</th><th>Matrícula</th><th>Nome do aluno</th><th>Nota da Prova</th><th>Nota Final</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}º</td><td>${esc(r.matricula)}</td><td>${esc(r.name)}</td><td>${fmt(r.nota_prova)}</td><td><b>${fmt(r.nota_final)}</b></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-inline">Sem resultados publicados.</div>';
}
$('#distributionMetric')?.addEventListener('change', renderDistribution);

function fillStudentSelect() {
  const s = $('#studentSelect');
  s.innerHTML = currentRows.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  s.onchange = renderIndividual;
}
function meanKey(k) {
  return currentStats?.meansByKey && currentStats.meansByKey[k] !== null && currentStats.meansByKey[k] !== undefined
    ? currentStats.meansByKey[k]
    : null;
}
function rowHtml(label, max, key, value, klass = '') {
  const m = meanKey(key),
    d = value === null || value === undefined || m === null ? null : Number(value) - Number(m);
  return `<tr class="${klass}"><td>${esc(label)}</td><td>${max === null ? '—' : fmt(max, 1)}</td><td><b>${present(value) ? fmt(value) : '—'}</b></td><td>${m === null ? '—' : fmt(m)}</td><td class="${d === null ? '' : d >= 0 ? 'positive' : 'negative'}">${d === null ? '—' : `${d >= 0 ? '+' : ''}${fmt(d)}`}</td></tr>`;
}
// Aba Individual do professor: a tela base e, em seguida, os complementos registrados.
function renderIndividual() {
  drawIndividual();
  window.SupremaHooks.run('teacher.individual');
}
function drawIndividual() {
  if (!currentStats || !currentRows.length) return;
  const chosen = Number($('#studentSelect').value || currentRows[0].id);
  if (!(currentStats.rows || []).some(r => Number(r.id) === chosen)) {
    $('#studentSummary').innerHTML =
      '<div class="empty-inline">Resultado ainda não publicado. Rascunhos aparecem somente em Lançamento.</div>';
    for (const id of ['individualCards', 'comparisonChart', 'individualComponentChart', 'individualTable'])
      $('#' + id).innerHTML = '';
    return;
  }
  const selectedId = Number($('#studentSelect').value || currentRows[0].id),
    draft = currentRows.find(x => x.id === selectedId) || currentRows[0],
    r = (currentStats.rows || []).find(x => Number(x.id) === Number(draft.id)),
    s = currentStats,
    rows = s.rows || [],
    sorted = [...rows].sort((a, b) => Number(b.nota_final || 0) - Number(a.nota_final || 0)),
    rank = 1 + sorted.filter(x => Number(x.nota_final) > Number(r.nota_final)).length,
    diff = Number(r.nota_final || 0) - Number(s.avgFinal || 0);
  $('#studentSummary').innerHTML = `<div><span class="avatar-mini">${esc(
    r.name
      .split(' ')
      .slice(0, 2)
      .map(x => x[0])
      .join('')
  )}</span><div><strong>${esc(r.name)}</strong><small>Matrícula ${esc(r.matricula)} · ${esc(currentAssessment.discipline)} · ${esc(currentAssessment.period)}</small></div></div><span class="result-status ${r.sent ? 'sent' : ''}">${r.sent ? 'Resultado publicado' : 'Resultado não publicado'}</span>`;
  $('#individualCards').innerHTML = [
    ['Nota da prova', fmt(r.nota_prova), 'blue', `de ${fmt(s.provaMax || 0)}`],
    ['Nota final', fmt(r.nota_final), 'green', 'resultado consolidado'],
    ['Média da turma', fmt(s.avgFinal), 'purple', 'nota final'],
    [
      'Diferença da média',
      `${diff >= 0 ? '+' : ''}${fmt(diff)}`,
      diff >= 0 ? 'good' : 'bad',
      diff === 0 ? 'na média' : diff > 0 ? 'acima da média' : 'abaixo da média'
    ],
    ['Posição na turma', `${rank}º`, 'orange', `de ${s.count} alunos`]
  ]
    .map(
      ([a, b, c, d]) => `<div class="card metric-card ${c}"><small>${a}</small><strong>${b}</strong><em>${d}</em></div>`
    )
    .join('');
  const comparison = [
    ['Nota da Prova', r.nota_prova, s.avgProva, Math.max(1, Number(s.provaMax || 0), Number(r.nota_prova || 0))],
    ['Nota Final', r.nota_final, s.avgFinal, Math.max(1, ...rows.map(v => Number(v.nota_final || 0)))]
  ];
  $('#comparisonChart').innerHTML = comparison
    .map(
      ([lab, you, cls, max]) =>
        `<div class="compare-group"><div class="compare-bars"><div class="compare-col you" style="height:${present(you) ? Math.max(4, (you / max) * 165) : 0}px"><span>${fmt(you, 1)}</span></div><div class="compare-col class" style="height:${present(cls) ? Math.max(4, (cls / max) * 165) : 0}px"><span>${fmt(cls, 1)}</span></div></div><div class="compare-label">${esc(lab)}<br><small><i class="legend-you"></i>Aluno <i class="legend-class"></i>Turma</small></div></div>`
    )
    .join('');
  const usedQs = (s.questionStats || []).filter(q => q.used);
  $('#individualComponentChart').innerHTML = usedQs.length
    ? usedQs
        .map(q => {
          const you = present(r[q.field_key]) ? Number(r[q.field_key]) : null,
            cls = present(q.mean) ? Number(q.mean) : null,
            max = q.max_value > 0 ? Number(q.max_value) : null;
          return `<div class="component-row"><div class="component-label"><span>${esc(q.label)}${q.area ? ` · ${esc(q.area)}` : ''}</span><b>${fmt(you)} / ${fmt(max, 1)}</b></div><div class="component-bars-line"><i class="student-line" style="width:${Math.min(100, max && present(you) ? (you / max) * 100 : 0)}%"></i><i class="class-line" style="width:${Math.min(100, max && present(cls) ? (cls / max) * 100 : 0)}%"></i><span class="cut60"></span></div><small>Turma ${fmt(cls)} · Referência visual 60%: ${fmt(max === null ? null : max * 0.6)}</small></div>`;
        })
        .join('')
    : '<div class="empty-inline">Sem questões publicadas.</div>';
  let detailRows = '';
  for (const q of usedQs) {
    detailRows += rowHtml(`${q.label}${q.area ? ` — ${q.area}` : ''}`, q.max_value, q.field_key, r[q.field_key]);
  }
  detailRows += `<tr class="total-row"><td>${esc(reportH('nota_prova'))}</td><td>${fmt(s.provaMax || 0, 1)}</td><td><b>${fmt(r.nota_prova)}</b></td><td>${fmt(s.avgProva)}</td><td class="${Number(r.nota_prova) >= Number(s.avgProva) ? 'positive' : 'negative'}">${present(r.nota_prova) && present(s.avgProva) ? (Number(r.nota_prova) >= Number(s.avgProva) ? '+' : '') + fmt(Number(r.nota_prova) - Number(s.avgProva)) : '\u2014'}</td></tr>`;
  let extraRows = '';
  for (const [k, max] of [
    ['pbl1', null],
    ['pbl2', null],
    ['q7', null],
    ['q8', null],
    ['q9', null],
    ['trabalho', null]
  ])
    if (present(r[k]) || meanKey(k) !== null) extraRows += rowHtml(reportH(k), max, k, r[k], 'extra-row');
  const stationRows = osceKeys
    .filter(k => present(r[k]) || meanKey(k) !== null)
    .map((k, i) => rowHtml(`OSCE — Estação ${osceKeys.indexOf(k) + 1}`, null, k, r[k], 'extra-row'))
    .join('');
  if (stationRows || present(r.osce) || meanKey('osce') !== null)
    extraRows += stationRows + rowHtml('Total OSCE', null, 'osce', r.osce, 'extra-row');
  const finalDiff = Number(r.nota_final || 0) - Number(s.avgFinal || 0);
  extraRows += `<tr class="total-row final-total"><td>${esc(reportH('nota_final'))}</td><td>—</td><td><b>${fmt(r.nota_final)}</b></td><td>${fmt(s.avgFinal)}</td><td class="${finalDiff >= 0 ? 'positive' : 'negative'}">${finalDiff >= 0 ? '+' : ''}${fmt(finalDiff)}</td></tr>`;
  $('#individualTable').innerHTML =
    `<table class="detail-table"><thead><tr><th>Componente</th><th>Máx.</th><th>Aluno</th><th>Média turma</th><th>Diferença</th></tr></thead><tbody><tr class="section-row"><td colspan="5">Avaliação Teórico-Cognitiva</td></tr>${detailRows}<tr class="section-row"><td colspan="5">Demais instrumentos utilizados</td></tr>${extraRows}</tbody></table>`;
}

let studentAssessments = [],
  studentCurrent = null,
  studentResult = null;
async function bootStudent() {
  window.SupremaHooks.run('student.boot'); // os complementos descartam o que guardaram
  try {
    studentAssessments = await api('/api/student/assessments');
    const switcher = $('#studentAssessmentSwitch');
    switcher.innerHTML = studentAssessments
      .map(
        a =>
          `<button type="button" data-id="${a.id}"><strong>${esc(a.type)} \u00b7 ${esc(a.discipline)}</strong><small>${a.year}.${esc(academicNumber(a.semester))} \u00b7 ${esc(academicNumber(a.period))}\u00ba per\u00edodo${a.class_name ? ' \u00b7 ' + esc(a.class_name) : ''}</small></button>`
      )
      .join('');
    switcher.querySelectorAll('button').forEach(b => (b.onclick = () => loadStudentAssessment(Number(b.dataset.id))));
    const selected = studentAssessments.find(a => a.id === studentCurrent?.id) || studentAssessments[0];
    if (selected) await loadStudentAssessment(selected.id);
    else {
      $('#studentContext').textContent = 'Minhas notas';
      $('#studentResultBody').innerHTML =
        '<div class="student-empty"><div class="student-empty-icon">\u25f7</div><h2>Seus resultados aparecer\u00e3o aqui</h2><p>Ainda n\u00e3o h\u00e1 resultados publicados. Os rascunhos do professor permanecem privados.</p></div>';
    }
  } catch (e) {
    toast(e.message);
  }
}
async function loadStudentAssessment(id) {
  studentCurrent = studentAssessments.find(a => Number(a.id) === id);
  $$('#studentAssessmentSwitch button').forEach(b => b.classList.toggle('active', Number(b.dataset.id) === id));
  try {
    const d = await api('/api/student/assessment/' + id);
    if (studentCurrent?.id !== id) return;
    studentResult = d;
    renderStudentResult();
  } catch (e) {
    $('#studentResultBody').innerHTML = `<div class="student-empty">${esc(e.message)}</div>`;
  }
}
$('#refreshStudentBtn').onclick = bootStudent;
// Rótulos do painel do aluno pedidos na reunião de 06/11: "Avaliação" no lugar de "Prova" e
// "Minha nota" no lugar de "Nota final". As chaves e os cabeçalhos publicados não mudam.
function studentH(k) {
  if (k === 'nota_final') return 'Minha nota';
  const label = (studentResult?.headers && studentResult.headers[k]) || defaultHeaders[k] || k;
  return k === 'nota_prova' && label === defaultHeaders.nota_prova ? 'Nota da Avaliação' : label;
}
// Resultado do aluno: a tela base e, em seguida, os complementos registrados.
function renderStudentResult() {
  drawStudentResult();
  window.SupremaHooks.run('student.result');
}
function drawStudentResult() {
  const d = studentResult,
    a = d.assessment;
  $('#studentContext').textContent = `${a.type} · ${a.discipline} · ${a.period} · ${a.semester} / ${a.year}`;
  if (!d.available) {
    $('#studentResultBody').innerHTML =
      `<div class="student-empty"><div class="student-empty-icon">◷</div><h2>Resultado ainda não liberado</h2><p>${esc(d.message || 'Aguarde a publicação do professor.')}</p></div>`;
    return;
  }
  const r = d.row,
    s = d.stats || {},
    qs = (d.questionStats || []).filter(q => q.used);
  // Em turma pequena a API não envia números da turma: nenhuma comparação é desenhada.
  const withClass = d.classFigures?.available !== false,
    minimum = d.classFigures?.minimum || 0;
  const mean = k =>
    withClass && s.meansByKey && s.meansByKey[k] !== null && s.meansByKey[k] !== undefined
      ? Number(s.meansByKey[k])
      : null;
  const classValue = v => (withClass && present(v) ? Number(v) : null);
  const delta = (v, m) => (!present(v) || m === null ? null : Number(v) - m);
  const deltaCell = dv =>
    `<td class="${dv === null ? '' : dv >= 0 ? 'positive' : 'negative'}">${dv === null ? '—' : `${dv >= 0 ? '+' : ''}${fmt(dv)}`}</td>`;
  const instrumentMax = k => {
    const i = (s.instrumentStats || []).find(x => x.field_key === k);
    return i && i.max_value > 0 ? Number(i.max_value) : null;
  };
  const line = (label, k, max = null) => {
    const m = mean(k),
      v = r[k];
    return `<tr><td>${esc(label)}</td><td><b>${present(v) ? fmt(v) : '—'}</b>${max === null ? '' : ` <small>de ${fmt(max)}</small>`}</td><td>${m === null ? '—' : fmt(m)}</td>${deltaCell(delta(v, m))}</tr>`;
  };
  const compRows = qs.map(q => line(`${q.label}${q.area ? ` — ${q.area}` : ''}`, q.field_key)).join('');
  let extras = ['pbl1', 'pbl2', 'q7', 'q8', 'q9', 'trabalho']
    .filter(k => present(r[k]) || mean(k) !== null)
    .map(k => line(studentH(k), k, instrumentMax(k)))
    .join('');
  osceKeys.forEach((k, i) => {
    if (present(r[k]) || mean(k) !== null) extras += line(`OSCE — Estação ${i + 1}`, k, instrumentMax(k));
  });
  if (present(r.osce) || mean('osce') !== null) extras += line('Total OSCE', 'osce', instrumentMax('osce'));
  const perf = qs
    .map(q => {
      const v = present(r[q.field_key]) ? Number(r[q.field_key]) : null,
        m = mean(q.field_key),
        mx = q.max_value > 0 ? Number(q.max_value) : null;
      return `<div class="student-comp-row"><div><span>${esc(q.label)}${q.area ? ` · ${esc(q.area)}` : ''}</span><b>${fmt(v)} / ${fmt(mx, 1)}</b></div><div class="student-comp-track"><i class="student-own" style="width:${Math.min(100, mx && present(v) ? (v / mx) * 100 : 0)}%"></i>${withClass ? `<i class="student-class" style="width:${Math.min(100, mx && present(m) ? (m / mx) * 100 : 0)}%"></i>` : ''}<span class="cut60"></span></div><small>${withClass ? `Média da turma ${fmt(m)} · ` : ''}Referência visual 60%: ${fmt(mx === null ? null : mx * 0.6)}</small></div>`;
    })
    .join('');
  // Do total para as partes: primeiro "Minha nota", depois a nota da avaliação e as comparações.
  const avgFinal = classValue(s.avgFinal),
    avgProva = classValue(s.avgProva),
    diff = delta(r.nota_final, avgFinal),
    diffProva = delta(r.nota_prova, avgProva);
  const cards = [
    `<div class="card metric-card green"><small>Minha nota</small><strong>${fmt(r.nota_final)}</strong><em>resultado publicado</em></div>`,
    `<div class="card metric-card blue"><small>Nota da avaliação</small><strong>${fmt(r.nota_prova)}</strong><em>resultado publicado</em></div>`
  ];
  if (withClass)
    cards.push(
      `<div class="card metric-card purple"><small>Média da turma</small><strong>${fmt(avgFinal)}</strong><em>minha nota</em></div>`,
      `<div class="card metric-card ${diff === null || diff >= 0 ? 'good' : 'bad'}"><small>Diferença da média</small><strong>${diff === null ? '—' : `${diff >= 0 ? '+' : ''}${fmt(diff)}`}</strong><em>${diff === null ? 'sem comparação' : diff === 0 ? 'na média' : diff > 0 ? 'acima da média' : 'abaixo da média'}</em></div>`,
      `<div class="card metric-card orange"><small>Posição na turma</small><strong>${s.rank || '—'}º</strong><em>de ${s.count || 0} alunos</em></div>`
    );
  else
    cards.push(
      `<div class="card metric-card neutral"><small>Comparação com a turma</small><strong>—</strong><em>exibida a partir de ${minimum} resultados publicados na turma</em></div>`
    );
  const compare = (label, own, cls) =>
    `<div><span>${label}</span><b>${fmt(own)}</b>${withClass ? `<small>Turma ${fmt(cls)}</small>` : ''}</div>`;
  $('#studentResultBody').innerHTML =
    `<div class="student-hero"><div><span class="eyebrow">Resultado individual</span><h1>${esc(r.name)}</h1><p>Matrícula ${esc(r.matricula)}</p></div><button id="studentPrintBtn" class="btn primary">Exportar PDF / Imprimir</button></div><div class="cards student-metrics">${cards.join('')}</div><div class="student-grid"><div class="panel"><div class="panel-title"><div><h3>Aluno/turma</h3><p>${withClass ? 'Comparação das notas principais' : 'Suas notas principais. A comparação com a turma aparece quando houver resultados suficientes.'}</p></div></div><div class="student-compare-simple">${compare('Minha nota', r.nota_final, avgFinal)}${compare('Nota da Avaliação', r.nota_prova, avgProva)}</div></div><div class="panel"><div class="panel-title"><div><h3>Desempenho por questão</h3><p>${withClass ? 'Seu resultado, turma e régua de 60%' : 'Seu resultado e régua de 60%'}</p></div></div><div class="student-component-list">${perf || '<div class="empty-inline">Sem questões publicadas.</div>'}</div></div><div class="panel panel-wide"><div class="panel-title"><div><h3>Detalhamento da avaliação</h3><p>Somente instrumentos utilizados nesta avaliação</p></div></div><div class="student-detail-wrap"><table class="detail-table"><thead><tr><th>Componente</th><th>Sua nota</th><th>Média turma</th><th>Diferença</th></tr></thead><tbody><tr class="section-row"><td colspan="4">Avaliação Teórico-Cognitiva</td></tr>${compRows}<tr class="total-row"><td>${esc(studentH('nota_prova'))}</td><td><b>${fmt(r.nota_prova)}</b></td><td>${avgProva === null ? '—' : fmt(avgProva)}</td>${deltaCell(diffProva)}</tr><tr class="section-row"><td colspan="4">Demais instrumentos utilizados</td></tr>${extras}<tr class="total-row final-total"><td>${esc(studentH('nota_final'))}</td><td><b>${fmt(r.nota_final)}</b></td><td>${avgFinal === null ? '—' : fmt(avgFinal)}</td>${deltaCell(diff)}</tr></tbody></table></div></div></div>`;
  $('#studentPrintBtn').onclick = () => window.print();
}

// Itens da barra lateral do professor para módulos fora da A1/A2/A3. Um módulo pronto
// registra-se em window.SupremaViews[nome] e desenha em #moduleView; sem registro, o item
// continua mostrando o aviso "em desenvolvimento".
// Itens de módulos no menu do administrador: desenham em #adminModuleView; qualquer outro item
// do menu devolve a tela original, que continua sendo cuidada por features/administracao.
function mountAdminModules() {
  const nav = $('#adminNav'),
    view = $('#adminModuleView');
  nav.querySelectorAll('[data-admin-module]').forEach(b => b.remove());
  view.classList.add('hidden');
  $('#adminContent').classList.remove('hidden');
  for (const item of window.SupremaModules.of('ADMIN')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-item';
    b.dataset.adminModule = '1';
    b.innerHTML = `${esc(item.glyph || '\u25a2')} <span>${esc(item.label)}</span>`;
    b.onclick = e => {
      e.stopPropagation();
      nav.querySelectorAll('button').forEach(n => n.classList.toggle('active', n === b));
      $('#adminContent').classList.add('hidden');
      $('#adminEvolutionContent').classList.add('hidden');
      view.classList.remove('hidden');
      item.start(view);
    };
    nav.append(b);
  }
}
$('#adminNav').addEventListener(
  'click',
  e => {
    if (e.target.closest('button') && !e.target.closest('[data-admin-module]')) {
      $('#adminModuleView').classList.add('hidden');
      $('#adminContent').classList.remove('hidden');
      $$('#adminNav [data-admin-module]').forEach(b => b.classList.remove('active'));
    }
  },
  true
);
const markTeacherNav = item =>
  $$('#appScreen .sidebar .nav-item').forEach(n => n.classList.toggle('active', n === item));
$$('.nav-item.dev').forEach(b => {
  const view = window.SupremaViews?.[b.dataset.module];
  if (view) {
    b.querySelector('small')?.remove();
    b.classList.remove('dev');
  }
  b.onclick = () => {
    markTeacherNav(b);
    $('#mainView').classList.add('hidden');
    $('#academicEvolutionView').classList.add('hidden');
    $('#devView').classList.remove('hidden');
    $('#devCard').classList.toggle('hidden', !!view);
    $('#moduleView').classList.toggle('hidden', !view);
    if (view) view.render($('#moduleView'));
    else $('#devTitle').textContent = b.dataset.module;
  };
});
const showA1A2 = () => {
  markTeacherNav($('[data-view="a1a2"]'));
  $('#devView').classList.add('hidden');
  $('#mainView').classList.remove('hidden');
};
$('#backA1A2').onclick = showA1A2;
$$('[data-view="a1a2"]').forEach(b => (b.onclick = showA1A2));
(async () => {
  try {
    const u = await api('/api/me');
    await showUser(u);
  } catch {}
  try {
    const s = await api('/api/setup-status');
    if (s.needsAdmin) $('#setupHint').classList.remove('hidden');
  } catch {}
})();
