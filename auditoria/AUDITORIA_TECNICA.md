# Avaliação Suprema — Auditoria Técnica (Fase 1)

Data: 11/11/2026 · Base auditada: `projeto/Projeto-Suprema-main` (versão 11.9.0, idêntica ao `backup/Projeto-Suprema-main.zip`)

**Nenhum arquivo do projeto foi alterado.** Este relatório é o único arquivo criado, fora da pasta do sistema.

## Como ler este relatório

- **Método:** leitura integral do backend (1.276 linhas), dos servidores, scripts e documentação; leitura integral das telas de avaliação, aluno e indicadores; leitura dirigida (funções e pontos de escape de HTML) das telas de administração, importação e evolução.
- **O que não foi executado:** a suíte de testes. Esta máquina não tem Node.js instalado, então os 201 testes que `docs/VALIDACAO.md` declara aprovados (Linux, 09/11) **não foram reexecutados aqui**. Os achados abaixo vêm de leitura de código, não de exploração em execução.
- **Sem banco de demonstração:** a pasta `data/` está vazia. Os números da especificação (335 contas, 17 avaliações, registros legados "A3 de A1/A2") não puderam ser conferidos.
- **Decisões que você já tomou e que este relatório adota:**
  1. `Projeto-Suprema-main` é a base oficial.
  2. Evoluir ou reconstruir ficou a meu critério → **recomendo evoluir** (justificativa na seção 1).
  3. Banco de dados "em evolução" → SQLite continua; a troca para PostgreSQL fica preparada, não executada.
  4. Fórmulas ausentes → os módulos novos são desenhados para funcionar sem elas e recebê-las depois como uma peça isolada (seção 8).

---

## 1. Diagnóstico da arquitetura atual

**Resumo:** a base é pequena, coerente e melhor do que o tamanho sugere. As regras críticas (rascunho × publicação, isolamento por perfil, concorrência, cálculo no servidor) estão implementadas no backend e cobertas por testes. Os problemas são de segurança operacional (login e senhas), de rastreabilidade de notas e de manutenção do código — não de fundamento.

| Camada | O que existe |
| --- | --- |
| Processos | Dois processos Node: `apps/web/server.js` (arquivos estáticos + proxy `/api`, só módulos nativos) e `apps/api/server.js` (Express 5). Portas 3002 e 3003. |
| API | `apps/api/src/app.js` monta segurança, depois carrega 6 módulos por um manifesto (`modules/index.js`). Um módulo que falha ao carregar responde 503 sozinho, sem derrubar os demais. |
| Núcleo | `core/domain.js` (fórmula, validação de notas, sincronização de vínculos, estatísticas), `core/security.js` (login, sessão, perfil), `core/database.js` (esquema), `core/user-management.js`, `core/account-creation.js`. |
| Persistência | SQLite pelo módulo nativo `node:sqlite` (síncrono), arquivo único `data/avaliacao_suprema.db`. 18 tabelas. Esquema criado e ajustado na abertura do banco (`CREATE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`). |
| Frontend | Página única (`index.html`) em HTML/CSS/JavaScript puro, sem framework nem etapa de build. Gráficos desenhados à mão em SVG/CSS, sem biblioteca. |
| Dependências | Apenas `express` e `exceljs`. 242 pacotes no lock, 6 transitivos marcados como obsoletos (todos puxados pelo `exceljs`). |
| Testes | 4 suítes de integração (API, usuários, importação, matrículas), 1 de isolamento de módulos, 1 de navegador (Python/Playwright, fora da CI). |
| CI | `.github/workflows/ci.yml` roda `npm ci` + `npm test`. Sem lint, sem análise de dependências. |

**Por que evoluir e não reconstruir.** A fórmula, a publicação por snapshot, o controle de revisão (HTTP 409), a importação com prévia e o isolamento professor/aluno já existem e têm cerca de 190 verificações automatizadas. Reconstruir descartaria isso e reintroduziria risco exatamente nas regras acadêmicas. A especificação continua valendo como lista de requisitos e de testes de aceitação (AT-01 a AT-20); só a instrução "construir de forma independente" é que fica sem efeito.

---

## 2. Mapa dos módulos e funcionalidades

| Módulo da API | Rotas | Perfil | Tela correspondente |
| --- | --- | --- | --- |
| Segurança (`core/security.js`) | `POST /api/login`, `POST /api/logout`, `GET /api/me` | todos | login em `features/avaliacoes/app.js` |
| `administracao` | `/api/admin/*`: resumo, usuários, senha, cursos, disciplinas, vínculos, matrículas (individual e por período), avaliações, bloqueio, controles, auditoria, saúde | ADMIN | `features/administracao/admin.js` |
| `importacao-alunos` | `/api/admin/student-import/preview`, `/review`, `/confirm`, `/:id/report` | ADMIN | `features/importacao-alunos/` |
| `avaliacoes` | `/api/assessments`, `/api/assessment/:id` + `/headers`, `/question-config`, `/scores`, `/publish`, `/send-one`, `/send-all`, `/audit-history`, `/stats` | PROFESSOR | `features/avaliacoes/app.js`, `features/indicadores/` |
| `planilhas` | `/api/assessment/:id/import`, `/import/confirm`, `/export` | PROFESSOR | `app.js` (importar, modelo, exportar, colar do Excel) |
| `alunos` | `/api/student/assessments`, `/api/student/assessment/:id` | ALUNO | `app.js` + `features/academico/` |
| `evolucao` | `GET /api/evolution` | ADMIN, PROFESSOR | `features/evolucao/` |
| Infra | `/api/health`, `/api/ready`, `/api/setup-status` | público | `shared/service-status.js` |

Scripts operacionais: `npm run admin` (cria/redefine o administrador pelo terminal), `npm run backup` (cópia consistente do SQLite com verificação), `npm run check` (sintaxe e fronteiras entre módulos).

---

## 3. Componentes visuais que devem ser preservados

| Elemento | Onde está | Observação |
| --- | --- | --- |
| Paleta | `styles/styles.css` e `modern.css` (`--navy #05305b/#07386d`, `--blue #0877e6`, `--green #1aa35b`, `--red #e34f55`, `--line`, `--surface`) | Gráficos usam azul `#2563c5`, verde `#169c71` e âmbar `#dca54f` para a régua de 60%. |
| Tipografia | Inter / Segoe UI / Arial | Sem fonte externa; a CSP proíbe carregar de fora. |
| Login | Tela dividida: foto do campus + marca "S SUPREMA" à esquerda, formulário à direita | `assets/suprema-campus.jpg`. |
| Estrutura pós-login | Barra lateral azul-marinho com marca e itens de navegação com ícone de glifo; barra superior com nome e "Sair" | Os três módulos novos já têm botão na barra lateral, marcado "Em desenvolvimento" (`index.html` linhas 29–31). |
| Contexto do professor | Seletores Ano / Semestre / Período / Disciplina, alternador A1/A2/A3, abas Lançamento / Resultados da Turma / Resultado Individual | |
| Componentes | `.btn` / `.btn.primary`, `.card.metric-card` (cores blue/green/purple/orange/good/bad), `.panel`, `.detail-table`, `.admin-table`, diálogo `SupremaUI.modal`, `#toast`, aviso de conexão | Os módulos novos devem usar exatamente estes. |
| Gráficos | Histograma, barras horizontais, comparativo aluno × turma, teia (radar) com anel de 60%, linha de evolução | Todos em SVG/CSS próprios. |
| Responsividade | Quebras em 980, 900, 850, 800 e 560 px; folha de impressão para o resultado do aluno | |

Três folhas de estilo se sobrepõem (`styles.css` → `modern.css` → `ajustes-visuais.css`). Funciona, mas qualquer ajuste visual precisa ser conferido nas três.

---

## 4. Já implementado — não precisa ser recriado

- **Fórmula acadêmica** exatamente como documentada (`core/domain.js:16`): `nota_prova` = c1..c6 + me1..me4; OSCE = soma das estações quando há alguma, senão o valor direto; `nota_final` soma os componentes sem contar as estações duas vezes; `q10` fora; ausentes = zero; duas casas; sem teto de 0 a 10. O navegador recalcula só para exibir; o servidor ignora totais enviados.
- **Rascunho × publicação:** tabelas separadas (`scores` e `published_scores`); o aluno só lê `published_scores` com `sent=1`; a publicação grava junto os metadados (cabeçalhos, configuração de questões, contexto).
- **Validação de publicação:** questão usada sem área ou sem valor máximo, ou com nota acima do máximo, bloqueia com lista de pendências.
- **Concorrência:** número de revisão por avaliação; revisão antiga recebe 409.
- **Encerrar / reabrir:** professor encerra só depois de publicar; só o administrador reabre.
- **Isolamento:** professor só alcança avaliações em que é o titular e cujo vínculo, disciplina e curso estão ativos; aluno é identificado pela sessão, nunca por parâmetro.
- **Cadastros administrativos:** usuários (com prévia de impacto antes de excluir e bloqueio quando há notas), cursos, disciplinas, vínculos, matrículas individuais e por período, pausas operacionais.
- **Importação de alunos** (.xlsx e .xls) com prévia, revisão, confirmação, relatório, leitura isolada em thread com limites de memória e tempo.
- **Planilhas de notas:** modelo com aba de controle oculta, importação com prévia e confirmação transacional, exportação, colagem de bloco do Excel.
- **Painéis:** distribuição, média por instrumento, média por questão com régua de 60%, ranking, aluno × turma, teia da turma e do estudante, quatro grupos, evolução acadêmica, painel longitudinal do aluno.
- **Defesas já presentes:** senha com scrypt e salt; cookie HttpOnly + SameSite=Strict; conferência de origem em toda escrita; CSP sem script inline; consultas SQL parametrizadas; escape de HTML consistente nas telas; verificação de bomba ZIP antes de abrir planilhas; erros internos sem stack para o usuário.

---

## 5. Vulnerabilidades e problemas de segurança

Não encontrei injeção de SQL, XSS explorável, travessia de diretório nem rota administrativa sem verificação de perfil. Os problemas reais estão abaixo, em ordem de prioridade.

| # | Gravidade | Problema | Componente |
| --- | --- | --- | --- |
| S1 | **Alta** | Limite de tentativas de login enxerga todos os usuários como um único endereço | `core/security.js:26–27`, `apps/web/server.js:36` |
| S2 | **Alta** | Alunos importados em lote compartilham a mesma senha e não há como trocá-la | `importacao-alunos/routes.js:105`, ausência de rota |
| S3 | **Média** | Alterações de nota não deixam rastro do valor anterior | `core/domain.js:37`, `avaliacoes/routes.js:39,53` |
| S4 | **Média** | Sessões só em memória | `core/security.js:11` |
| S5 | **Média** | Operação em rede sem HTTPS é possível e sugerida no README | `README.md`, `.env.example`, `packages/http/security-headers.js` |
| S6 | **Média** | Controle de acesso fixo em três perfis; tabela de permissões nunca é consultada | `core/security.js:22,29`, `core/database.js:128` |
| S7 | Baixa | Importação de notas aceita casar aluno pelo nome | `planilhas/routes.js:52` |
| S8 | Baixa | Tempo de resposta do login revela se o usuário existe | `core/security.js:29` |
| S9 | Baixa | Turmas muito pequenas permitem deduzir a nota do colega | `alunos/routes.js` |
| S10 | Baixa | Backup manual, local, sem agendamento nem teste de restauração | `scripts/backup.js` |
| S11 | Baixa | Dependências transitivas obsoletas; CI sem auditoria | `package-lock.json`, `ci.yml` |
| S12 | Informativa | `/api/health` e `/api/setup-status` públicos revelam versão, módulos e se existe administrador | `app.js:31–33` |

### S1 — Limite de login compartilhado por todos (Alta)

- **O que acontece:** a API conta tentativas erradas por `endereço + login` (limite 6) e por `endereço` (limite 80), em janelas de 5 minutos. Mas todo acesso chega pela interface web, que funciona como proxy e remove o cabeçalho com o endereço real do cliente. A API vê sempre o endereço do proxy.
- **Impacto:** (a) seis senhas erradas para um login bloqueiam aquele login para **qualquer pessoa**, inclusive o dono com a senha certa — dá para manter o administrador ou um professor trancado indefinidamente repetindo isso; (b) 80 erros somados de todos os usuários em 5 minutos bloqueiam **o login de todo mundo**. Num dia de liberação de notas com 330 alunos digitando, isso pode ocorrer sem atacante.
- **Probabilidade / facilidade:** alta; não exige autenticação nem ferramenta.
- **Correção:** o proxy passa a informar o endereço real por um cabeçalho que só ele pode definir, e a API só confia nesse cabeçalho quando a conexão vem do proxy. Trocar o bloqueio rígido por atraso progressivo por conta. Criar teste que passe pelo proxy (hoje o teste de 429 fala direto com a API).
- **Ressalva:** conclusão por leitura de código; não foi reproduzida em execução.

### S2 — Senha inicial compartilhada e sem troca (Alta)

- **O que acontece:** na importação em lote, o administrador digita uma senha e ela vale para todas as contas criadas. O login é a matrícula. Não existe rota para o usuário trocar a própria senha nem troca obrigatória no primeiro acesso; só o administrador redefine.
- **Impacto:** qualquer aluno do lote conhece a senha de todos os colegas e basta saber a matrícula para entrar na conta alheia e ver as notas. Isso contorna, na prática, o isolamento entre alunos que o backend garante (AT-03).
- **Correção:** senha provisória individual por aluno (entregue no relatório da importação) **ou** código de primeiro acesso; troca obrigatória no primeiro login; tela "Alterar minha senha" para todos os perfis, exigindo a senha atual.

### S3 — Auditoria não registra o que mudou nas notas (Média)

- **O que acontece:** `audit_logs` guarda ação, autor e contagem ("rascunho salvo, 40 linhas"). Não guarda aluno, campo, valor antigo nem valor novo. Republicar sobrescreve o snapshot anterior em `published_scores`. A própria tela avisa: "não registra versões anteriores de cada célula".
- **Impacto:** se uma nota publicada for alterada, não há como provar qual era o valor anterior nem quem mudou qual aluno. Atende só em parte o AT-07 ("snapshot imutável") e o requisito de auditoria de notas do prompt mestre.
- **Correção:** tabela de histórico de publicações (uma linha por aluno por publicação, nunca atualizada) e registro de diferenças por célula ao salvar. A coluna de autor e o endereço de origem passam a ser colunas próprias em `audit_logs`, em vez de ficarem dentro de um texto JSON.
- **Efeito colateral atual:** o histórico por avaliação varre os últimos 3.000 registros em memória (`avaliacoes/routes.js:76`); com o uso, eventos antigos somem da tela.

### S4 — Sessões em memória (Média)

Reiniciar a API desconecta todos e apaga os contadores de tentativa. Impede rodar mais de uma instância. Correção: tabela de sessões no banco (guardando só o hash do token).

### S5 — HTTPS opcional (Média)

O cookie só recebe `Secure` se o TLS estiver configurado; não há cabeçalho HSTS; o README orienta `HOST=0.0.0.0` para acesso pela rede local sem exigir TLS. Nessa configuração, senhas e sessão trafegam em claro. Correção: recusar iniciar em endereço não local sem TLS (ou sem declarar proxy HTTPS), e enviar HSTS quando houver TLS.

### S6 — Perfis fixos (Média, e pré-requisito dos módulos novos)

`role('ADMIN')` compara igualdade com um único perfil, e o login só aceita ADMIN, PROFESSOR e ALUNO. A tabela `role_permissions` é preenchida e nunca lida; a coluna `invalid_attempts` também não é usada. Coordenação, Núcleo de Avaliação, CSTI e Usuário Operacional não cabem sem mexer aqui. Correção na seção 7.

### Demais itens

- **S7:** quando a planilha não tem coluna de matrícula, o servidor casa pelo nome (exige correspondência única). A especificação pede matrícula. Recomendo exigir matrícula e rejeitar com mensagem clara.
- **S8:** quando o login não existe, a verificação de senha é pulada e a resposta volta mais rápido. Correção: sempre executar uma verificação de custo equivalente.
- **S9:** o aluno recebe média, mediana, contagem acima/abaixo e posição. Com 2 ou 3 alunos publicados dá para inferir a nota do colega. Correção: ocultar agregados abaixo de um mínimo de alunos (número a decidir).
- **S10–S12:** tratados no plano (seção 10, etapas 3 e 7).

---

## 6. Problemas de arquitetura e manutenção

| # | Problema | Consequência |
| --- | --- | --- |
| A1 | Código muito compactado: funções inteiras em uma linha de 500 a 3.000 caracteres (`administracao/routes.js`, `app.js`, `admin.js`). | Revisão e diffs ficam quase ilegíveis; alto risco de erro em qualquer edição. É o maior custo de manutenção da base. |
| A2 | Frontend por camadas de remendo: `indicadores/analytics.js` e `academico/academico.js` substituem funções globais de `app.js` (`renderStats`, `renderIndividual`, `bootStudent`, `renderStudentResult`). | A ordem dos `<script>` vira regra de negócio; um módulo novo que faça o mesmo pode quebrar outro sem erro visível. |
| A3 | Tabela `scores` com colunas fixas (c1..c6, me1..me4, osce1..osce4). | Não comporta "mais colunas de múltipla escolha" (pedido de 06/11) nem OSCE com 6 estações (transcrição). |
| A4 | Esquema criado dentro de `openDatabase`; `schema_migrations` só guarda marcadores. | Não há migrações versionadas nem reversíveis. Qualquer tabela nova precisa de um mecanismo antes. |
| A5 | SQL espalhado pelas rotas, com funções próprias do SQLite (`INSERT OR IGNORE`, `PRAGMA`, `COLLATE NOCASE`). | A troca futura para PostgreSQL exige tocar em quase todos os arquivos. |
| A6 | `assessments` guarda disciplina e período como texto, além do vínculo. | Dado duplicado; hoje é mantido em sincronia manualmente na edição de disciplina. |
| A7 | Fórmula duplicada no navegador (`recalcLocal`) para pré-visualização. | Aceitável, mas precisa de teste que compare com o servidor. |
| A8 | O limiar de 60% está fixo em quatro lugares (API de evolução e três telas). | A especificação trata 60% como pendente de confirmação; hoje a tela do aluno chama de "Ponto de corte" e mostra "atendimento recomendado". |
| A9 | Botão "Consultoria Acadêmica" no painel do aluno abre apenas um aviso de "em breve". | Não consta na especificação nem nas transcrições; é código de demonstração no lugar de funcionalidade. |
| A10 | Teste de navegador fora da CI; sem lint; `docs/modelagem/modelo_fisico.sql` descreve um esquema diferente do real. | Documentação e verificação automática não refletem o sistema inteiro. |

Nenhum destes impede o uso atual. A1, A2, A4 e A5 precisam ser tratados **antes** de acrescentar três módulos, senão o custo cresce a cada um.

---

## 7. Requisitos novos que se integram direto na base atual

| Requisito | Onde entra | Esforço |
| --- | --- | --- |
| Trocas de rótulo do aluno (reunião 06/11): "Aluno x turma" → "Aluno/turma"; "Nota final" → "Minha nota"; "Prova" → "Avaliação"; "Minhas disciplinas" → "Minhas notas"; retirar "Meus resultados publicados"; "Onde estou" na teia | `index.html`, `app.js` (`renderStudentResult`), `academico.js` | Baixo |
| Nota em escala (6,2) nos cartões e percentual nos gráficos | `academico.js` | Baixo, **só onde a escala for 0–10** (decisão pendente) |
| Linha pontilhada de 60% e nomes das disciplinas no gráfico de barras | `academico.js` (`barChart`) | Baixo |
| Ordem "total → estratificações" e abrir disciplina já nos gráficos | `academico.js` | Baixo/médio; o "canto superior direito" depende de referência visual |
| Cor para nota abaixo da média na planilha do professor | `app.js` (`renderTable`) + CSS | Baixo; usar também ícone ou texto, não só cor |
| Gráficos de SAI, OSCE e práticas; teia prática × teórica × múltipla escolha | `indicadores/analytics.js` | Médio; **depende** dos valores máximos (item seguinte) |
| Valor máximo de OSCE, SAI e trabalho | Estende `assessment_question_config` para outras chaves + `domain.config` + validação na publicação | Médio |
| Ponto de corte e ativo/inativo por questão | Duas colunas novas em `assessment_question_config` | Médio; semântica pendente |
| Perfis novos (Coordenação, Núcleo, CSTI, Operacional) | `core/security.js`: lista de perfis aceitos; `role()` passa a aceitar permissões lidas de `role_permissions`; `core/account-creation.js` e tela de usuários | Médio |
| Trocar a própria senha, primeiro acesso | Rota nova em `core/security.js` + diálogo usando `SupremaUI.modal` | Baixo |
| Botões da barra lateral dos três módulos | Já existem; trocam o aviso "Em desenvolvimento" pela tela real | Baixo |

O padrão para um módulo novo já está definido e documentado em `packages/contracts/README.md`: uma pasta em `apps/api/src/modules/<nome>/`, uma linha no manifesto `modules/index.js`, uma pasta em `apps/web/public/features/<nome>/`, um teste de falha do módulo.

---

## 8. Requisitos que exigem estruturas novas

### 8.1 Um núcleo de formulários para os três módulos

Lendo as transcrições, OSCE, Avaliação Docente e Articulação Interdisciplinar são o mesmo mecanismo com alvos diferentes:

| | Quem monta | Quem responde | Sobre quem | Perguntas | Quem vê o resultado |
| --- | --- | --- | --- | --- | --- |
| OSCE | Núcleo de Avaliação | Conta operacional do ambulatório | Aluno, por estação | Sim / Não + comentário | Núcleo |
| Avaliação Docente | CSTI | Aluno | Professor + disciplina | Sim / Não / Não se aplica + comentário | Professor (o próprio), Coordenação (todos) |
| Articulação Interdisciplinar | CSTI | Aluno | Professor | Formulário (formato na planilha) | Professor (o próprio), Coordenação (todos) |

**Proposta:** construir uma vez o núcleo — formulário, perguntas, liberação (para quem, em qual período), respostas, finalização e liberação de resultados — e três módulos finos por cima. Evita três implementações paralelas da mesma regra, que é o que o prompt mestre proíbe.

Tabelas novas (todas aditivas, nenhuma altera as existentes):

- `forms`, `form_questions` — definição, tipo de resposta, ordem, marcação de pergunta-chave.
- `form_releases` — a quem se destina (período, disciplina, professor, estação), janela, estado (rascunho → liberado → finalizado → resultado liberado).
- `form_submissions`, `form_answers` — respostas brutas, sempre preservadas.
- `osce_events`, `osce_stations` — ano, semestre, rodada (OSCE 1 / OSCE 2), período, estações em quantidade livre (4 ou 6).
- `calc_runs` — qual versão de fórmula gerou qual resultado, para que uma fórmula nova não reescreva o histórico em silêncio.

### 8.2 Como entregar sem as fórmulas

Este é o ponto que você pediu: depender do mínimo e deixar o resto para depois.

- O sistema **sempre grava a resposta bruta**. Nada se perde se a fórmula chegar depois.
- O cálculo fica em **um arquivo por módulo** (`core/calculo/osce.js`, `.../articulacao.js`), com uma função: recebe respostas, devolve resultado. É a única peça que depende da instituição.
- Enquanto a fórmula não chega, os painéis mostram só **fatos que não dependem de fórmula**: quantidade de respostas, percentual de Sim / Não / Não se aplica, comentários, resultado bruto por pergunta. A nota consolidada, o ranking e "melhores e piores" aparecem como **"aguardando fórmula institucional"**, nunca como média inventada.
- Quando a planilha chegar: implementar a função, criar testes comparando com os números da própria planilha, recalcular. O restante do módulo não muda.

**O que você precisará entregar, no mínimo, e quando:**

| Entrega | Necessária para | Pode esperar até |
| --- | --- | --- |
| Fórmula de consolidação do OSCE | Nota final do OSCE, ranking, comparação OSCE 1 × OSCE 2 | Depois do módulo pronto e em uso para coleta |
| Planilha da Articulação Interdisciplinar | Percentual por professor, melhores/piores | Idem |
| Confirmar o sentido da pergunta-chave (seção 9, C1) | Só o cálculo; o interruptor ativa/desativa pode ser construído antes | Junto com a fórmula do OSCE |
| Anonimato na Avaliação Docente (seção 9, C6) | Modelo de dados | **Já decidido: anônima** (seção 8.4) |

### 8.3 Outras estruturas novas

- **Contas operacionais do ambulatório:** perfil próprio, sem vínculo com professor, com acesso apenas a "responder OSCE liberado". Como a conta é compartilhada, a auditoria registra conta, data, hora e estação — sem atribuir a ninguém nominalmente, como pede o prompt mestre.
- **Histórico de publicações e de alterações de nota** (correção de S3).
- **Sessões persistentes** (correção de S4).
- **Mecanismo de migrações versionadas** (correção de A4), pré-requisito de todas as tabelas acima.
- **Camada de acesso a dados por módulo** para os módulos novos, de modo que não nasçam presos ao SQLite (prepara a decisão do PostgreSQL sem executá-la).

### 8.4 Avaliação Docente anônima — como o anonimato é garantido

Decisão registrada em 11/11/2026. "Anônima" aqui significa que **nem o banco de dados** consegue ligar uma resposta ao aluno que a deu — não basta esconder o nome na tela.

- **Duas tabelas sem ligação entre si.** `form_participation` guarda apenas "o aluno X já respondeu o formulário Y" (para impedir resposta em dobro e para o CSTI acompanhar a adesão). `form_submissions` / `form_answers` guardam as respostas, **sem** coluna de aluno, de usuário ou de sessão.
- **Sem pistas indiretas.** As respostas usam identificador aleatório (não sequencial) e registram só a data, não a hora; a participação também. Assim não dá para casar as duas tabelas pela ordem ou pelo horário de gravação.
- **Auditoria.** O log registra "um aluno respondeu o formulário Y" sem o conteúdo, e nunca a resposta junto do autor.
- **Sem edição depois do envio.** Como a resposta não tem dono, o aluno não consegue reabri-la. A tela avisa isso antes de enviar.
- **Mínimo de respostas (C17).** Resultados e comentários de um professor só aparecem a partir de um número mínimo de respostas.
- **Comentários.** São exibidos ao professor e à Coordenação como texto solto, em ordem embaralhada, sem data individual. O texto livre pode identificar o autor pelo conteúdo; a tela do aluno avisa isso.
- **O que continua identificado:** quem montou, liberou e encerrou o formulário (CSTI) e quem consultou os resultados.

O OSCE **não** usa este mecanismo: lá o avaliado é o aluno e a resposta precisa estar ligada a ele.

---

## 9. Conflitos e dúvidas nas especificações

Cada item tem um **padrão provisório** que vou adotar se você não disser nada. Nenhum item trava etapa no momento.

| # | Conflito ou dúvida | Padrão provisório |
| --- | --- | --- |
| C1 | **Pergunta-chave do OSCE.** A transcrição diz "se cumprimentar, o OSCE dele vale 1; se não, vale 0,5 … isso vai impactar no resultado final" — parece um **multiplicador** da nota. O prompt mestre registrou "SIM = 1 ponto, NÃO = 0,5 ponto" — parece **pontuação da pergunta**. São regras diferentes. | Construir o interruptor e guardar a resposta; não aplicar efeito até confirmar. **Resolvido em 16/11/2026 pela planilha do OSCE:** é multiplicador dos acertos da estação (`*(IF(D2="Fez",1,0.5))`), e o item de postura não conta como item. |
| C2 | Estações: "quatro ou seis" na transcrição; a base tem quatro colunas fixas. | Estações em quantidade livre no módulo novo; A1/A2/A3 continuam com quatro. |
| C3 | O OSCE do módulo novo alimenta a coluna OSCE da A1/A2/A3? A especificação diz "módulos distintos". | Não alimenta. Ficam independentes. |
| C4 | PostgreSQL: a especificação aponta como direção; o prompt mestre diz que não está homologado; você confirmou "em evolução". | SQLite agora; código novo isolado do banco; migração só com sua autorização. |
| C5 | 60%: a especificação diz que é referência visual pendente de confirmação; o painel do aluno já mostra "Ponto de corte" e "atendimento recomendado". | Manter a régua visual; trocar os textos que soam como decisão acadêmica. |
| C6 ✅ | Avaliação Docente é anônima? A modelagem UML marcava como "a definir". | **Decidido em 11/11/2026: anônima.** Desenho na seção 8.4. Restam dois detalhes com padrão provisório: C17 e C18. |
| C7 | "Média" do professor na Avaliação Docente: as respostas são Sim/Não/N.A., então média de quê? | Mostrar percentuais; "média" aguarda definição. |
| C8 | "Consultoria Acadêmica" existe no código, mas não em nenhum documento. | Manter oculto ou como está até você decidir; não desenvolver. |
| C9 | Snapshot "imutável" (AT-07) × código que sobrescreve ao republicar. | Corrigir com histórico de publicações (S3). |
| C10 | Importar notas pelo nome (código) × só por matrícula (AT-10). | Exigir matrícula. |
| C11 | A especificação recomenda TypeScript; a base é JavaScript. | Permanecer em JavaScript; migrar agora seria reescrever. |
| C12 | A especificação descreve o pacote `..._DEMO_PRONTO.zip`; a base oficial é o `Projeto-Suprema-main`, já reorganizado. | Resolvido por você. As rotas são as mesmas; só os caminhos de arquivo mudam. |
| C13 | Registros legados "A3 de A1" e "A3 de A2": o código os esconde das listas (`type IN ('A1','A2','A3')`), mas preserva as colunas. Sem banco de demonstração não deu para ver os dados. | Não tocar. |
| C14 | "Dez usuários padrão" para o ambulatório: quantidade fixa ou configurável? | Configurável pelo administrador. |
| C15 | Contas de Coordenação e CSTI: quem cria e quantas? | Criadas pelo administrador, como as demais. |
| C16 | A transcrição 01 fala em "quatro frentes" e cita três, além da já existente. | Tratar como quatro contando o módulo principal. |
| C17 | Número mínimo de respostas para exibir o resultado de um professor (com 1 ou 2 respostas o anonimato não se sustenta). | Configurável pelo CSTI; valor provisório 5. Abaixo disso a tela mostra "respostas insuficientes". |
| C18 | A Articulação Interdisciplinar também é anônima? A transcrição diz que "funciona basicamente da mesma forma". | Sim, mesmo mecanismo. |
| C19 | "Nota abaixo da média" (reunião de 06/11): média da turma ou média de aprovação? Não há média de aprovação definida no sistema. | Média da turma na coluna, como leitura descritiva. Adotado na etapa 4. |
| C20 | Quais instrumentos contam como "prática" na teia prática × teórica × múltipla escolha? | Prática = OSCE. SAI, trabalho e outros entram como eixos próprios. Adotado na etapa 4. |
| C21 | "Prova" → "Avaliação" vale só para o painel do aluno ou também para as telas do professor e planilhas? O pedido está na lista do perfil do estudante. | Só o painel do aluno. Professor e planilhas mantêm "Nota da Prova". |
| C22 | O valor máximo de OSCE, SAI e trabalho deve ser obrigatório para publicar, como já é para as questões? | Opcional: sem ele publica como antes e o instrumento fica sem percentual. |
| C23 | Quantos resultados publicados a turma precisa ter para o aluno ver média e posição (S9)? | 5, configurável por `SUPREMA_MIN_AGGREGATE_STUDENTS`. |
| C24 | Lista de alunos do OSCE: quem entra? | Alunos ativos do período, revisados pelo Núcleo antes de liberar; o Núcleo pode acrescentar ou retirar. Adotado na etapa 5. |
| C25 | Segunda resposta para o mesmo aluno na mesma estação: aceitar, substituir ou recusar? | Recusar. O Núcleo pode anular uma resposta, que continua guardada, e então o aluno pode ser avaliado de novo. |
| C26 | Conta operacional fica presa a uma estação? | Não: vê todas as estações liberadas e escolhe. A auditoria registra conta, estação, data, hora e origem. |
| C27 | Conta operacional compartilhada precisa trocar a senha no primeiro acesso? | Sim, como qualquer conta. Quem prepara o computador do ambulatório define a senha. |
| C28 | Onde fica a pergunta-chave e qual o texto? | Primeira pergunta de todas as estações quando o interruptor está ligado; texto padrão "O aluno cumprimentou o paciente?", editável. Sem efeito em cálculo (C1). |
| C29 | Quem vê o resultado do OSCE? | Só o Núcleo de Avaliação. Administrador, professor e aluno não têm tela nem rota de OSCE. |
| C30 | Avaliação Docente: quem avalia quem? A transcrição fala em "alunos do período"; a especificação pede vínculo explícito. | O aluno avalia os professores das disciplinas em que está matriculado, dentro do período da avaliação. Adotado na etapa 6. |
| C31 | Quando o resultado da Avaliação Docente fica visível? A transcrição sugere que seja gerado conforme os alunos respondem. | Só depois que o CSTI encerra, e o encerramento é definitivo. Durante a coleta, a diferença entre duas consultas revelaria a resposta de quem acabou de enviar. |
| C32 | O CSTI vê quem respondeu? | Não. Vê só a contagem por professor (por exemplo, 18 de 40). |
| C33 | Mesmas perguntas para todos os professores de uma avaliação? | Sim. |
| C34 | Como identificar o momento da avaliação (meio do ano, fim do semestre, fim do ano)? | Ano, semestre e uma rodada com nome livre. |
| C35 | O mínimo de respostas pode ser reduzido pelo CSTI até quanto? | Padrão 5 (C17); o sistema não aceita menos que 3. |
| C36 | **Articulação: anônima ou identificada?** O padrão provisório (C18) era anônima. O formulário real, recebido em 15/11/2026, pede nome e e-mail do aluno e diz que "as respostas serão restritas à Direção e à Coordenação de Curso". | **Identificada**, como no formulário real: a Coordenação vê as respostas com o aluno; o tutor vê só o consolidado, sem nomes. Substitui C18. **Confirmado pelo usuário em 15/11/2026.** |
| C37 | Comprovante de ação do aluno × anonimato da Avaliação Docente. O comprovante prova que o aluno respondeu; a resposta é anônima. | O comprovante registra só a participação (quem, o quê, quando), nunca o conteúdo. A administração passa a ver quem respondeu; o que cada um respondeu continua sem ligação com o aluno. Altera C32 para a administração. **Confirmado pelo usuário em 15/11/2026.** |
| C38 | Quem é "a administração" que consulta e verifica comprovantes? O pedido exclui os professores. | **Decidido pelo usuário em 15/11/2026:** o Administrador e o CSTI ("nós do CSTI somos os administradores, pois somos a equipe de T.I."). Coordenação e professores não. |
| C39 | "Enviar" o comprovante: por onde? O sistema não tem envio de e-mail configurado. | O PDF é oferecido logo após a ação e fica em "Meus comprovantes". Envio por e-mail depende de a instituição fornecer um servidor de e-mail. **Confirmado pelo usuário em 15/11/2026:** download em PDF; e-mail fica para o futuro. |
| C40 | Quais ações do aluno geram comprovante? | Cada envio de formulário pelo aluno: Avaliação Docente e Articulação. Entrar, trocar senha e consultar notas não geram. |
| C41 | Fórmula do resultado da Articulação. Os prints mostram o formulário, não a planilha de resultados. | **Resolvido em 16/11/2026.** O usuário enviou a planilha de relatório da instituição ("Matriz"): média, menor e maior nota e percentual de Sim, Não e Parcialmente, por tutor e período. As fórmulas foram reproduzidas em `core/calculo/articulacao.js` e aparecem nas telas e na exportação. Ver C49 a C54 e "Resultado do relatório da Articulação". |
| C42 | A Articulação cabe no núcleo de formulários? O núcleo só aceita Sim, Não e Não se aplica, com comentário; a Articulação pede nota de 0 a 10, Sim/Não/Parcialmente e escolha em três listas. | Tabelas próprias (`articulation_*`, migração 010). Mudar o núcleo exigiria reconstruir tabelas que já guardam respostas do OSCE e da Avaliação Docente. Pode ser unificado depois, se um terceiro módulo precisar dos mesmos tipos. |
| C43 | O tutor vê o resultado de um grupo muito pequeno? Com uma ou duas respostas ele identifica o aluno por eliminação. | Só a contagem até o mínimo já usado para números de turma (5, `SUPREMA_MIN_AGGREGATE_STUDENTS`). |
| C44 | O tutor lê as justificativas escritas pelos alunos? | Sim, sem o nome, quando o grupo atinge o mínimo. O texto pode permitir reconhecer quem escreveu. |
| C45 | Quem lê as respostas identificadas, e quando? O formulário anterior diz "Direção e Coordenação de Curso"; não existe perfil Direção. | O CSTI, que opera a coleta, a qualquer momento. A Coordenação, depois de "liberar resultados". Quem for da Direção usa uma conta de Coordenação, até decisão diferente. |
| C46 | Quais perguntas são obrigatórias, e quem pode responder? | Todas as perguntas obrigatórias; a justificativa é opcional. Qualquer aluno ativo responde uma vez e informa o próprio período, como no formulário anterior. |
| C47 | Como o sistema sabe qual conta de professor é cada tutor da lista? | O CSTI escolhe a conta ao lado do nome do tutor. Tutor sem vínculo não tem tela de resultado. |
| C48 | Uma etapa da Articulação pode ser desfeita? | Sim, uma de cada vez (resultados liberados → coleta finalizada → liberada). Voltar a rascunho só enquanto não houver resposta. |
| C49 | A planilha de relatório não tem um número único de desempenho por tutor nem a lista dos mais e dos menos bem avaliados. Existe, na instituição, uma etapa de cálculo depois dela? | **Resolvido em 16/11/2026.** O usuário enviou a planilha de resultado final preenchida ("este é como deve ficar o resultado FINAL"): 24 abas, uma por tutor, e nada depois delas. Não existe número único nem classificação. |
| C50 | Como agrupar o relatório? | **Revisto em 16/11/2026 pela planilha final:** ela tem uma aba por tutor, inclusive para um tutor com alunos de dois períodos. A exportação passou a ter uma aba por tutor, em ordem alfabética. As telas mantêm o quadro do tutor e, como detalhe a mais, a divisão por período quando ele tem mais de um. |
| C51 | Quantas casas decimais na média? A planilha não define. | Duas casas. Os percentuais ficam inteiros, como a planilha exibe. **Aceito pelo usuário em 16/11/2026.** |
| C52 | O "Resultado geral" (todos os tutores juntos) não existe na planilha. Mostra os mesmos números? | Sim, com as mesmas fórmulas sobre todas as respostas. Não é fórmula nova: é a mesma conta em um conjunto maior. |
| C53 | O tutor vê os quadros por período? Um período com poucas respostas identifica o aluno, e escondê-lo sozinho permitiria deduzi-lo pelo total. | Só quando todos os períodos do tutor atingem o mínimo (5). Senão, ele vê apenas o total. |
| C54 | A exportação é idêntica à planilha final? | **Revisto em 16/11/2026.** Mesmas colunas iniciais (data, e-mail, nome, período, tutor), mesmas fórmulas e mesma ordem nas três linhas de totais (média, maior, menor; Sim, Parcialmente, Não), sem rótulos, e o período da linha de totais é o da primeira resposta da aba, como no original. Diferenças: traz todas as colunas da avaliação, inclusive as estações preferidas (3.4 e 3.5), então as letras das colunas mudam a partir delas; não há limite de 13 alunos; há uma última aba "Todas as respostas"; a aba "Matriz" vazia não é gerada. Nas telas, as perguntas de Sim ou Não mostram só essas duas respostas; na aba, a linha "Parcialmente" existe para elas, como na planilha, e dá 0%. |
| C55 | Escala da nota do OSCE. A planilha dá a nota de 0 a 1 e a exibe com duas casas. | De 0 a 1, com duas casas, como na planilha. Não foi multiplicada por 10: não há essa conta em nenhuma célula. |
| C56 | Estação em que o aluno não foi avaliado conta como zero? | Não: fica fora da média, como na tabela dinâmica da planilha (um aluno com uma estação tem a nota dela como nota final). A tela mostra um traço e a quantidade de estações avaliadas vem na resposta da rota. |
| C57 | O sistema permite montar um OSCE sem a pergunta-chave, e uma estação só com ela. A planilha sempre tem o item de postura e pelo menos um item. | Sem a pergunta-chave não há redução pela metade. Estação sem itens não tem nota (na planilha seria divisão por zero) e fica fora das médias. |
| C58 | A exportação do OSCE é idêntica à planilha? | Mesmas abas e mesmas colunas. Diferenças: os acertos são contados item a item, porque o intervalo da fórmula original cobre as colunas de comentário e contaria um comentário igual a "Fez"; "Resultado Final" é uma tabela com fórmulas `AVERAGE` sobre as abas das estações, não uma tabela dinâmica (os números são os mesmos); "Avaliador" é a conta compartilhada do ambulatório, porque o sistema não registra o nome do professor; só aparecem alunos com alguma nota, como na tabela dinâmica. |
| C59 | Rótulo das respostas do OSCE. O sistema usava Sim e Não; a planilha usa "Fez" e "Não Fez". | "Fez" e "Não fez" nas telas; "Fez" e "Não Fez" na exportação, que é o texto que as fórmulas contam. No banco continuam `SIM` e `NAO`. |

---

## 10. Plano de implementação incremental

Cada etapa termina com testes executados e um resumo do que mudou. Nenhuma depende de fórmula institucional, exceto onde indicado.

**Etapa 0 — Preparar o ambiente (pré-requisito)**
Instalar Node.js 24 LTS nesta máquina; inicializar o Git; rodar `npm ci` e `npm test` para confirmar os 201 testes **antes** de qualquer alteração. Se houver um banco de demonstração, trabalhar sempre em cópia.

**Etapa 1 — Segurança urgente** (S1, S2, S8)
- `apps/web/server.js`, `core/security.js`: endereço real do cliente pelo proxy; atraso progressivo.
- `core/security.js` + `features/avaliacoes/app.js`: trocar a própria senha; troca obrigatória no primeiro acesso (coluna nova `must_change_password`).
- `importacao-alunos/routes.js` + tela: senha provisória individual no relatório.
- Testes novos passando pelo proxy.

**Etapa 2 — Fundações** (A4, S4, S6, S3)
- Mecanismo de migrações versionadas em `core/`; as criações atuais viram a migração inicial, sem mudar o esquema existente.
- Sessões em tabela.
- Perfis novos e verificação por permissão, usando `role_permissions`; tela de usuários aceita os perfis novos.
- Histórico de publicações e de alterações por célula; `audit_logs` com autor e origem em colunas.

**Etapa 3 — Operação** (S5, S10, S11, A10)
- Recusa de iniciar exposto sem TLS; HSTS.
- Backup agendado com retenção e roteiro de restauração testado.
- CI com lint e auditoria de dependências; teste de navegador na CI.

**Etapa 4 — Melhorias do módulo principal** (seção 7)
- Rótulos e ajustes do aluno pedidos em 06/11.
- Valores máximos de OSCE, SAI e trabalho; gráficos por instrumento; cor de nota abaixo da média.
- Exigir matrícula na importação (S7); mínimo de alunos para agregados (S9).
- Ficam de fora, por decisão pendente: colunas dinâmicas de múltipla escolha, link do gabarito, aba total da articulação.

**Etapa 5 — Núcleo de formulários + OSCE**
- `modules/formularios/` (núcleo) e `modules/osce/`; `features/osce/`.
- Montagem pelo Núcleo, liberação, resposta pelas contas operacionais com "Enviar outra resposta", resultado bruto por estação e pergunta, interruptor da pergunta-chave.
- Nota consolidada, ranking e comparação OSCE 1 × 2: **aguardam a fórmula**; a estrutura fica pronta.

**Etapa 6 — Avaliação Docente** (anônima, conforme seção 8.4)
- `modules/avaliacao-docente/`; formulários por período com todos os professores, resposta pelo aluno, percentuais Sim / Não / N.A., comentários, visão do professor e da Coordenação, comparação entre semestres e anos.

**Etapa 7 — Articulação Interdisciplinar**
- `modules/articulacao/`; mesmo fluxo, com "Finalizar" e "Liberar". Resultado calculado **aguarda a planilha**.

**Etapa 8 — Legibilidade e documentação** (A1, A2)
- Reformatar os arquivos compactados, um por vez, sem mudar comportamento, com a suíte como rede de proteção.
- Substituir as sobreposições de funções globais do frontend por pontos de extensão explícitos.
- Atualizar README, arquitetura, modelo de dados, contratos de API e manuais por perfil.

**Por que nesta ordem.** As etapas 1 e 2 fecham as falhas que afetam quem já usa o sistema e criam o que os três módulos precisam (perfis, migrações, auditoria). A 4 entrega logo o que a coordenação pediu em reunião. O OSCE vem antes dos outros dois porque é o que mais exercita o núcleo de formulários; os seguintes saem quase de graça. A reformatação fica por último para não misturar mudança cosmética com mudança de comportamento nos mesmos diffs — mas pode ser antecipada se a manutenção começar a custar caro.

---

## Resultado da Etapa 0 (executada em 11/11/2026)

Ambiente: Windows 11, Node.js **26.13.1**, npm 11.20.0. O projeto exige 22.16 ou superior; a CI e a validação anterior usaram a linha 24.

| Verificação | Resultado nesta máquina |
| --- | --- |
| Git inicializado, commit `7d973a5` com a base original | Feito; 88 arquivos idênticos ao backup |
| `npm ci` | 239 pacotes instalados, sem erro |
| `npm run check` (sintaxe, recursos HTML, fronteiras) | Aprovado, 42 arquivos |
| API: regras acadêmicas, autorização, publicação, concorrência | **62 aprovadas** |
| Usuários | **44 aprovadas** |
| Importação de alunos | **53 aprovadas** |
| Matrículas por período | **26 aprovadas** |
| Isolamento de módulos e processos | **6 aprovadas, 1 reprovada** |
| Navegador (Python/Playwright) | Não executado |

**Total: 191 de 192 verificações Node aprovadas.** As quatro suítes de integração foram rodadas uma a uma; o comando único `npm test` não chega ao fim nesta máquina, pelo motivo abaixo.

**A reprovação é defeito do teste no Windows, não do sistema.** No teste "terminating either real process…" todas as verificações do corpo passam; a falha acontece na limpeza: o teste tenta apagar a pasta temporária enquanto o processo da API que ele mesmo iniciou ainda está com o banco aberto. No Linux isso é permitido; no Windows dá `EPERM`. Como a limpeza falha, o processo filho fica órfão e a execução trava indefinidamente. `docs/VALIDACAO.md` já avisava que o Windows nunca tinha sido executado. Correção (entra na Etapa 1): encerrar os processos filhos antes de apagar a pasta — `tests/architecture/isolation.test.js`.

**Dependências:** `npm audit` aponta 2 avisos de gravidade moderada, ambos o mesmo: `uuid` abaixo de 11.1.1, trazido pelo `exceljs`. A correção automática oferecida faria *downgrade* do `exceljs` para a 3.4.0 e não deve ser aplicada. Fica para a Etapa 3, com substituição dirigida da versão do `uuid` e teste das planilhas.

**OneDrive:** a instalação e os testes rodaram dentro da pasta sincronizada sem erro de arquivo bloqueado.

Depois da execução: repositório sem nenhuma alteração rastreada; pastas temporárias dos testes removidas; nenhum processo do projeto em execução.

---

## Resultado da Etapa 1 (executada em 11/11/2026)

Branch `feature/etapa1-seguranca-login`, dois commits sobre a base (`230dbda`, `474eecb`). Mesclada na `main` em 12/11/2026 (commit de mesclagem `28ef013`); `npm test` repetido na `main` depois da mesclagem: 205 aprovadas.

| Item | O que mudou | Arquivos principais |
| --- | --- | --- |
| S1 — limite de login | O proxy informa o endereço real do cliente; a API só aceita esse dado de proxy confiável. O bloqueio volta a valer por cliente. | `packages/http/client-address.js` (novo), `apps/web/server.js`, `core/security.js` |
| S8 — enumeração por tempo | Login inexistente passa pela mesma verificação de senha. | `core/security.js` |
| S2 — trocar a própria senha | Rota `POST /api/me/password` e botão "Alterar senha" nos três perfis. Encerra as outras sessões da conta. | `core/security.js`, `index.html`, `features/avaliacoes/app.js` |
| S2 — senha provisória | Senha definida pelo administrador obriga a troca no primeiro acesso; até lá a conta não acessa nenhum dado. | `core/database.js`, `core/account-creation.js`, `administracao/routes.js` |
| S2 — importação | Uma senha provisória individual por aluno, entregue uma única vez em arquivo CSV; nunca gravada. A senha única do lote deixou de ser aceita. | `importacao-alunos/routes.js`, `features/importacao-alunos/student-import.js` |
| Teste que travava no Windows | Ordem de limpeza corrigida; `npm test` termina sozinho. | `tests/architecture/isolation.test.js` |

**Testes:** 205 verificações aprovadas com um único `npm test` (41 s): 62 API, 44 usuários, 56 importação, 26 matrículas, 7 isolamento, 10 da suíte nova `tests/integration/seguranca_login.test.js`.

**Conferido em navegador** (banco descartável, contas fictícias): botão e diálogo "Alterar senha"; diálogo obrigatório no primeiro acesso, incluindo cancelar (volta ao login) e concluir (entra no painel); prévia da importação sem campo de senha; relatório com 3 senhas distintas no CSV próprio e nenhuma senha nos relatórios CSV/JSON.

**Diferenças em relação ao que a auditoria propôs**
- O bloqueio continua rígido (6 erros por cliente e login, 80 por cliente, janela de 5 minutos). O "atraso progressivo" não foi feito: corrigir o endereço já elimina o bloqueio coletivo, e mudar a política exigiria definir números que ninguém pediu.
- A migração de banco usou o mecanismo atual (`ALTER TABLE` na abertura); as migrações versionadas continuam na Etapa 2.

**Limites conhecidos**
- **Contas já existentes não são afetadas.** Quem foi importado antes com senha única continua com ela até o administrador redefinir em Usuários.
- **Rede com endereço compartilhado.** Se todos os alunos saírem pela mesma conexão da faculdade, o sistema os vê como um único cliente: 80 erros somados em 5 minutos ainda bloqueiam novos logins dessa rede. É bem melhor que antes (valia para o mundo inteiro), mas não some.
- **Proxy HTTPS externo.** Se houver nginx ou similar na frente, é preciso configurar `SUPREMA_WEB_TRUSTED_PROXIES`; sem isso volta a contar tudo como um cliente.
- **Senhas provisórias da importação** ficam em memória por até 20 minutos, para o administrador conseguir baixar de novo se a resposta se perder. Depois disso, só redefinindo.
- **Suítes antigas:** nas quatro suítes de integração anteriores, a troca obrigatória é dispensada direto no banco de teste, porque elas verificam outras regras. O primeiro acesso é coberto pela suíte nova e pela de importação.
- O teste automatizado de navegador (`tests/browser/smoke.py`) continua sem ser executado.

---

## Resultado da Etapa 2 (executada em 12/11/2026)

Branch `feature/etapa2-fundacoes`, cinco commits (`11fff5e`, `1c4b103`, `0634a73`, `6611be4`, `877f148`). Mesclada na `main` em 12/11/2026 (commit de mesclagem `d7f7f55`); `npm test` repetido na `main` depois da mesclagem: 232 aprovadas.

| Item da auditoria | O que mudou | Arquivos principais |
| --- | --- | --- |
| A4 — migrações | Mudanças de banco numeradas, aplicadas uma única vez, tudo ou nada. Cópia automática do banco em `data/pre-migracao/` antes de migrar um banco com dados. Banco de versão mais nova não é aberto por código antigo. | `core/migrations/index.js` (novo), `core/database.js` |
| S4 — sessões | Sessões na tabela `sessions` (só o hash do token). Reiniciar a API não desconecta ninguém. | `core/migrations/001-sessions.js`, `core/security.js` |
| S6 — perfis | Perfis Coordenação, Núcleo de Avaliação, CSTI e Usuário operacional. As rotas passam a consultar `role_permissions` em vez de comparar o nome do perfil. | `core/roles.js` (novo), `core/migrations/002-permissions.js`, todos os `routes.js` |
| S3 — histórico de notas | Cada célula alterada e cada versão publicada ficam guardadas; o banco recusa alterar ou apagar esse histórico. Auditoria com autor, endereço de origem e avaliação em colunas próprias. | `core/grade-history.js` (novo), `core/migrations/003-grade-history.js`, `avaliacoes/routes.js`, `planilhas/routes.js` |
| Telas | Histórico de notas para professor e administrador; auditoria com "Quem" e "Origem"; cadastro com os perfis novos; tela neutra para perfil sem módulo. | `shared/ui.js`, `indicadores/analytics.js`, `administracao/admin.js`, `index.html`, `avaliacoes/app.js` |

**Testes:** 232 verificações aprovadas com um único `npm test` (48 s). São 27 novas: migrações (5), sessões (7), perfis (7), histórico (8). As 205 anteriores continuam passando sem alteração de expectativa.

**Conferido em navegador** (banco descartável, contas fictícias): histórico do professor com operações, 7 alterações de nota e 2 publicações; histórico do administrador para a mesma avaliação; auditoria com autor e origem; lista de perfis no cadastro; conta CSTI caindo na tela neutra e recebendo 403 nas rotas de administração e de avaliações.

**Mudanças de comportamento que você precisa conhecer**
- **Conta com histórico de notas não pode mais ser excluída**, só desativada. Vale para o professor que lançou, para o aluno que recebeu a nota e para o dono da avaliação. Antes, bastava não haver nota preenchida no momento.
- **A auditoria passa a guardar o endereço de quem fez cada operação.** É dado pessoal; vale mencionar na política de privacidade da instituição.
- **Na primeira inicialização depois desta atualização**, um banco que já tenha dados ganha uma cópia em `data/pre-migracao/`. Essas cópias não são apagadas sozinhas.
- **As datas** do histórico e da auditoria aparecem no horário local do navegador (antes, em UTC).

**Limites conhecidos**
- **Os perfis novos ainda não fazem nada.** Entram, trocam a senha e veem uma tela informando que os módulos estão em desenvolvimento. As permissões chegam com cada módulo (etapas 5 a 7).
- **Contas operacionais compartilhadas** herdam a troca obrigatória de senha no primeiro acesso, como qualquer conta. Para o ambulatório isso precisa ser repensado na etapa 5.
- **Não há migração de retorno.** Desfazer uma atualização do banco significa restaurar a cópia de `data/pre-migracao/`.
- **Histórico só a partir de agora.** Alterações feitas antes desta versão não existem em lugar nenhum; o que já estava publicado entra como primeira versão, sem autor.
- **Tentativas de login recusadas não são registradas na auditoria**, e os contadores de tentativas continuam em memória (zeram ao reiniciar).
- **Banco legado real não testado.** A migração de dados antigos foi exercitada com um banco sintético montado no teste; o banco de demonstração original não está disponível aqui.
- **A5 (SQL espalhado pelas rotas)** não foi tratado: o código novo ficou isolado em arquivos próprios, mas as rotas antigas continuam com SQL direto.
- O teste automatizado de navegador (`tests/browser/smoke.py`) continua sem ser executado.

---

## Resultado da Etapa 3 (executada em 12/11/2026)

Branch `feature/etapa3-operacao`, a partir da `main`, com um commit por bloco (`e4ee707`, `8e70381`, `ba9f011`) e dois de documentação (`5d6036b`, `49b60d9`). Mesclada na `main` em 12/11/2026 (commit de mesclagem `fd056f8`); `npm test` repetido na `main` depois da mesclagem: 252 aprovadas.

| Item da auditoria | O que mudou | Arquivos principais |
| --- | --- | --- |
| S5 — HTTPS | Fora da própria máquina, a interface só inicia com TLS ou com proxy HTTPS declarado; a API só inicia fora da máquina com declaração de rede protegida. HSTS e cookie `Secure` passam a valer com TLS ou proxy declarado. | `packages/http/transport-policy.js` (novo), `packages/http/security-headers.js`, `apps/web/server.js`, `apps/api/server.js`, `apps/api/src/app.js` |
| S10 — backup | Cada backup guarda data, tamanho, hash e versão do banco; a numeração só cresce; retenção configurável. Comando novo de restauração, que confere o backup, guarda o banco substituído e recusa backup corrompido ou de versão mais nova. | `scripts/backup.js`, `scripts/restore.js` (novo), `docs/BACKUP.md` (novo) |
| S11 — dependências | `uuid` sob o `exceljs` fixado em 11.1.1 por `overrides`; `npm audit` sem avisos. A CI bloqueia em gravidade alta ou crítica. | `package.json`, `package-lock.json`, `.github/workflows/ci.yml` |
| A10 — lint e navegador | ESLint só com regras de erro real, dentro do `npm test`. Teste de navegador corrigido, executado e incluído na CI. | `eslint.config.js` (novo), `tests/browser/smoke.py`, `tests/browser/requirements.txt` (novo) |

**Testes:** 252 verificações aprovadas com um único `npm test` (60 s), depois de `npm ci`. São 20 novas: HTTPS (9), backup e restauração (9), dependências (2). As 232 anteriores continuam passando sem alteração de expectativa. O teste de navegador passou com 9 verificações, fora do `npm test`.

**Decisões adotadas como provisórias** (autorizadas em 12/11/2026 junto com o início da etapa)
- Proxy HTTPS declarado por `SUPREMA_BEHIND_HTTPS_PROXY=1`, que exige `SUPREMA_WEB_TRUSTED_PROXIES` preenchida.
- API fora da máquina só com `SUPREMA_API_PRIVATE_NETWORK=1`.
- HSTS de um ano, sem `includeSubDomains`.
- Retenção de 30 backups (`SUPREMA_BACKUP_KEEP`; `0` não apaga nada).
- `npm audit` bloqueia a CI a partir de `high`; avisos moderados são listados sem bloquear.

**Achados durante a etapa**
- **O teste de navegador estava quebrado desde a etapa 1.** As contas criadas pelo administrador passaram a exigir troca de senha no primeiro acesso e o roteiro esperava entrar direto no painel. Confirmado por execução da versão anterior (falha ao aguardar a tela do professor). O roteiro agora conclui o primeiro acesso antes de abrir o navegador.
- **A numeração do backup reaproveitava o primeiro número livre.** Com retenção, um backup novo poderia receber um número menor que um antigo. Agora o número é sempre maior que o mais alto existente.
- **O ESLint 10 traz uma dependência com aviso moderado** (`minimatch`). Foi adotada a linha 9, que mantém o `npm audit` zerado.
- **As ações do GitHub estavam referenciadas por tag mutável.** Foram fixadas pelo hash do commit.
- **O lint não encontrou erro real no código atual.** Os 22 nomes "não definidos" eram os globais compartilhados entre arquivos da interface (A2) e foram declarados um a um na configuração. Restam 8 avisos de variável sem uso em arquivos antigos, que ficam para a etapa 8; o comando falha se esse número aumentar.

**Mudanças de comportamento que você precisa conhecer**
- **`HOST=0.0.0.0` sem HTTPS deixou de funcionar.** Quem usava o acesso pela rede local em HTTP precisa configurar TLS ou um proxy HTTPS. Em `127.0.0.1` nada muda.
- **`npm run backup` passou a apagar backups antigos**, mantendo os 30 mais recentes. Para manter o comportamento anterior, defina `SUPREMA_BACKUP_KEEP=0`.
- **Depois que um navegador recebe o HSTS**, ele exige HTTPS naquele endereço por um ano.
- **`npm test` inclui o lint** e passa a exigir as dependências de desenvolvimento instaladas (`npm ci`).

**Limites conhecidos**
- **A CI nunca foi executada.** Não há remoto. O workflow foi conferido quanto à sintaxe e cada comando foi executado localmente, no Windows; o job de navegador em Linux não foi exercitado.
- **O agendamento não foi criado em nenhuma máquina.** Está documentado para Windows e Linux em `docs/BACKUP.md`.
- **Cópia para fora do servidor não é feita pelo sistema** (a especificação pede, item 16.2). Depende de definição com a TI.
- **A restauração detecta a API em execução pelo endereço configurado.** Uma API em outra porta não é detectada no Linux; no Windows a troca do arquivo falha por si só. O roteiro manda desligar os serviços.
- **A ligação entre interface e API continua sem cifra** quando as duas rodam em máquinas diferentes; a variável apenas registra que o operador declarou a rede como protegida.
- **`docs/modelagem/modelo_fisico.sql` continua diferente do esquema real** (parte documental de A10). Fica para a etapa 8.
- Certificado institucional, proxy HTTPS real e restauração de um backup real do ambiente institucional não foram exercitados.

---

## Resultado da Etapa 4 (executada em 12/11/2026)

Branch `feature/etapa4-modulo-principal`, a partir da `main`, com um commit por assunto (`4e4d7f1`, `7c6d4e5`, `e1a3d0e`, `8d8b4f8`, `22178e0`) e dois de documentação (`96963f1`, `6c5dfa8`). Mesclada na `main` em 12/11/2026 (commit de mesclagem `8b5572c`); `npm test` repetido na `main` depois da mesclagem: 274 aprovadas, e o teste de navegador com 9.

| Item | O que mudou | Arquivos principais |
| --- | --- | --- |
| S7 — importação por matrícula | A planilha de notas precisa da coluna Matrícula. O casamento pelo nome foi removido; linha com nota e sem matrícula bloqueia a importação inteira. | `modules/planilhas/routes.js` |
| S9 — turmas pequenas | Com menos de 5 resultados publicados, a API do aluno não envia média, mediana, desvio, posição nem médias por questão ou instrumento. O painel não desenha comparações. | `core/privacy.js` (novo), `modules/alunos/routes.js`, `features/avaliacoes/app.js` |
| Valor máximo dos instrumentos | SAI, estações do OSCE, OSCE sem estações, Outros e Trabalho aceitam valor máximo, declarado no cabeçalho da planilha. Opcional; validado na publicação e na importação; guardado no registro de cada publicação. | `core/migrations/004-instrument-config.js` (novo), `core/domain.js`, `modules/avaliacoes/routes.js`, `features/avaliacoes/app.js`, `index.html` |
| Gráficos por instrumento | "Média por instrumento" mostra a média sobre o valor máximo, com percentual e marca de 60%, e separa as estações do OSCE. Teia nova por modalidade, para a turma e para o estudante. | `features/avaliacoes/app.js`, `features/indicadores/analytics.js`, `shared/ui.js` |
| Nota abaixo da média | Nota da Prova e Nota Final abaixo da média da turma ganham destaque com a marca "↓" e texto para leitor de tela. | `features/avaliacoes/app.js`, `styles/ajustes-visuais.css` |
| Painel do aluno | Rótulos pedidos na reunião; gráfico de barras com total primeiro, nome da disciplina e linha de 60%; botão "Ver gráficos" por disciplina; teia com "Onde estou" e modo por modalidade. | `features/avaliacoes/app.js`, `features/academico/academico.js`, `features/academico/academico.css` |
| C5 — textos de 60% | "Ponto de corte" e "atendimento recomendado" saíram das telas. A marca de 60% é descrita como referência visual. | `features/academico/academico.js`, `features/indicadores/analytics.js` |

**Testes:** 274 verificações aprovadas com um único `npm test` (68 s). São 22 novas: importação por matrícula (4), turmas pequenas (5), valor máximo dos instrumentos (9), agrupamento por modalidade (4). As 252 anteriores continuam passando sem alteração de expectativa. O teste de navegador passou com 9 verificações.

**Conferido em navegador** (banco descartável, contas fictícias): planilha do professor com valores máximos e o diálogo de configuração; destaque da nota abaixo da média; média por instrumento com e sem valor máximo; teia por modalidade da turma e do estudante; painel do aluno em turma de 6 e em turma de 2 resultados.

**A fórmula não mudou.** `calcScore` não foi tocado. Um teste confirma que a nota final é a mesma soma com e sem valor máximo declarado.

**Decisões adotadas como provisórias** (C19 a C23 da seção 9)
- "Abaixo da média" é a média da turma na coluna, não uma média de aprovação.
- "Prática" na teia é o OSCE.
- "Prova" → "Avaliação" só no painel do aluno.
- Valor máximo dos instrumentos é opcional.
- Mínimo de 5 resultados para o aluno ver números da turma.
- Nota em escala (6,2) só em "Minhas notas" e só quando toda avaliação da disciplina vale 10; nos demais casos, percentual.

**Mudanças de comportamento que você precisa conhecer**
- **Planilha de notas sem coluna de matrícula deixou de ser aceita.** O modelo exportado pelo sistema já traz a coluna.
- **Alunos de turmas com menos de 5 resultados publicados deixam de ver média, posição e comparações.** Passam a ver só a própria nota.
- **Nota acima do valor máximo declarado de um instrumento bloqueia a publicação**, como já acontecia com as questões.
- **O painel do aluno mudou de rótulos** e perdeu o cartão "Avaliações publicadas".
- **Primeira inicialização depois desta atualização** aplica a migração 004 e grava a cópia habitual em `data/pre-migracao/`.

**Limites conhecidos**
- **Ficaram de fora, por decisão pendente:** colunas dinâmicas de múltipla escolha, link do gabarito mínimo, aba total após a articulação, ponto de corte com ativo/inativo por questão e a apresentação "no canto superior direito".
- **O OSCE sem estações só entra por importação de planilha.** A tela não tem campo para digitá-lo; o valor máximo dele pode ser declarado no cabeçalho "Total OSCE".
- **A teia por modalidade precisa de três modalidades com valor máximo.** Avaliações antigas, sem máximo nos instrumentos, mostram a orientação em vez do gráfico.
- **O botão "Consultoria Acadêmica" continua como estava** (C8), sem desenvolvimento.
- **O mínimo de alunos é configurado por variável de ambiente**, não pela tela do administrador.
- **Planilha exportada não traz os valores máximos dos instrumentos.**
- Leitor de tela e impressão do resultado do aluno não foram verificados depois das mudanças.

---

## Resultado da Etapa 5 (executada em 12/11/2026)

Branch `feature/etapa5-formularios-osce`, a partir da `main`, com um commit por parte (`5a228fc`, `165ef6a`, `6b58346`) e dois de documentação (`dccf8d5`, `bd225c1`). Mesclada na `main` em 12/11/2026 (commit de mesclagem `7bd87d4`); `npm test` repetido na `main` depois da mesclagem: 286 aprovadas, e o teste de navegador com 11. O desenho foi apresentado e autorizado antes de qualquer código.

| Parte | O que foi feito | Arquivos principais |
| --- | --- | --- |
| Núcleo de formulários | Formulário, perguntas, envios e respostas brutas, reutilizável pelos próximos módulos. Respostas não aceitam alteração nem exclusão no banco; um envio só pode ser anulado e continua guardado; um segundo envio válido sobre o mesmo aluno é recusado. | `core/migrations/005-forms.js`, `core/forms.js` |
| OSCE — servidor | Evento por ano, semestre, rodada e período, com estações em quantidade livre. Situações rascunho, liberado e encerrado. Montagem, liberação, respostas, resultado bruto e anulação. Permissões `osce.manage`, `osce.results` e `osce.respond`. | `core/migrations/006-osce.js`, `modules/osce/routes.js`, `modules/osce/store.js`, `modules/index.js` |
| OSCE — telas | Núcleo: lista, montagem, liberação, encerramento, resultados e anulação. Conta operacional: períodos e estações, formulário por aluno e "Enviar outra resposta". | `features/osce/osce.js`, `features/osce/osce.css`, `index.html`, `features/avaliacoes/app.js` |
| Ponto de extensão da interface | Módulo novo registra-se em `window.SupremaModules[perfil]` e desenha na tela de perfil, sem substituir funções de `app.js` (primeiro passo de A2). | `features/avaliacoes/app.js` |

**Testes:** 286 verificações aprovadas com um único `npm test`. São 12 novas, todas do OSCE e do núcleo de formulários. O teste de navegador passou com 11 verificações, 2 delas novas (Núcleo e conta operacional).

**Duas verificações da etapa 2 tiveram a expectativa atualizada.** Elas exigiam que os quatro perfis novos não tivessem nenhuma permissão. Agora exigem: Núcleo de Avaliação e Usuário operacional com exatamente as permissões do OSCE; Coordenação e CSTI sem nenhuma; nenhum dos quatro alcançando as rotas de administração, avaliações, aluno e evolução. A proteção que elas davam foi mantida e ficou mais específica.

**Conferido em navegador** (banco descartável, contas fictícias): criação, montagem e liberação pelo Núcleo; resposta e "Enviar outra resposta" pela conta operacional; resultado bruto e anulação; CSTI na tela neutra.

**Nenhuma nota é calculada.** As rotas do OSCE não devolvem nota, peso nem classificação, e um teste verifica isso. A resposta da pergunta-chave fica guardada como as demais.

**Aguardando a fórmula institucional do OSCE**
- Nota do OSCE por aluno e por estação.
- Tabela de melhores e piores desempenhos.
- Comparação entre OSCE 1 e OSCE 2, por período, semestre e ano, e os gráficos de comparação.
- Efeito da pergunta-chave (C1).

Quando a fórmula chegar, o cálculo entra em um arquivo isolado, com testes comparando com os números fornecidos; a coleta e as telas de montagem não mudam.

**Decisões adotadas como provisórias:** C24 a C29 da seção 9, mais C2 (estações em quantidade livre), C3 (não alimenta a coluna OSCE da A1/A2/A3) e C14 (quantidade de contas do ambulatório é a que o administrador criar).

**Mudanças de comportamento que você precisa conhecer**
- **Núcleo de Avaliação e Usuário operacional deixam de cair na tela neutra** e passam a abrir as telas do OSCE.
- **Primeira inicialização depois desta atualização** aplica as migrações 005 e 006 e grava a cópia habitual em `data/pre-migracao/`.
- **Trocar o perfil de uma conta** para Núcleo ou Usuário operacional passa a dar acesso ao OSCE.

**Limites conhecidos**
- **Sem exportação para planilha** do resultado bruto. Pode ser acrescentada.
- **O envio de perguntas pelos professores ao Núcleo continua fora do sistema.**
- **A lista de alunos usa o período cadastrado do aluno**, não uma matrícula em disciplina; o Núcleo revisa antes de liberar.
- **Depois de liberado, um erro de digitação em uma pergunta não pode ser corrigido** se já houver respostas. Sem respostas, o Núcleo pode voltar a rascunho.
- **As respostas ficam identificadas** (aluno, conta, data e hora). É o desenho do OSCE; a Avaliação Docente usará um mecanismo anônimo próprio.
- **A5 parcial:** o SQL do módulo novo e do núcleo ficou isolado em dois arquivos; as rotas antigas continuam com SQL direto.
- Uso em tablet ou celular, várias contas respondendo ao mesmo tempo sob carga e leitor de tela não foram verificados.

---

## Resultado da Etapa 6 (executada de 13 a 15/11/2026)

Branch `feature/etapa6-avaliacao-docente`, a partir da `main`, com três commits de código (`fa54fad`, `708bc13`, `c52bf63`) e dois de documentação (`f3a27fd`, `c001143`). Mesclada na `main` em 15/11/2026 (commit de mesclagem `f6425d4`); `npm test` repetido na `main` depois da mesclagem: 295 aprovadas, e o teste de navegador com 14. O desenho, com o limite do anonimato, foi apresentado e autorizado antes de qualquer código.

| Parte | O que foi feito | Arquivos principais |
| --- | --- | --- |
| Caminho anônimo do núcleo | Participação e respostas em tabelas sem ligação, sem numeração sequencial, com identificador aleatório e só a data. Nenhuma linha aceita alteração ou exclusão. Comentários saem em ordem sorteada a cada leitura. Servirá também à Articulação. | `core/migrations/007-anonymous-forms.js`, `core/forms.js` |
| Avaliação Docente — servidor | Avaliação por ano, semestre, rodada e período, com as mesmas perguntas para todos os professores. Situações rascunho, liberada e encerrada; o encerramento é definitivo. Adesão por contagem. Resultados só depois do encerramento e acima do mínimo. | `core/migrations/008-teacher-eval.js`, `modules/avaliacao-docente/routes.js`, `modules/avaliacao-docente/store.js` |
| Telas | CSTI, aluno, professor e Coordenação. | `features/avaliacao-docente/docente.js`, `docente.css`, `index.html`, `features/avaliacoes/app.js` |
| Pontos de extensão e partes comuns | `window.SupremaViews` para o menu do professor e a entrada de módulos na tela do aluno. Utilitários de tela e estilos comuns dos módulos reunidos em um lugar só, usados também pelo OSCE. | `shared/ui.js`, `styles/modulos.css`, `features/osce/osce.js`, `features/osce/osce.css` |

**Testes:** 295 verificações aprovadas com um único `npm test`. São 9 novas, todas da Avaliação Docente. O teste de navegador passou com 14 verificações, 3 delas novas (aluno, professor e Coordenação).

**As duas verificações de perfis foram atualizadas outra vez**, pelo mesmo motivo da etapa 5: passam a exigir exatamente uma permissão da Avaliação Docente para CSTI, Coordenação, professor e aluno.

**O que os testes provam sobre o anonimato**
- As tabelas de respostas não têm coluna de aluno, conta, sessão ou hora, e a tabela de participação não tem referência a uma resposta.
- As três tabelas não têm numeração sequencial (`WITHOUT ROWID`), então a ordem de chegada não fica registrada.
- O identificador de cada resposta é aleatório e só a data é gravada.
- Nenhum nome, matrícula ou e-mail de aluno aparece no que foi respondido, nos resultados nem na adesão.
- A auditoria registra que um aluno respondeu em uma avaliação, sem o professor e sem o conteúdo.
- O banco recusa alterar ou apagar respostas e participações.

**Limite do anonimato (risco residual).** Uma cópia isolada do banco não liga resposta a aluno. Quem comparar duas cópias de momentos diferentes, como dois backups diários, vê quais participações e quais respostas surgiram no intervalo; se só um aluno avaliou certo professor nesse intervalo, a ligação fica possível. Isso exige acesso aos arquivos de backup e não é eliminado pelo esquema. Recomenda-se restringir o acesso aos backups e tratar isso na política de privacidade.

**Conferido em navegador** (banco descartável, contas fictícias): os quatro perfis, com uma avaliação encerrada e outra liberada.

**Decisões adotadas como provisórias:** C30 a C35 da seção 9, além de C7 (nenhuma "média" do professor: só contagens e o percentual de Sim sobre Sim mais Não) e C17 (mínimo de 5 respostas).

**Mudanças de comportamento que você precisa conhecer**
- **CSTI e Coordenação deixam de cair na tela neutra** e passam a abrir a Avaliação Docente.
- **O professor ganha o item "Avaliação Docente" no menu**, no lugar do aviso "em desenvolvimento".
- **O aluno ganha a entrada "Avaliação Docente"** na barra lateral, com a contagem de pendências.
- **Primeira inicialização depois desta atualização** aplica as migrações 007 e 008 e grava a cópia habitual em `data/pre-migracao/`.

**Limites conhecidos**
- **O encerramento não pode ser desfeito.** Se o CSTI encerrar cedo demais, é preciso criar outra avaliação.
- **O texto de um comentário pode identificar quem escreveu.** A tela avisa o aluno antes do envio.
- **A comparação entre avaliações usa o total de Sim sobre Sim mais Não**, porque as perguntas podem mudar de uma avaliação para outra.
- **Os "cruzamentos de dados" citados na reunião não foram definidos** e não foram implementados.
- **Sem exportação para planilha e sem lembrete aos alunos.**
- **Quem leciona duas turmas da mesma disciplina aparece uma vez por turma.**
- Uso em celular e leitor de tela não foram verificados.

---

## Insumos recebidos em 15/11/2026 (depois da etapa 6)

Recebidos do usuário, sem nenhuma alteração de código até aqui.

### Formulário da Articulação Interdisciplinar (18 capturas de tela do Google Forms)

Título: "Avaliação Caso 6 - Articulação Interdisciplinar". Aviso no topo: "As respostas serão restritas à Direção e à Coordenação de Curso". O formulário coleta o e-mail do participante. Quatro seções:

| Seção | Pergunta | Tipo de resposta |
| --- | --- | --- |
| 1 | Nome do aluno | texto curto, obrigatório |
| 1 | E-mail institucional | texto curto, obrigatório |
| 1 | Período do curso | 1º a 8º período |
| 1 | Nome do tutor | lista com 23 tutores |
| 1 | 1 – Como avalia o conjunto de atividades (abertura, estações de apoio e fechamento) da semana | nota de 0 a 10, mais "Justifique" |
| 2 – Abertura do caso | 2.1 O tutor foi pontual para o início das atividades? | Sim / Não |
| 2 | 2.2 O tutor seguiu de forma correta os passos do processo tutorial? | Sim / Não / Parcialmente, mais "Justifique" |
| 2 | 2.3 O tutor apresentou cada passo do processo tutorial? | Sim / Não / Parcialmente |
| 2 | 2.4 Nota para o tutor na abertura do caso | nota de 0 a 10 |
| 3 – Estações de apoio | 3.1 As estações estavam adequadas ao caso? | Sim / Não / Parcialmente, mais "Justifique" |
| 3 | 3.2 As estações iniciaram no horário marcado? | Sim / Não / Parcialmente, mais "Justifique" |
| 3 | 3.3 As estações contribuíram para a construção do conhecimento e para os objetivos de aprendizagem? | Sim / Não / Parcialmente, mais "Justifique" |
| 3 | 3.4 Qual a estação de apoio você mais gostou? | lista com 53 disciplinas, mais "Justifique" |
| 3 | 3.5 Qual a estação de apoio você menos gostou? | lista com 53 disciplinas, mais "Justifique" |
| 4 – Fechamento do caso | 4.1 O tutor foi pontual para o início das atividades? | Sim / Não |
| 4 | 4.2 O tutor seguiu de forma correta os passos do processo tutorial? | Sim / Não / Parcialmente, mais "Justifique" |
| 4 | 4.3 O tutor apresentou cada passo do processo tutorial? | Sim / Não / Parcialmente |
| 4 | 4.4 Nota para o tutor no fechamento do caso | nota de 0 a 10 |
| 4 | 5 – Como avalia o seu aprendizado nessa semana | nota de 0 a 10 |

O que isso muda em relação ao previsto:
- **O avaliado é o tutor, por caso** ("Caso 6"), e não o professor de uma disciplina. Há mais de um caso por semestre.
- **As respostas são identificadas** (nome e e-mail) e restritas à Direção e à Coordenação. O padrão provisório C18, de anonimato, não se sustenta (ver C36).
- **Há três tipos de resposta que o núcleo de formulários ainda não tem:** Sim / Não / Parcialmente, nota de 0 a 10, e escolha em lista. Há também o texto livre "Justifique", ligado a uma pergunta.
- **A fórmula do resultado não está nos prints.** Eles mostram a coleta; a planilha que calcula o desempenho do tutor continua pendente (C41).
- Os nomes dos tutores e dos alunos são dados reais e não foram copiados para este relatório, nem serão para código ou testes.

### Requisito novo: comprovante das ações do aluno

Pedido do usuário: para tudo o que o aluno fizer, gerar um comprovante em PDF, com um código que a administração consiga verificar, para confirmar que houve o envio e que o aluno realmente fez. O comprovante é do aluno e da administração; os professores não o veem.

Desenho proposto, implementado na etapa 7 (ver "Resultado da Etapa 7"):
- Um registro de comprovante por envio do aluno, com código aleatório, o que foi feito, quando e por quem. O registro não pode ser alterado nem apagado.
- O PDF é gerado a partir do registro. A verificação é feita no sistema, pelo código: o que vale é o registro do servidor, não o arquivo, então um PDF adulterado não passa.
- O aluno baixa o PDF logo após a ação e encontra todos em "Meus comprovantes".
- A administração tem uma tela para verificar um código e outra para listar comprovantes.
- Na Avaliação Docente o comprovante prova a participação, nunca o conteúdo (C37).

Decisões provisórias associadas: C36 a C41 da seção 9.

---

## Resultado da Etapa 7 (executada em 15/11/2026)

Branch `feature/etapa7-comprovantes-articulacao`, a partir da `main`, com quatro commits de código (`450ad95`, `f28b02a`, `2fceb16`, `1a64974`) e dois de documentação (`d90059c`, `b422031`). Mesclada na `main` em 15/11/2026 (commit de mesclagem `e23a66b`); `npm test` repetido na `main` depois da mesclagem: 308 aprovadas, e o teste de navegador com 22. A etapa foi feita na ordem pedida pelo usuário: primeiro os comprovantes, depois a Articulação. O desenho das duas partes foi apresentado e confirmado antes do código.

| Parte | O que foi feito | Arquivos principais |
| --- | --- | --- |
| Comprovantes — servidor | Registro por envio do aluno, com código aleatório de 80 bits, o que foi feito, quando e por quem. Emitido dentro da transação da ação. Não aceita alteração nem exclusão. PDF de uma página gerado a partir do registro, sem biblioteca externa. Verificação e pesquisa pelo Administrador e pelo CSTI. | `core/migrations/009-receipts.js`, `core/receipts.js`, `modules/comprovantes/routes.js` |
| Comprovantes — telas | "Meus comprovantes" do aluno; verificação de código e lista para o Administrador e o CSTI; cartão do comprovante logo após o envio. | `features/comprovantes/comprovantes.js`, `comprovantes.css` |
| Menus por perfil | Registro único `SupremaModules.add(perfil, item)`: um perfil recebe itens de vários módulos, inclusive o Administrador. OSCE e Avaliação Docente convertidos. | `shared/ui.js`, `features/avaliacoes/app.js`, `index.html` |
| Articulação — servidor | Avaliação com nome livre, perguntas editáveis e listas de períodos, tutores e estações, com lista padrão. Quatro situações, cada uma reversível. Resposta única, identificada e imutável, com comprovante. Resultado bruto geral e por tutor. Exportação com as colunas da planilha da instituição. | `core/migrations/010-articulation.js`, `modules/articulacao/routes.js`, `modules/articulacao/store.js` |
| Articulação — telas | CSTI (montagem, etapas, resultados e exportação), aluno (formulário e comprovante), Coordenação (resultados liberados) e tutor (quadro próprio, sem nomes). | `features/articulacao/articulacao.js`, `articulacao.css` |
| Lista de pendências | Tudo o que depende do usuário ou da instituição, em um arquivo só. | `docs/PENDENCIAS.md` |

**Testes:** 308 verificações aprovadas com um único `npm test`. São 13 novas: 6 dos comprovantes e 7 da Articulação. O teste de navegador passou com 22 verificações, 8 delas novas.

**As duas verificações de perfis foram atualizadas outra vez**, para exigir exatamente as permissões novas de cada perfil.

**O que os testes provam**
- O comprovante nasce junto com o envio e não existe sem ele; uma segunda tentativa recusada não gera comprovante.
- O registro e o PDF não contêm nada do que foi respondido; na Avaliação Docente o comprovante não aponta para a resposta, que continua sem aluno.
- Outro aluno, o professor e a Coordenação recebem para um código alheio a mesma resposta dada a um código inexistente.
- Um código inventado ou com um caractere trocado não é reconhecido.
- A Articulação só é liberada com as listas preenchidas e exatamente uma pergunta de tutor; depois de liberada a estrutura não muda.
- Cada tipo de resposta é validado (nota inteira de 0 a 10, opção da lista certa); nada é gravado em caso de recusa.
- Os resultados não trazem média, percentual nem classificação.
- A Coordenação não vê nada antes da liberação dos resultados; o tutor só vê o próprio grupo, sem nomes e sem números abaixo do mínimo.
- A planilha exportada tem as quatro colunas de identificação, as perguntas na ordem e uma coluna "Justifique" depois de cada pergunta que a pede, como na planilha de respostas recebida.

**Dados reais.** As capturas e a planilha de exemplo contêm nomes de tutores e de alunos. Nenhum foi copiado para o código, para os testes ou para a documentação. O modelo de perguntas contém só o texto das perguntas; as listas de tutores e de estações são cadastradas pelo CSTI na tela.

**Decisões do usuário nesta etapa:** C36 a C40 (seção 9). **Padrões provisórios:** C41 a C48.

**Mudanças de comportamento que você precisa conhecer**
- **A administração passa a saber quem respondeu a Avaliação Docente**, pelo comprovante. O que cada um respondeu continua sem ligação com o aluno.
- **Administrador e CSTI ganham o item "Comprovantes".**
- **CSTI e Coordenação ganham "Articulação Interdisciplinar"**; o professor perde o aviso "em desenvolvimento" desse item; o aluno ganha as entradas "Articulação Interdisciplinar" e "Meus comprovantes".
- **Primeira inicialização depois desta atualização** aplica as migrações 009 e 010 e grava a cópia habitual em `data/pre-migracao/`.

**Limites conhecidos**
- **O percentual de desempenho do tutor não existe.** Depende da planilha com as fórmulas (P2 de `docs/PENDENCIAS.md`).
- **A planilha exportada não foi testada dentro da planilha de cálculo da instituição**, que não foi fornecida.
- **A avaliação não é restrita por período.** Qualquer aluno ativo responde e informa o período.
- **Não há lembrete aos alunos nem lista de quem ainda não respondeu.**
- **O comprovante não é enviado por e-mail.**
- **Um comprovante não é cancelado.** Se uma resposta do OSCE é anulada isso não afeta comprovantes, porque o OSCE é respondido pelo ambulatório e não gera comprovante.
- Leitor de tela e impressão não foram verificados.

---

## Resultado da Etapa 8 (executada em 15/11/2026)

Branch `feature/etapa8-legibilidade`, a partir da `main`, com dez commits (`49e4e88`, `3ab59e4`, `d4fa2e1`, `133f38e`, `f18b820`, `8c24375`, `ae2bd2c`, `258e72f`, `70751fa`, `05b6f4a`) e três de fechamento (`808282f`, `65b8f2c`, `976c5ee`). Mesclada na `main` em 15/11/2026 (commit de mesclagem `a0e56a7`); `npm test` repetido na `main` depois da mesclagem: 314 aprovadas, e o teste de navegador com 23. Em seguida, a pedido do usuário, a branch `docs/contexto-ia` foi mesclada (commit `abd1090`): acrescenta apenas `CONTEXTO_IA.md`, um resumo do projeto para outras IAs, e os links para ele; a suíte e o teste de navegador foram repetidos na `main` com os mesmos resultados. O plano foi apresentado e autorizado antes do código, com quatro escolhas do usuário: formatador automático, remoção do botão "Consultoria Acadêmica", versão 12.0.0 e guia de uso por perfil. É a última etapa do plano.

| Item | O que foi feito | Arquivos principais |
| --- | --- | --- |
| A1 — código compactado | Todo o JavaScript (83 arquivos) e o CSS (12 folhas) reformatados por um formatador automático, em commits separados por grupo. O formato passa a ser exigido pelo `npm test`. | `.prettierrc.json`, `.prettierignore`, `package.json` |
| Prova de equivalência | Um verificador compara a árvore de sintaxe e os comentários de cada arquivo JavaScript antes e depois; outro compara as regras de estilo como o navegador as interpreta. Os dois foram testados antes do uso e ficam no repositório. | `scripts/format-equivalence.js`, `tests/browser/css_equivalence.py` |
| A2 — sobrescritas na interface | As quatro funções do `app.js` que eram substituídas por outros arquivos passam a chamar complementos registrados. A ordem dos `<script>` deixa de decidir o resultado. | `shared/ui.js`, `features/avaliacoes/app.js`, `features/indicadores/analytics.js`, `features/academico/academico.js`, `eslint.config.js` |
| A7 — fórmula duplicada no navegador | Teste que executa a prévia do navegador contra o caminho de gravação do servidor em 36 mil linhas. | `tests/integration/calculo_tela.test.js` |
| A9 — botão sem função | "Consultoria Acadêmica" removido do painel do aluno (C8). | `features/academico/academico.js`, `academico.css` |
| A10 — modelo do banco | Esquema gerado a partir do banco real, com teste que acusa o documento desatualizado. O modelo recebido fica como proposta histórica. | `scripts/schema-doc.js`, `docs/modelagem/esquema_atual.sql`, `tests/integration/esquema_documentado.test.js` |
| Limpeza | Oito variáveis e funções sem uso removidas; o limite de avisos do lint passou de 8 para 0. | arquivos da interface e das suítes antigas |
| Documentação final | README com índice por objetivo, guia de uso por perfil, guia para criar módulos, histórico de versões, mapa do que foi acrescentado e lista de pendências. Versão 12.0.0. | `README.md`, `docs/GUIA_DE_USO.md`, `docs/COMO_CRIAR_UM_MODULO.md`, `CHANGELOG.md`, `docs/PENDENCIAS.md` |

**Testes:** 314 verificações aprovadas com um único `npm test`, 6 delas novas. O teste de navegador passou com 23 verificações, 1 nova. `npm audit` sem vulnerabilidades.

**O que as verificações da reformatação provam**
- Nos 83 arquivos JavaScript, a estrutura do código, os nomes, os valores e os comentários são os mesmos antes e depois.
- Nas 12 folhas de estilo, o navegador lê as mesmas 1.261 regras, na mesma ordem.
- O HTML das abas Resultados e Individual do professor e do resultado do aluno, com dados fictícios, é idêntico antes e depois da troca das sobrescritas.
- Depois da remoção do botão, a única diferença nessas telas é o botão e o aviso que o acompanhava.

**Três mudanças de comportamento, todas pequenas**
- **Botão "Consultoria Acadêmica" removido**, por escolha do usuário.
- **Prévia dos totais na planilha do professor.** O teste novo mostrou que, com uma nota digitada com mais de duas casas decimais, a prévia podia diferir em 1 centésimo do valor que o servidor grava. A prévia passou a arredondar cada nota como o servidor. A fórmula do servidor não foi alterada e nenhuma nota gravada esteve errada.
- **Botão "Atualizar resultados" do aluno.** A sobrescrita antiga só alcançava a entrada na tela; o botão chamava a função original e não descartava os dados guardados pelo painel adicional. Com os complementos, o botão também descarta.

**A fórmula `calcScore` não foi tocada.** A reformatação de `core/domain.js` está entre os arquivos provados idênticos.

**Não feito, por mudar comportamento ou depender de decisão** (P30 a P34 de `docs/PENDENCIAS.md`): colunas fixas da tabela de notas (A3), SQL dentro das rotas antigas (A5), disciplina e período guardados como texto na avaliação (A6), marca de 60% em mais de um arquivo (A8).

**Limites conhecidos**
- **Restam linhas longas em arquivos da interface** (a maior com 1.929 caracteres, em `app.js`). São trechos de HTML dentro de texto, que o formatador não divide.
- **O histórico do Git ganhou quatro commits que tocam quase todas as linhas.** Para ver o autor real de uma linha, `git blame --ignore-rev` com esses quatro commits.
- **As telas antigas não foram conferidas em aparelho depois da reformatação.** O CSS foi provado equivalente, o que torna uma diferença visual improvável, mas não houve inspeção em celular.
- A CI continua sem nunca ter rodado: não existe repositório remoto.

---

## Resultado do relatório da Articulação (executado em 16/11/2026)

Depois do plano de nove etapas, o usuário decidiu tratar as pendências por partes. Informou que a fórmula do OSCE depende dos professores e ainda não tem resposta, e enviou a planilha de relatório da Articulação. Branch `feature/articulacao-relatorio`, a partir da `main`. O plano foi apresentado e autorizado antes de qualquer código. Commits: `6ef0ac8` (cálculo, rotas e exportação), `12f0cdf` (telas) e `947b8a8` (documentação) e `16373ff` (HANDOFF). **Mesclada na `main` em 16/11/2026 a pedido do usuário ("Mesclar na main"), commit de mesclagem `46c43cf`, com `--no-ff` e sem push.** `npm test` repetido na `main` depois da mesclagem: 322 aprovadas e 0 reprovadas; teste de navegador com 23.

**O insumo.** `Relatorio articulação.xlsx`, lido fora do repositório e não copiado para ele. Uma aba, "Matriz", sem nenhuma resposta: o cabeçalho do formulário, 13 linhas para alunos e três linhas de totais com 42 fórmulas. É o quadro de um tutor em um período.

| Coluna da planilha | Fórmulas das três linhas |
| --- | --- |
| Respondentes | `=COUNTA(C2:C14)` |
| Nota de 0 a 10 (perguntas 1, 2.4, 4.4 e 5) | `=SUM(col)/$B$15`, `=MIN(col)`, `=MAX(col)` |
| Sim, Não, Parcialmente (2.1 a 2.3, 3.1 a 3.3, 4.1 a 4.3) | `=COUNTIF(col,"Sim")/$B$15`, depois "Não" e "Parcialmente", exibidos como percentual inteiro |

A planilha não tem número único de desempenho, classificação de tutores nem as perguntas 3.4 e 3.5.

**O que foi entregue**

| Parte | Entrega | Arquivos |
| --- | --- | --- |
| Cálculo | As fórmulas acima em um arquivo só, sem banco e sem rotas. | `core/calculo/articulacao.js` (novo) |
| Rotas de resultado | Média, menor e maior nota e percentual de cada resposta em cada pergunta, no quadro geral, por tutor e por período. O tutor vê a divisão por período só quando todos atingem o mínimo. | `modules/articulacao/routes.js` |
| Exportação | Uma aba por tutor e período depois da aba de respostas, com as fórmulas da planilha e o resultado gravado. | `modules/articulacao/routes.js` |
| Telas | CSTI, Coordenação e tutor: números do relatório, quadros por período, aviso "Como ler estes números". | `features/articulacao/articulacao.js`, `articulacao.css` |

**Testes:** 322 verificações aprovadas com um único `npm test` (8 novas). O teste de navegador passou com 23. Uma exportação fictícia foi recalculada pelo Excel 16 desta máquina: 252 células de fórmula em 6 abas, nenhuma diferente do que o sistema gravou; os percentuais e as médias aparecem no Excel com o mesmo arredondamento das telas.

**Uma verificação da etapa 7 e uma de navegador tiveram a expectativa atualizada.** Exigiam que os resultados não tivessem média nem percentual, porque não havia fórmula. Agora exigem os números do relatório com valores conferidos e continuam proibindo número único de desempenho e classificação.

**Mudanças de comportamento**
- As telas de resultado da Articulação passam a mostrar média, menor e maior nota e percentuais.
- O aviso "Percentual de desempenho: aguardando a fórmula institucional" foi substituído por "Como ler estes números".
- O arquivo exportado tem abas a mais; a primeira aba não mudou. O link passou a se chamar "Baixar respostas e relatório (Excel)".
- Versão 12.1.0.

**Decisões:** C41 resolvido; C50 e C51 aceitos pelo usuário; C49 em aberto (o usuário não conseguiu confirmar); C52 a C54 provisórios.

**O que não foi verificado**
- O relatório com respostas reais, comparado com uma planilha que a instituição tenha preenchido para o mesmo caso.
- A exportação aberta no Google Planilhas.
- Se a instituição tem uma etapa de cálculo depois dessa planilha.

---

## Resultado da nota do OSCE e da planilha final da Articulação (executado em 16/11/2026)

Na mesma data do relatório da Articulação, o usuário enviou mais duas planilhas: "Este é o do OSCE" e "Articulação -> e este é como deve ficar o resultado FINAL". As duas têm nomes e e-mails reais; foram lidas em cópias isoladas fora do repositório e nada delas foi copiado para código, testes ou documentação. O que foi lido e o plano foram apresentados antes do código; o usuário respondeu "Sim, implementar". Branch `feature/osce-nota-articulacao-final`, a partir da `main`.

**Planilha do OSCE.** Quatro abas de estação, "Junção" e "Resultado Final".

| Onde | Fórmula |
| --- | --- |
| Acertos (cada linha de aluno) | `=(COUNTIF(<itens>,"Fez"))*(IF(<item de postura>="Fez",1,0.5))` |
| NOTA | `=(Acertos)/<Total Questões>` |
| Junção | uma linha por nota: nome, nota e estação, lidos das abas |
| Resultado Final | tabela dinâmica com a média da nota: aluno × estação, total por aluno, por estação e geral |

O item de postura é a primeira coluna de cada aba e não entra em "Total Questões" (6, 11, 12 e 10 itens nas quatro estações). A nota vai de 0 a 1. Um aluno avaliado em uma só estação tem a nota dela como total: estação não avaliada não é zero. A planilha não traz nota de aprovação, lista de melhores e piores nem comparação entre rodadas.

**Planilha final da Articulação.** 24 abas, uma por tutor (nome da aba = nome do tutor), 231 respostas, e uma aba "Matriz" vazia. Colunas: data, e-mail, nome, período, tutor e as perguntas. Três linhas de totais sem rótulo: média, maior e menor nota; Sim, Parcialmente e Não. Um dos tutores tem respostas de dois períodos na mesma aba. Nenhuma aba junta os tutores: não há número único nem classificação.

**O que foi feito**
- `apps/api/src/core/calculo/osce.js`: `factor`, `hits`, `grade`, `average`, `shown` e `SHEET_LABELS`. Sem banco e sem rotas.
- `modules/osce/routes.js`: `GET .../results` devolve `items`, `average`, `hits` e `grade` por estação e `consolidated` com a nota de cada aluno por estação, a nota final e a média geral. Rota nova `GET /api/osce/events/:id/results/export` (permissão `osce.results`, auditoria `OSCE_EXPORTAR`): uma aba por estação com as fórmulas, "Junção" e "Resultado Final".
- Telas do OSCE: quadro "Notas do OSCE · de 0 a 1", ordenável pela nota final; acertos e nota em cada estação; "Fez" e "Não fez"; link "Baixar notas (Excel)"; o aviso "aguardando fórmula institucional" deu lugar a "Como as notas são calculadas".
- Articulação: exportação com uma aba por tutor em ordem alfabética, totais na ordem da planilha final e sem rótulos, sem a coluna "E-mail Institucional", e a aba "Todas as respostas" por último. `SHEET_SHARES` passou a `SIM, PARCIAL, NAO`. O aviso das telas diz que a instituição não usa número único nem classificação.
- Versão 12.2.0.

**Commits da branch**
- `9d777b7` Calcula a nota do OSCE pelas formulas da planilha da instituicao
- `1a6414d` Exporta a Articulacao no formato da planilha final da instituicao
- `e4440c0` Documenta a nota do OSCE e a planilha final da Articulacao
- `c02658a` Atualiza o HANDOFF para o estado apos a mesclagem da nota do OSCE

**Mesclagem.** A pedido do usuário ("Mesclar na main"), em 16/11/2026, com `--no-ff`: commit `6b61021` "Nota do OSCE e planilha final da Articulacao". Sem push; não há remoto. Na `main`, depois da mesclagem: `npm test` com código de saída 0 e 335 aprovadas, navegador com 24 aprovadas, `git status` limpo e nenhuma pasta temporária de teste sobrando.

**Verificações**
- `npm test`: código de saída 0, 335 aprovadas e 0 reprovadas (13 novas, todas do OSCE). Navegador: 24 aprovadas (1 nova).
- A planilha do OSCE recebida, recalculada pelo sistema: 48 acertos, 48 notas e 70 células do "Resultado Final", nenhuma diferente.
- Os 936 totais da planilha final da Articulação, refeitos por um script à parte antes da mudança: nenhum diferente.
- Excel 16 desta máquina, com exportações de dados fictícios: 457 células de fórmula do OSCE e 126 da Articulação, nenhuma diferente; 93 números exibidos com o mesmo arredondamento das telas.
- Quatro verificações anteriores e três de navegador tiveram a expectativa atualizada (detalhe em `docs/VALIDACAO.md`).
- Uma das execuções do `npm test` parou em `seguranca_login.test.js` com "bad port": o sistema sorteou para o servidor de teste uma porta que o Node recusa. O arquivo não foi alterado nesta tarefa; a execução seguinte passou inteira. Registrado como P44.

**Decisões:** C1 e C49 resolvidos; C50 e C54 revistos; C55 a C59 provisórios (P39 a P43 em `docs/PENDENCIAS.md`).

**O que não foi verificado**
- Um OSCE real aplicado pelo sistema e comparado com a planilha dos professores para o mesmo dia.
- As exportações abertas no Google Planilhas.
- A exportação da Articulação com a lista real de tutores.

---

## Preparação para a integração com outro sistema (16/11/2026)

O usuário informou que o sistema será integrado a outro, de mesma estrutura e com funcionalidades e códigos diferentes, por uma pessoa responsável, e pediu que a lista de pendências reúna tudo o que falta, inclusive os ajustes para a integração. **O outro sistema não foi visto**; nada foi decidido sobre ele.

**Entregue (só documentação, branch `docs/integracao`, commits `932ad91` e `48348dd`)**
- `docs/INTEGRACAO.md`: tronco proposto, inventário do que este sistema ocupa, regras do tronco, pontos de conflito, questionário sobre o outro sistema, passo a passo em fases e garantias que não podem quebrar.
- `docs/PENDENCIAS.md`: resumo no topo e seção 8 nova (P45 a P64). Os números anteriores não mudaram.
- README, mapa de pastas, CHANGELOG, `CONTEXTO_IA.md` e `HANDOFF.md` apontam para o guia.

**Achados do levantamento** (conferidos no código, detalhados no guia)
- A organização em núcleo, módulos carregados em separado, manifesto e registros de tela já serve de tronco.
- Pontos frágeis para uma junção: 67 nomes no escopo global de `features/avaliacoes/app.js` (liga-se a A2); estilos gerais sem classe raiz; 18 tabelas de base criadas fora das migrações numeradas; tabelas antigas com nomes genéricos; cinco variáveis de ambiente sem prefixo; pacotes internos com a versão 11.9.0.

**O que não foi feito**
- Nenhum ajuste de código: o pedido foi de organização e documentação. Seis ajustes (P55, P56, P57, P59, P61, P62) não dependem do outro sistema e podem ser feitos quando o usuário pedir.
- Nenhuma comparação com o outro sistema, que não foi recebido.

**Verificações:** `npm test` com código de saída 0 e 335 aprovadas; navegador com 24 aprovadas. Nenhum arquivo de código, teste ou migração foi alterado.

**Mesclagem.** A pedido do usuário ("Mesclar na main"), em 16/11/2026, com `--no-ff`: commit `d00077f` "Guia de integracao com outro sistema e pendencias reorganizadas". Sem push; não há remoto. Na `main`, depois da mesclagem: `npm test` com código de saída 0 e 335 aprovadas, navegador com 24 aprovadas e `git status` limpo.

---

## Anexo — Rastreio da reunião de 06/11 (AT-19)

Situação depois da etapa 4.

| Pedido | Situação |
| --- | --- |
| Acrescentar colunas de múltipla escolha | Não implementado — pendente de decisão |
| Valor máximo de OSCE, SAI e trabalho | **Entregue na etapa 4** (opcional; inclui "Outros") |
| Ponto de corte e ativo/inativo | Não implementado — semântica pendente |
| Cor para nota abaixo da média na planilha | **Entregue na etapa 4** (média da turma, com marca "↓"; ver C19) |
| Aba total após articulação interdisciplinar | Não implementado — fórmula pendente |
| Gráficos de SAI, OSCE e práticas | **Entregue na etapa 4**: média por instrumento sobre o valor máximo, estações separadas |
| Link do gabarito mínimo | Não implementado — pendente de decisão |
| Teia prática × teórica × múltipla escolha | **Entregue na etapa 4** (prática = OSCE; ver C20) |
| "Aluno x turma" → "Aluno/turma" | **Entregue na etapa 4** |
| Apresentação no canto superior direito | Não implementado — falta referência visual |
| Gráfico da esquerda à direita, começando pelo total | **Entregue na etapa 4**: barra "Total" primeiro; cartões começam por "Minha nota" |
| "Onde estou" na teia | **Entregue na etapa 4** |
| "Nota final" → "Minha nota" | **Entregue na etapa 4** (painel do aluno) |
| "Prova" → "Avaliação" | **Entregue na etapa 4** no painel do aluno; professor e planilhas mantêm "Nota da Prova" (ver C21) |
| Retirar "Avaliações publicadas" do login do aluno | **Entregue na etapa 4** |
| 62% → 6,2 em locais de nota | Parcial: em "Minhas notas", só quando a avaliação vale 10 |
| "Minhas disciplinas" → "Minhas notas" | **Entregue na etapa 4** |
| Nome das disciplinas no gráfico de barras | **Entregue na etapa 4** |
| Manter percentual nos gráficos | Já atendia |
| Linha pontilhada em 60% | **Entregue na etapa 4** (gráfico de barras; teia e evolução já tinham) |
| Abrir disciplina e ver gráficos | **Entregue na etapa 4**: botão "Ver gráficos" em cada disciplina |
