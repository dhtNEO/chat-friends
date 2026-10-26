# Diagnóstico

| Sintoma | Verificação e próximo passo |
|---|---|
| Login 403 | GET /api/csrf antes/depois de login; cookie e header; mesma origem; não desativar CSRF |
| Login 429 | aguardar janela 5 min; limite por usuário e IP do proxy compartilhado |
| WebSocket recusa | cookie válido, APP_ORIGIN igual a origem real (esquema/porta), proxy com Upgrade |
| Chat reaparece após retry | UUID deve ser reutilizado; o servidor deduplica; confira erro 409 se corpo mudou |
| API retorna “Domain forbidden” em cloud | proxy herdado pode interceptar serviço interno; NO_PROXY/no_proxy de web/livekit deve incluir backend/db/livekit/web |
| Build Maven sem DNS | usar proxy configurado e CA confiável do ambiente; Docker pode precisar resolver host do proxy; não alterar checksum/TLS |
| LiveKit 503 | serviço, chave/segredo e URL interna; logs sem token; API de participante deve responder; não liberar nova tela sem revogação |
| Voz conecta sem som | permissões, mic mute, recepção silenciada, autoplay, input correto, RTCStats/candidate pair |
| Tela funciona sem áudio | limitação de navegador/SO/fonte; teste aba com som; vídeo continua sendo funcional |
| Voz fica conectando mesmo com sinalização/portas acessíveis | confira `enable_loopback_candidate: false` no LiveKit em Docker; execute `./scripts/configure.sh` e `./scripts/compose.sh restart livekit` (encerra chamadas), prefixando ambos com `CHAT_MODE=prd` em produção. O teste `tests/ice.spec.ts` valida respostas ICE autenticadas em UDP/TCP; não publicar SDP/tokens |
| ICE falha fora de casa | IP anunciado, portas UDP/TCP, roteador/macOS/VM, CGNAT; túnel HTTP não resolve UDP |
| Backend unhealthy | DB saudável, migrações, log; health.sh legível pelo UID 10001; memória disponível |
| Troca de senha do banco falha | `.env` não altera senha em volume já inicializado; ALTER ROLE seguro e credencial correspondente |
| Lease persiste após queda | aguardar 30–45 s + reconciliação; LiveKit indisponível exige recuperar SFU; admin force-stop falha fechado se não pode revogar |
| Certificado inválido | DNS/horário/ACME, portas 80/443, cadeia completa e persistência de /data; não usar -k como correção |

Use `scripts/diagnose.sh`; nunca colar `.env`, `docker inspect` completo, `compose config` expandido ou dumps de sessão. `compose config -q` valida sem imprimir segredos. HTTP 200 da página prova frontend, não WebRTC. Teste chamada de outra rede e confirme frames/áudio recebidos.

## Falha de sinalização com CSP em produção

Se o console bloquear `https://DOMINIO-MIDIA:PORTA/rtc/v1/validate` por `connect-src`, reconstrua o serviço web com o Compose atualizado. Em prd, `MEDIA_CONNECT_SRC` permite HTTPS e WSS somente no domínio/porta de mídia configurados. O SDK consulta `/validate` quando o WebSocket inicial falha; essa resposta pode permitir o fallback de protocolo. Bloquear a consulta esconde o motivo original e pode impedir o fallback. Não é necessário liberar `https:` para qualquer destino.

Se persistir após a correção, confira no painel Network o status da sinalização e valide certificado/DNS/acesso externo ao domínio de mídia. Não compartilhar URLs com `access_token`.
