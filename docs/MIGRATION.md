# Migração e rollback

Não transportar chamadas ativas. Agendar janela; avisar usuários; reduzir TTL de DNS antecipadamente. A mesma stack usa URLs/chaves configuráveis.

1. Fazer backup e restaurar em destino isolado de teste; verificar contagens, login e mensagens conhecidas. Guardar `.env`/certificados em canal seguro, fora do dump.
2. Provisionar destino somente após autorização de custos. Preparar disco, firewall, Docker, imagens da arquitetura correta e DNS temporário.
3. Restaurar cópia isolada; apagar sessões/leases; configurar segredos próprios de destino, domínio temporário e IP LiveKit. Não conectar SFU de produção antiga durante ensaio.
4. Testar HTTP, CSRF, WebSocket, conta, áudio bidirecional, tela, ICE UDP/TCP/relay e métricas. Confirmar backup remoto do destino.
5. Na janela, **bloquear novas escritas na origem**: parar web/edge/backend, encerrar mídia. DB continua só para dump. Fazer backup final; registrar contagem e último ID.
6. Restaurar final no destino, invalidar sessões, iniciar com domínio final/TLS e trocar DNS. Validar fora da rede antiga. Amigos entram novamente; chamadas anteriores não migram.
7. Manter origem parada, dados intactos e protegidos temporariamente. Não deixar duas origens aceitando escritas. Registrar ponto da troca e novas mensagens no destino.
8. Após período combinado, encerrar origem e recursos residuais conscientemente, com backup externo testado.

Rollback antes de novas escritas no destino: parar destino, restaurar DNS e iniciar origem validada. Depois de novas escritas no destino: **não apontar simplesmente para banco antigo**. Bloquear destino, gerar backup atualizado, restaurar esse estado no host antigo com versão de esquema compatível, validar, só então reabrir origem. Se downgrade de esquema não for seguro, usar versão da aplicação compatível ou reconciliar dados em tarefa específica. Exportar apenas últimas mensagens sem contas/IDs/constraints pode perder integridade. DNS em cache cria período de respostas diferentes; host antigo deve permanecer fechado até decisão clara.

Mantenha relatório de tempo de indisponibilidade, hashes dos backups, contagens/último ID e resultados. Não grave senhas/tokens nem conteúdo privado nesse relatório.
