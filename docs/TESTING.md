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

## Perfil Tailscale

Perfil privado implementado: [bootstrap, operação e rollback](TAILSCALE_SETUP.md). Usa identidade dedicada, Serve HTTPS e mídia pela interface Tailscale, sem portas publicadas no host. Testes de configuração/Compose independem de conta. Aceite real de HTTPS/ACL, OrbStack/ARM64 e carga depende do servidor e das contas externas; não foi validado no Codex sem TUN. Consulte também [critérios do plano](TAILSCALE_PLAN.md).

## DuckDNS e IPv4 público

Atualizador, bootstrap, ACME staging isolado e LaunchAgent implementados: [guia DuckDNS](DUCKDNS_SETUP.md). Atualiza DNS e IP anunciado pelo LiveKit, com lock e confirmação após saúde. Testes locais usam API/DNS simulados; DNS/HTTPS reais, portas do roteador, macOS e capacidade externa permanecem pendentes.
