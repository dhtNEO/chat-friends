# Fluxo de trabalho dos agentes

## Antes de implementar

Leia as instruções da raiz, README deste plano, decisões e spec. Confira o SHA atual e a diferença desde a base da análise. Reproduza ou investigue o achado: registre `validation` como `confirmed`, `resolved` ou `superseded`, `validated_sha` e uma nota com evidência. Uma hipótese não pode virar defeito confirmado por repetição do texto original.

Escolha tarefa `planned` cujas dependências estejam `done` ou `superseded` com decisão registrada. Declare `owner` estável (nome do agente ou responsável), `updated_at` ISO e mude para `in_progress` antes de editar código. Se já houver responsável, combine a transferência e registre em notes. Use uma branch de tarefa derivada de refactor quando o ambiente permitir; ambientes isolados seguem o AGENTS raiz. Não faça force-push nem sobrescreva trabalho concorrente.

## Estados e transições

- `planned` → `in_progress`: responsável e dependências disponíveis; revalidação registrada.
- `in_progress` → `blocked`: motivo concreto em blocked_reason; registrar o próximo passo.
- `blocked` → `in_progress`: explicar resolução e limpar blocked_reason.
- `in_progress` → `in_review`: critérios e evidências preenchidos; PR/commit em evidence.
- `in_review` → `done`: revisão concluída, checks relevantes aprovados e evidências de aceite registradas. Não concluir com testes obrigatórios pendentes.
- Qualquer tarefa não concluída → `superseded`: decisão referenciada em evidence/notes, indicando resolução existente ou tarefa substituta. Não implementar correção já resolvida na main.
- Reabrir `done` apenas com motivo e regressão documentados.

## Durante a execução

Um PR por tarefa ou fatia coerente. Inclua ID no título, problema, comportamento resultante, validação e limites. Atualize a spec se o código exigir mudança de contrato; registre decisão antes de alterar escopo ou dependências. Cada dependência dispensada precisa de motivo documentado. A descrição da tarefa não autoriza deploy, alteração de produção, gastos ou operações destrutivas.

Documentação ativa se atualiza junto do código: checklist na spec, estado/owner/evidence no backlog, contratos e guias afetados. Preserve invariantes de segurança, migrações e três transmissões simultâneas. Reutilize testes relevantes; não enfraqueça asserções nem invente evidências. Dados e bancos de teste devem ser descartáveis.

## Evidências e handoff

Use evidence como lista de referências a PR, commit, arquivo de resultado sanitizado ou decisão. Registre comando, SHA testado, resultado e limitações em documento de execução ou notes. Não inclua senhas, mensagens privadas, cookies, tokens ou dumps. Se interromper trabalho, mantenha estado correto e anote arquivos tocados, o que falta e comando para retomar.

## Definição de conclusão

Critérios da spec atendidos ou substituídos por decisão explícita; revisão e checks relevantes aprovados; documentação e contratos atuais; evidência associada ao código; ausência de pendência essencial. Rode `python3 docs/refactor/validate.py`. Esse verificador garante estrutura e referências, não comprova comportamento funcional nem substitui revisão.

## Registro de tarefa

Cada item de backlog.json mantém id/prioridade/fase/título/dependências, status, owner, updated_at, validation, validated_sha, evidence, blocked_reason e notes. Os campos legados de idioma português são preservados para os dados de planejamento. Status e responsáveis vivem exclusivamente nesse arquivo; não criar outro quadro divergente.
