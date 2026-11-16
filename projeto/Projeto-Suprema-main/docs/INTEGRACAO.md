# Guia de integração com o outro sistema

Escrito em 16/11/2026, na versão 12.2.0, para a pessoa que vai unir este
sistema a outro, de mesma estrutura e com funcionalidades e códigos diferentes.

**O outro sistema não foi visto por quem escreveu este guia.** Tudo o que está
aqui sobre este sistema foi conferido no código. Tudo o que diz respeito ao
outro aparece como pergunta a responder (seção 5) ou como risco a conferir
(seção 4). Nenhuma decisão sobre o outro sistema foi tomada.

O que falta fazer está numerado em [Pendências](PENDENCIAS.md), seção 8
(P45 a P64). Este guia explica o porquê de cada item e a ordem.

## 1. O tronco principal

A ideia é ter um tronco (o que os dois sistemas compartilham) e ramos (as
funcionalidades de cada um), de modo que cada funcionalidade continue
funcionando sozinha e uma falha em uma não derrube as outras.

Este sistema já é organizado assim, e essa organização pode servir de tronco:

| Parte | Onde fica | O que faz |
| --- | --- | --- |
| Núcleo | `apps/api/src/core/` | Login, sessões, perfis e permissões, migrações do banco, auditoria, histórico de notas, privacidade, comprovantes, formulários |
| Fórmulas da instituição | `apps/api/src/core/calculo/` | Um arquivo por módulo, sem banco e sem rotas |
| Módulos | `apps/api/src/modules/<nome>/` | Uma pasta por funcionalidade: `routes.js` (regras) e `store.js` (SQL) |
| Manifesto | `apps/api/src/modules/index.js` | Lista os módulos e as rotas de cada um; cada módulo é carregado em separado |
| Telas | `apps/web/public/features/<nome>/` | Uma pasta por funcionalidade, registrada em `window.SupremaModules`, `SupremaViews` ou `SupremaHooks` |
| Utilitários de tela | `apps/web/public/shared/` | Chamadas à API e componentes comuns |
| Contratos | `packages/contracts/README.md` | Rotas, permissões e formatos |

Mecanismos que já existem e protegem uma junção:

- **Falha isolada.** Se um módulo não carrega, só as rotas dele respondem 503;
  o restante continua (`apps/api/src/module-loader.js`).
- **Módulo não importa módulo.** Só importa o núcleo. `npm run check` recusa o
  contrário.
- **Acesso por permissão.** As rotas usam `can('modulo.acao')`, nunca o nome do
  perfil. As permissões ficam na tabela `role_permissions` e nascem em
  migração.
- **Banco só cresce por migração numerada**, que nunca é editada depois de
  entregue.
- **Telas se registram**, não substituem outras.

O roteiro para acrescentar uma funcionalidade ao tronco é
[Como criar um módulo](COMO_CRIAR_UM_MODULO.md).

### Três caminhos possíveis

A escolha depende do que o outro sistema tem (seção 5) e é a pendência P48.

| Caminho | Como fica | Quando serve |
| --- | --- | --- |
| A. Este sistema é o tronco | As funcionalidades do outro entram como módulos aqui, uma por vez | O outro tem menos núcleo próprio (login, permissões, migrações, auditoria) ou um núcleo mais simples |
| B. O outro é o tronco | Os módulos daqui são levados para lá, com o que usam do núcleo (seção 2.9) | O outro já tem núcleo mais completo ou é o que está em produção |
| C. Lado a lado | Os dois continuam separados atrás de um mesmo endereço, com um login só | Os núcleos são incompatíveis e o prazo não permite fundir; é etapa intermediária, não destino |

Recomendação: escolher entre A e B comparando os dois núcleos item por item
(login, sessão, cadastro de pessoas, permissões, migrações, auditoria). O
núcleo com mais garantias fica; o outro é adaptado. O caminho C só vale como
passo provisório, porque mantém dois cadastros de pessoas.

Em qualquer caminho, a regra é a mesma: **primeiro o tronco, depois os ramos,
um de cada vez, com os testes dos dois sistemas passando a cada passo.**

## 2. O que este sistema ocupa

Lista do que pode colidir com o outro sistema. Conferida no código em
16/11/2026.

### 2.1 Ambiente

| Item | Valor |
| --- | --- |
| Node.js | 22.16 ou mais novo, porque o banco usa `node:sqlite`, que vem com o Node. Testado em 26; a CI escrita usa 24 |
| Servidor | Express 5 |
| Banco | SQLite, um arquivo em `data/` (ou em `SUPREMA_DATA_DIR`) |
| Planilhas | `exceljs` 4.4, com a dependência `uuid` forçada para uma versão corrigida (`overrides` no `package.json`) |
| Interface | JavaScript puro, sem framework e sem etapa de build; um único `index.html` |
| Pacotes internos | `@suprema/api` e `@suprema/web` (npm workspaces) |
| Testes | `node:test`, quatro suítes próprias e um teste de navegador em Python com Playwright |

### 2.2 Processos, portas e cookie

| Item | Valor |
| --- | --- |
| Interface | `apps/web/server.js`, porta 3002. Entrega os arquivos e repassa `/api` para a API |
| API | `apps/api/server.js`, porta 3003 |
| Cookie de sessão | `as_session`, `Path=/`, `HttpOnly`, `SameSite=Strict` |
| Senhas | scrypt, guardadas como `sal:hash` em hexadecimal |
| Sessões | Tabela `sessions`, com o hash do token |

### 2.3 Variáveis de ambiente

Com prefixo próprio: `SUPREMA_DATA_DIR`, `SUPREMA_TLS_KEY`, `SUPREMA_TLS_CERT`,
`SUPREMA_SECURE_COOKIE`, `SUPREMA_BEHIND_HTTPS_PROXY`,
`SUPREMA_API_TRUSTED_PROXIES`, `SUPREMA_WEB_TRUSTED_PROXIES`,
`SUPREMA_API_PRIVATE_NETWORK`, `SUPREMA_BACKUP_DIR`, `SUPREMA_BACKUP_KEEP`,
`SUPREMA_MIN_AGGREGATE_STUDENTS`.

**Sem prefixo, com nome genérico:** `PORT`, `HOST`, `API_PORT`, `API_HOST`,
`API_URL`. São as que mais podem colidir em um arquivo `.env` comum (P61).

### 2.4 Rotas

Do núcleo: `/api/login`, `/api/logout`, `/api/me`, `/api/me/password`,
`/api/health`, `/api/ready`, `/api/setup-status`.

| Módulo | Rotas |
| --- | --- |
| administracao | `/api/admin/*` |
| importacao-alunos | `/api/admin/student-import/*` |
| avaliacoes | `/api/assessment/*`, `/api/assessments/*` |
| planilhas | `/api/assessment/:id/import`, `/api/assessment/:id/export` |
| evolucao | `/api/evolution/*` |
| alunos | `/api/student/*` |
| osce | `/api/osce/*` |
| avaliacao-docente | `/api/teacher-eval/*` |
| comprovantes | `/api/receipts/*` |
| articulacao | `/api/articulation/*` |

### 2.5 Tabelas

Criadas na inicialização por `core/database.js`, **fora das migrações
numeradas**: `users`, `students`, `assessments`, `assessment_headers`,
`assessment_question_config`, `scores`, `published_scores`,
`publication_events`, `audit_logs`, `academic_courses`,
`academic_disciplines`, `academic_enrollments`, `teaching_assignments`,
`student_import_runs`, `identity_counters`, `system_controls`,
`role_permissions`, `schema_migrations`.

Criadas por migração numerada (`core/migrations/`):

| Migração | Tabelas |
| --- | --- |
| 001-sessions | `sessions` |
| 002-permissions | preenche `role_permissions` |
| 003-grade-history | `score_changes`, `publication_snapshots` |
| 004-instrument-config | `assessment_instrument_config` |
| 005-forms | `forms`, `form_questions`, `form_submissions`, `form_answers` |
| 006-osce | `osce_events`, `osce_stations`, `osce_event_students` |
| 007-anonymous-forms | `anon_participation`, `anon_submissions`, `anon_answers` |
| 008-teacher-eval | `teacher_eval_campaigns`, `teacher_eval_targets` |
| 009-receipts | `receipts` |
| 010-articulation | `articulation_forms`, `articulation_options`, `articulation_default_options`, `articulation_questions`, `articulation_responses`, `articulation_answers` |

Os módulos novos têm prefixo no nome das tabelas (`osce_`, `teacher_eval_`,
`articulation_`, `anon_`, `form_`). **As tabelas antigas têm nomes genéricos**
(`users`, `students`, `sessions`, `forms`, `scores`, `assessments`,
`receipts`, `audit_logs`) e são as que podem ter homônimas no outro sistema
(P58). O esquema completo, gerado a partir do banco real, está em
`docs/modelagem/esquema_atual.sql`.

Chaves de pessoa: `users.email` e `users.matricula` são únicos;
`students.matricula` é único; a conta do aluno aponta para o cadastro
acadêmico por `users.student_id`.

### 2.6 Perfis e permissões

Perfis (`core/roles.js`): `ADMIN`, `PROFESSOR`, `ALUNO`, `COORDENACAO`,
`NUCLEO_AVALIACAO`, `CSTI`, `OPERACIONAL`.

Permissões: `admin.manage`, `assessment.own`, `results.own`, `evolution.own`,
`evolution.all`, `osce.manage`, `osce.results`, `osce.respond`,
`teacher_eval.manage`, `teacher_eval.answer`, `teacher_eval.own`,
`teacher_eval.all`, `receipts.own`, `receipts.verify`, `articulation.manage`,
`articulation.answer`, `articulation.own`, `articulation.results`.

Quem tem cada uma está em [Arquitetura](ARQUITETURA.md).

### 2.7 Auditoria

Uma tabela só, `audit_logs`, com ação, autor, origem e detalhes. As ações têm
o nome do módulo na frente (`OSCE_...`, `ARTICULACAO_...`, `DOCENTE_...`,
`COMPROVANTE_...`, `ADMIN_...`); as das telas antigas não têm
(`SALVAR_RASCUNHO`, `PUBLICAR_NOTAS`, `IMPORTAR_EXCEL`, `ENCERRAR_AVALIACAO`,
`ALTERAR_CABECALHOS`, `CONFIGURAR_QUESTAO`, `LOGIN`).

### 2.8 Interface

- **Nomes globais dos registros:** `window.SupremaUI`, `SupremaAPI`,
  `SupremaModules`, `SupremaViews`, `SupremaHooks`, `SupremaStudentImport`.
- **Uma tela antiga declara nomes no escopo global da página:**
  `features/avaliacoes/app.js` tem 67 declarações soltas, entre elas `api`,
  `toast`, `fmt`, `h`, `present`, `assessments` e `dirty`. Qualquer script do
  outro sistema carregado na mesma página que use um desses nomes entra em
  conflito (P56). Os demais arquivos da interface são fechados em si.
- **Estilos:** só `styles/modulos.css` é restrito à classe `.mod-root`. Os
  outros três arquivos gerais usam nomes comuns sem prefixo (`.btn`, `.panel`,
  `.card`, `.table`, `.tab`, `.sidebar`, `.nav-item`, `.toast`):
  `styles.css` tem 293 seletores de classe, `modern.css` 193 e
  `ajustes-visuais.css` 23. O `index.html` tem 78 identificadores (`id`) (P57).
- **Ordem de carga:** o `index.html` carrega todos os estilos e scripts, em
  ordem fixa; os módulos entram antes de `features/avaliacoes/app.js`.

### 2.9 O que cada módulo usa do núcleo

Serve para o caminho B (levar módulos daqui para o outro tronco): mostra o que
precisa existir lá, ou ser levado junto.

Todo módulo recebe do núcleo `{app, db, auth, can, hasPermission,
revokeUserSessions, clearLoginAttempts, hashPassword}`. Os três últimos só são
usados pela administração e pela importação de alunos.

| Módulo | Importa do núcleo | Tabelas próprias |
| --- | --- | --- |
| osce | `core/domain`, `core/forms`, `core/calculo/osce`, `exceljs` | `osce_*`; usa `forms` e `form_*` |
| avaliacao-docente | `core/domain`, `core/forms`, `core/receipts` | `teacher_eval_*`; usa `anon_*` e `forms` |
| articulacao | `core/domain`, `core/privacy`, `core/receipts`, `core/calculo/articulacao`, `exceljs` | `articulation_*` |
| comprovantes | `core/domain`, `core/receipts` | `receipts` |
| avaliacoes | `core/domain`, `core/grade-history` | `assessments`, `scores`, `published_scores` e as de configuração |
| planilhas | `core/domain`, `core/grade-history`, `shared/spreadsheets`, `exceljs` | usa as de avaliações |
| alunos | `core/domain`, `core/privacy` | usa as de avaliações |
| evolucao | nada além do contexto | usa as de avaliações |
| administracao | `core/domain`, `core/roles`, `core/user-management`, `core/account-creation`, `core/grade-history` | `users`, `students`, as acadêmicas |
| importacao-alunos | `core/domain`, `core/security`, `core/account-creation`, `shared/spreadsheets`, `exceljs` | `student_import_runs` |

Todos dependem de `users` e, quando tratam de aluno, de `students`. OSCE,
Avaliação Docente, Articulação e Comprovantes são os mais fáceis de levar:
têm SQL separado em `store.js`, tabelas com prefixo e testes próprios.

## 3. Regras do tronco

Regras de convivência para que os dois sistemas não se atrapalhem. As quatro
primeiras já valem aqui; as demais passam a valer na integração.

1. Um módulo por funcionalidade, em pasta própria, que só importa o núcleo.
2. Toda rota de um módulo fica sob um prefixo só dele, declarado no manifesto.
3. Toda tabela nova tem o prefixo do módulo. Tabela alheia não é alterada: se
   for preciso, a mudança entra no núcleo, por migração nova.
4. Acesso por permissão, com o nome `modulo.acao`.
5. Um cadastro de pessoas e um login para os dois sistemas.
6. Uma sequência única de migrações. Nenhuma migração já aplicada em algum
   ambiente é editada ou renumerada; a união se faz com migrações novas.
7. Nomes de variáveis de ambiente, cookies e ações de auditoria com prefixo.
8. Na interface, nada no escopo global além dos registros, e estilos de cada
   módulo sob uma classe raiz.
9. Fórmula da instituição fica em arquivo próprio, com teste que a confere
   contra a planilha de origem. Nenhuma fórmula é inventada.
10. Só dados fictícios em código, testes e documentação.

## 4. Onde pode haver conflito

| Ponto | Por que pode colidir | Como conferir no outro sistema | O que fazer |
| --- | --- | --- | --- |
| Cadastro de pessoas | Dois conjuntos de contas para as mesmas pessoas | Comparar as tabelas de usuário e de aluno e a chave de cada uma | Escolher uma chave comum (matrícula ou e-mail) e um cadastro só (P49) |
| Senhas | Formatos de hash diferentes não se convertem | Ver como a senha é guardada | Aceitar os dois formatos no login e regravar no formato do tronco, ou exigir nova senha (P50) |
| Sessão e cookie | Dois logins no mesmo endereço | Nome do cookie, onde a sessão fica guardada | Um mecanismo só (P48, P53) |
| Perfis | Mesmo nome com sentidos diferentes, ou nomes diferentes para o mesmo papel | Listar os perfis e o que cada um pode | Tabela de correspondência (P51) |
| Rotas | Mesmo caminho nos dois (`/api/admin`, `/api/student`, `/api/login`) | Listar as rotas | Prefixo por módulo; renomear o que colidir (P60) |
| Tabelas | Nomes genéricos iguais (`users`, `students`, `forms`, `scores`) | Listar as tabelas | Unificar as que são a mesma coisa; renomear as que só têm o nome igual (P58) |
| Migrações | Duas numerações, ou um sistema sem migrações | Ver como o banco do outro é criado e alterado | Sequência única a partir da junção (P59) |
| Motor do banco | SQLite aqui; o outro pode usar outro | Ver o motor e o acesso | Decidir o motor do tronco (P52); o SQL das telas antigas daqui está dentro das rotas (P31) |
| Versão do Node e bibliotecas | Versões incompatíveis do Node, do Express ou de planilhas | `package.json` e a versão em uso | Uma versão só (P64) |
| Nomes globais na página | `app.js` daqui declara 67 nomes globais | Ver se o outro carrega scripts na mesma página e com que nomes | Fechar `app.js` em si antes de juntar as telas (P56) |
| Estilos | Classes comuns sem prefixo dos dois lados | Listar as classes dos estilos gerais do outro | Classe raiz por sistema ou por módulo (P57) |
| Variáveis e portas | `PORT`, `HOST`, `API_URL`, portas 3002 e 3003 | `.env` e portas do outro | Prefixo e portas distintas (P61) |
| Regras de negócio | A mesma coisa calculada de dois jeitos | Comparar fórmulas e arredondamentos | Decide a instituição, nunca o código (P47) |

## 5. O que levantar do outro sistema

É a pendência P46. Sem estas respostas a integração é feita no escuro.

**Ambiente**

- Versão do Node (ou outra linguagem), framework do servidor e bibliotecas
  principais.
- Como se instala, como se inicia e em que portas.
- Tem etapa de build na interface? Usa algum framework de tela?
- Variáveis de ambiente que lê.

**Dados**

- Motor do banco e como o banco é criado e alterado (migrações?).
- Lista das tabelas, com as chaves.
- Como identifica uma pessoa: matrícula, e-mail, outro código.
- Já está em uso com dados reais? Há dados a migrar?

**Acesso**

- Como é o login, como a senha é guardada, onde fica a sessão, nome do cookie.
- Perfis que existem e o que cada um pode.
- A autorização é por perfil ou por permissão?
- Tem registro de auditoria? Em que formato?

**Funcionalidades**

- Lista das funcionalidades, com as rotas de cada uma.
- Quais se sobrepõem às daqui (por exemplo, cadastro de alunos, notas,
  formulários) e quais são só dele.
- Há fórmulas ou regras da instituição? De onde vieram?

**Interface**

- Uma página só ou várias? Como as telas são carregadas?
- Nomes globais e classes de estilo dos arquivos gerais.
- Identidade visual: é a mesma daqui?

**Qualidade**

- Tem testes? Quantos, como rodam, quanto cobrem?
- Tem repositório remoto, revisão e verificação automática?
- Tem documentação de arquitetura?

## 6. Passo a passo

Cada fase termina com os testes dos dois sistemas passando. Nada segue para a
fase seguinte com teste quebrado ou desligado.

| Fase | O que fazer | Pronto quando |
| --- | --- | --- |
| 0. Preparar | Repositório remoto para este sistema e CI rodando (P55, P19). Receber o código do outro (P45). Preencher a seção 5 (P46). Definir quem decide conflitos de regra (P47) | Os dois sistemas rodam e passam nos próprios testes em uma máquina limpa |
| 1. Decidir o tronco | Comparar os núcleos e escolher o caminho A, B ou C (P48). Decidir cadastro de pessoas, senhas, perfis, banco e endereço (P49 a P54) | As decisões estão escritas e aceitas por quem responde pelos dois sistemas |
| 2. Limpar o terreno aqui | Fechar os nomes globais de `app.js` (P56), dar classe raiz aos estilos gerais (P57), prefixar variáveis e portas (P61), alinhar versões (P62, P64), levar a criação das tabelas de base para a sequência de migrações (P59) | `npm test` (335) e o teste de navegador (24) passam; nada mudou para quem usa |
| 3. Unir o núcleo | Um login, uma sessão, um cadastro de pessoas, uma tabela de permissões, uma sequência de migrações, uma auditoria | Uma pessoa entra uma vez e alcança o que os seus perfis permitem nos dois sistemas |
| 4. Trazer os ramos | Uma funcionalidade por vez, como módulo: rotas com prefixo, tabelas com prefixo, tela registrada, testes próprios. Resolver cada colisão da seção 4 quando aparecer | Cada módulo entra em uma mudança separada, revisada, com os testes dos dois lados passando |
| 5. Unir a interface | Menu único por perfil, identidade visual única (P54), remoção das telas duplicadas | Cada perfil vê um menu só |
| 6. Fechar | Migrar os dados reais em ambiente de ensaio, com backup antes; atualizar a documentação, os contratos e o esquema do banco | Ensaio de migração conferido e roteiro de volta atrás testado |

A fase 2 pode começar já: não depende do outro sistema e não muda o
comportamento. As demais dependem das respostas da seção 5.

## 7. O que não pode quebrar

Estas garantias valem hoje e têm testes. Na integração, os testes delas são
atualizados quando o conjunto muda; nunca desligados.

- **`calcScore`** (`apps/api/src/core/domain.js`), a fórmula das notas de A1,
  A2 e A3, não é alterada.
- **Histórico de notas imutável** e publicações com retrato do que foi
  publicado.
- **Respostas de formulário imutáveis**: só podem ser anuladas, com motivo.
- **Avaliação Docente anônima**: a resposta não guarda quem respondeu, e a
  participação não guarda a resposta.
- **Números de grupo pequeno ficam ocultos** (mínimo de 5, configurável).
- **Comprovantes** provam a participação, nunca o conteúdo.
- **Fórmulas da instituição** (`core/calculo/`) dão o mesmo número das
  planilhas de origem.
- **Acesso de fora da máquina só por HTTPS**; senha provisória com troca
  obrigatória; limite de tentativas de login.
- **Dados reais nunca entram no repositório.**

Testes que travam de propósito quando o conjunto muda e que, por isso, vão
pedir atualização durante a integração (P63):

| Teste | O que confere |
| --- | --- |
| `tests/integration/perfis.test.js` | A lista exata de permissões de cada perfil |
| `tests/integration/esquema_documentado.test.js` | O esquema documentado é igual ao banco real (`npm run docs:schema` regenera) |
| `tests/architecture/*.test.js` e `scripts/check.js` | Módulo não importa módulo; isolamento de processos |
| `tests/integration/migracoes.test.js` | Identificadores das migrações em ordem, cada uma aplicada uma única vez, cópia de segurança antes de migrar |

## 8. Como conferir a cada passo

```sh
npm ci
npm test                        # sintaxe, lint, formato e 335 verificações de servidor
python tests/browser/smoke.py   # 24 verificações de navegador (Python + Playwright)
npm run docs:schema             # depois de qualquer migração
```

Se um arquivo de teste falhar com "bad port", repita: é a porta sorteada pelo
sistema (P44).

## 9. Onde está o restante

| Documento | Para quê |
| --- | --- |
| [Pendências](PENDENCIAS.md) | Tudo o que falta, numerado |
| [Arquitetura](ARQUITETURA.md) | Como o sistema é montado, módulos e permissões |
| [Como criar um módulo](COMO_CRIAR_UM_MODULO.md) | Roteiro para acrescentar uma funcionalidade |
| [Mapa de pastas](MAPA_DE_PASTAS.md) | O que há em cada pasta |
| [Contratos](../packages/contracts/README.md) | Rotas, permissões e formatos |
| [Validação](VALIDACAO.md) | O que foi testado e o que não foi |
| `docs/modelagem/esquema_atual.sql` | Esquema do banco, gerado do banco real |
| `CONTEXTO_IA.md` e `HANDOFF.md`, na raiz | Estado do projeto e histórico das decisões |
