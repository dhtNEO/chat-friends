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

## Próximas decisões

Registrar ID, data, contexto, opções, escolha, justificativa, specs afetadas e validação necessária. Alterações de marca, navegação, budgets, contratos, retenção e garantias de mídia exigem registro; não presumir aprovação por constarem como proposta no relatório.
