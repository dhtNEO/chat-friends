# Refactor — documentação ativa

Este diretório orienta a execução das 30 specs por agentes e mantenedores. Criado em 30/10/2026 a partir da main `1b0ffd9a0dc15de3a2dcf0efb0053791c425a1e4`. A branch `refactor` é a linha de integração deste plano.

## Comece aqui

1. Leia o [AGENTS.md da raiz](../../AGENTS.md) e o [fluxo de trabalho](WORKFLOW.md).
2. Consulte o [backlog canônico](backlog.json), dependências e responsável antes de escolher tarefa.
3. Leia a spec em `specs/`, revalide o achado no SHA atual e registre o resultado no backlog.
4. Atualize spec, evidências e backlog no mesmo PR da implementação.

**Fontes de verdade:** specs individuais para requisitos; `backlog.json` para estado, responsáveis e evidências; código/testes atuais para comportamento implementado. [Decisões](DECISIONS.md) registram mudanças de direção. O arquivo consolidado e os CSV/JSON no arquivo histórico são snapshots e não devem controlar a execução.

## Mudanças desde a análise

A análise de 29/10 foi feita em `d8fdd89a7f980f7cf03736c6b83682cc517aaf15`. A main incorporou o PR #29: até três transmissões simultâneas, seleção individual/grade e migração V13. As specs ativas respeitam esse comportamento. Achados e números de testes do relatório são históricos; todas as tarefas começam com revalidação pendente.

## Plano de execução

F0: baseline, garantias de mídia e dependências (T01/T21/T24). F1: sessão/chat, acessibilidade, agenda, polling e segurança. F2: shell, componentes, mídia e performance. F3: features, dados e recuperação. F4: capacidade e aceite. O [plano original](archive/2026-10-29/02-PLANO-DE-ACAO.md) detalha esforço e sequência; dependências vigentes estão no backlog. Estimativas são hipóteses e devem ser revistas após revalidação.

| Spec | Tarefa | Prioridade | Dependências |
|---|---|---|---|
| [T01](specs/T01.md) | Validar jornadas e estabelecer a linha de base | P1 | — |
| [T02](specs/T02.md) | Separar autenticação, indisponibilidade e erros de API | P1 | — |
| [T03](specs/T03.md) | Tornar a recuperação do chat resistente a lacunas | P1 | T02 |
| [T04](specs/T04.md) | Especificar envio, falha e rascunho do chat | P1 | T02 T03 |
| [T05](specs/T05.md) | Preservar posição do histórico e destacar novas mensagens | P2 | T03 T04 |
| [T06](specs/T06.md) | Corrigir foco e fechamento do menu mobile | P1 | — |
| [T07](specs/T07.md) | Garantir contraste nas cores personalizadas | P1 | — |
| [T08](specs/T08.md) | Criar navegação adaptativa e shell simplificado | P1 | T01 T06 T09 |
| [T09](specs/T09.md) | Definir sistema visual e componentes compartilhados | P1 | T01 T07 |
| [T10](specs/T10.md) | Reorganizar entrada na voz e controles persistentes | P1 | T02 T08 T09 |
| [T11](specs/T11.md) | Projetar transmissão, layouts prontos e janelas externas | P1 | T08 T10 |
| [T12](specs/T12.md) | Melhorar busca, fila e feedback de música | P2 | T08 T09 T19 |
| [T13](specs/T13.md) | Unificar lobby e estados dos jogos | P2 | T08 T09 T19 |
| [T14](specs/T14.md) | Validar latência e justiça temporal do Beat Club | P1 | T19 |
| [T15](specs/T15.md) | Corrigir consistência e cobertura da agenda | P1 | T02 |
| [T16](specs/T16.md) | Melhorar perfil, MFA e reautenticação contextual | P2 | T02 T09 |
| [T17](specs/T17.md) | Dividir responsabilidades e habilitar regras de hooks | P2 | T02 T03 |
| [T18](specs/T18.md) | Reduzir carregamento inicial e trabalho de renderização | P1 | T08 T17 |
| [T19](specs/T19.md) | Compatibilizar polling e limites com uso simultâneo | P1 | — |
| [T20](specs/T20.md) | Validar e normalizar avatares no servidor | P2 | — |
| [T21](specs/T21.md) | Definir garantia adversarial das três transmissões | P1 | — |
| [T22](specs/T22.md) | Classificar erros e acrescentar observabilidade mínima | P1 | T02 |
| [T23](specs/T23.md) | Cobrir bot de música e dependências no gate de segurança | P1 | — |
| [T24](specs/T24.md) | Reconciliar exceções e versões efetivamente resolvidas | P1 | — |
| [T25](specs/T25.md) | Tornar recuperação completa e ensaiável | P2 | T24 |
| [T26](specs/T26.md) | Formalizar contratos, migrações e crescimento de dados | P2 | T24 |
| [T27](specs/T27.md) | Estabelecer gates de acessibilidade e regressão visual | P1 | T06 T07 T08 |
| [T28](specs/T28.md) | Validar capacidade e compatibilidade reais | P1 | T10 T11 T19 T22 |
| [T29](specs/T29.md) | Consolidar documentação e nomes públicos | P2 | T01 T15 T24 T26 |
| [T30](specs/T30.md) | Planejar rollout gradual e aceite final | P1 | T05 T12 T13 T14 T15 T16 T18 T20 T21 T23 T25 T26 T27 T28 T29 |

## Histórico e referências

O [pacote original completo](archive/2026-10-29/README.md) preserva relatório, pesquisa UI/UX, wireframes, specs, backlog exportado e evidências sintéticas. Não editar esse snapshot para indicar progresso. As capturas e limites de uma tela representam a versão analisada, não a main atual.

Validar consistência documental: `python3 docs/refactor/validate.py`. Não é necessário iniciar a aplicação para atualizar somente documentação. Verificações funcionais devem seguir cada spec e o AGENTS da raiz.
