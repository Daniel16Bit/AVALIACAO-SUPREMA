'use strict';
const D = require('../../core/domain');
const U = require('../../core/user-management');
const Accounts = require('../../core/account-creation');
const {listRoles} = require('../../core/roles');
const H = require('../../core/grade-history');
module.exports = function installAdmin({app, db, auth, can, hashPassword, revokeUserSessions, clearLoginAttempts}) {
  const middle = [auth, can('admin.manage')];
  const wrap = fn => (req, res, next) => {
    try {
      const out = fn(req, res);
      if (out && out.then) out.catch(next);
    } catch (e) {
      next(e);
    }
  };
  const write = (req, action, fn) =>
    D.transaction(db, () => {
      const result = fn();
      D.audit(db, req.user, action, result || {});
      return result || {ok: true};
    });
  const requireCourse = cid => {
    const c = db.prepare('SELECT * FROM academic_courses WHERE id=? AND active=1').get(D.id(cid));
    if (!c) D.fail(400, 'Curso ativo n\u00e3o encontrado.');
    return c;
  };
  const requireDiscipline = did => {
    const d = db
      .prepare(
        'SELECT d.* FROM academic_disciplines d JOIN academic_courses c ON c.id=d.course_id WHERE d.id=? AND d.active=1 AND c.active=1'
      )
      .get(D.id(did));
    if (!d) D.fail(400, 'Disciplina ativa n\u00e3o encontrada.');
    return d;
  };
  const requireStudent = sid => {
    const id = D.id(sid),
      s = db.prepare('SELECT id,period FROM students WHERE id=?').get(id);
    if (!s) D.fail(400, 'Aluno n\u00e3o encontrado.');
    if (db.prepare("SELECT id FROM users WHERE student_id=? AND role<>'ALUNO'").get(id))
      D.fail(
        409,
        'Este cadastro foi convertido para outra fun\u00e7\u00e3o e n\u00e3o pode receber novas matr\u00edculas.'
      );
    return s;
  };
  const active = v => {
    if (v === true || v === 1 || v === '1') return 1;
    if (v === false || v === 0 || v === '0') return 0;
    D.fail(400, 'Situa\u00e7\u00e3o inv\u00e1lida.');
  };
  const identity = (body, except = 0) => Accounts.identity(db, body, except);
  app.get(
    '/api/admin/summary',
    middle,
    wrap((req, res) => {
      const count = q => db.prepare(q).get().n;
      res.json({
        professors: count("SELECT count(*) n FROM users WHERE role='PROFESSOR' AND active=1"),
        students: count(
          "SELECT count(*) n FROM students s WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.student_id=s.id AND u.role<>'ALUNO')"
        ),
        courses: count('SELECT count(*) n FROM academic_courses WHERE active=1'),
        disciplines: count('SELECT count(*) n FROM academic_disciplines WHERE active=1'),
        assessments: count("SELECT count(*) n FROM assessments WHERE type IN ('A1','A2','A3')"),
        assignments: count('SELECT count(*) n FROM teaching_assignments WHERE active=1'),
        published: count('SELECT count(DISTINCT assessment_id) n FROM published_scores WHERE sent=1'),
        controls: db.prepare('SELECT key,value FROM system_controls').all()
      });
    })
  );
  app.get('/api/admin/roles', middle, (req, res) => res.json(listRoles()));
  app.get('/api/admin/users', middle, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT u.id,u.name,u.email,u.matricula,u.role,u.active,u.student_id,u.session_version,u.must_change_password,CASE WHEN u.role='ALUNO' THEN s.period ELSE NULL END period FROM users u LEFT JOIN students s ON s.id=u.student_id ORDER BY u.name COLLATE NOCASE"
        )
        .all()
    )
  );
  app.post(
    '/api/admin/users',
    middle,
    wrap((req, res) => {
      const hash = hashPassword(req.body.password);
      res.status(201).json(write(req, 'ADMIN_CRIAR_USUARIO', () => Accounts.createAccount(db, req.body, hash)));
    })
  );
  app.get(
    '/api/admin/users/:id/impact',
    middle,
    wrap((req, res) => res.json(U.impact(db, U.managedUser(db, req.params.id, req.user))))
  );
  app.put(
    '/api/admin/users/:id',
    middle,
    wrap((req, res) => {
      const uid = D.id(req.params.id),
        body = req.body || {};
      const result = write(req, 'ADMIN_EDITAR_USUARIO', () => {
        const u = U.managedUser(db, uid, req.user),
          v = identity(body, uid),
          enabled = active(body.active);
        const out = U.updateUser(db, u, v, {...body, active: enabled});
        if (out.role_changed)
          D.audit(db, req.user, 'ADMIN_ALTERAR_FUNCAO', {
            id: uid,
            previous_role: u.role,
            role: out.role,
            disabled_assignments: out.disabled_assignments,
            disabled_enrollments: out.disabled_enrollments
          });
        return out;
      });
      revokeUserSessions(uid);
      res.json(result);
    })
  );
  app.delete(
    '/api/admin/users/:id',
    middle,
    wrap((req, res) => {
      const uid = D.id(req.params.id);
      const result = write(req, 'ADMIN_EXCLUIR_USUARIO', () =>
        U.deleteUser(db, U.managedUser(db, uid, req.user), req.body || {})
      );
      revokeUserSessions(uid);
      res.json(result);
    })
  );
  app.post(
    '/api/admin/users/:id/password',
    middle,
    wrap((req, res) => {
      const uid = D.id(req.params.id);
      const target = db.prepare('SELECT id,email,matricula FROM users WHERE id=?').get(uid);
      if (!target) D.fail(404, 'Usuário não encontrado.');
      const hash = hashPassword(req.body.password);
      // A password set for someone else is provisional; resetting one's own is a deliberate choice.
      const provisional = uid === req.user.id ? 0 : 1;
      const result = write(req, 'ADMIN_REDEFINIR_SENHA', () => {
        db.prepare(
          'UPDATE users SET password_hash=?,invalid_attempts=0,must_change_password=?,session_version=session_version+1 WHERE id=?'
        ).run(hash, provisional, uid);
        return {ok: true, id: uid, must_change_password: !!provisional};
      });
      revokeUserSessions(uid);
      clearLoginAttempts?.([target.email, target.matricula]);
      res.json(result);
    })
  );
  app.get('/api/admin/courses', middle, (req, res) =>
    res.json(db.prepare('SELECT * FROM academic_courses ORDER BY name COLLATE NOCASE').all())
  );
  app.post(
    '/api/admin/courses',
    middle,
    wrap((req, res) => {
      const name = D.text(req.body.name);
      if (!name) D.fail(400, 'Informe o nome do curso.');
      res.status(201).json(
        write(req, 'ADMIN_CRIAR_CURSO', () => ({
          ok: true,
          id: Number(db.prepare('INSERT INTO academic_courses(name) VALUES(?)').run(name).lastInsertRowid)
        }))
      );
    })
  );
  app.put(
    '/api/admin/courses/:id',
    middle,
    wrap((req, res) => {
      const cid = D.id(req.params.id),
        name = D.text(req.body.name),
        enabled = active(req.body.active);
      if (!name) D.fail(400, 'Nome obrigat\u00f3rio.');
      if (!db.prepare('SELECT id FROM academic_courses WHERE id=?').get(cid)) D.fail(404, 'Curso n\u00e3o encontrado.');
      res.json(
        write(req, 'ADMIN_EDITAR_CURSO', () => {
          db.prepare('UPDATE academic_courses SET name=?,active=? WHERE id=?').run(name, enabled, cid);
          return {ok: true, id: cid};
        })
      );
    })
  );
  app.get('/api/admin/disciplines', middle, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT d.*,c.name course_name,c.active course_active FROM academic_disciplines d JOIN academic_courses c ON c.id=d.course_id ORDER BY c.name,CAST(d.period AS INTEGER),d.name'
        )
        .all()
    )
  );
  app.post(
    '/api/admin/disciplines',
    middle,
    wrap((req, res) => {
      const name = D.text(req.body.name),
        cid = D.id(req.body.course_id),
        p = D.period(req.body.period);
      if (!name) D.fail(400, 'Nome obrigat\u00f3rio.');
      requireCourse(cid);
      res.status(201).json(
        write(req, 'ADMIN_CRIAR_DISCIPLINA', () => ({
          ok: true,
          id: Number(
            db.prepare('INSERT INTO academic_disciplines(course_id,name,period) VALUES(?,?,?)').run(cid, name, p)
              .lastInsertRowid
          )
        }))
      );
    })
  );
  app.put(
    '/api/admin/disciplines/:id',
    middle,
    wrap((req, res) => {
      const did = D.id(req.params.id),
        name = D.text(req.body.name),
        cid = D.id(req.body.course_id),
        p = D.period(req.body.period),
        enabled = active(req.body.active),
        d = db.prepare('SELECT * FROM academic_disciplines WHERE id=?').get(did);
      if (!d) D.fail(404, 'Disciplina n\u00e3o encontrada.');
      if (!name) D.fail(400, 'Nome obrigat\u00f3rio.');
      requireCourse(cid);
      if (
        (d.course_id !== cid || d.period !== p) &&
        db
          .prepare(
            'SELECT 1 FROM teaching_assignments WHERE discipline_id=? UNION SELECT 1 FROM academic_enrollments WHERE discipline_id=?'
          )
          .get(did, did)
      )
        D.fail(
          409,
          'Curso/per\u00edodo com v\u00ednculos n\u00e3o pode ser movido. Crie uma nova disciplina para preservar o hist\u00f3rico.'
        );
      res.json(
        write(req, 'ADMIN_EDITAR_DISCIPLINA', () => {
          db.prepare('UPDATE academic_disciplines SET name=?,course_id=?,period=?,active=? WHERE id=?').run(
            name,
            cid,
            p,
            enabled,
            did
          );
          db.prepare(
            'UPDATE assessments SET discipline=?,period=?,revision=revision+1 WHERE assignment_id IN(SELECT id FROM teaching_assignments WHERE discipline_id=?)'
          ).run(name, p, did);
          return {ok: true, id: did};
        })
      );
    })
  );
  app.get('/api/admin/assignments', middle, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT t.*,d.name discipline_name,d.period,c.name course_name,u.name professor_name FROM teaching_assignments t JOIN academic_disciplines d ON d.id=t.discipline_id JOIN academic_courses c ON c.id=d.course_id JOIN users u ON u.id=t.professor_id WHERE t.active=1 ORDER BY t.year DESC,d.period,d.name'
        )
        .all()
    )
  );
  app.post(
    '/api/admin/assignments',
    middle,
    wrap((req, res) => {
      const did = D.id(req.body.discipline_id),
        pid = D.id(req.body.professor_id),
        t = D.term(req.body);
      requireDiscipline(did);
      if (!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='PROFESSOR'").get(pid))
        D.fail(400, 'Selecione um professor ativo.');
      res.status(201).json(
        write(req, 'ADMIN_VINCULAR_PROFESSOR', () => {
          let a = db
            .prepare(
              'SELECT * FROM teaching_assignments WHERE discipline_id=? AND professor_id=? AND year=? AND semester=? AND class_name=?'
            )
            .get(did, pid, t.year, t.semester, t.class_name);
          if (a?.active) D.fail(409, 'Este v\u00ednculo j\u00e1 existe.');
          const aid = a
            ? a.id
            : Number(
                db
                  .prepare(
                    'INSERT INTO teaching_assignments(discipline_id,professor_id,year,semester,class_name) VALUES(?,?,?,?,?)'
                  )
                  .run(did, pid, t.year, t.semester, t.class_name).lastInsertRowid
              );
          if (a) db.prepare('UPDATE teaching_assignments SET active=1 WHERE id=?').run(aid);
          const assessments = D.syncAssignment(db, aid);
          return {ok: true, id: aid, assessments};
        })
      );
    })
  );
  app.delete(
    '/api/admin/assignments/:id',
    middle,
    wrap((req, res) => {
      const aid = D.id(req.params.id);
      if (!db.prepare('SELECT id FROM teaching_assignments WHERE id=?').get(aid))
        D.fail(404, 'V\u00ednculo n\u00e3o encontrado.');
      res.json(
        write(req, 'ADMIN_DESVINCULAR_PROFESSOR', () => {
          db.prepare('UPDATE teaching_assignments SET active=0 WHERE id=?').run(aid);
          return {ok: true, id: aid, preserved: true};
        })
      );
    })
  );
  app.get('/api/admin/enrollments', middle, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT e.*,d.name discipline_name,d.period,c.name course_name,s.name student_name FROM academic_enrollments e JOIN academic_disciplines d ON d.id=e.discipline_id JOIN academic_courses c ON c.id=d.course_id JOIN students s ON s.id=e.student_id WHERE e.active=1 ORDER BY e.year DESC,s.name,d.name'
        )
        .all()
    )
  );
  function enroll(did, sid, t) {
    requireDiscipline(did);
    requireStudent(sid);
    const previous = db
      .prepare(
        'SELECT id,active FROM academic_enrollments WHERE discipline_id=? AND student_id=? AND year=? AND semester=? AND class_name=?'
      )
      .get(did, sid, t.year, t.semester, t.class_name);
    if (previous?.active) return {id: previous.id, existing: true};
    let eid;
    if (previous) {
      eid = previous.id;
      db.prepare('UPDATE academic_enrollments SET active=1 WHERE id=?').run(eid);
    } else
      eid = Number(
        db
          .prepare(
            'INSERT INTO academic_enrollments(discipline_id,student_id,year,semester,class_name) VALUES(?,?,?,?,?)'
          )
          .run(did, sid, t.year, t.semester, t.class_name).lastInsertRowid
      );
    D.syncContext(db, did, t.year, t.semester, t.class_name);
    return {id: eid, existing: false};
  }
  app.post(
    '/api/admin/enrollments',
    middle,
    wrap((req, res) => {
      const did = D.id(req.body.discipline_id),
        sid = D.id(req.body.student_id),
        t = D.term(req.body);
      res.status(201).json(write(req, 'ADMIN_MATRICULAR_ALUNO', () => ({ok: true, ...enroll(did, sid, t)})));
    })
  );
  app.post(
    '/api/admin/enrollments/period',
    middle,
    wrap((req, res) => {
      const cid = D.id(req.body.course_id),
        p = D.period(req.body.period),
        t = D.term(req.body),
        sids = req.body.student_ids;
      requireCourse(cid);
      if (!Array.isArray(sids) || !sids.length || sids.length > 500) D.fail(400, 'Selecione entre 1 e 500 alunos.');
      const students = [...new Set(sids.map(D.id))],
        subjects = db
          .prepare('SELECT id FROM academic_disciplines WHERE course_id=? AND period=? AND active=1')
          .all(cid, p);
      if (!subjects.length) D.fail(400, 'Nenhuma disciplina ativa neste curso e per\u00edodo.');
      res.status(201).json(
        write(req, 'ADMIN_MATRICULAR_PERIODO', () => {
          // Validate the whole selection against current records before making any changes.
          // This also rejects stale selections after another administrator changes a period.
          for (const sid of students) {
            const student = requireStudent(sid);
            let registeredPeriod = null;
            try {
              registeredPeriod = D.period(student.period);
            } catch {}
            if (registeredPeriod !== p)
              D.fail(
                409,
                'A sele\u00e7\u00e3o cont\u00e9m aluno sem per\u00edodo cadastrado ou de outro per\u00edodo. Confira Per\u00edodo em Usu\u00e1rios e atualize esta tela antes de matricular.'
              );
          }
          let added = 0;
          for (const sid of students) for (const d of subjects) if (!enroll(d.id, sid, t).existing) added++;
          return {ok: true, added, disciplines: subjects.length, students: students.length};
        })
      );
    })
  );
  app.delete(
    '/api/admin/enrollments/:id',
    middle,
    wrap((req, res) => {
      const eid = D.id(req.params.id),
        e = db.prepare('SELECT * FROM academic_enrollments WHERE id=?').get(eid);
      if (!e) D.fail(404, 'Matr\u00edcula n\u00e3o encontrada.');
      res.json(
        write(req, 'ADMIN_DESVINCULAR_ALUNO', () => {
          db.prepare('UPDATE academic_enrollments SET active=0 WHERE id=?').run(eid);
          db.prepare(
            'UPDATE assessments SET revision=revision+1 WHERE assignment_id IN(SELECT id FROM teaching_assignments WHERE discipline_id=? AND year=? AND semester=? AND class_name=?)'
          ).run(e.discipline_id, e.year, e.semester, e.class_name);
          return {ok: true, id: eid, preserved: true};
        })
      );
    })
  );
  app.get('/api/admin/students', middle, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT s.id,s.name,s.matricula,s.period,u.id user_id,COALESCE(u.active,0) has_active_login FROM students s LEFT JOIN users u ON u.student_id=s.id AND u.role='ALUNO' WHERE NOT EXISTS(SELECT 1 FROM users other WHERE other.student_id=s.id AND other.role<>'ALUNO') ORDER BY s.name"
        )
        .all()
    )
  );
  app.get('/api/admin/assessments', middle, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT a.*,u.name professor_name,(SELECT count(*) FROM scores s WHERE s.assessment_id=a.id) students,(SELECT count(*) FROM published_scores p WHERE p.assessment_id=a.id AND p.sent=1) published_students FROM assessments a JOIN users u ON u.id=a.professor_id WHERE a.type IN ('A1','A2','A3') ORDER BY a.year DESC,a.id DESC"
        )
        .all()
    )
  );
  app.post(
    '/api/admin/assessments/:id/lock',
    middle,
    wrap((req, res) => {
      const aid = D.id(req.params.id),
        locked = active(req.body.locked);
      if (!db.prepare('SELECT id FROM assessments WHERE id=?').get(aid))
        D.fail(404, 'Avalia\u00e7\u00e3o n\u00e3o encontrada.');
      res.json(
        write(req, 'ADMIN_BLOQUEIO_AVALIACAO', () => {
          db.prepare('UPDATE assessments SET locked=? WHERE id=?').run(locked, aid);
          return {ok: true, id: aid, assessment_id: aid, locked};
        })
      );
    })
  );
  app.get('/api/admin/controls', middle, (req, res) =>
    res.json(db.prepare('SELECT key,value FROM system_controls').all())
  );
  app.put(
    '/api/admin/controls',
    middle,
    wrap((req, res) => {
      const {key, value} = req.body;
      if (!['pause_scores', 'pause_publication'].includes(key)) D.fail(400, 'Controle inv\u00e1lido.');
      const val = active(value);
      res.json(
        write(req, 'ADMIN_CONTROLE_OPERACIONAL', () => {
          db.prepare('UPDATE system_controls SET value=? WHERE key=?').run(val, key);
          return {ok: true, key, value: val};
        })
      );
    })
  );
  app.get('/api/admin/audit', middle, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT l.id,l.created_at,l.action,l.details,l.actor_id,l.origin,u.name actor_name FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 200'
        )
        .all()
    )
  );
  app.get(
    '/api/admin/assessments/:id/history',
    middle,
    wrap((req, res) => {
      const aid = D.id(req.params.id),
        a = db
          .prepare(
            'SELECT a.id,a.type,a.year,a.semester,a.period,a.discipline,a.class_name,u.name professor_name FROM assessments a JOIN users u ON u.id=a.professor_id WHERE a.id=?'
          )
          .get(aid);
      if (!a) D.fail(404, 'Avalia\u00e7\u00e3o n\u00e3o encontrada.');
      res.json({assessment: a, ...H.assessmentHistory(db, aid)});
    })
  );
  app.get('/api/admin/health', middle, (req, res) =>
    res.json({
      ok: true,
      sqlite: db
        .prepare('PRAGMA quick_check')
        .all()
        .every(r => Object.values(r)[0] === 'ok'),
      foreignKeyProblems: db.prepare('PRAGMA foreign_key_check').all().length,
      uptimeSeconds: Math.round(process.uptime()),
      version: require('../../../../../package.json').version
    })
  );
};
