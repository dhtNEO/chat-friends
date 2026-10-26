# Rede: quatro cenários

## 1. Mesmo Mac

Perfil local publica 8080/TCP (web e sinalização autenticada), 7881/TCP (ICE fallback), 7882/UDP (ICE multiplexado), **somente 127.0.0.1**. LIVEKIT_NODE_IP=127.0.0.1 é exclusivo desse cenário. localhost é contexto seguro especial. Serviços internos: backend 8080/TCP, PostgreSQL 5432/TCP. Sem TURN por padrão.

O gerador mantém `enable_loopback_candidate: false` dentro do container LiveKit. Docker entrega as portas à interface de rede do container; habilitar também o socket loopback pode impedir as respostas ICE com o mapeamento de `node_ip`. Isso não altera o IP 127.0.0.1 anunciado ao browser no perfil local. O teste `tests/ice.spec.ts`, destinado à stack Compose acessível pelo host de `APP_TEST_URL`, verifica STUN autenticado nas portas padrão 7882/UDP e 7881/TCP.

## 2. LAN

Use nomes DNS alcançáveis, certificados confiáveis nos dispositivos e IP LAN anunciado no LiveKit. Não use HTTP por IP privado para prometer getUserMedia/getDisplayMedia. Para laboratório, Caddy `tls internal` exige instalar a CA local em cada dispositivo conscientemente; não desative verificação TLS. Alternativa: domínio real e TLS público. Ajuste APP_ORIGIN, LIVEKIT_PUBLIC_URL e COOKIE_SECURE=true, bindings de portas para interface LAN. O perfil internet pode ser usado com domínio real e firewall restrito à LAN; certificados ACME precisam alcançar o host ou usar DNS challenge (não incluído). Validar macOS e outros dispositivos separadamente.

## 3. Internet com IP público

Descubra WAN do roteador e compare com IPv4 externo observado por ferramenta confiável. Verifique também duplo NAT; um endereço WAN privado/100.64.0.0/10 e diferença para IP externo indicam possível CGNAT. Pergunte à operadora. Tenha domínio/DDNS e acesso ao roteador.

Em `.env`: APP_DOMAIN, MEDIA_DOMAIN, ACME_EMAIL reais; APP_ORIGIN=https://APP_DOMAIN; LIVEKIT_PUBLIC_URL=wss://MEDIA_DOMAIN; COOKIE_SECURE=true; LIVEKIT_NODE_IP=IPv4 público atual. Crie A records dos dois domínios; não publique AAAA sem IPv6 realmente configurado. Execute `CHAT_MODE=internet ./scripts/up.sh`.

| Porta/protocolo | Origem → destino | Uso no perfil internet |
|---|---|---|
| 80/TCP | amigos/ACME → Caddy | challenge ACME e redirect HTTPS |
| 443/TCP | amigos → Caddy | HTTPS/WSS app e sinalização /rtc |
| 443/UDP | amigos → Caddy | HTTP/3 opcional; não é mídia LiveKit |
| 7881/TCP | amigos → LiveKit | ICE/TCP fallback |
| 7882/UDP | amigos → LiveKit | mídia multiplexada, principal |
| 5432/TCP | backend → db, rede interna | PostgreSQL, não publicar |
| 8080/TCP | Caddy → backend/web, interna | HTTP interno |
| 7880/TCP | backend/Caddy → LiveKit, interna | controle/admin/sinalização; admin não encaminhado |
| 5349/TCP, 3478/UDP | amigos → LiveKit, somente perfil TURN | relay opcional |

Encaminhe portas no roteador para o IP LAN fixo do Mac/host. Permita no firewall macOS o processo/interface correspondente; não desative firewall globalmente. No OrbStack, fluxo é **roteador → macOS → VM Linux do OrbStack → porta publicada do container**. `network_mode: host` dentro da VM não equivale à interface física do Mac e não foi usado como solução mágica.

Diagnóstico UDP: confirme porta publicada com compose ps; no Mac use `sudo tcpdump -ni <interface-lan> udp port 7882` durante chamada de uma rede externa; examine chegada e retorno. Dentro da VM, use o terminal Linux do OrbStack e observe interface/porta correspondente (nome de interface depende da versão). Se chega ao Mac mas não à VM/container, verifique suporte/configuração de encaminhamento UDP da versão do OrbStack, conflito de portas e firewall. Não inventamos um comando de ajuste universal. Se a versão não encaminhar adequadamente, usar VM Linux com rede alcançável ou mídia externa é alternativa. Capturas de rede podem conter metadados: não publicar.

Use ferramentas de WebRTC (`chrome://webrtc-internals`, `about:webrtc`) e procure selected candidate pair, protocol, local/remote candidate type (host/srflx/relay), bytes e perda/jitter/RTT. Um socket aberto ou página carregada não prova mídia bidirecional. Teste fora do Wi-Fi; hairpin NAT local pode enganar.

## TURN/TLS opcional

A configuração base tenta UDP 7882 e TCP 7881. Redes corporativas podem bloquear ambos. TURN embutido opcional: gere certificado TLS público para um terceiro domínio e monte em `infra/compose/generated/turn-certs` (0600). Preencha `TURN_DOMAIN` no .env e execute `CHAT_MODE=internet CHAT_TURN=true ./scripts/up.sh`. O gerador verifica presença de fullchain.pem/privkey.pem e adiciona a seção turn com TLS real em 5349, UDP em 3478 e external_tls=false; o wrapper inclui turn.yml. Mantenha CHAT_TURN=true também nas próximas atualizações; sem a variável, o perfil base permanece sem TURN. Isso configura, mas não valida certificados, relay ou conectividade externa. Certificados TURN não são automaticamente extraídos/renovados pelo Caddy: providencie renovação segura pelo proprietário e reinicie LiveKit em manutenção após troca. TURN/TLS 5349 evita disputar 443. Para redes que só aceitam 443, use IP público/host separado para TURN 443 ou proxy L4/SNI especializado; não incluído nem validado. Não exponha um relay aberto. Não usar `external_tls:true` sem terminador TLS real.

Caddy renova certificados do app automaticamente enquanto DNS, portas e volumes persistem. Acompanhe logs sem tokens e validade via `openssl s_client -connect domínio:443 -servername domínio`. Mudança de IP exige DDNS/A, novo LIVEKIT_NODE_IP, configure/restart LiveKit e teste ICE. Chamadas ativas cairão.

## 4. CGNAT

Port forwarding no roteador não controla NAT da operadora. Alternativas: solicitar IPv4 público (pode custar), rede privada entre amigos com cliente/configuração em cada máquina e DNS/TLS apropriados, hospedar stack/SFU numa VM ou usar LiveKit Cloud para mídia. Túnel HTTP sozinho não transporta UDP da SFU. Não exigir que os amigos instalem cliente sem combinar previamente.

Checklist antes de convite externo: upload sustentado cabeado; WAN/CGNAT; acesso roteador; domínio; TLS; UDP publicado; fallback/relay testados; browser/OS de cada amigo; necessidade de áudio do jogo; horas/mês; backup; medições de CPU/RAM/banda. Sem acesso ao Mac, esses itens permanecem externos.

## Perfil Tailscale

Perfil privado implementado: [bootstrap, operação e rollback](TAILSCALE_SETUP.md). Usa identidade dedicada, Serve HTTPS e mídia pela interface Tailscale, sem portas publicadas no host. Testes de configuração/Compose independem de conta. Aceite real de HTTPS/ACL, OrbStack/ARM64 e carga depende do servidor e das contas externas; não foi validado no Codex sem TUN. Consulte também [critérios do plano](TAILSCALE_PLAN.md).
