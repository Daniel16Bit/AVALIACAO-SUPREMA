'use strict';
// Receipts of student actions.
//  - The student lists and downloads his or her own receipts.
//  - The administrator and the CSTI verify a code and search receipts.
//  - Teachers and the coordination have no access: a receipt shows who took part in an
//    evaluation, and for anonymous evaluations that is not theirs to know.
// Receipts are issued by the modules that record the action (core/receipts.js), never here.
const D = require('../../core/domain');
const Receipts = require('../../core/receipts');

module.exports = function installReceiptRoutes({app, db, auth, can, hasPermission}) {
  const verify = [auth, can('receipts.verify')];
  const wrap = fn => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };
  const shape = (receipt, withStudent) => ({
    code: receipt.code,
    kind: receipt.kind,
    title: receipt.title,
    detail: receipt.detail,
    issued_at: receipt.issued_at,
    ...(withStudent ? {student_name: receipt.student_name, student_matricula: receipt.student_matricula} : {})
  });

  app.get(
    '/api/receipts/mine',
    auth,
    can('receipts.own'),
    wrap((req, res) => {
      if (!req.user.studentId) D.fail(403, 'Conta de aluno sem cadastro acadêmico. Procure o administrador.');
      res.json(Receipts.listForStudent(db, req.user.studentId).map(receipt => shape(receipt, false)));
    })
  );

  // The owner, or whoever may verify. Any other case answers exactly like a code that does not exist.
  app.get(
    '/api/receipts/:code/pdf',
    auth,
    wrap((req, res) => {
      const receipt = Receipts.findByCode(db, Receipts.normalizeCode(req.params.code));
      const owner =
        !!receipt && hasPermission(req.user.role, 'receipts.own') && receipt.student_id === req.user.studentId;
      if (!receipt || !(owner || hasPermission(req.user.role, 'receipts.verify')))
        D.fail(404, 'Comprovante não encontrado.');
      const file = Receipts.pdf(receipt);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="comprovante-${receipt.code}.pdf"`);
      res.setHeader('Content-Length', file.length);
      res.end(file);
    })
  );

  // The code travels in the body, not in the address. The answer is the system's own record:
  // a file that was edited, or a code that was made up, simply does not match anything.
  app.post(
    '/api/receipts/verify',
    verify,
    wrap((req, res) => {
      const code = Receipts.normalizeCode(req.body?.code),
        receipt = Receipts.findByCode(db, code);
      D.audit(db, req.user, 'COMPROVANTE_VERIFICAR', {valid: !!receipt});
      res.json(receipt ? {valid: true, receipt: shape(receipt, true)} : {valid: false});
    })
  );

  app.post(
    '/api/receipts/search',
    verify,
    wrap((req, res) => {
      res.json(
        Receipts.listAll(db, {search: D.text(String(req.body?.search ?? ''), 80), limit: 200}).map(receipt =>
          shape(receipt, true)
        )
      );
    })
  );
};
