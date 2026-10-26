# Tailscale no Mac/OrbStack ou Linux

Perfil implementado: `CHAT_MODE=tailscale`. Nó dedicado, web e LiveKit compartilham namespace; nenhuma porta da aplicação é publicada no host. Serve termina HTTPS e encaminha web/WSS ao Caddy em loopback. Mídia usa 7882/UDP ou 7881/TCP no IP Tailscale. Backend e PostgreSQL continuam internos. O login do aplicativo permanece obrigatório.

## Pré-requisitos e primeira ativação

Docker Compose >=2.24.4, Linux/OrbStack com `/dev/net/tun` no daemon Docker, acesso à sua conta Tailscale e dois amigos em redes distintas para o piloto. Confirmar termos do plano, possibilidade de compartilhar o nó sem tags e habilitar MagicDNS/HTTPS na conta. Sem contratação automática. A imagem oficial **1.104.2** está fixada por digest multiarch (ARM64/AMD64); execução ARM64 no Mac ainda depende do piloto.

Execute no terminal privado da máquina servidor. Não envie links de login ou logs do daemon para CI/issues. O fluxo usa autenticação interativa; não exige chave de API no `.env`.

1. Faça backup verificável com `./scripts/backup.sh`. Guarde cópia restrita do `.env` fora do Git. A primeira ativação e atualizações interrompem chamadas.
2. Verifique TUN antes da parada:

   ```bash
   ./scripts/tailscale-init.sh preflight
   ```

   Se falhar, corrigir o suporte do OrbStack/Linux ou escolher host Linux com TUN. O perfil não muda silenciosamente para userspace.

3. Pare a stack pelo perfil atualmente em uso, preservando o banco. No perfil local:

   ```bash
   ./scripts/compose.sh stop web livekit backend
   ./scripts/tailscale-init.sh start
   ./scripts/tailscale-init.sh login
   ```

   Abra a URL de autenticação exibida no terminal e registre o nó `chat-amigos` na sua conta. Não atribua tags e não anuncie sub-redes, exit node ou SSH. O estado da identidade fica no volume `chat-friends_tailscale_state`. Se o primeiro login demorar e o daemon reiniciar, repita `login`.

4. Habilite HTTPS para o nó na conta. O nome `.ts.net` pode constar em Certificate Transparency; use nome neutro. O certificado não concede acesso à rede. Configure a política de acesso **antes de compartilhar**.
5. Suba a aplicação:

   ```bash
   CHAT_MODE=tailscale ./scripts/up.sh
   CHAT_MODE=tailscale ./scripts/admin.sh admin
   CHAT_MODE=tailscale ./scripts/diagnose.sh
   ```

   `up.sh` consulta o nó em execução, valida autenticação/FQDN/IP, atualiza apenas URLs/cookie/IP no `.env`, gera LiveKit e recria backend/web/SFU. As credenciais do banco e LiveKit são preservadas. O gerador restringe o mux ICE à `tailscale0`; o HTTP administrativo da SFU escuta somente no IP Docker, e Caddy somente em 127.0.0.1. Não executar o perfil internet em paralelo.

6. Consulte o FQDN no painel Tailscale e abra `https://FQDN-COMPLETO.ts.net`. Compartilhe apenas esse dispositivo com cada amigo; cada um instala cliente oficial, aceita com conta própria, abre a URL e entra com sua conta no aplicativo. Não é convite como membro da sua tailnet.

O bootstrap `configure` recusa serviços da aplicação ativos. A forma recomendada para atualizações é `CHAT_MODE=tailscale ./scripts/up.sh`, que coordena a parada e recriação. Não recriar só o nó: seus consumidores podem continuar ligados ao namespace antigo. Após falha/restart isolado do nó ou suspensão do Mac, executar `up.sh` e confirmar saúde antes de nova chamada. Nenhum controlador automático de recuperação de namespace foi adicionado.

## Permissões e verificação externa

O arquivo `infra/compose/tailscale-policy.example.json` é um **fragmento de exemplo**: substituir o IP pelo IPv4 real do nó e revisar a sintaxe/política no editor Tailscale. Preservar regras necessárias de outros dispositivos. Grants são aditivos: remover ou restringir permissões amplas que também alcancem este nó. Não copiar o exemplo como substituto integral da política pessoal.

Amigos compartilhados podem alcançar somente TCP 443, TCP 7881 e UDP 7882. Não liberar 7880, 8080, 5432 ou 22, nem a LAN. Não habilitar Funnel. As restrições de binding impedem acesso direto à API HTTP da SFU/Caddy pelo IP Tailscale mesmo se uma regra ampla for adicionada por engano; a política continua necessária para as outras superfícies do nó.

Com duas contas externas compartilhadas e uma sem compartilhamento, executar e registrar:

- HTTPS/certificado confiável, login/CSRF, chat WebSocket, voz bidirecional, recusa de microfone e tela com parada limpa.
- Portas administrativas bloqueadas e impossibilidade de usar JWT elevado para contornar a admissão `/rtc`.
- Conta sem compartilhamento sem acesso; revogação de compartilhamento durante chamada corta acesso.
- Desativação da conta do app invalida sessão/mídia independentemente do compartilhamento.
- Recriação coordenada preserva identidade/IP; comportamento após perda de rede, reauth e suspensão.

Criar apenas contas de teste e limpar seus próprios fixtures. Para rodar a suíte de navegador contra o ambiente privado, usar credenciais descartáveis e configurar `APP_TEST_URL=https://FQDN` e `TEST_MEDIA_HOST=IP-TAILSCALE`. O processo que roda Playwright precisa estar conectado à rede e autorizado pela política. `TEST_ADMIN_PASSWORD` e `TEST_LIVEKIT_SECRET` continuam necessários; não imprimi-los. O probe STUN nativo usa UDP/TCP; `TEST_MEDIA_HOST` separa o IP da mídia da URL HTTPS.

## Diagnóstico, carga e manutenção

`CHAT_MODE=tailscale ./scripts/diagnose.sh` imprime saúde e contagens agregadas de caminhos direto/relay/offline, sem listar identidades/IPs. Para investigar individualmente, usar `tailscale ping`, `tailscale netcheck` e `tailscale status` no terminal privado do dispositivo cliente ou por `./scripts/compose.sh exec` com `CHAT_MODE=tailscale`. Não publicar saída completa. Relay reportado é um indício, não uma medição de qualidade.

Executar as cargas 2/4/8/16 e metas do [plano](TAILSCALE_PLAN.md), incluindo caminho Tailscale e RTCStats, 20 minutos por carga, cena em movimento e upload do servidor. Uma conexão ICE UDP pode estar transportada por DERP; verificar as duas camadas. Só anunciar a carga efetivamente aprovada. Persistem as limitações de captura de áudio do sistema por navegador/SO.

O Mac deve ficar acordado, com OrbStack ativo, preferencialmente cabeado. Conferir expiração da identidade do nó no painel e renovar em manutenção antes dos encontros. Serve gerencia o certificado enquanto conta/nó/DNS permitem a emissão; conferir validade por navegador e depois de reiniciar. Não desativar validação TLS para contornar falha.

Atualizar imagem somente após revisar release/digest e manifests ARM64/AMD64; ajustar também a referência de preflight em `scripts/tailscale-init.sh`. Fazer backup do banco e do estado privado do nó com proteção de acesso. Não restaurar a mesma identidade em dois hosts simultaneamente. Retenção e revogação do estado são operações deliberadas do proprietário.

## Rollback

Revogar os compartilhamentos de teste e, em janela sem chamadas:

```bash
CHAT_MODE=tailscale ./scripts/compose.sh down
```

Isso preserva volumes. Restaure o `.env` anterior com permissão 0600 (URLs localhost, cookie local), então:

```bash
CHAT_ALLOW_MODE_CHANGE=true ./scripts/configure.sh local
./scripts/up.sh
```

Confirmar dados/chat e suíte local. Não usar `down -v`. Em encerramento definitivo, revogar o dispositivo na conta e remover sua identidade local depois de decidir se precisa de recuperação. Não há migração de schema neste perfil.

## Evidências e pendências

Implementação validada por 13 testes de configuração, inspeção Compose, oito testes de navegador/sinalização, lint/build e teste de sockets em containers descartáveis. Esse último comprova API LiveKit no IP Docker e Caddy no loopback com Host externo; usa eth0 para RTC por não haver TUN, portanto não valida a rede Tailscale. O daemon Docker do ambiente Codex não possui `/dev/net/tun`; a preflight falhou com erro de dispositivo ausente. Nenhuma conta Tailscale foi conectada aqui. HTTPS real, políticas entre contas, ARM64/OrbStack, recuperação do namespace e capacidade 2/4/8/16 permanecem como aceite no servidor real. A presença dos arquivos não comprova esses resultados.
