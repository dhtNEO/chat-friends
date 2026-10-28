# Segurança e limites

Modelo: espaço privado para amigos convidados. Ameaças incluem visitantes anônimos, CSRF/XSS, reutilização de credenciais, abuso por participante, falhas de rede e perda do host. Não é serviço de alta disponibilidade nem comunicação com criptografia ponta a ponta: TLS/DTLS-SRTP protege transporte, servidor/SFU são confiáveis.

- Senhas BCrypt custo 12, sem senha padrão. Rate limit persistente. Nomes inválidos e senhas longas recusados; limite 72 bytes evita truncamento BCrypt.
- Sessões JDBC, cookie HttpOnly/SameSite=Strict/Secure em HTTPS, CSRF inclusive login/logout e origem exata WebSocket.
- Histórico e tokens exigem sessão. Admin verificado pelo Spring Security; identidade da mídia também conferida no banco.
- React renderiza mensagens como texto, CSP restringe scripts e, em prd, permite conexões HTTPS/WSS apenas à própria origem e ao domínio/porta de mídia configurados; consultas SQL parametrizadas. Corpos limitados; nenhuma anexação ou HTML.
- Logs operacionais não registram conteúdo do chat, senhas ou JWTs. Não habilite access logs com query string do LiveKit nem DEBUG de SDKs. LiveKit pode transportar JWT em query de sinalização.
- `.env`, configurações geradas e backups são ignorados no Git. Arquivos 0600 e diretório gerado 0700. Administrador de Docker/root pode ler segredos; não conceda esse acesso a usuários da aplicação.
- PostgreSQL/backend somente rede Compose; no modo prd apenas `/rtc` da SFU é encaminhado. API administrativa LiveKit, métricas e Caddy admin não ficam públicos.

## Desativação, logout e senha

Desativação/redefinição elimina todas as sessões da conta no banco, fecha sockets de chat e pede remoção das identidades no LiveKit. Senha alterada pelo usuário faz o mesmo. Logout invalida a sessão atual; UI desconecta mídia e a reconciliação verifica sessão a cada 3 s. Se LiveKit estiver indisponível, remoção é repetida. Uma conexão já estabelecida não termina só porque o token inicial de 90 s expirou.

## Voz no navegador: sinalização e WebAssembly

A sinalização do LiveKit usa o mesmo host da página (`/rtc`, roteado pelo proxy web com `forward_auth` em `/api/livekit/admit`). Com app e mídia em hosts diferentes sob `duckdns.org` (sufixo público), o WebSocket contava como de terceiro e a regra `||duckdns.org^$third-party,websocket` da EasyPrivacy (padrão no uBlock Origin, uBO Lite e Brave) impedia entrar na voz. O host de mídia continua configurado e funcionando para compatibilidade.

A CSP inclui `'wasm-unsafe-eval'` em `script-src` apenas para compilar o WebAssembly do RNNoise (supressão de ruído local). Não habilita `eval` de JavaScript nem scripts externos. Se uma CSP sem essa permissão for servida, o app detecta a falha ao compilar e mantém o microfone sem o filtro, em vez de transmitir silêncio. O áudio filtrado não sai do navegador para nenhum serviço.

## Perfil, fotos e preferências locais

Trocar o usuário de login muda a identidade da sessão: o backend apaga as sessões JDBC da conta, fecha WebSockets e remove conexões de mídia, como na troca de senha. Fotos de perfil ficam no PostgreSQL (entram no backup), limitadas a 16 KB e aos tipos PNG/JPEG/WebP conferidos pelos bytes iniciais; SVG e outros tipos são recusados. Só usuários autenticados as leem, e só de contas ativas; respostas da API mantêm `X-Content-Type-Options: nosniff` e CSP `default-src 'none'`. Sons personalizados e tamanho da interface ficam apenas no `localStorage` do navegador, nunca no servidor; são tocados como `blob:`, permitido por `media-src`.

## Exclusividade de tela: garantia e lacuna conhecida

A lease única é serializada por lock transacional PostgreSQL. Concessão exige participante conectado e sessão ativa; fontes iniciais apenas microfone. Transmissor anterior é revogado antes do próximo. Falha de revogação bloqueia concessão. Heartbeat expira em 30 s; ausência de conexão/sessão e eventos disparam reconciliação. Não há mock nesse fluxo.

O proxy de sinalização chama `GET /api/livekit/admit` antes de cada conexão. A admissão verifica assinatura/issuer/expiração, sala, conta, sessão e identidade; emite um token substituto **somente de microfone**. Caddy substitui Authorization no upstream, que tem precedência sobre access_token na versão LiveKit fixada (verificado em auth.go oficial). A porta 7880 não é publicada, inclusive no modo dev: não há rota pública para contornar a admissão. Assim, um JWT antigo com screen_share não restaura essa permissão numa nova conexão. Em resume de participante existente, a permissão corrente da SFU prevalece; a revogação anterior continua válida. Reconexão completa interrompe a tela, que deve ser iniciada novamente. Não habilite acesso direto à sinalização 7880.

**Limitação residual:** um cliente modificado que já possui a lease pode tentar publicar múltiplas tracks da mesma fonte. A SFU permite isso; o reconciliador remove o participante ao detectar mais de uma track de tela. Não há prova de zero sobreposição transitória nesse abuso de um único transmissor, nem atomicidade distribuída entre banco e SFU. Polling nominal 3 s pode demorar mais sob falha. O requisito de exclusividade adversarial estrita de tracks permanece parcialmente aberto; as corridas entre reservas, reuso de tokens elevados e troca de dono têm proteções específicas. O perfil LiveKit Cloud direto precisa de revisão equivalente: não herda automaticamente a admissão do proxy self-hosted.

Os testes de corrida verificam duas reservas normais, expiração, revogação antes da nova concessão e falha fechada. Webhooks têm JWT/issuer/expiração/hash do corpo verificados pelo SDK oficial. Duplicados/fora de ordem apenas solicitam leitura autoritativa; não são autoridade para liberar uma lease nova.

## Rotação

Faça backup; coloque em manutenção; pare web/backend/livekit. Gere novas chaves LiveKit e segredo de banco fora do Git. Trocar senha PostgreSQL exige `ALTER ROLE` pelo canal administrativo seguro **e** atualização de `.env`: mudar env sozinho não altera senha de um volume existente. Reinicie SFU (encerra chamadas), gere config, recrie serviços; invalide sessões se houver comprometimento. Não copie segredos para scripts, histórico ou Terraform. Em caso de vazamento, trate backups/relatórios de testes como possivelmente afetados.

Reporte vulnerabilidade de forma privada ao proprietário; não abra issue pública com token, senha, dump ou dados pessoais. Sem processo de divulgação público configurado ainda.

## Endurecimento operacional

Veja [SECURITY_UPGRADE.md](SECURITY_UPGRADE.md): migração de privilégios do banco, MFA obrigatório para administradores em prd, expiração/revogação de sessões, limites de requests e sockets, segmentação, helper com escrita mínima, backups autenticados e procedimentos de incidente. DNS/IP públicos são esperados; autoridade DNS, sessões e chaves continuam privados. As verificações de roteador/Mac/ARM64 e bloqueio de acesso à LAN precisam de aceite do proprietário.
