# Decisões do plano

## D001 — Base da branch e arquivo histórico (30/10/2026)

A branch refactor começa na main `1b0ffd9a0dc15de3a2dcf0efb0053791c425a1e4`. O relatório e resultados originais permanecem em archive/2026-10-29, com SHA de auditoria preservado. Specs individuais fora de archive e backlog.json são ativos. Revalidar cada achado no SHA de execução; nenhum resultado histórico fecha tarefa na nova base.

## D002 — Três transmissões simultâneas (30/10/2026)

Preservar o PR #29 da main: até três transmissões, seleção individual/grade, leases independentes e migração V13. Textos antigos de exclusividade global/uma tela não são requisitos ativos. T21 deve avaliar limites de leases e tracks por transmissor na implementação atual. T28 deve medir perfis com uma e três fontes e distinguir limite funcional de capacidade comprovada.

## D003 — Reversão do sincronizador T03 (30/10/2026)

A proposta de flag na spec T03 manteria em produção o caminho conhecido que perde mensagens e duplicaria o ciclo de callbacks. Adotar um único sincronizador pequeno e reverter pelo commit de implementação, preservando o contrato HTTP/WS e o esquema. Não haverá flag que reative o cursor incorreto. Spec afetada: T03. Verificar recuperação com falhas, cancelamento e deduplicação determinísticos; preservar lock/commit, clientId e mídia. Nenhuma mudança de protocolo ou migração autorizada por esta decisão.

## Próximas decisões

Registrar ID, data, contexto, opções, escolha, justificativa, specs afetadas e validação necessária. Alterações de marca, navegação, budgets, contratos, retenção e garantias de mídia exigem registro; não presumir aprovação por constarem como proposta no relatório.
