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
