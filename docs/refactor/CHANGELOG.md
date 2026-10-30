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
