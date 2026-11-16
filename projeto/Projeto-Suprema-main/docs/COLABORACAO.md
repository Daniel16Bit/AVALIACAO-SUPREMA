# Trabalho de duas pessoas

## Primeiro uso

Cada pessoa clona o mesmo repositório e executa `npm ci` no seu computador.
O banco local não é compartilhado pelo Git. Em um clone novo, use `npm run admin`
e cadastre somente os dados necessários ao desenvolvimento. Se usarem o banco
de demonstração do ZIP original, cada um trabalha em uma cópia.

## Divisão sugerida

Pessoa 1 mantém `apps/web`: HTML, componentes, estilos, acessibilidade e estados
de erro. Pessoa 2 mantém `apps/api`: banco, permissões, regras, importação e rotas.
`packages/contracts`, `packages/http`, scripts e configurações gerais devem ser
revisados pelas duas pessoas. A divisão é uma orientação; não depende de nomes
de usuários fixos ou de credenciais individuais.

## A cada tarefa

```sh
git switch main
git pull --ff-only
git switch -c feature/nome-da-tarefa
# editar a área correspondente
npm run format   # formato de JavaScript e CSS, exigido pelo npm test
npm test
git add apps/web   # ou os arquivos da sua tarefa
git commit -m "Descreve o comportamento alterado"
git push -u origin feature/nome-da-tarefa
```

Abra um pull request para `main` e peça revisão da outra pessoa. Antes de
incorporar mudanças de contrato, atualizem sua documentação e os testes das
duas partes. Evitem editar o mesmo arquivo compartilhado na mesma tarefa.
Sincronizem branches com frequência. Em conflitos, comparem o comportamento
pretendido e executem os testes após resolver; não substituam pastas inteiras.

## Desenvolvimento separado

Em um terminal, `npm run start:api`. Em outro, `npm run start:web`.
Ou use `npm start` para iniciar ambos. Se um processo cair, o outro permanece.
Corrija o lado afetado e reinicie-o pelo seu comando. Não inicie duas cópias
do mesmo serviço na mesma porta.

A pessoa da interface pode apontar `API_URL` para a API de integração ou para
uma API em outra máquina. Não versionem `.env`, bancos ou backups. Uma mesma
instância de API já suporta os sete perfis de usuário e rejeita gravações de
notas com revisão antiga. Isso continua necessário quando os dois desenvolvem
ou testam o mesmo contexto acadêmico.

## Publicação e proteção de main

Use os checks de `.github/workflows/ci.yml` antes de integrar. Nas configurações
do GitHub, é possível exigir aprovação e checks para `main`. O projeto inclui
a automação, mas as regras de proteção do repositório não são alteradas por
esta refatoração. Em produção, mantenham uma única instância de API por banco
local e serviços separados para web/API, com backups em destino externo.
