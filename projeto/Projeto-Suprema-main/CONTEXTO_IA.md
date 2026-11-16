# Contexto para continuar este projeto com outra IA

Este arquivo resume o projeto **Avaliação Suprema** para qualquer assistente de
IA que vá trabalhar nesta mesma pasta: o que é, o que já foi feito, o que
falta e as regras que não podem ser quebradas. Leia inteiro antes de propor
qualquer mudança. Situação em 16/11/2026, versão 12.2.0.

Responda sempre em **português do Brasil**.

## 1. O que é

Sistema acadêmico de avaliação de um curso da área da saúde. Faz:

- notas de A1, A2 e A3 lançadas pelo professor, com rascunho e publicação;
- OSCE (estações práticas respondidas no ambulatório);
- Avaliação Docente, anônima, respondida pelos alunos;
- Articulação Interdisciplinar, identificada, respondida pelos alunos;
- comprovantes em PDF, com código de verificação, de cada envio do aluno.

Perfis: Administrador, Professor, Aluno, Coordenação, Núcleo de Avaliação,
CSTI (equipe de T.I., que também administra) e Usuário operacional
(ambulatório).

## 2. Onde está cada coisa

```text
AVALIACAO_SUPREMA/
  projeto/Projeto-Suprema-main/   repositório Git (este arquivo está na raiz dele)
  auditoria/AUDITORIA_TECNICA.md  documento central: diagnóstico, decisões e o resultado de cada etapa
  referencias/                    especificação, transcrições de reuniões e o prompt mestre
  backup/                         cópias da base recebida
```

Dentro do repositório, leia nesta ordem conforme a necessidade:

| Arquivo | Para quê |
| --- | --- |
| `CONTEXTO_IA.md` | Este resumo. |
| `docs/PENDENCIAS.md` | Tudo o que falta, numerado (P1 a P64): o que depende do usuário ou da instituição e o trabalho da integração. |
| `docs/INTEGRACAO.md` | Guia para unir este sistema a outro: tronco, inventário, conflitos e passo a passo. |
| `HANDOFF.md` | Histórico detalhado, etapa por etapa, com hashes e contagens. |
| `docs/ARQUITETURA.md` | Como o sistema é montado. |
| `docs/COMO_CRIAR_UM_MODULO.md` | Roteiro para acrescentar uma funcionalidade. |
| `docs/GUIA_DE_USO.md` | O que cada perfil vê e faz. |
| `packages/contracts/README.md` | Rotas da API e formatos. |
| `docs/modelagem/esquema_atual.sql` | Tabelas reais do banco (arquivo gerado). |
| `CHANGELOG.md`, `docs/VALIDACAO.md`, `docs/BACKUP.md` | Versões, testes executados, backup. |

Fora do repositório: `auditoria/AUDITORIA_TECNICA.md` (seção 9 = decisões C1 a
C48; seções "Resultado da Etapa N") e `referencias/PROMPT_MESTRE_AVALIACAO_SUPREMA.md`
(as regras originais do trabalho).

## 3. Tecnologia

- Node.js 22.16 ou superior (a máquina usa a 26), Express 5, SQLite pelo
  módulo nativo `node:sqlite`, `exceljs`. JavaScript puro: sem TypeScript, sem
  framework de interface, sem etapa de build.
- Dois processos: `apps/web/server.js` (porta 3002, arquivos da interface e
  proxy de `/api`) e `apps/api/server.js` (porta 3003).
- Formatação pelo Prettier; lint pelo ESLint, sem nenhum aviso tolerado.

```sh
npm ci                 # instalar
npm run admin          # criar o administrador em um banco vazio
npm start              # interface em http://localhost:3002
npm test               # sintaxe, lint, formato e 335 testes de servidor
npm run format         # formatar JavaScript e CSS
npm run docs:schema    # gerar docs/modelagem/esquema_atual.sql (obrigatório após migração)
python tests/browser/smoke.py   # 24 verificações de navegador (Python + Playwright)
```

## 4. Como o código é organizado

- **API:** `apps/api/src/core/` (banco, migrações, segurança, regras
  compartilhadas, formulários, comprovantes, privacidade e, em
  `core/calculo/`, as fórmulas fornecidas pela instituição) e
  `apps/api/src/modules/<nome>/` (um módulo por funcionalidade, registrado em
  `modules/index.js`). Um módulo importa `core/`, nunca outro módulo. Se um
  módulo falha ao carregar, só as rotas dele respondem 503.
- **Banco:** mudanças só por migração numerada em `core/migrations/` (001 a
  010), aplicada uma vez. Nunca editar uma migração já entregue; criar outra.
- **Autorização:** por permissão na tabela `role_permissions`, conferida com
  `can('permissao')`. Nunca comparar o nome do perfil dentro de uma rota.
- **Interface:** `apps/web/public/features/<nome>/`. Um módulo se registra nos
  pontos de extensão de `shared/ui.js` e nunca substitui função de outro
  arquivo: `SupremaModules.add(perfil, item)` (menus por perfil),
  `SupremaViews[nome]` (menu do professor) e `SupremaHooks.on(momento, fn)`
  (complementos das telas do professor e do aluno).
- **Testes:** `tests/integration/` com `node:test` e API real em banco
  descartável; `tests/browser/` com Playwright.

| Módulo | Rotas | Quem usa |
| --- | --- | --- |
| avaliacoes, planilhas, alunos, evolucao | `/api/assessment*`, `/api/student/*`, `/api/evolution` | Professor, Aluno |
| administracao, importacao-alunos | `/api/admin/*` | Administrador |
| osce | `/api/osce/*` | Núcleo de Avaliação, Usuário operacional |
| avaliacao-docente | `/api/teacher-eval/*` | CSTI, Aluno, Professor, Coordenação |
| articulacao | `/api/articulation/*` | CSTI, Aluno, Professor (tutor), Coordenação |
| comprovantes | `/api/receipts/*` | Aluno, Administrador, CSTI |

## 5. Regras que não podem ser quebradas

1. **Não reconstruir o sistema.** Evoluir a base existente e preservar a
   identidade visual.
2. **Nunca inventar fórmula, peso ou regra da instituição.** Sem a regra, o
   sistema guarda os dados brutos e não calcula. O que as planilhas da
   instituição não trazem (aprovação, classificações) não existe no sistema.
3. **Não alterar `calcScore`** (em `apps/api/src/core/domain.js`): é a fórmula
   das notas de A1, A2 e A3.
4. **Só dados fictícios** em código, testes e documentação. As referências e
   os arquivos enviados pelo usuário contêm nomes reais de alunos e tutores:
   não copiar nome, matrícula, e-mail nem credencial para lugar nenhum.
5. **Git:** uma branch por tarefa a partir da `main`; mesclar com
   `git merge --no-ff` **só quando o usuário pedir** ("Mesclar na main");
   **nunca fazer push** (não existe repositório remoto). Título do commit em
   português, sem acentos.
6. **Apresentar o plano e esperar a autorização** antes de escrever código de
   uma funcionalidade nova.
7. **Não enfraquecer teste nem segurança** para algo passar, e não declarar
   teste aprovado sem rodar. `npm test` e o teste de navegador antes de
   qualquer entrega.
8. **Não implantar em ambiente da instituição** e **não migrar para
   PostgreSQL** sem autorização. Não usar `npm audit fix --force`.
9. O banco em uso (`data/`) nunca é tocado por teste: testes usam pastas
   temporárias.
10. Avaliação Docente é **anônima**: a resposta não pode ser ligada ao aluno.
    Articulação é **identificada**. Comprovante prova a participação, **nunca o
    conteúdo**.

## 6. O que já foi feito

Plano de nove etapas, todas concluídas e mescladas na `main`:

| Etapa | Entrega |
| --- | --- |
| 0 | Ambiente e auditoria técnica da base recebida (versão 11.9.0). |
| 1 | Login: limite de tentativas por cliente, senha provisória com troca no primeiro acesso. |
| 2 | Migrações numeradas, sessões no banco, sete perfis com permissões em tabela, histórico imutável de notas. |
| 3 | HTTPS obrigatório fora da própria máquina, backup e restauração verificados, lint, CI escrita. |
| 4 | Módulo principal: importação só por matrícula, números da turma ocultos em grupo pequeno, valor máximo dos instrumentos, novos gráficos e rótulos. |
| 5 | Núcleo de formulários e OSCE (coleta; a nota veio depois do plano). |
| 6 | Avaliação Docente anônima. |
| 7 | Comprovantes em PDF com código de verificação; Articulação Interdisciplinar com exportação em planilha. |
| 8 | Código reformatado com prova de equivalência, complementos de tela registrados, esquema do banco gerado, documentação final. |

Depois do plano, em 16/11/2026: **relatório da Articulação**. O usuário enviou
a planilha de relatório da instituição ("Matriz") e as fórmulas dela foram
reproduzidas em `core/calculo/articulacao.js`: média, menor e maior nota e
percentual de Sim, Não e Parcialmente, por tutor, nas telas e em abas da
exportação. Versão 12.1.0.

Ainda em 16/11/2026: **nota do OSCE e planilha final da Articulação**. O
usuário enviou a planilha do OSCE (uma aba por estação, "Junção" e "Resultado
Final") e a planilha de resultado final da Articulação preenchida (uma aba por
tutor). As fórmulas do OSCE estão em `core/calculo/osce.js`: acertos = itens
"Fez", pela metade quando a pergunta-chave (item de postura) não é "Fez"; nota
= acertos ÷ itens, de 0 a 1; nota final = média das estações avaliadas. A
exportação da Articulação passou a ter uma aba por tutor, e ficou confirmado
que não existe número único nem classificação de tutores. Versão 12.2.0.

Estado verificado: 335 testes de servidor e 24 de navegador aprovados; `npm
audit` sem vulnerabilidades; `main` limpa.

Também em 16/11/2026 o usuário informou que **este sistema será integrado a
outro**, de mesma estrutura e com funcionalidades e códigos diferentes, por
uma pessoa responsável. O outro sistema ainda não foi visto. Foram escritos
`docs/INTEGRACAO.md` e a seção 8 de `docs/PENDENCIAS.md` (P45 a P64). Nenhum
código foi alterado para isso.

## 7. O que falta

Nada está em andamento. O que resta depende do usuário, da instituição ou da
chegada do outro sistema, e está detalhado em `docs/PENDENCIAS.md`.

**Integração com o outro sistema (P45 a P64)**

- **Falta receber (P45 a P47):** o código do outro sistema, a ficha dele
  (seção 5 de `docs/INTEGRACAO.md`) e quem decide conflitos de regra.
- **Decisões do tronco (P48 a P54):** qual núcleo fica, cadastro único de
  pessoas, senhas, perfis, banco, endereço, identidade visual.
- **Ajustes neste código (P55 a P64):** repositório remoto, nomes globais de
  `features/avaliacoes/app.js`, classe raiz nos estilos gerais, tabelas e
  rotas de mesmo nome, tabelas de base dentro das migrações, variáveis sem
  prefixo, versões. P55, P56, P57, P59, P61 e P62 não dependem do outro
  sistema e não mudam o comportamento.

**Para o usuário enviar**

- **P1 — OSCE:** a nota já é calculada pela planilha recebida. Só falta, se a
  instituição quiser, a regra de melhores e piores, de aprovação e da
  comparação entre OSCE 1 e OSCE 2, que a planilha não traz.
- **P2 — Articulação:** resolvido. A planilha final mostra que não há etapa de
  cálculo depois dela.
- **P3 — Definição de "média" do professor** na Avaliação Docente, se a
  instituição quiser uma.
- **P4 — Referência visual** do "canto superior direito" do painel do aluno.

**Para o usuário decidir**

- **P5 a P9 (reunião de 06/11):** colunas dinâmicas de múltipla escolha, link
  do gabarito, aba "total" depois da Articulação, ponto de corte por questão e
  o significado da marca de 60%.
- **P10 a P29 e P35 a P43:** padrões provisórios adotados para o trabalho não
  parar; cada um precisa ser confirmado ou corrigido.

**Infraestrutura (P19 a P24):** repositório remoto, servidor com HTTPS,
agendamento do backup com cópia externa, servidor de e-mail (futuro), banco
definitivo.

**Melhorias de código registradas (P30 a P34 e P44):** colunas fixas da tabela de
notas, SQL dentro das rotas antigas, marca de 60% em mais de um arquivo,
linhas longas de HTML dentro de texto, OSCE novo ainda sem ligação com a
coluna OSCE de A1, A2 e A3. Também registrada (P44): testes que raramente
falham com "bad port" por causa da porta sorteada; basta repetir.

## 8. Como agir em cada situação

- **Chegou uma fórmula ou planilha nova da instituição:** ler as fórmulas das
  células, reproduzi-las no servidor em arquivo isolado de `core/calculo/`
  (`osce.js` e `articulacao.js`, com `tests/integration/calculo_osce.test.js`
  e `calculo_articulacao.test.js`, são o modelo), criar testes que avaliam as
  fórmulas como uma planilha e comparam com o arquivo, recalcular a planilha
  enviada e uma exportação no Excel, e só então ligar o resultado nas telas.
  As respostas já coletadas não precisam de migração.
- **O usuário respondeu a uma pendência:** aplicar item por item, atualizar
  `docs/PENDENCIAS.md` e a seção 9 da auditoria.
- **Chegou o código do outro sistema, ou pediram um ajuste de integração:**
  seguir `docs/INTEGRACAO.md`. Não decidir nada sobre o outro sistema sem
  vê-lo; preencher primeiro a seção 5 do guia. Cada ajuste em branch própria,
  com os testes passando; os testes que travam quando o conjunto muda são
  atualizados, nunca desligados.
- **Funcionalidade nova:** seguir `docs/COMO_CRIAR_UM_MODULO.md`.
- **Mudança que deve ser só de formatação:** provar com
  `node scripts/format-equivalence.js` e `python tests/browser/css_equivalence.py`.
- **Ao terminar qualquer tarefa:** `npm run format`, `npm test`, teste de
  navegador, commit na branch da tarefa, relatório ao usuário dizendo o que
  foi verificado e o que não foi, e a pergunta sobre a mesclagem. Atualizar
  este arquivo, o `HANDOFF.md` e a auditoria quando o estado do projeto mudar.

## 9. Limites conhecidos

- O sistema nunca foi implantado em ambiente da instituição nem usado com
  dados reais; a migração de um banco antigo real não foi testada.
- A verificação automática do GitHub (`.github/workflows/ci.yml`) nunca rodou.
- No OSCE não existem nota de aprovação, lista de melhores e piores nem
  comparação entre rodadas; na Articulação não existe número único de
  desempenho por tutor nem classificação. As planilhas da instituição não
  trazem nenhum deles.
- A nota do OSCE foi conferida contra a planilha recebida (48 avaliações) e
  no Excel desta máquina com dados fictícios; nenhum OSCE real foi aplicado
  pelo sistema. O relatório da Articulação foi conferido com dados fictícios,
  não com a lista real de tutores.
- Uso em celular das telas antigas, leitor de tela e impressão não foram
  verificados.
- Anonimato da Avaliação Docente: quem comparar duas cópias do banco de
  momentos diferentes pode ligar uma resposta a um aluno, se só um respondeu
  no intervalo. O acesso aos backups deve ser restrito.

## 10. Se a IA não tem acesso aos arquivos

Este resumo basta para conversar sobre o projeto, mas não para alterar código.
Peça ao usuário o trecho necessário (por exemplo, o arquivo de rotas do módulo
e o teste correspondente) e devolva a mudança como alteração localizada, nunca
como arquivo inteiro reescrito de memória.
