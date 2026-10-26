# Estado da implementação — atualizado em 26/10/2026 (America/Sao_Paulo)

Implementação executável no checkout `/workspace/chat-friends`, em Linux AMD64/Docker no Codex. Não foi usado o Mac do proprietário. **Não declarar o aceite completo de mídia ou prontidão para exposição pública irrestrita.** Não houve contratação, conta cloud, apply Terraform, publicação de imagem ou publicação do ambiente.

## Entregas

- Backend Java 25/Spring Boot 3.5.16; Maven Wrapper 3.9.11 com checksums de distribuição/JAR; Flyway/PostgreSQL, sessões persistentes, BCrypt, CSRF, limites, contas/admin e invalidação de sessões.
- Chat com ACK depois do commit, UUID idempotente, cursor serializado por transação, WebSocket autenticado, origem exata, recuperação após reconexão e presença por conta.
- UI em português, desktop/mobile, foco, controles de voz, entrada de áudio, recepção silenciada, indicação de fala, captura de tela/áudio opcional, qualidade reduzida e fullscreen. Capturas reais em USER_GUIDE, apenas dados sintéticos.
- LiveKit real, JWT restrito, identidades por aba/sessão, lease atômica de tela, expiração, revogação, webhooks assinados e reconciliação. Proxy de admissão verifica sessão e substitui tokens de conexão por grants só de microfone, inclusive ao receber JWT elevado antigo.
- Compose local/internet, configuração/credenciais geradas, TURN opcional com certificados externos, administrador idempotente, backup/restore e diagnóstico. Sem exposição do banco/API administrativa LiveKit.
- Terraform GCP e guia Oracle ARM, roteiro de migração/rollback, custos parametrizados, CI de backend/frontend/stack/infra/segredos/dependências e build multiarch manual sem push.

## Evidências executadas

| Check | Resultado |
|---|---|
| Docker builds backend/web, Linux AMD64 | passaram; Java 25.0.3 no runtime, LiveKit 1.9.12 |
| Maven Wrapper `./mvnw -B -ntp verify`, banco PostgreSQL real separado | **15 passaram, 0 falharam, 0 pulados** |
| `npm run lint`, `npm run build` (TypeScript + Vite) | passaram; aviso de bundle >500 kB (SDK de mídia), não erro |
| Playwright: login/logout, persistência/XSS como texto, realtime/admin/desativação, viewport móvel | **3 passaram** |
| Playwright: JWT elevado passando pelo Caddy/SFU real, retorno de permissão só microfone; sessão expirada recusada | **1 passou** |
| Suíte original completa após corrigir candidatos ICE no Docker | **7 passaram, 0 falharam**; inclui áudio sintético bidirecional, recusa de microfone e recepção/parada de vídeo |
| Suíte completa com regressão de transporte ICE | **8 passaram, 0 falharam**; verifica STUN autenticado em UDP/TCP. Controle negativo com configuração antiga: falha nas duas portas; configuração corrigida: passa |
| HTTP `/api/health` através de Caddy + saúde DB/backend/web | passou |
| `scripts/backup.sh`, `scripts/test-backup.sh` e `scripts/restore.sh` | restauração isolada e restauração completa da stack de teste passaram; 5 mensagens preservadas na restauração completa, sessões invalidadas e serviços reiniciados |
| `docker compose config -q`, local e internet | passaram |
| Terraform 1.13.5 `init -backend=false`, `fmt -check`, `validate` | passaram; nenhum apply ou plano autenticado |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades reportadas na execução |
| Trivy 0.68.1, manifests/segredos, HIGH/CRITICAL | inicialmente CVE-2026-54291 em JDBC 42.7.11; corrigido para **42.7.12**; nova execução: 0 HIGH/CRITICAL, 0 segredos reportados |

Trivy avisou que parte de dependências Maven herdadas não pôde ser inferida do POM. O resultado não é auditoria exaustiva de todas as transitivas e camadas das imagens. CI inclui nova varredura; advisories mudam. O CI remoto executou e apresentou as três falhas de mídia relatadas pelo proprietário; o resultado remoto após esta correção ainda precisa ser confirmado. Build multiarch não foi executado; o YAML não é evidência de execução.

Comandos cloud usaram configuração explícita de proxy/CA confiável, sem desligar TLS/checksums. Primeiro wrapper only-script falhou porque trocava ZIP por tar.gz quando não havia unzip; foi substituído pelo wrapper oficial bin/Java, mantendo verificação do ZIP oficial. Build cache descartável foi limpo quando o disco encheu; fontes/volumes foram preservados.

## Correção da falha de mídia no CI

A atribuição inicial das falhas à política do Chromium estava incompleta. `enable_loopback_candidate: true` criava também um socket na interface loopback do container, enquanto Docker encaminhava as portas para a interface de rede. Com o mapeamento para `node_ip`, o handshake ICE não recebia resposta, inclusive por TCP. Uma porta TCP aberta não comprova ICE funcionando.

O gerador agora define `enable_loopback_candidate: false`. O IP anunciado ao cliente continua sendo `LIVEKIT_NODE_IP` (127.0.0.1 no perfil local). Antes da correção, probes STUN autenticados por UDP e TCP expiravam; depois, ambos receberam Binding Success. Os sete testes originais passaram, incluindo áudio e tela sintéticos entre duas conexões. O teste adicional de regressão verifica a integridade das respostas STUN nas duas portas e imprime somente estados de transporte para diagnóstico.

A política gerenciada `WebRtcIPHandling=disable_non_proxied_udp` foi preservada. A validação de mídia no browser usa o fallback TCP; o probe UDP nativo verifica separadamente a SFU. Isso não comprova mídia UDP no browser, áudio de sistema, acesso externo ou capacidade para 16 pessoas.

## Requisitos ainda abertos

1. **Exclusividade adversarial estrita de tracks:** duas reservas concorrentes são protegidas, e replay de JWT elevado é reduzido pela admissão. Um publicador malicioso já autorizado ainda pode tentar múltiplas tracks da mesma fonte; remoção é por reconciliação, não proibição atômica na SFU. SECURITY detalha a janela. Não apresentar esse requisito como completamente atendido.
2. Teste real de voz/tela em duas redes e de áudio de compartilhamento por navegador/OS; macOS M4 Pro/OrbStack, Windows e ARM64 não foram executados. Validação humana de acessibilidade/contraste ainda recomendada.
3. Medições progressivas 2/4/8/16 participantes de mídia, upload/CPU/RAM/RTT/perda. Sem alegação de capacidade de 16 pessoas ou e2-medium. Estatísticas ociosas do container não são benchmark.
4. LAN/HTTPS público, DNS, CGNAT, roteador/macOS/VM/UDP e TURN/TLS com certificado real e renovação. Nenhum acesso externo pago foi configurado.
5. Cota/preço comercial corrente: cloud.google.com, docs.oracle.com e docs.livekit.io retornaram 403 de política de rede. Planilha/fórmulas entregues; tarifas/cotas não revalidadas. Sem estimativa monetária fabricada.
6. Rehearsal completo de migração/rollback em outro host e restauração de um snapshot cloud em nova tarefa não executados. Guia entregue.
7. Confirmar intenção de licença do código novo: GPL-3.0 preexistente preservada. Não publicar até decisão do proprietário.

## Próximo passo

No Mac, `./scripts/up.sh`, `./scripts/admin.sh admin`, testes de mídia e checklist NETWORKING. Somente depois avaliar acesso dos amigos e capacidade. Confirmar o novo resultado do CI remoto e repetir a suíte completa no Mac com credenciais de teste seguras. Resolver a limitação de múltiplas tracks antes de afirmar exclusividade adversarial estrita.

## Handoff do ambiente

Script de instalação cloud com proxy/CA e start_skill foram executados/salvos em draft. Isso não publica o ambiente nem comprova restauração em outra tarefa. Stack atual saudável; contas/mensagens sintéticas e credenciais temporárias removidas após conferir que somente os fixtures desta implementação existiam. Primeiro administrador real deve ser criado por `scripts/admin.sh admin`. Capturas de interface usam apenas os fixtures anteriores.

O draft também inclui acesso a cloud.google.com, docs.cloud.google.com, docs.oracle.com e docs.livekit.io para revalidar preços/cotas. A gravação não aplica a política ao runtime nem valida os sites: revisar/salvar nas configurações do ambiente e publicar quando apropriado; depois repetir consultas oficiais.

## Perfil Tailscale

Perfil privado implementado: [bootstrap, operação e rollback](TAILSCALE_SETUP.md). Usa identidade dedicada, Serve HTTPS e mídia pela interface Tailscale, sem portas publicadas no host. Testes de configuração/Compose independem de conta. Aceite real de HTTPS/ACL, OrbStack/ARM64 e carga depende do servidor e das contas externas; não foi validado no Codex sem TUN. Consulte também [critérios do plano](TAILSCALE_PLAN.md).

## DuckDNS e IPv4 público

Atualizador, bootstrap, ACME staging isolado e LaunchAgent implementados: [guia DuckDNS](DUCKDNS_SETUP.md). Atualiza DNS e IP anunciado pelo LiveKit, com lock e confirmação após saúde. Testes locais usam API/DNS simulados; DNS/HTTPS reais, portas do roteador, macOS e capacidade externa permanecem pendentes.

Evidência DuckDNS nesta implementação: **26 testes de configuração/atualizador e 8 testes Playwright passaram**, lint/build passaram; lock com processo morto e helper órfão testado no Docker real; Caddy/portas/volumes ACME validados em staging e produção sem emissão. Consulta administrativa assinada executada contra SFU real. Contrato de DNS atualizado foi exercitado com mocks, sem token externo. LaunchAgent exige aceite no macOS.

DuckDNS revisado após bloqueio de portas padrão: HTTPS/WSS público **18443 → 443 no Mac**, certificados **DNS-01**, sem entrada WAN 80/443. Ver [migração](DUCKDNS_SETUP.md). Caddy atualizado para 2.11.4; emissão real e mídia externa seguem pendentes de teste no servidor.

Validação DNS-01/:18443: **29 testes Node, teste Go de filtragem de erros, 8 testes Playwright e lint/build passaram**. Imagens Caddy 2.11.4 construídas; HTTPS em porta não padrão, SNI/Host, certificado de CA local explícita, admissão e segredo ausente de autosave/logs passaram. Dependências Go com patches fixados: 0 HIGH/CRITICAL na base Trivy disponível neste ambiente (não é auditoria completa das imagens). Downloads bloqueados foram obtidos dos repositórios oficiais, com hash idêntico ao lock e `go mod verify` completo; TLS/checksums preservados. Emissão TXT/ACME real e teste WAN no Mac continuam pendentes.
