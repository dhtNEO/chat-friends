# Bot de música

Entre na **Sala de estar** e use **Bot de música**: busque pelo nome ou cole um link público de vídeo do YouTube, escolha um resultado e clique em **Adicionar à fila**. Todos recebem o mesmo áudio pelo LiveKit, incluindo quem entra depois. Você continua podendo conversar e transmitir a tela durante a reprodução.

Qualquer pessoa conectada à voz pode adicionar, remover músicas da fila, pausar, continuar, pular e parar/limpar a fila. **Volume só para você** fica salvo neste navegador, separado dos volumes de voz e da transmissão. Silenciar a recepção também silencia a música; o volume geral de saída continua valendo.

Aceita vídeos públicos de até **20 minutos** e até **30 músicas aguardando**; playlists inteiras e transmissões ao vivo são recusadas. Se uma faixa falhar, o bot apresenta um aviso e tenta a seguinte. Quando a sala fica vazia por aproximadamente 30 segundos, ele sai e limpa a fila, mesmo se estiver pausado. A fila é temporária: reiniciar o serviço a limpa. O áudio passa por pipes e buffers pequenos, sem gravar arquivos de música no disco.

## Execução

O fluxo existente já inclui o serviço: `./scripts/up.sh` em desenvolvimento, ou `CHAT_MODE=prd ./scripts/up.sh` em produção. O build inicial baixa a imagem Python e instala FFmpeg, LiveKit RTC, yt-dlp/EJS e Node. Não exige chave da API do YouTube, serviço pago ou login do YouTube. Não há configuração nova no `.env`.

`configure.sh` gera `infra/compose/generated/music-secret`, uma chave de controle derivada por HMAC com domínio próprio. O arquivo é legível pelo container sem privilégios (0644), dentro do diretório privado `generated` (0700); não o mova para um diretório público. Backend e worker montam somente esse arquivo. O worker recebe do backend um JWT que publica apenas áudio de microfone com identidade reservada, sem receber a chave de assinatura LiveKit e sem assinar credenciais. O JWT nunca é enviado ao navegador.

O container `music` não publica portas, roda sem root e sem capabilities, com sistema de arquivos somente leitura e `/tmp` temporário. Os controles internos exigem a chave dedicada; os controles públicos exigem login, CSRF para mutações, limite de frequência e conexão real de voz pertencente à sessão. O servidor LiveKit comporta 16 pessoas e esse participante adicional; isso não é benchmark de capacidade.

## Diagnóstico e limites

Se aparecer **Indisponível**, confira `./scripts/compose.sh ps` e os logs de `music`/`backend` (prefixe com `CHAT_MODE=prd` em produção). Se o YouTube bloquear o IP do servidor, apresentar CAPTCHA, exigir autenticação ou restringir o vídeo por região/idade, aquela música pode falhar. Não são usados cookies pessoais nem tentativas de contornar essas restrições. Atualizações do YouTube podem exigir atualização do yt-dlp e repetição dos testes; a versão fica fixada em `music-bot/requirements.txt`.

O modo demo simula fila e controles, **sem reproduzir áudio do YouTube**. Execute `npm run demo` no frontend para trabalhar na interface. Os testes desse modo usam `MUSIC_DEMO_TEST=1 APP_TEST_URL=http://localhost:5173 npx playwright test tests/music.spec.ts`, com o servidor demo já iniciado e Chromium instalado.

Testes do worker: `docker build -t chat-friends-music-test music-bot` e `docker run --rm -v "$PWD/music-bot:/app:ro" chat-friends-music-test python -m unittest discover -s /app -v`. Eles verificam isolamento da API, validação de links, limites, avanço após falha, cancelamento, leitura fragmentada de metadados e a corrida entre enfileirar e desconectar. Os testes de backend verificam vínculo à sessão de voz e permissões/admissão da identidade do bot. Não equivalem a testar uma música real contra os serviços externos.

Referências de implementação: [LiveKit raw audio](https://docs.livekit.io/transport/media/raw-tracks/), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [JavaScript/EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS).
