# Contrato HTTP e WebSocket

Mesma origem do frontend. JSON UTF-8, exceto login (form) e webhook (JSON bruto). Antes de login e após login, obtenha `GET /api/csrf`; envie `X-CSRF-TOKEN` em POST/PUT/PATCH/DELETE. Cookie `SESSION`, HttpOnly, SameSite=Strict; Secure quando COOKIE_SECURE=true. Sessão inativa expira em 12 h. Sem CORS aberto.

| Método/caminho | Corpo / resultado |
|---|---|
| GET /api/health | público, consulta DB, `{status:"ok"}` |
| GET /api/csrf | público, `{token,headerName}` |
| POST /api/login | form `username,password`; 204 ou 401/429 |
| POST /api/logout | 204; invalida sessão |
| GET /api/me | `{user:{id,username,displayName,admin,enabled,primaryColor,secondaryColor,avatarVersion},spaceName}` |
| POST /api/password | `{currentPassword,password}`; invalida todas as sessões e solicita expulsão |
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
| GET /api/media/state | `{lease:{identity,leaseId,expiresAt},participants:[{identity,name,micMuted,deaf}]}` |
| POST /api/media/screen | `{identity}`; reserva ou 409 |
| POST /api/media/screen/heartbeat | `{identity,leaseId}`; renovar antes de 30 s |
| DELETE /api/media/screen | `{identity,leaseId}`; liberação idempotente |
| POST /api/media/screen/force-stop | admin; revoga a tela atual |
| GET /api/livekit/admit | usado pelo Caddy; JWT no Authorization ou URI encaminhada; retorna X-Media-Authorization restrito, nunca concede fonte de tela |
| POST /api/livekit/webhook | corpo bruto + Authorization assinado pelo LiveKit; única exceção CSRF |

Mensagem: `{id,clientId,authorId,author,body,createdAt}`. `createdAt` ISO-8601 UTC; interface converte ao fuso do navegador. Corpo 1–4000 unidades UTF-16, não vazio; texto puro. Limite 20 mensagens/10 s por conta. Reenvio idempotente não consome limite. Identificador idempotente por autor; corpo divergente dá 409. Sem edição/exclusão no MVP.

Usuário: 3–32 caracteres `[a-z0-9][a-z0-9_.-]{2,31}`. Nome 1–64. Senha 12 caracteres a 72 bytes UTF-8, BCrypt custo 12. Login limitado a 8 tentativas/5 min por nome e 100/5 min por IP visto pelo backend (atrás do proxy, limite compartilhado). Não confiamos em X-Forwarded-For arbitrário.

WebSocket `/ws`: sessão autenticada, `Origin` exatamente APP_ORIGIN. Cliente envia texto `ping` a cada 10 s; servidor responde `{"type":"pong"}`. Eventos: `{"type":"message","message":...}`, `{"type":"presence","users":["username"]}` e `{"type":"profile"}` (alguém mudou nome, foto ou cores: recarregar `/api/members` e `/api/me`). Presença deduplicada por conta entre abas. Não é protocolo de envio do chat. Ao reconectar recuperar histórico HTTP; WebSocket não é fila durável.

401: sem sessão/conta desativada. 403: CSRF, origem ou autorização. 400: entrada inválida. 409: conflito/lease/sala cheia. 429: limite. 503: SFU indisponível ou revogação pendente. A interface não deve repetir POST de chat com novo UUID quando a resposta é incerta. Atualizar senha/desativar pode ter sido aplicado mesmo se a expulsão de mídia retornar 503; a reconciliação continuará.

As identidades de mídia são geradas pelo servidor e vinculadas à conta e sessão. Duas abas usam identidades diferentes; ocupam duas das 16 conexões. O cliente não escolhe sala, privilégios administrativos nem permissão de câmera.

`micMuted` vem da publicação de microfone na SFU; `deaf` é estado declarado pelo cliente autenticado e pode levar até 5 s para aparecer nos outros clientes. Não é prova de que o dispositivo físico está sem som. Ganho de microfone e volumes de recepção ficam no cliente, não alteram os ajustes de outros usuários. `screen` informa tetos de até 1080p/30 fps/8 Mbps; resolução efetiva depende da captura e da conexão.

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
