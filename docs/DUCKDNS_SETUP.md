# DuckDNS com HTTPS público na porta 18443

Perfil `CHAT_MODE=prd`, dois nomes DuckDNS, certificados públicos por **DNS-01** e acesso pelo navegador. O endereço será `https://NOME-APP.duckdns.org:18443`; a sinalização usará `wss://NOME-MIDIA.duckdns.org:18443`.

DNS-01 valida registros TXT na zona DuckDNS e não exige entrada nas portas WAN 80 ou 443. A mídia continua em UDP 7882 e TCP 7881. O IP residencial fica consultável pelo DNS e o login do aplicativo continua obrigatório.

## Atualização para os modos dev/prd

A aplicação usa somente **dev** (local, padrão) e **prd** (internet). Na instalação existente, atualize o checkout e passe a usar `CHAT_MODE=prd` em todos os comandos de produção:

```bash
git pull --ff-only origin work
CHAT_MODE=prd ./scripts/up.sh
```

Os marcadores de configuração anteriores são migrados automaticamente; `.env`, token, banco e certificados são preservados. Não recriar nomes ou informar o token novamente. Os scripts do agendador usam prd automaticamente; o LaunchAgent instalado continua válido, pois o caminho do script e o label não mudaram. A variante ACME staging pertence ao modo prd e é ativada somente por `CHAT_ACME_STAGING=true`.

Mantenha **TCP externa 18443 → IP LAN do Mac, porta interna 443**, além das portas de mídia. Se precisar parar a stack: `CHAT_MODE=prd ./scripts/compose.sh down --remove-orphans`, sem `-v`.

## Primeira instalação

Pré-requisitos: Docker/OrbStack, Compose >=2.24.4, IPv4 WAN público, dois nomes diferentes registrados na conta DuckDNS e email ACME. Node roda em container. Não é necessário instalar Go/Node no Mac: a imagem de edge é construída em Docker.

1. Registre dois nomes na conta DuckDNS. O atualizador não cria nomes. Não publicar AAAA no piloto IPv4. Confirme termos/frequência permitida pelo serviço.
2. Reserve o IPv4 LAN do Mac no DHCP do roteador. Prefira cabo. Em Wi-Fi, endereço privado **fixo** mantém a identidade usada pela reserva. Private Relay e Limitar Rastreamento podem permanecer ativos; a descoberta feita no Docker precisa corresponder à WAN, sem VPN/proxy de saída diferente.
3. Faça backup pelo modo atual e pare a instalação anterior sem apagar volumes. Em dev: `CHAT_MODE=dev ./scripts/compose.sh down`. Em prd: `CHAT_MODE=prd ./scripts/compose.sh down`.
4. Execute:

   ```bash
   ./scripts/duckdns-init.sh
   ```

   Informe os dois nomes completos, email, IPv4 WAN atual, porta pública (Enter aceita **18443**) e token com entrada oculta. O token fica em `infra/compose/generated/duckdns/token`, 0600; não o enviar no chat nem usar em argumentos.
5. Se a propagação DNS ainda não estiver consistente, espere e repita:

   ```bash
   ./scripts/duckdns-init.sh --retry
   ```

   O bootstrap inicial confere IP descoberto com WAN informada. Se o IP mudou durante a preparação, refaça o bootstrap com o valor atual. Atualizações normais posteriores descobrem o IP novo automaticamente.

## Roteador e firewall

Encaminhe somente os fluxos necessários para o IP LAN reservado do Mac:

| Porta externa | Protocolo | Porta no Mac | Uso |
|---|---|---|---|
| **18443** | TCP | **443** | HTTPS/WSS |
| 7882 | UDP | 7882 | Mídia principal |
| 7881 | TCP | 7881 | Fallback de mídia |

Não publicar 7880, 8080, 5432 ou SSH. Não usar DMZ, abertura automática por UPnP ou desativação global do firewall. O perfil DNS-01 não publica HTTP 80 nem HTTP/3; as portas WAN 80/443 podem continuar bloqueadas.

O fluxo real é internet → roteador → macOS → OrbStack → Docker. TCP 18443 funcionar não comprova transporte de mídia: validar UDP 7882 e TCP 7881 com chamada real. DNS-01 não é TURN nem retransmissor de áudio/vídeo.

## Certificados: staging e produção

Comece com:

```bash
CHAT_MODE=prd CHAT_ACME_STAGING=true ./scripts/up.sh
CHAT_MODE=prd CHAT_ACME_STAGING=true ./scripts/compose.sh logs --tail=100 edge
```

O edge deve usar `dns-01`, criar/remover TXT `_acme-challenge` e obter certificados para os dois nomes. Precisa de saída HTTPS para DuckDNS/ACME e consultas DNS. A propagação pode levar minutos. Se houver falha, conferir DNS/token/conectividade; repetir startup continuamente não acelera propagação.

O token é montado como secret de arquivo, lido pelo entrypoint e passado ao processo Caddy em runtime, sem valor no ambiente expandido do Compose. Os placeholders são mantidos na configuração serializada. O módulo `duckdns_private` encapsula o provider caddy-dns/duckdns fixado e filtra erros que poderiam conter token/URL. Não usar debug/dumps de ambiente ou configuração em produção.

Staging usa CA e volumes separados; o certificado não é confiável no navegador. Não ignorar TLS para concluir o teste. Após confirmar emissão em staging:

```bash
CHAT_MODE=prd CHAT_ACME_STAGING=true ./scripts/compose.sh down --remove-orphans
CHAT_MODE=prd ./scripts/up.sh
CHAT_MODE=prd ./scripts/admin.sh admin
./scripts/diagnose-duckdns.sh
```

Abra **`https://NOME-APP.duckdns.org:18443`**. O sufixo `:18443` e o esquema HTTPS são necessários. Caddy renova por DNS-01 enquanto o token/conta/DNS/CA permitem; não há dependência de abertura de 80/443 na WAN.

Mantenha os volumes de certificados e o token protegido. Depois de rotacionar token, recrie o edge em manutenção para ler o novo arquivo. Configurações novas registram `httpsPort` em `generated/duckdns/settings.json`; ausente significa 18443. Alterar essa porta exige atualizar a regra do roteador e startup completo. `PUBLIC_HTTPS_PORT` e URLs do `.env` são gerados a partir dessa configuração, não apenas editados manualmente.

## Atualizações, diagnóstico e agendamento

```bash
./scripts/duckdns-update.sh
```

O atualizador publica o mesmo IPv4 nos dois nomes, confirma DNS, valida configuração em staging local e ajusta o IP da SFU. Quando o IP/configuração de mídia muda, recria somente LiveKit e confirma sua API interna com JWT restrito. IP inalterado não causa restart; falha de aplicação não avança `applied.json`, permitindo retry. Não inicia stack parada. Mudança de IP interrompe chamadas.

O lock exclusivo no Docker impede concorrência e recupera dono/helper órfãos. Nenhum socket Docker é montado no helper. Arquivos `previous.*` e `last-good.*` contêm segredos e são backups privados, não material de diagnóstico público.

`./scripts/diagnose-duckdns.sh` confere A/AAAA e HTTPS **pela rede Docker**, validando o certificado contra cada FQDN e usando Host com porta pública. Isso evita exigir NAT hairpin do roteador no servidor. Também confere a API administrativa. **Não comprova acesso WAN:** o teste externo continua obrigatório. O diagnóstico não marca estado pendente como aplicado.

Depois de testar externamente:

```bash
./scripts/install-duckdns-launchagent.sh
```

O LaunchAgent roda a cada cinco minutos após login, com caminhos absolutos e sem token no plist. OrbStack deve estar ativo; falhas são retomadas em execução posterior. Sem autostart antes de login. Remoção: `./scripts/install-duckdns-launchagent.sh remove`. Logs sanitizados ficam em `generated/duckdns/launchagent.log`; revisar/limpar em manutenção, sem rotação automática desse arquivo.

## Teste externo e acesso local

Com Wi-Fi do iPhone desligado, abra a URL com **18443** e certificado de produção. Confirme login/logout, chat, áudio bidirecional, tela/parada e desativação de sessão. Teste mídias UDP/TCP separadamente e portas administrativas inacessíveis. Um erro TLS de staging não deve ser tratado como aceite.

Acesso ao endereço público de dentro da LAN pode depender de hairpin NAT. DNS local sozinho não resolve a diferença entre porta pública 18443 e porta 443 do Mac: se hairpin falhar, será necessária uma configuração LAN que também disponibilize 18443 no Mac, além da resolução dos nomes. Diagnóstico interno pode passar mesmo com essa limitação. Não trocar para HTTP ou ignorar certificados.

Para Playwright externo: `APP_TEST_URL=https://NOME-APP.duckdns.org:18443`, `TEST_MEDIA_HOST=IPV4_PUBLICO` e credenciais de teste. Só anunciar a carga validada de 2/4/8/16 participantes. Uma tela de 4 Mbit/s para 15 espectadores representa cerca de 60 Mbit/s antes de áudio/overhead. O Mac precisa permanecer acordado, com OrbStack ativo.

## Rollback e limites da evidência

Remova o LaunchAgent, feche os encaminhamentos e pare prd sem remover volumes. Para voltar a dev, restaure o `.env` local anterior (0600), com origens localhost, cookie local e IP anunciado 127.0.0.1. Execute `CHAT_ALLOW_MODE_CHANGE=true ./scripts/configure.sh dev` e `CHAT_MODE=dev ./scripts/up.sh`. O marcador de modo protege a troca acidental. Nunca usar `down -v`.

Implementação testada com mocks DNS/API, provider Go com falhas que contêm token, validação Caddy/Compose e HTTPS local com CA de laboratório explicitamente confiável. Não houve token real, TXT público, emissão ACME real, mudança do roteador ou teste no Mac/ARM64 neste ambiente. O proprietário confirmou funcionamento em produção no Mac; carga com vários participantes, qualidade e renovação prolongada continuam pendentes, conforme [STATUS](STATUS.md).

## Atualização dos controles de áudio e Full HD

Fazer backup em prd, atualizar o checkout e manter os segredos do `.env`. Para habilitar Full HD em instalações antigas, editar somente `SCREEN_HEIGHT=1080`, `SCREEN_BITRATE=8000000` e `SCREEN_FPS=30`, depois executar `CHAT_MODE=prd ./scripts/up.sh`. A migração Flyway V2 é automática e adiciona o estado de recepção às conexões, sem apagar contas ou mensagens. Não há novas portas, serviços ou configuração DuckDNS. No navegador, escolher 1080p antes de compartilhar e recarregar sem cache após o deploy. Validar som/volume/mudo com outro participante; 1080p/8 Mbps são tetos solicitados, não promessa de qualidade/carga.
