# Validação executada

Data: 9 de novembro de 2026. Ambiente Linux, Node.js 24.22.1, Chromium headless.

| Verificação | Resultado |
| --- | --- |
| API: regras acadêmicas, autorização, publicação, concorrência e preservação | 62 aprovadas |
| Gestão de usuários, conversões de perfil e proteção de histórico | 44 aprovadas |
| Importação de alunos, XLS/XLSX e resistência a arquivos inválidos | 53 aprovadas |
| Matrículas por período, sincronização e integridade | 26 aprovadas |
| Isolamento de módulos e processos reais | 7 aprovadas |
| Fluxos de navegador desktop/móvel e indisponibilidade | 9 aprovadas |

Total: **201 verificações aprovadas**, além da verificação de sintaxe, recursos
HTML e fronteiras de módulos. A suíte de 62 verificações da API também passou
sem banco original, reproduzindo um clone novo do GitHub.

## Validação de 11 de novembro de 2026 (Windows)

Ambiente Windows 11, Node.js 26.13.1. Executada depois das correções de login e
senhas (etapa 1 da auditoria técnica).

| Verificação | Resultado |
| --- | --- |
| API: regras acadêmicas, autorização, publicação, concorrência e preservação | 62 aprovadas |
| Gestão de usuários, conversões de perfil e proteção de histórico | 44 aprovadas |
| Importação de alunos, senhas provisórias individuais, XLS/XLSX | 56 aprovadas |
| Matrículas por período, sincronização e integridade | 26 aprovadas |
| Isolamento de módulos e processos reais | 7 aprovadas |
| Segurança de login: limite por cliente, troca de senha, primeiro acesso | 10 aprovadas |

Total: **205 verificações aprovadas**. O teste de navegador automatizado
(`tests/browser/smoke.py`) não foi executado nesta data; as telas alteradas
foram conferidas manualmente em navegador com banco descartável.

O teste de encerramento de processos reais falhava no Windows por ordem de
limpeza (pasta removida antes de encerrar o processo que mantinha o banco
aberto) e foi corrigido; no Linux o comportamento não muda.

Nas suítes anteriores, contas criadas pelo administrador têm a troca
obrigatória dispensada direto no banco de teste, porque verificam outras
regras. O primeiro acesso é exercitado em `seguranca_login.test.js` e na suíte
de importação.

## Validação de 12 de novembro de 2026 (Windows)

Ambiente Windows 11, Node.js 26.13.1. Executada depois da etapa 2 da auditoria
técnica (migrações versionadas, sessões no banco, perfis e permissões,
histórico de notas).

| Verificação | Resultado |
| --- | --- |
| API: regras acadêmicas, autorização, publicação, concorrência e preservação | 62 aprovadas |
| Gestão de usuários, conversões de perfil e proteção de histórico | 44 aprovadas |
| Importação de alunos, senhas provisórias individuais, XLS/XLSX | 56 aprovadas |
| Matrículas por período, sincronização e integridade | 26 aprovadas |
| Isolamento de módulos e processos reais | 7 aprovadas |
| Segurança de login | 10 aprovadas |
| Migrações versionadas | 5 aprovadas |
| Sessões no banco | 7 aprovadas |
| Perfis e permissões | 7 aprovadas |
| Histórico de notas e de publicações | 8 aprovadas |

Total: **232 verificações aprovadas** com um único `npm test`. As telas
alteradas (histórico de notas do professor e do administrador, auditoria,
cadastro com os perfis novos e a tela dos perfis sem módulo) foram conferidas
manualmente em navegador com banco descartável. O teste automatizado de
navegador não foi executado.

Não verificado com dados reais: a migração de um banco legado só foi exercitada
com um banco sintético montado no teste; o banco de demonstração original não
estava disponível.

## Validação de 12 de novembro de 2026, etapa 3 (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1.
Executada depois da etapa 3 da auditoria técnica (HTTPS obrigatório, backup com
retenção e restauração, lint, auditoria de dependências e CI).

| Verificação | Resultado |
| --- | --- |
| As dez linhas da validação anterior | 232 aprovadas, sem mudança de expectativa |
| HTTPS obrigatório, HSTS e cookie `Secure` | 9 aprovadas |
| Backup, retenção e restauração | 9 aprovadas |
| Dependências (`uuid` corrigido sob o `exceljs`) | 2 aprovadas |
| Lint | 0 erros, 8 avisos conhecidos de variável sem uso |
| `npm audit` | 0 avisos (antes: 2 moderados) |
| Navegador (`tests/browser/smoke.py`) | 9 aprovadas, executado à parte |

Total: **252 verificações aprovadas** com um único `npm test`, executado depois
de `npm ci` a partir do `package-lock.json`. O teste de navegador foi executado
nesta máquina pela primeira vez; a versão anterior do roteiro falhava desde a
etapa 1, porque as contas criadas pelo administrador passaram a exigir troca de
senha no primeiro acesso.

Os testes de HTTPS usam processos reais em endereço local e um certificado
gerado na hora, nunca gravado no repositório. A recusa de iniciar em `0.0.0.0`
é verificada com o processo real; a permissão para iniciar exposto com TLS ou
proxy declarado é verificada na regra, sem abrir porta na rede.

Não verificado: a CI não foi executada, porque o repositório não tem remoto; o
arquivo do workflow foi conferido quanto à sintaxe e cada comando dele foi
executado localmente no Windows, não no Linux. Certificado institucional, proxy
HTTPS real, agendamento no servidor e restauração de um backup real do ambiente
institucional não foram exercitados.

## Validação de 12 de novembro de 2026, etapa 4 (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1.
Executada depois da etapa 4 da auditoria técnica (melhorias do módulo
principal pedidas na reunião de 06/11, S7 e S9).

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 252 aprovadas, sem mudança de expectativa |
| Importação de notas somente por matrícula | 4 aprovadas |
| Números da turma ocultos do aluno em grupo pequeno | 5 aprovadas |
| Valor máximo de SAI, OSCE, trabalho e outros | 9 aprovadas |
| Agrupamento por modalidade usado nos gráficos | 4 aprovadas |
| Lint | 0 erros, 8 avisos conhecidos |
| Navegador (`tests/browser/smoke.py`) | 9 aprovadas, executado à parte |

Total: **274 verificações aprovadas** com um único `npm test`.

Conferido manualmente em navegador, com banco descartável e contas fictícias:
cabeçalhos com valor máximo e o diálogo de configuração; destaque da nota
abaixo da média com a marca "↓"; média por instrumento com percentual e marca
de 60%, e o estado "sem valor máximo declarado"; teia por modalidade da turma e
do estudante; painel do aluno com os rótulos novos, gráfico de barras com
total, nome da disciplina e linha de 60%, botão "Ver gráficos", teia com
"Onde estou" e modo por modalidade; aluno de turma com 2 resultados sem nenhum
número da turma na tela.

Não verificado: leitura por leitor de tela, impressão do resultado do aluno
depois das mudanças, e larguras de tela além de 1440 px e da largura de 390 px
coberta pelo teste automatizado.

## Validação de 12 de novembro de 2026, etapa 5 (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1.
Executada depois da etapa 5 da auditoria técnica (núcleo de formulários e
módulo OSCE).

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 274 aprovadas |
| OSCE e núcleo de formulários | 12 aprovadas |
| Lint | 0 erros, 8 avisos conhecidos |
| Navegador (`tests/browser/smoke.py`) | 11 aprovadas (2 novas, do OSCE), executado à parte |

Total: **286 verificações aprovadas** com um único `npm test`.

Duas verificações de perfis, da etapa 2, tiveram a expectativa atualizada: elas
exigiam que os perfis novos não tivessem nenhuma permissão. Passam a exigir que
o Núcleo de Avaliação e o Usuário operacional tenham exatamente as permissões
do OSCE, que Coordenação e CSTI continuem sem nenhuma, e que nenhum dos quatro
alcance as rotas dos perfis originais.

As 12 verificações do OSCE cobrem: permissões por perfil; rascunho com quatro
estações, pergunta-chave e alunos do período; gravação e conflito de revisão;
liberação bloqueada sem perguntas ou sem alunos e estrutura travada depois dela;
uma resposta por aluno em cada estação; encerramento e reabertura; resultado
bruto sem nenhuma nota; anulação com a resposta preservada; recusa de alterar ou
apagar respostas direto no banco; auditoria com conta, estação e origem, sem o
conteúdo das respostas; senha provisória da conta operacional; falha isolada do
módulo.

Conferido manualmente em navegador, com banco descartável e contas fictícias:
o Núcleo cria o OSCE, monta estações e perguntas, libera, vê o resultado bruto
e anula uma resposta; a conta operacional vê o período e as estações, responde
e usa "Enviar outra resposta", com o aluno já avaliado indisponível; a conta do
CSTI continua na tela neutra.

Não verificado: uso em tablet ou celular no ambulatório, várias contas
operacionais respondendo ao mesmo tempo sob carga, e leitura por leitor de tela.

## Validação de 15 de novembro de 2026, etapa 6 (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1.
Executada depois da etapa 6 da auditoria técnica (Avaliação Docente anônima).

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 286 aprovadas |
| Avaliação Docente e caminho anônimo | 9 aprovadas |
| Lint | 0 erros, 8 avisos conhecidos |
| Navegador (`tests/browser/smoke.py`) | 14 aprovadas (3 novas, da Avaliação Docente), executado à parte |

Total: **295 verificações aprovadas** com um único `npm test`.

As duas verificações de perfis tiveram a expectativa atualizada de novo: CSTI,
Coordenação, professor e aluno passam a ter, cada um, exatamente uma permissão
da Avaliação Docente, além das que já tinham.

As 9 verificações novas cobrem: permissões dos quatro perfis; rascunho,
validações, liberação e estrutura travada; resposta única por aluno matriculado
na disciplina; anonimato inspecionado direto no banco (colunas das tabelas,
ausência de numeração sequencial, identificador aleatório, só a data, nenhum
dado de pessoa nas respostas, auditoria sem professor e sem conteúdo, adesão só
por contagem); recusa de alterar ou apagar respostas e participações; resultado
oculto durante a coleta e abaixo do mínimo; percentuais com "não se aplica" à
parte, professor vendo só os seus e total geral somando só quem atingiu o
mínimo; encerramento definitivo; falha isolada do módulo.

Conferido manualmente em navegador, com banco descartável e contas fictícias:
CSTI (lista, avaliação liberada com adesão por contagem); aluno (entrada no
menu com pendências, avisos, envio e marca de respondida); professor (evolução,
percentuais e comentários); Coordenação (resultado geral, professores e
comparação entre avaliações).

Não verificado: o anonimato contra a comparação de duas cópias do banco, que é
um limite documentado e não um defeito a testar; uso em celular; leitor de tela.

## Isolamento exercitado

- Erro real de sintaxe ao carregar um módulo: sua rota retorna 503 e login,
  usuários e resultados continuam disponíveis.
- Instalador registra rota e lança erro: o registro parcial é descartado.
- Exceção em uma requisição: erro fica naquela operação, outras rotas respondem.
- Falha no módulo de planilhas ou de importação: não bloqueia o módulo geral.
- API executa sem carregar arquivos da interface.
- Servidor web atende páginas e arquivos com a API inacessível.
- Login e cookies funcionam através do proxy; origem externa é rejeitada.
- Encerramento de cada processo real não encerra o outro; reiniciar a API
  restaura as chamadas pelo proxy sem reiniciar o servidor web.

## Navegador

Login e recursos estáticos; administrador consulta usuários; professor carrega
vínculos e planilha; aluno acessa painel; largura de 390px no painel do aluno;
falha de arquivo opcional de evolução não bloqueia acesso do professor; aviso
durante queda da API; recuperação do aviso sem recarregar; nenhum erro JavaScript
nos fluxos exercitados. Respostas 5xx inesperadas também são verificadas antes
da queda intencional da API.

O teste reproduzível está em `tests/browser/smoke.py`. Requer Python Playwright
e Chromium disponíveis na máquina de teste (`tests/browser/requirements.txt`).
Execute `python tests/browser/smoke.py`. Ele usa contas sintéticas e banco
descartável. A CI o executa em um job próprio; a dependência de navegador não é
exigida para instalar o sistema nem para o `npm test`.

## Preservação

O banco recebido e a cópia local da base refatorada têm o mesmo SHA-256:

```text
61123676039d0f6e28e2def85f5edffe32ec44158d3ae79525a2b53286169251
```

Nenhum teste escreve nesse banco. A suíte de preservação usa backup temporário,
confere todos os registros anteriores e permite os acréscimos da sincronização
original de vínculos. O banco de demonstração, backups e relatórios locais são
ignorados no Git. Em um clone novo, o sistema cria um esquema vazio e o usuário
configura o administrador ou copia o banco do ZIP original.

## Limites da execução

Windows, rede física da instituição, certificado TLS institucional e serviço
permanente do servidor de destino não foram executados neste ambiente.
As verificações não demonstram tolerância a corrupção do banco, travamento
do núcleo ou falha da máquina. Os limites de isolamento estão documentados
em `ARQUITETURA.md`.

## Validação de 15 de novembro de 2026, etapa 7 (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1.
Executada depois da etapa 7 da auditoria técnica (comprovantes das ações do
aluno e Articulação Interdisciplinar).

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 295 aprovadas |
| Comprovantes | 6 aprovadas |
| Articulação Interdisciplinar | 7 aprovadas |
| Lint | 0 erros, 8 avisos conhecidos |
| Navegador (`tests/browser/smoke.py`) | 22 aprovadas (3 novas dos comprovantes e 5 da Articulação), executado à parte |

Total: **308 verificações aprovadas** com um único `npm test`.

As duas verificações de perfis tiveram a expectativa atualizada outra vez, com
as permissões exatas dos comprovantes e da Articulação.

As 6 verificações dos comprovantes cobrem: formato e aleatoriedade do código e
tolerância a erros de digitação; emissão junto com o envio, lista do aluno e
PDF bem formado; ausência de qualquer conteúdo de resposta no registro e no
arquivo; quem vê (o próprio aluno, o Administrador e o CSTI) e quem não vê
(outro aluno, professor e Coordenação); verificação pelo código, com recusa de
código inventado ou alterado; recusa de alterar ou apagar um comprovante.

As 7 verificações da Articulação cobrem: nome livre, perguntas do modelo,
listas editáveis e lista padrão; bloqueios da liberação e estrutura travada;
resposta única com todas as perguntas, validação de cada tipo de resposta e
comprovante sem conteúdo; recusa de alterar ou apagar respostas; contagens
gerais e por tutor, sem nenhum percentual de desempenho; acesso de cada perfil
em cada etapa, com o tutor sem nomes e sem números abaixo do mínimo; planilha
exportada com as colunas da planilha de respostas da instituição.

Não verificado nesta etapa: uso com a lista real de tutores e estações, leitor
de tela, e a planilha exportada aberta dentro da planilha de cálculo da
instituição, que ainda não foi fornecida.

## Validação de 15 de novembro de 2026, etapa 8 (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1.
Executada depois da etapa 8 da auditoria técnica (legibilidade e documentação
final), na versão 12.0.0.

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 308 aprovadas |
| Prévia da planilha × cálculo do servidor | 4 aprovadas |
| Esquema documentado × banco real | 2 aprovadas |
| Lint | 0 erros e 0 avisos (o limite de avisos passou de 8 para 0) |
| Formato do código (`npm run format:check`) | aprovado; agora faz parte do `npm test` |
| Navegador (`tests/browser/smoke.py`) | 23 aprovadas (1 nova: telas sem os complementos), executado à parte |
| `npm audit` | 0 vulnerabilidades |

Total: **314 verificações aprovadas** com um único `npm test`.

Verificações próprias da reformatação, feitas uma vez e repetíveis:

| Verificação | Resultado |
| --- | --- |
| Árvore de sintaxe e comentários de cada arquivo JavaScript, antes e depois (`scripts/format-equivalence.js`) | 83 arquivos, todos idênticos |
| Regras de estilo como o navegador as interpreta, antes e depois (`tests/browser/css_equivalence.py`) | 12 folhas, 1.261 regras, todas idênticas |
| HTML das abas Resultados e Individual do professor e do resultado do aluno, antes e depois da troca das sobrescritas, com dados fictícios | idêntico |
| O mesmo HTML depois da remoção do botão "Consultoria Acadêmica" | a única diferença é o botão e o aviso removidos |

Os dois verificadores foram testados antes do uso: acusam mudança de um número,
de um nome, de um comentário e de um valor de estilo, e aceitam mudança só de
espaçamento.

Não verificado nesta etapa: uso em celular das telas antigas depois da
reformatação (o CSS foi provado equivalente, mas não houve conferência visual
em aparelho), leitor de tela e impressão.

## Validação de 16 de novembro de 2026, relatório da Articulação (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1,
Excel 16. Executada depois da implementação do relatório da Articulação
Interdisciplinar, na versão 12.1.0.

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 314 aprovadas (1 da Articulação com a expectativa atualizada, descrita abaixo) |
| Fórmulas da planilha da instituição × cálculo do sistema | 7 aprovadas |
| Relatório por tutor e período, sigilo do tutor e nomes das abas | 1 aprovada |
| Lint e formato | 0 erros, 0 avisos, formato aprovado |
| Navegador (`tests/browser/smoke.py`) | 23 aprovadas (1 com a expectativa atualizada), executado à parte |

Total: **322 verificações aprovadas** com um único `npm test`.

As 7 verificações do cálculo (`tests/integration/calculo_articulacao.test.js`)
cobrem: um exemplo conferido à mão; as fórmulas das três linhas de totais da
planilha, avaliadas como uma planilha as avalia, contra o sistema em 3.000
planilhas inventadas (117.000 comparações); os textos "Sim", "Não" e
"Parcialmente" que as fórmulas contam; o divisor, que é quem respondeu ao
formulário; o arredondamento; o grupo sem respostas; e a ausência de qualquer
número único de desempenho.

Verificação feita uma vez, fora do `npm test`: uma exportação com 23 respostas
fictícias, 3 tutores e 2 períodos foi aberta no Excel desta máquina, que
recalculou tudo. As 252 células de fórmula das 6 abas de relatório deram o
mesmo valor que o sistema gravou, e os 162 percentuais e as 24 médias aparecem
no Excel com o mesmo arredondamento das telas.

**Uma verificação da etapa 7 teve a expectativa atualizada.** Ela exigia que os
resultados não trouxessem nenhuma média nem percentual, porque não havia
fórmula. Agora exige os números do relatório, com valores conferidos, que cada
pergunta traga somente esses campos, e que nenhum número único de desempenho
nem classificação apareça. A verificação de navegador do CSTI mudou do mesmo
modo.

Não verificado: a exportação aberta no Google Planilhas; o relatório com a
lista real de tutores; se existe, na instituição, uma etapa de cálculo depois
dessa planilha.

## Validação de 16 de novembro de 2026, nota do OSCE e planilha final da Articulação (Windows)

Ambiente Windows 11, Node.js 26.13.1, Python 3.15.2 com Playwright 1.65.1,
Excel 16. Executada depois da implementação da nota do OSCE e do novo formato
da exportação da Articulação, na versão 12.2.0.

| Verificação | Resultado |
| --- | --- |
| Todas as linhas da validação anterior | 322 aprovadas (4 com a expectativa atualizada, descritas abaixo) |
| Fórmulas da planilha do OSCE × cálculo do sistema | 9 aprovadas |
| Notas do OSCE nas rotas e exportação em Excel | 4 aprovadas |
| Lint e formato | 0 erros, 0 avisos, formato aprovado |
| Navegador (`tests/browser/smoke.py`) | 24 aprovadas (1 nova, 3 com a expectativa atualizada), executado à parte |

Total: **335 verificações aprovadas** com um único `npm test`.

As 9 verificações do cálculo do OSCE (`tests/integration/calculo_osce.test.js`)
cobrem: um exemplo conferido à mão; as fórmulas de acertos e nota da planilha,
avaliadas como uma planilha as avalia, contra o sistema em 3.000 estações
inventadas (mais de 40.000 comparações); as médias do "Resultado Final" por
aluno, por estação e geral, contra uma tabela dinâmica em miniatura; a estação
não avaliada fora da média; a redução pela metade; a estação sem itens; o
comentário igual à palavra "Fez"; os textos e o arredondamento; e a ausência de
nota de aprovação, classificação e comparação entre rodadas.

Verificações feitas uma vez, fora do `npm test`:

- **A planilha da instituição recalculada pelo sistema.** As respostas das 48
  avaliações da planilha recebida foram passadas pelo cálculo do sistema: os 48
  acertos e as 48 notas deram o mesmo valor que a planilha guarda, e as 70
  células do "Resultado Final" dela também. A planilha foi lida fora do
  repositório e nada dela foi copiado.
- **As exportações recalculadas pelo Excel.** Uma exportação do OSCE com 72
  avaliações fictícias em 4 estações (com comentários iguais a "Fez") e uma da
  Articulação com 20 respostas e 3 tutores foram abertas no Excel desta
  máquina, que recalculou tudo: 457 e 126 células de fórmula, nenhuma
  diferente do que o sistema gravou. Os 93 números do "Resultado Final"
  aparecem no Excel com o mesmo arredondamento das telas.

**Quatro verificações anteriores tiveram a expectativa atualizada.**

- OSCE, resultado para o Núcleo: exigia que nenhuma nota existisse. Agora exige
  os acertos e as notas, com valores conferidos, e que não apareça nota de
  aprovação, peso ou classificação.
- Articulação, as duas da exportação: exigiam uma aba por tutor e período, com
  a coluna de e-mail institucional e os totais na ordem da planilha anterior.
  Agora exigem o formato da planilha final: uma aba por tutor, ordem nova dos
  totais e sem rótulos.
- Articulação, cálculo: as fórmulas e as colunas conferidas passaram a ser as
  da planilha final.

No navegador, mudaram a tela de resultados do OSCE, o rótulo "Fez" na resposta
do ambulatório e o texto do aviso da Articulação.

Uma das execuções do `npm test` parou em `seguranca_login.test.js` com "bad
port": o sistema sorteou para o servidor de teste uma porta que o Node recusa.
O arquivo não foi alterado nesta tarefa e a execução seguinte passou inteira
(registrado como P44 em `docs/PENDENCIAS.md`).

Não verificado: as exportações abertas no Google Planilhas; um OSCE real
aplicado pelo sistema e comparado com a planilha preenchida pelos professores
para o mesmo dia; a exportação da Articulação com a lista real de tutores.
