# Contribuindo

Leia README e STATUS. Uma tarefa cloud já é isolada: use o checkout existente; não crie worktrees sem pedido explícito. Não coloque segredos, conversas reais, backups ou cookies em commits e evidências.

## Ambiente sem runtimes no host

```bash
./scripts/up.sh
./scripts/admin.sh admin
./scripts/check.sh
```

Backend: `backend/` é um monólito por responsabilidade (Accounts, Chat, Media, Events). Migrações SQL em `backend/src/main/resources/db/migration`. Nunca altere uma migração já aplicada; crie a próxima versão. Frontend: `frontend/src`, API tipada, estado React e ciclo de vida LiveKit.

Execução parcial: `./scripts/compose.sh up -d db livekit`. Para compilar apenas Java, use `docker run --rm -v "$PWD/backend:/src" -v friends-maven:/root/.m2 -w /src maven:3.9.11-eclipse-temurin-25 ./mvnw -B -ntp package -DskipTests`. Isso compila, **não valida os testes**. Para testes integrados use check.sh e seu banco separado. O frontend pode usar `docker run --rm -p 127.0.0.1:5173:5173 -v "$PWD/frontend:/src" -w /src node:24.22.1-alpine sh -c 'npm ci && npm run dev'`; ajuste o proxy Vite para um backend alcançável e APP_ORIGIN para a origem 5173 antes de testar WebSocket. O caminho padrão, totalmente validável, é Compose/Caddy na porta 8080.

## Navegador

Com stack e administrador de teste já criados, defina `TEST_ADMIN_PASSWORD` pelo gerenciador de segredos ou leia silenciosamente no shell. Nunca a escreva no histórico do shell. Instale dependências com `npm ci`, os navegadores com `npx playwright install --with-deps chromium` e execute `npm test` em frontend. Esse caminho requer Node apenas no runner de CI ou em um container Playwright compatível. `CHROMIUM_PATH` permite um Chromium já instalado. Dados criados pelos testes são sintéticos. Não execute em ambiente de amigos em uso. Relatórios de falhas podem conter valores de formulários; trate-os como sensíveis e não publique por padrão.

## Primeira contribuição

1. Crie branch curta a partir de main (sem impor rebase ao trabalho de outros).
2. Reproduza o problema, faça alteração focada, inclua teste quando protege uma falha real.
3. Execute checks pertinentes. Informe exatamente o que não pôde executar.
4. Atualize docs/API se mudar contrato; STATUS se mudar evidência ou pendências.
5. Abra PR com problema, comportamento resultante e validação. Revise autorização, transações, falhas de rede e acessibilidade. Não publicar imagens automaticamente.

Convenções: TypeScript strict; Java 25; SQL parametrizado; mensagens de interface em português; logs sem corpos do chat, tokens ou senhas. Não trocar lockfiles inadvertidamente; `npm ci` e Maven Wrapper são os caminhos de reprodução. Novas dependências exigem motivo e revisão de licença.
