# Como criar um módulo novo

Roteiro para acrescentar uma funcionalidade sem mexer nas que existem. Os
módulos OSCE, Avaliação Docente, Comprovantes e Articulação seguem este
roteiro e servem de exemplo. A visão geral está em
[Arquitetura](ARQUITETURA.md).

## 1. Banco: uma migração

Crie `apps/api/src/core/migrations/NNN-nome.js`, com o próximo número, e
acrescente-o à lista em `core/migrations/index.js`.

```js
module.exports = {
  id: '011-exemplo',
  up(db) {
    db.exec(`
      CREATE TABLE exemplo_itens (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);
      INSERT OR IGNORE INTO role_permissions(role, permission) VALUES ('CSTI', 'exemplo.manage');
    `);
  }
};
```

- Só acrescente: nunca apague nem reescreva notas, publicações, senhas ou
  histórico.
- Não abra transação dentro de `up`: a inicialização inteira já é uma.
- Nunca edite uma migração que já foi entregue; crie outra.
- As permissões do módulo nascem aqui, na tabela `role_permissions`.
- Depois, rode `npm run docs:schema` para atualizar
  `docs/modelagem/esquema_atual.sql`.

## 2. Servidor: rotas e SQL separados

Crie a pasta `apps/api/src/modules/exemplo/` com dois arquivos:

- `store.js`: todo o SQL do módulo, em funções que recebem `db`.
- `routes.js`: as regras. Exporta uma função que recebe `{app, db, auth, can,
  hasPermission}` e registra as rotas.

```js
module.exports = function installExemploRoutes({app, db, auth, can}) {
  app.get('/api/exemplo/itens', [auth, can('exemplo.manage')], (req, res) => res.json(S.list(db)));
};
```

Registre o módulo em `apps/api/src/modules/index.js`, com as rotas que são
dele:

```js
{id: 'exemplo', owns: /^\/api\/exemplo(?:\/|$)/, load: () => require('./exemplo/routes')}
```

Regras:

- Autorize por **permissão** (`can('exemplo.manage')`), nunca comparando o nome
  do perfil.
- Um módulo importa `core/`, nunca outro módulo. `npm run check` recusa.
- Gravações usam `D.transaction` e registram `D.audit`.
- Se o aluno envia algo, chame `Receipts.issue` dentro da mesma transação, para
  o comprovante nascer junto com o envio. O comprovante nunca leva o conteúdo.
- Formulários de Sim, Não e Não se aplica podem usar `core/forms.js`
  (identificado ou anônimo). Outros tipos de resposta pedem tabelas próprias.
- **Não invente fórmula.** Sem a regra da instituição, entregue a coleta e os
  números brutos e marque o resultado como indisponível.

Se o módulo falhar ao carregar, só as rotas dele respondem 503; o resto do
sistema continua.

## 3. Tela: registrar, nunca substituir

Crie `apps/web/public/features/exemplo/exemplo.js` (e `exemplo.css`, se
precisar) e acrescente as duas linhas ao `index.html`, antes de
`features/avaliacoes/app.js`.

| Onde aparece | Como registrar |
| --- | --- |
| Menu de CSTI, Coordenação, Núcleo, conta operacional ou Administrador | `window.SupremaModules.add('CSTI', {label, glyph, start(container)})` |
| Barra lateral do aluno | `window.SupremaModules.add('ALUNO', {boot(slot)})`; a tela é desenhada em `#studentModuleView` |
| Menu do professor | `window.SupremaViews['Nome do item'] = {render(container)}`, com um item `.nav-item.dev` no `index.html` |
| Complemento de uma tela do professor ou do aluno | `window.SupremaHooks.on('teacher.results', fn)` e os outros momentos descritos em `shared/ui.js` |

- Desenhe só dentro do contêiner recebido e não leia nem troque variáveis de
  outros arquivos.
- Use os utilitários de `window.SupremaUI` (`esc`, `toast`, `guard`, `panel`,
  `table`, `modal`, `when`) e os estilos de `styles/modulos.css` (classe
  `.mod-root`). Todo texto vindo do servidor passa por `esc`.
- A tela chama a API por `window.SupremaAPI.request`.

## 4. Testes

- `tests/integration/exemplo.test.js`, com `node:test` e as fixtures de
  `tests/fixtures/` (API real em banco descartável). Cubra: quem pode e quem
  não pode, cada validação, o que não pode ser alterado e o que fica fora do
  resultado.
- Acrescente o arquivo a um script `test:...` do `package.json` e ao `npm test`.
- `tests/integration/perfis.test.js` confere a lista **exata** de permissões de
  cada perfil: atualize-a junto com a migração.
- Um fluxo de ponta a ponta em `tests/browser/smoke.py`.
- **Só dados fictícios.** Nenhum nome, matrícula, e-mail ou credencial real em
  código, testes ou documentação.

## 5. Antes de entregar

```sh
npm run format      # formata JavaScript e CSS
npm run docs:schema # se houve migração
npm test            # tudo, inclusive lint e formato
python tests/browser/smoke.py
```

Atualize o [README](../README.md), os [contratos](../packages/contracts/README.md)
e a tabela de módulos e de permissões em [Arquitetura](ARQUITETURA.md).

Para provar que uma mudança foi só de formatação:
`node scripts/format-equivalence.js` (JavaScript) e
`python tests/browser/css_equivalence.py` (CSS) comparam com o último commit.
