# Operação

- Iniciar/atualizar: backup, revisar mudanças/migrações, `./scripts/up.sh` (ou CHAT_MODE=prd). Build não publica imagens. Mantenha a versão anterior local para rollback da aplicação; migrações podem impedir downgrade sem restauração.
- Parar: `./scripts/compose.sh down`; internet exige CHAT_MODE=prd no wrapper para incluir edge. Não usar `-v`.
- Estado: `./scripts/diagnose.sh`; DB/web/backend têm healthchecks. LiveKit é verificado funcionalmente por /media/state e uma chamada, não apenas PID.
- Logs: `./scripts/compose.sh logs --tail 100 backend livekit`; JSON files rotacionados 10 MB × 3 por serviço. Não habilitar DEBUG nem copiar tokens. Logs de Caddy não incluem access log por padrão.
- Métricas: `docker stats`, uso de volume/disco, tempos de resposta/erros, ICE stats no navegador. Endpoints administrativos de métricas não estão publicados. Sem serviço pago de observabilidade.

Limites atuais: 16 conexões de voz (abas contam), 4.000 unidades UTF-16/mensagem, 20 mensagens/10 s/conta, 8 logins/5 min/nome e 100/5 min/IP visto, 12 h de inatividade de sessão, lease 30 s, conexão de mídia 45 s sem heartbeat. Tetos padrão de tela 1080p/60 fps/8 Mbps, com opções 1080p/30 fps, 720p/30 fps/4 Mbps e 480p/15 fps/1 Mbps. Instalações existentes precisam ajustar SCREEN_HEIGHT/SCREEN_BITRATE para habilitar Full HD. Não garantem qualidade ou capacidade; SFU não faz transcoding.

Internet soma mais 128 MiB de limite para edge. Limites de contêiner são tetos, não reservas nem previsão de consumo. E2-medium é candidata de 4 GiB com CPU compartilhada; builds podem exceder recursos. Construa fora da VM pequena, transfira imagens da arquitetura certa. Use `COMPOSE_PARALLEL_LIMIT=1` quando necessário.

Após queda/reinício: aguarde DB saudável e o job de migração durante atualizações, confirme saúde, reabra frontend, teste chat e mídia. Sessões/mensagens persistem; sockets/chamadas não. A lease é reconciliada com participantes reais, órfãos são revogados. Falha de LiveKit não deve impedir histórico/chat; UI indica falha ao entrar. Mac suspenso perde chamadas; configure energia conscientemente e prefira cabo.

Manutenção: avise amigos; pare web/edge para bloquear novas escritas (backend não exposto); encerre chamadas; backup final. Veja MIGRATION. Não existe alta disponibilidade. Atualizações de dependências devem preservar verificações de assinatura/checksum/TLS e repetir suíte de riscos.

## Dev e prd

`dev` é o padrão local. Em produção, usar `CHAT_MODE=prd` em up, admin, compose, backup, restore e diagnose. `CHAT_ACME_STAGING=true` apenas seleciona a CA de teste dentro de prd. Trocas reais entre dev/prd exigem backup, parada e `CHAT_ALLOW_MODE_CHANGE=true` no configure; o arquivo `.env` deve corresponder ao destino. Nunca apagar volumes para trocar de modo.

Para DuckDNS em prd, seguir [ativação e operação](DUCKDNS_SETUP.md): DNS-01, HTTPS/WSS :18443, atualização do IP, LaunchAgent e rollback. O job já instalado passa a usar prd após atualizar os scripts; não contém o modo antigo no plist. Diagnóstico interno não comprova WAN, e logs não devem conter token.

Atualização de áudio: a migração Flyway V2 adiciona apenas o estado `deaf` às conexões de mídia. Fazer backup antes de atualizar; preferir rollback da aplicação com o esquema aditivo preservado, sem remover coluna ou volumes. Configurações pessoais de volume ficam no localStorage do navegador por conta, não no backup do banco.

Para atualizar a instalação com privilégios separados, MFA e recuperação, siga [o procedimento de segurança](SECURITY_UPGRADE.md) antes do próximo deploy. Preserve `generated/runtime.env` e a chave MFA junto ao backup criptografado.
