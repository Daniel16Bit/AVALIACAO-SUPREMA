'use strict';
// Runs only against an isolated temporary copy. Never opens the live database for writing.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const {DatabaseSync, backup} = require('node:sqlite');
const ROOT = path.resolve(__dirname, '../..');
const {createApplication} = require(path.join(ROOT, 'server'));
const {configureAdmin} = require(path.join(ROOT, 'scripts/admin'));
const {verifyPassword} = require(path.join(ROOT, 'apps/api/src/core/security'));
const D = require(path.join(ROOT, 'apps/api/src/core/domain'));
const ExcelJS = require(path.join(ROOT, 'node_modules/exceljs'));
const results = [];
let runtime, server, temp;
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
const baselineTables = [
  'users',
  'students',
  'assessments',
  'scores',
  'published_scores',
  'assessment_headers',
  'assessment_question_config'
];
function snapshot(db, columns) {
  const out = {};
  for (const t of baselineTables) {
    const c =
      columns[t] ||
      db
        .prepare('PRAGMA table_info(' + t + ')')
        .all()
        .map(x => x.name);
    columns[t] = c;
    out[t] = db.prepare('SELECT ' + c.join(',') + ' FROM ' + t + ' ORDER BY ' + c[0]).all();
  }
  return JSON.parse(JSON.stringify(out));
}
(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-test-'));
  const source = process.env.SUPREMA_TEST_SOURCE_DB || path.join(ROOT, 'data/avaliacao_suprema.db');
  if (fs.existsSync(source)) {
    const origin = new DatabaseSync(source, {readOnly: true});
    try {
      await backup(origin, path.join(temp, 'avaliacao_suprema.db'));
    } finally {
      origin.close();
    }
  }
  if (!fs.existsSync(source)) {
    const clean = require(path.join(ROOT, 'apps/api/src/core/database')).openDatabase(temp);
    clean.db.close();
  }
  const beforeDb = new DatabaseSync(path.join(temp, 'avaliacao_suprema.db'));
  const columns = {},
    before = snapshot(beforeDb, columns);
  beforeDb.close();
  runtime = createApplication({dataDir: temp});
  await test('Migracao preserva usuarios, hashes, notas, publicacoes e configuracoes originais', () => {
    const after = snapshot(runtime.db, columns);
    for (const table of baselineTables) {
      const key = columns[table][0];
      const ids = new Set(before[table].map(row => row[key]));
      assert.deepEqual(
        after[table].filter(row => ids.has(row[key])),
        before[table],
        table
      );
    }
  });

  await test('Periodo/semestre antigos sao normalizados apenas para localizar vinculos', () => {
    const old = runtime.db.prepare("SELECT * FROM assessments WHERE type='A1' AND assignment_id IS NULL LIMIT 1").get();
    if (!old) return;
    const cid = Number(
      runtime.db.prepare('INSERT INTO academic_courses(name) VALUES(?)').run('Curso legado de teste').lastInsertRowid
    );
    const did = Number(
      runtime.db
        .prepare('INSERT INTO academic_disciplines(course_id,name,period) VALUES(?,?,?)')
        .run(cid, old.discipline, D.canonicalAcademic(old.period)).lastInsertRowid
    );
    const aid = Number(
      runtime.db
        .prepare(
          'INSERT INTO teaching_assignments(discipline_id,professor_id,year,semester,class_name) VALUES(?,?,?,?,?)'
        )
        .run(did, old.professor_id, old.year, D.canonicalAcademic(old.semester), old.class_name).lastInsertRowid
    );
    const beforeScores = runtime.db.prepare('SELECT * FROM scores WHERE assessment_id=? ORDER BY id').all(old.id);
    const ids = D.transaction(runtime.db, () => D.syncAssignment(runtime.db, aid));
    assert.ok(ids.includes(old.id));
    assert.equal(ids.length, 3);
    assert.deepEqual(
      runtime.db.prepare('SELECT * FROM scores WHERE assessment_id=? ORDER BY id').all(old.id),
      beforeScores
    );
    assert.equal(runtime.db.prepare('SELECT period FROM assessments WHERE id=?').get(old.id).period, old.period);
  });
  await test('Integridade SQLite apos migracao', () =>
    assert.equal(runtime.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'));
  await test('Chaves estrangeiras consistentes', () =>
    assert.equal(runtime.db.prepare('PRAGMA foreign_key_check').all().length, 0));
  const suffix = Date.now().toString(36),
    adminEmail = 'admin-' + suffix + '@teste.invalid',
    adminPass = 'Teste-Admin-123!';
  configureAdmin(runtime.db, {name: 'Administrador de Teste', email: adminEmail, password: adminPass});
  server = runtime.app.listen(0, '0.0.0.0');
  await new Promise(r => server.once('listening', r));
  let base = 'http://127.0.0.1:' + server.address().port;
  async function req(url, {method = 'GET', body, cookie, expected = 200, headers = {}, raw} = {}) {
    const r = await fetch(base + url, {
      method,
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(cookie ? {Cookie: cookie} : {}), ...headers},
      body: raw || (body ? JSON.stringify(body) : undefined)
    });
    let data;
    const ct = r.headers.get('content-type') || '';
    data = ct.includes('json') ? await r.json() : await r.text();
    assert.equal(r.status, expected, url + ' ' + JSON.stringify(data));
    return {data, r, cookie: r.headers.get('set-cookie')?.split(';')[0]};
  }
  // Contas criadas pelo administrador nascem com senha provisoria. Esta suite verifica outras regras,
  // entao o preparo dispensa a troca direto no banco de teste. O primeiro acesso tem suite propria:
  // tests/integration/seguranca_login.test.js.
  const login = async (email, password) => {
    const r = await req('/api/login', {method: 'POST', body: {login: email, password}});
    if (r.data.user?.mustChangePassword)
      runtime.db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').run(r.data.user.id);
    return r;
  };
  const ac = (await login(adminEmail, adminPass)).cookie;
  const post = async (route, body, cookie = ac, expected = 201) =>
    (await req(route, {method: 'POST', body, cookie, expected})).data;
  await test('Login administrador com perfil correto e cookie HttpOnly', async () => {
    const r = await login(adminEmail, adminPass);
    assert.equal(r.data.user.role, 'ADMIN');
    assert.match(r.r.headers.get('set-cookie'), /HttpOnly/);
  });
  await test('Sem sessao nao acessa cadastros', () => req('/api/admin/users', {expected: 401}));
  let teacher, teacher2, student, student2, tc, tc2, sc, sc2, course, disc, assignment, a1, a2, score;
  await test('Administrador cadastra professor sem promover para ADMIN', async () => {
    teacher = await post('/api/admin/users', {
      name: 'Professor Teste A',
      email: 'prof-' + suffix + '@teste.invalid',
      matricula: 'P' + suffix,
      password: 'Teste-Prof-123!',
      role: 'PROFESSOR'
    });
    assert.equal(teacher.role, 'PROFESSOR');
    const l = await login('prof-' + suffix + '@teste.invalid', 'Teste-Prof-123!');
    tc = l.cookie;
    assert.equal(l.data.user.role, 'PROFESSOR');
  });
  await test('Cadastro nao aceita elevacao para ADMIN', () =>
    post(
      '/api/admin/users',
      {name: 'Nao criar', email: 'escalada@teste.invalid', matricula: 'ESC', password: 'Senha123456', role: 'ADMIN'},
      ac,
      400
    ));
  await test('Professor nao acessa API administrativa', () => req('/api/admin/users', {cookie: tc, expected: 403}));
  await test('Cadastro impede e-mail duplicado com caixa diferente', () =>
    post(
      '/api/admin/users',
      {
        name: 'Outro',
        email: ('prof-' + suffix + '@teste.invalid').toUpperCase(),
        matricula: 'DUP' + suffix,
        password: 'Teste-Prof-123!',
        role: 'PROFESSOR'
      },
      ac,
      409
    ));
  await test('Cria segundo professor e dois alunos', async () => {
    teacher2 = await post('/api/admin/users', {
      name: 'Professor Teste B',
      email: 'prof2-' + suffix + '@teste.invalid',
      matricula: 'P2' + suffix,
      password: 'Teste-Prof-123!',
      role: 'PROFESSOR'
    });
    tc2 = (await login('prof2-' + suffix + '@teste.invalid', 'Teste-Prof-123!')).cookie;
    student = await post('/api/admin/users', {
      name: 'Aluno de Teste A',
      email: 'aluno-' + suffix + '@teste.invalid',
      matricula: 'A' + suffix,
      password: 'Teste-Aluno-123!',
      role: 'ALUNO',
      period: '2'
    });
    student2 = await post('/api/admin/users', {
      name: 'Aluno de Teste B',
      email: 'aluno2-' + suffix + '@teste.invalid',
      matricula: 'A2' + suffix,
      password: 'Teste-Aluno-123!',
      role: 'ALUNO',
      period: '2'
    });
    sc = (await login('aluno-' + suffix + '@teste.invalid', 'Teste-Aluno-123!')).cookie;
    sc2 = (await login('aluno2-' + suffix + '@teste.invalid', 'Teste-Aluno-123!')).cookie;
  });
  await test('Aluno nao acessa rotas de professor e administrador', async () => {
    await req('/api/assessments', {cookie: sc, expected: 403});
    await req('/api/admin/summary', {cookie: sc, expected: 403});
  });
  await test('Cria curso e disciplina com periodo normalizado', async () => {
    course = await post('/api/admin/courses', {name: 'Curso teste ' + suffix});
    disc = await post('/api/admin/disciplines', {course_id: course.id, name: 'Fisiologia II - Teste', period: '2'});
  });
  await test('Vinculo docente cria A1, A2 e A3 automaticamente', async () => {
    assignment = await post('/api/admin/assignments', {
      discipline_id: disc.id,
      professor_id: teacher.id,
      year: 2027,
      semester: '1',
      class_name: ''
    });
    const a = (await req('/api/assessments', {cookie: tc})).data;
    assert.equal(a.length, 3);
    a1 = a.find(x => x.type === 'A1');
    a2 = a.find(x => x.type === 'A2');
    assert.equal(a1.year, 2027);
    assert.equal(a1.period, '2');
    assert.equal(a1.context_key, a2.context_key);
  });
  await test('Repetir vinculo nao duplica avaliacoes', async () => {
    await post(
      '/api/admin/assignments',
      {discipline_id: disc.id, professor_id: teacher.id, year: 2027, semester: '1', class_name: ''},
      ac,
      409
    );
    assert.equal((await req('/api/assessments', {cookie: tc})).data.length, 3);
  });
  await test('Matricula inclui aluno nas avaliacoes sem zeros artificiais', async () => {
    await post('/api/admin/enrollments', {
      discipline_id: disc.id,
      student_id: student.student_id,
      year: 2027,
      semester: '1',
      class_name: ''
    });
    for (const a of [a1, a2]) {
      const d = (await req('/api/assessment/' + a.id, {cookie: tc})).data;
      assert.equal(d.rows.length, 1);
      assert.equal(d.rows[0].nota_final, null);
    }
    const d = (await req('/api/assessment/' + a2.id, {cookie: tc})).data;
    a2 = d.assessment;
    score = d.rows[0];
  });
  await test('Professor B nao acessa avaliacao do professor A', async () => {
    await req('/api/assessment/' + a2.id, {cookie: tc2, expected: 404});
    await req('/api/assessment/' + a2.id + '/scores', {
      method: 'PUT',
      body: {rows: [], revision: 0},
      cookie: tc2,
      expected: 404
    });
  });
  await test('Aluno nao ve avaliacao sem publicacao', async () => {
    assert.equal((await req('/api/student/assessments', {cookie: sc})).data.length, 0);
    await req('/api/student/assessment/' + a2.id, {cookie: sc, expected: 404});
  });
  async function fresh() {
    return (await req('/api/assessment/' + a2.id, {cookie: tc})).data;
  }
  async function save(changes, expected = 200, revision) {
    const d = await fresh();
    return await req('/api/assessment/' + a2.id + '/scores', {
      method: 'PUT',
      cookie: tc,
      expected,
      body: {revision: revision ?? d.assessment.revision, rows: [{id: score.id, ...changes}]}
    });
  }
  await test('Rascunho incompleto salva e permanece privado', async () => {
    await save({c1: 1});
    assert.equal((await req('/api/student/assessments', {cookie: sc})).data.length, 0);
    assert.equal((await req('/api/assessment/' + a2.id + '/stats', {cookie: tc})).data.count, 0);
  });
  await test('Publicacao bloqueada sem area e valor da questao usada', async () => {
    const d = await fresh();
    await req('/api/assessment/' + a2.id + '/publish', {
      method: 'POST',
      body: {revision: d.assessment.revision},
      cookie: tc,
      expected: 400
    });
  });
  await test('Nota negativa rejeitada sem gravacao parcial', async () => {
    await save({c1: -1}, 400);
    assert.equal((await fresh()).rows[0].c1, 1);
  });
  await test('ID de nota de outra avaliacao e rejeitado', async () => {
    const d = await fresh(),
      other = (await req('/api/assessment/' + a1.id, {cookie: tc})).data.rows[0];
    await req('/api/assessment/' + a2.id + '/scores', {
      method: 'PUT',
      body: {revision: d.assessment.revision, rows: [{id: other.id, c1: 9}]},
      cookie: tc,
      expected: 400
    });
  });
  async function question(area, max) {
    const d = await fresh();
    return req('/api/assessment/' + a2.id + '/question-config', {
      method: 'PUT',
      cookie: tc,
      body: {revision: d.assessment.revision, field_key: 'c1', area, max_value: max}
    });
  }
  await test('Questao com metadados valida; configuracao fica em rascunho', async () => {
    await question('Fisiologia cardiovascular', 2);
    assert.equal((await req('/api/student/assessments', {cookie: sc})).data.length, 0);
  });
  await test('Publicacao valida libera imediatamente sem botao de enviar', async () => {
    const d = await fresh();
    const result = await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 200);
    assert.equal(result.updated, 1);
    assert.equal((await req('/api/student/assessments', {cookie: sc})).data.length, 1);
    const resultAluno = (await req('/api/student/assessment/' + a2.id, {cookie: sc})).data;
    assert.equal(resultAluno.row.c1, 1);
    assert.equal(resultAluno.questionStats[0].area, 'Fisiologia cardiovascular');
    assert.equal(resultAluno.stats.rows, undefined);
  });
  await test('Aluno B nao consulta resultado do aluno A', () =>
    req('/api/student/assessment/' + a2.id, {cookie: sc2, expected: 404}));
  await test('Repetir publicar e idempotente', async () => {
    const d = await fresh();
    const p = await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 200);
    assert.equal(p.updated, 0);
    assert.equal(runtime.db.prepare('SELECT count(*) n FROM published_scores WHERE assessment_id=?').get(a2.id).n, 1);
  });
  await test('Nova edicao nao altera nota nem metadados publicados', async () => {
    await save({c1: 1.5});
    await question('Nova area em rascunho', 3);
    const r = (await req('/api/student/assessment/' + a2.id, {cookie: sc})).data;
    assert.equal(r.row.c1, 1);
    assert.equal(r.questionStats[0].max_value, 2);
    assert.equal(r.questionStats[0].area, 'Fisiologia cardiovascular');
  });
  await test('Republicacao atualiza nota e metadados juntos', async () => {
    const d = await fresh();
    await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 200);
    const r = (await req('/api/student/assessment/' + a2.id, {cookie: sc})).data;
    assert.equal(r.row.c1, 1.5);
    assert.equal(r.questionStats[0].max_value, 3);
  });
  await test('Avaliacao publicada nao pode desaparecer por rascunho vazio', async () => {
    await save({c1: null});
    const d = await fresh();
    await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 400);
    assert.equal((await req('/api/student/assessment/' + a2.id, {cookie: sc})).data.row.c1, 1.5);
    await save({c1: 1.5});
  });
  await test('Zero real e preservado e publicado (nao vira vazio)', async () => {
    await save({c1: 0});
    const d = await fresh();
    await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 200);
    assert.equal((await req('/api/student/assessment/' + a2.id, {cookie: sc})).data.row.c1, 0);
  });
  await test('Nota acima do maximo bloqueia publicacao, mas aceita rascunho', async () => {
    await save({c1: 4});
    const d = await fresh();
    await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 400);
    await save({c1: 2});
  });
  await test('Controle de concorrencia rejeita uma revisao antiga', async () => {
    const d = await fresh();
    await save({c1: 2.1});
    await save({c1: 2.2}, 409, d.assessment.revision);
    assert.equal((await fresh()).rows[0].c1, 2.1);
  });
  await test('Duas gravacoes simultaneas: uma aceita e outra bloqueada', async () => {
    const d = await fresh();
    const out = await Promise.all(
      [2.3, 2.4].map(c1 =>
        fetch(base + '/api/assessment/' + a2.id + '/scores', {
          method: 'PUT',
          headers: {Cookie: tc, 'Content-Type': 'application/json'},
          body: JSON.stringify({revision: d.assessment.revision, rows: [{id: score.id, c1}]})
        })
      )
    );
    assert.deepEqual(out.map(x => x.status).sort(), [200, 409]);
  });
  await test('Pausa operacional impede escrita no servidor e preserva consultas', async () => {
    await req('/api/admin/controls', {method: 'PUT', body: {key: 'pause_scores', value: 1}, cookie: ac});
    await save({c1: 2}, 423);
    await req('/api/student/assessment/' + a2.id, {cookie: sc});
    await req('/api/admin/controls', {method: 'PUT', body: {key: 'pause_scores', value: 0}, cookie: ac});
  });
  await test('Pausa de publicacao nao apaga resultados anteriores', async () => {
    await req('/api/admin/controls', {method: 'PUT', body: {key: 'pause_publication', value: 1}, cookie: ac});
    const d = await fresh();
    await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 423);
    await req('/api/student/assessment/' + a2.id, {cookie: sc});
    await req('/api/admin/controls', {method: 'PUT', body: {key: 'pause_publication', value: 0}, cookie: ac});
  });
  await test('Importacao gera previa, sem alterar notas ate confirmacao', async () => {
    const d = await fresh(),
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Teste');
    sheet.addRow(['Aluno', 'Matricula', 'Questao 1']);
    sheet.addRow(['Aluno de Teste A', 'A' + suffix, 2.7]);
    const buf = await book.xlsx.writeBuffer(),
      fd = new FormData();
    fd.append('file', new Blob([buf]), 'notas.xlsx');
    const p = (await req('/api/assessment/' + a2.id + '/import', {method: 'POST', cookie: tc, raw: fd})).data;
    assert.equal(p.preview, true);
    assert.equal((await fresh()).rows[0].c1, d.rows[0].c1);
    await post('/api/assessment/' + a2.id + '/import/confirm', {token: p.token}, tc, 200);
    assert.equal((await fresh()).rows[0].c1, 2.7);
    assert.equal((await req('/api/student/assessment/' + a2.id, {cookie: sc})).data.row.c1, 0);
  });
  await test('Importacao rejeita matricula inexistente e nao grava parcialmente', async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Teste');
    sheet.addRow(['Matricula', 'Questao 1']);
    sheet.addRow(['A' + suffix, 1]);
    sheet.addRow(['NAO-EXISTE', 2]);
    const buf = await book.xlsx.writeBuffer(),
      fd = new FormData();
    fd.append('file', new Blob([buf]), 'notas.xlsx');
    await req('/api/assessment/' + a2.id + '/import', {method: 'POST', cookie: tc, raw: fd, expected: 400});
    assert.equal((await fresh()).rows[0].c1, 2.7);
  });
  await test('Exportacao .xlsx abre e mantem matricula e nota', async () => {
    const r = await fetch(base + '/api/assessment/' + a2.id + '/export', {headers: {Cookie: tc}});
    assert.equal(r.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await r.arrayBuffer()));
    assert.equal(book.worksheets[0].getCell('B2').value, 'A' + suffix);
    assert.equal(book.worksheets[0].getCell('C2').value, 2.7);
  });
  await test('Encerrar exige publicacao; administrador pode reabrir', async () => {
    let d = await fresh();
    await post('/api/assessment/' + a2.id + '/send-all', {revision: d.assessment.revision}, tc, 409);
    await post('/api/assessment/' + a2.id + '/publish', {revision: d.assessment.revision}, tc, 200);
    d = await fresh();
    await post('/api/assessment/' + a2.id + '/send-all', {revision: d.assessment.revision}, tc, 200);
    await save({c1: 2}, 423);
    await post('/api/admin/assessments/' + a2.id + '/lock', {locked: false}, ac, 200);
    await save({c1: 2});
  });
  await test('Matricula por periodo adiciona disciplinas sem duplicar', async () => {
    const r = await post('/api/admin/enrollments/period', {
      course_id: course.id,
      period: '2',
      year: 2027,
      semester: '1',
      class_name: '',
      student_ids: [student.student_id, student2.student_id]
    });
    assert.equal(r.added, 1);
    assert.equal((await fresh()).rows.length, 2);
  });
  await test('Desativar vinculo bloqueia professor sem apagar notas', async () => {
    const before = runtime.db.prepare('SELECT count(*) n FROM scores WHERE assessment_id=?').get(a2.id).n;
    await req('/api/admin/assignments/' + assignment.id, {method: 'DELETE', cookie: ac});
    await req('/api/assessment/' + a2.id, {cookie: tc, expected: 404});
    assert.equal(runtime.db.prepare('SELECT count(*) n FROM scores WHERE assessment_id=?').get(a2.id).n, before);
    await post('/api/admin/assignments', {
      discipline_id: disc.id,
      professor_id: teacher.id,
      year: 2027,
      semester: '1',
      class_name: ''
    });
    assert.equal((await fresh()).rows.length, 2);
  });
  await test('Desativar matricula preserva historico publicado e exclui roster atual', async () => {
    const enrollment = runtime.db
      .prepare('SELECT id FROM academic_enrollments WHERE student_id=? AND discipline_id=?')
      .get(student.student_id, disc.id);
    await req('/api/admin/enrollments/' + enrollment.id, {method: 'DELETE', cookie: ac});
    assert.equal((await fresh()).rows.length, 1);
    await req('/api/student/assessment/' + a2.id, {cookie: sc});
    await post('/api/admin/enrollments', {
      discipline_id: disc.id,
      student_id: student.student_id,
      year: 2027,
      semester: '1',
      class_name: ''
    });
  });

  await test('Filtros distinguem ofertas por semestre e grupo sem escolher turma arbitraria', async () => {
    await post('/api/admin/assignments', {
      discipline_id: disc.id,
      professor_id: teacher.id,
      year: 2027,
      semester: '2',
      class_name: 'B'
    });
    await post('/api/admin/assignments', {
      discipline_id: disc.id,
      professor_id: teacher.id,
      year: 2027,
      semester: '1',
      class_name: 'B'
    });
    const rows = (await req('/api/assessments', {cookie: tc})).data;
    assert.equal(rows.length, 9);
    assert.equal(new Set(rows.map(r => r.context_key)).size, 3);
    const b = rows.find(r => r.semester === '2' && r.type === 'A2');
    assert.equal((await req('/api/assessment/' + b.id, {cookie: tc})).data.rows.length, 0);
  });
  await test('Remover todas as estacoes zera apenas o subtotal derivado (fica nulo)', async () => {
    await save({osce1: 0.5, osce2: 0.7});
    assert.equal((await fresh()).rows[0].osce, 1.2);
    await save({osce1: null, osce2: null, osce3: null, osce4: null});
    assert.equal((await fresh()).rows[0].osce, null);
    assert.equal((await fresh()).rows[0].nota_final, 2);
  });
  await test('Arquivo XLSX falso e bloqueado sem alterar notas', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['nao e zip']), 'invalido.xlsx');
    await req('/api/assessment/' + a2.id + '/import', {method: 'POST', cookie: tc, raw: fd, expected: 400});
    assert.equal((await fresh()).rows[0].c1, 2);
  });
  await test('Importacao nao aceita campos extras ou arrays aninhados', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'x.xlsx');
    fd.append('dados[999999999999]', 'x');
    await req('/api/assessment/' + a2.id + '/import', {method: 'POST', cookie: tc, raw: fd, expected: 400});
  });
  await test('Arquivo alem do limite descompactado e rejeitado antes do ExcelJS', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Dados').addRow(['Matricula', 'Questao 1']);
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    const pos = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.ok(pos > 0);
    buf.writeUInt32LE(100 * 1024 * 1024, pos + 24);
    const {validateWorkbookArchive} = require(path.join(ROOT, 'apps/api/src/shared/spreadsheets/workbook-guard'));
    assert.throws(() => validateWorkbookArchive(buf), /grande/);
  });
  await test('Backup SQLite manual inclui WAL e pode ser reaberto com dados identicos', async () => {
    const {createBackup} = require(path.join(ROOT, 'scripts/backup'));
    const result = await createBackup(path.join(temp, 'avaliacao_suprema.db'), path.join(temp, 'backups'));
    const check = new DatabaseSync(result.dest, {readOnly: true});
    assert.deepEqual(
      check.prepare('SELECT id,password_hash,role FROM users ORDER BY id').all(),
      runtime.db.prepare('SELECT id,password_hash,role FROM users ORDER BY id').all()
    );
    assert.deepEqual(
      check.prepare('SELECT * FROM published_scores ORDER BY score_id').all(),
      runtime.db.prepare('SELECT * FROM published_scores ORDER BY score_id').all()
    );
    assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    check.close();
    assert.match(result.folder, /BACKUP_001$/);
    const second = await createBackup(path.join(temp, 'avaliacao_suprema.db'), path.join(temp, 'backups'));
    assert.match(second.folder, /BACKUP_002$/);
  });
  await test('Migracao de banco novo cria esquema sem contas padrao nem dados ficticios', () => {
    const {openDatabase} = require(path.join(ROOT, 'apps/api/src/core/database'));
    const clean = openDatabase(path.join(temp, 'clean'));
    assert.equal(clean.db.prepare('SELECT count(*) n FROM users').get().n, 0);
    const a = configureAdmin(clean.db, {
      name: 'Admin local',
      email: 'fresh@teste.invalid',
      password: 'Fresh-Teste-123!'
    });
    assert.ok(a.id);
    assert.equal(clean.db.prepare('SELECT count(*) n FROM scores').get().n, 0);
    clean.db.close();
  });
  await test('SQL parametrizado rejeita tentativa de burlar login', () =>
    req('/api/login', {method: 'POST', body: {login: "' OR 1=1 --", password: 'qualquer'}, expected: 401}));
  await test('API envia cabecalhos de seguranca e nao depende da interface', async () => {
    const x = await fetch(base + '/api/health');
    assert.match(x.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(x.headers.get('x-frame-options'), 'DENY');
    assert.equal((await fetch(base + '/')).status, 404);
  });

  await test('Configurador local nao converte professor em administrador', () =>
    assert.throws(
      () =>
        configureAdmin(runtime.db, {
          name: 'Incorreto',
          email: 'prof-' + suffix + '@teste.invalid',
          password: 'Teste-Incorreto-123!'
        }),
      /pertence a professor ou aluno/
    ));
  await test('Redefinicao de senha revoga sessao antiga sem mudar perfil', async () => {
    await post('/api/admin/users/' + teacher.id + '/password', {password: 'Nova-Senha-123!'}, ac, 200);
    await req('/api/me', {cookie: tc, expected: 401});
    const l = await login('prof-' + suffix + '@teste.invalid', 'Nova-Senha-123!');
    tc = l.cookie;
    assert.equal(l.data.user.role, 'PROFESSOR');
  });
  await test('Desativacao de usuario revoga a sessao no servidor', async () => {
    await req('/api/admin/users/' + student2.id, {
      method: 'PUT',
      cookie: ac,
      body: {
        name: 'Aluno de Teste B',
        email: 'aluno2-' + suffix + '@teste.invalid',
        matricula: 'A2' + suffix,
        active: false
      }
    });
    await req('/api/me', {cookie: sc2, expected: 401});
  });
  await test('Protecao contra requisicao cross-origin autenticada', () =>
    req('/api/admin/courses', {
      method: 'POST',
      body: {name: 'Nao criar'},
      headers: {Origin: 'http://site-terceiro.invalid'},
      cookie: ac,
      expected: 403
    }));
  await test('Logout invalida cookie anterior', async () => {
    await req('/api/logout', {method: 'POST', cookie: tc});
    await req('/api/me', {cookie: tc, expected: 401});
  });
  await test('Rotas estaticas nao expoem banco de dados', () => req('/data/avaliacao_suprema.db', {expected: 404}));
  await test('Erros de autenticacao limitados sem desativar usuario', async () => {
    for (let i = 0; i < 6; i++)
      await req('/api/login', {
        method: 'POST',
        body: {login: 'prof2-' + suffix + '@teste.invalid', password: 'incorreta'},
        expected: 401
      });
    await req('/api/login', {
      method: 'POST',
      body: {login: 'prof2-' + suffix + '@teste.invalid', password: 'incorreta'},
      expected: 429
    });
    assert.equal(runtime.db.prepare('SELECT active FROM users WHERE id=?').get(teacher2.id).active, 1);
  });
  await test('Servidor atende pelo IP local real do ambiente', async () => {
    const ip = Object.values(os.networkInterfaces())
      .flat()
      .find(n => n.family === 'IPv4' && !n.internal)?.address;
    if (!ip) {
      results.push({name: 'IP de rede nao disponivel', status: 'NAO TESTADO'});
      return;
    }
    const r = await fetch('http://' + ip + ':' + server.address().port + '/api/health');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).service, 'avaliacao-suprema');
  });
  await test('Integridade e referencias verificadas apos todas as operacoes', () => {
    assert.equal(runtime.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(runtime.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  let storedPassword = runtime.db.prepare('SELECT password_hash FROM users WHERE id=?').get(teacher.id).password_hash;
  await new Promise(r => server.close(r));
  runtime.close();
  server = null;
  runtime = createApplication({dataDir: temp});
  await test('Reinicio nao redefine senha nem duplica avaliacoes', () => {
    assert.equal(
      runtime.db.prepare('SELECT password_hash FROM users WHERE id=?').get(teacher.id).password_hash,
      storedPassword
    );
    assert.ok(verifyPassword('Nova-Senha-123!', storedPassword));
    assert.equal(
      runtime.db.prepare('SELECT count(*) n FROM assessments WHERE assignment_id=?').get(assignment.id).n,
      3
    );
  });
  await test('Formula original preservada para notas preenchidas e nulos distintos de zero', () => {
    assert.deepEqual(D.calcScore({c1: 2, c2: 1, pbl1: 0.5, osce1: 0.2, osce2: 0.3, q7: 0.4, trabalho: 0.1}), {
      nota_prova: 3,
      osce: 0.5,
      nota_final: 4.5
    });
    assert.deepEqual(D.calcScore({}), {nota_prova: null, osce: null, nota_final: null});
    assert.equal(D.calcScore({c1: 0}).nota_final, 0);
  });
  console.log('\n' + results.filter(x => x.status === 'APROVADO').length + ' verificacoes aprovadas.');
})()
  .catch(e => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise(r => server.close(r));
    if (runtime)
      try {
        runtime.close();
      } catch {}
    const report = {
      generated_at: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      environment: 'copia temporaria; dados de teste ficticios; nenhuma escrita no banco original',
      results,
      limitations: [
        'Execucao no Windows e rede fisica da instituicao nao realizadas neste ambiente.',
        'Scripts de servico 24h exigem homologacao no servidor de destino.'
      ]
    };
    const reportPath = process.env.SUPREMA_TEST_REPORT || path.join(ROOT, 'tests/reports', 'RELATORIO_API.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('RELATORIO: ' + reportPath);
    if (temp) fs.rmSync(temp, {recursive: true, force: true});
  });
