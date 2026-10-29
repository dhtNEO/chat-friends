# Testes e evidências

Backend: suíte IntegrationTest com PostgreSQL real separado (`friends_test`), Spring Security e mocks apenas na fronteira administrativa LiveKit para falhas/corridas determinísticas. Testa anonimato, CSRF, idempotência concorrente, paginação, texto/limite, disputa de lease, expiração/revogação, falha fechada, conta desativada, permissão órfã e conteúdo de JWT/assinatura inválida. Testes de tela com gateway mock não provam encaminhamento de mídia.

Frontend: TypeScript strict, ESLint, build Vite e Playwright contra stack real para login, persistência após reload, XSS como texto, criação/desativação, entrega em tempo real e viewport móvel. Relatórios de falha podem conter campos preenchidos: não versionar ou publicar sem redigir segredos. Capturas em USER_GUIDE usam somente dados sintéticos.

Informe `TEST_ADMIN_PASSWORD` por ambiente privado; `TEST_ADMIN_USERNAME` é opcional e mantém `admin` como padrão. Use contas descartáveis separadas ao repetir suítes para respeitar o limite de tentativas por usuário. Não reduza os limites de autenticação para acomodar o runner.

`./scripts/check.sh` usa containers; banco teste separado. CI valida Compose sem imprimir segredos, Terraform sem apply, dependências e segredos proporcionais. O teste de backup deve restaurar um dump em outro banco e comparar dados; pg_dump bem-sucedido sozinho não prova restauração.

## Organização e tamanho da sala

Os testes da organização pessoal usam o modo demo, sem iniciar backend, banco ou LiveKit. No frontend, inicie `npm run demo` e, em outro terminal na mesma pasta, execute:

```bash
ROOM_LAYOUT_DEMO_TEST=1 MUSIC_DEMO_TEST=1 APP_TEST_URL=http://localhost:5173 npx playwright test tests/room-layout.spec.ts tests/music.spec.ts tests/detached-media.spec.ts
```

É necessário ter o Chromium do Playwright instalado; `CHROMIUM_PATH` permite usar um executável já disponível. A suíte de layout exercita arraste, redimensionamento, teclado/toque, persistência e adaptação a telas pequenas. As transmissões do demo usam canvas local: manter o mesmo vídeo e `srcObject` durante a reorganização verifica a continuidade do player, mas não substitui um teste de chamada real entre dispositivos. Ao terminar, encerre o servidor demo com Ctrl+C.

`detached-media.spec.ts` exercita painéis independentes e janelas do navegador para transmissão e música, Shift + arraste e redimensionamento pelo mouse de painéis flutuantes, retorno ao fechar, logout com as duas janelas abertas, bloqueio de pop-up e uso em 320/390/1024/1280 px. A identidade do vídeo e do stream, avanço do player, estado da busca/fila e volume pessoal precisam sobreviver aos movimentos sem sair da chamada ou duplicar os elementos de áudio. Ao separar, o bloco da mídia não pode reservar altura, largura ou um cartão de retorno na sala; Pessoas continua visível mesmo se o bloco separado estava focado. Voltar ou fechar restaura a organização salva.

`tests/demo.spec.ts` inicia seu próprio servidor demo e verifica também a convivência entre os controles de voz, configurações, atalhos e organização da sala. Instrumenta `AudioContext` para conferir seu fechamento ao sair da chamada e ao fazer logout. Execute servidores demo e normal em sequência: dois modos Vite no mesmo checkout podem disputar o cache de dependências e produzir `Outdated Optimize Dep` durante os testes.

`tests/auth.spec.ts` usa respostas de API simuladas para distinguir senha inválida, cookies/sessão, limite de tentativas, rede e indisponibilidade do servidor. Os casos de MFA pendente e inscrição obrigatória precisam chegar à verificação de segurança antes de abrir o espaço. Esses testes não substituem a suíte de segurança com backend e PostgreSQL reais.

`npx playwright test tests/microphone-gain.spec.ts` verifica sete corridas do processador sem navegador nem stack. Executa a classe real com as fronteiras de Web Audio/RNNoise simuladas e carga controlada, conferindo que trocar o filtro não duplica caminhos, operações antigas não reconectam nós, saída/reinício interrompe a saída antiga e falhas preservam o microfone sem filtro.

`tests/voice-lifecycle.spec.ts` usa a stack descartável, uma conta nova e o microfone artificial do Chromium. Retém o download do WASM e exige que logout encerre a captura e os contextos de áudio antes de liberar esse download; depois confere conexões encerradas e ausência de erro ou publicação tardia.

## Roteiro de mídia 2 → 4 → 8 → 16

Cada rodada: registrar data, commit, hardware/OS/arquitetura, versões dos navegadores, rede/upload, topologia e configuração de bitrate. Não contar sockets de chat como participantes de mídia.

- Duas redes diferentes, áudio bidirecional real, microfone negado e dispositivo ocupado; chat deve continuar.
- Uma tela com movimento representativo (jogo) e espectadores recebendo frames. Registrar resolução/fps/bitrate efetivos e áudio do sistema separadamente.
- Duas pessoas clicando compartilhar ao mesmo tempo; só uma lease aceita; repetir em duas abas da mesma conta.
- Encerrar track via botão nativo do navegador, fechar aba, desligar rede, reiniciar backend e SFU. Verificar revogação, recuperação e ausência de fantasmas após expiração/reconciliação.
- Reproduzir token elevado antigo contra SFU (ambiente descartável) para verificar downscoping da admissão; testar também duas tracks do mesmo dono e não marcar exclusividade estrita como aceita enquanto houver sobreposição transitória.
- Medir CPU/RAM de cada container/host, swap, upload/egress, RTT, jitter, perda, selected candidate e conexões relay/TCP/UDP. Usar docker stats e RTCStats/webrtc-internals; não vazar tokens em capturas.
- Aumentar somente se rodada anterior estável; 16 significa 16 clientes de mídia ativos, um publicador, 15 receptores e áudio nos dois sentidos. Registrar duração, interrupções e qualidade humana.

Teste sintético de mídia pode ser útil, mas declare fonte artificial, decodificação medida e limites. Não alegar compatibilidade de áudio de jogo/macOS a partir de Chromium Linux fake media. Matriz em COMPATIBILITY e resultados reais em STATUS.

## Configuração e infraestrutura

- `node --test scripts/tests/*.test.mjs`: modos dev/prd, migração dos marcadores, proteção de prd e atualizador DuckDNS com API/DNS simulados.
- `python3 scripts/tests/modes-profile.py`: portas dev em loopback, ausência de edge e rejeição de modos inválidos.
- `python3 scripts/tests/prd-profile.py`: portas prd, volumes ACME isolados, DNS-01 e Caddy válido; requer as imagens construídas e `.env` descartável.
- `python3 scripts/tests/duckdns-lock.py`: lock real no Docker, concorrência e recuperação de processo morto, sem token externo.
- `python3 scripts/tests/dns01-https.py`: HTTPS :18443 com CA de laboratório confiável, SNI/Host, admissão e ausência de segredo no autosave/logs. Requer stack dev saudável e edge construído.
- `docker build -t chat-friends-edge-duckdns infra/caddy`: inclui testes Go do filtro de erros do provider.

Não rodar scripts destrutivos contra o banco de prd. `scripts/check.sh` recusa prd e usa banco de integração separado em dev. O CI usa dev para testes da aplicação e valida prd sem emitir certificados reais. O [guia DuckDNS](DUCKDNS_SETUP.md) descreve aceite WAN e cargas no Mac.

O teste `frontend/tests/csp.spec.ts` inicia a imagem web com a CSP de prd e verifica no Chromium a consulta HTTPS ao domínio de mídia, incluindo porta 18443. A resposta de validação é simulada; outro destino HTTPS deve ser bloqueado. Não comprova conectividade WAN nem certificado do servidor real.

Para uma stack descartável com outro nome, `TEST_COMPOSE_PROJECT` seleciona o prefixo das redes e `TEST_WEB_IMAGE` seleciona a imagem nesse teste de CSP. Os padrões continuam `chat-friends` e `chat-friends-web`; não reutilize a stack de produção para testes que criam contas, mensagens e sessões.

Os testes `frontend/tests/audio.spec.ts` usam fontes de áudio por oscilador e tela de canvas 1920×1080. Medidores na saída Web Audio verificam ganho de microfone, volume local por participante, volume geral e da transmissão, mudo da chamada separado do som da live, independência entre clientes e ausência de som após parar. Silenciar a chamada deve cortar o microfone do ouvinte e as vozes, mantendo a transmissão audível; silenciar só a transmissão não muda esse estado e volume geral zero continua cortando todas as fontes. A decodificação de vídeo verifica 1080 linhas. A qualidade de supressão nativa e o desempenho em telas/jogos reais precisam de teste humano no dispositivo.

Regressão de layout durante a transmissão: verificar 320×568, 390×844 e 768×1024, com recepção ligada e silenciada. O campo de mensagem não pode ultrapassar o painel de voz nem ser cortado pela área do chat. O chat móvel com transmissão cresce conforme a altura dos controles; a lista de mensagens mantém rolagem própria. A versão/fonte do browser pode alterar a quebra dos controles, portanto um único viewport com o Chromium do sistema não representa toda a matriz do CI.

Para atualizar a instalação com privilégios separados, MFA e recuperação, siga [o procedimento de segurança](SECURITY_UPGRADE.md) antes do próximo deploy. Preserve `generated/runtime.env` e a chave MFA junto ao backup criptografado.

O job de stack fixa Ubuntu 24.04 e usa o Google Chrome fornecido pelo runner via `CHROMIUM_PATH`, com as mesmas fontes sintéticas e assertivas completas. Isso evita uma segunda instalação de Chromium/dependências no host. Não desativa TLS, CSP nem testes de áudio/tela. A versão efetiva do Chrome é registrada pelo job.

## Três transmissões simultâneas

Com `npm run demo` ativo, execute `STREAMS_DEMO_TEST=1 APP_TEST_URL=http://localhost:5173 npx playwright test tests/streams.spec.ts`. Verifica seleção, terceira transmissão local, parada independente e encerramento administrativo em desktop e celular. A suíte Java usa PostgreSQL descartável para verificar quatro reservas concorrentes (três aceitas), idempotência, heartbeat, expiração, revogação antes de conceder, falha fechada, isolamento/autorização e migração V13 preservando a reserva existente. O canvas e os mocks administrativos não comprovam três streams WebRTC reais nem capacidade da rede.
