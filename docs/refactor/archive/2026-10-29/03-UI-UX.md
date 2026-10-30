# Direção UI/UX e pesquisa aplicada

29/10/2026 · Proposta para validação, não interface implementada.

## Direção

Uma sala de convivência para jogar e conversar, com a conversa e a chamada sempre compreensíveis. A interface deve parecer mais dinâmica porque reage claramente a pessoas, mensagens, música e transmissão, mantendo estabilidade. Animação decorativa e mais painéis não são objetivos por si só.

Não existe uma única interface “melhor” para todos. A recomendação combina observação do projeto, padrões de produtos de comunicação e fontes de UX/acessibilidade. A escolha final deve ser validada com os amigos que usam a plataforma.

## Pesquisa e decisões

| Fonte consultada | Princípio | Aplicação proposta |
|---|---|---|
| [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Priorizar operações frequentes e revelar opções avançadas sob demanda | Manter mic/voz/chat à mão; organização de painéis, ganho e qualidade em menus claramente rotulados |
| [NN/g — Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) | Feedback deve informar o estado da operação | Distinguir conexão WS, sincronização de chat, voz, envio confirmado e fila indisponível |
| [Google — Canonical layouts](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts) | Lista/detalhe e painel auxiliar se adaptam ao espaço preservando estado | Sidebar + área principal + contexto no desktop; um destino por vez no mobile. Aplicação conceitual à web, sem importar APIs Android |
| [W3C — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Texto normal precisa de contraste 4,5:1; texto grande, 3:1 | Validar tokens personalizados, hover e gradientes; não confiar em limiar arbitrário de luminância |
| [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | AA estabelece 24×24 CSS px com exceções | Adotar 44 px como meta própria para controles principais por conforto, sem afirmar que 44 px é o mínimo AA |
| [W3C — Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Arraste precisa de alternativa com ponteiro simples quando aplicável | Botões de mover/preset, além de teclado; teclado sozinho não satisfaz toda essa exigência |
| [W3C — Dialog Modal Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Foco entra no modal, permanece nele e retorna ao fechar | Corrigir drawer, confirmar ações coletivas e reautenticação; não impor comportamento modal a popovers não modais |
| [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Foco não encoberto, navegação e feedback acessíveis | Barra persistente sem cobrir composer/foco, leitura assistiva de mensagens e revisão manual |
| [web.dev — Web Vitals](https://web.dev/articles/vitals) | Medir carregamento, resposta e estabilidade | Metas p75 LCP≤2,5 s, INP≤200 ms e CLS≤0,1, separadas por dispositivo; não são resultados já atingidos |
| [Discord — Go Live and Screen Share](https://support.discord.com/hc/en-us/articles/360040816151-Go-Live-and-Screen-Share) | Referência funcional de controles próximos ao estado da chamada e transmissão | Barra de chamada persistente e qualidade da tela contextual; não copiar branding, canais múltiplos ou limites do Discord |
| [LiveKit — Connecting to LiveKit](https://docs.livekit.io/intro/basics/connect/) | Reconexão tem ciclo próprio e pode envolver reentrada completa | Explicar recuperação de voz/tela e manter controlador independente das telas |

Fontes consultadas nesta análise. Recomendações visuais, breakpoints e metas de tarefas abaixo são decisões propostas para este produto, não conclusões universais dessas fontes. Pesquisa de documentação não substitui teste com usuários nem auditoria WCAG completa.

## Arquitetura da informação

- **Conversa:** #geral, histórico, novas mensagens e composer. Continua um canal; não sugerir conversas privadas inexistentes.
- **Sala:** participantes, entrar na voz, tela e música. Presença da página e presença na chamada têm rótulos distintos.
- **Jogos:** lobby, mesa ativa, saldo virtual, extrato e regras. “Clube da Sorte” pode permanecer como identidade da área.
- **Agenda:** próximos encontros, calendário, presença e criação. Não anunciar integração com Microsoft.
- **Mais/Perfil:** conta, aparência, voz/áudio, atalhos e segurança. Administração só para quem tem autorização.

Não criar uma home de dashboard que obrigue a um clique extra para conversar. Abrir no último destino válido, com fallback Conversa; restaurar sessão e mídia conforme regras atuais, nunca ligar microfone por restauração de preferência.

## Layout e responsividade

**Desktop a partir de 1024 px:** sidebar rotulada de 224–256 px; centro flexível com largura mínima útil; contexto opcional de 280–360 px quando houver espaço. A transmissão ocupa a área principal quando selecionada; chat pode ficar ao lado. Header com nome, estado e ações relevantes. Não impor três colunas em telas que não comportem leitura confortável.

**Tablet de 600–1023 px:** navegação compacta, uma área principal e painel contextual recolhível. Manter seleção ao mudar orientação. Tamanho de container e conteúdo têm precedência sobre apenas detectar o dispositivo.

**Mobile de 320–599 px:** quatro destinos rotulados mais “Mais”, sem barra principal com rolagem horizontal. Mini barra da chamada acima da navegação; composer considera teclado e safe-area. A aba Sala mostra voz/tela/música em seções, com “Assistir” em destaque. No landscape, permitir foco no vídeo com controles reaparecendo ao foco/toque. Destacar janela só se a plataforma suportar.

**Avançado:** presets Conversar/Assistir/Jogar, depois “Organizar painéis”. Reaproveitar Dockview e blocos; oferecer restaurar e confirmar redefinição. Fechar um painel nunca deve significar sair da chamada. Preservar layouts anteriores em chave versionada para reversão.

## Direção visual proposta

Preservar identidade roxa e atmosfera de comunidade, com superfícies mais calmas e menos elementos competindo. Tipografia de corpo legível (system-ui como base), 16 px propostos; Orbitron/Russo apenas em marca ou títulos pontuais. Evitar fontes extras remotas.

| Token conceitual | Proposta inicial |
|---|---|
| Fundo | #0C0D13 |
| Superfície base / elevada | #151720 / #202330 |
| Texto principal / secundário | #F2F3F8 / #B8BDCE |
| Destaque | Roxo derivado da marca; foreground calculado por contraste |
| Espaçamento | 4, 8, 12, 16, 24, 32 px |
| Raios | 8 px controles; 12 px cartões; 16 px overlays |
| Estados | Ícone + texto + cor; nunca apenas verde/vermelho |
| Densidade | Normal padrão; compacto opt-in |
| Movimento | 120–180 ms para feedback de controle; 180–240 ms para painéis, como valores iniciais a validar |

Paleta proposta, ainda não certificada. Todo par de cor utilizado precisa de medição real, inclusive texto sobre gradientes e foco. Não converter “tema claro” em trabalho obrigatório sem demanda; preparar tokens para evolução.

## Catálogo de estados e comportamento

| Fluxo | Estados obrigatórios | Regra de interação |
|---|---|---|
| Sessão | Preparando, anônima, autenticada, MFA, indisponível, expirada | Indisponibilidade não é login inválido |
| Chat/conexão | Conectando, sincronizando, atualizado, offline | Permitir rascunho; sinalizar que conexão aberta não garante histórico completo |
| Mensagem | Na fila, enviando, confirmada, falha recuperável, rejeitada | UUID estável e retry somente quando fizer sentido |
| Histórico | Carregando, página pronta, fim, erro, novas mensagens | Preservar posição e não anunciar todo o passado |
| Voz | Fora, pedindo permissão, entrando, conectada, reconectando, falha | Exibir microfone e áudio da chamada separadamente |
| Tela | Disponível, ocupada, escolhendo fonte, iniciando, ao vivo, interrompida | Cancelar seletor é resultado normal; não tomar tela de outro automaticamente |
| Música | Fila vazia, buscando, carregando, tocando, pausada, reservada, indisponível | Explicar controles coletivos e volume individual |
| Jogos | Lobby, aguardando, preparando, em jogo, resultado, cancelado | Resultado/Coins vêm do servidor; sem animação que sugira prêmio diferente |
| Agenda | Vazia, carregando, dia/mês, edição, conflito, cancelado | Preservar formulário em erro e mostrar fuso |
| Administração | Editando, reautenticação, enviando, sucesso, falha | Não repetir ação sensível automaticamente após 428 |

## Interações dinâmicas que agregam valor

Indicador discreto de quem fala; badge de novas mensagens sem roubar scroll; feedback de envio e reconexão; progressão de estado de tela; progresso de música quando a duração é conhecida; atualização de presença com texto. Animações de jogo continuam na área de jogo e não animam toda a aplicação.

Respeitar prefers-reduced-motion, opção de sons e autonomia de áudio. Não piscar indicadores, autoabrir jogos, reproduzir som para cada evento nem deslocar controles enquanto o usuário tenta acioná-los. Notificações devem agrupar repetições; erro de ação aparece junto ao componente, e falha global fica em banner.

## Jornadas para validação do protótipo

1. Amigo entra no celular, entende quem está na voz e entra com microfone controlado.
2. Durante uma tela compartilhada, lê/envi­a mensagem sem interromper vídeo ou áudio.
3. Ajusta somente a música e comprova que chamada/transmissão mantêm o próprio volume.
4. Participa de jogo, entende custo virtual, falha de rede e resultado confirmado.
5. Marca encontro no próprio fuso, resolve conflito de edição e confirma presença.
6. Admin inicia ação sensível, confirma identidade e conclui sem perder campos.
7. Usuário de teclado abre/fecha menu, rearranja layout e retorna ao foco anterior.

Metas propostas para estudo: ≥90% de conclusão das tarefas essenciais sem ajuda; entrar na voz em até 15 s após sessão pronta, excluindo tempo de permissão; dificuldade mediana ≤2/7; nenhuma saída de chamada causada por navegação. Tratar isso como objetivo e comparar com baseline, sem inventar números atuais. Duas rodadas pequenas são pesquisa formativa, não prova estatística.

## Artefatos previstos para implementação futura

Mapa de jornadas e decisões (T01), tokens e componentes/estados (T09), telas e navegação desktop/mobile (T08), fluxos de mídia (T10/T11), refinamentos de features (T12–T16), critérios a11y (T27). O [wireframe anexo](wireframes.svg) ilustra hierarquia; não substitui protótipo validado nem aprova código de produção.
