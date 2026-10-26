# Atualização de segurança e contingência

Implementação na branch `work`, 26/10/2026. Execute a atualização em manutenção. Os testes Linux/AMD64 e o CI não comprovam configuração do Mac, firmware do roteador, firewall IPv6, desempenho para 16 pessoas ou acesso WAN. Esses aceites continuam com o proprietário.

## O que mudou

| Área | Controle aplicado | Limite / verificação pendente |
|---|---|---|
| Requests públicos | Orçamentos global/IP antes de CSRF/sessões, memória limitada, logins por nome, corpo de 16 KiB e limites de conexões HTTP | Não impede saturação do link residencial |
| Origem do cliente | Edge reconstrói endereço; web/backend verificam segredo compartilhado dos proxies | Não confiar em X-Forwarded-For recebido da internet; segredo não autentica usuários |
| Contas | TOTP, oito códigos de recuperação de uso único, proteção contra replay e segredo cifrado com AES-GCM | Administradores devem inscrever autenticador no primeiro login em prd; recuperar códigos fora do Mac |
| Sessões | Inatividade de 2 h, limite absoluto de 8 h, listagem/revogação; confirmação de identidade por 15 min para alterações administrativas | Revogação de sockets/mídia é reconciliada periodicamente; não é instantânea |
| Banco | Runtime sem superusuário, sem criação de roles/bancos/esquema, sem senha de migração; Flyway em job temporário | DBA continua disponível somente ao operador/contêiner db; proteja acesso ao Docker |
| Contêineres | Web/SFU/edge com usuário limitado, capabilities reduzidas, rootfs RO, tmpfs, limites de memória/CPU/PIDs e logs | Postgres inicia como root para ajustar o volume e passa a postgres; Mac/OrbStack precisam validar UID e mounts |
| Rede | Banco isolado; redes distintas de API, sinalização e controle; backend e web prd sem ponte externa; upstream DNS externo desativado nesses serviços | Redes Docker não substituem firewall da LAN nem impedem por si só acesso da SFU/edge à rede do host |
| DuckDNS | Helper com scripts RO, configuração mínima e escrita somente no estado de rede/DNS; lock e pending/applied preservados | Token ainda existe no processo edge para DNS-01. Use conta DuckDNS dedicada; emissor separado continua evolução futura |
| Mídia/chat | ACK idempotente sem novo broadcast, até 4 sockets/conta, 2 conexões de voz/conta, ping limitado, cache de estado de 1 s, heartbeat não revive conexão expirada | Tetos de bitrate/resolução solicitados ao cliente não são uma barreira contra cliente modificado |
| SFU | Assinaturas limitadas a 1 vídeo e 16 áudios, sinalização de 64 KiB, API de 128 KiB, data tracks desativados; excesso de tracks revoga conexão na reconciliação | A SFU não oferece aqui atomicidade por fonte: pode haver sobreposição transitória antes da remoção. `num_tracks`/`bytes_per_sec` são critérios de alocação de nó, não limitadores rígidos por publicador |
| Dependências | Patches compatíveis Java; Caddy/LiveKit/gosu reconstruídos com Go corrigido, bases atualizadas; SBOM Java resolvido e scans de imagens no CI | Exceções específicas em `security/vulnerability-exceptions.json` vencem e bloqueiam o gate até revisão; não representam um scanner sem alertas |
| Recuperação | Bundle de DB/configuração cifrado e autenticado, teste de adulteração/senha errada, restauração isolada; rotação do log do LaunchAgent | Copiar para fora do Mac, verificar FileVault e ensaiar recuperação completa são ações do operador |

## Atualizar instalação existente

1. Separe uma janela sem participantes. Registre commit e IDs das imagens em local privado. Suspender o agendador no Mac preserva token/plist:

   ```bash
   /bin/launchctl bootout "gui/$(/usr/bin/id -u)/org.chatfriends.duckdns"
   CHAT_MODE=prd ./scripts/backup.sh
   ```

2. Guarde o dump e as configurações anteriores de forma privada. Atualize o checkout da branch `work`. Não remova volumes. Antes da primeira partida, execute:

   ```bash
   CHAT_MODE=prd ./scripts/configure.sh prd
   CHAT_MODE=prd ./scripts/backup-encrypted.sh
   CHAT_MODE=prd ./scripts/test-backup.sh
   ```

   O configurador cria `generated/runtime.env` com credenciais separadas, chave dos proxies, chave MFA e UID/GID do proprietário. Isso **não** muda usuários do banco sozinho. Preserve esse arquivo, especialmente a chave MFA; não o regenere a cada deploy. O bundle inclui configurações privadas e dados e pede uma frase que não aparece em argumentos/logs. Copie o `.cfbackup` para armazenamento externo e guarde a frase separadamente.

3. Inicie a versão nova:

   ```bash
   CHAT_MODE=prd ./scripts/up.sh
   CHAT_MODE=prd ./scripts/check-db-privileges.sh
   CHAT_MODE=prd ./scripts/diagnose-duckdns.sh
   ```

   `up.sh` constrói as imagens, inicia o DB, provisiona roles/grants no banco existente e executa o job `migrate`. Só então sobe o runtime. Nenhum segredo do migrador vai para o backend. A migração V3 encerra sessões/conexões anteriores, preservando contas e mensagens; V4 acrescenta o controle de ciclo de vida da mídia. Não desfaça esse isolamento devolvendo superusuário ao backend.

4. No primeiro login do administrador em prd, confirme a senha, cadastre a chave TOTP no autenticador e confirme o código. Guarde os oito códigos de recuperação offline. O espaço só abre depois dessa etapa. Demais usuários podem ativar MFA em **Minha conta → Segurança**. A mesma área lista/encerra sessões e permite confirmar identidade para repetir uma operação administrativa que expirou.

5. Teste histórico, chat, login/logout, conta desativada, áudio TCP/UDP, tela/volume/mudo e acesso de amigo fora da LAN. Confira consumo e validade do certificado. Reinstale o LaunchAgent para usar o wrapper com rotação:

   ```bash
   ./scripts/install-duckdns-launchagent.sh
   ```

   O log privado fica em `generated/duckdns/launchagent.log`, com até três cópias de aproximadamente 1 MiB. A atualização deve ocorrer mesmo com Private Relay ativo; ele não protege conexões de entrada.

### Alteração nos arquivos gerados

`.env` permanece como configuração do operador. O atualizador não o reescreve. Overrides de DNS/IP/origem ficam em `generated/network/network.env`; Compose os carrega após `.env` e `generated/runtime.env`. O YAML da SFU fica em `generated/network/livekit.yaml`. O helper recebe somente `generated/helper.env` (credenciais de mídia e parâmetros de rede), scripts RO e os diretórios network/duckdns. Ele não recebe a senha do banco nem a chave MFA. Renomeações atômicas continuam dentro de diretórios graváveis.

Ao voltar a dev em manutenção, arquive/remova o override `generated/network/network.env` do caminho ativo, restaure as origens localhost no `.env` e use `CHAT_ALLOW_MODE_CHANGE=true ./scripts/configure.sh dev`. Não deixe o agendador prd executando durante a troca.

## Recuperação de acesso

Código TOTP precisa do relógio correto e não pode ser reutilizado. Se acabou de confirmar um código, espere o seguinte antes de reautenticar. Códigos de recuperação funcionam uma vez. Se perder autenticador e códigos, um operador em **host confiável** pode executar:

```bash
CHAT_MODE=prd ./scripts/reset-mfa.sh admin
```

Isso remove MFA da conta e invalida suas sessões. Em prd o próximo login exige nova inscrição. Não há endpoint público de recuperação sem autenticação. Se o host estiver comprometido, não rode scripts dele nem introduza novas credenciais.

## Aceite da rede real

| Conferência do proprietário | Resultado esperado |
|---|---|
| DHCP | Reservas corretas para Mac e console, incluindo a identidade Wi-Fi privada fixa |
| Encaminhamentos | Apenas TCP WAN 18443 → Mac 443, TCP 7881 e UDP 7882; nunca 5432/7880/8080/admin Caddy |
| UPnP, DMZ, gerência WAN | UPnP desativado; retirar DMZ do console se dispensável; Mac fora de DMZ; confirmar gerência WAN/firmware com a operadora |
| Mac/VM/IPv6 | Firewall ativo, serviços/compartilhamentos mínimos, regras IPv6 revisadas e acesso iniciado por contêineres à LAN bloqueado quando suportado |
| Dados | FileVault, backup cifrado externo e restauração ensaiada; guardar chave MFA e autoridade DNS |
| Capacidade | Medir com 2/4/8/16 participantes. Limites iniciais são guardas provisórias, não capacidade prometida. Uma tela a 8 Mbps para 15 pessoas pode consumir ~120 Mbps de upload mais overhead |
| ARM64 | Construir/executar no Mac, validar permissões e mídia. Build multiarch sem publicação está disponível por workflow_dispatch; não substitui teste WAN/OrbStack |

## Incidentes e riscos residuais

Em suspeita de comprometimento: feche as três regras no roteador, suspenda o agendador por `launchctl`, isole o host se necessário, preserve evidências privadas e recupere em ambiente confiável. Não execute scripts de um checkout suspeito. Revogue sessões/credenciais atingidas e só reabra após corrigir a causa e repetir os aceites. Não use `down -v` ou prune de volumes como resposta inicial.

Se o token DNS ou uma chave TLS vazou, recuperar o DNS e trocar o token não invalida certificados já emitidos. Reemita/revogue certificados conforme o incidente e verifique de outra rede. Nunca compartilhe JWTs, URLs de admissão, cookies, `.env`, dumps ou logs sem redigir.

Se o link saturar por DDoS, feche a exposição e acione a operadora; rate limits HTTP não limpam banda já esgotada. Hospedar app **e SFU** fora de casa, equipamento dedicado e E2EE são decisões separadas; nenhuma contratação ou mudança dessas foi feita automaticamente.

O IP público no DuckDNS e o nome no certificado são normais para hospedagem residencial. Não são segredos. HTTPS protege transporte; não oculta o IP nem torna a aplicação imune a falhas. Sem E2EE, o servidor/SFU continua sendo parte da confiança do conteúdo.

## Manutenção

Revisar avisos de segurança semanalmente e após alertas relevantes; executar CI/scans ao atualizar, renovar exceções somente com evidência e registrar versões do Mac/OrbStack/roteador privadamente. Guardar 7 backups diários e 4 semanais é uma proposta de retenção: apagar somente após confirmar cópia externa e teste de restauração. RPO 24 h/RTO 4 h são metas a medir com host/backup disponíveis, não garantias contra perda física ou DDoS.

As publicações prd do aplicativo/SFU são explicitamente IPv4. Isso não altera nem comprova o firewall IPv6 dos demais serviços do Mac.
