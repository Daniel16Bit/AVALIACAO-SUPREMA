# Pendências

Tudo o que ainda falta neste sistema, atualizado em 16/11/2026 (versão 12.2.0).
Tem dois leitores:

- **você e a instituição**, para o que depende de envio, decisão ou
  confirmação (seções 1 a 6);
- **a pessoa responsável pela integração com o outro sistema**, para o trabalho
  técnico (seções 7 e 8). O porquê de cada item da seção 8 e a ordem de
  execução estão no [Guia de integração](INTEGRACAO.md).

O sistema funciona hoje com tudo o que está aqui em aberto: cada item diz o que
acontece enquanto não é resolvido.

## Resumo

| Seção | O que reúne | Itens | Quem resolve |
| --- | --- | --- | --- |
| 1 | Documentos e regras que faltam enviar | P1, P3, P4 | Instituição |
| 2 | Decisões acadêmicas da reunião de 06/11 | P5 a P9 | Instituição |
| 3 | Padrões provisórios para confirmar | P10 a P18, P25 a P29, P35 a P43 | Você |
| 4 | Infraestrutura | P19 a P24 | Você e a equipe de infraestrutura |
| 5 | Verificações que só o ambiente real permite | sem número | Quem implantar |
| 6 | Dados que você cadastra na tela | sem número | Você |
| 7 | Melhorias de código registradas | P30 a P34, P44 | Quem mantiver o código |
| 8 | **Integração com o outro sistema** | P45 a P64 | Responsável pela integração, com decisões suas |

Ordem sugerida para a integração: primeiro P55 (repositório remoto) e P45 a
P47 (receber o outro sistema e as informações dele); depois as decisões P48 a
P54; em paralelo, os ajustes P56 a P64, que não dependem do outro sistema.
Das seções anteriores, pesam na integração: P19 (repositório remoto), P24 e
P31 (motor do banco), P30 (colunas fixas da tabela de notas) e P34 (ligação do
OSCE com as notas).

## 1. Documentos e fórmulas que faltam enviar

| # | O que falta | Para que serve | O que acontece enquanto não chega |
| --- | --- | --- | --- |
| P1 | **Regra para melhores e piores desempenhos, nota de aprovação e comparação entre OSCE 1 e OSCE 2**, se a instituição quiser. A planilha do OSCE recebida em 16/11/2026 não traz nenhum dos três. | Destacar alunos e comparar as duas rodadas | **A nota do OSCE já é calculada** pela planilha recebida: nota por estação, nota final, média por estação e média geral, nas telas e na exportação. O quadro pode ser ordenado pela nota final. |
| P2 | ~~Etapa de cálculo depois da planilha da Articulação~~ **Resolvido em 16/11/2026:** a planilha de resultado final que você enviou mostra que não existe. O resultado final é uma aba por tutor, sem número único e sem classificação. | — | Nada pendente. |
| P3 | **Definição de "média" do professor na Avaliação Docente**, se a instituição quiser uma | Um número único por professor | A tela mostra contagens e o percentual de Sim sobre Sim mais Não. |
| P4 | **Referência visual do "canto superior direito"** pedida na reunião de 06/11 para o painel do aluno | Posicionar a apresentação como a coordenação quer | O painel segue o layout atual. |

## 2. Decisões acadêmicas ainda pendentes (reunião de 06/11)

| # | Assunto | Situação |
| --- | --- | --- |
| P5 | Colunas dinâmicas de múltipla escolha | Não implementado: faltam limites, nomes e fórmula |
| P6 | Link do gabarito mínimo | Não implementado: faltam origem, hospedagem e permissões |
| P7 | Aba "total" após a Articulação | Não implementado: fórmula a homologar |
| P8 | Ponto de corte e ativo/inativo por questão | Não implementado: falta definir onde incide |
| P9 | A marca de 60% é só referência visual ou critério de aprovação? | Hoje é referência visual em todas as telas |

## 3. Padrões provisórios para confirmar

Foram adotados para o trabalho não parar. Cada um está descrito na auditoria
técnica (seção 9) com o número indicado.

| # | Padrão adotado | Auditoria |
| --- | --- | --- |
| P10 | "Abaixo da média" na planilha é a média da turma, não uma média de aprovação | C19 |
| P11 | "Prática" na teia é o OSCE | C20 |
| P12 | "Prova" → "Avaliação" só no painel do aluno | C21 |
| P13 | Valor máximo de SAI, OSCE e trabalho é opcional | C22 |
| P14 | O aluno só vê números da turma a partir de 5 resultados publicados | C23 |
| P15 | OSCE: lista de alunos pelo período; resposta repetida é recusada; só o Núcleo vê resultados | C24 a C29 |
| P16 | Avaliação Docente: aluno avalia professores das disciplinas em que está matriculado; resultado só depois do encerramento, que é definitivo; mínimo de 5 respostas | C30 a C35 |
| P17 | Articulação: o CSTI lê as respostas identificadas a qualquer momento; a Coordenação, depois da liberação dos resultados | C36, C45 |
| P25 | Articulação: o tutor vê só o próprio quadro, sem nomes, e apenas com 5 respostas ou mais; as justificativas aparecem para ele sem o nome do aluno | C43, C44 |
| P26 | Articulação: todas as perguntas são obrigatórias e a justificativa é opcional; qualquer aluno ativo responde, informando o próprio período, como no formulário anterior | C46 |
| P27 | Articulação: o vínculo entre o tutor da lista e a conta de professor é feito pelo CSTI; tutor sem vínculo não vê resultado | C47 |
| P28 | Articulação: cada etapa pode ser desfeita, uma de cada vez; voltar a rascunho só sem respostas | C48 |
| P29 | "Direção" é citada no formulário anterior como leitora das respostas, mas não existe perfil Direção: hoje quem lê é a Coordenação | C45 |
| P35 | Relatório da Articulação: a exportação tem uma aba por tutor, como na planilha final que você enviou; as telas mostram o quadro do tutor e ainda o dividem por período quando ele tem alunos de mais de um. Médias com duas casas decimais, **já aceitas por você em 16/11/2026.** | C50, C51 |
| P36 | Relatório da Articulação: o "Resultado geral" (todos os tutores juntos) usa as mesmas fórmulas, embora a planilha só tenha o quadro por tutor | C52 |
| P37 | Relatório da Articulação: o tutor só vê a divisão por período quando cada período tem 5 respostas ou mais; senão vê o total | C53 |
| P38 | Exportação da Articulação, diferenças para a planilha final: traz todas as colunas da avaliação (inclusive as estações de apoio preferidas, que a planilha não tem), não tem o limite de 13 alunos por aba, tem uma última aba com todas as respostas e não gera a aba "Matriz" vazia | C54 |
| P39 | OSCE: nota de 0 a 1 com duas casas, como na planilha. Se a nota oficial for de 0 a 10, avise | C55 |
| P40 | OSCE: estação em que o aluno não foi avaliado fica fora da média dele, não conta como zero (é o que a planilha faz) | C56 |
| P41 | OSCE montado sem a pergunta-chave não tem a redução pela metade; estação só com a pergunta-chave não tem nota | C57 |
| P42 | Exportação do OSCE, diferenças para a planilha: os acertos são contados item a item (um comentário igual a "Fez" não vira acerto); o "Resultado Final" é uma tabela com fórmulas de média, não uma tabela dinâmica; o avaliador é a conta do ambulatório, não o nome do professor | C58 |
| P43 | OSCE: as respostas passaram a se chamar "Fez" e "Não fez" nas telas, como na planilha | C59 |
| P18 | Comprovantes: provam a participação, nunca o conteúdo. **Já confirmado por você:** vistos pelo aluno, pelo Administrador e pelo CSTI; download em PDF, sem envio por e-mail | C37 a C40 |

## 4. Infraestrutura

| # | O que falta | Efeito |
| --- | --- | --- |
| P19 | **Repositório remoto** (GitHub) | A verificação automática (CI) está escrita e nunca rodou. |
| P20 | **Servidor e endereço definitivos**, com certificado HTTPS | O sistema só aceita acesso de fora da máquina com HTTPS. |
| P21 | **Agendamento do backup** no servidor e **cópia para fora dele** | O comando e o roteiro existem; o agendamento não foi criado em nenhuma máquina. |
| P22 | **Servidor de e-mail**, se quiserem enviar o comprovante por e-mail no futuro | Hoje o comprovante é baixado em PDF. |
| P23 | Confirmar: variáveis de ambiente novas, HSTS de um ano, retenção de 30 backups, bloqueio da CI a partir de avisos altos | Padrões provisórios da etapa 3. |
| P24 | Banco de dados definitivo (SQLite hoje; PostgreSQL só com autorização) | O código novo ficou isolado do banco onde foi possível. |

## 5. Verificações que só podem ser feitas no ambiente real

- Migração de um banco antigo real (foi testada com banco sintético).
- Restauração de um backup real em máquina separada.
- Uso em celular e tablet, leitor de tela e impressão do resultado do aluno.
- Várias contas respondendo ao mesmo tempo sob carga.
- O relatório da Articulação com respostas reais, comparado com a planilha
  que a instituição preencheu para o mesmo caso.
- Um OSCE real aplicado pelo sistema, comparado com a planilha preenchida
  pelos professores para o mesmo dia.

## 6. O que você cadastra direto na tela

Estes dados são da instituição e não ficam no código nem nos testes.

- **Lista de tutores e de estações de apoio da Articulação.** Abra uma
  avaliação em rascunho, use **Colar vários de uma vez** em cada lista e depois
  **Salvar estas listas como padrão**. A lista padrão de períodos já vem com
  1º a 8º.
- **Vínculo de cada tutor com a conta de professor**, na mesma tela, para o
  tutor ver o próprio resultado.
- **Contas do CSTI, da Coordenação, do Núcleo de Avaliação e do ambulatório**,
  em **Usuários**, no perfil do Administrador.

## 7. Melhorias de código que ficaram registradas

Não impedem o uso. Cada uma muda comportamento ou depende de decisão sua, por
isso não entrou na etapa de legibilidade.

| # | O que é | Quando fazer |
| --- | --- | --- |
| P30 | A tabela de notas tem colunas fixas (6 discursivas, 4 de múltipla escolha, 4 estações) | Junto com P5, quando as colunas dinâmicas forem definidas |
| P31 | O SQL das telas antigas fica dentro das rotas e usa recursos próprios do SQLite | Se a troca para PostgreSQL for autorizada (P24) |
| P32 | A marca de 60% está escrita em mais de um arquivo | Junto com P9, quando o significado dos 60% for decidido |
| P33 | Restam linhas longas em arquivos da interface: trechos de HTML dentro de texto, que o formatador não divide | Ao mexer em cada tela |
| P34 | O OSCE novo não alimenta a coluna OSCE de A1, A2 e A3 | Depende de decisão sua: a nota do OSCE já existe (de 0 a 1), mas falta definir se ela deve ir para essa coluna, em qual avaliação e com que valor máximo |
| P44 | Os testes sobem servidores em portas sorteadas pelo sistema. Raramente sai uma porta que o Node recusa, e um arquivo de teste falha com "bad port" sem relação com o código (aconteceu uma vez em 16/11/2026; a repetição passou) | Fazer os testes sortearem outra porta nesse caso |

## 8. Integração com o outro sistema

Este sistema será unido a outro, de mesma estrutura e com funcionalidades e
códigos diferentes. **O outro sistema ainda não foi visto**: os itens abaixo
foram levantados só deste lado, e a lista deve crescer quando o código dele
chegar. O [Guia de integração](INTEGRACAO.md) traz o tronco proposto, o
inventário do que este sistema ocupa, os pontos de conflito e o passo a passo.

### 8.1 O que falta receber

| # | O que falta | Para que serve |
| --- | --- | --- |
| P45 | **Código do outro sistema**, com as instruções para instalar, iniciar e rodar os testes dele | Sem ele não há como comparar nem juntar nada |
| P46 | **Ficha do outro sistema**: as respostas da seção 5 do guia (ambiente, banco, login, perfis, rotas, tabelas, telas, testes) | Decidir o tronco e prever os conflitos antes de mexer no código |
| P47 | **Quem responde pela integração e quem decide** quando os dois sistemas tiverem regras diferentes para a mesma coisa | Conflito de regra é decisão da instituição, nunca do código |

### 8.2 Decisões do tronco

Precisam estar tomadas antes de juntar código. Cada uma depende de P46.

| # | Decisão | O que este sistema tem hoje |
| --- | --- | --- |
| P48 | **Qual dos dois fornece o núcleo** (login, sessões, cadastro de pessoas, permissões, migrações, auditoria), ou se os dois ficam lado a lado por um tempo. São os caminhos A, B e C do guia | Núcleo próprio em `apps/api/src/core/`, com módulos carregados em separado |
| P49 | **Cadastro único de pessoas**: qual é a chave comum e o que fazer com quem tem conta nos dois | Matrícula única em `students` e em `users`; e-mail único em `users` |
| P50 | **Senhas**: aceitar os dois formatos no login e regravar, ou exigir nova senha de todos. Hash de senha não se converte de um formato para outro | scrypt, guardado como `sal:hash`; troca obrigatória no primeiro acesso |
| P51 | **Perfis e permissões**: tabela de correspondência entre os perfis dos dois sistemas | 7 perfis e 18 permissões em tabela (`role_permissions`) |
| P52 | **Banco**: um banco só ou dois, e qual motor. Liga-se a P24 | SQLite em um arquivo; PostgreSQL só com autorização |
| P53 | **Endereço e implantação**: um endereço com um login, ou dois sistemas separados | Interface na porta 3002 e API na 3003; HTTPS obrigatório fora da máquina |
| P54 | **Identidade visual e menu**: como as telas dos dois aparecem para cada perfil | Identidade visual própria, preservada desde a base original |

### 8.3 Ajustes neste código

Trabalho técnico deste lado. Os marcados com "já" não dependem do outro
sistema, não mudam o comportamento e podem ser feitos antes de ele chegar.

| # | Ajuste | Por quê | Quando |
| --- | --- | --- | --- |
| P55 | **Repositório remoto e verificação automática rodando** (é a P19) | Hoje o código só existe nesta máquina, sem remoto. Sem isso não há como outra pessoa trabalhar, revisar nem juntar | Já; é o primeiro passo |
| P56 | **Fechar os nomes globais de `features/avaliacoes/app.js`** | O arquivo declara 67 nomes no escopo global da página (`api`, `toast`, `fmt`, `h`, `assessments`...). Qualquer script do outro sistema na mesma página com um desses nomes entra em conflito. Os outros arquivos da interface já são fechados | Já |
| P57 | **Dar uma classe raiz aos estilos gerais** | `styles.css` (293 seletores de classe), `modern.css` (193) e `ajustes-visuais.css` (23) usam nomes comuns sem prefixo (`.btn`, `.panel`, `.card`, `.table`); o `index.html` tem 78 identificadores. Só `modulos.css` é restrito a `.mod-root` | Já, com prova de que a aparência não mudou |
| P58 | **Conferir e resolver tabelas de mesmo nome** | As tabelas antigas têm nomes genéricos (`users`, `students`, `sessions`, `forms`, `scores`, `assessments`, `receipts`, `audit_logs`). As dos módulos novos já têm prefixo | Depois de P46; unificar as que são a mesma coisa, renomear por migração nova as que só têm o nome igual |
| P59 | **Levar a criação das tabelas de base para a sequência de migrações** | 18 tabelas de base são criadas na inicialização por `core/database.js`, fora das 10 migrações numeradas. Um tronco precisa de uma sequência só, que monte o banco inteiro | Já a preparação; a numeração final depois de P48 |
| P60 | **Conferir e resolver rotas de mesmo caminho** | Prefixos em uso: `/api/admin`, `/api/assessment`, `/api/assessments`, `/api/student`, `/api/evolution`, `/api/osce`, `/api/teacher-eval`, `/api/receipts`, `/api/articulation`, além de `/api/login`, `/api/logout`, `/api/me`, `/api/health`, `/api/ready` e `/api/setup-status` | Depois de P46 |
| P61 | **Prefixar variáveis de ambiente e rever portas e cookie** | `PORT`, `HOST`, `API_PORT`, `API_HOST` e `API_URL` têm nomes genéricos; as demais já começam com `SUPREMA_`. Portas 3002 e 3003; cookie `as_session` | Já os nomes (mantendo os antigos como alternativa); portas e cookie depois de P53 |
| P62 | **Alinhar a versão dos pacotes internos** | `@suprema/api` e `@suprema/web` ainda dizem 11.9.0; o sistema está na 12.2.0 | Já |
| P63 | **Atualizar, e não desligar, os testes que travam quando o conjunto muda** | `perfis.test.js` confere a lista exata de permissões; `esquema_documentado.test.js` confere o esquema contra o banco; `tests/architecture` e `scripts/check.js` conferem o isolamento dos módulos. Todos vão acusar a entrada do outro sistema, de propósito | A cada módulo que entrar |
| P64 | **Escolher uma versão única de Node e de bibliotecas** | Aqui: Node 22.16 ou mais novo (por causa de `node:sqlite`), Express 5, `exceljs` 4.4 com `uuid` forçado, sem etapa de build | Depois de P46 |

Itens das outras seções que entram no mesmo trabalho: P44 (testes que falham
com "bad port"), para a verificação automática não acusar falha falsa; P31
(SQL dentro das rotas antigas), se o motor do banco mudar; P30 (colunas fixas
da tabela de notas), se o outro sistema tiver avaliações com outro formato.

### 8.4 O que não pode se perder na integração

Garantias que valem hoje e têm teste. A lista completa está na seção 7 do guia.

- A fórmula das notas de A1, A2 e A3 (`calcScore`) não muda.
- Histórico de notas e respostas de formulário não são alterados nem apagados.
- A Avaliação Docente continua anônima.
- Números de grupo com menos de 5 pessoas continuam ocultos.
- As notas do OSCE e o relatório da Articulação continuam iguais às planilhas
  da instituição.
- Nenhum dado real entra no repositório.

## 9. Como enviar

Para uma regra nova da instituição (P1, P3), o ideal é a planilha original, com
as fórmulas nas células, e um exemplo já calculado: os números do exemplo viram
os testes que provam que o sistema calcula igual. Para as decisões (seções 2, 3
e 8.2), basta responder item por item; o que não for respondido continua com o
padrão descrito. Para a integração, o primeiro envio é o código do outro
sistema (P45) com a ficha da seção 5 do guia (P46).
