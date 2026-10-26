# Testes e evidências

Backend: suíte IntegrationTest com PostgreSQL real separado (`friends_test`), Spring Security e mocks apenas na fronteira administrativa LiveKit para falhas/corridas determinísticas. Testa anonimato, CSRF, idempotência concorrente, paginação, texto/limite, disputa de lease, expiração/revogação, falha fechada, conta desativada, permissão órfã e conteúdo de JWT/assinatura inválida. Testes de tela com gateway mock não provam encaminhamento de mídia.

Frontend: TypeScript strict, ESLint, build Vite e Playwright contra stack real para login, persistência após reload, XSS como texto, criação/desativação, entrega em tempo real e viewport móvel. Relatórios de falha podem conter campos preenchidos: não versionar ou publicar sem redigir segredos. Capturas em USER_GUIDE usam somente dados sintéticos.

`./scripts/check.sh` usa containers; banco teste separado. CI valida Compose sem imprimir segredos, Terraform sem apply, dependências e segredos proporcionais. O teste de backup deve restaurar um dump em outro banco e comparar dados; pg_dump bem-sucedido sozinho não prova restauração.

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
