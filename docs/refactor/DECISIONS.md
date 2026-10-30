# Decisões do plano

## D001 — Base da branch e arquivo histórico (30/10/2026)

A branch refactor começa na main `1b0ffd9a0dc15de3a2dcf0efb0053791c425a1e4`. O relatório e resultados originais permanecem em archive/2026-10-29, com SHA de auditoria preservado. Specs individuais fora de archive e backlog.json são ativos. Revalidar cada achado no SHA de execução; nenhum resultado histórico fecha tarefa na nova base.

## D002 — Três transmissões simultâneas (30/10/2026)

Preservar o PR #29 da main: até três transmissões, seleção individual/grade, leases independentes e migração V13. Textos antigos de exclusividade global/uma tela não são requisitos ativos. T21 deve avaliar limites de leases e tracks por transmissor na implementação atual. T28 deve medir perfis com uma e três fontes e distinguir limite funcional de capacidade comprovada.

## D003 — Reversão do sincronizador T03 (30/10/2026)

A proposta de flag na spec T03 manteria em produção o caminho conhecido que perde mensagens e duplicaria o ciclo de callbacks. Adotar um único sincronizador pequeno e reverter pelo commit de implementação, preservando o contrato HTTP/WS e o esquema. Não haverá flag que reative o cursor incorreto. Spec afetada: T03. Verificar recuperação com falhas, cancelamento e deduplicação determinísticos; preservar lock/commit, clientId e mídia. Nenhuma mudança de protocolo ou migração autorizada por esta decisão.

## D004 — Estados e memória local do envio T04 (30/10/2026)

Executar a máquina de estados e o composer previstos na spec T04, sem alterar HTTP ou esquema. queued aguarda conexão WS; somente essa fila é drenada ao abrir o socket. Falhas recuperáveis exigem retry explícito, mantendo UUID/corpo e Retry-After; rejeições 4xx (exceto 408/425/429) não entram em retry. Isso impede reenvio de sending/rejected por reconexão. Confirmação de mesmo autor/clientId/corpo prevalece sobre falha tardia.

Rascunho e fila pertencem ao Workspace da conta, com chave conta/canal geral, compartilhados pelos painéis. Não persistir em storage/disco; logout/expiração/troca de conta elimina a memória. Reload pode perder envios locais não confirmados, sem apagar o histórico do servidor. Validar duplo submit, ACK tardio, queda/timeout após commit, 429, IME, emoji no limite e fechamento/reabertura/logout. Decisão detalha o comportamento já aprovado da T04 e não dispensa dependências ou checks.

## D005 — Janela paginada e leitura do histórico T05 (30/10/2026)

A [medição anterior à mudança](measurements/T05-baseline.json) em Chromium/Vite dev, 1440×1000, 10000 mensagens sintéticas (5% com 4000 UTF-16), registrou 10000 mensagens renderizadas, 93893 nós DOM, 175,1 MiB de heap e 80,528 s para catch-up (62,116 s de script e 6,914 s de layout). Amostra local única, sem throttling; não representa WAN ou produção. A lista inteira é custosa neste cenário.

Adotar janela explícita de até 200 mensagens por painel, navegada em páginas de 50, mantendo dados confirmados em memória e busca HTTP quando necessário. Não usar virtualização contínua com alturas estimadas: páginas explícitas preservam DOM estável da leitura e leitura assistiva previsível. Ancorar pelo ID e deslocamento do texto visível; recompor após prepend, zoom/reflow e mudanças de altura. Chegada de mensagens não desloca a janela pausada.

Seleção ativa pausa acompanhamento e impede navegação que removeria seus nós; continua copiável. Histórico não é região live: anunciar apenas contagens de novas mensagens/páginas solicitadas, sem reler conteúdo antigo. Ir para recentes é explícito. T05 mantém a exigência de limite mensurado, seleção, alturas variáveis e acesso a todo o histórico; não altera HTTP, retenção, migrações ou mídia. Comparar a mesma medição após implementar e registrar limites de testes assistivos.

## D006 — Drawer modal e popovers T06 (30/10/2026)

O drawer mobile é navegação modal: usar dialog.showModal, título acessível, botão Fechar menu com foco inicial, contenção de Tab e retorno ao acionador. A modalidade nativa torna o restante do documento inert sem sobrescrever atributos existentes de outros componentes. Conteúdo continua montado ao fechar para preservar hosts/controles de voz; header e fechamento ficam fora da área rolável.

Escape pertence à camada ativa. Popovers existentes continuam não modais, sem aria-modal/fundo inert/contenção global. Seu Escape não pode consumir o fechamento de um modal que esteja na frente; caso um popover esteja dentro de dialog modal, o portal fica nesse diálogo para não se tornar inert fora dele. Não alterar semântica de menus, emoji ou controles de voz indiscriminadamente. Navegação pelo drawer fecha e devolve foco ao acionador; mudanças de breakpoint também encerram a modalidade. T06 não altera mídia, sessão, HTTP ou migrações. Validar teclado, fundo, resize, 320 px/paisagem/zoom e leitores por contrato acessível; confirmação NVDA/VoiceOver real deve permanecer pendente se não executada.

## D007 — Contraste derivado sem substituir preferência T07 (30/10/2026)

Manter cores originais válidas em --primary/--secondary e no contrato salvo; tokens de controle/texto/indicador são derivados por contraste WCAG sRGB. Foregrounds de preenchimentos e gradientes são independentes; estados hover/active são avaliados com seus próprios fundos. Gradientes funcionais usam interpolação sRGB explícita, verificando extremos e mínimo interior de luminância. Ajustar extremos somente nos tokens derivados até permitir um mesmo foreground seguro; degradar a um preenchimento legível se necessário, sem persistir o ajuste como preferência.

Texto normal exige 4,5:1 (também usado conservadoramente onde há texto grande); gráficos/bordas relevantes e foco exigem 3:1. Separar gradiente de texto/indicadores do gradiente de preenchimento. Foco usa anel claro com separador escuro opaco para funcionar também sobre preenchimentos claros; não depender de mistura transparente ou brilho posterior. Validar hex restaurado, com fallback por campo sem escrita corretiva no armazenamento. Preview, salvar e cancelamento usam a mesma derivação. Validar matemática independentemente e estados renderizados (incluindo CSS de jogos), sem declarar auditoria completa de cores fixas sem evidência.

## D008 — Liberação e contrato de navegação T08 (30/10/2026)

Após explicação do bloqueio T01/T06/T09, o usuário autorizou: “vamos implementar a t08. faça como você achar melhor.” Dispensar essas dependências como bloqueio específico da T08: T01 é substituída para esta entrega pelos quatro destinos explicitamente definidos; T06 será reutilizada com suas verificações humanas ainda pendentes; T09 será reutilização incremental das primitivas atuais/T07, sem executar T09 ou afirmar catálogo entregue. Não marcar pesquisa/aceites dessas tarefas como realizados. Dependências históricas ficam na spec e notes; dependencias executáveis da T08 passam a nenhuma para o validador refletir a decisão.

Shell simples padrão com Conversa/Sala/Jogos/Agenda, Mais e auxiliar sob demanda. Dockview avançado opt-in por conta; parâmetro explícito shell=advanced permite fallback/entrada avançada sem apagar snapshots layout:v4:compact/wide. Modo simples não grava esses snapshots. URL #/v1/conversa|sala|jogos|agenda e histórico selecionam apresentação, sem entrar na voz automaticamente; hash desconhecido usa Conversa com replace. Mesmo Workspace/Voice, portal de palco com destino DOM permanente e players existentes; reposicionar hosts fisicamente, sem recriar portal por rota/breakpoint/modo. Validar identidade, sessão e três transmissões. Sem mudanças de API/migrações/produção.

## Próximas decisões

Registrar ID, data, contexto, opções, escolha, justificativa, specs afetadas e validação necessária. Alterações de marca, navegação, budgets, contratos, retenção e garantias de mídia exigem registro; não presumir aprovação por constarem como proposta no relatório.
