# Outlook — calendário da galera

A aba **Outlook** é a agenda compartilhada do espaço, usando as contas existentes. Não exige conta Microsoft nem integra e-mail/Outlook da Microsoft.

Todos os membros ativos podem criar eventos e ver os eventos da galera. Informe nome, jogo, local, início, fim e um recado opcional. O criador começa com presença confirmada. Cada pessoa pode responder **Vou**, **Talvez** ou **Não vou** e mudar sua resposta; nomes e quantidades ficam visíveis no evento.

O criador e os administradores podem editar ou cancelar. Cancelamentos preservam o evento e a lista de presença para consulta; eventos cancelados ou encerrados não aceitam novas respostas. Detalhes de eventos em andamento também podem ser ajustados. Uma edição antiga não sobrescreve outra edição: a versão precisa corresponder à versão atual do servidor. Se houver conflito, confira a agenda atualizada e abra novamente a edição.

O calendário começa na segunda-feira, tem navegação mensal, botão Hoje, seleção de dia e agenda do mês. Eventos que passam da meia-noite aparecem em ambos os dias. Os horários são informados e exibidos no fuso do navegador, indicado na tela, e persistidos como instantes UTC; os limites diários usam o fuso de cada pessoa. Horários locais inexistentes na mudança de horário de verão são recusados no formulário.

A agenda atualiza a cada 15 segundos enquanto a aba do navegador está visível, ao retornar à aba/janela e após alterações. Não há envio automático de mensagens, notificações, e-mails ou lembretes nesta versão.

## Limites e persistência

- Título: 1–120 caracteres; jogo: até 80; local: até 160; recado: até 2.000.
- Criação com início futuro, tolerando cinco minutos de diferença de relógio; até dois anos à frente.
- Duração positiva de até 48 horas. Edições podem preservar eventos já iniciados, dentro da janela de dois anos ao redor da data atual.
- Dez novos eventos por conta por minuto, além dos orçamentos HTTP existentes.
- Consultas de até 63 dias, com até 500 eventos por resposta. A interface busca os 42 dias visíveis.
- Criar novamente com o mesmo clientId e conteúdo recupera o mesmo evento. Reutilizar a chave com outro conteúdo gera conflito.

Migração incremental **V11__outlook_calendar.sql**, preservando V1–V10. As tabelas `outlook_events` e `outlook_attendees` guardam agenda e respostas no PostgreSQL. Mutações e leitura consistente usam advisory lock transacional próprio (`918274`), separado dos jogos. Chaves e restrições impedem duplicação de eventos/presenças. A migração mantém as permissões usuais do migrador de manutenção e do papel limitado do runtime.

## API autenticada

Todas as rotas exigem sessão ativa e respeitam MFA/políticas existentes. POST e PUT exigem CSRF.

| Rota | Corpo / uso |
|---|---|
| GET `/api/outlook?from=...&to=...` | Instantes ISO 8601 com fuso; eventos que cruzem o período `[from,to)` |
| POST `/api/outlook` | `{clientId, details}`; retorna `{id}` |
| PUT `/api/outlook/{id}` | `{version, details}`; criador/admin |
| POST `/api/outlook/{id}/cancel` | `{version}`; criador/admin |
| POST `/api/outlook/{id}/response` | `{response: "going" ou "maybe" ou "declined"}`; resposta da própria conta |

`details`: `{title, game, location, description, startsAt, endsAt}`. Textos opcionais usam string vazia; datas usam ISO 8601 com fuso. A listagem inclui `creatorId`, `creator`, `cancelled`, `version` e `attendees: [{id,name,response}]`. As versões aumentam na edição e no cancelamento; respostas de presença são idempotentes e não alteram a versão dos detalhes.

## Atualização e verificação

Use `./scripts/up.sh` em dev ou `CHAT_MODE=prd ./scripts/up.sh` em produção para reconstruir backend/frontend e aplicar as migrações pelo migrador. Na integração com atalhos, a agenda é criada pela V11 da linha de jogos ou pela V12 na linha de atalhos; os históricos existentes são preservados conforme [SECURITY_UPGRADE](SECURITY_UPGRADE.md). Não habilite Flyway nem credenciais de manutenção no backend runtime. O calendário não depende do bot musical.

Testes de backend usam somente `friends_test`: compartilhamento, permissões de criador/admin, sessão/CSRF, concorrência e repetição de criação, conflito de versões, respostas individuais, cancelamento, contas desativadas, limites e eventos noturnos. Navegador valida criação, horários em America/Sao_Paulo, edição, cancelamento, presença, navegação mensal e celular. O modo demo simula a agenda apenas na página; o armazenamento persistente pertence à aplicação conectada.
