# ADR 001 — monólito, sessão e mídia separada

Data: 25/10/2026. Status: adotada para implementação local.

Java 25 + Spring Boot 3.5.16: compatibilidade verificada na [documentação oficial versionada](https://github.com/spring-projects/spring-boot/blob/v3.5.16/spring-boot-project/spring-boot-docs/src/docs/antora/modules/ROOT/pages/system-requirements.adoc). Maven 3.9.11 via Wrapper. Linha 3.5 estável mantém integração simples com Spring Security/Session, sem migração desnecessária para uma nova major.

PostgreSQL armazena sessões e leases para evitar Redis. Cookies HttpOnly/SameSite=Strict; Secure por configuração em HTTPS. CSRF em operações mutáveis e Origin exata no handshake WebSocket. REST confirma persistência; WebSocket notifica e presença. Não armazenamos tokens de autenticação em localStorage.

LiveKit 1.9.12 + SDK Java 0.16.0 e JS 2.23.0; permissões por fonte, webhooks verificados pelo SDK oficial. Publicação inicial só de microfone. Lease de tela é protegida por lock PostgreSQL; concessão é posterior à revogação anterior. Banco e API admin da SFU não são publicados no perfil internet. Sinalização usa forward_auth no Caddy: backend valida token/sessão e emite grant só de microfone, impedindo reentrada elevada por token antigo. Exclusividade adversarial de múltiplas tracks do mesmo dono permanece limite explícito (SECURITY).

Caddy serve arquivos e termina TLS, mas UDP da mídia é publicado diretamente. TURN/TLS opcional usa 5349 para evitar conflito com 443 do Caddy. Redes que só permitem 443 exigem IP/host separado ou proxy L4 com SNI, não implementado nesta stack.

Sem publicações ou recursos pagos. Oracle ARM e GCP usam a mesma stack; arquitetura e qualidade dependem de medições. A licença GPL-3.0 preexistente foi preservada, sem inferir decisão do proprietário sobre código novo.
