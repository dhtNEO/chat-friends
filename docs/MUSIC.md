# Bot de música

Entre na **Sala de estar** e use **Bot de música**: busque pelo nome ou cole um link público de vídeo do YouTube, escolha um resultado e clique em **Adicionar à fila**. Todos recebem o mesmo áudio pelo LiveKit, incluindo quem entra depois. Você continua podendo conversar e transmitir a tela durante a reprodução.

Qualquer pessoa conectada à voz pode adicionar, remover músicas da fila, pausar, continuar, pular e parar/limpar a fila. **Volume só para você** fica salvo neste navegador, separado dos volumes de voz e da transmissão. Silenciar a recepção também silencia a música; o volume geral de saída continua valendo.

Aceita vídeos públicos de até **20 minutos** e até **30 músicas aguardando**; playlists inteiras e transmissões ao vivo são recusadas. Se uma faixa falhar, o bot apresenta um aviso e tenta a seguinte. Quando a sala fica vazia por aproximadamente 30 segundos, ele sai e limpa a fila, mesmo se estiver pausado. A fila é temporária: reiniciar o serviço a limpa. O áudio passa por pipes e buffers pequenos, sem gravar arquivos de música no disco.

## Execução

O fluxo existente já inclui o serviço: `./scripts/up.sh` em desenvolvimento, ou `CHAT_MODE=prd ./scripts/up.sh` em produção. O build inicial baixa a imagem Python e instala FFmpeg, LiveKit RTC, yt-dlp/EJS e Node. Não exige chave da API do YouTube, serviço pago ou login do YouTube. Não há configuração nova no `.env`.

`configure.sh` gera `infra/compose/generated/music/control.key`, uma chave de controle derivada por HMAC com domínio próprio. O arquivo recebe modo 0644 antes da renomeação atômica. O diretório `generated` permanece 0700 no host; o subdiretório exclusivo `music` é 0755 para os processos sem privilégios. Backend e worker montam somente esse subdiretório, em `/run/music`, somente leitura. Nenhuma credencial de banco/MFA fica nesse mount. A autenticação do worker relê a chave em cada requisição: ambos acompanham substituições atômicas sem reter a chave de inicialização ou um inode antigo de bind mount individual. O worker recebe do backend um JWT que publica apenas áudio de microfone com identidade reservada, sem receber a chave de assinatura LiveKit e sem assinar credenciais. O JWT nunca é enviado ao navegador.

O container `music` não publica portas, roda sem root e sem capabilities, com sistema de arquivos somente leitura e `/tmp` temporário. Os controles internos exigem a chave dedicada; os controles públicos exigem login, CSRF para mutações, limite de frequência e conexão real de voz pertencente à sessão. O servidor LiveKit comporta 16 pessoas e esse participante adicional; isso não é benchmark de capacidade.

## Diagnóstico e limites

Se aparecer **Indisponível**, execute `CHAT_MODE=prd ./scripts/diagnose-music.sh` em produção ou `./scripts/diagnose-music.sh` em dev. Ele testa do backend para o bot e informa sucesso HTTP 200, chave divergente, falha de leitura da chave, DNS/conexão ou erro HTTP, sem imprimir chave ou corpo de resposta. Confira também os logs de `music`/`backend` (prefixe com `CHAT_MODE=prd` em produção). O backend registra somente `music_control operation=... reason=... status=...`: `authentication` identifica HTTP 401/403, `key_read`/`key_invalid` identificam a chave, `connection`/`transport`/`timeout` identificam comunicação e `response`/`response_size` identificam resposta inválida. Busca, JWT, cabeçalhos, URLs e corpo do bot não são registrados.

Um worker **healthy** pode continuar recusando o backend se os serviços tiverem recebido versões diferentes de um arquivo de chave montado individualmente. A atualização passa a usar um diretório dedicado compartilhado e leitura dinâmica da chave. Após o pull, execute **`CHAT_MODE=prd ./scripts/up.sh`** (ou `./scripts/up.sh` em dev) para reconstruir backend/music e aplicar os novos mounts em ambos. Isso preserva os dados do banco. O arquivo legado `generated/music-secret` não é usado pelos novos mounts e não precisa ser copiado. Não monte todo o diretório `generated` nos serviços.

Se o YouTube bloquear o IP do servidor, apresentar CAPTCHA, exigir autenticação ou restringir o vídeo por região/idade, aquela música pode falhar. Não são usados cookies pessoais nem tentativas de contornar essas restrições. Atualizações do YouTube podem exigir atualização do yt-dlp e repetição dos testes; a versão fica fixada em `music-bot/requirements.txt`.

O modo demo simula fila e controles, **sem reproduzir áudio do YouTube**. Execute `npm run demo` no frontend para trabalhar na interface. Os testes desse modo usam `MUSIC_DEMO_TEST=1 APP_TEST_URL=http://localhost:5173 npx playwright test tests/music.spec.ts`, com o servidor demo já iniciado e Chromium instalado.

Testes do worker: `docker build -t chat-friends-music-test music-bot` e `docker run --rm -v "$PWD/music-bot:/app:ro" chat-friends-music-test python -m unittest discover -s /app -v`. Eles verificam isolamento da API, validação de links, limites, avanço após falha, cancelamento, leitura fragmentada de metadados e a corrida entre enfileirar e desconectar. Os testes de backend verificam vínculo à sessão de voz e permissões/admissão da identidade do bot. Não equivalem a testar uma música real contra os serviços externos.

Referências de implementação: [LiveKit raw audio](https://docs.livekit.io/transport/media/raw-tracks/), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [JavaScript/EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

## Beat Club

O bot também prepara e publica um trecho de até 5 minutos para as salas de ritmo. Durante a sessão, músicas e controles normais ficam reservados ao jogo; o volume continua individual. Preparação analisa o próprio PCM que será transmitido, sem guardar arquivo, usando fluxo espectral multibanda com limiar local e resolução de 10 ms. O detector está em `music-bot/rhythm.py`, copiado junto com o worker na imagem. Fluxo, limites e diagnóstico em [PARTY_GAMES.md](PARTY_GAMES.md). Rebuild do worker é necessário para disponibilizar as novas rotas privadas.

Regressão de comunicação real: após construir a imagem, execute `MUSIC_TEST_IMAGE=chat-friends-music python3 scripts/tests/music-control.py`. O teste cria rede e containers descartáveis, usa uma chave sintética e verifica Java → bot antes/depois de rotação atômica, rejeição da chave antiga, healthcheck e diagnóstico sem exposição de segredos. A imagem Java padrão é `maven:3.9.11-eclipse-temurin-25`; pode ser selecionada por `MUSIC_TEST_JAVA_IMAGE`. Não consulta YouTube nem modifica a stack existente.
