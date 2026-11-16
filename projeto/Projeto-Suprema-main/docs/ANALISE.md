# Análise da base e decisões

## Constatações

- A versão ativa recebe Express e SQLite nativo de Node.js. `VERSAO.json` e
  scripts de servidor antigos ainda descreviam PostgreSQL.
- A raiz misturava aplicação, patches instalados, cópias anteriores, relatórios,
  scripts operacionais e `node_modules` distribuído no ZIP.
- `server.js` carregava todos os módulos de rotas diretamente e também servia
  a interface. Uma falha de carregamento impedia a inicialização do conjunto.
- A interface já possuía arquivos de funcionalidades, porém todos misturados
  em `public` e com funções de chamada HTTP repetidas.
- `05_SERVIDOR/iniciar.js` chamava `.catch` em um retorno síncrono e o backup
  usado por testes antigos encaminhava para PostgreSQL.
- Testes antigos esperavam apenas A1/A2, enquanto a regra ativa também gera A3.
  O teste original de preservação falhava ao encontrar os registros aditivos
  criados na sincronização dos vínculos do banco de demonstração.

## Alterações

Dois processos independentes, proxy com mesma origem, módulos de API carregados
isoladamente, pastas por funcionalidade, cliente HTTP comum e aviso de conexão.
Os contratos HTTP de negócio foram mantidos. O backup foi implementado usando
a API de backup do SQLite e validação da cópia. Documentação e CI refletem o
servidor ativo, sem manter migração PostgreSQL no caminho de execução.

Os testes de preservação agora comparam todos os registros preexistentes,
permitindo acréscimos da sincronização original. As contagens de avaliações
foram atualizadas para A1/A2/A3. As verificações de recursos estáticos passaram
para o lado web; a suíte da API verifica sua independência de arquivos da tela.
Nenhuma expectativa de autorização, nota, publicação ou concorrência foi relaxada.

## Continuidade

O núcleo de domínio concentra regras usadas por vários módulos e exige revisão
conjunta. O código de negócio recebido continua compacto em vários arquivos;
foi reorganizado com mudanças limitadas de comportamento, evitando reescrever
as regras acadêmicas junto da separação de processos. Os módulos continuam
compartilhando banco e processo: mais isolamento exigiria serviços e contratos
de dados próprios, além de outra estratégia de consistência.

Consulte `VALIDACAO.md` para o resultado efetivamente executado. Scripts Windows,
rede física da instituição, TLS com certificado institucional e gerenciador de
serviços do servidor de destino exigem homologação naquele ambiente.
