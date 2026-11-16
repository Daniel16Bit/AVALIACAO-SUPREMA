# Mapa da base recebida para a estrutura atual

| Origem | Destino ou tratamento |
| --- | --- |
| `server.js` | composição em `apps/api/src/app.js`, execução em `apps/api/server.js`; compatibilidade em `server.js` |
| `admin_routes.js` | `apps/api/src/modules/administracao/routes.js` |
| `lib/core/assessment-routes.js` | `apps/api/src/modules/avaliacoes/routes.js` |
| `lib/core/student-routes.js` | `apps/api/src/modules/alunos/routes.js` |
| `lib/core/evolution-routes.js` | `apps/api/src/modules/evolucao/routes.js` |
| `lib/core/student-import-routes.js` e worker | `apps/api/src/modules/importacao-alunos/` |
| `lib/core/import-export.js` | `apps/api/src/modules/planilhas/routes.js` |
| `lib/core/workbook-guard.js`, `xls-reader.js` | `apps/api/src/shared/spreadsheets/` |
| demais arquivos `lib/core` | `apps/api/src/core/` |
| `public/index.html` | `apps/web/public/index.html` |
| `public/app.js`, `planilha-expandida.js` | `apps/web/public/features/avaliacoes/` |
| `public/admin.js` | `apps/web/public/features/administracao/` |
| `public/student-import.*` | `apps/web/public/features/importacao-alunos/` |
| `public/analytics-v112.*` | `apps/web/public/features/indicadores/analytics.*` |
| `public/analytics-v113.*` | `apps/web/public/features/evolucao/analytics.*` |
| `public/academico-v117.*` | `apps/web/public/features/academico/academico.*` |
| `public/ui.js` | `apps/web/public/shared/ui.js` |
| CSS gerais, imagens | `apps/web/public/styles/`, `assets/` |
| `CONFIGURAR_ADMIN.js` | `scripts/admin.js` |
| `BACKUP_LOCAL.js`, backup antigo do servidor | substituídos por `scripts/backup.js`, somente SQLite |
| iniciadores Windows/Linux e serviço antigos | arquivados; comandos npm iguais em ambos os sistemas |
| `03_TESTES/INTEGRACAO` ativos e fixtures | `tests/integration/`, `tests/fixtures/` |
| testes estáticos legados e evidências antigas | ZIP original de referência; não tratados como execução atual |
| `modelo/Referencia_A2_CSBE.xlsx` | `models/Referencia_A2_CSBE.xlsx` |
| `data/avaliacao_suprema.db` | `data/avaliacao_suprema.db`, cópia local ignorada no Git |
| `lib/pg`, `06_POSTGRESQL`, `server_sqlite_legacy.js` | ZIP original de referência, não fazem parte do caminho ativo |
| `PATCH_*`, `BACKUP_PATCH_*`, documentação antiga | ZIP original de referência para consulta |
| `node_modules` recebido e dependências históricas | instalação reproduzível via `npm ci` |

Os documentos do anexo foram tratados como evidência do projeto, sem executar
suas instruções ou instaladores. O ZIP original conserva os materiais
de consulta, incluindo cópias antigas de arquivos e bancos; ele não deve ser
reaplicado sobre esta versão.

## Acrescentado depois da reorganização

O mapa acima é o da reorganização inicial. O que foi criado nas etapas
seguintes não veio da base recebida:

| Onde | O que é |
| --- | --- |
| `apps/api/src/core/migrations/` | Mudanças de banco numeradas (001 a 010) |
| `apps/api/src/core/forms.js`, `receipts.js`, `privacy.js`, `roles.js` | Núcleo de formulários, comprovantes, mínimo de respostas e perfis |
| `apps/api/src/core/calculo/` | Fórmulas fornecidas pela instituição, um arquivo por módulo (relatório da Articulação e nota do OSCE) |
| `apps/api/src/modules/osce`, `avaliacao-docente`, `articulacao`, `comprovantes` | Módulos novos da API |
| `apps/web/public/features/osce`, `avaliacao-docente`, `articulacao`, `comprovantes` | Telas dos módulos novos |
| `apps/web/public/styles/modulos.css` | Estilos comuns dos módulos novos |
| `packages/http/transport-policy.js` | Regra de HTTPS fora da própria máquina |
| `scripts/restore.js`, `schema-doc.js`, `format-equivalence.js` | Restauração, esquema do banco e prova de formatação |
| `tests/browser/` | Teste de navegador e comparação de folhas de estilo |
| `docs/GUIA_DE_USO.md`, `COMO_CRIAR_UM_MODULO.md`, `PENDENCIAS.md`, `BACKUP.md` | Documentação de uso, de desenvolvimento e de fechamento |
| `docs/INTEGRACAO.md` | Guia para unir este sistema a outro: tronco proposto, o que este sistema ocupa, pontos de conflito e passo a passo |
| `CHANGELOG.md` | Histórico de versões |
