'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const ROOT = path.resolve(__dirname, '../..');
const {createApplication} = require(path.join(ROOT, 'server'));
const {configureAdmin} = require(path.join(ROOT, 'scripts/admin'));
const {verifyPassword} = require(path.join(ROOT, 'apps/api/src/core/security'));
const fixtures = require(path.join(ROOT, 'tests/fixtures/planilhas_alunos'));
const results = [];
let runtime, server, temp, base, admin, admin2, teacherCookie, studentCookie;
const PASS = 'Lote-Teste-123!';
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
async function req(url, {method = 'GET', body, cookie = admin, status = 200, raw, headers = {}} = {}) {
  const options = {method, headers: {...headers}};
  if (cookie) options.headers.cookie = cookie;
  if (raw !== undefined) options.body = raw;
  else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const r = await fetch(base + url, options),
    data = await r.json().catch(() => ({}));
  assert.equal(r.status, status, url + ' ' + JSON.stringify(data));
  return {data, cookie: r.headers.get('set-cookie')?.split(';')[0]};
}
const post = async (url, body, status = 200, cookie = admin) =>
  (await req(url, {method: 'POST', body, status, cookie})).data;
const preview = (bytes, name = 'alunos.xlsx', cookie = admin, status = 200) =>
  req('/api/admin/student-import/preview', {
    method: 'POST',
    raw: bytes,
    cookie,
    status,
    headers: {'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name)}
  }).then(r => r.data);
const confirm = (p, extra = {}, status = 200, cookie = admin) =>
  post('/api/admin/student-import/confirm', {token: p.token, revision: p.revision, ...extra}, status, cookie);
// Contas criadas pelo administrador nascem com senha provisoria. Esta suite verifica outras regras,
// entao o preparo dispensa a troca direto no banco de teste. O primeiro acesso tem suite propria:
// tests/integration/seguranca_login.test.js.
const signIn = async (login, password = PASS) => {
  const r = await req('/api/login', {method: 'POST', body: {login, password}, cookie: null});
  if (r.data.user?.mustChangePassword)
    runtime.db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').run(r.data.user.id);
  return r;
};
const review = (p, rows, status = 200, cookie = admin) =>
  post('/api/admin/student-import/review', {token: p.token, revision: p.revision, rows}, status, cookie);
const account = (role, id, extra = {}) =>
  post(
    '/api/admin/users',
    {
      role,
      name: 'Pessoa ficticia ' + id,
      email: id.toLowerCase() + '@teste.invalid',
      matricula: id,
      password: PASS,
      ...extra
    },
    201
  );
const edit = async (id, overrides = {}) => {
  const u = (await req('/api/admin/users/' + id + '/impact')).data.user;
  return (
    await req('/api/admin/users/' + id, {
      method: 'PUT',
      body: {...u, ...overrides, active: !!u.active, expected_version: u.session_version, confirm_role_change: true}
    })
  ).data;
};
const count = table => runtime.db.prepare('SELECT count(*) n FROM ' + table).get().n;
async function serve() {
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
}
(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'suprema-import-'));
  runtime = createApplication({dataDir: temp});
  configureAdmin(runtime.db, {
    name: 'Administrador Ficticio',
    email: 'admin@teste.invalid',
    password: PASS
  }).id;
  configureAdmin(runtime.db, {name: 'Segundo Administrador', email: 'admin2@teste.invalid', password: PASS});
  await serve();
  admin = (
    await req('/api/login', {method: 'POST', body: {login: 'admin@teste.invalid', password: PASS}, cookie: null})
  ).cookie;
  admin2 = (
    await req('/api/login', {method: 'POST', body: {login: 'admin2@teste.invalid', password: PASS}, cookie: null})
  ).cookie;
  await test('Migracao adiciona periodo sem preencher dados por suposicao', () => {
    assert.ok(
      runtime.db
        .prepare('PRAGMA table_info(students)')
        .all()
        .some(c => c.name === 'period')
    );
    assert.ok(runtime.db.prepare('SELECT id FROM schema_migrations WHERE id=?').get('student-period-import-v1'));
  });
  let individual;
  await test('Cadastro individual de aluno persiste periodo', async () => {
    individual = await account('ALUNO', 'MANUAL-01', {period: '2'});
    assert.equal(individual.period, '2');
  });
  await test('Listagem e previa de edicao mostram o periodo do aluno', async () => {
    assert.equal((await req('/api/admin/users')).data.find(u => u.id === individual.id).period, '2');
    assert.equal((await req('/api/admin/users/' + individual.id + '/impact')).data.user.period, '2');
  });
  await test('Edicao do periodo persiste e invalida sessao anterior', async () => {
    const cookie = (await signIn('MANUAL-01')).cookie;
    await edit(individual.id, {period: '3'});
    assert.equal(runtime.db.prepare('SELECT period FROM students WHERE id=?').get(individual.student_id).period, '3');
    await req('/api/me', {cookie, status: 401});
  });
  await test('Servidor rejeita periodo para professor e administrador', async () => {
    await post(
      '/api/admin/users',
      {
        role: 'PROFESSOR',
        name: 'Teste',
        email: 'proibido@teste.invalid',
        matricula: 'PROIBIDO',
        password: PASS,
        period: '2'
      },
      400
    );
    await post(
      '/api/admin/users',
      {role: 'ADMIN', name: 'Teste', email: 'proibido2@teste.invalid', matricula: 'PROIBIDO2', password: PASS},
      400
    );
  });
  await test('Cadastro individual antigo sem periodo continua compativel', async () => {
    const a = await account('ALUNO', 'SEM-PERIODO');
    assert.equal(a.period, null);
  });
  await test('Periodo invalido nao e salvo no cadastro individual', () =>
    post(
      '/api/admin/users',
      {
        role: 'ALUNO',
        name: 'Teste',
        email: 'invalido@teste.invalid',
        matricula: 'INVALIDO',
        password: PASS,
        period: '31'
      },
      400
    ));
  const teacher = await account('PROFESSOR', 'DOC-01');
  teacherCookie = (await signIn('DOC-01')).cookie;
  studentCookie = (await signIn('MANUAL-01')).cookie;
  const simple = await fixtures.xlsx([
    fixtures.roster('2\u00ba', [
      [1, 'LOTE-001', 'Aluno Importado'],
      [2, 'LOTE-002', 'Outra Pessoa']
    ])
  ]);
  await test('Importacao sem sessao e bloqueada', () => preview(simple, 'alunos.xlsx', null, 401));
  await test('Professor e aluno nao podem importar contas', async () => {
    await preview(simple, 'alunos.xlsx', teacherCookie, 403);
    await preview(simple, 'alunos.xlsx', studentCookie, 403);
  });
  let p;
  const before = count('users');
  await test('Upload cria previa e nao cria usuarios', async () => {
    p = await preview(simple);
    assert.equal(p.summary.total, 2);
    assert.equal(p.summary.ready, 2);
    assert.equal(count('users'), before);
  });
  await test('Cabecalho na linha 3 e dados da linha 4 sao respeitados', () => {
    assert.equal(p.rows[0].excel_row, 4);
    assert.equal(p.rows[0].matricula, 'LOTE-001');
    assert.equal(p.rows[0].period, '2');
  });
  await test('Email interno e explicitado e login continua sendo matricula', () => {
    assert.equal(p.login, 'matricula');
    assert.equal(p.rows[0].email, 'lote-001@alunos.suprema.local');
    assert.ok(p.email_policy.includes('interno'));
  });
  await test('Outra conta administrativa nao pode usar a previa', () => review(p, [], 404, admin2));
  await test('Revisao rejeita campos de nome ou perfil adulterados', () =>
    review(p, [{row_id: p.rows[0].row_id, period: '2', selected: true, role: 'ADMIN'}], 400));
  await test('Revisao rejeita IDs de linha desconhecidos', () =>
    review(p, [{row_id: '999:4', period: '2', selected: true}], 400));
  await test('Revisao invalida e atomica, sem aplicar mudancas parciais', async () => {
    await review(
      p,
      [
        {row_id: p.rows[0].row_id, period: '4', selected: true},
        {row_id: p.rows[1].row_id, period: '0', selected: true}
      ],
      400
    );
    p = await review(p, []);
    assert.equal(p.rows[0].period, '2');
  });
  await test('Confirmacao rejeita senha unica para o lote', async () => {
    await confirm(p, {password: PASS}, 400);
    assert.equal(count('users'), before);
  });
  const old = p;
  await test('Periodo pode ser revisado por aluno antes de gravar', async () => {
    p = await review(
      p,
      p.rows.map((r, i) => ({row_id: r.row_id, period: i ? '4' : '3', selected: true}))
    );
    assert.equal(p.rows[0].period, '3');
    assert.equal(count('users'), before);
  });
  await test('Uma revisao antiga nao pode confirmar a importacao', () => confirm(old, {}, 409));
  let report;
  await test('Confirmacao cria contas com perfil fixo ALUNO e periodo revisado', async () => {
    report = await confirm(p, {role: 'ADMIN'});
    assert.deepEqual(report.summary, {total: 2, created: 2, ignored: 0, errors: 0});
    for (const row of report.rows) {
      const u = runtime.db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id);
      assert.equal(u.role, 'ALUNO');
      assert.equal(runtime.db.prepare('SELECT period FROM students WHERE id=?').get(u.student_id).period, row.period);
    }
  });
  await test('Cada conta recebe senha provisoria individual, com salt proprio e troca obrigatoria', () => {
    const stored = report.rows.map(r =>
      runtime.db.prepare('SELECT password_hash,must_change_password FROM users WHERE id=?').get(r.user_id)
    );
    assert.equal(report.credentials.length, 2);
    assert.notEqual(report.credentials[0].password, report.credentials[1].password);
    assert.notEqual(stored[0].password_hash, stored[1].password_hash);
    report.rows.forEach((row, i) => {
      const own = report.credentials.find(c => c.row_id === row.row_id);
      assert.match(own.password, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      assert.ok(verifyPassword(own.password, stored[i].password_hash));
      assert.ok(!verifyPassword(PASS, stored[i].password_hash));
      assert.equal(stored[i].must_change_password, 1);
    });
  });
  await test('Aluno importado nao entra com a senha de um colega', async () => {
    const other = report.credentials.find(c => c.matricula !== 'LOTE-001');
    await req('/api/login', {
      method: 'POST',
      body: {login: 'LOTE-001', password: other.password},
      cookie: null,
      status: 401
    });
  });
  await test('Aluno importado entra pela matricula, troca a senha provisoria e nao acessa administracao', async () => {
    const mine = report.credentials.find(c => c.matricula === 'LOTE-001');
    const first = await req('/api/login', {
        method: 'POST',
        body: {login: 'LOTE-001', password: mine.password},
        cookie: null
      }),
      cookie = first.cookie;
    assert.equal(first.data.user.mustChangePassword, true);
    assert.equal((await req('/api/student/assessments', {cookie, status: 403})).data.code, 'PASSWORD_CHANGE_REQUIRED');
    await req('/api/me/password', {
      method: 'POST',
      cookie,
      body: {current_password: mine.password, new_password: 'Senha-Do-Aluno-456!'}
    });
    assert.equal((await req('/api/me', {cookie})).data.role, 'ALUNO');
    await req('/api/admin/users', {cookie, status: 403});
    await req('/api/student/assessments', {cookie});
    await req('/api/login', {
      method: 'POST',
      body: {login: 'LOTE-001', password: mine.password},
      cookie: null,
      status: 401
    });
  });
  await test('Importar periodo nao cria matriculas de disciplinas por suposicao', () =>
    assert.equal(count('academic_enrollments'), 0));
  await test('Relatorio persistido e auditoria nao incluem senha ou hash', async () => {
    const audit = JSON.stringify(runtime.db.prepare('SELECT action,details FROM audit_logs').all());
    const stored = runtime.db
      .prepare('SELECT report_json FROM student_import_runs WHERE id=?')
      .get(report.import_id).report_json;
    const fetched = JSON.stringify((await req('/api/admin/student-import/' + report.import_id + '/report')).data);
    for (const c of report.credentials)
      for (const text of [audit, stored, fetched]) assert.ok(!text.includes(c.password));
    for (const text of [audit, stored, fetched, JSON.stringify(report)]) assert.ok(!text.includes('password_hash'));
    assert.ok(!stored.includes('credentials'));
    assert.ok(!fetched.includes('credentials'));
  });
  await test('Confirmacao repetida retorna resultado sem duplicar contas', async () => {
    const n = count('users'),
      again = await confirm(p);
    assert.equal(again.replayed, true);
    assert.equal(count('users'), n);
    assert.equal(again.import_id, report.import_id);
    assert.deepEqual(again.credentials, report.credentials);
  });
  await test('Outro administrador nao obtem as senhas provisorias da importacao', async () => {
    await post('/api/admin/student-import/confirm', {token: report.import_id}, 404, admin2);
  });
  await test('Relatorio persistido requer perfil e autor corretos', async () => {
    assert.deepEqual(
      (await req('/api/admin/student-import/' + report.import_id + '/report')).data.summary,
      report.summary
    );
    await req('/api/admin/student-import/' + report.import_id + '/report', {cookie: admin2, status: 404});
    await req('/api/admin/student-import/' + report.import_id + '/report', {cookie: teacherCookie, status: 403});
  });
  await test('Reimportacao ignora existentes sem trocar senha nem periodo', async () => {
    const u = runtime.db.prepare('SELECT * FROM users WHERE matricula=?').get('LOTE-001'),
      period = runtime.db.prepare('SELECT period FROM students WHERE id=?').get(u.student_id).period;
    const again = await preview(simple);
    assert.equal(again.summary.existing, 2);
    const r = await confirm(again);
    assert.deepEqual(r.summary, {total: 2, created: 0, ignored: 2, errors: 0});
    assert.equal(
      runtime.db.prepare('SELECT password_hash FROM users WHERE id=?').get(u.id).password_hash,
      u.password_hash
    );
    assert.equal(runtime.db.prepare('SELECT period FROM students WHERE id=?').get(u.student_id).period, period);
  });
  const mixed = await fixtures.xlsx([
    fixtures.roster('1\u00ba', [
      [1, 'DUP-10', 'Duplicado A'],
      [2, 'dup-10', 'Duplicado B'],
      [3, '', 'Sem Matricula'],
      [4, 'SEM-NOME', ''],
      [5, 'VAL-01', 'Pessoa Valida']
    ]),
    fixtures.roster('Turma sem periodo', [[1, 'REV-01', 'Revisar Pessoa']]),
    {name: 'Docente', rows: [[], ['Codigo', 'Chama', 'Docente'], [1, 22, 'Nao e Aluno']]},
    {name: '2026.2', rows: [[], [], ['PER', 'COD DISC', 'DISCIPLINA'], [1, 'AB', 'Disciplina Ficticia']]}
  ]);
  let mixedPreview;
  await test('Todas as abas sao lidas e abas nao estudantis sao ignoradas', async () => {
    mixedPreview = await preview(mixed);
    assert.equal(mixedPreview.sheets.filter(s => !s.accepted).length, 2);
    assert.equal(mixedPreview.rows.length, 6);
  });
  await test('Detecta duplicidades, campos vazios e periodo desconhecido', () =>
    assert.deepEqual(mixedPreview.summary, {
      total: 6,
      ready: 1,
      existing: 0,
      duplicates: 2,
      review: 1,
      invalid: 2,
      excluded: 0
    }));
  await test('Desmarcar duplicata e revisar periodo permite validar a linha correta', async () => {
    mixedPreview = await review(
      mixedPreview,
      mixedPreview.rows.map((r, i) => ({row_id: r.row_id, period: r.period || '6', selected: i !== 1}))
    );
    assert.equal(mixedPreview.summary.ready, 3);
    assert.equal(mixedPreview.summary.excluded, 1);
  });
  await test('Lote misto cria validos e relata ignorados e erros sem ocultar perdas', async () => {
    const r = await confirm(mixedPreview);
    assert.deepEqual(r.summary, {total: 6, created: 3, ignored: 1, errors: 2});
    assert.equal(r.rows.filter(x => x.result === 'ERRO').length, 2);
  });
  await test('Matricula existente sem conta nao e duplicada nem sobrescrita', async () => {
    runtime.db
      .prepare('INSERT INTO students(id,name,matricula,period) VALUES(9000,?,?,?)')
      .run('Aluno Legado', 'LEGADO-01', '8');
    const b = await fixtures.xlsx([fixtures.roster('1\u00ba', [[1, 'LEGADO-01', 'Nome diferente']])]);
    const pp = await preview(b);
    assert.equal(pp.summary.existing, 1);
    await confirm(pp);
    assert.equal(runtime.db.prepare('SELECT name,period FROM students WHERE id=9000').get().name, 'Aluno Legado');
  });
  await test('Matricula ocupada por professor e ignorada sem converter perfil', async () => {
    const b = await fixtures.xlsx([fixtures.roster('1\u00ba', [[1, 'DOC-01', 'Outro Nome']])]);
    const pp = await preview(b);
    assert.equal(pp.summary.existing, 1);
    await confirm(pp);
    assert.equal(runtime.db.prepare('SELECT role FROM users WHERE id=?').get(teacher.id).role, 'PROFESSOR');
  });
  await test('Conta criada depois da previa e detectada ao confirmar', async () => {
    const b = await fixtures.xlsx([fixtures.roster('1\u00ba', [[1, 'CORRIDA-01', 'Aluno Concorrente']])]);
    const pp = await preview(b);
    await account('ALUNO', 'CORRIDA-01', {period: '9'});
    const rr = await confirm(pp);
    assert.equal(rr.summary.ignored, 1);
    assert.equal(rr.summary.created, 0);
  });
  await test('Confirmacao simultanea do mesmo lote nao duplica contas', async () => {
    const b = await fixtures.xlsx([
      fixtures.roster('1\u00ba', [
        [1, 'SIMUL-01', 'Aluno Simultaneo'],
        [2, 'SIMUL-02', 'Aluno Simultaneo 2']
      ])
    ]);
    const pp = await preview(b);
    const first = confirm(pp);
    await confirm(pp, {}, 409);
    assert.equal((await first).summary.created, 2);
  });
  await test('Falha no registro da importacao reverte todo o lote', async () => {
    const b = await fixtures.xlsx([fixtures.roster('1\u00ba', [[1, 'REVERT-01', 'Aluno Reversao']])]),
      pp = await preview(b),
      n = count('users'),
      counters = JSON.stringify(runtime.db.prepare('SELECT * FROM identity_counters').all());
    runtime.db.exec(
      "CREATE TEMP TRIGGER import_fail BEFORE INSERT ON student_import_runs BEGIN SELECT RAISE(ABORT,'simulated failure'); END"
    );
    await confirm(pp, {}, 500);
    assert.equal(count('users'), n);
    assert.equal(JSON.stringify(runtime.db.prepare('SELECT * FROM identity_counters').all()), counters);
    runtime.db.exec('DROP TRIGGER import_fail');
    const rr = await confirm(pp);
    assert.equal(rr.summary.created, 1);
  });
  await test('Nao e possivel confirmar sem uma previa real', () => confirm({token: 'inventada', revision: 1}, {}, 404));
  await test('Extensao diferente e conteudo incorreto sao rejeitados', async () => {
    await preview(simple, 'alunos.csv', admin, 400);
    await preview(Buffer.from('nao e excel'), 'alunos.xlsx', admin, 400);
    await preview(Buffer.from('nao e excel'), 'alunos.xls', admin, 400);
  });
  await test('Cabecalho fora de B3/C3 e recusado sem criar usuarios', async () => {
    const n = count('users'),
      b = await fixtures.xlsx([{name: '1\u00ba', rows: [fixtures.headers, [1, 'HEADER-WRONG', 'Teste']]}]);
    await preview(b, 'alunos.xlsx', admin, 400);
    assert.equal(count('users'), n);
  });
  await test('Limite de upload de 8 MB e aplicado', () =>
    preview(Buffer.alloc(8 * 1024 * 1024 + 1), 'grande.xlsx', admin, 413));
  await test('Mais de 2000 registros bloqueia o arquivo inteiro', async () => {
    const b = await fixtures.xlsx([
      fixtures.roster(
        '1\u00ba',
        Array.from({length: 2001}, (_, i) => [i + 1, 'LIM-' + i, 'Aluno ' + i])
      )
    ]);
    await preview(b, 'limite.xlsx', admin, 400);
  });
  await test('Zeros a esquerda, numeracao formatada e acentos sao preservados', async () => {
    const b = await fixtures.xlsx([
      fixtures.roster('3\u00b0', [
        [1, '0000123', 'Jo\u00e3o Modelo'],
        [2, {value: 124, zeroPad: true}, 'Vit\u00f3ria Modelo']
      ])
    ]);
    const pp = await preview(b);
    assert.equal(pp.rows[0].matricula, '0000123');
    assert.equal(pp.rows[1].matricula, '000124');
    assert.equal(pp.rows[0].name, 'Jo\u00e3o Modelo');
  });
  await test('Linhas vazias sao ignoradas, sem truncar linhas posteriores', async () => {
    const b = await fixtures.xlsx([
      fixtures.roster('4\u00ba', [[1, 'LACUNA-01', 'Aluno 1'], [], [], [4, 'LACUNA-02', 'Aluno 2']])
    ]);
    const pp = await preview(b);
    assert.equal(pp.rows.length, 2);
    assert.equal(pp.rows[1].excel_row, 7);
  });
  await test('Formulas nao sao executadas nem usadas como identificacao', async () => {
    const b = await fixtures.xlsx([
      fixtures.roster('1\u00ba', [
        [1, {value: 123, formula: '1+122'}, 'Nome'],
        [2, 'FORM-02', {value: 'Aluno', formula: '"Aluno"'}]
      ])
    ]);
    const pp = await preview(b);
    assert.equal(pp.summary.invalid, 2);
  });
  await test('Planilhas XLS binario FAT, miniFAT e SST continuada sao lidas', async () => {
    for (const mini of [false, true]) {
      const pp = await preview(
        fixtures.xls(
          [
            fixtures.roster('7\u00ba', [
              [1, 'XLS-01', 'Jo\u00e3o e Ana Ficticios'],
              [2, {value: 124, zeroPad: true}, 'Nome acentuado \u00c1\u00e3']
            ])
          ],
          {mini, sstLimit: 45}
        ),
        'alunos.xls'
      );
      assert.equal(pp.rows.length, 2);
      assert.equal(pp.rows[0].period, '7');
      assert.equal(pp.rows[1].matricula, '000124');
      assert.equal(pp.rows[0].name, 'Jo\u00e3o e Ana Ficticios');
    }
  });
  await test('XLS suporta valores RK e abas sem registros de alunos', async () => {
    const b = fixtures.xls([
      fixtures.roster('8\u00ba', [[1, {value: 345, rk: true, zeroPad: true}, 'Aluno RK']]),
      {name: 'Docente', rows: [[], [], ['A', 'B', 'C']]}
    ]);
    const pp = await preview(b, 'dados.xls');
    assert.equal(pp.rows[0].matricula, '000345');
    assert.equal(pp.sheets[1].accepted, false);
  });
  await test('Arquivo XLS truncado e recusado sem travar o servidor', async () => {
    const b = fixtures.xls([fixtures.roster('1\u00ba', [[1, 'XLS-ERR', 'Nome']])]);
    await preview(b.subarray(0, b.length - 1), 'dados.xls', admin, 400);
    await req('/api/health', {cookie: null});
  });
  await test('Dados importados por XLS seguem a mesma criacao e permissao', async () => {
    const pp = await preview(
      fixtures.xls([fixtures.roster('10\u00ba', [[1, 'XLS-CREATE', 'Nome XLS']])], {mini: true}),
      'dados.xls'
    );
    const rr = await confirm(pp);
    assert.equal(rr.summary.created, 1);
    const row = (await req('/api/admin/users')).data.find(u => u.matricula === 'XLS-CREATE');
    assert.equal(row.period, '10');
    assert.equal(row.role, 'ALUNO');
  });
  await test('Edicao de periodo nao muda vinculos de disciplinas nem resultados existentes', async () => {
    const u = (await req('/api/admin/users')).data.find(u => u.matricula === 'LOTE-001');
    const c = await post('/api/admin/courses', {name: 'Curso de Teste'}, 201),
      d = await post('/api/admin/disciplines', {name: 'Disciplina Teste', course_id: c.id, period: '1'}, 201);
    await post(
      '/api/admin/assignments',
      {discipline_id: d.id, professor_id: teacher.id, year: 2026, semester: '2', class_name: ''},
      201
    );
    await post(
      '/api/admin/enrollments',
      {discipline_id: d.id, student_id: u.student_id, year: 2026, semester: '2', class_name: ''},
      201
    );
    const before = JSON.stringify(runtime.db.prepare('SELECT * FROM academic_enrollments').all()),
      scores = JSON.stringify(runtime.db.prepare('SELECT * FROM scores').all());
    await edit(u.id, {period: '5'});
    assert.equal(JSON.stringify(runtime.db.prepare('SELECT * FROM academic_enrollments').all()), before);
    assert.equal(JSON.stringify(runtime.db.prepare('SELECT * FROM scores').all()), scores);
  });
  await test('Trocar funcao oculta periodo, sem perder historico do aluno', async () => {
    await edit(individual.id, {role: 'PROFESSOR', period: null});
    assert.equal((await req('/api/admin/users')).data.find(u => u.id === individual.id).period, null);
    await edit(individual.id, {role: 'ALUNO', period: '4'});
    assert.equal((await req('/api/admin/users')).data.find(u => u.id === individual.id).period, '4');
  });
  if (process.env.SUPREMA_WORKBOOK_SOURCE) {
    const bytes = fs.readFileSync(process.env.SUPREMA_WORKBOOK_SOURCE);
    let actual;
    await test('Planilha fornecida: 327 alunos em 11 abas, sem importar docentes ou disciplinas', async () => {
      actual = await preview(bytes, path.basename(process.env.SUPREMA_WORKBOOK_SOURCE));
      assert.equal(actual.rows.length, 327);
      assert.equal(actual.sheets.filter(s => s.accepted).length, 11);
      assert.deepEqual(
        actual.sheets.filter(s => !s.accepted).map(s => s.name),
        ['2026.2', 'Docente']
      );
      assert.equal(actual.summary.ready, 327);
    });
    await test('Planilha fornecida: contagem de cada periodo coincide com leitura independente', () =>
      assert.deepEqual(
        actual.sheets.filter(s => s.accepted).map(s => [s.detected_period, s.rows]),
        [
          ['1', 33],
          ['2', 27],
          ['3', 31],
          ['4', 25],
          ['5', 29],
          ['6', 30],
          ['7', 21],
          ['8', 40],
          ['9', 9],
          ['10', 39],
          ['12', 43]
        ]
      ));
    await test('Planilha fornecida: 327 contas criadas somente em banco temporario', async () => {
      const r = await confirm(actual);
      assert.deepEqual(r.summary, {total: 327, created: 327, ignored: 0, errors: 0});
      for (const row of r.rows) {
        assert.equal(
          runtime.db.prepare('SELECT period FROM students WHERE id=?').get(row.student_id).period,
          row.period
        );
      }
    });
    await test('Planilha fornecida: reimportacao ignora as 327 contas sem duplicar', async () => {
      const n = count('users'),
        pp = await preview(bytes, path.basename(process.env.SUPREMA_WORKBOOK_SOURCE));
      assert.equal(pp.summary.existing, 327);
      const r = await confirm(pp);
      assert.equal(r.summary.ignored, 327);
      assert.equal(count('users'), n);
    });
  }
  await test('Banco permanece integro e sem referencias invalidas', () => {
    assert.equal(runtime.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(runtime.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
  const usersBefore = count('users'),
    studentsBefore = count('students'),
    saved = report.import_id;
  await new Promise(r => server.close(r));
  server = null;
  runtime.close();
  runtime = createApplication({dataDir: temp});
  await serve();
  admin = (
    await req('/api/login', {method: 'POST', body: {login: 'admin@teste.invalid', password: PASS}, cookie: null})
  ).cookie;
  await test('Apos reinicio as senhas provisorias nao podem mais ser obtidas', async () => {
    const again = await post('/api/admin/student-import/confirm', {token: saved});
    assert.equal(again.replayed, true);
    assert.deepEqual(again.credentials, []);
    assert.match(again.credentials_notice, /Redefinir senha/);
  });
  await test('Reinicio preserva contas, periodos e relatorios de importacao', async () => {
    assert.equal(count('users'), usersBefore);
    assert.equal(count('students'), studentsBefore);
    assert.equal(runtime.db.prepare('SELECT period FROM students WHERE id=?').get(individual.student_id).period, '4');
    assert.equal((await req('/api/admin/student-import/' + saved + '/report')).data.summary.created, 2);
  });
  await test('Repetir confirmacao apos reinicio nao duplica contas', async () => {
    const r = await confirm({token: saved, revision: 1});
    assert.equal(r.replayed, true);
    assert.equal(count('users'), usersBefore);
  });
  console.log('\n' + results.length + ' verificacoes de importacao aprovadas.');
})()
  .catch(e => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise(r => server.close(r));
    if (runtime) runtime.close();
    const dest = process.env.SUPREMA_IMPORT_REPORT || path.join(ROOT, 'tests/reports', 'RELATORIO_IMPORTACAO_API.json');
    fs.writeFileSync(
      dest,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          node: process.version,
          platform: process.platform,
          environment:
            'Banco temporario descartado. Sem alteracao do banco entregue. XLS binario testado com fixtures sinteticas FAT/miniFAT/CONTINUE.',
          workbook_source_tested: !!process.env.SUPREMA_WORKBOOK_SOURCE,
          results,
          limitations: [
            'Windows e rede fisica nao executados.',
            'XLS suporta Excel 97-2003 BIFF8. Formatos anteriores, HTML renomeado e arquivos criptografados sao recusados.'
          ]
        },
        null,
        2
      )
    );
    console.log('RELATORIO: ' + dest);
    if (temp) fs.rmSync(temp, {recursive: true, force: true});
  });
