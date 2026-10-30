# Histórico da documentação ativa

## 30/10/2026 — Inicialização

- Branch baseada na main atual, com PR #29 preservado.
- Pacote da análise anterior arquivado integralmente com evidências históricas.
- 30 specs ativas e backlog canônico com responsável, estados e revalidação.
- Fluxo de execução/handoff para agentes e verificador de consistência.
- README e AGENTS raiz apontam para o plano ativo.
- Nenhuma tarefa funcional implementada por esta inicialização.

## 30/10/2026 — Preparativos T01

- Inventário estático no SHA de refactor, jornadas e heurísticas separadas das hipóteses de usuários.
- Roteiro de duas rodadas com 5–8 participantes cada, métricas, metas propostas e formulário vazio.
- Reserva/revalidação registradas; tarefa mantém critérios humanos pendentes no backlog.
- Nenhum redesign, resultado de sessão ou decisão de marca presumido.

## 30/10/2026 — T02 para revisão

- Sessão diferencia carregamento, anonimato, autenticação e indisponibilidade, com recuperação e preservação de contexto.
- Transporte unifica erros/rede/timeout/upload, Retry-After e descarte de respostas de sessão anterior; confirmação 428 sem reenvio automático.
- Contrato e testes de sessão/transmissões atualizados; resultados e limites em [execução T02](executions/T02.md). Revisão pendente; estado no backlog.

## 30/10/2026 — Preparação T03

- Revalidação estática do cursor, catch-up e callbacks na base atual.
- Impedimento pela dependência T02 aberta registrado no backlog, com owner e próximos testes em [execução T03](executions/T03.md).
- Nenhuma mudança funcional; critérios de aceite pendentes.

## 30/10/2026 — Recuperação T03 para revisão

- Aceite explícito da T02 registrado, com correção da fixture de mídia que falhou no CI e 33 testes de sessão/transporte aprovados.
- Cursor HTTP separado do maior ID observado; buffer/deduplicação, retry independente de WS e cancelamento após logout.
- Indicador com quatro estados, envelopes validados e teste de ordem commit/ACK com PostgreSQL descartável.
- 12 casos T03, 8 casos demo de três transmissões e 117 testes backend aprovados; [evidências e limites](executions/T03.md). T03 aguarda revisão/CI.

## 30/10/2026 — Envio e rascunho T04 para revisão

- Aceite T03 registrado após integração/CI; T04 implementa estados por envio e retry explícito com UUID/corpo estáveis.
- Rascunho por conta/canal em memória, compartilhado entre painéis e descartado no logout; composer multiline, IME e emoji em 4.000 unidades UTF-16.
- Contratos/guias atualizados; 17 casos T04, 8 de mídia demo e 117 backend verificados. Ocorrência isolada em auth e limites dos checks registrados em [execução T04](executions/T04.md). Revisão/CI pendentes.

## 30/10/2026 — Histórico T05 para revisão

- Merge/CI da T04 registrados; T05 revalidada e medida com 10000 mensagens antes de limitar a janela a 200, navegada em blocos de 50.
- Âncora de ID/deslocamento, loading/error/end, seleção preservada, contador e retorno explícito a recentes; histórico separado de regiões live.
- 11 casos T05, medição comparativa, 8 streams demo e 117 backend verificados; corrida de fixture T03 corrigida sem enfraquecer asserções. [Resultados e pendências](executions/T05.md), incluindo leitor real, revisão e CI.
