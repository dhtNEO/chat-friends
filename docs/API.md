# Contrato HTTP e WebSocket

Mesma origem do frontend. JSON UTF-8, exceto login (form), upload de avatar (binário) e webhook (JSON bruto). Antes de login e após login, obtenha `GET /api/csrf`; envie `X-CSRF-TOKEN` em POST/PUT/PATCH/DELETE. Cookie `SESSION`, HttpOnly, SameSite=Strict; Secure quando COOKIE_SECURE=true. Sessão inativa expira em 2 h, com prazo absoluto de 8 h. Sem CORS aberto.

| Método/caminho | Corpo / resultado |
|---|---|
| GET /api/health | público, consulta DB, `{status:"ok"}` |
| GET /api/csrf | público, `{token,headerName}` |
| POST /api/login | form `username,password`; 204 ou 401/429 |
| POST /api/logout | 204; invalida sessão |
| GET /api/me | `{user:{id,username,displayName,admin,enabled,primaryColor,secondaryColor,avatarVersion},spaceName,security:{mfaEnabled,mfaPending,enrollmentRequired}}` |
| POST /api/password | `{currentPassword,password}`; invalida todas as sessões e solicita expulsão |
| GET /api/me/shortcuts?platform=mac\|other | atalhos da própria conta para o perfil: `{platform,revision,enabled,allowWhileTyping,bindings:[{action,code,ctrl,alt,shift,meta}]}`; sem registro salvo, `{revision:0,enabled:true,allowWhileTyping:false,bindings:[]}` |
| PUT /api/me/shortcuts | `{platform,revision,enabled,allowWhileTyping,bindings}`; conta sempre da sessão. `revision` = última lida (0 na primeira gravação); divergente → 409 "Atalhos alterados em outra sessão; recarregue". Devolve o objeto salvo com `revision+1`. Até 12 atalhos; `action` em `toggleMic`, `toggleDeaf`, `pushToTalk`, `leaveVoice`, `toggleStreamSound`; `code` é `KeyboardEvent.code` (`[A-Za-z0-9]{1,24}`), exige Ctrl, Alt ou Meta (exceto F13–F24), recusa modificador isolado, ação ou combinação repetida (400). Limite 30 gravações/min por conta |
| GET /api/members | contas ativas: `[{id,username,displayName,avatarVersion}]` |
| PATCH /api/profile | `{displayName?,username?,primaryColor?,secondaryColor?}`; cores `#rrggbb` ou `""` para padrão; devolve `{user,signedOut}`. Trocar `username` (único, mesmo formato da criação) encerra todas as sessões da conta |
| POST /api/profile/avatar | corpo binário `image/png`, `image/jpeg` ou `image/webp` (conferidos pelos bytes iniciais), até 16 KB; o navegador recorta e reduz antes |
| DELETE /api/profile/avatar | remove a foto |
| GET /api/avatars/ID | imagem da conta ativa; `Cache-Control: private, max-age=31536000` (a URL leva `?v=avatarVersion`) |
| GET /api/messages | últimas 50, ordem crescente |
| GET /api/messages?before=ID | até 50 anteriores, ordem crescente |
| GET /api/messages?after=ID | até 100 posteriores; repetir até página menor que 100 |
| POST /api/messages | `{clientId:UUID,body}`; ACK com mensagem após commit |
| GET /api/admin/accounts | lista; somente administrador |
| POST /api/admin/accounts | `{username,displayName,password}`; cria usuário comum |
| PATCH /api/admin/accounts/USERNAME | `{enabled?,password?}`; invalida sessões; admin não pode ser desativado |
| POST /api/media/join | `{}`; `{identity,token,url,screen:{bitrate,height,fps}}` |
| POST /api/media/heartbeat | `{identity}` a cada 10 s |
| PUT /api/media/audio | `{identity,deaf:boolean}`; estado de recepção da própria conexão/sessão, sem mudar permissões |
| POST /api/media/leave | `{identity}` |
| GET /api/media/state | `{leases:[{identity,leaseId,expiresAt}],participants:[{identity,name,micMuted,deaf}]}` |
| POST /api/media/screen | `{identity}`; retorna `{identity,leaseId,expiresAt}`; idempotente por conexão, até 3 reservas simultâneas ou 409 |
| POST /api/media/screen/heartbeat | `{identity,leaseId}`; renovar antes de 30 s |
| DELETE /api/media/screen | `{identity,leaseId}`; liberação idempotente |
| POST /api/media/screen/force-stop | admin; `{identity,leaseId}`; revoga somente a reserva indicada, idempotente |
| GET /api/livekit/admit | usado pelo Caddy; JWT no Authorization ou URI encaminhada; retorna X-Media-Authorization restrito, nunca concede fonte de tela |
| POST /api/livekit/webhook | corpo bruto + Authorization assinado pelo LiveKit; única exceção CSRF |

Mensagem: `{id,clientId,authorId,author,body,createdAt}`. `createdAt` ISO-8601 UTC; interface converte ao fuso do navegador. Corpo 1–4000 unidades UTF-16, não vazio; texto puro. Limite 20 mensagens/10 s por conta. Reenvio idempotente não consome limite. Identificador idempotente por autor; corpo divergente dá 409. Sem edição/exclusão no MVP.

Usuário: 3–32 caracteres `[a-z0-9][a-z0-9_.-]{2,31}`. Nome 1–64. Senha 12 caracteres a 72 bytes UTF-8, BCrypt custo 12. Login limitado a 8 tentativas/5 min por nome e 100/5 min por IP visto pelo backend. O endereço encaminhado só é aceito da cadeia de proxies validada pela chave compartilhada; não confiamos em X-Forwarded-For arbitrário.

WebSocket `/ws`: sessão autenticada, `Origin` exatamente APP_ORIGIN. Cliente envia texto `ping` a cada 10 s; servidor responde `{"type":"pong"}`. Eventos: `{"type":"message","message":...}`, `{"type":"presence","users":["username"]}` e `{"type":"profile"}` (alguém mudou nome, foto ou cores: recarregar `/api/members` e `/api/me`). Presença deduplicada por conta entre abas. Não é protocolo de envio do chat. Ao reconectar recuperar histórico HTTP; WebSocket não é fila durável.

401: sem sessão/conta desativada. 403: CSRF, origem ou autorização. 400: entrada inválida. 409: conflito/lease/sala cheia. 429: limite. 503: SFU indisponível ou revogação pendente. A interface não deve repetir POST de chat com novo UUID quando a resposta é incerta. Atualizar senha/desativar pode ter sido aplicado mesmo se a expulsão de mídia retornar 503; a reconciliação continuará.

### Tratamento no cliente (T02)

A sessão distingue `loading`, `anonymous`, `authenticated` e `unavailable`. Falha inicial de `GET /me` por 5xx/rede/timeout oferece **Tentar novamente**, sem apresentar login como se a sessão tivesse expirado. Durante uso, falhas de `/me` preservam o espaço montado e os rascunhos; a recuperação consulta apenas `/me`. Um 401 autenticado encerra identidade e desmonta os recursos de mídia. 403 informa falta de permissão sem encerrar a conta; 428 abre confirmação de identidade (senha e TOTP quando habilitado), sem repetir a operação original. O 401 do formulário de login informa credenciais inválidas.

`api(path, method, body, {signal?, timeoutMs?})` e `upload(path, blob, {signal?, timeoutMs?})` compartilham `ApiError`: `status` HTTP (0 para falha sem resposta), `code` e `retryAfter` em **milissegundos** ou null. Códigos: `UNAUTHENTICATED`, `FORBIDDEN`, `REAUTH_REQUIRED`, `RATE_LIMITED`, `UNAVAILABLE`, `NETWORK`, `TIMEOUT`, `ABORTED` e `HTTP_<status>` para outros erros. Login, CSRF e upload usam a mesma classificação. Cancelamento explícito e resposta de uma sessão anterior usam `ABORTED`; respostas antigas não encerram nem substituem a conta atual.

O cliente interpreta `Retry-After` em segundos ou data HTTP em 429/5xx e impede novo envio ao mesmo método/caminho durante a espera (independente da query), preservando o status original. Não agenda reenvio automático. Sem header válido, a mensagem de limite orienta aguardar. O botão de recuperação de sessão permanece desabilitado até o prazo expirar.

Timeouts abrangem obtenção de headers e leitura do corpo: padrão **15 s**, buscas `/music/search` e `/party/music/search` **60 s**, preparação `POST /party/{id}/start` **120 s**, upload de avatar **60 s**. O chamador pode ajustar `timeoutMs`; a obtenção prévia de CSRF é uma requisição separada. Timeout/erro de rede não prova que uma mutação falhou no servidor: verificar o resultado antes de repetir. O transporte não repete mutações, nem após renovar a identidade; preservar `clientId` nos fluxos idempotentes existentes.

As identidades de mídia são geradas pelo servidor e vinculadas à conta e sessão. Duas abas usam identidades diferentes; ocupam duas das 16 conexões. O cliente não escolhe sala, privilégios administrativos nem permissão de câmera.

`micMuted` vem da publicação de microfone na SFU; `deaf` é estado declarado pelo cliente autenticado e pode levar até 5 s para aparecer nos outros clientes. Não é prova de que o dispositivo físico está sem som. Ganho de microfone e volumes de recepção ficam no cliente, não alteram os ajustes de outros usuários. `screen` informa tetos de até 1080p/60 fps/8 Mbps; resolução efetiva depende da captura e da conexão.

## Autenticação adicional e sessões

`GET /api/me` inclui `security: {mfaEnabled,mfaPending,enrollmentRequired}`. Enquanto houver segundo fator pendente/inscrição obrigatória, apenas me/CSRF/logout e endpoints MFA estão liberados; chat, WebSocket, administração e mídia continuam bloqueados.

| Método/rota | Corpo / resposta |
|---|---|
| POST `/api/security/mfa/setup` | `{password}` → chave TOTP para inscrição manual; confirmar em até 10 min |
| POST `/api/security/mfa/confirm` | `{code}` → `{recoveryCodes}` uma única vez; invalida outras sessões |
| POST `/api/security/mfa/verify` | `{code}` TOTP ou recuperação; rotaciona ID de sessão |
| POST `/api/security/reauth` | `{password,code?}`; MFA quando ativado; vale por 15 min |
| GET `/api/security/sessions` | Sessões próprias: ID de gerenciamento (não cookie), datas e flag current |
| DELETE `/api/security/sessions/{id}` | Revoga somente sessão da própria conta |

Mantém CSRF para mutações. HTTP 428 em mutação administrativa exige confirmar identidade em Segurança e repetir a ação explicitamente. Login tem inatividade de 2 h e TTL absoluto de 8 h; replay TOTP/recuperação é recusado.

Heartbeat/estado de áudio de uma conexão expirada retorna 409 e exige nova entrada na voz. HTTP 401 continua representando autenticação/sessão inválida; perder uma conexão de mídia não deve encerrar o login do chat.

## Bot de música

Rotas autenticadas: `GET /api/music/state` retorna `{status,current,queue,error,elapsed}`; `GET /api/music/search?identity=...&q=...` busca até cinco músicas; `POST /api/music/queue` recebe `{identity,videoId}`; `POST /api/music/control` recebe `{identity,action}` (`pause`, `resume`, `skip`, `stop`); `DELETE /api/music/queue/{id}` recebe `{identity}`. Mutação exige CSRF. Busca e controles exigem conexão de voz ativa na mesma sessão e participante presente na SFU. Nenhum token/chave do bot aparece nas respostas. A fila não persiste em reinícios; veja [MUSIC](MUSIC.md).

## Clube da Sorte

Carteira, giros gratuitos e salas de Roleta Royale: contratos, autenticação e limites em [GAMES.md](GAMES.md).

## Blackjack Social e Beat Club

Rotas autenticadas `/api/party`, mãos de blackjack, prontidão e acertos de ritmo: contratos e regras em [PARTY_GAMES.md](PARTY_GAMES.md). A música exige conexão de voz pertencente à mesma conta/sessão.

## Outlook

Calendário compartilhado autenticado: listagem por intervalo, criação de jogatinas, edição/cancelamento pelo criador ou administrador e respostas individuais de presença. Rotas e contratos em [OUTLOOK.md](OUTLOOK.md#api-autenticada). Requer o esquema de agenda da V11 (linha de jogos) ou V12 (integração com atalhos).

### Recuperação do chat no cliente (T03)

O cursor de recuperação é o último ID confirmado por uma página HTTP válida e completa. O maior ID observado por WS ou ACK é separado e nunca substitui esse cursor. A abertura carrega as últimas 50 mensagens e consulta `after`; reconexões e novos eventos consultam `after` a partir do cursor confirmado, em uma única sequência de páginas. IDs podem ter lacunas de sequências/rollbacks; não exigir IDs consecutivos. O lock de gravação e o ACK após commit permanecem no servidor.

Durante sincronização ou falha, eventos entram em buffer deduplicado por ID; páginas e buffer são integrados em ordem crescente, sem duplicar a lista. O buffer retém no máximo 1000 mensagens; excedentes continuam recuperáveis por HTTP e o maior ID observado permanece como alvo. Eventos próximos são agrupados por 250 ms antes da leitura. Envelopes WS inválidos são ignorados; páginas HTTP inválidas não avançam o cursor e entram no fluxo de recuperação.

Falhas de leitura são repetidas mesmo com WS aberto: backoff de 1 s, dobrando até 30 s, com jitter adicional de 0–20%, respeitando o maior prazo de `Retry-After`. Reconectar não antecipa uma espera vigente. 401, 403, 428 e cancelamento não recebem retentativa automática por timer. Não se acrescenta reenvio de mutações; preservar o `clientId` nas retentativas idempotentes já existentes. Nenhuma mudança de esquema ou protocolo HTTP/WS.

O indicador distingue **Conectando…**, **Sincronizando…**, **Atualizado** e **Chat indisponível**. Uma falha de sincronização fica no indicador do chat e é limpa ao atualizar. Logout aborta leituras/envios pendentes, cancela timers e descarta handlers/respostas da geração anterior, inclusive callbacks já capturados antes do fechamento do socket.
