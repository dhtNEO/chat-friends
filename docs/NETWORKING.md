# Rede nos modos dev e prd

O projeto aceita somente `CHAT_MODE=dev` (padrão, local) e `CHAT_MODE=prd` (internet). Os dois usam a mesma stack e volumes; não devem rodar simultaneamente no mesmo checkout. A troca de modo exige parada, backup e configuração compatível com o destino.

## Dev: acesso local

```bash
CHAT_MODE=dev ./scripts/up.sh
```

Portas publicadas somente em **127.0.0.1**: 8080/TCP para web/API/sinalização, 7881/TCP e 7882/UDP para mídia. Não há edge público. `.env`: APP_ORIGIN=http://localhost:8080, LIVEKIT_PUBLIC_URL=ws://localhost:8080, COOKIE_SECURE=false e LIVEKIT_NODE_IP=127.0.0.1.

Localhost é contexto seguro especial para microfone/tela. O gerador mantém `enable_loopback_candidate: false` dentro do container: Docker entrega mídia à interface de rede, e sockets adicionais de loopback podem impedir resposta ICE com o mapeamento de node_ip. Isso não altera o IP de loopback anunciado ao browser em dev.

## Prd: DuckDNS e DNS-01

```bash
CHAT_MODE=prd ./scripts/up.sh
```

Para primeira instalação e agendamento, seguir [DuckDNS](DUCKDNS_SETUP.md). Dois nomes registrados apontam ao IPv4 público; app e sinalização usam HTTPS/WSS **:18443**. DNS-01 emite/renova certificados com token privado, sem depender de entrada WAN 80/443.

| Fluxo do roteador | Uso |
|---|---|
| 18443/TCP → Mac 443/TCP | HTTPS/WSS no Caddy edge |
| 7881/TCP → Mac 7881/TCP | Fallback de mídia |
| 7882/UDP → Mac 7882/UDP | Mídia principal multiplexada |

Não encaminhar banco 5432, backend/web 8080, API LiveKit 7880 ou SSH 22. Caddy admin fica desabilitado. A sinalização sempre passa pela admissão `/api/livekit/admit`; não publicar 7880 para contorná-la.

`.env` de prd usa cookie Secure, origens HTTPS/WSS com domínio e porta, IPv4 público real e API interna `http://livekit:7880`. O atualizador mantém o mesmo IP nos dois nomes e no candidato LiveKit. Uma mudança real de IP interrompe chamadas e pode levar tempo para propagar por caches DNS.

## Prd com domínio próprio

Sem configuração DuckDNS, `infra/compose/prd.yml` e `Caddyfile.prd` fornecem HTTPS automático tradicional, com dois domínios distintos. Preencher APP_DOMAIN, MEDIA_DOMAIN, ACME_EMAIL, APP_ORIGIN, LIVEKIT_PUBLIC_URL, COOKIE_SECURE=true e LIVEKIT_NODE_IP público. A porta padrão é 443, e HTTP 80 é usado para redirecionamento/ACME. Esse caminho exige entrada WAN nas portas apropriadas.

DuckDNS/DNS-01 e ACME staging são opções de configuração de **prd**, não modos adicionais. `CHAT_ACME_STAGING=true` usa CA e volumes de teste separados; certificados staging não são confiáveis no navegador.

## Mac, roteador e diagnóstico

Reserve IP LAN para o Mac no DHCP. Prefira cabo ou identidade Wi-Fi privada fixa para essa reserva. Private Relay e Limitar Rastreamento podem permanecer ativos; o IP descoberto no Docker deve coincidir com a WAN, sem proxy/VPN de saída divergente.

O fluxo é internet → roteador → macOS → VM OrbStack → porta Docker publicada. Não desativar firewall globalmente, habilitar DMZ ou tratar rede host dentro da VM como interface física do Mac.

Teste fora do Wi-Fi, usando dados móveis ou outra rede. Uma porta aberta ou página carregada não comprova mídia. Confirmar áudio/frame decodificados e selected candidate pair, protocolo, bytes, perda, jitter e RTT. Para UDP, conferir chegada e retorno no Mac/VM; capturas podem conter metadados e não devem ser publicadas sem revisão.

Acesso pelo domínio público dentro da LAN pode depender de NAT hairpin. Com porta pública 18443 mapeada para 443 no Mac, DNS local sozinho não basta: uma configuração LAN alternativa também precisa disponibilizar a porta 18443. Não usar HTTP por IP privado ou ignorar TLS para resolver isso. O diagnóstico interno verifica certificado sem depender de hairpin; o aceite WAN é separado.

Se WAN e IPv4 externo coincidirem e forem públicos, isso indica ausência de CGNAT nesse caminho, mas não comprova portas liberadas. Se houver CGNAT, encaminhamento no roteador não remove o NAT da operadora. Consultar a operadora ou hospedar prd em host com conectividade pública. Túnel HTTP sozinho não transporta mídia UDP da SFU.

## TURN opcional em prd

Somente para instalação manual com domínio/certificados próprios, `CHAT_MODE=prd CHAT_TURN=true ./scripts/up.sh` adiciona TURN embutido. Exige TURN_DOMAIN e `generated/turn-certs/fullchain.pem`/`privkey.pem`; publica TLS 5349/TCP e UDP 3478. Não é um modo separado e não está integrado ao atualizador DuckDNS.

A presença dos arquivos não valida certificado ou relay. A renovação TURN é responsabilidade do operador, separada dos certificados Caddy. Não usar `external_tls:true` sem terminador TLS real nem criar relay aberto. Redes que permitem apenas 443 podem precisar de host/IP dedicado ou proxy L4; não foi validado neste projeto.
