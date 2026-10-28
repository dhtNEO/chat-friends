# Clube da Sorte — caça-níquel e Roleta Royale

Abra **Jogos** na barra de atividades. Dê dois cliques na aba para maximizar; chat e chamada continuam disponíveis. O modo demo oferece Coins e participantes simulados, sem alterar a carteira real.

## Caça-níquel: Giro da Sorte

Máquina com três rolos, iluminação dourada e manivela. Clique/toque na manivela, arraste-a para baixo, ou use o botão **Girar grátis**. Os rolos giram por pelo menos 5,5 segundos após receber o sorteio, parando em sequência aos 3,7 / 4,4 / 5,1 segundos. Animações respeitam a preferência por movimento reduzido.

Dez giros gratuitos por dia UTC, com quatro símbolos independentes equiprováveis. Trinca paga 30 Coins (6,25%); um par, 8 (56,25%); diferentes, 2 (37,5%). O resultado vem de SecureRandom no backend e é persistido por conta/clientId. Respostas perdidas podem ser recuperadas sem duplicar o pagamento. As Coins gratuitas continuam limitadas a 500 por dia UTC; prêmios da roleta não consomem esse limite.

## Roleta Royale

Roleta europeia com **37 casas (0–36), zero único**, apresentada em WebGL/Three.js: aro dourado, base de madeira, números, separadores, eixo e bola em geometria 3D com iluminação. O módulo 3D é carregado apenas ao abrir uma mesa. Há representação simplificada quando WebGL não está disponível. Movimento reduzido mostra o posicionamento sem as voltas completas.

Crie uma mesa individual ou uma sala para até oito pessoas. Convide no #geral ou compartilhe o código. Cada pessoa escolhe **um bilhete por rodada**, informa uma quantidade inteira de Coins, confirma e aguarda o anfitrião girar. Não existe teto fixo de aposta por rodada: pode apostar até todo o saldo disponível. A carteira usa inteiros de 64 bits; valores que excedem a capacidade aritmética de pagamento são rejeitados, nunca arredondados pelo servidor. A interface aceita inteiros exatos suportados pelo navegador.

| Aposta | Chance | Retorno total |
|---|---|---|
| Número específico, incluindo 0 | 1/37 | 36× a aposta |
| Primeira, segunda ou terceira dúzia | 12/37 | 3× a aposta |
| Vermelho, preto, par, ímpar, 1–18, 19–36 | 18/37 | 2× a aposta |

O retorno **inclui a aposta original**. Apostar 10 em vermelho e ganhar devolve 20; o lucro é 10. O zero perde todas as apostas externas, inclusive par. As chances usam casas equiprováveis, sorteadas com SecureRandom. Coins são virtuais, sem compra, saque ou conversão em dinheiro.

### Fluxo, presença e desconexão

1. Confirmar aposta desconta Coins imediatamente e registra o bilhete imutável. Não é possível confirmar uma segunda aposta na mesma rodada.
2. O anfitrião só pode girar com pelo menos um bilhete e todos os participantes presentes com apostas confirmadas. A mesa individual também exige aposta e giro manual.
3. Há 1,5 segundo de preparação e 18 segundos de giro. O resultado é sorteado e persistido ao iniciar; as apostas são fechadas na mesma transação. A animação usa o número final somente depois do fechamento das apostas, para todos os clientes terminarem na casa correta. Inspecionar os dados da animação não permite apostar depois do sorteio.
4. O job de encerramento faz o pagamento na transação da conclusão. Repetições e reinícios não duplicam o retorno. O prêmio é pago mesmo para quem saiu ou desconectou durante o giro; ele nunca é limitado aos 500 Coins gratuitos.
5. Antes de girar, sair ou expirar a presença devolve integralmente o bilhete. Depois de começar, sair não cancela a aposta. Uma pessoa cujo bilhete já foi devolvido só pode voltar à mesa na próxima rodada.
6. O anfitrião que sair passa a liderança. Uma mesa em espera sem participantes é cancelada. Uma roleta girando continua até o pagamento mesmo que todos saiam.
7. Após o resultado, o anfitrião abre outra rodada na **mesma sala**, com novos bilhetes e sem reapostar automaticamente. A abertura usa clientId idempotente.

A tela consulta o servidor a cada 1,5 segundo e renova presença a cada sete segundos. Presenças no lobby expiram após trinta segundos e lobbies após dez minutos. Uma conta ocupa no máximo uma sala ativa, mas apostas já em andamento continuam sendo liquidadas se ela sair para outra sala. Reabrir a página recupera a mesa pela conta. Resultados finalizados permanecem até sair ou abrir outra mesa.

## Carteira e persistência

V6 permanece intacta. **V7__roulette_wagers.sql** encerra partidas Na Mosca pendentes, preserva seus créditos históricos, amplia o extrato para BIGINT e distingue `grant`, `stake`, `payout`, `refund`. Não altera os checksums V3/V5/V6 nem concede Coins extras. V8 acrescenta timestamps por rodada para ordenar o histórico independentemente da reutilização da sala.

- `coin_ledger`: saldo é a soma de créditos e débitos; referências únicas por conta evitam repetir movimentos.
- `roulette_rounds`: rodadas por sala, resultado sorteado e confirmação de liquidação.
- `roulette_bets`: um bilhete por conta/rodada, clientId, escolha, aposta, retorno e devolução.
- `game_rooms`/`game_players`: continuam mantendo sala, anfitrião e presença; dados antigos de pontuação são históricos e não são utilizados.

Saldo, aposta, vagas, fechamento, devolução e pagamento usam o advisory lock exclusivo do clube e transações PostgreSQL. O backend não aceita resultados nem retornos calculados pelo navegador. Débito e bilhete são criados atomicamente; saldo insuficiente, valores não inteiros e estouros aritméticos são recusados. Nenhum banco ou serviço adicional é necessário.

A classificação semanal mostra a soma líquida das movimentações desde segunda-feira 00h UTC: créditos, apostas, retornos e devoluções. Um débito e sua devolução na mesma semana se anulam. O extrato mostra as últimas vinte movimentações com valores positivos ou negativos.

## API e execução

Todas as rotas exigem sessão; POST exige CSRF e o orçamento de requisições habitual.

| Método | Rota | Corpo / uso |
|---|---|---|
| GET | `/api/games` | Carteira, salas, bilhetes, resultado e histórico |
| POST | `/api/games/spin` | `{clientId: UUID}` |
| POST | `/api/games/rooms` | `{clientId: UUID, solo: boolean}` |
| POST | `/api/games/rooms/{id}/join` | Entrar |
| POST | `/api/games/rooms/{id}/bet` | `{clientId: UUID, roundId: UUID, choice: string, amount: inteiro}` |
| POST | `/api/games/rooms/{id}/start` | Girar; exclusivo do anfitrião |
| POST | `/api/games/rooms/{id}/next` | `{clientId: UUID}`; próxima rodada |
| POST | `/api/games/rooms/{id}/presence` | Renovar presença |
| POST | `/api/games/rooms/{id}/leave` | Sair; devolve aposta se ainda aberta |

Escolhas: `n:0` até `n:36`, `red`, `black`, `even`, `odd`, `low`, `high`, `dozen1`, `dozen2`, `dozen3`. `ready` e `stop` do Na Mosca foram removidos.

Atualize pelo fluxo habitual `./scripts/up.sh` (dev) ou `CHAT_MODE=prd ./scripts/up.sh` (produção), com migrador e privilégios separados. Flyway continua desabilitado no runtime. Nunca execute a suíte de testes no banco `friends`.

`GamesTest` cobre as 37 casas, multiplicadores, all-in, saldo insuficiente, pagamento sem teto diário, empate de requisições concorrentes, devolução, abandono durante giro, próxima rodada e CSRF/autenticação. Playwright cobre a duração do caça-níquel, manivela, apostas, giro, resultado, nova rodada e celular.

Na Mosca foi retirado. A reprodução de música da main permanece disponível. A integração da fila musical com Coins continua planejada; ainda não há consumo de Coins por música.
