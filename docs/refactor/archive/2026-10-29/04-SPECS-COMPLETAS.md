# Especificações de tarefas — Chat Friends

Planejamento de 29/10/2026 (America/Sao_Paulo). Nenhuma tarefa foi implementada. Base: `d8fdd89a7f980f7cf03736c6b83682cc517aaf15`.

Os arquivos individuais estão em `specs/`. P1 = alta prioridade; P2 = evolução. Estimativas são dias-pessoa com desenvolvimento e validação, sem esperas externas. Todos os IDs de evidência estão no relatório.


---

# T01 — Validar jornadas e estabelecer a linha de base

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F0 · **Responsável sugerido:** Produto/UX  
**Estimativa:** 2–3 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E01 E02 E14 no relatório.

## Problema e objetivo

A quantidade de recursos cresceu; ainda não há evidência de que a organização atual corresponda às prioridades dos amigos.

## Escopo e comportamento proposto

Realizar duas rodadas formativas com 5–8 participantes convidados, incluindo usuários de celular e teclado. Medir entrar na voz, conversar durante transmissão, ajustar volumes, iniciar jogo e marcar encontro. Inventariar telas e estados existentes. Confirmar o nome público Entre amigos/VGH e a troca do rótulo Outlook por Agenda. Usar dados fictícios, sem registrar conteúdo de conversas.

## Pontos de alteração previstos

- [README.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/README.md)
- [docs/USER_GUIDE.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/USER_GUIDE.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Entregar roteiro, mapa de jornadas e problemas observados com gravidade.
- [ ] Registrar sucesso, tempo, erros e dificuldade de 1 a 7 por tarefa.
- [ ] Definir baseline e metas propostas, sem tratar a amostra como estudo estatístico.

## Verificação e entrega

Sessões moderadas com consentimento; revisar descobertas com responsável de produto. Saída: protótipo especificado e decisões registradas.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Sem mudança de runtime; revisar decisões antes de iniciar o shell.


---

# T02 — Separar autenticação, indisponibilidade e erros de API

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Frontend  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E03 E04 no relatório.

## Problema e objetivo

GET /me com 503 na abertura leva à tela de login sem alerta; api() não padroniza falhas de rede, timeout ou Retry-After.

## Escopo e comportamento proposto

Modelar sessão como loading/authenticated/anonymous/unavailable. Somente 401 encerra identidade; 403 de autorização, 428 de reautenticação e 429 têm fluxos distintos. Adicionar ApiError com code/status/retryAfter e AbortSignal opcional. Timeout configurável por operação: buscas de música e preparação de ritmo não devem herdar um limite curto. Mutação ambígua não deve ser reenviada sem idempotência.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)
- [frontend/src/api.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/api.ts)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] GET /me 503 ou offline mostra tentar novamente e preserva contexto.
- [ ] 401 limpa sessão e recursos de mídia.
- [ ] 429 respeita Retry-After e 428 oferece confirmação contextual.
- [ ] Resposta tardia de sessão anterior não altera a conta atual.

## Verificação e entrega

Ampliar auth.spec.ts com falha na abertura, expiração durante leitura e recuperação; testar timeout/abort e falha de upload. Arquivos: App.tsx, api.ts e AccountSecurity.tsx.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Reverter o cliente central mantendo os contratos HTTP anteriores; nunca converter 503 em sucesso.


---

# T03 — Tornar a recuperação do chat resistente a lacunas

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Frontend/Backend  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T02  
**Rastreabilidade:** E05 no relatório.

## Problema e objetivo

latest.current usa o maior ID recebido; catchUp falho não é repetido até nova conexão, e eventos novos podem avançar o cursor sobre uma lacuna.

## Escopo e comportamento proposto

Separar último evento observado do cursor confirmado por leitura HTTP. Bufferizar eventos durante sincronização e avançar o cursor apenas após páginas concluídas. Repetir sincronização com backoff e jitter independentemente da conexão WS; deduplicar por ID. Validar o envelope de eventos e ignorar mensagens inválidas de forma controlada. Manter o lock e a ordem de commit de Chat.java.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)
- [backend/src/main/java/com/chatfriends/Chat.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Chat.java)
- [backend/src/main/java/com/chatfriends/Events.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Events.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Falha no meio de 250 mensagens recupera todas sem duplicar.
- [ ] Evento novo durante catch-up não faz perder IDs anteriores.
- [ ] UI distingue conectando, sincronizando, atualizado e indisponível.
- [ ] Logout cancela callbacks de uma conexão antiga.

## Verificação e entrega

Teste determinístico: cursor 100, mensagens 101–200 ausentes, falha no GET, evento 201 e reconexão; integrar teste de commit/ACK já existente.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Ativar novo sincronizador por flag e voltar ao anterior sem mudar o esquema de mensagens.


---

# T04 — Especificar envio, falha e rascunho do chat

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Frontend  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T02 T03  
**Rastreabilidade:** E06 no relatório.

## Problema e objetivo

A fila pendente guarda apenas UUID/corpo e mostra Tentar novamente até para requisições ainda em andamento; rascunho pertence ao painel.

## Escopo e comportamento proposto

Criar máquina de estados por envio: queued/sending/confirmed/retryable-failure/rejected. Reusar clientId nas tentativas; não recriar mensagem após timeout. Preservar rascunho em memória por usuário/canal ao fechar painel; persistência em disco fica fora desta tarefa por privacidade. Composer multiline com Enter, Shift+Enter e tratamento de IME; limitar 4.000 unidades UTF-16, inclusive inserção de emoji.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Duplo clique ou ACK tardio produz uma mensagem.
- [ ] Erro 400/409 não fica em retry automático.
- [ ] Trocar painéis mantém rascunho e logout o elimina.
- [ ] Contador e inserção de emoji respeitam o limite.

## Verificação e entrega

Playwright com POST atrasado, 429, queda após commit, composição IME, emoji no limite e fechamento/reabertura do chat.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02 T03. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Manter formato HTTP atual; reverter composer sem apagar mensagens persistidas.


---

# T05 — Preservar posição do histórico e destacar novas mensagens

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F2 · **Responsável sugerido:** Frontend  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T03 T04  
**Rastreabilidade:** E07 no relatório.

## Problema e objetivo

Histórico é prependido sem compensação explícita da posição; toda a lista cresce na memória e é renderizada.

## Escopo e comportamento proposto

Ancorar scroll no ID da primeira mensagem visível e deslocamento relativo. Ao ler mensagens antigas, exibir contador Novas mensagens e Ir para recentes. Medir 10 mil mensagens e aplicar virtualização somente com preservação de seleção, leitura assistiva e altura variável. Paginação deve ter estado loading/error/end e impedir chamadas duplicadas.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Carregar 50 mensagens antigas mantém a mesma mensagem e posição com tolerância de 4 px.
- [ ] Mensagens novas não puxam usuário que lê histórico.
- [ ] Não anunciar novamente páginas antigas no leitor de tela.
- [ ] Janela renderizada tem limite mensurado e acesso ao histórico continua possível.

## Verificação e entrega

Testar textos de 4.000 unidades, zoom 200%, fontes carregadas tardiamente, 10 mil mensagens e leitor de tela.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T03 T04. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Voltar à lista não virtualizada se houver regressão assistiva; manter ancoragem e paginação.


---

# T06 — Corrigir foco e fechamento do menu mobile

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Frontend/Acessibilidade  
**Estimativa:** 2–3 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E01 no relatório.

## Problema e objetivo

No demo, Abrir menu seguido de Escape mantém .drawer-open. O fundo fica acessível pelo teclado apesar do scrim.

## Escopo e comportamento proposto

Tratar drawer como diálogo modal com título acessível, foco inicial, contenção de Tab, fundo inert, Escape e botão Fechar menu. Devolver foco ao acionador; fechar após navegar. Não transformar todos os Popover em modais: cada componente deve usar semântica compatível com seu comportamento.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)
- [frontend/src/ui.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/ui.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Escape fecha o menu e restaura foco.
- [ ] Tab/Shift+Tab não alcançam o conteúdo encoberto.
- [ ] Leitor de tela anuncia nome e abertura.
- [ ] Navegação funciona em 320 px, paisagem e zoom 200%.

## Verificação e entrega

Teste no demo reproduz o achado; Playwright por teclado e teste manual NVDA/VoiceOver. Arquivos: App.tsx, style.css e futura Drawer.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Reverter somente a camada visual se necessário mantendo acesso explícito ao fechamento.


---

# T07 — Garantir contraste nas cores personalizadas

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Design/Frontend  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E08 no relatório.

## Problema e objetivo

textOn decide branco/escuro por luminância > 0,4; o preset Oceano recebe branco com contraste aproximado de 2,77:1.

## Escopo e comportamento proposto

Calcular contraste dos pares reais de tokens, escolher foreground seguro e derivar hover/active/focus. Conferir gradientes em ambos os extremos e pontos intermediários. Preservar as cores escolhidas como intenção de marca, derivando cores acessíveis para controles e texto. Validar valores restaurados do armazenamento.

## Pontos de alteração previstos

- [frontend/src/theme.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/theme.ts)
- [frontend/src/style.css](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/style.css)
- [frontend/src/Profile.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Profile.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Texto normal >=4,5:1 e texto grande >=3:1.
- [ ] Foco e elementos gráficos relevantes >=3:1.
- [ ] Todos os presets passam, além de branco, preto e cores médias.
- [ ] Preview e tema salvo têm o mesmo resultado e cancelamento restaura tema anterior.

## Verificação e entrega

Testes matemáticos de contraste e captura de estados real/hover/focus; auditoria manual de gradientes. Arquivos: theme.ts, Profile.tsx, style.css e CSS de jogos.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Fallback para preset acessível conhecido, sem sobrescrever a preferência salva do usuário.


---

# T08 — Criar navegação adaptativa e shell simplificado

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F2 · **Responsável sugerido:** Design/Frontend  
**Estimativa:** 4–7 dias-pessoa · **Dependências:** T01 T06 T09  
**Rastreabilidade:** E02 E14 no relatório.

## Problema e objetivo

Há barra de ícones, canais e abas de painéis para destinos semelhantes; no mobile várias ações exigem rolagem horizontal.

## Escopo e comportamento proposto

Implementação futura: Conversa, Sala, Jogos e Agenda como destinos primários; Música dentro da Sala e disponível no miniplayer. Desktop com sidebar rotulada, centro e painel contextual opcional. Mobile com quatro destinos e Mais; nenhum destino essencial depende de gesto oculto. Dockview permanece em modo avançado opt-in. Introduzir navegação por hash/URL versionada e comportamento Voltar, sem criar novos canais.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)
- [frontend/src/Dock.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Dock.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Entrar/sair da voz e enviar mensagem acessíveis em <=2 ações desde um destino.
- [ ] 320–599 px mostra uma área principal sem overflow horizontal de navegação.
- [ ] 600–1023 px admite painel auxiliar sob demanda.
- [ ] >=1024 px mantém leitura e mídia lado a lado quando couberem.
- [ ] Troca de destino não remonta a conexão de voz.

## Verificação e entrega

Testar 320/390/768/1024/1440 px, teclado virtual, zoom, URL direta e Voltar. Preservar testes de identidade do stream.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T01 T06 T09. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Flag de shell novo e fallback para layout v4; não apagar preferências antigas durante a migração.


---

# T09 — Definir sistema visual e componentes compartilhados

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F2 · **Responsável sugerido:** Design/Frontend  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T01 T07  
**Rastreabilidade:** E14 no relatório.

## Problema e objetivo

CSS e componentes cresceram por feature, com estilos próprios de chat, cassino, ritmo e agenda.

## Escopo e comportamento proposto

Tokens semânticos para superfície, texto, borda, destaque, estado e foco. Escala de espaçamento 4/8/12/16/24/32; raio 8/12/16; texto principal 16 px proposto, compacto 14 px opt-in. Componentes Button, Field, Dialog, Drawer, Popover, Tabs, StatusBanner, EmptyState e Toast. Aproveitar primitivas existentes; escolher biblioteca adicional somente após avaliação de CSP, peso e acessibilidade.

## Pontos de alteração previstos

- [frontend/src/ui.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/ui.tsx)
- [frontend/src/style.css](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/style.css)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Catálogo especifica normal/hover/focus/disabled/loading/error.
- [ ] Controles principais têm alvo recomendado de 44 px.
- [ ] Layout respeita zoom e safe areas.
- [ ] Nenhuma mudança afrouxa CSP.
- [ ] Sons e movimento são controláveis.

## Verificação e entrega

Fixtures locais dos componentes, revisão de design e axe mais teclado; confirmar tokens aplicados em todas as áreas.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T01 T07. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Migrar um componente por vez com compatibilidade das classes antigas.


---

# T10 — Reorganizar entrada na voz e controles persistentes

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F2 · **Responsável sugerido:** Frontend/Mídia  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T02 T08 T09  
**Rastreabilidade:** E14 no relatório.

## Problema e objetivo

Mídia funciona com controles extensos; é necessário reduzir esforço para entrar, diagnosticar microfone e distinguir presença da página da chamada.

## Escopo e comportamento proposto

Barra persistente com estado da chamada, mic, áudio da chamada e sair. Prévia opcional de dispositivo e nível antes de entrar; permissão solicitada somente por ação. Avatares com rótulos Fora da voz/Na voz/Falando/Microfone desligado. Erros de permissão, dispositivo removido, lotação, reconexão e autoplay têm recuperação contextual. Volumes de chamada, transmissão e música continuam independentes.

## Pontos de alteração previstos

- [frontend/src/Voice.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Voice.tsx)
- [frontend/src/VoiceSettings.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/VoiceSettings.tsx)
- [frontend/src/voiceStore.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/voiceStore.ts)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Mute da chamada não silencia transmissão ou música.
- [ ] Nenhum autoplay ou aquisição de mic sem ação explícita.
- [ ] Trocar destino mantém tracks e AudioContext.
- [ ] Falha de dispositivo oferece seleção alternativa.
- [ ] Sair encerra todos os recursos próprios sem duplicar leave.

## Verificação e entrega

Reutilizar audio.spec.ts, voice-lifecycle.spec.ts e microphone-gain.spec.ts; depois validar microfones reais em macOS/Windows.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02 T08 T09. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Preservar controlador atual de Voice e mudar primeiro a apresentação; flag para controles antigos.


---

# T11 — Projetar transmissão, layouts prontos e janelas externas

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F2 · **Responsável sugerido:** Frontend/Mídia  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T08 T10  
**Rastreabilidade:** E14 E20 no relatório.

## Problema e objetivo

A organização em Dockview e blocos internos oferece potência, mas expõe múltiplos níveis de arraste e separação.

## Escopo e comportamento proposto

Oferecer presets Conversar/Assistir/Jogar e Organizar avançado. Área de transmissão cresce quando há conteúdo; estado vazio compacto quando não há tela. Alternativas por botão para mover/redimensionar, além de teclado. Preservar um único elemento de vídeo e áudio ao destacar/retornar. Erros de popup bloqueado e fim de captura ficam visíveis; reconexão completa requer compartilhar novamente.

## Pontos de alteração previstos

- [frontend/src/RoomLayout.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/RoomLayout.tsx)
- [frontend/src/Dock.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Dock.tsx)
- [frontend/src/Popout.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Popout.tsx)
- [frontend/src/DetachedMedia.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/DetachedMedia.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Trocar preset, ocultar e destacar não recria srcObject nem duplica áudio.
- [ ] Fechar popup devolve conteúdo ao painel anterior.
- [ ] Há alternativa por clique simples a toda ação de arraste essencial.
- [ ] Em mobile, assistir e voltar à conversa não encerra a chamada.
- [ ] Uma tela autorizada por vez continua sendo a regra.

## Verificação e entrega

Rodar room-layout e detached-media; teste real de captura, retorno de popup e lease expirada. Não aceitar somente demo como prova de WebRTC.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T08 T10. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Restaurar layout v4 e manter migração de storage não destrutiva.


---

# T12 — Melhorar busca, fila e feedback de música

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Frontend/Bot  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T08 T09 T19  
**Rastreabilidade:** E14 no relatório.

## Problema e objetivo

Busca e controles compartilham busy, fila é temporária e erros do provedor precisam ser compreensíveis.

## Escopo e comportamento proposto

Separar busca, resultado, tocando agora e fila; skeleton somente enquanto carrega. Informar quem adicionou, duração e motivo de indisponibilidade. Manter volume pessoal; sinalizar reserva pelo Beat Club. Parar e limpar fila exige confirmação do impacto coletivo. Preservar consulta ao mudar painel. Não adicionar cookies pessoais, serviços pagos nem download persistente.

## Pontos de alteração previstos

- [frontend/src/Music.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Music.tsx)
- [music-bot/bot.py](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/music-bot/bot.py)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Falha ou resultado vazio permite nova busca sem perder fila.
- [ ] Ação coletiva nomeia músicas afetadas e só confirma após resposta.
- [ ] Reserva de ritmo bloqueia controles conflitantes com explicação.
- [ ] Volume pessoal funciona mesmo durante a reserva.

## Verificação e entrega

music.spec.ts com falha de backend/bot, autoplay, fila cheia, reserva e respostas fora de ordem; smoke de provedor em etapa externa separada.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T08 T09 T19. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Reverter UI mantendo API /music e sem converter fila temporária em persistência implícita.


---

# T13 — Unificar lobby e estados dos jogos

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Frontend/Jogos  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T08 T09 T19  
**Rastreabilidade:** E14 no relatório.

## Problema e objetivo

Quatro experiências e regras convivem em uma tela extensa; saldo, entrada, sala e resultado precisam de hierarquia consistente.

## Escopo e comportamento proposto

Lobby com cartões por jogo, jogadores necessários, regra resumida e custo virtual explícito. Detalhe da mesa com waiting/preparing/running/finished/cancelled. Coins sempre descritas como virtuais, sem compra ou saque. Exibir confirmação de entrada, saldo reservado e resultado autoritativo. Controles HTML completos junto a visualização 3D e modo econômico.

## Pontos de alteração previstos

- [frontend/src/GamesClub.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/GamesClub.tsx)
- [frontend/src/PartyClub.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/PartyClub.tsx)
- [backend/src/main/java/com/chatfriends/Games.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Games.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Saldo não muda apenas por animação local.
- [ ] Repetição de ação usa o UUID/roundId correto.
- [ ] Sair explica quando há devolução e quando aposta permanece.
- [ ] Carta oculta não aparece no DOM nem payload antes da hora.
- [ ] Modo sem WebGL preserva ações.

## Verificação e entrega

games-demo/party-demo e GamesTest/PartyGamesTest contra banco descartável; testar duplo clique, reconexão durante rodada e saldo insuficiente.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T08 T09 T19. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Reverter apresentação sem alterar ledger ou históricos de rodada.


---

# T14 — Validar latência e justiça temporal do Beat Club

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Backend/Frontend/Jogos  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T19  
**Rastreabilidade:** E12 no relatório.

## Problema e objetivo

O cliente estima relógio por RTT e o servidor pontua pelo recebimento com deslocamento fixo de 150 ms; redes diferentes podem mudar a pontuação.

## Escopo e comportamento proposto

Medir erro entre áudio ouvido, frame local e aceitação do servidor em 0/50/150/300 ms de RTT e jitter. Especificar calibração local de áudio/input e indicador de conexão. Decidir compensação limitada com servidor autoritativo; não aceitar timestamps arbitrários nem alargar janelas para fazer testes passar. Separar relógio visual da árvore React geral.

## Pontos de alteração previstos

- [frontend/src/PartyClub.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/PartyClub.tsx)
- [frontend/src/rhythmTiming.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/rhythmTiming.ts)
- [backend/src/main/java/com/chatfriends/PartyGames.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/PartyGames.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Publicar distribuição do erro temporal e política documentada.
- [ ] Notas repetidas continuam idempotentes e fora da janela são recusadas.
- [ ] Mesma execução sintética sob redes suportadas atende tolerância definida no experimento.
- [ ] Sem rede adequada, usuário recebe aviso antes da rodada e regras de cancelamento.

## Verificação e entrega

rhythm-timing, RhythmChartTest, PartyGamesTest, áudio sintético e teste humano; incluir HTTP 429 e relógio do dispositivo alterado.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T19. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Manter regra atual atrás de versão explícita; rodadas em andamento usam a versão com que começaram.


---

# T15 — Corrigir consistência e cobertura da agenda

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Frontend/Backend  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T02  
**Rastreabilidade:** E09 E10 no relatório.

## Problema e objetivo

Agenda do mês filtra pelo início e omite eventos que atravessam a virada; listagem do servidor limita 500 sem cursor ou aviso.

## Escopo e comportamento proposto

Filtrar eventos por sobreposição com o mês, inclusive ano novo. Acrescentar resposta paginada com items/nextCursor/hasMore ou rejeição explícita de truncamento durante transição. Cursor estável por startsAt/id e consulta de participantes apenas dos eventos da página. Manter UTC no armazenamento e fuso local visível. Rótulo público Agenda; /outlook pode permanecer por compatibilidade.

## Pontos de alteração previstos

- [frontend/src/Outlook.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Outlook.tsx)
- [backend/src/main/java/com/chatfriends/Outlook.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Outlook.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Evento 31/01 23h–01/02 02h aparece em fevereiro.
- [ ] 501 eventos não desaparecem silenciosamente.
- [ ] Paginação não duplica itens com mesmo início.
- [ ] 409 mantém edição e permite comparar/recarregar.
- [ ] Horário inexistente em DST é recusado com explicação.

## Verificação e entrega

OutlookTest e outlook-demo com virada de mês/ano, 501 eventos, DST, concorrência de edição e respostas antigas.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Adicionar contrato versionado/aditivo antes de remover array antigo; migração SQL somente nova se necessária.


---

# T16 — Melhorar perfil, MFA e reautenticação contextual

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Frontend/Segurança  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T02 T09  
**Rastreabilidade:** E14 no relatório.

## Problema e objetivo

Operações sensíveis devolvem 428 e pedem procurar Segurança e repetir a ação; MFA usa chave manual e códigos sem fluxo de exportação.

## Escopo e comportamento proposto

Abrir confirmação de identidade no contexto da ação e preservar formulário não secreto em memória. Após sucesso, pedir nova confirmação de ação destrutiva; evitar replay cego. Oferecer QR TOTP gerado localmente e entrada manual, copiar/download de recovery codes por ação explícita e confirmação de guarda. Manter admin MFA obrigatório em prd.

## Pontos de alteração previstos

- [frontend/src/AccountSecurity.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/AccountSecurity.tsx)
- [frontend/src/Profile.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Profile.tsx)
- [backend/src/main/java/com/chatfriends/SessionSecurity.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/SessionSecurity.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] 428 não perde campos já preenchidos.
- [ ] Senhas, segredo MFA e recovery codes não vão para logs, analytics ou storage.
- [ ] Revogar sessão atual encerra mídia e volta ao login.
- [ ] Erros são role=alert e sucesso role=status.
- [ ] Usuário consegue sair de um fluxo MFA com erro.

## Verificação e entrega

auth/security.spec e testes de recuperação; verificar clipboard indisponível, navegação por teclado e QR sob CSP.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02 T09. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Retornar ao formulário manual atual mantendo MFA e a política de reautenticação.


---

# T17 — Dividir responsabilidades e habilitar regras de hooks

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F2 · **Responsável sugerido:** Frontend  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T02 T03  
**Rastreabilidade:** E15 no relatório.

## Problema e objetivo

App tem 1.248 linhas, Voice 1.320 e PartyClub 1.069; eslint-plugin-react-hooks está instalado, mas não configurado.

## Escopo e comportamento proposto

Extrair gradualmente useSession, useChatSync, ChatComposer, ChatTimeline, AppNavigation e controladores de mídia/jogos. Habilitar rules-of-hooks e exhaustive-deps, corrigindo dependências com refs estáveis quando apropriado. Definir DTOs tipados por domínio; evitar migração geral de framework ou store sem necessidade medida.

## Pontos de alteração previstos

- [frontend/eslint.config.js](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/eslint.config.js)
- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)
- [frontend/src/Voice.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Voice.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Lint detecta violação deliberada de hook em fixture.
- [ ] Nenhuma supressão global de dependências.
- [ ] Conexão e mídia mantêm identidade em renderizações/reorganização.
- [ ] Componentes de apresentação não fazem chamadas de controle escondidas.

## Verificação e entrega

Lint, typecheck/build e regressão focada por extração. Preservar testes de corrida backend sem reescrevê-los para espelhar implementação.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02 T03. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

PRs pequenos por responsabilidade, reversíveis sem migração de dados.


---

# T18 — Reduzir carregamento inicial e trabalho de renderização

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F2 · **Responsável sugerido:** Frontend/Performance  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T08 T17  
**Rastreabilidade:** E11 no relatório.

## Problema e objetivo

Build medido: chunk principal 1.315,03 kB / 349,44 kB gzip e CSS 221,76 kB / 30,31 kB gzip. Three já está separado.

## Escopo e comportamento proposto

Carregar jogos, agenda e administração sob demanda; avaliar separar shell de login e SDKs pesados. Manter os lazy imports de RouletteWheel/PartyStage3D. Medir React Profiler antes de memoizar; relógio de ritmo fora de setState por frame no componente inteiro. Cache imutável para assets com hash e revalidação de index.html, sem cache público de APIs autenticadas.

## Pontos de alteração previstos

- [frontend/src/App.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/App.tsx)
- [frontend/src/PartyClub.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/PartyClub.tsx)
- [frontend/vite.config.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/vite.config.ts)
- [frontend/Caddyfile](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/Caddyfile)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Meta inicial: reduzir JS inicial gzip >=30% sobre 349,44 kB sem piorar entrada na voz.
- [ ] Jogos não são requisitados antes de intenção de uso.
- [ ] Sem crescimento monotônico de listeners/AudioContexts após 50 trocas.
- [ ] Fallbacks de chunks falhos oferecem recarregar sem apagar rascunho.
- [ ] Relatar LCP/INP/CLS em ambiente declarado.

## Verificação e entrega

Comparar relatório de bundle, cold/warm load, CPU limitada, erro de chunk e uso com chamada ativa. Metas de campo: LCP<=2,5 s, INP<=200 ms, CLS<=0,1 no p75; ainda não medidas.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T08 T17. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Reverter splits individualmente; não elevar apenas o limite do warning de build.


---

# T19 — Compatibilizar polling e limites com uso simultâneo

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Backend/Frontend  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E13 no relatório.

## Problema e objetivo

Games/Party consultam a cada 1,5/1,2 s; música 2,5 s e mídia 3 s. Só esses quatro fluxos somam cerca de 134 req/min por cliente, acima de 1.800 req/min por IP para 16 clientes no mesmo NAT.

## Escopo e comportamento proposto

Instrumentar requisições por endpoint/cenário. Consolidar polling de estado, suspender painéis inativos sem parar heartbeats necessários, aplicar backoff/jitter e visibilidade. Distinguir orçamento de leitura e ações por usuário autenticado sem enfraquecer proteção de sessão/login. Avaliar eventos de invalidação WS com refetch em fallback; não adotar Redis apenas para resolver este porte.

## Pontos de alteração previstos

- [backend/src/main/java/com/chatfriends/RequestGuard.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/RequestGuard.java)
- [frontend/src/GamesClub.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/GamesClub.tsx)
- [frontend/src/PartyClub.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/PartyClub.tsx)
- [frontend/src/Music.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Music.tsx)
- [frontend/src/Voice.tsx](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/src/Voice.tsx)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] 16 usuários no mesmo NAT em cenário declarado não recebem 429 em uso normal.
- [ ] Login anônimo abusivo continua limitado.
- [ ] Clientes não fazem polls sobrepostos.
- [ ] Falha do bot não causa avalanche.
- [ ] Heartbeats mantêm a chamada e lease mesmo com painel oculto.

## Verificação e entrega

Teste de carga descartável incluindo 8 jogadores de ritmo, 16 ouvintes e uma tela; RequestGuardTest para abuso e limites. Confirmar contagem real antes de mudar valores.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Configuração versionada dos budgets; retornar intervalo anterior se freshness degradar, preservando proteção de abuso.


---

# T20 — Validar e normalizar avatares no servidor

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Backend/Segurança  
**Estimativa:** 2–3 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E16 no relatório.

## Problema e objetivo

Profiles.matches verifica assinaturas parciais; não confirma decodificação nem dimensões de imagens enviadas por clientes modificados.

## Escopo e comportamento proposto

Validar imagem completa com biblioteca mantida, tamanho de arquivo e limite de pixels/dimensões antes de alocar excessivamente. Normalizar para formato permitido e remover metadados, sem ampliar limites arbitrariamente. Retornar 400 para bytes truncados e manter acesso autenticado, nosniff e CSP restritiva.

## Pontos de alteração previstos

- [backend/src/main/java/com/chatfriends/Profiles.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Profiles.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Cabeçalho PNG com conteúdo inválido é rejeitado.
- [ ] Imagem pequena em bytes e enorme em dimensões é recusada.
- [ ] PNG/JPEG/WebP válidos produzidos pelo frontend continuam aceitos.
- [ ] Remoção e versionamento invalidam preview corretamente.

## Verificação e entrega

IntegrationTest com fixtures benignas truncadas/limítrofes e upload real do perfil; medir memória durante decode.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Desativar novos uploads se o decoder falhar, mantendo leitura de avatares existentes; não relaxar validação.


---

# T21 — Fechar decisão sobre exclusividade adversarial de tela

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F0 · **Responsável sugerido:** Backend/Mídia  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E20 no relatório.

## Problema e objetivo

SECURITY.md reconhece que um cliente modificado com lease pode publicar múltiplas tracks antes da reconciliação.

## Escopo e comportamento proposto

Produzir spike e ADR: manter limitação documentada para espaço privado ou implementar enforcement síncrono na SFU. Medir duração real da sobreposição e falha do reconciliador. A saída desta tarefa é decisão e spec complementar do mecanismo escolhido; não prometer que UI ou polling resolve atomicidade distribuída.

## Pontos de alteração previstos

- [backend/src/main/java/com/chatfriends/Media.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Media.java)
- [backend/src/main/java/com/chatfriends/MediaAdmission.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/MediaAdmission.java)
- [docs/SECURITY.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/SECURITY.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Reprodução controlada em stack descartável mede janela de abuso.
- [ ] ADR define garantia exata e impacto operacional.
- [ ] Revogar antes de conceder, sessão ativa e admissão obrigatória permanecem.
- [ ] Se requisito for zero sobreposição, release fica bloqueado até enforcement demonstrado.

## Verificação e entrega

Reutilização de token elevado, publicação duplicada, SFU indisponível, corrida de reserva e falha de commit. Nunca executar contra chamada real.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Spike isolado; não publicar porta 7880 nem desativar MediaAdmission como fallback.


---

# T22 — Classificar erros e acrescentar observabilidade mínima

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** Backend/Operação  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T02  
**Rastreabilidade:** E04 no relatório.

## Problema e objetivo

Security.java captura Exception e responde 401 inclusive em falha de dependência; /health verifica apenas banco e logs são limitados.

## Escopo e comportamento proposto

Capturar falhas de autenticação especificamente e devolver 503 para dependências indisponíveis, falhando fechado sem falsificar sessão expirada. Envelope com código estável e requestId; não expor stack ou segredos. Contadores e latências de chat ACK/catch-up, admissão, lease, bot, 429 e JDBC; readiness interna separada de liveness e sem detalhes públicos sensíveis.

## Pontos de alteração previstos

- [backend/src/main/java/com/chatfriends/Security.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Security.java)
- [backend/src/main/java/com/chatfriends/Api.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/Api.java)
- [backend/src/main/java/com/chatfriends/MusicGateway.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/MusicGateway.java)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Banco indisponível não produz falso 401.
- [ ] Usuário desativado continua bloqueado.
- [ ] Logs excluem conteúdo de chat, cookies, tokens, senha e URL de sinalização.
- [ ] Dashboard/diagnóstico permite diferenciar backend, SFU e bot.
- [ ] Métricas têm cardinalidade limitada.

## Verificação e entrega

Injetar falhas de banco/SFU/bot e verificar códigos e redaction; não exigir stack externa de observabilidade para o MVP.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T02. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Desligar exportação de métricas sem alterar decisões de autenticação; manter classificação de erros testada.


---

# T23 — Cobrir bot de música e dependências no gate de segurança

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F1 · **Responsável sugerido:** CI/Segurança  
**Estimativa:** 2–3 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E17 no relatório.

## Problema e objetivo

CI escaneia cinco imagens de runtime, mas omite a imagem do serviço music; job Python instala e testa sem auditoria de vulnerabilidades.

## Escopo e comportamento proposto

Dar nome estável à imagem music e incluir OS, pacotes Python e binários no scan. Gerar SBOM e verificar dependências resolvidas, com exceções específicas e expirantes. Manter audit npm de produção e revisar também exposição da cadeia de build. Gate deve falhar em HIGH/CRITICAL não triados e não ignorar erro do scanner.

## Pontos de alteração previstos

- [.github/workflows/ci.yml](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/.github/workflows/ci.yml)
- [scripts/vulnerability-gate.py](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/scripts/vulnerability-gate.py)
- [music-bot/Dockerfile](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/music-bot/Dockerfile)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Imagem music aparece no relatório do commit.
- [ ] Fixture com achado não triado faz CI falhar.
- [ ] Nenhum segredo ou imagem é publicado automaticamente.
- [ ] Falha/indisponibilidade do scanner não é sucesso.
- [ ] Artefatos têm retenção declarada.

## Verificação e entrega

Testar scripts/vulnerability-gate.py com fixtures de achado, exceção válida, expirada e target errado; executar scan real no próximo pipeline.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Corrigir falso positivo via exceção específica aprovada; não remover serviço do scan.


---

# T24 — Reconciliar exceções e versões efetivamente resolvidas

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F0 · **Responsável sugerido:** Manutenção/Segurança  
**Estimativa:** 1–2 dias-pessoa · **Dependências:** —  
**Rastreabilidade:** E18 no relatório.

## Problema e objetivo

Há exceções para Spring 6.2.19 enquanto pom usa Boot 4.1.2; uma exceção JOSE expira em 11/11/2026 e o gate valida todas, mesmo não utilizadas.

## Escopo e comportamento proposto

Gerar árvore resolvida/SBOM do commit; remover regras obsoletas com evidência e reavaliar JOSE sem presumir CVE explorável. Registrar dono, versão, target, mitigação e prazo; alertar sete dias antes. Atualizações de plataforma exigem testes de contrato e migração, sem trocar major apenas por número.

## Pontos de alteração previstos

- [security/vulnerability-exceptions.json](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/security/vulnerability-exceptions.json)
- [backend/pom.xml](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/pom.xml)
- [docs/DEPENDENCIES.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/DEPENDENCIES.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Cada exceção corresponde a pacote presente ou é removida.
- [ ] Nenhuma regra vencida permanece silenciosa.
- [ ] Registro diferencia severidade do scanner e aplicabilidade.
- [ ] Matriz de versões da documentação corresponde aos manifests.

## Verificação e entrega

SBOM Java/Go/Python/npm e gate com data controlada; comparar versões reais, sem usar apenas declaração no README.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: —. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Reverter atualização problemática com lockfiles e artefatos anteriores; manter prazo/triagem explícitos.


---

# T25 — Tornar recuperação completa e ensaiável

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Operação  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T24  
**Rastreabilidade:** E19 no relatório.

## Problema e objetivo

restore.sh para web/backend/livekit, mas não para music; worker guarda fila/token/reserva em memória. Backup já existe, mas precisa de ensaio com todos os domínios atuais.

## Escopo e comportamento proposto

Parar também worker e demais escritores antes do restore, reiniciar todos com configuração coerente e limpar estado efêmero. Testar restauração de chat, contas, MFA, Coins, jogos, agenda e atalhos em stack separada. Definir retenção e cópia externa verificável. Metas iniciais propostas: RPO 24h e RTO 60 min, a confirmar por medição.

## Pontos de alteração previstos

- [scripts/restore.sh](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/scripts/restore.sh)
- [scripts/backup-encrypted.sh](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/scripts/backup-encrypted.sh)
- [scripts/test-backup.sh](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/scripts/test-backup.sh)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Worker não continua tocando com estado anterior ao banco restaurado.
- [ ] Sessões/leases são invalidadas e MFA preservado.
- [ ] Falha de restore não sobe sistema parcialmente.
- [ ] Ensaio gera checklist e tempos sem segredos.
- [ ] Backup criptografado tem verificação de integridade e recuperação de chave documentada.

## Verificação e entrega

Ampliar test-backup.sh e ensaio manual descartável; backup incompleto, chave errada, dump corrompido e interrupção de restore.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T24. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Snapshot/backup anterior íntegro antes de restauração real; esta tarefa não autoriza restaurar produção.


---

# T26 — Formalizar contratos, migrações e crescimento de dados

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Backend/Dados  
**Estimativa:** 2–4 dias-pessoa · **Dependências:** T24  
**Rastreabilidade:** E21 no relatório.

## Problema e objetivo

Há múltiplos históricos Flyway preservados, DTOs por Map em jogos e dados persistentes sem política operacional única de crescimento.

## Escopo e comportamento proposto

Gerar contratos OpenAPI/JSON a partir da implementação e validar tipos do frontend. Preservar checksums V3/V6–V11 e testar histórias suportadas. Medir índices/EXPLAIN de histórico, ledger e agenda; propor somente índices justificados em nova migração. Definir retenção por domínio sem apagar mensagens ou extrato automaticamente.

## Pontos de alteração previstos

- [backend/src/main/java/com/chatfriends/MigrationHistory.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/main/java/com/chatfriends/MigrationHistory.java)
- [backend/src/test/java/com/chatfriends/MigrationHistoryTest.java](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/backend/src/test/java/com/chatfriends/MigrationHistoryTest.java)
- [docs/API.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/API.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Instalação nova e cada histórico legado migram sem repair/out-of-order.
- [ ] Frontend compila contra contratos testados.
- [ ] Consultas relevantes têm plano e volume de referência.
- [ ] Política de retenção explicita exportação, exclusão e impacto em backup.

## Verificação e entrega

MigrationHistoryTest, snapshots de contratos, EXPLAIN ANALYZE em fixtures e integração de contas/jogos/agenda.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T24. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Mudanças aditivas; downgrade de aplicação só se compatível com esquema. Exclusão de dados exige tarefa e autorização próprias.


---

# T27 — Estabelecer gates de acessibilidade e regressão visual

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F2 · **Responsável sugerido:** QA/Frontend  
**Estimativa:** 3–5 dias-pessoa · **Dependências:** T06 T07 T08  
**Rastreabilidade:** E01 E02 E22 no relatório.

## Problema e objetivo

Testes existentes são relevantes, mas não comprovam WCAG integral, Safari/Firefox ou navegação de todos os destinos no mobile.

## Escopo e comportamento proposto

Adicionar axe às jornadas críticas e verificações manuais de teclado/leitor de tela. Matriz 320/390/768/1024/1440, zoom 200% e reflow a 320 CSS px, movimento reduzido e temas. Screenshots determinísticos com dados fictícios. Separar teste demo de contrato HTTP e de mídia real; capturar console errors e requests falhos.

## Pontos de alteração previstos

- [frontend/playwright.config.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/playwright.config.ts)
- [frontend/tests/app.spec.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/tests/app.spec.ts)
- [frontend/tests/room-layout.spec.ts](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/frontend/tests/room-layout.spec.ts)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Sem violações automatizadas sérias/críticas não triadas.
- [ ] Todas as tarefas principais executáveis por teclado.
- [ ] Foco não é encoberto por barras fixas.
- [ ] Histórico não é relido inteiro ao paginar.
- [ ] Capturas visuais são revisadas, não atualizadas cegamente.

## Verificação e entrega

Playwright Chromium/WebKit/Firefox quando suportados mais Safari/VoiceOver e NVDA reais; axe não substitui validação manual.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T06 T07 T08. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Quarentena apenas com causa, responsável e prazo; não reduzir assertions de mídia para obter verde.


---

# T28 — Validar capacidade e compatibilidade reais

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F4 · **Responsável sugerido:** QA/Operação/Mídia  
**Estimativa:** 3–6 dias-pessoa · **Dependências:** T10 T11 T19 T22  
**Rastreabilidade:** E22 no relatório.

## Problema e objetivo

O limite de 16 conexões é implementado, mas não equivale a capacidade medida; Mac/WAN e navegadores têm pendências documentadas.

## Escopo e comportamento proposto

Executar progressão 2/4/8/16 humanos simulados/assistidos mais bot, um publicador de tela e receptores. Registrar upload/CPU/RAM/RTT/perda/jitter/reconexões e percepção de áudio. Testar TCP/UDP e redes distintas dentro das políticas, sem desabilitar restrições do navegador. Separar limite funcional, hardware recomendado e resultados.

## Pontos de alteração previstos

- [docs/TESTING.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/TESTING.md)
- [docs/COMPATIBILITY.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/COMPATIBILITY.md)
- [docs/STATUS.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/STATUS.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Cada estágio fica estável por 30 min antes do próximo.
- [ ] Nenhuma duplicação/perda de mensagem após reconexão.
- [ ] Não há 429 legítimo sustentado nem exaustão de pool.
- [ ] Publicar perfil aprovado de resolução/fps e plano para rede lenta.
- [ ] Matriz informa testado/documental/pendente por plataforma.

## Verificação e entrega

Stack descartável para carga e agendamento próprio para WAN/hardware real; métricas agregadas sem conteúdo privado. Não prometer 1080p60 em toda conexão.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T10 T11 T19 T22. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Limitar perfil de qualidade/capacidade ao último estágio comprovado e manter indicador de lotação.


---

# T29 — Consolidar documentação e nomes públicos

**Status:** especificada, não implementada.  
**Prioridade:** P2 · **Fase:** F3 · **Responsável sugerido:** Documentação/Produto  
**Estimativa:** 1–3 dias-pessoa · **Dependências:** T01 T15 T24 T26  
**Rastreabilidade:** E14 E18 E21 no relatório.

## Problema e objetivo

Entre amigos, VGH e Outlook coexistem; STATUS contém resultados de várias versões e documentos de plano para funcionalidades já presentes.

## Escopo e comportamento proposto

Definir uma marca exibida e glossário; Agenda é nome sugerido para calendário interno, sem alegar integração Microsoft. Separar estado atual de histórico, incluir SHA por evidência e atualizar guias, arquitetura do bot/jogos, API e compatibilidade. Reconciliar MUSIC_PLAYER_PLAN/SHORTCUTS_PLAN com o implementado. Manter GPL e registrar decisão de distribuição.

## Pontos de alteração previstos

- [README.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/README.md)
- [docs/STATUS.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/STATUS.md)
- [docs/ARCHITECTURE.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/ARCHITECTURE.md)
- [docs/MUSIC_PLAYER_PLAN.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/MUSIC_PLAYER_PLAN.md)
- [docs/SHORTCUTS_PLAN.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/SHORTCUTS_PLAN.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] README aponta para funcionalidades atuais e limitações.
- [ ] Nenhum teste histórico vira evidência do commit atual.
- [ ] Guias refletem navegação, volumes e recuperação.
- [ ] Licenças de fontes/dependências e intenção de distribuição estão registradas.

## Verificação e entrega

Verificar links e seguir quickstart em instalação descartável; revisão do glossário e exemplos sem segredos.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T01 T15 T24 T26. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Documentação versionada por release; não sobrescrever evidência histórica.


---

# T30 — Planejar rollout gradual e aceite final

**Status:** especificada, não implementada.  
**Prioridade:** P1 · **Fase:** F4 · **Responsável sugerido:** Produto/QA/Operação  
**Estimativa:** 2–3 dias-pessoa · **Dependências:** T05 T12 T13 T14 T15 T16 T18 T20 T21 T23 T25 T26 T27 T28 T29  
**Rastreabilidade:** E21 E22 no relatório.

## Problema e objetivo

Redesign amplo pode quebrar estado de chamadas, layouts salvos e hábitos dos usuários.

## Escopo e comportamento proposto

Entregar primeiro correções independentes, depois shell atrás de flag e piloto voluntário, seguido de expansão. Registrar versão de storage e preservar layout v4 para retorno. Checklist por requisito e artefato, não por aparência. A implementação e qualquer publicação serão etapas futuras: este pacote apenas as especifica.

## Pontos de alteração previstos

- [docs/OPERATIONS.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/OPERATIONS.md)
- [docs/BACKUP_RESTORE.md](https://github.com/dhtNEO/chat-friends/blob/d8fdd89a7f980f7cf03736c6b83682cc517aaf15/docs/BACKUP_RESTORE.md)

Os caminhos são pontos de entrada, não autorização para reescrever todo o módulo. Novos componentes e contratos devem ser pequenos e corresponder ao escopo acima.

## Critérios de aceite

- [ ] Piloto sem regressões P1 de sessão/chat/voz/tela.
- [ ] Backup e rollback ensaiados.
- [ ] Metas de tarefa comparadas à baseline e problemas críticos resolvidos.
- [ ] Release notes e suporte prontos.
- [ ] Decisão de exclusividade de tela formalmente atendida.

## Verificação e entrega

Smoke completo de login/MFA/chat/voz/tela/música/jogos/agenda, compatibilidade de storage e rollback com usuário ativo.

Entregar PR focado, evidências associadas ao SHA, documentação de qualquer contrato alterado e resultado dos checks relevantes. Usar exclusivamente dados sintéticos e banco descartável nos testes destrutivos. Caso um critério dependa de hardware/rede indisponível, marcá-lo como pendente, sem alegar aprovação.

## Dependências, riscos e limites

Dependências: T05 T12 T13 T14 T15 T16 T18 T20 T21 T23 T25 T26 T27 T28 T29. Manter português, sessões/CSRF/MFA, idempotência, moedas virtuais autoritativas, grants de mídia e migrações históricas. Não incluir nova plataforma, cadastro público, gravação, webcam ou IA. Não publicar nem operar produção como parte do desenvolvimento local desta tarefa.

## Reversão

Desligar flag do shell, manter dados compatíveis e restaurar assets anteriores; rollback de banco só via plano ensaiado, nunca automático.
