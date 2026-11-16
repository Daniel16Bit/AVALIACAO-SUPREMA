# HANDOFF — Avaliação Suprema

Transferência de contexto para uma nova sessão do Claude Code. Escrito em 12/11/2026, ao fim da etapa 2, e atualizado ao fim de cada etapa seguinte; a última atualização é de 16/11/2026, depois da nota do OSCE e da planilha final da Articulação, já mescladas na `main`, e do guia de integração com o outro sistema, também já mesclado.

Legenda usada abaixo:
- **[confirmado]**: verificado no repositório, no disco ou por execução nesta sessão.
- **[pendente]**: decidido que será feito, ainda não feito.
- **[hipótese]**: suposição ou padrão provisório, sem confirmação do usuário ou da instituição.

Idioma: o usuário escreve em português do Brasil. Responda sempre em português do Brasil.

Resumo curto para qualquer outra IA: `CONTEXTO_IA.md`, na raiz do repositório. Mantenha os dois arquivos coerentes.

---

## 1. Contexto do projeto

**Objetivo.** Evoluir o sistema acadêmico de notas **Avaliação Suprema** (versão de origem 11.9.0) seguindo o prompt mestre: auditar antes, **evoluir a base existente sem reconstruir**, preservar identidade visual e funcionalidades, segurança em primeiro lugar, **nunca inventar fórmulas institucionais**, trabalhar em etapas incrementais e reportar ao fim de cada uma.

**Pastas.** [confirmado]

```
C:\Users\leina\OneDrive\Documentos\AVALIACAO_SUPREMA\
├── referencias\            especificação, prompt mestre, transcrições (seção 5)
├── backup\Projeto-Suprema-main.zip   base original recebida (intocada)
├── auditoria\AUDITORIA_TECNICA.md    relatório da auditoria + resultado de cada etapa
└── projeto\Projeto-Suprema-main\     repositório Git do sistema (este arquivo está aqui)
```

A pasta está dentro do OneDrive. Até agora isso não causou erro de arquivo bloqueado.

**Arquitetura.** [confirmado]
- Node.js, Express 5, banco SQLite via `node:sqlite` (`DatabaseSync`, síncrono), `exceljs` para planilhas. JavaScript puro, sem TypeScript, sem framework de frontend e sem etapa de build. Gráficos em SVG/CSS desenhados à mão.
- Dois processos:
  - `apps/web/server.js` (porta 3002): arquivos estáticos e proxy de `/api`.
  - `apps/api/server.js` (porta 3003): API.
  - `scripts/start.js` sobe os dois (`npm start`).
- Módulos da API isolados em `apps/api/src/modules/` (`administracao`, `alunos`, `avaliacoes`, `evolucao`, `importacao-alunos`, `planilhas`), registrados em `apps/api/src/modules/index.js`; cada um é um `Router` próprio.
- Núcleo em `apps/api/src/core/`: `database.js`, `domain.js` (fórmula), `security.js`, `roles.js`, `migrations/`, `grade-history.js`, `account-creation.js`, `user-management.js`.
- Frontend SPA em `apps/web/public/` (`index.html`, `features/*`, `shared/ui.js`).
- Pacotes compartilhados em `packages/` (`http/client-address.js`, `http/security-headers.js`, `http/transport-policy.js`, `contracts/`).

**Fórmula acadêmica (não alterar).** [confirmado] `calcScore` em `apps/api/src/core/domain.js`:
- nota_prova = c1..c6 + me1..me4;
- OSCE = soma das estações ou valor direto;
- nota_final aditiva;
- q10 excluída;
- duas casas decimais;
- sem limite de 0 a 10.

**Rascunho × publicado.** [confirmado] As notas em rascunho ficam em `scores` e as publicadas em `published_scores`. A concorrência é otimista por `revision` (HTTP 409), com trava e destrava da avaliação.

**Situação atual.** [confirmado] **As etapas 0 a 8 estão concluídas e mescladas na `main`. O plano de 9 etapas terminou;** o que resta depende do usuário e está em `docs/PENDENCIAS.md`. Em 16/11/2026 o relatório da Articulação foi implementado e mesclado (seção 2). No mesmo dia, a nota do OSCE e a planilha final da Articulação foram implementadas e mescladas (seção 2). Versão do sistema: 12.2.0.

---

## 2. Histórico de execução

### Decisões do usuário [confirmado]

| Tema | Decisão |
| --- | --- |
| Base de código | `Projeto-Suprema-main.zip` é a base principal. |
| Reconstruir ou evoluir | "Faça o que achar mais proveitoso" → optou-se por **evoluir**. |
| Banco de dados | "Está em evolução" → manter SQLite, preparar para PostgreSQL, **não migrar** sem autorização. |
| Fórmulas ausentes | Entregar só o necessário; o que depender de fórmula fica para depois. |
| Avaliação Docente | **Anônima** (decidido em 11/11/2026). |
| Plano | Plano de 9 etapas (0 a 8) validado ("Validar e começar"). |
| Node.js | O próprio usuário instalou. |
| Mesclagens | Etapas 1 a 8 mescladas na `main` a pedido explícito ("Mesclar na main"). |
| Etapa 3 | Autorizada com "Autorizo, comece", aceitando os padrões provisórios listados na etapa 3 abaixo e os commits na branch da etapa. |
| Etapa 4 | Autorizada com "Começar etapa 4", aceitando os padrões provisórios oferecidos: nota em escala só onde o máximo for 10; mínimo de 5 alunos para agregados; "canto superior direito" fora até haver referência visual. |
| Etapa 5 | O desenho foi apresentado antes de codificar e autorizado com "Autorizo, comece", com sete padrões provisórios (C24 a C29 da auditoria e comentário opcional por pergunta). |
| Etapa 6 | O desenho, com o limite do anonimato, foi apresentado antes de codificar e autorizado com "Autorizo, comece", com sete padrões provisórios (C30 a C35 da auditoria, mais C7). |
| Etapa 7 | Em 15/11/2026 o usuário enviou 18 capturas do formulário da Articulação (Google Forms) e uma planilha de respostas de exemplo, e pediu **comprovante em PDF com código de verificação para tudo o que o aluno fizer**. Ordem dada: "Faça comprovantes e Articulação antes da etapa 8. Nessa ordem." |
| Articulação | Nome da avaliação **livre**; períodos, tutores e estações em quantidade livre, com **lista padrão que pode ser salva**; estrutura de perguntas confirmada; **fórmula deixada em aberto** ("deixe em aberto para eu adicionar depois"). |
| Comprovantes | Provam a participação, nunca o conteúdo. Vistos pelo aluno, pelo **Administrador e pelo CSTI** ("nós do CSTI somos os administradores"); Coordenação e professores não. **Download em PDF; e-mail fica para o futuro.** |
| Lista final | O usuário pediu uma lista de tudo o que depende dele, para enviar **quando todas as etapas terminarem**: é o `docs/PENDENCIAS.md`. |
| Etapa 8 | O plano foi apresentado e autorizado com "Autorizo, comece", com quatro padrões aceitos: Prettier como dependência de desenvolvimento e exigido no `npm test`; remover o botão "Consultoria Acadêmica"; versão 12.0.0 com `CHANGELOG.md`; guia de uso por perfil. |

### Etapa 0 — Ambiente (11/11/2026) [confirmado]
- Instalado o Node.js 26.13.1 e o npm 11.20.0. O projeto exige no mínimo 22.16; a CI usa 24.
- `git init` com commit `7d973a5`, a base original sem alterações.
- `npm ci` sem erro.
- Na base original, 191 de 192 verificações passaram. A falha era um defeito do teste de isolamento no Windows: a pasta temporária era apagada antes de encerrar o processo filho, o que dava EPERM e travava a execução.

### Etapa 1 — Segurança de login e senhas (S1, S2, S8) [confirmado]
- **Endereço real do cliente pelo proxy.** `packages/http/client-address.js`. O cabeçalho `X-Forwarded-For` só é aceito quando vem de um proxy confiável:
  - `SUPREMA_WEB_TRUSTED_PROXIES` (padrão: nenhum);
  - `SUPREMA_API_TRUSTED_PROXIES` (padrão: `loopback`).
- **Limite de tentativas.** 6 erros por (endereço + login) e 80 por endereço, em janela de 5 minutos.
- **Tempo de resposta.** Login inexistente passa por um hash falso, com custo equivalente ao de uma conta real.
- **Troca de senha.**
  - Rota `POST /api/me/password` e botão "Alterar senha" nos três perfis.
  - Troca obrigatória no primeiro acesso (`users.must_change_password`; a API responde 403 `PASSWORD_CHANGE_REQUIRED`).
- **Importação de alunos.** Senha provisória individual por aluno, entregue uma única vez num CSV e nunca gravada no banco (fica em memória por até 20 minutos). A senha única do lote deixou de ser aceita.
- **Teste de isolamento no Windows** corrigido.
- Branch `feature/etapa1-seguranca-login`, commits `230dbda` e `474eecb`, mesclagem `28ef013`.

### Etapa 2 — Fundações (A4, S4, S6, S3) [confirmado]
- **Migrações versionadas** em `apps/api/src/core/migrations/`, com ids `NNN-nome`:
  - aplicadas uma vez, dentro da transação de abertura;
  - cópia automática `VACUUM INTO` em `data/pre-migracao/` antes de migrar um banco com dados;
  - banco com migração mais nova que o código é recusado.
  - Existentes: `001-sessions`, `002-permissions`, `003-grade-history`.
  - A base legada idempotente continua rodando em toda inicialização.
- **Sessões no banco** (tabela `sessions`), guardando só o hash SHA-256 do token, com `ON DELETE CASCADE`.
- **Perfis.**
  - `core/roles.js`: ADMIN, PROFESSOR, ALUNO, COORDENACAO, NUCLEO_AVALIACAO, CSTI, OPERACIONAL.
  - A autorização passou a usar a tabela `role_permissions` (`security.can()`, `hasPermission`).
  - Permissões iniciais: `admin.manage`, `evolution.all` (ADMIN); `assessment.own`, `evolution.own` (PROFESSOR); `results.own` (ALUNO). Os perfis novos **não têm nenhuma permissão**.
- **Histórico de notas.**
  - `score_changes` (célula a célula) e `publication_snapshots` (cada versão publicada).
  - Gatilhos impedem UPDATE e DELETE nessas tabelas.
  - `audit_logs` ganhou as colunas `actor_id`, `origin` e `assessment_id`.
  - Novas rotas `GET /api/assessment/:id/score-history` e `GET /api/admin/assessments/:id/history`.
- **Telas.**
  - Histórico de notas para professor e administrador.
  - Auditoria com colunas Quem e Origem.
  - Cadastro de usuários com os perfis novos.
  - Tela neutra (`#profileScreen`) para perfil ainda sem módulo.
- Branch `feature/etapa2-fundacoes`: commits `11fff5e`, `1c4b103`, `0634a73`, `6611be4`, `877f148`; mesclagem `d7f7f55`.

### Etapa 3 — Operação (S5, S10, S11, A10) [confirmado]
- **HTTPS obrigatório fora da máquina.** `packages/http/transport-policy.js`, conferido por `apps/web/server.js` e `apps/api/server.js` antes de abrir a porta:
  - a interface recusa `HOST` não local sem TLS (`SUPREMA_TLS_KEY`/`SUPREMA_TLS_CERT`) ou sem `SUPREMA_BEHIND_HTTPS_PROXY=1`;
  - `SUPREMA_BEHIND_HTTPS_PROXY=1` exige `SUPREMA_WEB_TRUSTED_PROXIES` preenchida;
  - a API recusa `API_HOST` não local sem `SUPREMA_API_PRIVATE_NETWORK=1`, e faz isso antes de abrir o banco;
  - com TLS ou proxy declarado, HSTS (`max-age=31536000`, sem `includeSubDomains`) e cookie `Secure`.
- **Backup e restauração.**
  - `scripts/backup.js`: `backup.json` em cada pasta (data, tamanho, SHA-256, versão do banco), numeração sempre acima do maior número existente, retenção por `SUPREMA_BACKUP_KEEP` (padrão 30; `0` não apaga).
  - `scripts/restore.js` (`npm run restore -- <pasta|arquivo|--ultimo> [--confirmar]`): sem `--confirmar` só verifica; confere hash e integridade, recusa backup de versão mais nova e recusa com a API respondendo; guarda o banco substituído em `data/pre-restauracao/`.
  - Roteiro e agendamento (Agendador de Tarefas, cron) em `docs/BACKUP.md`. Nenhum agendamento foi criado.
- **Lint.** ESLint 9 (`eslint.config.js`), só regras de erro real, dentro do `npm test`. 0 erros; 8 avisos de variável sem uso em arquivos antigos, com teto em `npm run lint` (`--max-warnings 8`). O ESLint 10 foi evitado: traz `minimatch` com aviso moderado.
- **Dependências.** `overrides` no `package.json` fixa o `uuid` do `exceljs` em `^11.1.1`; `npm audit` sem avisos. Para aplicar um override sobre um lockfile existente foi preciso `npm update uuid`; `npm install` sozinho não troca.
- **CI.** `.github/workflows/ci.yml`: `npm audit --audit-level=high` (bloqueia), `npm audit` completo (não bloqueia), `npm test`, e um job `navegador` com Python 3.13 e Playwright. Ações fixadas por hash de commit.
- **Teste de navegador.** `tests/browser/smoke.py` estava quebrado desde a etapa 1 (troca de senha no primeiro acesso); corrigido e executado: 9 verificações.
- Padrões **provisórios** [hipótese até a instituição confirmar]: nomes das variáveis novas, HSTS de um ano, retenção de 30 cópias, bloqueio da CI a partir de `high`.
- Branch `feature/etapa3-operacao`: commits `e4ee707` (HTTPS), `8e70381` (backup), `ba9f011` (lint, dependências, CI), `5d6036b` (documentação) e a atualização final deste arquivo. A mesclagem é o commit "Etapa 3: operacao", no topo da `main`.

### Etapa 4 — Melhorias do módulo principal (S7, S9, reunião de 06/11) [confirmado]
- **Importação de notas só por matrícula (S7).** `modules/planilhas/routes.js`: planilha sem coluna Matrícula é recusada; linha com nota e sem matrícula bloqueia tudo; o casamento pelo nome foi removido.
- **Turmas pequenas (S9).** `core/privacy.js` e `modules/alunos/routes.js`: com menos de `SUPREMA_MIN_AGGREGATE_STUDENTS` (padrão 5) resultados publicados, a rota do aluno devolve `classFigures: {available:false, minimum}` e todos os números da turma nulos. Lido a cada requisição; valor inválido volta ao padrão.
- **Valor máximo dos instrumentos.**
  - Migração `004-instrument-config` (tabela `assessment_instrument_config`; linha só existe com máximo declarado).
  - `core/domain.js`: `instrumentKeys` (`pbl1`, `pbl2`, `osce1`..`osce4`, `osce`, `q7`..`q9`, `trabalho`), `instrumentConfig`, e `aggregate(rows, qcfg, icfg)` passa a devolver `instrumentStats`. **`calcScore` não foi tocado.**
  - Máximo do total do OSCE = soma dos máximos das estações em uso; nulo se alguma estação em uso não tiver máximo. `osce` direto (sem estações) tem máximo próprio.
  - Rota `PUT /api/assessment/:id/instrument-config`. Opcional: só bloqueia publicação e importação quando há nota acima de um máximo declarado.
  - `publicationMetadata` só inclui `instrumentConfig` quando há algum máximo, para não marcar publicações antigas como alteradas.
- **Telas do professor.** Cabeçalhos de instrumento clicáveis (`.editable-th` e `.instrument-th`, função `editInstrument` em `app.js`); "Média por instrumento" com percentual e marca de 60%; teia por modalidade (`SupremaUI.modalities` em `shared/ui.js`, usada em `indicadores/analytics.js`); destaque "↓" para nota abaixo da média da turma (`markBelowAverage`).
- **Painel do aluno.** `renderStudentResult` em `app.js` foi reescrito em formato legível; `academico.js` ganhou barra "Total", nome da disciplina e linha de 60% no gráfico de barras, botão "Ver gráficos", "Onde estou" e modo "Por modalidade" na teia. Rótulos: "Aluno/turma", "Minha nota", "Nota da Avaliação", "Minhas notas".
- **C5.** "Ponto de corte" e "atendimento recomendado" saíram das telas; 60% é descrito como referência visual.
- **Ficaram de fora, por decisão pendente:** colunas dinâmicas de múltipla escolha, link do gabarito, aba total da articulação, ponto de corte com ativo/inativo por questão, "canto superior direito".
- Padrões **provisórios** [hipótese até a instituição confirmar]: C19 a C23 (seção 7).
- Branch `feature/etapa4-modulo-principal`: commits `4e4d7f1` (S7), `7c6d4e5` (S9), `e1a3d0e` (valor máximo), `8d8b4f8` (gráficos e destaque), `22178e0` (painel do aluno), `96963f1` (documentação) e a atualização final deste arquivo. A mesclagem é o commit "Etapa 4: melhorias do modulo principal", no topo da `main`.

### Etapa 5 — Núcleo de formulários + OSCE [confirmado]
- **Núcleo de formulários.** Migração `005-forms` (`forms`, `form_questions`, `form_submissions`, `form_answers`) e `core/forms.js`. Não conhece nenhum módulo. Gatilhos: respostas não aceitam UPDATE nem DELETE; envio não aceita DELETE e só aceita a anulação, uma vez. Índice único parcial recusa segundo envio válido para o mesmo aluno no mesmo formulário. `subject_student_id` e `submitted_by` são opcionais, para os módulos anônimos usarem as mesmas tabelas.
- **OSCE — servidor.** Migração `006-osce` (`osce_events`, `osce_stations`, `osce_event_students`) e módulo `modules/osce/` (`routes.js` com as regras, `store.js` com todo o SQL). Evento único por ano, semestre, rodada e período. Situações `RASCUNHO` → `LIBERADO` → `ENCERRADO`.
  - O rascunho é gravado inteiro (`PUT /api/osce/events/:id`), com `revision`; as estações são recriadas a cada gravação.
  - Liberado trava a estrutura. Liberado volta a rascunho só sem nenhuma resposta. Encerrado reabre para liberado.
  - Pergunta-chave: `key_question` e `key_question_text` no evento; o servidor a grava como primeira pergunta de cada estação. Na etapa 5 não tinha efeito em cálculo; **desde 16/11/2026 é o item de postura da planilha: reduz os acertos da estação pela metade** (ver "Nota do OSCE e planilha final da Articulação").
  - Na etapa 5 nenhuma nota era calculada (`consolidated: {available:false}`). **Desde 16/11/2026 a nota é calculada** pela planilha da instituição.
- **Permissões** (migração 006): `osce.manage` e `osce.results` para NUCLEO_AVALIACAO; `osce.respond` para OPERACIONAL. ADMIN, PROFESSOR, ALUNO, COORDENACAO e CSTI não alcançam nenhuma rota do OSCE.
- **Telas.** `features/osce/osce.js` e `osce.css`. O módulo registra-se em `window.SupremaModules[perfil]` e desenha em `#profileContent`, com `#profileNav`; `app.js` restaura a tela neutra a cada entrada e chama `boot` do módulo do perfil. Esse é o ponto de extensão para os próximos módulos.
- **Testes de perfis da etapa 2 atualizados:** passaram a exigir exatamente as permissões do OSCE para os dois perfis e nenhuma para COORDENACAO e CSTI.
- **Teste de navegador** (`smoke.py`) ganhou os fluxos do Núcleo e da conta operacional: 11 verificações.
- Padrões **provisórios**: C24 a C29, além de C2, C3 e C14 (seção 7).
- Branch `feature/etapa5-formularios-osce`: commits `5a228fc` (núcleo), `165ef6a` (API do OSCE), `6b58346` (telas), `dccf8d5` (documentação) e a atualização final deste arquivo. A mesclagem é o commit "Etapa 5: nucleo de formularios e OSCE", no topo da `main`.

### Etapa 6 — Avaliação Docente anônima [confirmado]
- **Caminho anônimo do núcleo.** Migração `007-anonymous-forms` (`anon_participation`, `anon_submissions`, `anon_answers`) e funções novas em `core/forms.js` (`submitAnonymous`, `anonymousResults`, `participationCount`, `participatedSubjects`, `hasParticipated`).
  - Participação e respostas não têm coluna em comum além de `form_id` e `subject_key` (o que foi avaliado; o módulo escolhe, aqui `target:<id>`).
  - As três tabelas são `WITHOUT ROWID`; o identificador da resposta é aleatório; só a data é gravada; gatilhos recusam UPDATE e DELETE.
  - `anonymousResults` embaralha os comentários de cada pergunta a cada leitura.
  - **Não use `submit` (identificado) para módulos anônimos.**
- **Módulo `modules/avaliacao-docente/`** (`routes.js`, `store.js`), rotas `/api/teacher-eval/...`, migração `008-teacher-eval` (`teacher_eval_campaigns`, `teacher_eval_targets`).
  - Uma avaliação por ano, semestre, rodada (nome livre) e período, com um formulário só (tipo `SIM_NAO_NA`) para todos os professores.
  - Alvo = um vínculo de docência do período. Quem responde = aluno com matrícula ativa naquela oferta.
  - `RASCUNHO` → `LIBERADO` → `ENCERRADO`. **Encerrar é definitivo**; liberado só volta a rascunho sem nenhuma participação.
  - Resultado só com a avaliação encerrada e `responses >= min_responses` (padrão 5, piso 3). Abaixo disso: `sufficient:false`, sem números e sem comentários.
  - O total geral de uma avaliação soma só os alvos suficientes, para que um grupo pequeno não seja recuperado por subtração.
  - A auditoria de resposta (`DOCENTE_RESPONDER`) guarda só `campaign_id` e o autor: nem o professor nem o conteúdo.
- **Permissões** (migração 008): `teacher_eval.manage` (CSTI), `teacher_eval.answer` (ALUNO), `teacher_eval.own` (PROFESSOR), `teacher_eval.all` (COORDENACAO).
- **Telas.** `features/avaliacao-docente/docente.js` e `docente.css`, para os quatro perfis.
- **Pontos de extensão novos em `app.js`:** `window.SupremaViews[nome]` para os itens `.nav-item.dev` do menu do professor (desenha em `#moduleView`), e `window.SupremaModules.ALUNO.boot` para a tela do aluno (`#studentModuleNav` e `#studentModuleView`).
- **Partes comuns dos módulos:** `SupremaUI.toast`, `guard`, `panel` e `table` em `shared/ui.js`; estilos em `styles/modulos.css`, sob a classe `.mod-root`. O OSCE passou a usar os dois.
- **Limite do anonimato [confirmado, risco residual]:** comparar duas cópias do banco de momentos diferentes mostra quais participações e respostas surgiram no intervalo. Documentado em `docs/ARQUITETURA.md` e na auditoria.
- Padrões **provisórios**: C30 a C35, C7 e C17 (seção 7).
- Branch `feature/etapa6-avaliacao-docente`: commits `fa54fad` (caminho anônimo), `708bc13` (API), `c52bf63` (telas), `f3a27fd` (documentação) e a atualização final deste arquivo. A mesclagem é o commit "Etapa 6: avaliacao docente anonima", no topo da `main`.

### Etapa 7 — Comprovantes e Articulação Interdisciplinar [confirmado]
- **Comprovantes.** Migração `009-receipts` (tabela `receipts`, sem UPDATE nem DELETE) e `core/receipts.js` (`issue`, `findByCode`, `listForStudent`, `listAll`, `normalizeCode`, `newCode`, `pdf`).
  - Código `AS-XXXX-XXXX-XXXX-XXXX` (base 32 de Crockford, 80 bits). PDF 1.4 de uma página montado à mão, sem biblioteca.
  - `Receipts.issue` é chamado **dentro da transação da ação**; o registro guarda quem, o quê e quando, nunca o conteúdo.
  - Módulo `modules/comprovantes/routes.js`, rotas `/api/receipts/...`. Permissões `receipts.own` (ALUNO) e `receipts.verify` (ADMIN e CSTI).
  - A Avaliação Docente passou a emitir comprovante a cada resposta (`kind: 'AVALIACAO_DOCENTE'`).
- **Articulação.** Migração `010-articulation` (`articulation_forms`, `_options`, `_default_options`, `_questions`, `_responses`, `_answers`) e módulo `modules/articulacao/` (`routes.js`, `store.js`), rotas `/api/articulation/...`.
  - **Não usa `core/forms.js`**: os tipos de resposta (nota de 0 a 10, Sim/Não/Parcialmente, escolha em lista) não cabem nas tabelas do núcleo, que já guardam respostas (C42).
  - Formulário com título livre, perguntas editáveis (o modelo com as 17 perguntas do formulário real está em `store.js`, `TEMPLATE`) e três listas: `PERIODO`, `TUTOR`, `ESTACAO`. Lista padrão em `articulation_default_options`.
  - `RASCUNHO` → `LIBERADO` → `FINALIZADO` → `RESULTADOS_LIBERADOS`; `reopen` volta uma etapa; voltar a rascunho só sem respostas.
  - Respostas **identificadas**, uma por aluno, imutáveis; cada envio emite comprovante (`kind: 'ARTICULACAO'`).
  - Resultados brutos (contagens, distribuição das notas, escolhas, justificativas), gerais e por tutor. **Nenhum percentual de desempenho**: `performance.available` é falso.
  - Exportação `.xlsx` com as colunas da planilha de respostas da instituição.
  - O tutor (`/mine`) só recebe números com pelo menos `SUPREMA_MIN_AGGREGATE_STUDENTS` respostas (padrão 5), e sem nomes.
  - Permissões: `articulation.manage` (CSTI), `articulation.answer` (ALUNO), `articulation.results` (COORDENACAO), `articulation.own` (PROFESSOR).
- **Telas.** `features/comprovantes/comprovantes.js` e `features/articulacao/articulacao.js`, com os respectivos `.css`.
- **Ponto de extensão generalizado:** `window.SupremaModules = {items, add(perfil, item), of(perfil)}` em `shared/ui.js`. Um perfil recebe itens de vários módulos; o Administrador também (`#adminModuleView`). OSCE e Avaliação Docente foram convertidos.
- **`docs/PENDENCIAS.md`** é a lista do que depende do usuário ou da instituição; mantenha atualizada.
- **Dados reais:** as capturas e a planilha de exemplo têm nomes de tutores e de alunos. Nada disso foi copiado para código, testes ou documentação. O modelo de perguntas contém só o texto das perguntas.
- Padrões **provisórios**: C42 a C48 (seção 7). C36 a C40 foram decididos pelo usuário.
- Branch `feature/etapa7-comprovantes-articulacao`: `450ad95` (comprovantes, servidor), `f28b02a` (comprovantes, telas), `2fceb16` (Articulação, servidor), `1a64974` (Articulação, telas), `d90059c` (documentação) e a atualização final deste arquivo. A mesclagem é o commit "Etapa 7: comprovantes e articulacao interdisciplinar", no topo da `main`.

### Etapa 8 — Legibilidade e documentação final [confirmado]
- **Formatador.** Prettier 3.10.1 (versão exata, só de desenvolvimento), `.prettierrc.json` e `.prettierignore`. Scripts `npm run format` e `format:check`; o `npm test` exige o formato. Só JavaScript e CSS: HTML, Markdown e JSON ficam fora.
- **Reformatação de 83 arquivos JavaScript e 12 de CSS, provada equivalente.**
  - `scripts/format-equivalence.js [ref]` compara a árvore de sintaxe e os comentários de cada `.js` alterado em relação a um commit.
  - `tests/browser/css_equivalence.py [ref]` compara as regras de cada `.css` como o navegador as serializa.
  - **Use os dois em qualquer mudança que deva ser só de formatação.** O Prettier não é idempotente em alguns encadeamentos: rode `npm run format` duas vezes se o `format:check` reclamar depois da primeira.
- **A2 resolvido.** `window.SupremaHooks = {list, on(momento, fn), run(momento)}` em `shared/ui.js`. `app.js` tem `renderStats` = `drawStats` + complementos, e o mesmo para `renderIndividual` e `renderStudentResult`; `bootStudent` chama `student.boot` no início. `indicadores/analytics.js` e `academico/academico.js` só se registram. O HTML das telas foi comparado antes e depois e ficou idêntico.
- **Limpeza.** Oito sobras removidas; `eslint . --max-warnings 0`.
- **A9 resolvido.** Botão "Consultoria Acadêmica" removido (C8).
- **A7 resolvido.** `tests/integration/calculo_tela.test.js` extrai `recalcLocal` do `app.js` e compara com `D.normalizeScore` em 36 mil linhas. O teste achou uma diferença de 1 centésimo com notas de mais de duas casas; `recalcLocal` passou a arredondar cada nota como o servidor. **`calcScore` não foi alterado.**
- **A10 resolvido.** `scripts/schema-doc.js` gera `docs/modelagem/esquema_atual.sql` de um banco novo (`npm run docs:schema`); `tests/integration/esquema_documentado.test.js` falha se o arquivo ficar desatualizado. **Toda migração nova exige rodar `npm run docs:schema`.** `modelo_fisico.sql` ficou como proposta histórica.
- **Documentação.** `docs/GUIA_DE_USO.md`, `docs/COMO_CRIAR_UM_MODULO.md`, `CHANGELOG.md`; README com índice por objetivo; versão 12.0.0 em `package.json`.
- **Não feito, registrado em `docs/PENDENCIAS.md` (P30 a P34):** colunas fixas de `scores` (A3), SQL nas rotas antigas (A5), 60% em mais de um lugar (A8), linhas longas de HTML dentro de texto.
- Branch `feature/etapa8-legibilidade`: `49e4e88` e `3ab59e4` (ferramentas), `d4fa2e1`, `133f38e`, `f18b820`, `8c24375` (reformatação), `ae2bd2c` (complementos), `258e72f` (limpeza), `70751fa` (esquema), `05b6f4a` (documentação e versão), `808282f` e `65b8f2c` (fechamento) e a atualização final deste arquivo. A mesclagem é o commit "Etapa 8: legibilidade e documentacao final", no topo da `main`.

### Relatório da Articulação (16/11/2026, depois do plano) [confirmado]
- **Pedido.** O usuário quis tratar as pendências por partes, começando pelas fórmulas. Sobre o OSCE: "é necessário atenção dos professores, por isso no momento não tenho resposta". Sobre a Articulação: enviou `Relatorio articulação.xlsx` (pasta Downloads dele, fora do repositório; **não foi copiado para o projeto**).
- **O arquivo.** Uma aba, "Matriz", sem respostas: cabeçalho, 13 linhas para alunos e três linhas de totais com 42 fórmulas. É um quadro por tutor e período (`E15 = E2`, `F15 = F2`).
  - Respondentes: `=COUNTA(C2:C14)`.
  - Notas de 0 a 10 (perguntas 1, 2.4, 4.4 e 5): `=SUM(col)/$B$15`, `=MIN(col)`, `=MAX(col)`.
  - Sim/Não/Parcialmente (2.1 a 2.3, 3.1 a 3.3, 4.1 a 4.3): `=COUNTIF(col,"Sim")/$B$15`, depois "Não" e "Parcialmente", em formato de percentual inteiro.
  - Não há número único por tutor, classificação, nem as perguntas 3.4 e 3.5 (estações preferidas).
- **Decisões do usuário.** Autorizou implementar ("Sim, implementar!", "Pode fazer tudo isso no momento") e aceitou dois padrões: quadro por tutor e período; médias com duas casas. **Não conseguiu confirmar** se existe uma etapa de cálculo depois dessa planilha (P2 continua aberta só para isso).
- **Cálculo.** `apps/api/src/core/calculo/articulacao.js`: `average`, `lowest`, `highest`, `share`, `wholePercent`, `figures(kind, values, respondents, choices)`. Sem banco e sem rotas.
- **Rotas.** `consolidate` acrescenta `average`, `lowest`, `highest` (notas) e `shares` (percentual inteiro) a cada pergunta, sempre dividindo pelo total de respostas do quadro. `tutors[].periods[]` divide cada tutor por período quando a avaliação tem exatamente uma pergunta `PERIODO`. Em `mine`, `periods` só vem quando todos os períodos atingem o mínimo. `performance.available` continua falso, com mensagem nova.
- **Exportação.** Depois da aba de respostas, uma aba por tutor e período (nome "período - tutor", no máximo 31 caracteres, sem caracteres proibidos, sem repetição): as linhas do grupo e três linhas de totais com as fórmulas da planilha e o resultado já gravado.
- **Telas.** `features/articulacao/articulacao.js`: média, menor e maior nota acima da distribuição; percentual ao lado de cada contagem; quadros por período quando o tutor tem mais de um; aviso "Como ler estes números" no lugar de "aguardando a fórmula institucional"; link "Baixar respostas e relatório (Excel)".
- **Testes.** `tests/integration/calculo_articulacao.test.js` (7, avalia as fórmulas da planilha como uma planilha e compara em 3.000 planilhas inventadas) e 1 novo em `articulacao.test.js`; total 322. Uma verificação da etapa 7 e uma de navegador tiveram a expectativa atualizada: exigiam que não houvesse média nem percentual.
- **Conferência no Excel.** Uma exportação fictícia (23 respostas, 3 tutores, 2 períodos) foi recalculada pelo Excel 16 desta máquina: 252 células de fórmula, 0 diferentes; arredondamento exibido igual ao das telas.
- **Padrões provisórios novos:** C52 a C54 da auditoria (P36 a P38 em `docs/PENDENCIAS.md`).
- Branch `feature/articulacao-relatorio`, a partir da `main`: `6ef0ac8` (cálculo, rotas e exportação), `12f0cdf` (telas), `947b8a8` (documentação) e a atualização final deste arquivo. **Mesclada na `main` em 16/11/2026 a pedido do usuário ("Mesclar na main")**, com `--no-ff`; `npm test` e o teste de navegador foram repetidos na `main` depois da mesclagem. O hash da mesclagem está na seção "Resultado do relatório da Articulação" da auditoria.

### Nota do OSCE e planilha final da Articulação (16/11/2026, depois do plano) [confirmado]
- **Pedido.** Depois da mesclagem do relatório da Articulação, o usuário enviou duas planilhas da pasta Downloads dele: `8ºP.xlsx` ("Este é o do OSCE") e `z Relatorio articulação.xlsx` ("este é como deve ficar o resultado FINAL"). **As duas têm nomes e e-mails reais; foram lidas em cópias isoladas fora do repositório e nada delas foi copiado para o projeto.** O que foi lido e o plano foram apresentados antes do código; a resposta foi "Sim, implementar".
- **Planilha do OSCE.** Quatro abas de estação, "Junção" e "Resultado Final".
  - Acertos: `=(COUNTIF(<itens>,"Fez"))*(IF(<item de postura>="Fez",1,0.5))`. O item de postura é a primeira coluna da aba e não conta como item.
  - NOTA: `=(Acertos)/<Total Questões>`, de 0 a 1.
  - "Resultado Final": tabela dinâmica com a média da nota por aluno e estação; total do aluno = média das estações em que foi avaliado (estação não avaliada não é zero); total por estação; total geral = média de todas as notas.
  - Não há nota de aprovação, lista de melhores e piores nem comparação entre rodadas.
- **Planilha final da Articulação.** 24 abas, uma por tutor, com o nome dele, mais uma "Matriz" vazia. Colunas: data, e-mail, nome, período, tutor e as perguntas. Totais sem rótulo, na ordem média, maior, menor / Sim, Parcialmente, Não. Um tutor com alunos de dois períodos fica em uma aba só. **Não existe etapa de cálculo depois dela: P2 e C49 estão resolvidos.**
- **Cálculo do OSCE.** `apps/api/src/core/calculo/osce.js`: `factor(key)`, `hits(items, key)`, `grade(items, key)`, `average(grades)`, `shown(value)` e `SHEET_LABELS`. `key` é a resposta à pergunta-chave, ou `undefined` quando a estação não tem pergunta-chave (sem redução).
- **Rotas do OSCE.** `GET .../results`: cada estação ganha `items`, `average` e, por aluno, `hits` e `grade`; `consolidated` passa a `{available: true, message, students: [{student, grades, evaluated, final}], average}`. Rota nova `GET /api/osce/events/:id/results/export` (permissão `osce.results`, auditoria `OSCE_EXPORTAR`). O `wrap` do módulo passou a encaminhar erros de rotas assíncronas.
- **Exportação do OSCE.** Uma aba por estação (data, aluno, avaliador, pergunta-chave e comentário, cada item seguido de "Comentários", "Acertos", "NOTA", "Estação"; "Total Questões" quatro linhas abaixo do cabeçalho mais os alunos), "Junção" e "Resultado Final". Diferenças de propósito: acertos contados item a item (`COUNTIF(F2,"Fez")+COUNTIF(H2,"Fez")+...`), porque o intervalo original cobre as colunas de comentário; "Resultado Final" com `AVERAGE` em vez de tabela dinâmica; avaliador = conta do ambulatório.
- **Telas do OSCE.** `features/osce/osce.js`: quadro "Notas do OSCE · de 0 a 1" com botão de ordenar pela nota final; acertos e nota em cada estação; "Fez" e "Não fez"; link "Baixar notas (Excel)"; aviso "Como as notas são calculadas".
- **Articulação.** Exportação com uma aba por tutor em ordem alfabética, totais na ordem da planilha final e sem rótulos, sem a coluna "E-mail Institucional"; "Todas as respostas" é a última aba. `SHEET_SHARES` = `SIM, PARCIAL, NAO`. A constante das rotas passou a se chamar `NO_SINGLE_FIGURE`; `performance.available` é sempre falso, com a mensagem "A instituição não usa um número único...". As telas mantêm a divisão por período dentro do quadro do tutor.
- **Testes.** `tests/integration/calculo_osce.test.js` (9) e 4 novos em `osce.test.js`; total 335. Quatro verificações anteriores e três de navegador tiveram a expectativa atualizada (lista em `docs/VALIDACAO.md`). Navegador: 24.
- **Conferências fora do `npm test`.** A planilha do OSCE recebida, recalculada pelo sistema: 48 acertos, 48 notas e 70 células do "Resultado Final", 0 diferentes. Excel 16 desta máquina sobre exportações fictícias: 457 células do OSCE e 126 da Articulação, 0 diferentes; 93 números exibidos com o mesmo arredondamento das telas.
- **Padrões provisórios novos:** C55 a C59 da auditoria (P39 a P43 em `docs/PENDENCIAS.md`). C1 e C49 resolvidos; C50 e C54 revistos.
- Branch `feature/osce-nota-articulacao-final`, a partir da `main`: `9d777b7` (OSCE), `1a6414d` (Articulação), `e4440c0` (documentação) e a atualização final deste arquivo. **Mesclada na `main` em 16/11/2026 a pedido do usuário ("Mesclar na main")**, com `--no-ff`; `npm test` e o teste de navegador foram repetidos na `main` depois da mesclagem. O hash da mesclagem está na seção "Resultado da nota do OSCE e da planilha final da Articulação" da auditoria.

### Preparação para a integração com outro sistema (16/11/2026) [confirmado]
- **Pedido.** O usuário informou que todo o sistema será integrado a outro, "que possui a mesma estrutura, mas conta com funcionalidades e códigos diferentes", e pediu que a lista de pendências reúna tudo o que falta neste código, inclusive ajustes, adaptações e requisitos para a integração, de modo que "a pessoa responsável possa dar continuidade". Quer "uma estrutura-base, um tronco principal".
- **O outro sistema não foi visto.** Nada foi decidido sobre ele. O que se escreveu sobre ele são perguntas e riscos a conferir. [hipótese] A afirmação de que ele tem "a mesma estrutura" é do usuário e não foi verificada.
- **Entregue: só documentação.** Nenhum código, teste ou migração foi alterado.
  - `docs/INTEGRACAO.md` (novo): tronco proposto (núcleo + módulos + manifesto + registros de tela, que já existem aqui); três caminhos (A: este é o tronco; B: o outro é o tronco; C: lado a lado, provisório); inventário do que este sistema ocupa, conferido no código (ambiente, portas, cookie, variáveis, rotas, tabelas, perfis, permissões, auditoria, nomes da interface, o que cada módulo usa do núcleo); 10 regras do tronco; tabela de conflitos; questionário sobre o outro sistema; passo a passo em 7 fases; garantias que não podem quebrar.
  - `docs/PENDENCIAS.md` reorganizado: resumo no topo, seção 8 nova (P45 a P47 a receber, P48 a P54 decisões do tronco, P55 a P64 ajustes neste código) e "Como enviar" como seção 9. Os números P1 a P44 não mudaram.
- **Fatos levantados que pesam na integração:** `features/avaliacoes/app.js` declara 67 nomes no escopo global da página; os estilos gerais não têm classe raiz (só `modulos.css` tem `.mod-root`); 18 tabelas de base são criadas por `core/database.js`, fora das 10 migrações numeradas; as tabelas antigas têm nomes genéricos; `PORT`, `HOST`, `API_PORT`, `API_HOST` e `API_URL` não têm prefixo; os pacotes internos ainda dizem versão 11.9.0.
- **Ajustes que podem ser feitos antes de o outro sistema chegar** (não mudam o comportamento): P55, P56, P57, P59, P61, P62. **Não foram feitos**: o usuário pediu a organização e a documentação.
- Branch `docs/integracao`, a partir da `main`: `932ad91` (documentação) e a atualização final deste arquivo. **Mesclada na `main` em 16/11/2026 a pedido do usuário ("Mesclar na main")**, com `--no-ff`; `npm test` e o teste de navegador foram repetidos na `main` depois da mesclagem. O hash da mesclagem está na seção "Preparação para a integração com outro sistema" da auditoria.

### Mudanças de comportamento já em vigor [confirmado]
- Conta com histórico de notas não pode ser excluída, só desativada.
- A auditoria grava o endereço de origem de cada operação, o que é dado pessoal.
- As cópias em `data/pre-migracao/` não são apagadas automaticamente.
- As datas do histórico e da auditoria aparecem no horário local do navegador.

Desde a etapa 3:
- `HOST=0.0.0.0` sem HTTPS deixou de iniciar. Em `127.0.0.1` nada muda.
- `npm run backup` apaga backups antigos e mantém os 30 mais recentes.
- `npm test` inclui o lint e exige as dependências de desenvolvimento (`npm ci`).

Desde a etapa 4:
- Planilha de notas sem coluna de matrícula deixou de ser aceita.
- Aluno de turma com menos de 5 resultados publicados não vê média, posição nem comparações.
- Nota acima do valor máximo declarado de um instrumento bloqueia a publicação.
- O painel do aluno mudou de rótulos e perdeu o cartão "Avaliações publicadas".

Desde a etapa 5:
- Núcleo de Avaliação e Usuário operacional deixam de cair na tela neutra e abrem as telas do OSCE.
- Trocar o perfil de uma conta para um desses dois passa a dar acesso ao OSCE.

Desde a etapa 6:
- CSTI e Coordenação deixam de cair na tela neutra e abrem a Avaliação Docente.
- O professor ganha o item "Avaliação Docente" no menu; o aluno, a entrada na barra lateral.

Desde a etapa 7:
- Cada resposta do aluno na Avaliação Docente e na Articulação gera um comprovante; a administração passa a saber **quem** respondeu, nunca **o quê**.
- Administrador e CSTI ganham o item "Comprovantes"; CSTI e Coordenação ganham "Articulação Interdisciplinar"; o professor perde o aviso "em desenvolvimento" desse item; o aluno ganha duas entradas na barra lateral.
- A primeira inicialização aplica as migrações 009 e 010 e grava a cópia habitual em `data/pre-migracao/`.

Desde a etapa 8:
- O painel do aluno não tem mais o botão "Consultoria Acadêmica".
- A prévia dos totais na planilha do professor arredonda cada nota como o servidor (só muda com nota digitada com mais de duas casas decimais).
- "Atualizar resultados" do aluno descarta também o que o painel adicional guardava; antes isso só acontecia ao entrar.
- `npm test` passa a falhar com código fora do formato ou com qualquer aviso do lint.

---

## 3. Estado do Git [confirmado em 16/11/2026, na mesclagem do guia de integração]

- **`main`:** branch ativa e limpa. **O topo é a mesclagem `--no-ff` da branch `docs/integracao`, o commit "Guia de integracao com outro sistema e pendencias reorganizadas", feito a pedido do usuário.** Abaixo dela está a mesclagem `--no-ff` da branch `feature/osce-nota-articulacao-final`, o commit "Nota do OSCE e planilha final da Articulacao", também feito a pedido do usuário. Abaixo dela está a mesclagem `--no-ff` da branch `feature/articulacao-relatorio`, o commit "Relatorio da Articulacao pelas formulas da planilha da instituicao", também feito a pedido do usuário. Abaixo dela está a mesclagem `--no-ff` da etapa 8, o commit "Etapa 8: legibilidade e documentacao final", feito a pedido do usuário ("Mesclar na main"). Acima dela está a mesclagem da branch `docs/contexto-ia` ("Contexto do projeto para outras IAs"), também a pedido, que só acrescenta `CONTEXTO_IA.md` e os links para ele no README e neste arquivo.
- **Histórico:**
  ```
  *   (mesclagem) Guia de integracao com outro sistema e pendencias reorganizadas   <- main
  |\
  | * (atualização final do HANDOFF)                           <- docs/integracao
  | * 932ad91 Documenta a preparacao para a integracao com outro sistema
  |/
  *   6b61021 Nota do OSCE e planilha final da Articulacao
  |\
  | * (atualização final do HANDOFF)                           <- feature/osce-nota-articulacao-final
  | * e4440c0 Documenta a nota do OSCE e a planilha final da Articulacao
  | * 1a6414d Exporta a Articulacao no formato da planilha final da instituicao
  | * 9d777b7 Calcula a nota do OSCE pelas formulas da planilha da instituicao
  |/
  *   46c43cf Relatorio da Articulacao pelas formulas da planilha da instituicao
  |\
  | * (atualização final do HANDOFF)                           <- feature/articulacao-relatorio
  | * 947b8a8 Documenta o relatorio da Articulacao e atualiza as pendencias
  | * 12f0cdf Mostra os numeros do relatorio nas telas da Articulacao
  | * 6ef0ac8 Calcula o relatorio da Articulacao pelas formulas da planilha da instituicao
  |/
  *   abd1090 Contexto do projeto para outras IAs
  |\n  | * 81b6f55 Adiciona o contexto do projeto para outras IAs   <- docs/contexto-ia
  |/
  *   (mesclagem) Etapa 8: legibilidade e documentacao final
  |\
  | * (atualização final do HANDOFF)                           <- feature/etapa8-legibilidade
  | * 65b8f2c Ajusta a abertura da lista de pendencias
  | * 808282f Documenta a etapa 8 e atualiza o HANDOFF
  | * 05b6f4a Revisa a documentacao e passa a versao para 12.0.0
  | * 70751fa Gera o esquema do banco a partir do banco real
  | * 258e72f Limpa sobras, remove o botao Consultoria e testa a previa da planilha
  | * ae2bd2c Troca as sobrescritas de funcoes da interface por complementos registrados
  | * 8c24375 Reformata os testes
  | * f18b820 Reformata as folhas de estilo
  | * 133f38e Reformata o JavaScript da interface
  | * d4fa2e1 Reformata o codigo do servidor
  | * 3ab59e4 Ajusta o verificador de equivalencia de CSS
  | * 49e4e88 Adiciona o formatador e os verificadores de equivalencia
  |/
  *   e23a66b Etapa 7: comprovantes e articulacao interdisciplinar
  *   f6425d4 Etapa 6: avaliacao docente anonima
  *   7bd87d4 Etapa 5: nucleo de formularios e OSCE
  *   8b5572c Etapa 4: melhorias do modulo principal
  *   fd056f8 Etapa 3: operacao
  *   8205f35 Adiciona HANDOFF.md
  *   d7f7f55 Etapa 2: fundacoes
  *   28ef013 Etapa 1: seguranca de login e senhas
  * 7d973a5 Base original recebida (v11.9.0), sem alterações
  ```
  Os hashes da mesclagem e do último commit da branch estão na seção "Resultado da Etapa 8" da auditoria; confira com `git log --oneline --graph -18`.
- **`git blame`:** os quatro commits de reformatação tocam quase todas as linhas. Para ver o autor real de uma linha, use `git blame --ignore-rev` com `d4fa2e1`, `133f38e`, `f18b820` e `8c24375`.
- **Branches locais:** `main`, as oito `feature/etapaN-...`, `feature/articulacao-relatorio`, `feature/osce-nota-articulacao-final`, `docs/handoff`, `docs/contexto-ia` e `docs/integracao`. As de feature foram mantidas; o usuário não pediu para apagá-las.
- **Remoto:** `git remote -v` não retorna nada. **Não existe remoto configurado, e nada foi enviado (push) para lugar nenhum.** Não há tags.
- **Convenções seguidas:**
  - uma branch `feature/etapaN-...` por etapa, criada a partir da `main`;
  - mesclagem `git merge --no-ff` **somente quando o usuário pedir**;
  - mensagens de commit em português sem acento no título;
  - mensagem de commit termina com a linha `Co-Authored-By:` indicada pelo ambiente da sessão.
- **Nota prática:** `git merge -F -` falhou neste Windows. Use vários `-m`.

---

## 4. Validações

### As 335 verificações [confirmado]
Executadas com um único `npm test` na branch `feature/etapa8-legibilidade` (15/11/2026) e repetidas na `main` depois da mesclagem. O resultado foi código de saída 0, com 314 aprovadas e 0 reprovadas, em cerca de 240 s. Ao final, nenhum processo do projeto ficou rodando e nenhuma pasta temporária de teste sobrou.

Em 16/11/2026, na branch `feature/articulacao-relatorio`, o mesmo `npm test` deu código de saída 0 com 322 aprovadas e 0 reprovadas (8 novas, todas da Articulação), e foi repetido na `main` depois da mesclagem.

Ainda em 16/11/2026, na branch `feature/osce-nota-articulacao-final`, o mesmo `npm test` deu código de saída 0 com 335 aprovadas e 0 reprovadas (13 novas, todas do OSCE), e foi repetido na `main` depois da mesclagem. A tabela abaixo é a atual.

| Grupo (script npm) | Arquivo | Aprovadas | O que cobre |
| --- | --- | --- | --- |
| `check` | `scripts/check.js` | (aprovado) | Sintaxe, recursos referenciados no HTML, fronteiras entre módulos. Não entra na contagem. |
| `lint` | `eslint.config.js` | (aprovado) | Erros reais de código; 0 erros e 0 avisos (limite zero). Não entra na contagem. |
| `format:check` | `.prettierrc.json` | (aprovado) | Formato de todo o JavaScript e CSS. Não entra na contagem. |
| `test:isolamento` | `tests/architecture/*.test.js` | 7 | Isolamento de módulos e de processos. |
| `test:seguranca` | `tests/integration/seguranca_login.test.js` | 10 | Endereço real pelo proxy, limite de login, tempo de resposta, troca de senha e primeiro acesso. |
| `test:fundacoes` | `migracoes.test.js` (5), `sessoes.test.js` (7), `perfis.test.js` (7), `historico_notas.test.js` (8), `esquema_documentado.test.js` (2) | 29 | Migrações, sessões no banco, perfis e permissões, histórico imutável, esquema documentado igual ao banco. |
| `test:operacao` | `transporte.test.js` (9), `backup.test.js` (9), `dependencias.test.js` (2) | 20 | HTTPS obrigatório, HSTS, cookie `Secure`; backup, retenção, restauração; `uuid` corrigido. |
| `test:principal` | `importacao_notas.test.js` (4), `agregados_aluno.test.js` (5), `instrumentos.test.js` (9), `modalidades.test.js` (4), `calculo_tela.test.js` (4) | 26 | Importação só por matrícula; números da turma ocultos em grupo pequeno; valor máximo dos instrumentos; agrupamento por modalidade dos gráficos; prévia da planilha igual ao cálculo do servidor. |
| `test:osce` | `osce.test.js` (16), `calculo_osce.test.js` (9) | 25 | Permissões por perfil, rascunho → liberado → encerrado, uma resposta por aluno e estação, anulação, acertos e nota por estação, nota final e médias, OSCE sem pergunta-chave, exportação com as fórmulas, respostas imutáveis, auditoria, falha isolada do módulo; fórmulas da planilha do OSCE contra o cálculo do sistema. |
| `test:docente` | `tests/integration/avaliacao_docente.test.js` | 9 | Permissões dos quatro perfis, ciclo da avaliação, resposta única por aluno matriculado, anonimato inspecionado no banco, respostas imutáveis, resultado só depois de encerrar e acima do mínimo, encerramento definitivo, falha isolada do módulo. |
| `test:comprovantes` | `tests/integration/comprovantes.test.js` | 6 | Código de verificação, emissão junto com o envio, PDF bem formado, comprovante sem conteúdo de resposta, quem vê e quem não vê, verificação pelo código, registro imutável. |
| `test:articulacao` | `articulacao.test.js` (8), `calculo_articulacao.test.js` (7) | 15 | Nome livre, modelo de perguntas, listas e lista padrão; bloqueios da liberação; resposta única validada por tipo, com comprovante; respostas imutáveis; contagens e números do relatório, gerais, por tutor e por período, sem número único de desempenho; acesso de cada perfil, com o tutor sem nomes e sem números abaixo do mínimo; exportação com a aba de respostas e as abas de relatório; fórmulas da planilha da instituição contra o cálculo do sistema. |
| `test:api` | `tests/integration/teste_api.js` | 62 | Regras acadêmicas, autorização, publicação, concorrência. |
| `test:usuarios` | `tests/integration/teste_usuarios.js` | 44 | Cadastro, edição e exclusão de usuários. |
| `test:importacao` | `tests/integration/teste_importacao_alunos.js` | 56 | Importação de alunos com senhas individuais. |
| `test:matriculas` | `tests/integration/teste_matriculas_periodo.js` | 26 | Matrículas por período. |
| **Total** | | **335** | 147 pelo `node:test` + 188 pelas suítes de integração próprias. |

A progressão foi 192 na base original (191 passando), 205 depois da etapa 1, 232 depois da etapa 2, 252 depois da etapa 3, 274 depois da etapa 4, 286 depois da etapa 5, 295 depois da etapa 6, 308 depois da etapa 7, 314 depois da etapa 8, 322 depois do relatório da Articulação e 335 depois da nota do OSCE. As suítes antigas não tiveram expectativas enfraquecidas. Nelas, a troca obrigatória de senha é dispensada direto no banco de teste, porque essas suítes verificam outras regras; o primeiro acesso é coberto pelas suítes novas. Na etapa 5, duas verificações de `perfis.test.js` tiveram a expectativa atualizada de propósito: os dois perfis atendidos pelo OSCE passaram a ter exatamente as permissões dele. Na etapa 6 as mesmas duas foram atualizadas de novo, para as permissões da Avaliação Docente.

### Conferido manualmente em navegador [confirmado]
Os testes usaram banco descartável e contas fictícias, no navegador embutido do app.
- **Etapa 1:**
  - diálogo "Alterar senha";
  - troca obrigatória no primeiro acesso, nos dois caminhos: cancelar e concluir;
  - importação sem campo de senha e com o CSV de senhas provisórias.
- **Etapa 2:**
  - histórico de notas do professor e do administrador;
  - auditoria com Quem e Origem;
  - lista de perfis no cadastro;
  - conta CSTI na tela neutra, recebendo 403 nas rotas protegidas.

- **Etapa 4:**
  - planilha do professor com valores máximos, diálogo de configuração e destaque "↓";
  - média por instrumento com e sem valor máximo; teia por modalidade da turma e do estudante;
  - painel do aluno em turma de 6 resultados (rótulos, barras com total, nome da disciplina e 60%, "Ver gráficos", teia por modalidade);
  - painel do aluno em turma de 2 resultados, sem nenhum número da turma.
  - Feito com um servidor temporário em `127.0.0.1`, montado com `tests/fixtures/api.js` e `tests/fixtures/turma.js`, e apagado ao final.

- **Etapa 5:**
  - Núcleo: lista, "Novo OSCE", montagem (remover e renomear estações, perguntas, pergunta-chave), liberação, resultado bruto e anulação;
  - conta operacional: período e estações, formulário, envio, "Enviar outra resposta" com o aluno já avaliado indisponível;
  - conta do CSTI continua na tela neutra.

- **Etapa 6:**
  - CSTI: lista e avaliação liberada com a adesão por contagem;
  - aluno: entrada no menu com pendências, avisos de anonimato, envio e marca de respondida;
  - professor: evolução entre avaliações, percentuais por pergunta e comentários;
  - Coordenação: resultado geral, lista de professores e comparação entre avaliações.

### Teste de navegador [confirmado]
`tests/browser/smoke.py` foi executado nas etapas 3 a 8; hoje são 24 verificações aprovadas (3 do OSCE, 3 da Avaliação Docente, 3 dos comprovantes, 5 da Articulação e 1 das telas sem os complementos). O teste estava quebrado desde a etapa 1 (troca de senha no primeiro acesso) e foi consertado na etapa 6. Ele não faz parte do `npm test`. Nesta máquina o Playwright do Python (1.65.1) foi instalado num ambiente virtual temporário da sessão, fora do projeto; o Chromium ficou em `%LOCALAPPDATA%\ms-playwright`. Para repetir: criar um venv com `py -3`, `pip install -r tests/browser/requirements.txt`, `python -m playwright install chromium`, `python tests/browser/smoke.py`.

### O que NÃO foi validado [confirmado]
- **A migração de um banco legado real não foi testada.** Não há banco de demonstração; `data/` está vazia. O teste usou um banco sintético.
- `.github/workflows/ci.yml` nunca rodou, porque não há remoto. A sintaxe foi conferida e cada comando foi executado localmente no Windows; o job `navegador` em Linux não foi exercitado.
- Certificado institucional, proxy HTTPS real, agendamento no servidor e restauração de um backup real do ambiente institucional.
- O teste foi feito em Node 26 no Windows. Linux só foi exercitado pela CI original, antes destas mudanças.
- `npm audit`: 0 avisos desde a etapa 3. **Não usar `npm audit fix --force`**, porque ele faria downgrade do `exceljs` para 3.4.0.

### Como rodar os testes nesta máquina
- O Node está em `C:\Program Files\nodejs\`. Na sessão da etapa 3 ele já estava no PATH; se não estiver, no PowerShell:
  ```powershell
  $env:Path = "C:\Program Files\nodejs;" + $env:Path; npm test
  ```
- Rode `npm test` como comando único, com tempo limite (leva cerca de 1 minuto). Se travar, procure processos `node` órfãos antes de repetir.
- Pastas temporárias de teste se chamam `suprema-teste-*` em `%TEMP%`. Apague só pelo nome exato, nunca com curinga amplo em `%TEMP%`; o classificador de permissões recusou esse tipo de varredura.
- Testes que sobem processos reais devem limpar as variáveis `SUPREMA_*`, `HOST`, `PORT` e `API_*` herdadas (veja `cleanEnv` em `tests/integration/transporte.test.js`). Certificado de teste: `tests/fixtures/tls.js`, gerado na hora e nunca versionado.
- Nos testes novos use `tests/fixtures/api.js` (`startApi`, `tempDir`, `ADMIN`, `PROVISIONAL`). Ele encerra a API **antes** de apagar a pasta; no Windows, inverter essa ordem dá EPERM e trava a execução.
- Para montar uma turma fictícia (professor, disciplina, alunos matriculados, A1/A2/A3) use `tests/fixtures/turma.js` (`createClass`), que traz `setScores`, `configureQuestion`, `publish`, `stats` e `studentResult`.
- Os testes do OSCE montam o cenário no próprio arquivo (`setup` em `tests/integration/osce.test.js`): Núcleo, conta operacional, alunos do período e um OSCE liberado.
- No `smoke.py`, espere o formulário aparecer antes de procurar as perguntas (`page.locator("#docForm").wait_for()`): `locator(...).all()` não espera, devolve lista vazia e o navegador bloqueia o envio sem erro visível. O roteiro aceita os diálogos de confirmação com `page.on("dialog", ...)`.
- Criar muitas contas num teste é lento (o hash de senha é caro de propósito). Reaproveite as contas dentro de um mesmo teste.
- Os arquivos antigos da interface têm linhas muito longas. Edições por substituição de texto falham com facilidade; funcionou substituir a linha inteira identificada pelo início dela e conferir com `node --check`.

---

## 5. Arquivos importantes

### Referências (fora do repositório) [confirmado]
| Arquivo | Finalidade |
| --- | --- |
| `AVALIACAO_SUPREMA\referencias\PROMPT_MESTRE_AVALIACAO_SUPREMA.md` | Prompt mestre: regras de conduta, segurança, fórmulas, etapas e entregas. **Ler integralmente antes de agir.** |
| `AVALIACAO_SUPREMA\referencias\ESPECIFICACAO.txt` | Especificação completa do sistema (requisitos AT-xx, perfis, módulos). |
| `AVALIACAO_SUPREMA\referencias\ESPECIFICACAO.docx` | Mesmo conteúdo do .txt (comparado na etapa 0: idênticos). |
| `AVALIACAO_SUPREMA\referencias\transcricoes\transcricao01.md` | Reunião curta: as "frentes" novas (OSCE, Avaliação Docente, Articulação). |
| `AVALIACAO_SUPREMA\referencias\transcricoes\transcricao02.md` | Reunião principal: OSCE (estações, pergunta-chave), contas operacionais, Avaliação Docente. |
| `AVALIACAO_SUPREMA\referencias\transcricoes\transcricao03.md` | Reunião curta complementar. |
| `AVALIACAO_SUPREMA\auditoria\AUDITORIA_TECNICA.md` | **Documento central.** Diagnóstico, vulnerabilidades S1–S12, arquitetura A1–A10, desenho dos módulos novos (8.1–8.4), conflitos C1–C18 com padrões provisórios (seção 9), plano das etapas 0–8 (seção 10), resultado das etapas 0, 1 e 2 e rastreio da reunião de 06/11. Atualize ao fim de cada etapa. |
| `AVALIACAO_SUPREMA\backup\Projeto-Suprema-main.zip` | Base original. Não alterar. |

As referências podem conter dados reais. **Não copie nomes, matrículas, credenciais ou dados reais para código, testes ou documentação.**

### Documentação do repositório [confirmado]
| Arquivo | Finalidade |
| --- | --- |
| `README.md` | Instalação, operação e variáveis. Atualizado nas etapas 1 e 2. |
| `.env.example` | Variáveis: `HOST`, portas, `SUPREMA_DATA_DIR`, `SUPREMA_BACKUP_DIR`, `SUPREMA_BACKUP_KEEP`, `SUPREMA_TLS_KEY`, `SUPREMA_TLS_CERT`, `SUPREMA_BEHIND_HTTPS_PROXY`, `SUPREMA_SECURE_COOKIE`, `SUPREMA_API_PRIVATE_NETWORK`, `SUPREMA_API_TRUSTED_PROXIES`, `SUPREMA_WEB_TRUSTED_PROXIES`, `SUPREMA_MIN_AGGREGATE_STUDENTS`. |
| `docs/ARQUITETURA.md` | Arquitetura. Atualizado com migrações, sessões, perfis e histórico. |
| `docs/VALIDACAO.md` | Registro de validações, com seções datadas de 11/11 e 12/11 (etapas 2 e 3). |
| `docs/BACKUP.md` | Roteiro de backup, retenção, agendamento e restauração. Criado na etapa 3. |
| `docs/INTEGRACAO.md` | **Guia para unir este sistema a outro.** Tronco, inventário, conflitos, questionário e passo a passo. Criado em 16/11/2026. |
| `docs/PENDENCIAS.md` | **Lista de tudo o que falta (P1 a P64)**, com a seção 8 sobre a integração. Antes era só a lista do que depende do usuário ou da instituição (fórmulas, decisões, padrões provisórios, infraestrutura). Criada na etapa 7; entregar ao usuário quando todas as etapas terminarem. |
| `docs/ANALISE.md`, `docs/COLABORACAO.md`, `docs/MAPA_DE_PASTAS.md`, `docs/modelagem/` | Vieram da base. `docs/modelagem/modelo_fisico.sql` **não corresponde** ao esquema real (A10). |
| `packages/contracts/README.md` | Contratos de API. Atualizado na etapa 2. |
| `.github/workflows/ci.yml` | CI: Node 24, `npm ci`, `npm audit`, `npm test` (com lint) e job de navegador. Ações fixadas por hash. Nunca executada. |
| `eslint.config.js` | Lint só de erros reais. Os globais compartilhados entre arquivos da interface (A2) estão declarados um a um. |
| `scripts/backup.js` | Backup verificado com `node:sqlite` `backup()`, pasta `backups/BACKUP_NNN` com `backup.json`, retenção. |
| `scripts/restore.js` | Restauração verificada, com cópia do banco substituído. |
| `scripts/admin.js` | Configura o administrador. Zera `must_change_password` do admin. |

---

## 6. O que falta: só o que depende do usuário [pendente]

A etapa 8 está descrita na seção 2 e na seção "Resultado da Etapa 8" da auditoria. **O plano de 9 etapas terminou.**

### Trabalho seguinte
- Não há etapa 9. O trabalho seguinte depende do que o usuário enviar, conforme `docs/PENDENCIAS.md`.
- **Articulação (P2): resolvida.** A planilha final enviada em 16/11/2026 mostra que não há etapa de cálculo depois do quadro por tutor. Não há número único nem classificação a implementar.
- **OSCE (P1): a nota está implementada** (seção 2). Só fica em aberto, se a instituição quiser, a regra de melhores e piores, de aprovação e da comparação entre OSCE 1 e OSCE 2, que a planilha não traz. Se chegar, entra em `core/calculo/osce.js` pelo mesmo caminho: fórmulas das células, teste que as avalia como planilha, conferência no Excel e só então as telas.
- **Padrões para o usuário confirmar:** P39 a P43 (escala de 0 a 1, estação não avaliada fora da média, OSCE sem pergunta-chave, diferenças da exportação, rótulos "Fez" e "Não fez").
- **Integração com o outro sistema (P45 a P64):** seguir `docs/INTEGRACAO.md`. Depende de o código do outro sistema chegar (P45) e da ficha dele (P46). Os ajustes P55, P56, P57, P59, P61 e P62 podem ser feitos antes, se o usuário pedir; cada um em branch própria, com `npm test` e o teste de navegador. Para P57, `tests/browser/css_equivalence.py` não serve de prova, porque ele exige regras idênticas e a classe raiz muda os seletores: será preciso comparação visual das telas.
- **Qualquer funcionalidade nova:** seguir `docs/COMO_CRIAR_UM_MODULO.md`, uma branch por tarefa, desenho apresentado antes do código.

---

## 7. Restrições (não desfazer)

**Do prompt mestre e das referências**
- Não reconstruir o sistema. Evoluir a base existente e preservar a identidade visual.
- **Nunca inventar fórmulas, pesos ou regras institucionais.** Onde faltar fórmula, guardar os dados brutos e não calcular. O que as planilhas da instituição não trazem (nota de aprovação, classificações, número único por tutor) não existe no sistema.
- Não alterar `calcScore` nem o comportamento acadêmico existente.
- Não migrar para PostgreSQL sem autorização. Código novo deve ficar isolado do banco quando possível.
- Sem migrações destrutivas. Toda mudança de banco é uma nova migração versionada em `core/migrations/`; nunca edite uma migração já existente.
- Não implantar em ambiente institucional sem autorização.
- Usar só dados fictícios em código e testes.
- Não enfraquecer testes nem segurança para fazer algo passar. Não declarar teste aprovado sem rodar.

**Decisões técnicas já tomadas**
- Sessões no banco, só com hash do token.
- Autorização por `role_permissions`, nunca por comparação com o nome do perfil.
- Perfis novos sem permissões até o módulo deles existir. Hoje todos os quatro têm módulo: NUCLEO_AVALIACAO e OPERACIONAL (OSCE), CSTI e COORDENACAO (Avaliação Docente). Cada um tem só as permissões do seu módulo.
- Histórico de notas e de publicações é só de inclusão; os gatilhos bloqueiam UPDATE e DELETE.
- Conta com histórico não se exclui.
- Senhas provisórias individuais, nunca gravadas. Troca obrigatória no primeiro acesso.
- O proxy web é a única origem confiável do endereço do cliente.
- Avaliação Docente **anônima**, conforme o desenho da seção 8.4 da auditoria: participação e respostas em tabelas sem vínculo, ids aleatórios, só data sem hora, mínimo de respostas e comentários embaralhados.
- Um núcleo único de formulários para OSCE, Avaliação Docente e Articulação, com um arquivo de cálculo plugável por módulo.

**Regras de trabalho com o usuário**
- Commits na branch da etapa fazem parte da autorização da etapa (confirmado pelo usuário na etapa 3). Mesclagens na `main` só com o pedido explícito ("Mesclar na main").
- **Nunca fazer push.** Não há remoto.
- Não divulgar o e-mail do usuário. Não repetir valores de credenciais de teste nas respostas.
- Etapa por etapa: terminar, testar, reportar e esperar a ordem para a próxima.
- Quando uma rodada for interrompida e o usuário disser "Tente novamente", conferir primeiro o estado do repositório (`git status`, processos `node`, pastas temporárias) e depois continuar.

### Conflitos em aberto com padrão provisório [hipótese até o usuário decidir]
Detalhes na seção 9 da auditoria. Os principais:
- **C1:** a pergunta-chave do OSCE é multiplicador ou pontuação? Guardar a resposta sem aplicar efeito.
- **C2:** estações do OSCE em quantidade livre.
- **C3:** o OSCE novo não alimenta a coluna OSCE da A1/A2/A3.
- **C5:** manter a régua de 60% e trocar os textos que soam como decisão acadêmica.
- **C7:** "média" do professor só em percentuais.
- **C8:** "Consultoria Acadêmica" não deve ser desenvolvida.
- **C10:** exigir matrícula na importação de notas.
- **C14:** quantidade de usuários do ambulatório configurável.
- **C17:** mínimo de 5 respostas, configurável.
- **C18:** Articulação também anônima. **Substituído por C36:** o formulário real é identificado.
- **C19:** "abaixo da média" é a média da turma na coluna, não média de aprovação.
- **C20:** "prática" na teia é o OSCE; SAI, trabalho e outros são eixos próprios.
- **C21:** "Prova" → "Avaliação" só no painel do aluno.
- **C22:** valor máximo dos instrumentos é opcional para publicar.
- **C23:** mínimo de 5 resultados para o aluno ver números da turma, configurável.
- **C24:** lista de alunos do OSCE = alunos ativos do período, revisada pelo Núcleo.
- **C25:** segunda resposta para o mesmo aluno na mesma estação é recusada; o Núcleo pode anular.
- **C26:** conta operacional vê todas as estações liberadas.
- **C27:** conta operacional mantém a troca obrigatória de senha no primeiro acesso.
- **C28:** pergunta-chave é a primeira pergunta de cada estação, com texto editável.
- **C29:** só o Núcleo vê o resultado do OSCE.
- **C30:** na Avaliação Docente o aluno avalia os professores das disciplinas em que está matriculado.
- **C31:** resultado só depois do encerramento, que é definitivo.
- **C32:** o CSTI vê a adesão só por contagem.
- **C33:** mesmas perguntas para todos os professores de uma avaliação.
- **C34:** o momento da avaliação é ano, semestre e uma rodada com nome livre.
- **C35:** mínimo de respostas padrão 5, nunca menos que 3.
- **C36 a C40 [decididos pelo usuário em 15/11/2026]:** Articulação identificada; comprovante prova a participação, nunca o conteúdo; quem verifica é o Administrador e o CSTI; download em PDF, sem e-mail; geram comprovante os envios da Avaliação Docente e da Articulação.
- **C41:** resultado da Articulação é bruto; o percentual de desempenho aguarda a fórmula (o usuário mandou deixar em aberto).
- **C42:** a Articulação tem tabelas próprias em vez de usar o núcleo de formulários.
- **C43:** o tutor só vê números com 5 respostas ou mais (`SUPREMA_MIN_AGGREGATE_STUDENTS`).
- **C44:** o tutor lê as justificativas sem o nome do aluno.
- **C45:** o CSTI lê as respostas identificadas a qualquer momento; a Coordenação, depois da liberação; não existe perfil Direção.
- **C46:** todas as perguntas obrigatórias, justificativa opcional; qualquer aluno ativo responde e informa o próprio período.
- **C47:** o vínculo tutor ↔ conta de professor é feito à mão pelo CSTI.
- **C48:** cada etapa da Articulação pode ser desfeita, uma de cada vez.

---

## 8. Próximas ações (sequência exata)

1. **Aguardar o usuário.** Tudo está mesclado na `main`. A integração com o outro sistema espera o código dele (P45) e a ficha (P46); os ajustes P55, P56, P57, P59, P61 e P62 podem ser feitos antes, um por vez, se o usuário pedir. Ficam para ele confirmar os padrões P39 a P43 e decidir se a nota do OSCE deve alimentar a coluna OSCE de A1, A2 e A3 (P34). Não há trabalho em aberto: o próximo trabalho começa quando ele enviar uma fórmula, responder às pendências ou pedir algo novo.
2. Ao assumir a sessão:
   - ler este arquivo, o prompt mestre, `auditoria/AUDITORIA_TECNICA.md` e `docs/PENDENCIAS.md`;
   - conferir `git status` (deve estar limpo, na `main`), `git log --oneline --graph -20` (mesclagem de `docs/integracao` no topo, logo acima da de `feature/osce-nota-articulacao-final`) e `git remote -v` (vazio).
3. Rodar `npm ci` e `npm test` na `main` para confirmar as 335 antes de mudar qualquer coisa. Se um arquivo falhar com "bad port", repetir (P44).
4. **Mesclagens:** sempre `git merge --no-ff` com vários `-m`, só com o pedido explícito do usuário; antes, atualizar este arquivo para o estado pós-mesclagem; depois, repetir `npm test` e o teste de navegador na `main` e registrar o hash na auditoria.
5. **Se o usuário entregar uma fórmula** (OSCE ou Articulação): seguir a seção 6.
6. **Se o usuário responder às pendências:** aplicar item por item, atualizar `docs/PENDENCIAS.md` e a seção 9 da auditoria.
7. Em qualquer mudança:
   - `npm run format`, `npm run docs:schema` se houver migração, `npm test` completo e o teste de navegador;
   - conferência em navegador quando houver mudança de tela, com banco descartável e contas fictícias, sem tocar em `data/`;
   - commit em uma branch própria, relatório ao usuário e pergunta sobre a mesclagem.
