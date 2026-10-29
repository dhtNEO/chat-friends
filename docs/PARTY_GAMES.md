# Blackjack Social e Beat Club

Abra **Jogos** e encontre os dois novos cartões abaixo da roleta e do caça-níquel. Ambos usam salas de **2 a 8 pessoas**, convites no #geral, código para entrar e confirmação de prontidão. Cada conta ocupa no máximo uma sala ativa entre roleta, blackjack e ritmo. A chamada e o chat continuam acessíveis.

## Blackjack Social

Cada rodada custa **10 Coins por pessoa**, debitadas ao clicar em **Confirmar entrada · 10 Coins**. Criar ou entrar no lobby não cobra: cada participante confirma sua própria entrada antes de o anfitrião distribuir as cartas. Saldo insuficiente impede a confirmação. Sair do lobby ou perder presença antes da distribuição devolve as 10 Coins, sem consumir o limite diário de prêmios. Depois das cartas, a entrada não é devolvida.

A mesma sala permite jogar várias rodadas: após o resultado, o anfitrião clica em **Abrir próxima rodada**. Código, convite e participantes permanecem; mãos e confirmações são limpas, e cada pessoa decide se paga a próxima entrada. Ninguém é cobrado automaticamente. Participantes que já entraram em outra sala ativa deixam a mesa anterior ao reabrir.

O jogo tem ações **pedir carta** e **parar**. Todos jogam contra a mesma banca, com mãos independentes e decisões simultâneas. Cada rodada usa seis baralhos embaralhados por SecureRandom. Ás vale 11 ou 1; figuras valem 10. A banca mantém uma carta oculta até o fim e para em 17, incluindo ás suave.

A rodada termina quando todos pararam/estouraram ou após 45 segundos. No prazo final, as mãos restantes param automaticamente e a banca completa a sua. O navegador nunca recebe o baralho, sua ordem ou a carta oculta. Cada jogador vê somente sua própria mão durante a rodada. O servidor omite cartas, total e resultado dos adversários até o encerramento. Ao final, todas as mãos são reveladas, com vitória, empate, derrota ou estouro de cada participante; quem saiu aparece sem premiação. A leitura da fase e das mãos usa o mesmo lock das ações, evitando revelar cartas da próxima rodada durante a troca de fase.

| Resultado da mão | Prêmio bruto em Coins |
|---|---:|
| Blackjack natural (21 com duas cartas), sem natural da banca | 30 |
| Vitória contra a banca | 20 |
| Empate | 8 |
| Derrota | 3 |
| Estouro | 2 |

Os prêmios acima não incluem devolução da entrada: por exemplo, vitória de 20 Coins após entrada de 10 resulta em ganho líquido de 10. O limite diário pode reduzir a premiação.

O blackjack natural da banca vence 21 feito com mais cartas. Duas mãos naturais empatam. Sair explicitamente antes da conclusão exclui o jogador da premiação; recarregar a página recupera a mão da conta. As ações possuem clientId: repetir uma requisição não compra outra carta. Cada rodada tem seu próprio UUID; cobrança, devolução e premiação são idempotentes. Ações de cartas, confirmação de entrada e abertura da próxima rodada exigem o roundId atual; requisições atrasadas de outra rodada são rejeitadas. O pagamento acontece uma vez por pessoa e rodada, em transação, e usa o limite compartilhado de 500 Coins gratuitas por dia UTC.

## Beat Club: música escolhida, notas extraídas do áudio

1. Entre na sala de voz. No cartão Beat Club, pesquise uma música ou cole um link do YouTube, usando o bot existente.
2. Selecione o resultado e crie a sala. Convide os amigos; todos devem estar na voz e confirmar prontidão.
3. O anfitrião prepara a partida. O bot precisa estar livre, sem música ou fila normal. Ele reserva seu controle para a sessão e prepara **até os primeiros 5 minutos** da faixa; preparação pode levar até dois minutos.
4. O bot decodifica esse trecho em PCM, detecta ataques de energia no áudio e gera notas de quatro pistas. O mesmo PCM analisado é publicado na chamada: não é uma sequência aleatória gerada apenas a partir de um BPM. Trechos com menos de quinze segundos ou poucas batidas identificáveis são rejeitados; escolha outra música.
5. Após a contagem, pressione **D, F, J, K**, ou toque nos quatro botões do celular. Ajuste a sincronia visual conforme o que você ouve. Todos recebem os mesmos tempos e pistas.
6. Ao terminar a reprodução confirmada pelo bot, o servidor publica os resultados e entrega as Coins.

O trecho é limitado a 57,6 MB de PCM em memória (48 kHz, estéreo, 16 bits), sem arquivo ou cache persistente. Há uma única sessão de jogo no bot. Buffers de leitura são liberados antes da análise; em máquinas little-endian, a análise usa uma visão do PCM sem copiar as amostras. O limite do container permanece 512 MB. A detecção roda fora do event loop e gera até 1.200 notas distribuídas pelo trecho inteiro; o prazo da reserva acompanha a duração, com margem de 45 segundos. Músicas maiores usam apenas os primeiros cinco minutos; menores usam sua duração disponível. A análise usa somente bibliotecas padrão do Python. URLs de mídia resolvidas, token LiveKit e segredo interno não vão para o navegador. O bot usa a publicação privada de áudio já existente.

### Pontuação, latência e moedas

O servidor recebe o índice da nota e a pista pressionada, nunca uma pontuação do cliente. A hora de chegada é comparada ao início persistido + tempo da nota + referência de 150 ms de reprodução/transporte. Precisão de até 80 ms recebe 100 pontos; até 160 ms, 70; até 240 ms, 40. Pista errada ou pressão fora dessas janelas não pontua. Cada nota só pode ser registrada uma vez por jogador. Notas saltadas quebram a sequência no próximo acerto; repetição automática de teclado é ignorada pela interface.

Ajuste de sincronia é **visual**, de -200 a +200 ms. Latência de rede e reprodução influenciam o resultado; essa versão é uma competição casual, sem alegação de sincronização musical profissional ou prevenção absoluta de automação.

São necessários pelo menos três acertos para receber Coins. Recompensa: 3 Coins de participação + até 27 proporcionais à pontuação máxima do trecho + 10 para a maior pontuação. Empates compartilham o bônus; máximo de 40 Coins por pessoa, dentro do limite diário de emissões gratuitas. Sem acertos suficientes ou com reprodução interrompida, não há prêmio. A roleta continua pagando seus retornos sem esse teto diário.

### Reserva do bot e falhas

Durante a partida o bot rejeita novas músicas e controles de pausa/troca/parada. O painel de música indica a reserva e mantém o volume individual disponível. A reprodução é compartilhada na sala de voz existente: os demais ouvintes também podem escutar o trecho.

Reserva, preparação, início e liberação usam o UUID da sala. Repetições não iniciam dois publicadores. Uma liberação de outra sessão não interrompe a atual, e liberar uma sessão vazia não afeta a música normal. A reserva tem prazo de segurança e é liberada após resultado/cancelamento, falha ou reinício. Se o worker reiniciar ou não concluir o áudio, a partida é cancelada sem premiação artificial.

O backend verifica presença e conexão de voz antes e depois da preparação. Não é possível usar a identidade de voz de outra conta/sessão. Lobby expira sem presença por trinta segundos ou após dez minutos. A preparação expira em 150 segundos; o worker também limpa sua reserva por prazo próprio. Controles de cartas e sessões de música ficam persistidos e recuperáveis pela conta após recarga da página.

## Visuais 3D

**Vega**, dealer robô de smoking, acompanha a mesa; cartas recebem animações de distribuição e revelação em perspectiva. **Riff**, raposa robótica original com guitarra neon, toca no fundo de uma pista 3D de quatro trilhos inspirada nos jogos de guitarra. Notas e alvos seguem os mesmos tempos usados no julgamento do servidor. O placar, as teclas e os botões por toque permanecem em HTML acessível.

Personagens são modelados por geometria no Three.js já usado pela roleta; não há download de modelos, imagens ou texturas externas. A cena carrega sob demanda, limita resolução, pausa desenho fora da tela/aba e libera recursos ao sair. Redução de movimento desliga os movimentos decorativos; notas mantêm o deslocamento necessário ao jogo. Sem WebGL, o ritmo mantém a pista HTML e os controles, com aviso de visual indisponível.

## Implementação e operação

Migrações incrementais **V9__blackjack_and_rhythm.sql** e **V10__blackjack_rounds.sql**, mantendo as migrações anteriores intactas. V10 adiciona a identidade da rodada e a referência da entrada; lobbies antigos precisam confirmar a entrada antes de começar. `party_rooms` guarda tipo, fase, prazos e estado privado; `party_players` guarda prontidão, mão/placar e recompensa; `party_actions` e `rhythm_hits` garantem idempotência. Mutações e Coins usam o mesmo advisory lock dos jogos. O extrato e a classificação existentes incluem as novas recompensas.

O job de partidas usa um scheduler separado para que consultas ao worker musical não bloqueiem os timers de voz e leases do espaço. Preparação de áudio ocorre fora da transação/lock do banco. Reiniciar o backend conclui mãos de blackjack vencidas; ritmo só premia quando o worker confirma a conclusão da mesma sessão.

| Rota | Uso |
|---|---|
| GET `/api/party` | Sala atual e salas abertas |
| POST `/api/party` | `{clientId, kind: "blackjack" ou "rhythm", videoId?}` |
| GET `/api/party/music/search?identity=...&q=...` | Busca no bot; exige voz da própria sessão |
| POST `/api/party/{id}/join` | `{clientId}` |
| POST `/api/party/{id}/ready` | `{clientId, roundId?, identity?}`; blackjack exige roundId e debita 10 Coins; identidade de voz obrigatória no ritmo |
| POST `/api/party/{id}/start` | `{clientId, roundId?, identity?}`; blackjack exige roundId; exclusivo do anfitrião |
| POST `/api/party/{id}/hit` ou `/stand` | `{clientId, roundId}`; ação de blackjack |
| POST `/api/party/{id}/next` | `{clientId, roundId}`; anfitrião reabre o blackjack após o resultado, sem cobrar os participantes |
| POST `/api/party/{id}/note` | `{note, lane}`; índices baseados em zero |
| POST `/api/party/{id}/presence` ou `/leave` | `{clientId}` |

Todas as rotas exigem sessão; POST exige CSRF e o orçamento de requisições existente. As rotas privadas `/rhythm/prepare`, `/rhythm/start`, `/rhythm/release` do worker exigem o segredo servidor-servidor e não são publicadas pelo Caddy.

Atualize com o fluxo habitual `./scripts/up.sh` em dev ou `CHAT_MODE=prd ./scripts/up.sh` em produção. É necessário reconstruir **backend, frontend e music-bot**. Não habilite Flyway no runtime: o migrador de manutenção aplica V9/V10 e os privilégios usuais.

O modo demo simula participantes, notas e resultados; não baixa nem toca o trecho real. Testes usam PostgreSQL separado, worker mockado, áudio PCM sintético e navegador. Acesso real ao YouTube, qualidade da detecção em cada faixa e latência WebRTC da instalação exigem teste com ouvintes reais; não foram alegados como validados pelos mocks.
