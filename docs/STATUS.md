# Estado da implementação — 28/10/2026 (America/Sao_Paulo)

O projeto possui somente **dev** (local, padrão) e **prd** (internet). A integração de rede privada anterior foi removida do código, scripts, Compose e documentação. A produção usa DuckDNS, HTTPS/WSS :18443 e DNS-01; o proprietário confirmou seu funcionamento no Mac. Isso não equivale a benchmark de 16 participantes.

## Organização pessoal da sala — 28/10/2026

Transmissão, Pessoas e Música podem mudar de ordem e tamanho, com arraste por mouse/toque e alternativas de teclado. Cards têm ordem pessoal e tamanho ajustável; o layout é salvo por conta/navegador, separado entre telas largas e compactas. Foco e restauração mantêm os elementos de mídia montados. Instruções em [USER_GUIDE](USER_GUIDE.md#organizar-a-sala-de-estar).

- Frontend: lint e build passaram; 10 testes Playwright de layout e os três testes do bot passaram no demo em Chromium 154, incluindo 320×568, 390×844, 768×1024 e 1280×720.
- A reorganização preservou o mesmo vídeo, `srcObject`, elementos de áudio e avanço da reprodução, sem chamadas de saída da voz no demo. Preferências, restauração, dados salvos inválidos e saída de participante durante arraste foram exercitados.
- O menu de voz que ficava cortado em 320 px passou a ser posicionado fora do recorte do painel, limitado ao viewport; interação interna, redimensionamento, Escape e retorno do foco passaram.
- O build de produção foi exercitado com CSP estrita e API simulada: mudanças de tamanho, ordem e tamanho dos cards funcionaram sem violações da política.

Essa validação usa transmissão sintética e serviços simulados; não comprova uma chamada real entre dispositivos. Os servidores temporários de frontend foram encerrados e os containers locais permaneceram parados, conforme solicitado. Não houve publicação ou implantação.

## Bot de música — 28/10/2026

Busca por nome ou link público do YouTube, fila compartilhada, controles de pausa/continuar/pular/parar, remoção de itens e volume individual foram implementados. Um worker privado publica áudio pelo LiveKit; não usa iframe nem pede chave paga. O limite da SFU passou a 17 participantes para acomodar 16 conexões humanas e o bot. Operação e limites em [MUSIC](MUSIC.md).

Validação executada em stack descartável separada, sem alterar banco ou containers do aplicativo existente:

- Backend: 22 testes de integração passaram, incluindo vínculo dos controles à sessão de voz, reconciliação do bot e rejeição de seu token na admissão pública.
- Worker: 10 testes passaram, cobrindo API privada, URLs/duração/fila, cancelamento/avanço, leitura fragmentada, enfileiramento durante desconexão, cache de metadados, saída da sala vazia mesmo pausado e opções do SDK instalado.
- Frontend: lint/build e três testes Playwright no modo demo passaram (busca/link, fila/controles, persistência do volume e tela móvel). O demo não toca áudio do YouTube.
- Áudio real: Chromium 154 entrou na voz, buscou por nome e pelo link do vídeo público `aqz-KE-bpKQ` e recebeu áudio WebRTC do participante `music-bot`, com RMS medido acima de 0,001 em duas execuções (aproximadamente 0,005 e 0,003). Volume individual a 25%, silenciar/restaurar recepção, pausar/continuar e parar/remover o participante foram exercitados; a segunda execução usou a imagem final do worker.
- Regressão: nove testes existentes de chat, voz, áudio/transmissão e admissão da sinalização passaram juntos com Node 24 e Chromium 154.
- Scripts: 23 testes Node passaram, incluindo permissões, estabilidade e rotação da chave dedicada do bot. Imagem do worker e stack isolada foram construídas/iniciadas; não houve publicação de imagem, push ou implantação em produção.

Na primeira validação, Buildx estava indisponível: a stack isolada usou os artefatos aprovados por Maven/Vite sobre os runtimes locais existentes. Em uma verificação posterior de 28/10, Buildx 0.21 respondeu normalmente e o build de backend, frontend e worker pelos Dockerfiles padrão passou. `CHAT_MODE=dev ./scripts/up.sh` atualizou a instância local, os cinco serviços ficaram saudáveis e LiveKit foi reiniciado para carregar a configuração atual. O volume do banco e as contas existentes foram preservados; isso não é implantação em produção.

A instância dev atualizada também foi validada no Edge nativo do Windows, com perfis temporários e janelas headless/visível: voz, publicação de microfone e conexão ICE/DTLS/SCTP por TCP passaram. No teste headless, busca/fila/controles responderam HTTP 200 e o áudio real do YouTube recebido teve RMS acima de 0,001; volume individual, recepção silenciada e parada foram exercitados. O proprietário confirmou entrada na voz pelo InPrivate. A causa da falha relatada no perfil normal não foi identificada; nenhum perfil pessoal ou política de navegador foi alterado.

Esse teste local não comprova operação WAN, áudio em todos os sistemas/navegadores ou capacidade para 16 ouvintes. YouTube pode bloquear o IP, restringir vídeos ou exigir autenticação; falhas ficam visíveis e a fila tenta a próxima música. Cookies pessoais e contorno de restrições não fazem parte da implementação. A fila é temporária e limpa ao reiniciar o worker ou quando a sala permanece vazia.

## Evidências

| Verificação | Evidência |
|---|---|
| Backend Java 25/Spring Boot 3.5.16, PostgreSQL separado | 43 testes Java aprovados, incluindo integração com PostgreSQL, autenticação, perfil, concorrência e compatibilidade dos dois históricos V3 |
| Modos dev/prd | 27 testes Node, inspeção de portas Compose e migração de marcadores sem alterar `.env`; modos antigos recusados como entrada |
| Frontend React/TypeScript/Vite | lint/build e 13 testes Playwright, incluindo MFA, demo e mídia sintética |
| Layout móvel durante transmissão | sobreposição/corte reproduzidos antes da correção; testes passam em 320×568, 390×844 e 768×1024, com recepção ligada/silenciada |
| Mídia sintética | medidores na saída real Web Audio verificam ganho/mudo/volumes por cliente e da transmissão; canvas recebido em 1920×1080, controles em tela cheia e layouts desktop/móvel testados |
| ICE | STUN autenticado em UDP/TCP; loopback desabilitado e ICE restrito à interface de mídia para evitar deduplicação na NIC errada |
| Admissão de mídia | JWT elevado é reduzido a microfone na conexão; sessão expirada recusada |
| Edge DNS-01 | Caddy 2.11.7, módulo local filtra erros com token; testes Go e HTTPS :18443 com CA de laboratório explícita |
| CSP prd | Chromium recebe a política do Caddy real: consulta HTTPS ao domínio de mídia permitida e outro destino bloqueado; resposta remota simulada |
| Prd no Mac | logs do proprietário confirmaram DNS-01 válido para os dois nomes em staging; depois o proprietário confirmou funcionamento em produção |
| Atualizador DuckDNS | API/DNS simulados, retry, lock Docker e recuperação de órfãos; confirmação de saúde administrativa na SFU real |
| Backup/restore | restauração isolada e completa exercitadas na implementação; dados/sessões tratados conforme BACKUP_RESTORE |
| Infraestrutura | Terraform fmt/init/validate passaram na implementação; nenhum apply ou contratação |

A validação local usa mídia artificial e o browser pode escolher TCP sob a política gerenciada do runner. Não alteramos TLS/checksums/políticas para obter passe. Trivy com a base disponível não reportou HIGH/CRITICAL no módulo Go atualizado; isso não é auditoria exaustiva de imagens/transitivas nem garantia sobre advisories futuros. Downloads de dependências bloqueados no runner foram obtidos das fontes oficiais com hash idêntico ao lock e verificação completa dos módulos.

As primeiras validações de layout usaram Chromium 154 local e tiveram bloqueio de download do browser/API GitHub no runner. O CI atual fixa Ubuntu 24.04 no job stack e usa o Chrome instalado via CHROMIUM_PATH. A [execução #32](https://github.com/dhtNEO/chat-friends/actions/runs/40441318078), do commit cbbdb82, passou em backend, frontend, stack e infraestrutura, incluindo os 13 testes de navegador; o job multiarch opcional não foi executado.

## Limites ainda abertos

- Exclusividade adversarial estrita de múltiplas tracks: lease/revogação/replay são protegidos, mas um publicador autorizado pode tentar múltiplas tracks da mesma fonte. Reconciliação não é proibição atômica na SFU; ver SECURITY.
- Carga progressiva de 2/4/8/16 participantes, upload/CPU/RAM/RTT/perda e qualidade humana precisam de medição. Nenhuma capacidade de 16 pessoas ou e2-medium foi comprovada.
- Qualidade da supressão de ruído nativa e captura de áudio do sistema/jogo variam por navegador/SO. Teste sintético Linux não prova suporte completo no macOS/Windows.
- Renewals reais em operação prolongada, testes de falha/reinício no Mac, TURN, build multiarch e migração completa entre hosts não são automaticamente cobertos pelo relato de funcionamento.
- Tarifas/cotas cloud e licença pretendida para o código novo precisam de revisão pelo proprietário. GPL-3.0 preexistente foi preservada; nenhuma conta paga, apply ou publicação de imagem foi feita pelo agente.

## Manutenção

[TESTING](TESTING.md) contém os comandos atuais de validação. [DUCKDNS_SETUP](DUCKDNS_SETUP.md) cobre produção e agendamento; [MIGRATION](MIGRATION.md) explica migração dos marcadores de modo e troca real de ambiente. O checkout preserva credenciais, token, banco e certificados existentes; não usar `down -v`.


## Endurecimento de segurança — 26/10/2026

Controles e procedimento de migração em [SECURITY_UPGRADE.md](SECURITY_UPGRADE.md). Validação Linux/AMD64: testes Java de autenticação/limites com PostgreSQL real, testes Node de estado/cripto, Playwright com mídia sintética, ICE autenticado por UDP/TCP, TLS de laboratório com verificação ativa, privilégios negativos de DB, isolamento entre redes, mounts reais do helper, restauração isolada e bundle cifrado. Evidências atualizadas ao concluir a entrega. A execução local compilou os cinco artefatos e testou suas imagens de runtime. O driver VFS local limitou alguns builds completos; os cinco Dockerfiles e os scans das imagens de runtime foram posteriormente validados pelo CI da execução #32. Downloads bloqueados do ambiente foram obtidos de fontes oficiais alternativas com os checksums dos locks mantidos.

Não executados nesta máquina Linux: roteador Vivo, firewall/IPv6/compartilhamentos do Mac/OrbStack, emissão/renovação ACME real da conta do proprietário, teste WAN de amigos, cópia externa/FileVault e medição de 16 participantes. ARM64 exige o workflow multiarch e aceite no Mac. Nenhum desses itens pode ser considerado encerrado por um scan AMD64. E2EE/hospedagem externa/equipamento dedicado continuam decisões separadas.


## Integração de perfis e segurança

A interface com painéis, perfis, sons e suporte a 60 fps mantém MFA, expiração/revogação de sessões e privilégios separados. **Configurações → Minha conta → Segurança** reúne autenticador, sessões e confirmação de identidade; o demo informa que essas operações exigem a aplicação conectada.

Validação da integração em Linux/AMD64: 43 testes Java com PostgreSQL real, 27 testes Node, lint/build do frontend e 13 Playwright aprovados, incluindo áudio sintético, Full HD, CSP, ICE UDP/TCP, MFA/recuperação/revogação e demo. O teste de privilégios confirmou runtime sem DDL nem acesso ao histórico Flyway.

Os SQLs V3 publicados pelas duas branches permanecem idênticos, em locais separados. `MigrationHistory` seleciona o histórico existente e V5 completa as funcionalidades faltantes, sem `repair`, apagar contas/mensagens nem invalidar MFA existente. Os testes verificam instalação nova, atualização de cada histórico, preservação de dados/checksums e rejeição de checksum alterado. Consulte [SECURITY_UPGRADE](SECURITY_UPGRADE.md) antes de atualizar uma instalação existente.

## Integração de voz e organização da sala — 28/10/2026

A branch `gvs/integracao-voz-layout` reúne `gvs/ajustes-voz` (`4e3be75`) com os blocos e cartões reorganizáveis/redimensionáveis, foco da transmissão e mensagens de erro de login. A integração conserva MFA, atalhos na conta (V6), RNNoise, estados de microfone/áudio, sinalização pela origem da página e os controles de transmissão. Os menus continuam dentro da área visível em telas estreitas.

Durante a validação, foram corrigidos contextos de áudio que permaneciam abertos ao sair da chamada ou fazer logout. Operações de entrada antigas são invalidadas para não interferirem em uma chamada nova. A regressão instrumenta os contextos e confere seu fechamento, além de verificar que reorganizar os blocos preserva o vídeo e o áudio existentes.

Também foi reproduzida e corrigida uma corrida ao trocar Forte → Leve durante a carga do RNNoise: o worklet antigo podia ligar um segundo caminho do microfone. Revisões por operação agora invalidam e destroem candidatos antigos; saída/reinício durante a carga não reconecta nós nem publica uma track obsoleta. Os sete testes de regressão em `microphone-gain.spec.ts`, com dependências de áudio simuladas, passaram, incluindo fallback sem filtro, troca concorrente e encerramento durante a carga. Capturas de microfone ainda não publicadas ficam registradas por sala para serem paradas imediatamente na saída, mesmo com a rede do filtro travada; o fechamento do contexto de áudio não depende da conclusão da sinalização.

A validação usa a stack descartável `chat-friends-integracao`, em `http://localhost:18080`, com imagens, credenciais e volume de banco próprios. O banco da instalação local anterior e a hospedagem no Mac não foram alterados. Passaram 49 testes Java com PostgreSQL separado, 28 testes Node de configuração, 10 testes do worker de música, 16 testes de login com API simulada e 16 testes de demo/layout/música. A rodada final de Playwright aprovou 22 casos: 15 contra a stack real e os sete do processador, além do reteste dos três casos integrados do demo. A suíte real inclui duas conexões de voz, tela e áudio sintéticos, volumes/mudo, atalhos, MFA/recuperação/revogação, CSP, admissão, ICE UDP/TCP e logout com download do filtro retido até a captura parar. Esses resultados não substituem o aceite humano de cursor no CoD, eco na captura do áudio do sistema e qualidade de supressão de ruído com os microfones reais.

Provas adicionais passaram no Edge nativo do Windows com perfil temporário: voz com RNNoise ativo, sinalização pela origem da página, tamanho/ordem dos blocos e saída/logout com contextos encerrados e sem erros. Entre dois clientes com mídia sintética realmente encaminhada pela SFU, o mesmo vídeo e `srcObject` foram preservados ao reordenar, redimensionar, focar e restaurar; o tempo do vídeo avançou e nenhuma saída da chamada foi enviada durante esses ajustes. Todas as sessões automáticas foram encerradas após os testes.

Pendência de música nesta stack: a consulta de um vídeo público devolveu HTTP 400 na aplicação. O diagnóstico isolado do extrator classificou a falha como recusa do YouTube; não foi confirmada reprodução real nessa integração. Não houve uso de cookies pessoais nem tentativa de contornar restrições. Testes de worker e controles no demo passaram, mas não comprovam que o YouTube aceitará a consulta no ambiente do proprietário.

## Painéis e janelas independentes — 28/10/2026

Transmissão e bot de música agora podem sair da Sala de estar para painéis Dock independentes ou janelas do navegador. Cada mídia usa um único elemento de conteúdo, movido sem remontar o player ou o bot: vídeo, `srcObject`, busca, fila e volume pessoal são preservados. O retorno explícito abre/foca a sala; fechar uma janela externa devolve ao painel anterior. Os layouts existentes continuam usando a chave v4 e a organização pessoal dos blocos continua disponível.

Silenciar o áudio da call corta as vozes e o próprio microfone, preservando transmissão e música com seus controles individuais. O volume geral ainda controla todas as fontes. O estado público de áudio silenciado agora se refere às vozes da chamada; o player da transmissão não mostra mais esse estado como se a live estivesse muda.

Validação: lint/build e 26 testes passaram — sete de separação/janelas, dez de organização da sala, três de música no demo, três de integração do demo, dois de áudio real com fontes sintéticas e um de logout durante carga do filtro. O teste de áudio mede a transmissão ainda audível com a call silenciada, o microfone interrompido/restaurado, volume geral, mute da live e controles na janela externa. Os testes de arraste usam mouse e alças dos painéis flutuantes; vídeo/`srcObject`, avanço do player e ausência de saída da call são verificados. O Edge nativo no Windows também passou com os dois pop-ups, retorno e fechamento de todas as janelas/contextos ao deslogar. Os perfis de teste e servidores demo foram encerrados; a prévia isolada em 18080 continua disponível. A recusa de consulta do YouTube descrita acima não foi alterada por esta mudança de interface.

Ajuste posterior: separar uma mídia agora oculta seu bloco inteiro na Sala de estar, sem placeholder, título ou espaço reservado no grid. O retorno continua no painel/janela separado e restaura os tamanhos, ordem e foco anteriores. Os elementos permanecem montados para preservar vídeo e estado do bot. Passaram lint/build, sete testes de separação reforçados e dez de layout, incluindo ausência de geometria nos blocos ocultos, Pessoas na área liberada, foco, desktop/celular e continuidade da mídia. A prévia isolada foi atualizada; não foram necessárias mudanças no backend ou no áudio.

## Sincronização com a main — 28/10/2026

Integrada `origin/main` em `744c2d3`. Os conflitos ficaram em `frontend/package.json` e no lockfile: as versões da main foram mantidas, acrescidas apenas do filtro RNNoise 0.4.1 já utilizado. Dockview passou a 8.6.1; ESLint a 10.13.0, typescript-eslint a 8.72.0 e CycloneDX a 2.9.3. TypeScript permanece em 5.9.3. Os ajustes de janelas, layout pessoal, áudio e autenticação foram preservados.

Passaram instalação reproduzível, lint/build, 49 testes Java com PostgreSQL separado e geração do BOM, além de 23 testes do demo com as dependências novas. Um layout v4 criado pelo bundle anterior do Dockview 8.4 foi restaurado no 8.6 com painel de música separado e transmissão flutuante, mantendo posição e dimensões. Esse teste usou APIs e WebSocket simulados, sem acessar conteúdo da sala em uso.

Os dois casos de áudio real com fontes sintéticas, o logout com WASM pendente e o smoke do Edge também passaram numa segunda stack descartável (`chat-friends-main-check`, porta 18081), para não misturar mídia artificial na chamada existente em 18080. Uma primeira execução falhou na identidade dos elementos de áudio; a verificação focada e a repetição da dupla de testes passaram com as mesmas exigências de identidade, duas tracks e áudio audível. A causa da falha transitória não foi confirmada; não houve ajuste de código ou enfraquecimento das asserções. A stack temporária foi encerrada ao concluir, e a prévia em 18080 recebeu a imagem atualizada.

## Cassino recuperado sobre a main — 28/10/2026

Branch `cassino` recriada a partir da main `744c2d3`, com caça-níquel de manivela (giro mínimo de 5,5 segundos), Roleta Royale 3D, salas, apostas, Coins, extrato e pódio. Música, marca, dependências, correções de segurança e CI da main foram preservados. O teste dos jogos foi adaptado ao Spring Boot 3.5 da main; não inclui a migração antiga para Boot 4/TypeScript 6. Os arquivos SQL V6–V8 são idênticos aos publicados na primeira branch cassino.

Validação: 63 testes Java aprovados no banco separado `friends_test`; lint/build e auditoria npm de produção aprovados; três verificações de jogos/demo e três de música no navegador aprovadas, incluindo celular. O teste móvel dos jogos foi repetido isoladamente após uma recarga por HMR durante a formatação. Gate Trivy do SBOM aprovado com as exceções existentes da main. Não houve publicação nem alteração da stack em execução.

## Roleta reenquadrada, Blackjack Social e Beat Club — 28/10/2026

Roleta 3D posicionada mais acima e enquadrada por dimensões reais do aro, banca e proporção do painel. Novas salas de 2–8 pessoas: blackjack com baralho/carta oculta privados e ações pedir/parar; ritmo com busca no bot, análise de ataques no PCM, trecho de até 45 segundos, quatro pistas D/F/J/K e controles por toque. Ambos premiam Coins no servidor, com limite diário de emissões gratuitas e referências únicas. Migração V9 preserva V1–V8.

O worker musical reserva a sessão, publica o PCM analisado e rejeita troca de faixa durante a partida. Voz deve pertencer à conta/sessão; preparação e confirmação de reprodução são verificadas antes de premiar. Falhas cancelam o ritmo sem prêmio artificial. Chamadas ao worker usam scheduler separado dos timers de voz/leases. Fixtures destrutivos de testes usam o lock dos jogos para evitar deadlock com os jobs.

Validação: 75 testes Java no `friends_test` separado; 17 testes Python com SDK LiveKit fixado e PCM sintético; fluxos de navegador de blackjack, ritmo, roleta/caça-níquel e celular, mais três regressões do painel musical. Lint, build, auditoria npm e gate Trivy do SBOM aprovados. Capturas em Chromium conferidas no computador e celular. A extração/reprodução real de YouTube e a latência de ouvintes WebRTC não foram validadas pelos mocks; o modo demo simula a música/notas. Não houve alteração da stack em execução. Uso e limites em [PARTY_GAMES.md](PARTY_GAMES.md).

## Blackjack com rodadas contínuas e entrada paga — 28/10/2026

A mesma sala de blackjack agora abre novas rodadas pelo anfitrião, preservando código e participantes. Cada pessoa confirma a entrada de 10 Coins em cada rodada; saldo insuficiente bloqueia a confirmação. Sair ou expirar no lobby devolve a entrada, sem devolução após a distribuição. A nova rodada exige confirmação individual e não cobra automaticamente. UUID por rodada protege ações atrasadas e separa os pagamentos. Migração V10 preserva as anteriores e exige confirmação nos lobbies antigos.

Validação: suíte completa de 79 testes Java no `friends_test`, seguida de 19 testes de partidas aprovados após acrescentar concorrência de entradas, capacidade para devoluções e exclusividade entre mesas. Cinco testes de navegador aprovados, incluindo duas rodadas na mesma sala, custo/prêmios e celular, além de roleta e ritmo. Lint, build, auditoria npm e gate de vulnerabilidades do SBOM aprovados. Nenhuma alteração da stack em execução.

## Mesa privada e palco 3D, Beat Club até cinco minutos — 28/10/2026

Blackjack passa a omitir cartas, total e resultado dos adversários na API durante a rodada. No encerramento, todas as mãos e os desfechos ficam disponíveis, incluindo participantes que saíram. A leitura da fase e das cartas compartilha o lock das ações para impedir exposição durante a abertura da rodada seguinte. Vega, dealer robô original de smoking, acompanha as animações de distribuição em perspectiva.

Beat Club aceita até os primeiros cinco minutos da faixa. O worker limita PCM a 57,6 MB, libera os buffers de leitura antes da análise e usa uma visão das amostras sem cópia em little-endian. A detecção sai do event loop; notas cobrem o trecho inteiro, com limite de 1.200. A reserva acompanha a duração mais margem de 45 segundos. Pista e notas em Three.js, alvos de acerto e Riff, raposa robótica original tocando guitarra, usam geometria local. Sem WebGL, a pista HTML mantém o jogo; redução de movimento desliga gestos decorativos.

Validação: 84 testes Java no `friends_test`, seguidos de 21 testes de partidas após proteger a leitura da transição de rodada. Dezoito testes Python aprovados, incluindo detecção até o fim de PCM sintético de cinco minutos e reserva longa. Cinco testes de navegador aprovados para mesa privada, revelação, custo/prêmios, rodadas contínuas, ritmo, roleta e celular. Lint, build, auditoria npm e gate de vulnerabilidades aprovados. Avatares e pista conferidos em capturas com WebGL, incluindo painel estreito. Reprodução real do YouTube/LiveKit por cinco minutos continua dependendo de validação na instalação; testes sintéticos e demo não comprovam a latência real. Não houve alteração da stack em execução. Rebuild de frontend, backend e music-bot é necessário.

## Outlook, calendário compartilhado — 28/10/2026

Nova aba Outlook integrada à navegação e ao layout de painéis. Calendário mensal de 42 dias, agenda do mês, seleção de dia, formulário de jogatinas e respostas Vou/Talvez/Não vou com lista de participantes. Qualquer conta ativa cria eventos; criador/admin edita ou cancela. Horários locais são convertidos para instantes UTC; eventos noturnos aparecem nos dois dias. Dados persistidos em PostgreSQL pela migração incremental V11. Edições usam versão, criações têm idempotência e respostas são individuais. Agenda atualiza em 15 segundos e ao retornar à janela.

Validação: suíte completa de 94 testes Java no `friends_test`, seguida de 11 testes de Outlook aprovados após incluir edição durante eventos em andamento e rejeição de reutilização indevida de identificadores. Três testes de navegador cobrem criação, presença, edição, cancelamento, fuso America/Sao_Paulo e celular; uma regressão adicional confirmou a navegação e o painel de Segurança. Lint, build, auditoria npm e gate de vulnerabilidades aprovados. Capturas em Chromium conferidas em painel estreito e celular sem erros de página ou transbordamento horizontal. Não houve alteração da stack em execução. Uso, limites e operação em [OUTLOOK.md](OUTLOOK.md).

## Beat Club com análise espectral adaptativa — 28/10/2026

Detecção substituída por fluxo espectral positivo em quatro bandas, com FFT de 2.048 amostras e avanço de 10 ms. Potência estéreo, compressão de magnitude, limiares locais e seleção do ataque mais forte em regiões de 210 ms melhoram a retenção de percussão suave e a rejeição de ruído estacionário/tons sustentados. A banda predominante do novo ataque determina a pista. Sequências acima de 1.200 notas são reduzidas ao longo do trecho inteiro, preservando o final dos cinco minutos. Não há criação artificial de batidas entre ataques.

O navegador prioriza a pista pressionada dentro da janela válida para impedir que uma nota perdida de outra pista consuma uma tecla correta. Julgamento, janelas, recompensas e idempotência continuam no servidor. O novo módulo `music-bot/rhythm.py` é copiado para a imagem com permissões legíveis pelo usuário sem privilégios. NumPy 2.5.4, antes transitivo do LiveKit, passa a ser fixado diretamente.

Validação: 26 testes Python aprovados na imagem com Python 3.13, usuário sem privilégios, sistema de arquivos somente leitura, rede externa desativada, uma CPU e limite de 512 MB. A suíte levou 8,11 s e atingiu pico RSS de 179 MiB no processo; isso mede os testes sintéticos, não o consumo completo da reprodução ao vivo. Casos cobrem percussão sob instrumento sustentado, ganho variável, fase estéreo, bandas/pistas, ataques próximos, síncope e mudança de andamento, ruído/tom/silêncio/crescendo e sequência densa de cinco minutos. Os cenários curtos com referência verificam erro de até 25 ms nas notas geradas e detecção de pelo menos 90% dos ataques esperados. Seis testes da interface aprovados, incluindo notas próximas e ritmo multiplayer no navegador; lint/build aprovados. Auditoria Trivy das 24 versões Python instaladas, com gate sem HIGH/CRITICAL, aprovada. Não houve alteração da stack em execução. Qualidade em músicas reais e sincronismo com ouvintes LiveKit ainda exigem conferência na instalação. Rebuild de frontend e music-bot necessário.

## Comunicação backend–bot e atualização da branch — 29/10/2026

Pull da `cassino` até `eca6080` preservado. Foi reproduzido um cenário com healthcheck do worker em HTTP 200 e cliente Java recebendo HTTP 401 após a substituição atômica do arquivo da chave e recriação parcial: bind mounts individuais mantinham inodes diferentes. A correção usa diretório exclusivo `generated/music` montado somente leitura em backend/music, chave com permissões finais antes do rename e releitura pelo worker a cada requisição. O mount não inclui credenciais DB/MFA. O próximo `CHAT_MODE=prd ./scripts/up.sh` reconstrói e aplica os novos mounts nos dois serviços; a stack em execução deste ambiente não foi atualizada.

O backend agora registra categorias seguras para falhas de leitura da chave, autenticação HTTP, conexão, timeout e resposta inválida, sem chave, JWT, busca, URL ou corpo. Novo `scripts/diagnose-music.sh` testa de dentro do backend até o bot e informa a categoria sem expor dados da resposta. Regressão com containers reais confirmou Java → bot 200 antes/depois da rotação sem reinício, rejeição 401 da chave antiga e healthcheck 200, além do diagnóstico correto.

As dependências recebidas também exigiam ajustes: Spring Boot 4.1.2 precisava do starter de sessões JDBC para manter cookie SESSION, persistência e segurança de MFA/sessões; TypeScript 7.0.2 conflitou com o peer `<6.1.0` do typescript-eslint 8.72.1. Foi adotado TypeScript 6.0.3 compatível, preservando as demais atualizações e sincronizando o lockfile.

Validação: 101 testes Java aprovados no `friends_test` separado, 27 testes Python, 27 testes de configuração/DuckDNS no Node 24.22.1 com Bash, perfil Compose, regressão real Java/Python e 12 fluxos de navegador (música, jogos, Outlook, Segurança e celular). Lint/build, auditoria npm e gate Trivy do SBOM atualizados aprovados. As primeiras execuções identificaram as falhas de autoconfiguração e de peers acima; ambas foram corrigidas antes da suíte final. O teste de comunicação não depende de YouTube nem de credenciais reais e não comprova reprodução externa no servidor do operador.

## Integração de cassino com voz e janelas — 29/10/2026

Integrada `origin/cassino` em `c5438c6` na branch `gvs/integracao-voz-layout`. Jogos, Beat Club, calendário e correção da comunicação com o bot convivem com os blocos reorganizáveis, janelas destacáveis e áudio da call independente da transmissão e da música. Mantidas as versões recebidas de Spring Boot 4.1.2, Dockview 8.8.0 e TypeScript 6.0.3, com RNNoise 0.4.1 preservado. `Shortcuts` foi adaptado para Jackson 3, como o restante do backend.

As branches tinham migrações V6 distintas. Os SQLs publicados permanecem byte a byte idênticos em `db/legacy-shortcuts` e `db/legacy-games`; `MigrationHistory` seleciona a linha aplicada antes da validação. A V12 compartilhada acrescenta somente os recursos faltantes. Não houve `repair`, renumeração ou execução fora de ordem. Novos testes verificam preservação de atalhos, Coins, calendário e checksums nas duas linhas, inclusive atualização parcial dos jogos e rejeição de histórico V6 desconhecido/adulterado. Procedimento em [SECURITY_UPGRADE](SECURITY_UPGRADE.md).

Validação inicial: instalação reproduzível sem vulnerabilidades reportadas pelo npm, lint/build, imagens Docker de backend/web/worker e 109 testes Java aprovados em `friends_test` separado, incluindo nove casos de migração. Passaram 28 testes Node, 27 testes Python sem rede externa e a regressão Java → bot com rotação da chave e rejeição da chave antiga. A stack descartável `chat-friends-cassino`, em `http://localhost:18080`, usa volume e credenciais novos; os bancos anteriores e a hospedagem do Mac não foram alterados. Os cinco serviços iniciaram e o runtime continua sem DDL nem acesso aos metadados de migração.

No navegador passaram os oito cenários novos de jogos/calendário, os dez casos unitários de RNNoise/ritmo e os 23 cenários de demo, música, organização e janelas, com desktop/celular. As asserções existentes de continuidade de mídia, ausência de espaço reservado e retorno dos painéis foram preservadas.

Contra a stack real passaram oito cenários da aplicação, dois de áudio com fontes sintéticas e o logout com download de RNNoise retido: login/sessões, chat persistente, desativação de conta, voz entre dois clientes, permissões, transmissão Full HD, controles/atalhos e preservação do vídeo/áudio ao mover os painéis. O áudio da call silenciado preserva a transmissão e a música; saída/logout encerra microfone e contextos mesmo com o filtro pendente. São 52 testes Playwright aprovados nesta integração, contando os dez casos unitários. Essa evidência não substitui testes com os jogos e microfones reais, WAN ou carga de múltiplos amigos.

Smoke adicional com conta comum descartável confirmou Coins/roleta individual e calendário persistentes após recarregar, presença e cancelamento de evento, sem erros de página. Uma única busca do vídeo público `aqz-KE-bpKQ` no YouTube retornou HTTP 200; enfileirar também retornou 200 e o áudio recebido pela SFU foi medido com RMS acima de 0,001. Diferentemente da recusa registrada na integração anterior, houve reprodução confirmada nesta stack e neste vídeo. Isso não garante disponibilidade de outros vídeos/IPs nem operação no Mac. A fila foi parada/limpa e as sessões automáticas saíram da voz e fizeram logout. Navegadores e servidores demo temporários foram encerrados; a stack local em 18080 permanece disponível para o proprietário. Não houve push, PR ou implantação em produção.

## Main na branch de ajustes de voz — 29/10/2026

Integrada `origin/main` em `94a16d6` na `gvs/ajustes-voz`. A main já inclui a integração de jogos, calendário, organização da sala e janelas destacáveis, além dos novos controles/análise do Beat Club. Os manifests e o lockfile do frontend foram mantidos exatamente como na main. A branch preserva seus três ajustes posteriores: perfil e segurança reunidos na aba Conta, diagnóstico do resultado dos atalhos e testes separados de áudio/atalho usando o botão de microfone da barra rápida.

Os testes de demo e segurança agora verificam a seção Segurança na aba Conta, mantendo as verificações de autenticador, recuperação e sessões. Guias atualizados para esse caminho. A integração usa as migrações e a seleção de históricos já presentes na main; não acrescenta outra migração nem altera checksums publicados.

Validação inicial: instalação reproduzível sem vulnerabilidades reportadas pelo npm, lint/build, imagens de backend/web/worker, 113 testes Java no novo `friends_test` e 30 testes Python sem rede externa aprovados. A stack `chat-friends-voz-main`, em `http://localhost:18081`, tem volume e credenciais novos e portas de mídia 17881/TCP e 17882/UDP. Os cinco serviços iniciaram, backend → bot respondeu HTTP 200 e os privilégios limitados do banco foram verificados. A stack anterior em 18080 e a hospedagem no Mac não foram modificadas.

No navegador foram aprovados 37 casos distintos: 24 de demo, janelas/layout e Beat Club (incluindo teclas/dificuldade/encerramento), e 13 na stack real — nove da aplicação, dois de áudio, um de segurança/MFA e um de logout com WASM pendente. Os testes verificam a aba Conta selecionada e a seção Segurança visível na primeira abertura, inscrição com oito códigos, bloqueio durante MFA pendente, recuperação e revogação da sessão. O atalho também passou pela barra rápida, com diagnóstico `toggleMic`, e os testes mantiveram áudio independente e continuidade dos players.

Um caso demo em 320 px teve timeout antes de aparecer o formulário de login. A repetição isolada com trace passou em 3,9 s, com as mesmas asserções; a causa da falha inicial não foi confirmada. Os demais tamanhos passaram. Não houve ajuste de código ou relaxamento de asserções para obter o passe. Navegadores, probes e servidores demo foram encerrados; a prévia em 18081 permanece disponível. Reprodução externa do YouTube, qualidade com hardware real, WAN e carga não foram retestadas nesta rodada. Merge local, sem push ou alteração da main remota.

## Até três transmissões simultâneas — 29/10/2026

Implementação sobre a main `d8fdd89`: três vagas persistentes em `screen_lease`, uma por conexão, serializadas pelo lock de mídia existente. A migração V13 preserva a reserva anterior e acrescenta duas vagas, sem alterar checksums publicados. Heartbeat, liberação, expiração e encerramento administrativo atuam somente na reserva correspondente. Estado da API passa a expor `leases`; encerramento administrativo exige `identity` e `leaseId`. Backend e frontend devem ser atualizados juntos.

O seletor acompanha a transmissão em painéis e janelas destacáveis, reproduzindo somente seu áudio e preservando os controles independentes da chamada e música. Demo inicia com duas telas e aceita uma terceira captura local.

Validação: `mvn verify` com Java 25 e PostgreSQL 17 descartável passou nos 116 testes; lint e build frontend passaram. Foram aprovados 23 casos distintos de navegador: 17 de layout/janelas, 3 de música e 3 de streams, incluindo terceira captura local, parada independente, seleção e encerramento administrativo em desktop/celular. Um caso de música teve timeout inicial ao entrar na voz; a repetição dos seis casos de música/streams passou sem mudar suas asserções de conexão. O teste de prévia usa viewport largo, pois o layout compacto esconde intencionalmente seu texto auxiliar; também verifica vídeo local silenciado.

Não foi executada uma chamada com três publicadores WebRTC reais nem medição de capacidade/WAN. Canvas/demo e mocks administrativos não comprovam esses cenários. A limitação residual de múltiplas tracks por publicador autorizado continua em SECURITY. A stack anterior não foi atualizada.

## Assistir todas em grade — 29/10/2026

O botão **Assistir todas** permite ver até três lives ao mesmo tempo. Cada tile remoto tem volume e mudo individuais durante a chamada; transmissão e saída gerais continuam como volumes mestres. Escolher uma pessoa devolve o destaque individual. A grade inteira acompanha painéis e janelas destacáveis. Em áreas estreitas as telas empilham com rolagem; Expandir permite ganhar espaço.

Lint/build aprovados. Passaram 23 casos distintos de streams, organização da sala e janelas, incluindo seis de streams: reprodução dos três vídeos, controles de áudio enviados ao SDK, continuidade ao silenciar a chamada, janela destacada, retorno ao destaque, encerramento independente e viewports 1920/390/320 px. A regressão encontrou vídeo totalmente fora da área visível em 320 px quando o seletor ocupava três linhas; botões compactos em duas colunas e altura mínima do vídeo corrigiram a causa. Após a correção passaram os oito casos de streams e regressões de 320 px, mantendo as asserções de avanço de vídeo. Os outros quinze casos haviam passado antes dessa correção restrita ao seletor compacto/altura mínima.

A evidência usa vídeos de canvas e tracks de áudio simuladas na fronteira do SDK; não mede três publicadores WebRTC reais, saída acústica, WAN ou carga. Backend não mudou nesta etapa; os 116 testes Java da implementação de reservas são a evidência anterior. Sem implantação em produção.
