# Avaliação Suprema

Sistema acadêmico de avaliação: notas de A1, A2 e A3, OSCE, Avaliação Docente,
Articulação Interdisciplinar e comprovantes das ações do aluno. Versão 12.2.0;
o que mudou desde a base recebida está no [histórico de versões](CHANGELOG.md).

Interface e API executam em processos separados e se comunicam por HTTP.
O sistema usa **SQLite** e preserva as regras e as rotas da base recebida
(`AVALIACAO_SUPREMA_3_PERIODO_DEMO_PRONTO.zip`).

| Para | Leia |
| --- | --- |
| Usar o sistema em cada perfil | [Guia de uso por perfil](docs/GUIA_DE_USO.md) |
| Saber tudo o que ainda falta | [Pendências](docs/PENDENCIAS.md) |
| Unir este sistema a outro | [Guia de integração](docs/INTEGRACAO.md) |
| Fazer backup e restaurar | [Backup e restauração](docs/BACKUP.md) |
| Entender como o sistema é montado | [Arquitetura](docs/ARQUITETURA.md) |
| Acrescentar uma funcionalidade | [Como criar um módulo novo](docs/COMO_CRIAR_UM_MODULO.md) |
| Integrar interface e API | [Contratos](packages/contracts/README.md) |
| Consultar as tabelas do banco | [Esquema atual](docs/modelagem/esquema_atual.sql) |
| Continuar o trabalho com outra IA | [Contexto para IA](CONTEXTO_IA.md) |

## Começar

Instale Node.js **22.16 ou superior** (recomendado: Node.js 24 LTS).
Na pasta do projeto:

```sh
npm ci
npm start
```

Abra **http://localhost:3002**. A API fica em http://127.0.0.1:3003.

No clone do GitHub, o banco começa vazio. Crie o administrador:

```sh
npm run admin
```

O ZIP original enviado contém o banco de demonstração. A refatoração não altera esse arquivo.
Para usar seu banco existente, com os servidores desligados, copie a pasta
`data` ou defina `SUPREMA_DATA_DIR` em `.env`. Não sobreponha bancos em uso.
O sistema mantém a inicialização original: ajustes de esquema e criação das
avaliações ausentes de vínculos ativos acontecem na primeira abertura. Notas
e publicações existentes são preservadas; a inicialização não redefine senhas.

## Duas pessoas trabalhando

| Área | Pasta principal | Comando independente |
| --- | --- | --- |
| Pessoa 1: telas, estilos, comportamento da interface | `apps/web/` | `npm run start:web` |
| Pessoa 2: regras, rotas, autorização, dados | `apps/api/` | `npm run start:api` |
| Acordo entre as duas partes | `packages/contracts/` | revisar alterações em conjunto |

A interface pode iniciar sem instalar as dependências da API:
`node apps/web/server.js`. A API pode iniciar sem carregar nenhum arquivo de tela.
Para desenvolver a interface com uma API em outra máquina, configure `API_URL`
em `.env`. A API permanece local por padrão. Para acessar de outros computadores,
veja [Acesso pela rede e HTTPS](#acesso-pela-rede-e-https): fora da própria
máquina o sistema só inicia com HTTPS.

Use uma branch por tarefa, faça pull requests para `main` e combine mudanças nas
rotas antes de alterar o contrato. Cada pessoa usa seu clone e seu banco local.
Consulte [o fluxo de colaboração](docs/COLABORACAO.md).

## Organização

```text
apps/
  web/                  interface, servidor estático e proxy /api
    public/
      features/         uma pasta por funcionalidade: avaliações, administração,
                        importação, indicadores, OSCE, avaliação docente,
                        articulação, comprovantes…
      shared/           cliente HTTP, estado de conexão, utilitários de tela e
                        os pontos de extensão dos módulos
      styles/           estilos gerais e os estilos comuns dos módulos
      assets/           imagens
  api/
    src/
      core/             banco, migrações, segurança, regras compartilhadas,
                        núcleo de formulários e comprovantes
      modules/          módulos de rotas com carregamento independente
      shared/           validação e leitura de planilhas
packages/
  contracts/            rotas e regras de integração
  http/                 cabeçalhos e validação de origem
scripts/                inicialização, administrador, backup, verificações,
                        esquema do banco e prova de formatação
tests/                  isolamento, integração, navegador, fixtures e relatórios
docs/                   guia de uso, arquitetura, pendências, backup, validação
models/                 planilha modelo original
data/                   banco local; não entra no Git
archive/                orientação sobre o histórico separado
```

O [mapa de migração](docs/MAPA_DE_PASTAS.md) explica onde cada arquivo foi colocado.
Os casos de uso, diagramas de classes, imagens e fontes PlantUML estão na
[documentação de modelagem UML](docs/modelagem/README.md), junto com o esquema
do banco, que é gerado a partir do banco real.

## Quando um lado falhar

- **API desligada:** interface e arquivos continuam acessíveis; operações de
  dados retornam 503 e a tela avisa sobre a indisponibilidade. Não há salvamento
  offline ou confirmação falsa. Rascunhos em memória podem permanecer na tela;
  valide o estado no servidor após a reconexão.
- **Interface desligada ou um arquivo visual quebrado:** a API continua ativa.
- **Erro ao carregar um módulo da API:** somente suas rotas retornam 503. O
  registro parcial de rotas é descartado; os outros módulos são carregados.
- **Erro comum em uma requisição:** retorna erro naquela operação sem encerrar
  o servidor. Reinicie o processo da API depois de corrigir código de módulo.
- **Falha no banco, núcleo de segurança, processo da API ou máquina:** afeta os
  serviços que dependem desse recurso. Os módulos compartilham banco e processo;
  não há garantia contra travamento, falta de memória ou corrupção do banco.

`npm start` mantém o outro processo ativo quando um encerra. Reinicie somente
o serviço corrigido em outro terminal com seu comando independente. Em produção,
use um gerenciador de serviços com duas unidades para reinício individual.

## Comandos

```sh
npm run check          # sintaxe, recursos HTML e fronteiras entre módulos
npm run lint           # erros reais de código; nenhum aviso é tolerado
npm run format         # formata JavaScript e CSS (Prettier)
npm run format:check   # confere o formato sem alterar arquivos
npm run docs:schema    # gera docs/modelagem/esquema_atual.sql a partir do banco real
npm test               # check, lint, formato e todos os testes de servidor
npm run backup         # backup SQLite consistente e verificado; mantém os 30 mais recentes
npm run restore -- --ultimo   # verifica o backup mais recente; com --confirmar, restaura
```

Agendamento, retenção e o passo a passo da restauração estão em
[Backup e restauração](docs/BACKUP.md).

O teste de navegador é separado e precisa de Python com Playwright:

```sh
pip install -r tests/browser/requirements.txt
python -m playwright install chromium
python tests/browser/smoke.py
```

A CI (`.github/workflows/ci.yml`) roda `npm audit` (bloqueia em gravidade alta
ou crítica), `npm test` e o teste de navegador. A biblioteca `uuid`, usada pelo
`exceljs`, é mantida na versão corrigida pela seção `overrides` do
`package.json`; não use `npm audit fix --force`, que rebaixaria o `exceljs`.

`/health` verifica a interface; `/api/health` indica o estado da API e dos módulos;
`/api/ready` retorna 503 se algum módulo não carregou.
Copie `.env.example` para `.env` se precisar mudar portas, caminhos ou TLS.
Cada serviço carrega `.env` com os comandos npm.

## Acesso pela rede e HTTPS

Em `127.0.0.1` (padrão) o sistema funciona em HTTP, só para quem está na própria
máquina. Com `HOST` em qualquer outro endereço (`0.0.0.0`, IP da rede), a
interface **recusa iniciar** sem HTTPS, porque senhas e sessões trafegariam em
claro. Há duas formas de atender:

| Forma | Configuração |
| --- | --- |
| TLS na própria interface | `SUPREMA_TLS_KEY` e `SUPREMA_TLS_CERT` com os caminhos da chave e do certificado. |
| Proxy HTTPS na frente (nginx, Caddy) | `SUPREMA_BEHIND_HTTPS_PROXY=1` e `SUPREMA_WEB_TRUSTED_PROXIES` com o IP do proxy (ou `loopback`, se estiver na mesma máquina). O proxy deve repassar o cabeçalho `Host` original. |

Nas duas formas o sistema envia o cabeçalho HSTS (validade de um ano, só para
este endereço) e marca o cookie de sessão como `Secure`. Depois que um navegador
recebe o HSTS, ele passa a exigir HTTPS nesse endereço: não volte a servir o
mesmo nome em HTTP.

A API não usa HTTPS e deve ficar em `127.0.0.1`. Se a interface rodar em outra
máquina, a API só inicia em outro endereço com `SUPREMA_API_PRIVATE_NETWORK=1`,
que declara que a ligação entre as duas é uma rede protegida; nesse caso defina
também `SUPREMA_SECURE_COOKIE=1` e `SUPREMA_API_TRUSTED_PROXIES` na API.

## Senhas e primeiro acesso

- Toda pessoa troca a própria senha em **Alterar senha**, na barra superior.
- Senha definida pelo administrador (cadastro, redefinição ou importação) é
  provisória: no primeiro acesso o sistema exige uma senha nova antes de mostrar
  qualquer dado.
- A importação de alunos gera uma senha provisória **individual** por conta. A
  lista aparece uma única vez ao concluir, para download; não fica guardada.
- Contas criadas antes desta versão não são forçadas a trocar a senha. Se foram
  importadas em lote com senha única, redefina-as em **Usuários**.
- O limite de tentativas de login conta por endereço do cliente. Com proxy
  HTTPS externo, configure `SUPREMA_WEB_TRUSTED_PROXIES` (veja `.env.example`).

## Perfis e permissões

Além de Administrador, Professor e Aluno, existem os perfis Coordenação, Núcleo
de Avaliação, CSTI e Usuário operacional, cadastrados em **Usuários**. Cada
módulo concede as permissões do seu perfil: o OSCE atende o Núcleo de Avaliação
e o Usuário operacional; a Avaliação Docente e a Articulação Interdisciplinar
atendem o CSTI, a Coordenação, o professor e o aluno; os comprovantes atendem o
aluno, o Administrador e o CSTI. O que cada perfil pode fazer está na tabela
`role_permissions`, não no código das rotas.

## Comprovantes

- **O que são.** Cada envio do aluno (Avaliação Docente e Articulação) gera um
  comprovante com um código de verificação no formato `AS-XXXX-XXXX-XXXX-XXXX`.
  O aluno baixa o PDF logo depois do envio e encontra todos em **Meus
  comprovantes**.
- **O que provam.** Que o aluno enviou, o quê e quando. O comprovante nunca
  contém as respostas; na Avaliação Docente, que é anônima, ele não tem
  nenhuma ligação com o que foi respondido.
- **Verificação.** O Administrador e o CSTI abrem **Comprovantes**, digitam o
  código e o sistema responde se ele foi emitido, para quem e quando. Vale o
  registro do sistema, não o arquivo: um PDF alterado ou inventado não passa.
  Professores e Coordenação não têm acesso a comprovantes.
- O comprovante não pode ser alterado nem apagado. O envio por e-mail não
  existe; fica para quando houver um servidor de e-mail.

## Articulação Interdisciplinar

- **CSTI.** Cria a avaliação de cada caso com **nome livre** (por exemplo
  "Avaliação Caso 6 - Articulação Interdisciplinar"). O rascunho começa com as
  17 perguntas do formulário usado até agora e com a lista padrão de períodos,
  tutores e estações de apoio. Perguntas e listas podem ser alteradas,
  acrescentadas ou removidas; **Colar vários de uma vez** aceita uma lista com
  um item por linha, e **Salvar estas listas como padrão** faz as próximas
  avaliações começarem com elas.
- **Tutores.** Cada tutor da lista pode ser vinculado a uma conta de professor.
  Só o tutor vinculado vê o próprio resultado.
- **Etapas.** Rascunho → **Liberar para os alunos** (a estrutura trava) →
  **Finalizar coleta** (ninguém mais responde) → **Liberar resultados**. Cada
  etapa pode ser desfeita, uma de cada vez; voltar a rascunho só é possível
  enquanto ninguém respondeu.
- **Aluno.** Responde uma única vez. Todas as perguntas são obrigatórias e as
  justificativas são opcionais. A resposta é **identificada**, como no
  formulário anterior, e gera um comprovante.
- **Resultados.** O CSTI acompanha as respostas a qualquer momento; a
  Coordenação vê depois da liberação. Os dois veem as respostas com o nome do
  aluno. O tutor vê só o quadro do próprio grupo, sem nomes, e apenas quando
  recebeu pelo menos 5 respostas (`SUPREMA_MIN_AGGREGATE_STUDENTS`).
- **Relatório.** As telas mostram os números da planilha de relatório da
  instituição: média, menor e maior nota nas perguntas de 0 a 10 e percentual
  de Sim, Não e Parcialmente nas demais, sempre sobre o total de alunos que
  responderam. Há um quadro por tutor, que a tela ainda divide por período
  quando o tutor tem alunos de mais de um. As fórmulas ficam em
  `apps/api/src/core/calculo/articulacao.js`.
- **Planilha.** **Baixar respostas e relatório (Excel)** gera o arquivo no
  formato da planilha de resultado final da instituição: uma aba por tutor, com
  o nome dele, as respostas sobre ele e três linhas de totais com as fórmulas
  da instituição (média, maior e menor nota; percentual de Sim, Parcialmente e
  Não). A última aba traz todas as respostas.
- **Número único de desempenho.** Não existe: a instituição não usa um número
  por tutor nem uma lista dos mais e dos menos bem avaliados.

## Avaliação Docente

- **Anônima.** O sistema registra que o aluno respondeu, para não aceitar a
  mesma avaliação duas vezes, e guarda as respostas em outra tabela, sem aluno,
  sem conta, sem hora e sem ordem de chegada. Uma resposta enviada não pode ser
  consultada nem alterada. O limite desse anonimato está descrito em
  `docs/ARQUITETURA.md`.
- **CSTI.** Cria a avaliação de um período, com as mesmas perguntas para todos
  os professores (Sim, Não, Não se aplica, com comentário), revisa a lista de
  professores, libera, acompanha a adesão só por contagem e encerra.
- **Aluno.** Vê a entrada **Avaliação Docente** no menu e avalia os professores
  das disciplinas em que está matriculado.
- **Resultados.** Aparecem só depois do encerramento, que é definitivo, e só
  para o professor que recebeu pelo menos o mínimo de respostas (padrão 5, nunca
  menos que 3). O professor vê os próprios; a Coordenação vê todos e a
  comparação entre avaliações.
- **Sem "média" do professor.** A tela mostra contagens e o percentual de Sim
  sobre Sim mais Não. "Não se aplica" é contado à parte.

## OSCE

- **Núcleo de Avaliação.** Cria o OSCE por ano, semestre, rodada (OSCE 1 ou 2)
  e período. O rascunho começa com quatro estações e com os alunos ativos do
  período; estações, perguntas (Fez ou Não fez, com comentário) e a lista de
  alunos podem ser ajustadas. **Liberar** envia o OSCE ao ambulatório e trava a
  estrutura. **Encerrar** interrompe as respostas.
- **Pergunta-chave.** Com o interruptor ligado, é a primeira pergunta de todas
  as estações. É o item de postura da planilha da instituição: não conta como
  item, e quando a resposta não é "Fez" os acertos da estação valem a metade.
- **Ambulatório.** Use contas do perfil Usuário operacional, criadas pelo
  administrador e não vinculadas a um professor. A conta escolhe o período e a
  estação, seleciona o aluno, responde e usa **Enviar outra resposta**. Cada
  aluno recebe uma resposta por estação.
- **Resultados.** O Núcleo vê o andamento por estação, as respostas por aluno e
  as contagens de Fez e Não fez. Pode anular uma resposta, informando o motivo;
  ela continua guardada, deixa de contar na nota e o aluno pode ser avaliado de
  novo.
- **Nota do OSCE.** Segue a planilha da instituição. Em cada estação, a nota é
  acertos dividido pelo total de itens, de 0 a 1. A nota final é a média das
  estações em que o aluno foi avaliado; estação não avaliada fica fora da
  média. O quadro "Notas do OSCE" mostra também a média de cada estação e a
  média geral, e pode ser ordenado pela nota final. As fórmulas ficam em
  `apps/api/src/core/calculo/osce.js`.
- **Planilha.** **Baixar notas (Excel)** gera o arquivo no formato da
  instituição: uma aba por estação com as respostas e as fórmulas de acertos e
  nota, "Junção" com todas as notas e "Resultado Final" com as médias.
- **O que não existe.** Nota de aprovação, lista de melhores e piores e
  comparação entre OSCE 1 e OSCE 2: a planilha da instituição não traz.
- A coluna OSCE das avaliações A1, A2 e A3 não é alimentada por este módulo.

## Histórico de notas

- Cada nota alterada guarda o valor anterior, o novo, quem alterou e quando.
- Cada publicação é guardada para sempre; republicar não apaga a anterior.
- O professor consulta em **Resultados da Turma → Histórico de operações**; o
  administrador, em **Avaliações → Histórico de notas**.
- Esse histórico não pode ser editado nem apagado, nem direto no banco. Por
  isso, uma conta com histórico de notas é desativada, não excluída.
- A auditoria (**Histórico**) mostra quem fez cada operação e de qual endereço.

## Instrumentos, gráficos e painel do aluno

- **Valor máximo dos instrumentos.** Na planilha de lançamento, clique no
  cabeçalho de SAI, estação do OSCE, Outros ou Trabalho para informar o valor
  máximo. É opcional e não altera a soma da nota final. Com o valor informado,
  o sistema calcula o aproveitamento nos gráficos e recusa publicar ou importar
  nota acima dele. Sem ele, o instrumento aparece sem percentual.
- **Teia por modalidade.** Teórica discursiva, múltipla escolha, prática (OSCE)
  e demais instrumentos. Uma modalidade só aparece quando todos os componentes
  em uso nela têm valor máximo.
- **Nota abaixo da média.** Na planilha, Nota da Prova e Nota Final abaixo da
  média da turma recebem destaque com a marca "↓". É leitura descritiva do
  rascunho em tela, não critério de aprovação.
- **Importação de notas.** A planilha precisa da coluna Matrícula; o sistema
  não associa mais alunos pelo nome.
- **Turmas pequenas.** O aluno só vê média, posição e demais números da turma
  quando há pelo menos 5 resultados publicados
  (`SUPREMA_MIN_AGGREGATE_STUDENTS`). Abaixo disso vê somente a própria nota.
- **A marca de 60%** é referência visual em todas as telas, não ponto de corte.

## Atualização do banco

Mudanças de estrutura são migrações numeradas em
`apps/api/src/core/migrations/`, aplicadas uma única vez na inicialização. Se
alguma falhar, nada é alterado e o sistema não inicia. Antes de aplicar uma
migração em um banco que já tem dados, o sistema grava uma cópia em
`data/pre-migracao/` e informa o caminho no terminal. Um banco atualizado por
uma versão mais nova não é aberto por uma versão antiga.

As sessões ficam no banco: reiniciar a API não desconecta ninguém.

Banco, backups, senhas locais, dependências e histórico não são versionados.
O ZIP original permanece como histórico para consulta. Seus instaladores e
documentos antigos não definem o fluxo desta versão.
