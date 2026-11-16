'use strict';
// Synthetic users in a fresh temporary database. Never modifies the delivered data/.
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const ROOT = path.resolve(__dirname, '../..');
const {createApplication} = require(path.join(ROOT, 'server'));
const {configureAdmin} = require(path.join(ROOT, 'scripts/admin'));
const results = [];
let runtime,
  server,
  temp,
  completed = false;
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
(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-period-'));
  runtime = createApplication({dataDir: temp});
  configureAdmin(runtime.db, {name: 'Admin Teste', email: 'admin@teste.invalid', password: 'Admin-Teste-123!'});
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let ac;
  async function call(route, {method = 'GET', body, cookie = ac, expected = 200} = {}) {
    const r = await fetch(base + route, {
      method,
      headers: {...(cookie ? {Cookie: cookie} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json();
    assert.equal(r.status, expected, route + ': ' + JSON.stringify(data));
    return {data, cookie: r.headers.get('set-cookie')?.split(';')[0]};
  }
  // Contas criadas pelo administrador nascem com senha provisoria. Esta suite verifica outras regras,
  // entao o preparo dispensa a troca direto no banco de teste. O primeiro acesso tem suite propria:
  // tests/integration/seguranca_login.test.js.
  const login = async (email, password) => {
    const r = await call('/api/login', {method: 'POST', cookie: '', body: {login: email, password}});
    if (r.data.user?.mustChangePassword)
      runtime.db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').run(r.data.user.id);
    return r;
  };
  ac = (await login('admin@teste.invalid', 'Admin-Teste-123!')).cookie;
  const post = async (route, body, expected = 201) => (await call(route, {method: 'POST', body, expected})).data;
  const user = (label, role, period) =>
    post('/api/admin/users', {
      name: 'Pessoa Teste ' + label,
      email: label + '@teste.invalid',
      matricula: 'TEST-' + label,
      role,
      password: 'Conta-Teste-123!',
      ...(period !== undefined ? {period} : {})
    });
  const professor = await user('prof', 'PROFESSOR');
  const s1 = await user('um', 'ALUNO', '1'),
    s1b = await user('um-b', 'ALUNO', '1');
  const s2 = await user('dois', 'ALUNO', '2'),
    s2b = await user('dois-b', 'ALUNO', '2');
  const s12 = await user('doze', 'ALUNO', '12'),
    noPeriod = await user('sem-periodo', 'ALUNO');
  const teacherCookie = (await login('prof@teste.invalid', 'Conta-Teste-123!')).cookie;
  const studentCookie = (await login('dois@teste.invalid', 'Conta-Teste-123!')).cookie;
  const course = await post('/api/admin/courses', {name: 'Curso Teste A'});
  const courseB = await post('/api/admin/courses', {name: 'Curso Teste B'});
  const disc = async (cid, p, name) => post('/api/admin/disciplines', {course_id: cid, period: p, name});
  const d1 = await disc(course.id, '1', 'Primeiro'),
    d2 = await disc(course.id, '2', 'Segundo A'),
    d2b = await disc(course.id, '2', 'Segundo B');
  const d12 = await disc(course.id, '12', 'Decimo segundo');
  await disc(courseB.id, '2', 'Outro curso');
  const dInactive = await disc(course.id, '2', 'Inativa');
  await call('/api/admin/disciplines/' + dInactive.id, {
    method: 'PUT',
    body: {name: 'Inativa', course_id: course.id, period: '2', active: false}
  });
  const term = {year: 2027, semester: '2', class_name: 'QA'};
  for (const d of [d2, d2b])
    await post('/api/admin/assignments', {discipline_id: d.id, professor_id: professor.id, ...term});
  const payload = (p, sids, extra = {}) => ({course_id: course.id, period: p, ...term, student_ids: sids, ...extra});
  const bulk = (p, sids, expected = 201, extra = {}) =>
    post('/api/admin/enrollments/period', payload(p, sids, extra), expected);
  const snapshot = () =>
    JSON.stringify(
      ['academic_enrollments', 'scores', 'assessments', 'audit_logs'].map(t =>
        runtime.db.prepare('SELECT * FROM ' + t + ' ORDER BY 1').all()
      )
    );
  const enrollments = sid =>
    runtime.db.prepare('SELECT * FROM academic_enrollments WHERE student_id=? AND active=1 ORDER BY id').all(sid);
  async function editPeriod(u, period) {
    const registered = (await call('/api/admin/users')).data.find(x => x.id === u.id);
    await call('/api/admin/users/' + u.id, {
      method: 'PUT',
      body: {
        name: registered.name,
        email: registered.email,
        matricula: registered.matricula,
        role: 'ALUNO',
        active: true,
        period
      }
    });
  }
  await test('Lista administrativa informa o periodo cadastral e preserva alunos sem periodo', async () => {
    const students = (await call('/api/admin/students')).data;
    assert.equal(students.find(s => s.id === s2.student_id).period, '2');
    assert.equal(students.find(s => s.id === s12.student_id).period, '12');
    assert.equal(students.find(s => s.id === noPeriod.student_id).period, null);
  });
  await test('Sem sessao nao executa matricula em lote', () =>
    call('/api/admin/enrollments/period', {
      method: 'POST',
      body: payload('2', [s2.student_id]),
      cookie: '',
      expected: 401
    }));
  await test('Professor nao executa matricula em lote', () =>
    call('/api/admin/enrollments/period', {
      method: 'POST',
      body: payload('2', [s2.student_id]),
      cookie: teacherCookie,
      expected: 403
    }));
  await test('Aluno nao executa matricula em lote', () =>
    call('/api/admin/enrollments/period', {
      method: 'POST',
      body: payload('2', [s2.student_id]),
      cookie: studentCookie,
      expected: 403
    }));
  await test('Selecao vazia e rejeitada', () => bulk('2', [], 400));
  await test('Periodo vazio e rejeitado', () => bulk('', [s2.student_id], 400));
  await test('Periodo fora do intervalo e rejeitado', () => bulk('31', [s2.student_id], 400));
  await test('Periodo sem disciplinas ativas e rejeitado', () => bulk('4', [s2.student_id], 400));
  await test('Aluno do periodo 1 nao e aceito no lote do periodo 2', async () => {
    const before = snapshot();
    await bulk('2', [s1.student_id], 409);
    assert.equal(snapshot(), before);
  });
  await test('Aluno do periodo 12 nao e confundido com periodo 2', async () => {
    const before = snapshot();
    await bulk('2', [s12.student_id], 409);
    assert.equal(snapshot(), before);
  });
  await test('Aluno sem periodo nao recebe matricula em lote por inferencia', async () => {
    const before = snapshot();
    await bulk('2', [noPeriod.student_id], 409);
    assert.equal(snapshot(), before);
  });
  await test('Lote misto e inteiramente rejeitado sem gravar o primeiro aluno valido', async () => {
    const before = snapshot();
    await bulk('1', [s1.student_id, s2.student_id], 409);
    assert.equal(snapshot(), before);
  });
  await test('Aluno inexistente nao deixa gravacao parcial', async () => {
    const before = snapshot();
    await bulk('1', [s1.student_id, 99999999], 400);
    assert.equal(snapshot(), before);
  });
  await test('Periodo normalizado matricula somente nas disciplinas ativas do curso selecionado', async () => {
    const r = await bulk('02', [s2.student_id]);
    assert.equal(r.added, 2);
    assert.equal(r.disciplines, 2);
    assert.equal(r.students, 1);
    const rows = enrollments(s2.student_id);
    assert.deepEqual(
      rows.map(x => x.discipline_id),
      [d2.id, d2b.id]
    );
    assert.ok(
      rows.every(x => x.year === term.year && x.semester === term.semester && x.class_name === term.class_name)
    );
  });
  await test('Matricula em lote sincroniza alunos nas avaliacoes A1, A2 e A3 do professor', async () => {
    const assessments = (await call('/api/assessments', {cookie: teacherCookie})).data;
    assert.equal(assessments.length, 6);
    for (const a of assessments) {
      const page = (await call('/api/assessment/' + a.id, {cookie: teacherCookie})).data;
      assert.deepEqual(
        page.rows.map(x => x.student_id),
        [s2.student_id]
      );
    }
  });
  await test('Mesmo lote pode ser reenviado sem duplicar matriculas', async () => {
    const r = await bulk('2', [s2.student_id, s2.student_id]);
    assert.equal(r.students, 1);
    assert.equal(r.added, 0);
    assert.equal(enrollments(s2.student_id).length, 2);
  });
  await test('Varios alunos do mesmo periodo sao aceitos e IDs repetidos nao duplicam', async () => {
    const r = await bulk('1', [s1.student_id, s1b.student_id, s1.student_id]);
    assert.equal(r.students, 2);
    assert.equal(r.added, 2);
  });
  await test('Periodo alterado apos carregar a tela e revalidado no servidor', async () => {
    await editPeriod(s2b, '1');
    const before = snapshot();
    await bulk('2', [s2b.student_id], 409);
    assert.equal(snapshot(), before);
    const r = await bulk('1', [s2b.student_id]);
    assert.equal(r.added, 1);
  });
  await test('Mudanca do periodo cadastral nao apaga matriculas ja existentes', async () => {
    const before = enrollments(s2.student_id);
    await editPeriod(s2, '1');
    assert.deepEqual(enrollments(s2.student_id), before);
    await bulk('2', [s2.student_id], 409);
    assert.deepEqual(enrollments(s2.student_id), before);
  });
  await test('Matricula individual continua permitindo outra disciplina explicitamente', async () => {
    const r = await post('/api/admin/enrollments', {discipline_id: d2.id, student_id: s1.student_id, ...term});
    assert.ok(r.id);
  });
  await test('Matricula individual continua disponivel a aluno sem periodo cadastrado', async () => {
    const r = await post('/api/admin/enrollments', {discipline_id: d1.id, student_id: noPeriod.student_id, ...term});
    assert.ok(r.id);
  });
  await test('Erro na selecao nao apaga matriculas anteriores nem resultados', async () => {
    const before = snapshot();
    await bulk('12', [s12.student_id, s1.student_id], 409);
    assert.equal(snapshot(), before);
  });
  await test('Identificador nao numerico e rejeitado antes de gravar', async () => {
    const before = snapshot();
    await bulk('1', [s1.student_id, '1 OR 1=1'], 400);
    assert.equal(snapshot(), before);
  });
  await test('Curso inativo nao recebe novas matriculas por periodo', async () => {
    await call('/api/admin/courses/' + courseB.id, {method: 'PUT', body: {name: 'Curso Teste B', active: false}});
    const before = snapshot();
    await bulk('2', [s2.student_id], 400, {course_id: courseB.id});
    assert.equal(snapshot(), before);
  });
  await test('Periodo 12 valido pode ser matriculado sem incluir outros periodos', async () => {
    const r = await bulk('12', [s12.student_id]);
    assert.equal(r.added, 1);
    assert.deepEqual(
      enrollments(s12.student_id).map(x => x.discipline_id),
      [d12.id]
    );
  });
  await test('Integridade SQLite e chaves estrangeiras permanecem validas', () => {
    assert.equal(runtime.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(runtime.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  completed = true;
})()
  .catch(e => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise(r => server.close(r));
    if (runtime) runtime.close();
    if (temp) fs.rmSync(temp, {recursive: true, force: true});
    const report = {
      generated_at: new Date().toISOString(),
      completed,
      node: process.version,
      platform: process.platform,
      environment: 'Banco temporario novo; somente dados ficticios; sem escrita no banco original.',
      results,
      limitations: ['Windows e rede fisica nao testados.']
    };
    const dest =
      process.env.SUPREMA_PERIOD_API_REPORT ||
      path.join(ROOT, 'tests/reports', 'RELATORIO_MATRICULAS_PERIODO_API.json');
    fs.writeFileSync(dest, JSON.stringify(report, null, 2));
    console.log(results.filter(x => x.status === 'APROVADO').length + ' testes aprovados. RELATORIO: ' + dest);
  });
