# Backup e restauração

`./scripts/backup.sh` usa pg_dump formato custom, saída temporária renomeada somente após sucesso, umask 077. O caminho é impresso, não o conteúdo. Dump contém hashes de senha, mensagens e sessões: é dado sensível. Sem exclusão automática.

```bash
./scripts/backup.sh
```

Copie criptografado para outro disco/host sob controle do proprietário. Sugestão de retenção: 7 diários + 4 semanais, só excluir após verificar cópia e uma restauração. Backup no mesmo Mac/disco não protege contra perda física. Registre checksum e data sem publicar dump. Guarde `.env` e certificados separadamente, criptografados; dump não inclui segredos/configuração.

## Teste isolado (sem apagar a origem)

```bash
./scripts/compose.sh exec -T db sh -c 'createdb -U "$POSTGRES_USER" friends_restore_check'
./scripts/compose.sh exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d friends_restore_check --exit-on-error --single-transaction' < backups/ARQUIVO.dump
./scripts/compose.sh exec -T db sh -c 'psql -U "$POSTGRES_USER" -d friends_restore_check -c "SELECT count(*) FROM messages; SELECT count(*) FROM accounts;"'
```

Compare contagens e, em ambiente isolado, confirme login/histórico com a versão compatível. O banco de teste pode ser removido após verificar; não confunda os nomes. Nunca publique os dados da cópia. Restauração full-app exige apontar uma instância isolada e segredos adequados, evitando webhooks da SFU da origem.

## Recuperação real

Avise usuários e verifique backup legível. `CONFIRM_RESTORE=REPLACE_DATABASE ./scripts/restore.sh backups/ARQUIVO.dump` para web/backend/livekit, restaura transacionalmente com `--clean --if-exists`, apaga sessões/conexões/leases e reinicia. A variável é uma confirmação explícita de substituição; não é dry-run. Se restaurar falhar, serviços permanecem parados para diagnóstico. No modo prd use CHAT_MODE=prd; edge pode servir erro enquanto web está parado, sem novas escritas.

Teste novamente saúde, login, leitura de mensagem conhecida, nova mensagem, chamada. Sessões antigas serão invalidadas. Não restaura chamadas ativas. Dados posteriores ao backup serão perdidos se não forem reconciliados antes da substituição. Procedimento de migração/rollback em MIGRATION.

## Bundle autenticado de dados e configuração

`CHAT_MODE=prd ./scripts/backup-encrypted.sh` reúne dump, `.env`, credenciais separadas/chave MFA, estado de rede/DuckDNS e certificados existentes, quando o edge está ativo. Usa AES-256-GCM e scrypt (N=32768, r=8, p=1, salt aleatório), frase digitada de pelo menos 16 caracteres e arquivo temporário privado; nunca passa a frase em argv. O texto claro temporário é removido ao fim. Criptografia não protege contra um Mac já comprometido enquanto o backup é criado.

`./scripts/open-backup.sh backups/arquivo.cfbackup` autentica e descriptografa para um diretório privado novo. Não extrai nem substitui configuração automaticamente. Inspecione o tar, extraia somente um bundle próprio confiável em pasta privada e ensaie primeiro em instalação isolada. Restaure a configuração e a **mesma chave MFA** antes de restaurar `database.dump` pelo procedimento acima. Na versão nova, `restore.sh` também reprovisiona privilégios/migrações e invalida sessões/conexões. Proteja/remova a cópia descriptografada quando terminar. Sem a frase não há recuperação criptográfica.

Veja [atualização de segurança](SECURITY_UPGRADE.md) para backup anterior à primeira migração, recuperação do operador e aceite do Mac. Testes automatizados cobrem round trip, senha incorreta e adulteração sem confirmar um arquivo de saída; a cópia externa e o ensaio completo no seu hardware continuam manuais.
