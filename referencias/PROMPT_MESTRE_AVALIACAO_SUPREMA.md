# Avaliação Suprema — Prompt Mestre para Evolução do Projeto

> **Objetivo:** evoluir o sistema existente a partir do repositório fornecido, preservando sua identidade visual, funcionalidades e arquitetura válida. Não reconstruir do zero.

## 1. Papel e objetivo

Atue como engenheira de software sênior, arquiteta de sistemas e especialista em segurança de aplicações web.

Você será responsável por analisar, evoluir e aprimorar o projeto **Avaliação Suprema**, utilizando obrigatoriamente o código-fonte existente no arquivo `Projeto-Suprema-main.zip`.

Seu trabalho não é criar um sistema novo. É dar continuidade ao sistema atual, preservando suas funcionalidades, identidade visual, arquitetura e regras de negócio sempre que estiverem corretas.

Trabalhe com rigor técnico, segurança, organização e atenção à compatibilidade.

## 2. Fontes de informação

Você receberá três fontes principais:

1. **Código-fonte (`Projeto-Suprema-main.zip`):** base real de desenvolvimento e fonte principal para a implementação.
2. **Especificação completa:** documento com requisitos, regras de negócio, funcionalidades existentes e melhorias planejadas.
3. **Transcrições dos áudios:** requisitos adicionais dos módulos OSCE, Avaliação Docente e Articulação Interdisciplinar.

Analise as três fontes em conjunto.

Em caso de divergência:

- Não descarte silenciosamente nenhuma informação.
- Identifique e documente o conflito.
- Preserve o comportamento atual até que uma mudança seja validada.
- Não invente regras de negócio para preencher lacunas.
- Apresente dúvidas que dependam de decisão institucional antes de implementar.

Hierarquia de referência:

- O código demonstra o comportamento atualmente implementado.
- A especificação documenta requisitos e regras já definidos.
- As transcrições complementam os requisitos com novas funcionalidades e comportamentos esperados.

## 3. Regra fundamental: preservar o projeto existente

**Trabalhe sobre a base de código fornecida. Não reconstrua o sistema do zero.**

O projeto já possui identidade visual, estrutura de navegação, telas, componentes, estilos, funcionalidades e arquitetura. Tudo isso deve ser tratado como patrimônio do projeto.

### 3.1. Preservação visual obrigatória

Preserve, sempre que possível:

- Paleta de cores, tipografia, logotipo e identidade visual.
- Layout geral, sidebar, menus, cabeçalho e navegação.
- Organização dos painéis, cards, tabelas, botões e formulários.
- Ícones, espaçamentos, dimensões e hierarquia visual.
- Responsividade e padrões de interação.
- Componentes compartilhados.
- Padrões de feedback, notificações e mensagens.

Os novos módulos devem parecer partes nativas do sistema, não aplicações independentes incorporadas posteriormente.

Não faça reformulação estética por preferência pessoal. Não substitua o design atual por templates genéricos, dashboards prontos ou uma nova identidade visual. Não altere telas existentes apenas para deixá-las diferentes.

**A prioridade é manter a experiência visual atual e melhorar sua consistência, usabilidade e qualidade.**

Se uma alteração visual for necessária para suportar uma funcionalidade, faça-a pontualmente e respeite os padrões existentes.

### 3.2. Preservação funcional

Antes de alterar qualquer funcionalidade, descubra:

- Como funciona atualmente.
- Quais arquivos implementam seu comportamento.
- Quais rotas e contratos de API utiliza.
- Quais tabelas e estruturas de dados estão envolvidas.
- Quais perfis possuem acesso.
- Quais dependências existem com outros módulos.
- Quais testes validam seu comportamento.

Não remova funcionalidades existentes porque parecem antigas, redundantes ou desnecessárias sem comprovar que podem ser substituídas com segurança.

Não altere regras acadêmicas já implementadas sem justificativa e validação. Não quebre contratos de API existentes sem planejar e testar a compatibilidade.

### 3.3. Mudanças incrementais

Prefira:

- Aproveitar componentes existentes.
- Reutilizar serviços, funções e estruturas.
- Estender módulos existentes quando fizer sentido.
- Criar novos módulos seguindo os padrões arquiteturais atuais.
- Corrigir problemas pontualmente.
- Refatorar somente quando houver benefício técnico demonstrável.

Evite:

- Reescrever arquivos inteiros sem necessidade.
- Substituir bibliotecas ou frameworks sem justificativa.
- Criar uma segunda implementação de funcionalidades existentes.
- Duplicar componentes e regras de negócio.
- Alterar toda a arquitetura para acomodar uma funcionalidade pequena.
- Fazer mudanças estéticas não solicitadas.
- Introduzir dependências desnecessárias.

Toda mudança deve ter justificativa técnica.

## 4. Auditoria inicial obrigatória

Antes de implementar novidades, faça uma auditoria completa da base. **Não comece programando imediatamente.**

### 4.1. Estrutura e arquitetura

Analise:

- Organização das pastas.
- Separação entre frontend e backend.
- Inicialização dos serviços.
- Módulos existentes.
- Comunicação entre frontend e API.
- Contratos HTTP.
- Componentes compartilhados.
- Organização das regras de negócio.
- Estratégia de persistência.
- Configurações de ambiente.
- Dependências e bibliotecas.

### 4.2. Interface

Analise:

- Telas existentes e navegação.
- Componentes reutilizáveis.
- Identidade visual e responsividade.
- Comportamento dos formulários.
- Dashboards e indicadores.
- Experiência de cada perfil.

Registre quais elementos visuais devem ser preservados.

### 4.3. Banco de dados

Analise:

- Estrutura atual, tabelas e relacionamentos.
- Chaves, restrições e índices.
- Migrações existentes.
- Dados e registros preexistentes.
- Estratégia de inicialização.
- Integridade e consistência.
- Rotinas de backup e recuperação.

Não execute migrações destrutivas durante a auditoria.

### 4.4. Segurança

Verifique:

- Autenticação e autorização.
- RBAC e permissões por perfil.
- Isolamento de dados entre usuários.
- Controle de sessão.
- Cookies e configurações de segurança.
- CSRF e XSS.
- SQL Injection e injeção de comandos.
- Validação e sanitização de entradas.
- Upload e processamento de arquivos.
- Exposição de informações sensíveis.
- Gerenciamento de segredos.
- CORS e validação de origem.
- Rate limiting.
- Logs e auditoria.
- Acesso a rotas administrativas.
- Manipulação de notas e resultados.
- Proteção contra acesso indevido a registros de alunos e professores.

Não presuma que uma funcionalidade está segura apenas porque existe validação no frontend. Verificações críticas devem ocorrer no backend.

### 4.5. Testes

Analise testes existentes, cobertura de funcionalidades críticas, autorização, regressão, integridade de dados, cálculos acadêmicos e integração frontend/API.

### Entregável da auditoria

Antes de iniciar alterações, apresente:

1. Diagnóstico da arquitetura atual.
2. Mapa dos módulos e funcionalidades existentes.
3. Mapa dos componentes visuais que devem ser preservados.
4. Funcionalidades já implementadas que não precisam ser recriadas.
5. Vulnerabilidades e problemas de segurança encontrados.
6. Problemas de arquitetura e manutenção.
7. Requisitos novos que podem ser integrados diretamente.
8. Requisitos que exigem novas estruturas.
9. Conflitos ou dúvidas nas especificações.
10. Plano de implementação incremental.

**Não modifique o projeto durante essa primeira etapa. Aguarde a validação do diagnóstico e do plano.**

## 5. Contexto técnico da base existente

A organização identificada no repositório inclui:

- `apps/web/`: interface, servidor web e arquivos públicos.
- `apps/api/`: backend, regras de negócio e rotas.
- `apps/api/src/core/`: funcionalidades centrais, como banco de dados e segurança.
- `apps/api/src/modules/`: módulos de rotas.
- `apps/web/public/features/`: funcionalidades e telas do frontend.
- `apps/web/public/shared/`: recursos compartilhados.
- `apps/web/public/styles/`: folhas de estilo.
- `packages/`: contratos e recursos compartilhados.
- `scripts/`: rotinas operacionais.
- `tests/`: testes.
- `docs/`: documentação.
- `data/`: dados locais, que não devem ser tratados como arquivos descartáveis.

A base utiliza Node.js e Express na API, com frontend separado e comunicação HTTP. A documentação do repositório informa que a versão ativa utiliza SQLite.

Use essas informações como ponto de partida, mas confirme tudo diretamente no código antes de tomar decisões. Não presuma que a documentação está integralmente atualizada.

## 6. Banco de dados: decisão ainda em validação

A escolha definitiva do banco de dados ainda não foi homologada.

A especificação apresenta PostgreSQL como uma direção possível, mas isso não significa que sua adoção esteja aprovada. A base atual utiliza SQLite.

Portanto:

- Preserve a persistência atual durante a auditoria.
- Não migre automaticamente para PostgreSQL.
- Não substitua SQLite por outro banco sem autorização.
- Não descarte ou recrie bancos existentes.
- Não altere a localização dos dados sem necessidade.
- Não faça alterações destrutivas em tabelas.
- Não presuma que o banco de desenvolvimento é o banco institucional.

Avalie a evolução necessária do modelo de dados. Projete as novas funcionalidades de forma organizada, mantendo as regras de negócio desacopladas da tecnologia de persistência sempre que viável.

Apresente análise comparativa e recomendação técnica quando houver informações suficientes. A decisão final deve ser validada antes de qualquer migração.

## 7. Módulos e funcionalidades

O Avaliação Suprema já possui um módulo principal em funcionamento. Ele deve ser preservado e aprimorado.

### 7.1. Avaliação Suprema — módulo principal

Preserve e aprimore as funcionalidades existentes, incluindo:

- Administração de usuários.
- Cadastro e gerenciamento de alunos.
- Cadastro de professores.
- Cursos, disciplinas e períodos.
- Vínculos acadêmicos.
- Matrículas.
- Importação e exportação de planilhas.
- Gerenciamento de avaliações.
- A1, A2 e A3, conforme a implementação e os requisitos existentes.
- Lançamento e gerenciamento de notas.
- Publicação de resultados.
- Dashboards.
- Histórico acadêmico.
- Indicadores e relatórios.

#### Regras acadêmicas

Respeite a fórmula existente documentada:

- `nota_prova`: soma de c1 a c6 e me1 a me4 quando preenchidos.
- OSCE: soma osce1 a osce4 quando existem estações; caso contrário, utiliza o campo OSCE direto.
- `nota_final`: soma c1 a c6, me1 a me4, q7 a q9, pbl1, pbl2, subtotal de OSCE, trabalho e outros_final.
- q10 é um campo legado e não participa do cálculo.
- Campos ausentes são considerados zero.
- Não some as estações OSCE duas vezes.
- Arredonde para duas casas decimais.
- Não imponha limite de 0 a 10 nem pesos não documentados.

Não altere essas regras sem decisão formal.

Mantenha a separação entre rascunhos e resultados publicados. O aluno só deve visualizar resultados efetivamente publicados. Preserve snapshots de publicação e a integridade dos registros históricos.

### 7.2. Módulo OSCE

Implementar módulo específico para gerenciamento e avaliação das estações OSCE.

#### Estrutura

Deve existir um núcleo de avaliação responsável pela organização e configuração das avaliações.

Permitir:

- Criar avaliações OSCE.
- Organizar avaliações por ano, semestre e período.
- Criar e gerenciar estações.
- Configurar formulários de avaliação.
- Definir questões e critérios.
- Associar alunos às avaliações.
- Registrar respostas.
- Calcular resultados automaticamente.
- Consultar resultados individuais e consolidados.

#### Pergunta-chave

Existe uma regra específica nas transcrições:

**"Ele cumprimentou o paciente?"**

Pontuação:

- SIM = 1 ponto.
- NÃO = 0,5 ponto.

Essa regra deve poder ser ativada ou desativada na configuração da avaliação. Não aplique essa pontuação automaticamente a outros critérios.

Não invente pesos ou fórmulas globais para o OSCE. A fórmula de consolidação deve ser identificada na documentação institucional ou validada antes de ser implementada.

#### Usuários operacionais

Permitir contas operacionais compartilhadas para uso no ambulatório. Essas contas não devem ser vinculadas nominalmente a um professor específico.

A operação deve continuar auditável. Registre a conta utilizada, data, horário e ação realizada, sem atribuir falsamente a operação a um professor.

#### Envio e processamento

Permitir selecionar alunos, enviar múltiplas avaliações, registrar respostas de diferentes estações, salvar avaliações, consolidar resultados, visualizar resultados individuais e gerar indicadores.

#### Dashboards e comparações

Oferecer gráficos, médias, percentuais, rankings quando houver critério institucional definido, comparação entre OSCE 1 e OSCE 2, períodos, semestres, anos e histórico de evolução.

Respeite as permissões de acesso.

### 7.3. Módulo de Avaliação Docente

Criar módulo para avaliação dos professores pelos alunos.

#### Gestão dos formulários

O CSTI deve poder criar formulários, definir período, selecionar professores, associar disciplinas, configurar questões, liberar formulários aos alunos, acompanhar respostas, encerrar avaliações e consolidar resultados.

#### Respostas

As opções devem contemplar:

- SIM.
- NÃO.
- NÃO SE APLICA.
- Comentários, quando disponíveis.

A opção NÃO SE APLICA não deve ser contabilizada como SIM ou NÃO.

#### Resultados

Calcular automaticamente médias, percentuais de SIM e NÃO, quantidade de respostas, quantidade de respostas não aplicáveis, comentários e indicadores consolidados.

#### Permissões

**Professor:** visualiza somente seus próprios resultados e avaliações anteriores conforme permissão. Não acessa avaliações individuais de outros professores.

**Coordenação:** visualiza resultados de todos os professores, indicadores gerais, comparações entre disciplinas e períodos, evolução semestral e anual, comentários e consolidações conforme regras institucionais.

**CSTI:** gerencia formulários, controla períodos, acompanha processamento e administra configurações operacionais.

#### Comparações

Implementar comparações entre semestres, anos, professores, disciplinas e períodos de avaliação. Preserve privacidade e regras institucionais de divulgação.

### 7.4. Módulo de Articulação Interdisciplinar

Implementar módulo específico para avaliação da articulação interdisciplinar.

#### Fluxo operacional

1. O CSTI cria o formulário.
2. Configura questões e período.
3. Libera o formulário aos alunos.
4. Os alunos respondem.
5. O sistema armazena as respostas.
6. O motor de cálculo processa os resultados.
7. O CSTI finaliza a avaliação.
8. Após a liberação, os resultados ficam disponíveis conforme as permissões.

#### Fórmula de cálculo

A fórmula oficial será fornecida por meio de planilha institucional.

**Não invente a fórmula. Não substitua os cálculos por médias genéricas.**

Prepare estrutura de cálculo que permita implementar fielmente a fórmula fornecida, documentando os critérios.

Quando a planilha estiver disponível:

- Analise suas fórmulas.
- Identifique dependências e referências.
- Reproduza os cálculos no backend.
- Compare resultados do sistema com os da planilha.
- Crie testes automatizados para os cenários identificados.

#### Resultados

O professor visualiza seus próprios resultados. A coordenação visualiza resultados gerais, percentuais, comparações, indicadores por período, evolução histórica e melhores/piores resultados quando a metodologia de classificação estiver definida.

Não publique resultados antes da finalização e liberação autorizadas.

### 7.5. Instrumentos complementares e SAI

A especificação contempla instrumentos complementares, incluindo SAI.

Analise a implementação atual e a documentação para identificar o que já existe e o que está efetivamente definido.

Não invente funcionalidades, escalas ou fórmulas ausentes. Documente pendências e prepare a arquitetura para implementação posterior.

## 8. Perfis e controle de acesso

Considere os perfis e responsabilidades:

- ADMIN.
- PROFESSOR.
- ALUNO.
- COORDENAÇÃO.
- NÚCLEO DE AVALIAÇÃO.
- CSTI.
- USUÁRIO OPERACIONAL.

Compatibilize nomenclatura e relacionamentos com o modelo de autenticação existente. Não crie sistemas paralelos de usuários ou autenticação.

Implemente autorização no backend, não apenas ocultação de menus no frontend.

Garanta separação de responsabilidades, menor privilégio, proteção de rotas, isolamento de dados, controle de acesso por módulo e por registro e auditoria de operações sensíveis.

Um professor não pode acessar resultados de outro professor alterando um ID na requisição. Um aluno não pode consultar dados de outro aluno. Um usuário operacional não deve receber permissões administrativas por conveniência.

A coordenação e o núcleo de avaliação devem ter permissões compatíveis com suas responsabilidades institucionais.

## 9. Segurança como prioridade

A segurança é requisito central, não acabamento.

Durante a auditoria, identifique vulnerabilidades reais e classifique-as por gravidade, impacto, probabilidade, facilidade de exploração, componente afetado e recomendação de correção.

Priorize vulnerabilidades críticas e altas.

Requisitos mínimos:

- Autenticação segura.
- Senhas armazenadas com hash apropriado.
- Sessões protegidas.
- Cookies com configurações seguras.
- Proteção contra CSRF e XSS.
- Consultas parametrizadas.
- Validação de entradas no backend.
- Autorização por perfil e recurso.
- Rate limiting em operações sensíveis.
- Proteção de endpoints administrativos.
- Proteção de uploads e planilhas.
- Tratamento seguro de erros.
- Segredos fora do código-fonte.
- Logs sem exposição de dados sensíveis.
- Auditoria de alterações em notas, avaliações e publicações.
- Proteção contra enumeração de usuários.
- Verificação de integridade dos dados.

Não faça correções superficiais. Não considere um endpoint seguro apenas porque o botão correspondente não aparece para determinado perfil. Teste o acesso direto à API.

Não enfraqueça validações, testes ou permissões para fazer uma funcionalidade funcionar. Não armazene senhas, tokens ou chaves em arquivos versionados.

## 10. Interface e experiência do usuário

A interface deve evoluir mantendo o visual atual. Novos módulos devem utilizar componentes, estilos e padrões existentes.

Priorize consistência visual, navegação intuitiva, clareza das informações, formulários objetivos, tabelas legíveis, filtros úteis, dashboards organizados, gráficos adequados, feedback claro de sucesso e erro, estados de carregamento e vazios, responsividade e acessibilidade.

Evite telas excessivamente carregadas. Não utilize gráficos apenas como decoração. Cada indicador deve ter significado claro e representar dados calculados corretamente.

Dashboards devem respeitar o perfil e o escopo de dados permitido.

## 11. Regras de cálculo e integridade

Centralize fórmulas em serviços ou funções de domínio, não espalhadas entre componentes visuais e rotas.

Os cálculos devem ser reproduzíveis, testáveis, documentados, consistentes, independentes da interface e compatíveis com os dados históricos.

Não confie em valores calculados pelo navegador para registrar resultados oficiais. O backend deve validar e executar os cálculos.

Quando uma fórmula institucional não estiver disponível, registre a pendência e não invente uma regra.

Preserve o histórico de avaliações e resultados publicados. Uma mudança futura de fórmula não deve alterar silenciosamente resultados históricos.

## 12. Metodologia de trabalho

Trabalhe por etapas. Não tente implementar todo o sistema de uma só vez.

### Fase 1 — Auditoria

- Analisar o repositório.
- Mapear funcionalidades.
- Identificar componentes visuais.
- Verificar segurança.
- Avaliar banco de dados.
- Analisar testes.
- Documentar problemas e oportunidades.

Entregar diagnóstico e plano de execução. Aguardar validação antes de modificar o projeto.

### Fase 2 — Planejamento técnico

- Definir arquitetura de integração.
- Identificar componentes reutilizáveis.
- Mapear mudanças no banco.
- Definir contratos de API.
- Planejar permissões.
- Identificar dependências.
- Separar funcionalidades independentes.
- Definir testes de aceitação.

Não tomar decisões institucionais pendentes.

### Fase 3 — Segurança e estabilidade

- Corrigir vulnerabilidades identificadas.
- Corrigir falhas de autorização.
- Corrigir problemas de integridade.
- Melhorar validações.
- Corrigir erros existentes.
- Criar testes de regressão.

Preservar o comportamento legítimo do sistema.

### Fase 4 — Melhorias do módulo principal

Aprimorar funcionalidades existentes do Avaliação Suprema sem reconstruí-las. Validar cálculos, publicações, histórico, importações e permissões.

### Fase 5 — Novos módulos

Implementar incrementalmente:

1. OSCE.
2. Avaliação Docente.
3. Articulação Interdisciplinar.
4. Instrumentos complementares, conforme especificações disponíveis.

A ordem pode ser ajustada após a auditoria, desde que a justificativa seja documentada.

### Fase 6 — Testes e validação

Executar testes unitários, de integração, autorização, segurança, regressão, cálculos, interface e importação/exportação.

Não declare uma funcionalidade concluída sem validar seu comportamento.

### Fase 7 — Documentação e entrega

Atualizar README, arquitetura, modelo de dados, APIs, regras de negócio, perfis e permissões, instalação, variáveis de ambiente, backups, testes e validações.

## 13. Regras para alterações no código

Durante todo o desenvolvimento:

1. Trabalhe diretamente na base existente.
2. Preserve o visual atual.
3. Não substitua a aplicação por outra.
4. Não remova funcionalidades existentes sem aprovação.
5. Não faça migrações destrutivas.
6. Não altere fórmulas institucionais por suposição.
7. Não crie usuários ou permissões paralelas.
8. Não introduza dependências sem justificativa.
9. Não deixe código de demonstração no lugar de funcionalidades reais.
10. Não utilize dados fictícios como se fossem resultados institucionais.
11. Não ignore erros de testes.
12. Não desative verificações de segurança para contornar problemas.
13. Não declare testes aprovados sem executá-los.
14. Não substitua arquivos completos quando uma alteração pontual for suficiente.
15. Não altere a identidade visual sem necessidade funcional.
16. Não sobrescreva dados reais com dados de teste.
17. Não exponha informações sensíveis nos logs.
18. Não faça deploy ou alterações em ambientes institucionais sem autorização.

Antes de cada alteração relevante, identifique arquivos afetados e motivo da mudança.

Depois de cada etapa, informe:

- O que foi alterado.
- Quais arquivos foram modificados.
- Quais funcionalidades foram preservadas.
- Quais problemas foram corrigidos.
- Quais testes foram executados.
- Quais resultados foram obtidos.
- Quais pendências permanecem.

## 14. Critérios de aceitação

O trabalho será considerado bem executado quando:

- O sistema continuar sendo o Avaliação Suprema existente.
- A identidade visual original estiver preservada.
- As funcionalidades anteriores continuarem funcionando.
- Os novos módulos estiverem integrados à navegação e à arquitetura.
- Os perfis possuírem permissões corretas.
- Os dados estiverem isolados adequadamente.
- Os cálculos seguirem as regras institucionais.
- Os resultados publicados permanecerem íntegros.
- As vulnerabilidades identificadas tiverem sido corrigidas ou formalmente classificadas como pendentes.
- Os testes de regressão e integração estiverem aprovados.
- A documentação estiver atualizada.
- Nenhuma decisão institucional pendente tiver sido tomada unilateralmente.

## 15. Primeira tarefa: começar pela auditoria

Neste primeiro momento, **não implemente nenhuma funcionalidade**.

Analise o ZIP `Projeto-Suprema-main.zip`, o documento de especificação completa e as transcrições dos áudios.

Quero primeiro um diagnóstico técnico real do projeto.

Identifique especialmente:

1. O que já está implementado e deve ser preservado.
2. Como a interface atual está estruturada e quais elementos visuais precisam permanecer.
3. Como os módulos novos podem ser integrados sem reconstruir o sistema.
4. Quais problemas de segurança precisam ser corrigidos.
5. Quais mudanças exigem alterações no banco de dados.
6. Quais requisitos ainda dependem de decisões ou documentos institucionais.
7. Qual é a ordem mais segura e eficiente de implementação.

Apresente um plano de execução incremental, com arquivos e módulos envolvidos sempre que possível.

**Não comece a reescrever, substituir ou modificar o código antes de apresentar esse diagnóstico.**

A prioridade absoluta é evoluir o sistema existente, mantendo sua identidade visual e funcional, acrescentando as melhorias solicitadas e elevando seu nível de segurança, confiabilidade e qualidade técnica.
