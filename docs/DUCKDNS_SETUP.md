# DuckDNS: ativação no Mac com IPv4 público

Implementação do [plano DuckDNS](DUCKDNS_PLAN.md). Usa `CHAT_MODE=internet`, dois nomes DuckDNS e HTTPS pelo Caddy. Nenhum cliente VPN é necessário para os amigos. O endereço residencial fica consultável pelo DNS. O aplicativo continua exigindo login.

## Preparação

Pré-requisitos: Docker/OrbStack com Compose >=2.24.4, IPv4 WAN público confirmado, acesso ao roteador, dois nomes **diferentes** registrados na conta DuckDNS e email ACME. Não é necessário instalar Node/Python no Mac para executar os scripts operacionais: Node roda em container.

1. Na conta DuckDNS, registre um nome para o app e outro para mídia, ambos sem registro AAAA no piloto IPv4. Confira as condições atuais do serviço. A API de atualização não registra nomes novos.
2. Faça backup verificável com `scripts/backup.sh` pelo perfil atual. Guarde uma cópia privada do `.env` antes da primeira troca de perfil. Não usar `down -v`.
3. Reserve o IP LAN do Mac no DHCP do roteador. Prefira cabo; se usar Wi-Fi, mantenha identidade MAC estável para essa reserva. Private Relay e Limitar Rastreamento podem permanecer habilitados; confira que a descoberta de IP feita no Docker corresponde à WAN, sem uma VPN/proxy de saída diferente.
4. Em janela sem chamadas, pare o perfil anterior. Se estiver usando o local:

   ```bash
   ./scripts/compose.sh down
   ```

   Se estiver usando Tailscale, use `CHAT_MODE=tailscale ./scripts/compose.sh down`. Preserve todos os volumes e decida quais compartilhamentos antigos devem ser revogados.

5. Prepare DNS e configuração:

   ```bash
   ./scripts/duckdns-init.sh
   ```

   O comando pede os dois nomes completos (`nome.duckdns.org`), email, IPv4 WAN atual e token com entrada oculta. Salva token em arquivo privado 0600 e configurações/estado em `infra/compose/generated/duckdns/`, ignorado pelo Git. Não informe o token por argumento ou envie-o no chat. A descoberta inicial precisa coincidir com o IPv4 WAN informado.

   Se DNS ainda estiver propagando, o comando falha antes de aplicar o `.env`; espere e repita sem digitar novamente os valores:

   ```bash
   ./scripts/duckdns-init.sh --retry
   ```

   A validação confere um servidor autoritativo DuckDNS e o resolvedor recursivo do container. Falhas ou AAAA inesperado impedem a aplicação. Corrija registros IPv6 antigos na conta/API oficial antes de repetir; o script não limpa registros automaticamente. Se o IPv4 WAN mudou, refaça o bootstrap com o valor atual.

## Roteador, macOS e OrbStack

Encaminhe para o IP LAN reservado do Mac:

| Externa → mesma porta interna | Uso |
|---|---|
| TCP 80 | ACME HTTP e redirecionamento |
| TCP 443 | HTTPS/WSS |
| UDP 7882 | Mídia principal |
| TCP 7881 | Fallback de mídia |

Não encaminhar 7880, 8080, 5432 ou 22. Não habilitar DMZ, UPnP para abertura automática ou desativar o firewall globalmente. UDP 443 é opcional para HTTP/3 e não é mídia LiveKit.

O fluxo real é roteador → macOS → VM OrbStack → porta publicada no container. Conferir permissões do firewall e suporte UDP da versão do OrbStack. Uma página carregando ou porta TCP aberta não comprova áudio/vídeo. Se o provedor bloquear entrada, DNS não corrige o bloqueio; investigar com o provedor antes de insistir na emissão de certificados.

## Ensaio ACME e ativação

Com os registros A e as portas configurados:

```bash
CHAT_MODE=internet CHAT_ACME_STAGING=true ./scripts/up.sh
```

Esse modo usa a CA staging do Let's Encrypt e **volumes separados** para certificados/configuração de teste. Confira emissão pelos logs do edge no terminal privado, evitando copiar requisições/tokens. Certificados staging não são confiáveis nos navegadores. Não desative TLS para fazer o teste parecer aprovado.

Após resolver DNS/portas e comprovar emissão em staging, pare esse perfil sem remover volumes e inicie produção:

```bash
CHAT_MODE=internet CHAT_ACME_STAGING=true ./scripts/compose.sh down
CHAT_MODE=internet ./scripts/up.sh
CHAT_MODE=internet ./scripts/admin.sh admin
./scripts/diagnose-duckdns.sh
```

O bootstrap já gerou o modo internet; não é preciso editar os marcadores de modo. Abra `https://NOME-APP.duckdns.org`. O SDK recebe `wss://NOME-MIDIA.duckdns.org`, com admissão autenticando o token/conexão e retirando grants elevados. PostgreSQL, backend e API administrativa LiveKit continuam internos.

Caddy solicita/renova os certificados de produção automaticamente, sujeito a DNS/portas, disponibilidade das CAs e limites de emissão. Preserve os volumes `certificates` e `caddy_config`. HSTS exige HTTPS no nome público; rollback usa o perfil anterior/localhost, não HTTP nesse mesmo nome.

## Atualizador e agendamento

Execução manual:

```bash
./scripts/duckdns-update.sh
```

O comando publica o mesmo IPv4 nos dois nomes, confirma DNS, valida a configuração em diretório isolado e atualiza `LIVEKIT_NODE_IP`. Quando necessário, recria **somente LiveKit**, sem build, e confirma a API administrativa pela rede Docker com JWT restrito. Atualizar um IP interrompe chamadas. O job não inicia uma stack parada.

Com o IP/configuração inalterados, verifica saúde e preserva a SFU; se ela estiver indisponível, tenta recriação. `applied.json` só avança após a confirmação. Se houver falha depois de gravar `.env`, a próxima execução ainda solicita aplicação. O lock é um objeto exclusivo no daemon Docker, sem processo residente e sem socket Docker dentro do helper. Uma execução concorrente é recusada; se o processo dono morreu, a próxima encerra seu eventual helper e recupera o lock. Locks de outro checkout são preservados.

Para ativar o job de usuário no macOS, **depois de testar externamente**:

```bash
./scripts/install-duckdns-launchagent.sh
```

O instalador verifica DNS/HTTPS de produção e saúde, grava um LaunchAgent com caminhos absolutos e sem token, e agenda a cada cinco minutos após login. O contrato/limite de frequência do DuckDNS precisa ser conferido na conta. OrbStack deve estar ativo; falhas de Docker/rede não abrem login interativo e serão tentadas novamente pelo job. Operação antes do login do usuário não está incluída.

Saída sanitizada: `infra/compose/generated/duckdns/launchagent.log`. Revisar/limpar esse log em manutenção; não é armazenamento permanente nem há rotação automática dele. Logs Docker seguem a política Compose. O token nunca deve aparecer em mensagens de erro do helper.

Remover o agendamento:

```bash
./scripts/install-duckdns-launchagent.sh remove
```

Para rotacionar token, remover o job e refazer o bootstrap em manutenção. Não manter jobs de checkouts antigos controlando a mesma stack.

## Diagnóstico e aceite externo

`diagnose-duckdns.sh` confere A/AAAA, HTTPS válido nos dois nomes, endpoint de saúde do app, resposta restrita do domínio de mídia e API administrativa interna. O diagnóstico não marca configuração pendente como aplicada.

Teste pelo celular com Wi-Fi desligado e depois com dois participantes em redes diferentes:

- Certificados confiáveis, login/logout, chat realtime e permissões de microfone/tela.
- Áudio nos dois sentidos, recebimento/parada de tela e ausência de participantes fantasmas.
- Mídia UDP real e fallback TCP separadamente; página HTTP e verificador UDP genérico não bastam.
- Portas administrativas/banco bloqueadas externamente e JWT elevado incapaz de contornar admissão.
- Retomada após troca de IP, falha de rede, reinício do Mac/OrbStack e renovação de certificado.

A suíte de navegador aceita `APP_TEST_URL=https://NOME-APP.duckdns.org`, `TEST_MEDIA_HOST=IPV4_PUBLICO`, além das credenciais de teste existentes. Execute em ambiente/rede apropriados com contas descartáveis e sem imprimir senhas/segredos.

Para LAN, testar NAT hairpin. Se indisponível, planejar DNS local e validar separadamente a mídia; não trocar para HTTP por IP privado. O perfil internet agora exige IPv4 global. Uma LAN isolada com IP privado exige configuração própria de rede/TLS.

Executar as cargas 2/4/8/16 do plano, com 20 minutos por carga e medições de upload, CPU/RAM, RTT, perda/jitter e frames. Uma tela de 4 Mbit/s para 15 espectadores representa cerca de 60 Mbit/s só de vídeo. Só anunciar o número medido. Persistem os limites de captura por navegador/SO e de múltiplas tracks descritos em SECURITY.

## Recuperação e rollback

Os arquivos privados `previous.env`/`previous-livekit.yaml` guardam a configuração anterior; `last-good.*` representa a última configuração confirmada. Não publicar esses arquivos: contêm segredos. Quando possível, prefira o backup feito antes da primeira migração.

Para rollback, remova o LaunchAgent, feche os encaminhamentos e pare internet:

```bash
CHAT_MODE=internet ./scripts/compose.sh down
```

Restaure o `.env` anterior (0600). Se voltar ao modo local, mova `generated/duckdns/settings.json` para um backup privado fora do caminho ativo, depois:

```bash
CHAT_ALLOW_MODE_CHANGE=true ./scripts/configure.sh local
./scripts/up.sh
```

Para Tailscale, siga seu guia de bootstrap/namespace. Não apagar volumes. Ao encerrar a exposição pública, remover/alterar também os registros na conta DuckDNS e decidir a retenção do token. Caches DNS podem conservar dados antigos temporariamente.

## Evidência disponível

Implementação exercitada com API/DNS simulados, falhas/retries, lock real no Docker e consulta administrativa da SFU real; regressões locais de navegador/sinalização também executadas. O site DuckDNS respondeu 403 pelo proxy deste runner. O formato de atualização foi corroborado pelo cliente público LinuxServer (`root/app/duck.sh`); a oferta/frequência e o contrato vigente devem ser conferidos antes da ativação.

Não houve chamada com token real, criação de nomes, alteração do roteador, instalação de LaunchAgent no Mac ou emissão ACME real. Esses passos e a carga externa dependem do servidor e da conta do proprietário.
