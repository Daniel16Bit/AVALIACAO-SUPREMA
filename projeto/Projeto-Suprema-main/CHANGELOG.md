# Histórico de versões

## 12.2.0 — novembro de 2026

### OSCE: nota pela planilha da instituição

- A tela de resultados do Núcleo de Avaliação passa a mostrar a nota do OSCE,
  calculada pelas fórmulas da planilha que a instituição usa: em cada estação,
  os acertos são os itens marcados "Fez" e valem a metade quando o item de
  postura (a pergunta-chave) não é "Fez"; a nota é acertos dividido pelo total
  de itens, de 0 a 1.
- Quadro "Notas do OSCE": um aluno por linha, uma estação por coluna, a nota
  final (média das estações em que o aluno foi avaliado), a média de cada
  estação e a média geral. Pode ser ordenado pela nota final.
- **Baixar notas (Excel)** gera a planilha no formato da instituição: uma aba
  por estação com as fórmulas, "Junção" e "Resultado Final".
- As respostas passam a se chamar "Fez" e "Não fez", como na planilha.
- O cálculo fica em um arquivo só (`apps/api/src/core/calculo/osce.js`).
- Não existem nota de aprovação, lista de melhores e piores nem comparação
  entre OSCE 1 e OSCE 2: a planilha da instituição não traz nenhum dos três.

### Articulação Interdisciplinar: exportação igual à planilha final

- O arquivo exportado passa a ter uma aba por tutor, com o nome dele, como na
  planilha de resultado final da instituição. As três linhas de totais ficam
  na ordem dela (média, maior e menor nota; Sim, Parcialmente e Não) e sem
  rótulos; a coluna "E-mail Institucional" saiu.
- A aba com todas as respostas passa a ser a última.
- O aviso das telas informa que a instituição não usa um número único de
  desempenho por tutor nem uma classificação de tutores.

### Documentação: preparação para a integração com outro sistema

- Novo `docs/INTEGRACAO.md`: o tronco proposto, tudo o que este sistema
  ocupa (rotas, tabelas, perfis, variáveis, nomes da interface), os pontos de
  conflito e o passo a passo.
- `docs/PENDENCIAS.md` reorganizado, com resumo e a seção de integração (P45
  a P64). Nenhum código foi alterado.

## 12.1.0 — novembro de 2026

### Articulação Interdisciplinar: relatório da instituição

- As telas de resultado do CSTI, da Coordenação e do tutor passam a mostrar os
  números da planilha de relatório da instituição ("Matriz"): média, menor e
  maior nota nas perguntas de 0 a 10 e percentual de Sim, Não e Parcialmente
  nas demais, sempre sobre o total de alunos que responderam.
- Um quadro por tutor e período, como na planilha.
- O arquivo exportado ganha uma aba de relatório por tutor e período, com as
  mesmas fórmulas da planilha da instituição nas três linhas de totais.
- O cálculo fica em um arquivo só (`apps/api/src/core/calculo/articulacao.js`).
- Continua sem existir um número único de desempenho por tutor e uma lista dos
  mais e dos menos bem avaliados: a planilha da instituição não traz nenhum
  dos dois.

## 12.0.0 — novembro de 2026

Evolução da base 11.9.0 em oito etapas, sem reconstruir o sistema. A fórmula
das notas de A1, A2 e A3 (`calcScore`) não foi alterada em nenhuma delas.

### Segurança

- Limite de tentativas de login contado por endereço do cliente, inclusive
  atrás do proxy da interface.
- Senha provisória com troca obrigatória no primeiro acesso; importação de
  alunos com senha individual.
- Sessões guardadas no banco: reiniciar a API não desconecta ninguém.
- Sete perfis, com autorização por permissão em tabela, não por nome de perfil.
- Histórico imutável de alterações de nota e de publicações.
- Fora da própria máquina o sistema só inicia com HTTPS; HSTS e cookie `Secure`.
- O aluno só vê números da turma a partir de 5 resultados publicados.
- Importação de notas somente pela matrícula.

### Módulos novos

- **OSCE:** montagem pelo Núcleo de Avaliação, respostas pelo ambulatório,
  resultado bruto. A nota aguarda a fórmula institucional.
- **Avaliação Docente:** anônima; resultados só depois do encerramento e acima
  do mínimo de respostas.
- **Articulação Interdisciplinar:** avaliação com nome livre, perguntas e
  listas editáveis, resposta identificada, resultados por pergunta e por tutor,
  exportação em planilha. O percentual de desempenho aguarda a fórmula.
- **Comprovantes:** cada envio do aluno gera um comprovante em PDF com código
  de verificação, conferido pelo Administrador e pelo CSTI.

### Módulo principal

- Valor máximo opcional dos instrumentos fora da prova e bloqueio de nota acima
  dele na publicação.
- Destaque das notas abaixo da média da turma, gráficos por modalidade e novos
  rótulos no painel do aluno.
- Botão "Consultoria Acadêmica" removido do painel do aluno: só mostrava um
  aviso.
- A prévia dos totais na planilha do professor arredonda cada nota como o
  servidor.

### Operação

- Migrações numeradas, aplicadas uma vez, com cópia automática do banco antes.
- Backup verificado com retenção e restauração conferida.
- `npm test` com verificação de sintaxe, lint sem avisos, formato e 300+ testes;
  teste de navegador à parte; CI escrita para o GitHub.

### Código e documentação

- Todo o JavaScript e o CSS reformatados automaticamente, com prova de que a
  estrutura do código e as regras de estilo não mudaram.
- Complementos de tela registrados em pontos de extensão, sem substituir
  funções de outros arquivos.
- Esquema do banco gerado a partir do banco real.
- Guia de uso por perfil, guia para criar módulos e lista de pendências.

### Ao atualizar

A primeira inicialização aplica as migrações 001 a 010 e grava uma cópia do
banco em `data/pre-migracao/`. Contas existentes não são forçadas a trocar a
senha. O que ainda depende da instituição está em `docs/PENDENCIAS.md`.

## 11.9.0

Base recebida, reorganizada em interface e API separadas.
