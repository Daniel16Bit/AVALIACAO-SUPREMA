# Backup e restauração

O banco é um arquivo único (`data/avaliacao_suprema.db`). Este roteiro cobre a
cópia agendada, a retenção e a restauração.

## O que o backup faz

```sh
npm run backup
```

- Pode ser executado **com o sistema em uso**: a cópia é consistente e inclui as
  transações já confirmadas.
- Cria uma pasta `BACKUP_NNN` em `backups/` (ou em `SUPREMA_BACKUP_DIR`) com o
  banco e um arquivo `backup.json` (data, tamanho, hash SHA-256 e versão do
  banco). Esse arquivo não contém dados pessoais.
- A cópia é aberta e verificada (`integrity_check`) antes de ser considerada
  válida. Se algo falhar, a pasta é removida e o comando termina com código de
  saída 1, para o agendador registrar a falha.
- A numeração só cresce: o número maior é sempre o backup mais recente, mesmo
  depois de a retenção apagar os antigos.

## Retenção

Depois de cada backup bem-sucedido, o comando mantém os **30 mais recentes** e
apaga os anteriores. Para mudar, defina `SUPREMA_BACKUP_KEEP` em `.env`:

| Valor | Efeito |
| --- | --- |
| não definido | mantém 30 (padrão provisório: com um backup por dia, cerca de um mês) |
| um número inteiro, por exemplo `60` | mantém essa quantidade |
| `0` | não apaga nada |

A retenção só apaga pastas `BACKUP_NNN` que contenham apenas os arquivos do
backup. Uma pasta com qualquer outro arquivo é preservada e citada na saída.

> A quantidade e o prazo de guarda são decisão da instituição. O padrão acima é
> provisório.

## Agendamento

O agendamento fica no sistema operacional; o sistema não tem agendador interno.
Ajuste os caminhos e o horário.

**Windows (Agendador de Tarefas)**, todos os dias às 02:00:

```bat
schtasks /Create /TN "Avaliacao Suprema - backup" /SC DAILY /ST 02:00 ^
  /TR "cmd /c cd /d C:\caminho\do\projeto && npm run backup >> C:\caminho\logs\backup.log 2>&1"
```

**Linux (cron)**, todos os dias às 02:00:

```cron
0 2 * * * cd /caminho/do/projeto && npm run backup >> /var/log/suprema-backup.log 2>&1
```

Confira periodicamente o registro e a data do último `BACKUP_NNN`. Um comando
que termina com código diferente de zero não gerou backup.

## Onde guardar

Um backup no mesmo disco do banco não protege contra a perda do disco ou do
servidor. Aponte `SUPREMA_BACKUP_DIR` para outro disco ou para uma pasta que
seja copiada para fora do servidor. O envio para fora do servidor **não** é
feito por este sistema e precisa ser definido com a TI da instituição.

Trate as cópias com o mesmo cuidado do banco: elas contêm os dados dos alunos e
os hashes de senha.

## Restauração

1. **Desligue a interface e a API.** A restauração recusa continuar se a API
   responder.
2. Verifique o backup sem alterar nada:

   ```sh
   npm run restore -- backups/BACKUP_042
   npm run restore -- --ultimo
   ```

   O comando confere o hash registrado, a integridade do banco e se o backup
   não é de uma versão mais nova que a do sistema instalado.
3. Restaure, repetindo o comando com `--confirmar`:

   ```sh
   npm run restore -- backups/BACKUP_042 --confirmar
   ```

4. Inicie o sistema (`npm start`) e confira o acesso.

O que acontece na restauração:

- O banco que estava em uso é copiado antes para `data/pre-restauracao/`. Essas
  cópias não são apagadas automaticamente.
- O backup é copiado e conferido pelo hash antes de substituir o banco.
- Se o backup for de uma versão anterior do banco, o sistema aplica as
  atualizações pendentes na próxima inicialização (e guarda a cópia habitual em
  `data/pre-migracao/`).
- Tudo o que foi lançado **depois** da data do backup deixa de existir no banco
  restaurado, inclusive o histórico de notas desse intervalo. Ele continua
  apenas na cópia de `data/pre-restauracao/`.

Para restaurar em um servidor novo: instale o sistema (`npm ci`), defina
`SUPREMA_DATA_DIR` se necessário e siga os passos 2 a 4. A pasta de dados pode
estar vazia.

## Teste de restauração

A restauração é verificada pelos testes automatizados
(`tests/integration/backup.test.js`): restauração em pasta limpa com os mesmos
dados e login funcionando, restauração sobre um banco existente, e recusa de
backup corrompido, truncado ou de versão mais nova. Isso não substitui um ensaio
periódico com um backup real do ambiente institucional, em uma máquina separada.
