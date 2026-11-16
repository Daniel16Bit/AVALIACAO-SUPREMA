'use strict';
// Only synthetic data in a temporary directory. Does not alter the delivered database.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const ROOT = path.resolve(__dirname, '../..');
const {createApplication} = require(path.join(ROOT, 'server'));
const {configureAdmin} = require(path.join(ROOT, 'scripts/admin'));
const results = [];
let runtime,
  server,
  temp,
  base,
  ac,
  serial = 0;
const password = 'Somente-Teste-123!';
async function test(name, fn) {
  try {
    await fn();
    results.push({name, status: 'APROVADO'});
    console.log('OK ' + name);
  } catch (e) {
    results.push({name, status: 'REPROVADO', error: e.message});
    throw e;
  }
}
async function req(url, {method = 'GET', body, cookie = ac, expected = 200, headers = {}} = {}) {
  const r = await fetch(base + url, {
    method,
    headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(cookie ? {Cookie: cookie} : {}), ...headers},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json();
  assert.equal(r.status, expected, url + ' ' + JSON.stringify(data));
  return {data, cookie: r.headers.get('set-cookie')?.split(';')[0]};
}
const post = async (url, body, expected = 201, cookie = ac) =>
  (await req(url, {method: 'POST', body, expected, cookie})).data;
const getUser = id => runtime.db.prepare('SELECT * FROM users WHERE id=?').get(id);
async function create(role = 'ALUNO', override = {}) {
  const n = ++serial,
    body = {
      name: 'Pessoa de Teste ' + n,
      email: 'pessoa-' + n + '@teste.invalid',
      matricula: 'TESTE-' + n,
      password,
      role,
      ...override
    };
  const r = await post('/api/admin/users', body);
  return {...body, ...r};
}
// Contas criadas pelo administrador nascem com senha provisoria. Esta suite verifica outras regras,
// entao o preparo dispensa a troca direto no banco de teste. O primeiro acesso tem suite propria:
// tests/integration/seguranca_login.test.js.
const login = async u => {
  const r = await req('/api/login', {method: 'POST', body: {login: u.email, password}, cookie: null});
  if (r.data.user?.mustChangePassword)
    runtime.db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').run(r.data.user.id);
  return r;
};
const editBody = (u, extra = {}) => ({
  name: u.name,
  email: u.email,
  matricula: u.matricula,
  active: !!u.active,
  role: u.role,
  expected_version: u.session_version,
  confirm_role_change: true,
  ...extra
});
const edit = async (id, extra = {}, expected = 200) =>
  req('/api/admin/users/' + id, {method: 'PUT', body: editBody(getUser(id), extra), expected});
const remove = async (id, extra = {}, expected = 200) => {
  const u = getUser(id);
  return req('/api/admin/users/' + id, {
    method: 'DELETE',
    body: {confirmation_email: u.email, expected_version: u.session_version, ...extra},
    expected
  });
};
async function fixture() {
  const teacher = await create('PROFESSOR'),
    student = await create('ALUNO');
  const c = await post('/api/admin/courses', {name: 'Curso de teste ' + serial});
  const d = await post('/api/admin/disciplines', {course_id: c.id, name: 'Disciplina de teste', period: '2'});
  const t = await post('/api/admin/assignments', {
    professor_id: teacher.id,
    discipline_id: d.id,
    year: 2027,
    semester: '1',
    class_name: ''
  });
  const e = await post('/api/admin/enrollments', {
    student_id: student.student_id,
    discipline_id: d.id,
    year: 2027,
    semester: '1',
    class_name: ''
  });
  const assessment = runtime.db.prepare("SELECT * FROM assessments WHERE assignment_id=? AND type='A2'").get(t.id);
  const score = runtime.db
    .prepare('SELECT * FROM scores WHERE assessment_id=? AND student_id=?')
    .get(assessment.id, student.student_id);
  return {teacher, student, course: c, discipline: d, assignment: t, enrollment: e, assessment, score};
}
function academicSnapshot() {
  const out = {};
  for (const t of [
    'students',
    'scores',
    'published_scores',
    'publication_events',
    'assessment_headers',
    'assessment_question_config'
  ])
    out[t] = runtime.db.prepare('SELECT * FROM ' + t + ' ORDER BY 1').all();
  return JSON.stringify(out);
}
(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-usuarios-'));
  runtime = createApplication({dataDir: temp});
  const admin = configureAdmin(runtime.db, {name: 'Admin Teste', email: 'admin@teste.invalid', password});
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  ac = (await login({email: 'admin@teste.invalid'})).cookie;
  let wrong, oldCookie, hash, otherTeacher, otherStudent;
  await test('Criar aluno e recusar duplicacao de e-mail', async () => {
    wrong = await create('ALUNO');
    oldCookie = (await login(wrong)).cookie;
    hash = getUser(wrong.id).password_hash;
    await post('/api/admin/users', {...wrong, email: wrong.email.toUpperCase(), matricula: 'OUTRA', password}, 409);
  });
  await test('Editar funcao ALUNO para PROFESSOR preserva conta, e-mail e senha', async () => {
    const result = await edit(wrong.id, {role: 'PROFESSOR'});
    assert.equal(result.data.role_changed, true);
    const u = getUser(wrong.id);
    assert.equal(u.role, 'PROFESSOR');
    assert.equal(u.email, wrong.email);
    assert.equal(u.password_hash, hash);
  });
  await test('Sessao antiga do aluno fica invalida depois da conversao', () =>
    req('/api/me', {cookie: oldCookie, expected: 401}));
  await test('Mesmas credenciais abrem perfil PROFESSOR e nao ADMIN', async () => {
    const l = await login(wrong);
    assert.equal(l.data.user.role, 'PROFESSOR');
    await req('/api/assessments', {cookie: l.cookie});
    await req('/api/admin/users', {cookie: l.cookie, expected: 403});
    await req('/api/student/assessments', {cookie: l.cookie, expected: 403});
  });
  await test('Cadastro historico convertido nao aparece na lista de novas matriculas', async () => {
    const list = (await req('/api/admin/students')).data;
    assert.ok(!list.some(s => s.id === wrong.student_id));
  });
  await test('Converter de volta reutiliza o cadastro academico sem duplicar', async () => {
    const sid = getUser(wrong.id).student_id;
    await edit(wrong.id, {role: 'ALUNO'});
    assert.equal(getUser(wrong.id).student_id, sid);
    assert.equal((await login(wrong)).data.user.role, 'ALUNO');
  });
  await test('PROFESSOR sem cadastro de aluno recebe student_id ao mudar para ALUNO', async () => {
    otherTeacher = await create('PROFESSOR');
    const old = (await login(otherTeacher)).cookie;
    assert.equal(getUser(otherTeacher.id).student_id, null);
    await edit(otherTeacher.id, {role: 'ALUNO'});
    assert.ok(getUser(otherTeacher.id).student_id);
    await req('/api/me', {cookie: old, expected: 401});
    otherStudent = await create('ALUNO');
  });
  await test('Edicao de nome, e-mail, matricula e ativo continua funcionando', async () => {
    await edit(otherStudent.id, {
      name: 'Nome corrigido',
      email: 'corrigido@teste.invalid',
      matricula: 'CORRIGIDA',
      active: false
    });
    const u = getUser(otherStudent.id);
    assert.equal(u.active, 0);
    assert.equal(u.name, 'Nome corrigido');
    assert.equal(
      runtime.db.prepare('SELECT matricula FROM students WHERE id=?').get(u.student_id).matricula,
      'CORRIGIDA'
    );
    await edit(otherStudent.id, {active: true});
  });
  await test('Mudanca de perfil exige confirmacao explicita', async () => {
    const old = getUser(wrong.id).role;
    await edit(wrong.id, {role: 'PROFESSOR', confirm_role_change: false}, 400);
    assert.equal(getUser(wrong.id).role, old);
  });
  await test('Mudanca de perfil exige revisao do cadastro', () =>
    edit(wrong.id, {role: 'PROFESSOR', expected_version: undefined}, 400));
  await test('Perfil ADMIN e valores desconhecidos sao recusados', async () => {
    for (const role of ['ADMIN', 'ADMIN_GERAL', 'professor', '', null]) await edit(wrong.id, {role}, 400);
    assert.equal(getUser(wrong.id).role, 'ALUNO');
  });
  await test('Edicao e exclusao da conta administrativa sao recusadas', async () => {
    await edit(admin.id, {role: 'PROFESSOR'}, 403);
    await remove(admin.id, {}, 403);
    await req('/api/admin/users/' + admin.id + '/impact', {expected: 403});
  });
  await test('Outro administrador tambem e protegido', async () => {
    const a = configureAdmin(runtime.db, {name: 'Segundo admin', email: 'segundo-admin@teste.invalid', password});
    await remove(a.id, {}, 403);
    await edit(a.id, {role: 'ALUNO'}, 403);
  });
  await test('E-mail existente permanece unico ao editar', async () => {
    const before = getUser(wrong.id);
    await edit(wrong.id, {email: getUser(otherStudent.id).email}, 409);
    assert.deepEqual(getUser(wrong.id), before);
  });
  await test('Conflito de matricula academica nao transfere historico nem altera a conta', async () => {
    const teacher = await create('PROFESSOR');
    runtime.db
      .prepare('INSERT INTO students(id,name,matricula) VALUES(?,?,?)')
      .run(9000, 'Historico sem login', 'MATRICULA-HISTORICA');
    const before = getUser(teacher.id);
    await edit(teacher.id, {role: 'ALUNO', matricula: 'MATRICULA-HISTORICA'}, 409);
    assert.deepEqual(getUser(teacher.id), before);
  });
  await test('Edicao concorrente e excluida por revisao desatualizada', async () => {
    const v = getUser(wrong.id).session_version;
    await edit(wrong.id, {name: 'Atualizado'});
    await edit(wrong.id, {role: 'PROFESSOR', expected_version: v}, 409);
    await remove(wrong.id, {expected_version: v}, 409);
  });
  await test('Professor e aluno nao podem consultar impacto, converter ou excluir', async () => {
    for (const role of ['PROFESSOR', 'ALUNO']) {
      const u = await create(role),
        cookie = (await login(u)).cookie;
      await req('/api/admin/users/' + wrong.id + '/impact', {cookie, expected: 403});
      await req('/api/admin/users/' + wrong.id, {
        method: 'PUT',
        cookie,
        body: editBody(getUser(wrong.id), {role: 'PROFESSOR'}),
        expected: 403
      });
      await req('/api/admin/users/' + wrong.id, {
        method: 'DELETE',
        cookie,
        body: {confirmation_email: wrong.email, expected_version: getUser(wrong.id).session_version},
        expected: 403
      });
    }
  });
  await test('Exclusao sem autenticacao e recusada', () =>
    req('/api/admin/users/' + wrong.id, {method: 'DELETE', cookie: null, body: {}, expected: 401}));
  await test('Exclusao de origem externa e recusada', () =>
    req('/api/admin/users/' + wrong.id, {
      method: 'DELETE',
      body: {},
      headers: {Origin: 'http://terceiro.invalid'},
      expected: 403
    }));
  let disposable, disposableCookie, retiredId;
  await test('Previa de exclusao retorna so os dados necessarios, nunca hashes', async () => {
    disposable = await create('PROFESSOR');
    disposableCookie = (await login(disposable)).cookie;
    const p = (await req('/api/admin/users/' + disposable.id + '/impact')).data;
    assert.equal(p.can_delete, true);
    assert.ok(!JSON.stringify(p).includes('password'));
  });
  await test('Exclusao exige e-mail correto e revisao valida', async () => {
    await remove(disposable.id, {confirmation_email: 'errado@teste.invalid'}, 400);
    await remove(disposable.id, {expected_version: undefined}, 400);
    assert.ok(getUser(disposable.id));
  });
  await test('Exclusao fisica remove o usuario, nao apenas o desativa', async () => {
    retiredId = disposable.id;
    const r = await remove(disposable.id);
    assert.equal(r.data.deleted, true);
    assert.equal(getUser(disposable.id), undefined);
    await req('/api/me', {cookie: disposableCookie, expected: 401});
  });
  await test('E-mail e matricula excluidos podem ser cadastrados novamente', async () => {
    const fresh = await create('PROFESSOR', {email: disposable.email, matricula: disposable.matricula});
    assert.ok(fresh.id > retiredId);
    const l = await login(fresh);
    assert.equal(l.data.user.id, fresh.id);
    await req('/api/me', {cookie: disposableCookie, expected: 401});
  });
  await test('Excluir aluno sem historico remove tambem seu cadastro academico', async () => {
    const u = await create('ALUNO'),
      sid = u.student_id,
      cookie = (await login(u)).cookie;
    await remove(u.id);
    assert.equal(runtime.db.prepare('SELECT id FROM students WHERE id=?').get(sid), undefined);
    const fresh = await create('ALUNO', {email: u.email, matricula: u.matricula});
    assert.ok(fresh.student_id > sid);
    assert.ok(fresh.id > u.id);
    await req('/api/me', {cookie, expected: 401});
  });
  await test('Repetir exclusao retorna nao encontrado, sem efeitos colaterais', () =>
    req('/api/admin/users/' + retiredId, {method: 'DELETE', body: {}, expected: 404}));
  await test('Excluir professor com A1/A2/A3 vazias limpa apenas configuracao sem notas', async () => {
    const f = await fixture();
    runtime.db
      .prepare('INSERT INTO assessment_headers(assessment_id,field_key,label) VALUES(?,?,?)')
      .run(f.assessment.id, 'q7', 'Exemplo');
    runtime.db
      .prepare('INSERT INTO assessment_question_config(assessment_id,field_key,area,max_value) VALUES(?,?,?,?)')
      .run(f.assessment.id, 'c1', 'Exemplo', 2);
    const p = (await req('/api/admin/users/' + f.teacher.id + '/impact')).data;
    assert.equal(p.counts.assessments, 3);
    assert.equal(p.counts.score_rows, 3);
    assert.equal(p.can_delete, true);
    await remove(f.teacher.id);
    assert.equal(runtime.db.prepare('SELECT count(*) n FROM assessments WHERE professor_id=?').get(f.teacher.id).n, 0);
    assert.equal(
      runtime.db.prepare('SELECT count(*) n FROM teaching_assignments WHERE professor_id=?').get(f.teacher.id).n,
      0
    );
    assert.ok(getUser(f.student.id));
    assert.ok(runtime.db.prepare('SELECT id FROM academic_courses WHERE id=?').get(f.course.id));
  });
  await test('Excluir aluno com matricula e linhas vazias preserva avaliacoes do professor', async () => {
    const f = await fixture(),
      v = f.assessment.revision;
    await remove(f.student.id);
    assert.equal(runtime.db.prepare('SELECT count(*) n FROM scores WHERE student_id=?').get(f.student.student_id).n, 0);
    assert.equal(
      runtime.db.prepare('SELECT count(*) n FROM academic_enrollments WHERE student_id=?').get(f.student.student_id).n,
      0
    );
    assert.ok(runtime.db.prepare('SELECT revision FROM assessments WHERE id=?').get(f.assessment.id).revision > v);
    assert.ok(getUser(f.teacher.id));
  });
  let graded;
  await test('Nota ZERO bloqueia exclusao de aluno e professor', async () => {
    graded = await fixture();
    runtime.db.prepare('UPDATE scores SET c1=0,nota_prova=0,nota_final=0 WHERE id=?').run(graded.score.id);
    const before = academicSnapshot();
    for (const u of [graded.student, graded.teacher]) {
      const p = (await req('/api/admin/users/' + u.id + '/impact')).data;
      assert.equal(p.can_delete, false);
      await remove(u.id, {}, 409);
    }
    assert.equal(academicSnapshot(), before);
  });
  await test('Nota legada tambem bloqueia exclusao', async () => {
    const f = await fixture();
    runtime.db.prepare('UPDATE scores SET a3_de_a1=0 WHERE id=?').run(f.score.id);
    await remove(f.student.id, {}, 409);
    await remove(f.teacher.id, {}, 409);
  });
  await test('Previa vazia nao autoriza apagar nota lancada depois dela', async () => {
    const f = await fixture();
    assert.equal((await req('/api/admin/users/' + f.student.id + '/impact')).data.can_delete, true);
    runtime.db.prepare('UPDATE scores SET c2=1 WHERE id=?').run(f.score.id);
    await remove(f.student.id, {}, 409);
    assert.equal(runtime.db.prepare('SELECT c2 FROM scores WHERE id=?').get(f.score.id).c2, 1);
  });
  await test('Resultado publicado bloqueia exclusao mesmo sem nota no rascunho', async () => {
    const f = await fixture();
    runtime.db
      .prepare('INSERT INTO published_scores(score_id,assessment_id,student_id,sent) VALUES(?,?,?,1)')
      .run(f.score.id, f.assessment.id, f.student.student_id);
    await remove(f.student.id, {}, 409);
    await remove(f.teacher.id, {}, 409);
    assert.ok(runtime.db.prepare('SELECT score_id FROM published_scores WHERE score_id=?').get(f.score.id));
  });
  await test('Registro de publicacao preserva o autor mesmo com zero participantes', async () => {
    const f = await fixture();
    runtime.db
      .prepare('INSERT INTO publication_events(assessment_id,actor_id,revision,student_count) VALUES(?,?,0,0)')
      .run(f.assessment.id, f.teacher.id);
    await remove(f.teacher.id, {}, 409);
  });
  let history, oldStudentSession, oldTeacherSession;
  await test('Publicacao real gera historico para testar conversoes sem perda', async () => {
    history = await fixture();
    oldTeacherSession = (await login(history.teacher)).cookie;
    oldStudentSession = (await login(history.student)).cookie;
    const endpoint = '/api/assessment/' + history.assessment.id;
    let d = (await req(endpoint, {cookie: oldTeacherSession})).data;
    await req(endpoint + '/scores', {
      method: 'PUT',
      cookie: oldTeacherSession,
      body: {revision: d.assessment.revision, rows: [{id: history.score.id, c1: 1.5}]}
    });
    d = (await req(endpoint, {cookie: oldTeacherSession})).data;
    await req(endpoint + '/question-config', {
      method: 'PUT',
      cookie: oldTeacherSession,
      body: {revision: d.assessment.revision, field_key: 'c1', area: 'Conhecimento teste', max_value: 2}
    });
    d = (await req(endpoint, {cookie: oldTeacherSession})).data;
    await req(endpoint + '/publish', {
      method: 'POST',
      cookie: oldTeacherSession,
      body: {revision: d.assessment.revision}
    });
    assert.equal(
      (await req('/api/student/assessment/' + history.assessment.id, {cookie: oldStudentSession})).data.row.c1,
      1.5
    );
  });
  await test('Aluno com historico pode mudar de funcao sem apagar notas nem publicacoes', async () => {
    const before = academicSnapshot();
    await edit(history.student.id, {role: 'PROFESSOR'});
    assert.equal(academicSnapshot(), before);
    assert.equal(
      runtime.db.prepare('SELECT active FROM academic_enrollments WHERE id=?').get(history.enrollment.id).active,
      0
    );
    await req('/api/me', {cookie: oldStudentSession, expected: 401});
  });
  await test('Nova matricula de cadastro convertido e recusada no servidor', () =>
    post(
      '/api/admin/enrollments',
      {
        student_id: history.student.student_id,
        discipline_id: history.discipline.id,
        year: 2027,
        semester: '2',
        class_name: ''
      },
      409
    ));
  await test('Voltar a ALUNO preserva resultados publicados, sem reativar vinculos automaticamente', async () => {
    await edit(history.student.id, {role: 'ALUNO'});
    assert.equal(
      runtime.db.prepare('SELECT active FROM academic_enrollments WHERE id=?').get(history.enrollment.id).active,
      0
    );
    const cookie = (await login(history.student)).cookie;
    assert.equal((await req('/api/student/assessment/' + history.assessment.id, {cookie})).data.row.c1, 1.5);
  });
  await test('Professor com historico muda para aluno sem perder autoria nem notas', async () => {
    const pubBefore = JSON.stringify(runtime.db.prepare('SELECT * FROM published_scores ORDER BY score_id').all());
    await edit(history.teacher.id, {role: 'ALUNO'});
    assert.ok(getUser(history.teacher.id).student_id);
    assert.equal(
      runtime.db.prepare('SELECT active FROM teaching_assignments WHERE id=?').get(history.assignment.id).active,
      0
    );
    assert.equal(
      JSON.stringify(runtime.db.prepare('SELECT * FROM published_scores ORDER BY score_id').all()),
      pubBefore
    );
    await req('/api/me', {cookie: oldTeacherSession, expected: 401});
  });
  await test('Funcao restaurada nao reativa privilegios antigos sem novo vinculo', async () => {
    await edit(history.teacher.id, {role: 'PROFESSOR'});
    const cookie = (await login(history.teacher)).cookie;
    assert.equal((await req('/api/assessments', {cookie})).data.length, 0);
    await post('/api/admin/assignments', {
      professor_id: history.teacher.id,
      discipline_id: history.discipline.id,
      year: 2027,
      semester: '1',
      class_name: ''
    });
    assert.equal((await req('/api/assessments', {cookie})).data.length, 3);
  });
  await test('Falha de referencia inesperada desfaz exclusao inteira', async () => {
    const f = await fixture(),
      before = academicSnapshot();
    runtime.db.exec('CREATE TABLE test_external_link(user_id INTEGER REFERENCES users(id))');
    runtime.db.prepare('INSERT INTO test_external_link(user_id) VALUES(?)').run(f.student.id);
    await remove(f.student.id, {}, 409);
    assert.ok(getUser(f.student.id));
    assert.equal(academicSnapshot(), before);
    assert.ok(runtime.db.prepare('SELECT id FROM academic_enrollments WHERE id=?').get(f.enrollment.id));
    runtime.db.exec('DROP TABLE test_external_link');
  });
  await test('Contas com cadastro academico compartilhado nao sofrem alteracoes destrutivas', async () => {
    const a = await create('ALUNO'),
      b = await create('PROFESSOR');
    runtime.db.prepare('UPDATE users SET student_id=? WHERE id=?').run(a.student_id, b.id);
    await remove(a.id, {}, 409);
    await edit(a.id, {role: 'PROFESSOR'}, 409);
    runtime.db.prepare('UPDATE users SET student_id=NULL WHERE id=?').run(b.id);
  });
  await test('Auditoria registra conversoes e exclusoes sem senhas', async () => {
    const rows = runtime.db
      .prepare("SELECT * FROM audit_logs WHERE action IN('ADMIN_ALTERAR_FUNCAO','ADMIN_EXCLUIR_USUARIO')")
      .all();
    assert.ok(rows.some(r => r.action === 'ADMIN_EXCLUIR_USUARIO'));
    assert.ok(rows.some(r => r.action === 'ADMIN_ALTERAR_FUNCAO'));
    assert.ok(!JSON.stringify(rows).includes(password));
  });
  await test('Sessao de administrador permanece valida durante as operacoes', async () => {
    assert.equal((await req('/api/me')).data.role, 'ADMIN');
  });
  await test('Integridade SQLite e chaves estrangeiras preservadas', async () => {
    assert.equal(runtime.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(runtime.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  const identities = runtime.db.prepare('SELECT * FROM identity_counters ORDER BY entity').all();
  const historyBefore = academicSnapshot();
  await new Promise(r => server.close(r));
  server = null;
  runtime.close();
  runtime = null;
  runtime = createApplication({dataDir: temp});
  await test('Reinicio preserva historico e contadores de identidade', () => {
    assert.equal(academicSnapshot(), historyBefore);
    assert.deepEqual(runtime.db.prepare('SELECT * FROM identity_counters ORDER BY entity').all(), identities);
  });
  console.log('\n' + results.length + ' verificacoes de usuarios aprovadas.');
})()
  .catch(e => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise(r => server.close(r));
    if (runtime) runtime.close();
    const dest = process.env.SUPREMA_USERS_REPORT || path.join(ROOT, 'tests/reports', 'RELATORIO_USUARIOS_API.json');
    fs.writeFileSync(
      dest,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          node: process.version,
          platform: process.platform,
          environment: 'Banco temporario com contas ficticias. Nenhuma escrita no banco entregue.',
          results,
          limitations: ['Windows e rede fisica do cliente nao executados.']
        },
        null,
        2
      )
    );
    console.log('RELATORIO: ' + dest);
    if (temp) fs.rmSync(temp, {recursive: true, force: true});
  });
