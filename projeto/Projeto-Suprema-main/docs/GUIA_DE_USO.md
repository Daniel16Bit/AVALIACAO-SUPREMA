# Guia de uso por perfil

O que cada perfil encontra ao entrar e o caminho de cada tarefa. A instalação,
o backup e o acesso pela rede estão no [README](../README.md) e em
[Backup e restauração](BACKUP.md).

## Para todos

- **Primeiro acesso.** A senha entregue pelo administrador é provisória: o
  sistema pede uma senha nova antes de mostrar qualquer tela.
- **Alterar senha** e **Sair** ficam no alto da tela.
- Se aparecer o aviso de que o serviço está indisponível, o que estava na tela
  não foi gravado. Aguarde o aviso sumir e confira antes de repetir.

## Administrador

O Administrador cuida das contas e do cadastro acadêmico. Ele não lança notas.

| Menu | Para que serve |
| --- | --- |
| Visão geral | Números do cadastro e situação do sistema. |
| Usuários | Criar, editar, desativar e excluir contas de todos os perfis; redefinir senha; importar alunos por planilha. |
| Cursos, Disciplinas | Cadastro acadêmico. |
| Professores e vínculos | Ligar um professor a uma disciplina em um ano e semestre. O vínculo cria as avaliações A1, A2 e A3. |
| Matrículas | Matricular alunos em uma oferta, um a um ou por período. |
| Avaliações | Consultar as avaliações e o histórico de notas de qualquer uma. |
| Controle operacional | Pausar o lançamento de notas ou a publicação de resultados; diagnóstico do banco. |
| Histórico | Registro do que foi feito e por quem. |
| Comprovantes | Verificar o código de um comprovante e pesquisar comprovantes emitidos. |

Ordem para começar um semestre: cursos e disciplinas, contas de professores e
de alunos, vínculos e, por fim, matrículas.

## Professor

- **Avaliação A1 / A2 / A3.** Escolha a disciplina e a avaliação.
  - **Lançamento:** digite as notas ou cole do Excel. **Salvar rascunho**
    guarda sem mostrar ao aluno. **Publicar** libera o resultado; antes disso o
    aluno não vê nada. O total mostrado enquanto você digita é uma prévia: a
    nota que vale é a calculada ao salvar.
  - **Baixar modelo Excel** e **Exportar** geram planilhas; a importação exige
    a coluna Matrícula.
  - **Resultados da Turma** e **Resultado Individual** mostram médias, gráficos
    e a comparação de um aluno com a turma, sempre sobre o que foi publicado.
- **Evolução Acadêmica.** Desempenho ao longo das avaliações.
- **Avaliação Docente.** Seus resultados nas avaliações feitas pelos alunos,
  depois de encerradas e com pelo menos o mínimo de respostas. As respostas são
  anônimas.
- **Articulação Interdisciplinar.** Se você é tutor e o CSTI vinculou o seu nome
  à sua conta, aqui aparece o que o seu grupo respondeu, sem os nomes dos
  alunos, depois que os resultados são liberados: a contagem e o percentual de
  cada resposta e, nas notas, a média, a menor e a maior. Se você atendeu mais
  de um período, os quadros aparecem separados quando cada período tem pelo
  menos o mínimo de respostas.

## Aluno

- **Minhas notas.** Resultados publicados, com a própria nota e, quando a turma
  tem pelo menos 5 resultados, a comparação com a turma. **Atualizar
  resultados** busca publicações novas.
- **Avaliação Docente.** Avalie os professores das disciplinas em que está
  matriculado. A resposta é anônima e não pode ser alterada depois.
- **Articulação Interdisciplinar.** Responda a avaliação da semana de
  Articulação. A resposta é identificada e não pode ser alterada depois.
- **Meus comprovantes.** Cada envio gera um comprovante com código de
  verificação, que pode ser baixado em PDF. O comprovante prova que você
  enviou, nunca o que respondeu.

## CSTI

- **Avaliação Docente.** Nova avaliação → ajustar perguntas e a lista de
  professores → **Liberar para os alunos** → acompanhar a adesão →
  **Encerrar**. O encerramento é definitivo e é ele que torna os resultados
  visíveis.
- **Articulação Interdisciplinar.** Nova avaliação com o nome que quiser →
  ajustar perguntas e as listas de períodos, tutores e estações → **Liberar
  para os alunos** → **Finalizar coleta** → **Liberar resultados**. Use
  **Colar vários de uma vez** para trazer uma lista pronta e **Salvar estas
  listas como padrão** para as próximas avaliações começarem com ela. Vincule
  cada tutor à conta de professor dele. Os resultados mostram a contagem e o
  percentual de cada resposta e, nas notas, a média, a menor e a maior, com um
  quadro por tutor e período. **Baixar respostas e relatório (Excel)** gera o
  arquivo com as respostas e uma aba de relatório por tutor e período, no
  formato da planilha de relatório da instituição.
- **Comprovantes.** Digite o código que o aluno apresentar: o sistema responde
  se o comprovante foi emitido, para quem e quando.

## Coordenação

- **Avaliação Docente.** Resultados de todos os professores nas avaliações
  encerradas e a comparação entre avaliações.
- **Articulação Interdisciplinar.** Resultados das avaliações que o CSTI já
  liberou, com as respostas por aluno, o quadro de cada tutor e a planilha.

## Núcleo de Avaliação

- **Avaliações OSCE.** Novo OSCE por ano, semestre, rodada e período → ajustar
  estações, perguntas e a lista de alunos → **Liberar** → acompanhar →
  **Encerrar**. Em **Resultados** estão o quadro de notas (aluno por estação,
  nota final e médias), o andamento por estação e as respostas por aluno; uma
  resposta pode ser anulada, informando o motivo. **Baixar notas (Excel)** gera
  a planilha no formato da instituição.

## Usuário operacional (ambulatório)

- Escolha o período e a estação, selecione o aluno, marque **Fez** ou **Não
  fez** em cada item e use **Enviar outra resposta** para o próximo. Cada aluno
  recebe uma resposta por estação.

## O que não é calculado

A nota do OSCE e o relatório da Articulação seguem as planilhas da instituição.
O que essas planilhas não trazem não existe no sistema: no OSCE, nota de
aprovação, lista de melhores e piores e comparação entre OSCE 1 e OSCE 2; na
Articulação, um número único de desempenho por tutor e a lista dos mais e dos
menos bem avaliados. A lista completa do que falta está em
[Pendências](PENDENCIAS.md).
