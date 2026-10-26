# Operação

- Iniciar/atualizar: backup, revisar mudanças/migrações, `./scripts/up.sh` (ou CHAT_MODE=internet). Build não publica imagens. Mantenha a versão anterior local para rollback da aplicação; migrações podem impedir downgrade sem restauração.
- Parar: `./scripts/compose.sh down`; internet exige CHAT_MODE=internet no wrapper para incluir edge. Não usar `-v`.
- Estado: `./scripts/diagnose.sh`; DB/web/backend têm healthchecks. LiveKit é verificado funcionalmente por /media/state e uma chamada, não apenas PID.
- Logs: `./scripts/compose.sh logs --tail 100 backend livekit`; JSON files rotacionados 10 MB × 3 por serviço. Não habilitar DEBUG nem copiar tokens. Logs de Caddy não incluem access log por padrão.
- Métricas: `docker stats`, uso de volume/disco, tempos de resposta/erros, ICE stats no navegador. Endpoints administrativos de métricas não estão publicados. Sem serviço pago de observabilidade.

Limites atuais: 16 conexões de voz (abas contam), 4.000 unidades UTF-16/mensagem, 20 mensagens/10 s/conta, 8 logins/5 min/nome e 100/5 min/IP visto, 12 h de inatividade de sessão, lease 30 s, conexão de mídia 45 s sem heartbeat. Configuração de tela 720p/30 fps/4 Mbps, modo reduzido 480p/15 fps/1 Mbps. Não garantem qualidade ou capacidade; SFU não faz transcoding.

Internet soma mais 128 MiB de limite para edge. Limites de contêiner são tetos, não reservas nem previsão de consumo. E2-medium é candidata de 4 GiB com CPU compartilhada; builds podem exceder recursos. Construa fora da VM pequena, transfira imagens da arquitetura certa. Use `COMPOSE_PARALLEL_LIMIT=1` quando necessário.

Após queda/reinício: aguarde DB saudável/Flyway, confirme saúde, reabra frontend, teste chat e mídia. Sessões/mensagens persistem; sockets/chamadas não. A lease é reconciliada com participantes reais, órfãos são revogados. Falha de LiveKit não deve impedir histórico/chat; UI indica falha ao entrar. Mac suspenso perde chamadas; configure energia conscientemente e prefira cabo.

Manutenção: avise amigos; pare web/edge para bloquear novas escritas (backend não exposto); encerre chamadas; backup final. Veja MIGRATION. Não existe alta disponibilidade. Atualizações de dependências devem preservar verificações de assinatura/checksum/TLS e repetir suíte de riscos.

## Perfil Tailscale

Perfil privado implementado: [bootstrap, operação e rollback](TAILSCALE_SETUP.md). Usa identidade dedicada, Serve HTTPS e mídia pela interface Tailscale, sem portas publicadas no host. Testes de configuração/Compose independem de conta. Aceite real de HTTPS/ACL, OrbStack/ARM64 e carga depende do servidor e das contas externas; não foi validado no Codex sem TUN. Consulte também [critérios do plano](TAILSCALE_PLAN.md).
