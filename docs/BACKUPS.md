# Backups do banco do Copy News

- Serviço de produção: `copynews-db-backup`.
- Frequência: uma execução por dia; a primeira acontece ao iniciar o serviço.
- Formato: `pg_dump` custom (`.dump`).
- Destino: volume Docker separado `copynews-db-backups`.
- Retenção local: 7 dias.
- Validação: cada arquivo passa por `pg_restore -l`; somente depois recebe o estado `restore_verified` em `database_backup_runs`.
- Credencial: Docker secret `copynews_db_backup_password`, nunca incorporada à imagem ou ao frontend.
- Painel: Configurações → Configuração de backend → Backup do banco.

O backup local protege contra exclusões e corrupção lógica. Para desastre total da VPS, deve-se acrescentar posteriormente uma cópia criptografada fora do servidor.
