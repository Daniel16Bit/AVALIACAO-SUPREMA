'use strict';

// The spreadsheet and student import routes are more specific than their parents.
// Lazy loading prevents a syntax/dependency error in a feature from stopping others.
module.exports = [
  {
    id: 'importacao-alunos',
    owns: /^\/api\/admin\/student-import(?:\/|$)/,
    load: () => require('./importacao-alunos/routes')
  },
  {
    id: 'planilhas',
    owns: /^\/api\/assessment\/[^/]+\/(?:import|export)(?:\/|$)/,
    load: () => require('./planilhas/routes')
  },
  {id: 'administracao', owns: /^\/api\/admin(?:\/|$)/, load: () => require('./administracao/routes')},
  {id: 'avaliacoes', owns: /^\/api\/(?:assessment|assessments)(?:\/|$)/, load: () => require('./avaliacoes/routes')},
  {id: 'evolucao', owns: /^\/api\/evolution(?:\/|$)/, load: () => require('./evolucao/routes')},
  {id: 'alunos', owns: /^\/api\/student(?:\/|$)/, load: () => require('./alunos/routes')},
  {id: 'osce', owns: /^\/api\/osce(?:\/|$)/, load: () => require('./osce/routes')},
  {id: 'avaliacao-docente', owns: /^\/api\/teacher-eval(?:\/|$)/, load: () => require('./avaliacao-docente/routes')},
  {id: 'comprovantes', owns: /^\/api\/receipts(?:\/|$)/, load: () => require('./comprovantes/routes')},
  {id: 'articulacao', owns: /^\/api\/articulation(?:\/|$)/, load: () => require('./articulacao/routes')}
];
