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
| Backend Java 25/Spring Boot 3.5.16, PostgreSQL separado | 17 testes de integração passaram, incluindo preferências de recepção por sessão, migração V2 e tetos Full HD |
| Modos dev/prd | 22 testes Node, inspeção de portas Compose e migração de marcadores sem alterar `.env`; modos antigos recusados como entrada |
| Frontend React/TypeScript/Vite | lint/build e 11 testes Playwright executados no runner Linux |
| Layout móvel durante transmissão | sobreposição/corte reproduzidos antes da correção; testes passam em 320×568, 390×844 e 768×1024, com recepção ligada/silenciada |
| Mídia sintética | medidores na saída real Web Audio verificam ganho/mudo/volumes por cliente e da transmissão; canvas recebido em 1920×1080, controles em tela cheia e layouts desktop/móvel testados |
| ICE | STUN autenticado em UDP/TCP; problema de loopback do container corrigido sem alterar política gerenciada do Chromium |
| Admissão de mídia | JWT elevado é reduzido a microfone na conexão; sessão expirada recusada |
| Edge DNS-01 | Caddy 2.11.4, módulo local filtra erros com token; testes Go e HTTPS :18443 com CA de laboratório explícita |
| CSP prd | Chromium recebe a política do Caddy real: consulta HTTPS ao domínio de mídia permitida e outro destino bloqueado; resposta remota simulada |
| Prd no Mac | logs do proprietário confirmaram DNS-01 válido para os dois nomes em staging; depois o proprietário confirmou funcionamento em produção |
| Atualizador DuckDNS | API/DNS simulados, retry, lock Docker e recuperação de órfãos; confirmação de saúde administrativa na SFU real |
| Backup/restore | restauração isolada e completa exercitadas na implementação; dados/sessões tratados conforme BACKUP_RESTORE |
| Infraestrutura | Terraform fmt/init/validate passaram na implementação; nenhum apply ou contratação |

A validação local usa mídia artificial e o browser pode escolher TCP sob a política gerenciada do runner. Não alteramos TLS/checksums/políticas para obter passe. Trivy com a base disponível não reportou HIGH/CRITICAL no módulo Go atualizado; isso não é auditoria exaustiva de imagens/transitivas nem garantia sobre advisories futuros. Downloads de dependências bloqueados no runner foram obtidos das fontes oficiais com hash idêntico ao lock e verificação completa dos módulos.

A correção de layout foi validada localmente com Chromium 154.0.8037.57. O Playwright 1.64.1 do CI usa Chromium 156.0.8078.4; o download desse browser e a consulta à API de execuções GitHub foram bloqueados com HTTP 403 neste ambiente. Os 11 testes locais passaram; o resultado do GitHub Actions precisa ser confirmado na execução remota.

## Limites ainda abertos

- Exclusividade adversarial estrita de múltiplas tracks: lease/revogação/replay são protegidos, mas um publicador autorizado pode tentar múltiplas tracks da mesma fonte. Reconciliação não é proibição atômica na SFU; ver SECURITY.
- Carga progressiva de 2/4/8/16 participantes, upload/CPU/RAM/RTT/perda e qualidade humana precisam de medição. Nenhuma capacidade de 16 pessoas ou e2-medium foi comprovada.
- Qualidade da supressão de ruído nativa e captura de áudio do sistema/jogo variam por navegador/SO. Teste sintético Linux não prova suporte completo no macOS/Windows.
- Renewals reais em operação prolongada, testes de falha/reinício no Mac, TURN, build multiarch e migração completa entre hosts não são automaticamente cobertos pelo relato de funcionamento.
- Tarifas/cotas cloud e licença pretendida para o código novo precisam de revisão pelo proprietário. GPL-3.0 preexistente foi preservada; nenhuma conta paga, apply ou publicação de imagem foi feita pelo agente.

## Manutenção

[TESTING](TESTING.md) contém os comandos atuais de validação. [DUCKDNS_SETUP](DUCKDNS_SETUP.md) cobre produção e agendamento; [MIGRATION](MIGRATION.md) explica migração dos marcadores de modo e troca real de ambiente. O checkout preserva credenciais, token, banco e certificados existentes; não usar `down -v`.
