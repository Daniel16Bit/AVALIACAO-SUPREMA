# Contrato entre interface e API

Toda chamada do navegador usa um caminho relativo começando por `/api`.
`API_URL` pertence ao servidor web; não é inserida no JavaScript público.

| Operação | Rota | Observações |
| --- | --- | --- |
| Entrar | `POST /api/login` | JSON `{login,password}`; retorna `{ok,user}` e cookie HttpOnly |
| Sessão | `GET /api/me` | `{id,name,role,roleLabel,studentId,mustChangePassword}`; 401 sem sessão |
| Trocar a própria senha | `POST /api/me/password` | JSON `{current_password,new_password}`; qualquer perfil; encerra as outras sessões da conta |
| Sair | `POST /api/logout` | invalida sessão e cookie |
| Saúde | `GET /api/health` | estado da API e carregamento dos módulos |
| Prontidão | `GET /api/ready` | 200 completo, 503 degradado |
| Administração | `/api/admin/*` | perfil ADMIN |
| Perfis | `GET /api/admin/roles` | `[{id,name,managed}]`; `managed: false` não é criado nem alterado pelo cadastro |
| Avaliações | `/api/assessments`, `/api/assessment/:id/*` | professor vinculado |
| Histórico de notas | `GET /api/assessment/:id/score-history` | professor titular; `{changes,changes_truncated,publications,labels}` |
| Histórico de notas (admin) | `GET /api/admin/assessments/:id/history` | qualquer avaliação; inclui `assessment` |
| Resultados publicados | `/api/student/*` | aluno titular |
| Evolução | `GET /api/evolution` | ADMIN ou PROFESSOR, conforme autorização |
| OSCE — montagem | `GET/POST /api/osce/events`, `GET/PUT/DELETE /api/osce/events/:id`, `POST .../release`, `.../close`, `.../reopen` | permissão `osce.manage` (Núcleo de Avaliação) |
| OSCE — resultados e notas | `GET /api/osce/events/:id/results`, `GET /api/osce/events/:id/results/export` | permissão `osce.results`; a segunda devolve a planilha no formato da instituição |
| OSCE — anular resposta | `POST /api/osce/submissions/:id/void` | `osce.manage`; JSON `{reason}`; a resposta anulada continua guardada |
| OSCE — responder | `GET /api/osce/respond/events`, `GET /api/osce/respond/stations/:id`, `POST /api/osce/respond/stations/:id/submissions` | permissão `osce.respond` (conta operacional); só OSCE liberado |
| Avaliação Docente — montagem | `GET/POST /api/teacher-eval/campaigns`, `GET/PUT/DELETE /api/teacher-eval/campaigns/:id`, `POST .../release`, `.../close`, `.../reopen` | permissão `teacher_eval.manage` (CSTI); encerrar é definitivo |
| Avaliação Docente — responder | `GET /api/teacher-eval/pending`, `GET /api/teacher-eval/targets/:id`, `POST /api/teacher-eval/targets/:id/answers` | permissão `teacher_eval.answer` (aluno matriculado na disciplina) |
| Avaliação Docente — resultados | `GET /api/teacher-eval/mine`, `GET /api/teacher-eval/results` | `teacher_eval.own` (professor, só os seus) e `teacher_eval.all` (Coordenação) |
| Comprovantes — aluno | `GET /api/receipts/mine`, `GET /api/receipts/:code/pdf` | permissão `receipts.own`; o PDF só sai para o dono ou para quem tem `receipts.verify`; para os demais a resposta é 404 |
| Comprovantes — verificação | `POST /api/receipts/verify`, `POST /api/receipts/search` | permissão `receipts.verify` (Administrador e CSTI) |
| Articulação — montagem | `GET/POST /api/articulation/forms`, `GET/PUT/DELETE /api/articulation/forms/:id`, `POST .../release`, `.../finish`, `.../publish`, `.../reopen`, `PUT /api/articulation/defaults` | permissão `articulation.manage` (CSTI) |
| Articulação — responder | `GET /api/articulation/open`, `GET /api/articulation/open/:id`, `POST /api/articulation/open/:id/answers` | permissão `articulation.answer` (aluno); só avaliação liberada; uma resposta por aluno |
| Articulação — resultados | `GET /api/articulation/results`, `GET /api/articulation/results/:id`, `GET /api/articulation/results/:id/export` | `articulation.manage` (sempre) ou `articulation.results` (Coordenação, só com os resultados liberados; antes disso, 404) |
| Articulação — tutor | `GET /api/articulation/mine` | permissão `articulation.own` (professor vinculado a um tutor da lista) |

Erros retornam JSON `{error: string}` com status HTTP. Indisponibilidade adiciona
`code: 'API_UNAVAILABLE'` (proxy) ou `code: 'MODULE_UNAVAILABLE'` e `module` (API).
401 exige autenticação; 403 nega permissão; 409 indica conflito; 423 indica
bloqueio operacional; 429 indica excesso de tentativas (cabeçalho `Retry-After`).
Enquanto a conta tiver senha provisória, toda rota exceto `GET /api/me` e
`POST /api/me/password` retorna 403 com `code: 'PASSWORD_CHANGE_REQUIRED'`. A interface só confirma operações após resposta de sucesso.
Não há sucesso fictício nem armazenamento offline substituindo o banco.

Gravações de avaliação usam o campo `revision` do estado carregado. Revisão
antiga retorna 409; a interface deve atualizar e pedir conciliação das mudanças.
Rascunho e resultado publicado continuam separados. Publicar exige validação
no servidor. Falha na confirmação não permite inferir sucesso da operação.

Senha provisória: toda senha definida por um administrador (cadastro individual,
redefinição ou importação) obriga a pessoa a trocá-la no primeiro acesso.
`POST /api/admin/student-import/confirm` não aceita mais o campo `password`:
cada conta criada recebe uma senha provisória individual, devolvida uma única
vez em `credentials: [{row_id,name,matricula,period,password}]`. Essas senhas
não são gravadas no banco, no relatório persistido nem na auditoria.

Valor máximo dos instrumentos: `PUT /api/assessment/:id/instrument-config` recebe
`{revision, field_key, max_value}`, com `field_key` entre `pbl1`, `pbl2`,
`osce1` a `osce4`, `osce`, `q7`, `q8`, `q9` e `trabalho`; `max_value` nulo remove
o valor. `GET /api/assessment/:id` devolve `instrumentConfig`. O valor é
opcional e não entra na soma da nota final; quando declarado, a publicação e a
importação recusam nota acima dele. As estatísticas
(`GET /api/assessment/:id/stats` e a rota do aluno) trazem `instrumentStats:
[{field_key, mean, used, max_value}]`; em `osce`, `max_value` é a soma dos
máximos das estações em uso, ou nulo se alguma delas não tiver máximo.

Resultado do aluno (`GET /api/student/assessment/:id`): a resposta traz
`classFigures: {available, minimum}`. Quando a turma tem menos resultados
publicados que o mínimo (`SUPREMA_MIN_AGGREGATE_STUDENTS`, padrão 5),
`available` é falso e média, desvio, mediana, posição, contagens acima/abaixo e
as médias por questão e por instrumento vêm nulas. A interface não deve
desenhar comparação com a turma nesse caso.

Avaliação Docente: `PUT /api/teacher-eval/campaigns/:id` grava o rascunho
inteiro: `{revision, year, semester, round_name, period, min_responses,
questions: [{text}], assignment_ids}`; `min_responses` aceita de 3 em diante.
`GET .../campaigns/:id` devolve `adherence: [{professor_name, discipline_name,
eligible, answered}]`: contagens, nunca nomes de alunos. Uma resposta envia
`{answers: [{question_id, value, comment}]}`, com `value` `SIM`, `NAO` ou `NA`;
a resposta de sucesso não devolve identificador, e uma segunda tentativa
retorna 409. As rotas de resultado só listam avaliações encerradas. Cada item
traz `responses`, `min_responses` e `sufficient`; quando `sufficient` é falso,
`questions` vem vazio e `total` nulo. Em `results`, o total de cada avaliação
soma somente os professores com respostas suficientes. Comentários vêm como
texto, em ordem sorteada a cada leitura.

Comprovantes: `POST /api/receipts/verify` recebe `{code}` e devolve
`{valid: true, receipt: {code, kind, title, detail, issued_at, student_name,
student_matricula}}` ou `{valid: false}`. O código aceita maiúsculas,
minúsculas, espaços e traços. `kind` é `AVALIACAO_DOCENTE` ou `ARTICULACAO`.
Toda ação do aluno que gera comprovante devolve `receipt: {code}` na resposta
de sucesso. O comprovante nunca traz o conteúdo das respostas.

Articulação: `PUT /api/articulation/forms/:id` grava o rascunho inteiro:
`{revision, title, year, semester, questions: [{section, text, kind, justify}],
options: {PERIODO: [{label}], TUTOR: [{label, professor_id}], ESTACAO:
[{label}]}}`. `kind` é `NOTA_0_10`, `SIM_NAO`, `SIM_NAO_PARCIAL`, `PERIODO`,
`TUTOR` ou `ESTACAO`. A liberação exige exatamente uma pergunta `TUTOR` e
listas não vazias para os tipos usados. As situações são `RASCUNHO`,
`LIBERADO`, `FINALIZADO` e `RESULTADOS_LIBERADOS`; `reopen` volta uma etapa.
Uma resposta envia `{answers: [{question_id, value | option_id,
justification}]}`: `value` é `SIM`, `NAO`, `PARCIAL` ou um inteiro de 0 a 10;
`option_id` é um item da lista da própria avaliação. Os resultados trazem
`general`, `tutors[].questions` e `tutors[].periods[]` (`{period, responses,
questions}`, um por período em que o tutor recebeu respostas; vazio quando a
avaliação não tem exatamente uma pergunta `PERIODO`). Cada pergunta traz
`justifications` e, conforme o tipo: `distribution` (11 posições, notas de 0 a
10), `average` (duas casas), `lowest` e `highest`; ou `counts` e `shares`
(percentual inteiro de cada resposta); ou `choices`. A média e os percentuais
dividem pelo total de respostas do quadro e são nulos em quadro sem respostas.
Não há número único por tutor nem classificação: `performance: {available:
false, message}`. Em `mine`, um grupo com menos respostas que o mínimo
(`SUPREMA_MIN_AGGREGATE_STUDENTS`, padrão 5) vem com `withheld: true` e
`questions` vazio; `periods` só vem preenchido quando todos os períodos do
tutor atingem o mínimo. A exportação devolve um `.xlsx` com a aba de respostas,
nas colunas do formulário anterior, e uma aba por tutor e período com três
linhas de totais em fórmulas (`COUNTA`, `SUM`/`MIN`/`MAX` e `COUNTIF`).

Importação de notas: a planilha precisa da coluna Matrícula. O casamento pelo
nome deixou de existir; planilha sem a coluna, ou linha com nota e sem
matrícula, é recusada sem alterar nada.

OSCE: um evento por ano, semestre, rodada e período, com as situações
`RASCUNHO`, `LIBERADO` e `ENCERRADO`. `PUT /api/osce/events/:id` grava o
rascunho inteiro: `{revision, year, semester, round, period, key_question,
key_question_text, stations: [{name, questions: [{text}]}], student_ids}`.
Depois de liberado a estrutura não muda (423). A pergunta-chave, quando ligada,
é gravada pelo servidor como primeira pergunta de cada estação e não vem em
`questions`. Uma resposta envia `{student_id, answers: [{question_id, value,
comment}]}`, com `value` `SIM` ou `NAO` para todas as perguntas; segunda
resposta válida para o mesmo aluno na mesma estação retorna 409.

Notas do OSCE (`GET /api/osce/events/:id/results`), pelas fórmulas da planilha
da instituição (`core/calculo/osce.js`). Cada estação traz `items` (quantos
itens tem, sem a pergunta-chave), `average` e, em cada linha de aluno, `hits`
(acertos, que podem ter meio ponto) e `grade` (de 0 a 1). `consolidated` traz
`students: [{student, grades, evaluated, final}]`, com uma nota por estação
(`null` onde o aluno não foi avaliado) e a média delas, e `average`, a média de
todas as notas. As notas vêm com duas casas; as médias são feitas sobre os
valores exatos. Nenhuma rota do OSCE devolve nota de aprovação, peso ou
classificação.

Importação de notas mantém `multipart/form-data`; prévia de importação de
alunos mantém `application/octet-stream`. Exportação retorna arquivo binário.
O proxy transmite corpos e respostas em streaming; não converte tudo para JSON.

O acesso é decidido por permissão (`role_permissions`), não pelo nome do perfil:
as rotas usam `can('permissao')`. Um módulo novo cria suas permissões em uma
migração numerada e as concede aos perfis que devem usá-lo.

Para adicionar um módulo, registre suas rotas e o predicado `owns` no manifesto,
priorizando rotas específicas antes de rotas gerais. Adicione teste para a falha
do módulo e mantenha a autenticação nas rotas. Módulos não importam diretamente
outros módulos; regras comuns pertencem ao núcleo ou a `shared`.
