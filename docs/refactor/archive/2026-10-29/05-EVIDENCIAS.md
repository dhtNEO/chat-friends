# Evidências, cobertura e limites

Base Git: `d8fdd89a7f980f7cf03736c6b83682cc517aaf15`. Data de apresentação: 29/10/2026, America/Sao_Paulo; logs da máquina podem usar 30/10 UTC.

## Inventário e escopo

[Inventário dos 276 arquivos versionados](evidencias/inventory.txt) e [inventário de rotas/métodos públicos](evidencias/api-inventory.txt). Inventariar não equivale a revisar linha a linha todos os arquivos. Binários, fontes, imagens, lockfiles e documentação histórica receberam inventário/inspeção dirigida; revisão aprofundada priorizou caminhos críticos.

| Área | Cobertura nesta análise |
|---|---|
| Frontend | App, api, theme, UI, Dock, trechos de Voice/RoomLayout/Popout/MediaPlayback, música, perfil/MFA, jogos/3D e agenda; CSS, manifests e testes |
| Backend | API, segurança/sessão, perfis, chat/eventos, mídia/admissão, música/gateway, jogos/roleta/ritmo, agenda, seleção de migrações; buscas por rotas/locks/validações |
| Dados | Estrutura e estratégia de migrações e testes; sem conexão com banco real |
| Bot | Fluxos de query, extração, fila, conexão e ritmo; suíte Python completa |
| Infra/CI | Compose, Caddy, builds e scan; Terraform/startup por leitura; scripts de segurança, backup/restore e configuração |
| Docs | README, AGENTS, arquitetura, segurança, status, testes/compatibilidade e leitura dirigida dos guias operacionais |

## Comandos e resultados finais

- `npm ci --ignore-scripts --cache /workspace/work/npm-cache`: preparação local, sem alteração de lockfile. A instalação foi feita após encerrar tentativa bloqueada pelo sandbox.
- `npm run lint && npm run build`: aprovados. Chunk principal 1.315,03 kB minificado / 349,44 kB gzip; CSS 221,76 / 30,31 kB gzip; Three separado com 531,54 / 131,92 kB. Métricas do build, não Web Vitals de campo.
- `CHROMIUM_PATH=/usr/bin/chromium APP_TEST_URL=http://127.0.0.1:4180 npx playwright test tests/auth.spec.ts tests/demo.spec.ts tests/games-demo.spec.ts tests/outlook-demo.spec.ts tests/party-demo.spec.ts tests/rhythm-timing.spec.ts --reporter=list`: **31 passaram** em aproximadamente 2,1 min. [Log](evidencias/browser-tests.log).
- `python -m unittest discover -s music-bot -v`, em venv temporário com requirements do projeto: **30 passaram**, aproximadamente 12,8 s. [Log](evidencias/python-tests.log).
- `node --test scripts/tests/*.test.mjs`: [resultado completo](evidencias/node-tests.log). Resumo final abaixo.
- Probes de Chromium no demo: [medições](evidencias/browser.json), [desktop](evidencias/desktop.png), [390 px](evidencias/mobile.png), [320 px](evidencias/small.png).
- `git status --short`: vazio após as verificações; nenhum arquivo versionado alterado.

### Resumo Node

```text
✔ renderização privada rejeita override de rede de credenciais (86.802073ms)
✔ upgrade retira snapshots completos e temporários do mount do helper sem perder backup (65.050194ms)
ℹ tests 28
ℹ suites 0
ℹ pass 28
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2373.637641
```

## Reproduções específicas

**E01:** viewport 390×844 → entrar no demo → Abrir menu → Escape → `.drawer-open` continua com contagem 1. Fechar pelo scrim ainda funciona. Não confundir isso com falta absoluta de saída por mouse.

**E02:** posições dos botões foram comparadas à largura do viewport. Documento tinha scrollWidth igual ao viewport; o problema está na navegação horizontal interna. Em 390 px, Outlook/restaurar/admin/configurações/sair estão fora do trecho inicial; em 320 px, Jogos também. É problema de descoberta/hierarquia, não necessariamente impossibilidade de rolar a barra.

**E03:** frontend normal em 4180, interceptar apenas `/api/me` com 503 JSON e abrir página. Botão Entrar no espaço aparece; lista de alertas é vazia. Prova distinta dos testes existentes que cobrem falha após enviar credenciais.

**E08:** aplicar a fórmula de luminância/contraste à cor #0ea5e9. A função textOn retorna #ffffff; contraste é cerca de 2,77:1. Um probe exploratório no botão de login encontrou fundo transparente por uso de gradiente, portanto não foi usado como prova de contraste renderizado. A evidência reportada é a fórmula e o uso de tokens; gradientes e estados devem ser auditados em T07.

**E09:** no filtro da Agenda do mês, startsAt deve ter o mesmo mês/ano; isso exclui deterministicamente evento que começa no mês anterior e termina no mês selecionado. Reprodução integrada está especificada em T15.

## O que não foi validado aqui

Não rodaram Maven/Java com PostgreSQL, suíte de mídia real/ICE, testes completos de stack/Caddy em containers, scan atual de CVEs/imagens, Terraform validate, restore, WAN, Mac/OrbStack, Safari físico, carga 16 ou teste com usuários. Não se leu banco, conteúdo real de chat, arquivos de segredos ou credenciais. Não se iniciou nem alterou a stack existente.

Os testes de frontend usam demo/mocks e os do bot simulam serviços. Seus sucessos não comprovam áudio real, rede pública, provedor YouTube, latência do ritmo ou qualidade perceptiva. O relatório não declara ausência de vulnerabilidades.

## Preparação e falhas de ambiente

Dependências locais incompletas causaram a primeira tentativa de build falhar; reinstalação pelo lockfile resolveu. Sockets locais e downloads precisaram da execução permitida fora do sandbox restrito. Uma primeira rodada Python sem LiveKit e uma rodada auth apontada ao demo foram descartadas e repetidas com configuração correta. Os resultados finais acima substituem essas tentativas, sem alterar código de aplicação ou assertions para fazê-los passar.

## Segurança dos artefatos

Screenshots usam personagens e mensagens do demo. Logs incluídos são de testes sintéticos. Não foram incluídos .env, arquivos generated, dumps, tokens, conteúdo de produção ou arquivos externos ao projeto. Relatório e specs apontam para o SHA fixado para permitir revisão reproduzível.
