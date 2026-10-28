# Entre amigos

Espaço privado para até 16 conexões: chat persistente, uma sala de voz e uma tela compartilhada. Interface em português. Sem cadastro público, anúncios, IA, gravação ou serviços pagos obrigatórios.

**Dois modos: dev (local) e prd (internet).** O proprietário confirmou o funcionamento em produção no Mac com DuckDNS. Leia [STATUS](docs/STATUS.md) para evidências e limites; capacidade para 16 pessoas precisa de medição.

**Está começando no projeto?** Leia o [guia para desenvolvedores júnior](docs/JUNIOR_DEVELOPER_GUIDE.md): conceitos, instalação, código, banco, chat, mídia, produção e operação, com fluxogramas.

## Modos de execução

| Modo | Comando | Acesso |
|---|---|---|
| `dev` (padrão) | `CHAT_MODE=dev ./scripts/up.sh` | http://localhost:8080, portas somente em loopback |
| `prd` | `CHAT_MODE=prd ./scripts/up.sh` | HTTPS/WSS, DuckDNS :18443 e DNS-01 |

`CHAT_MODE` é variável dos comandos. Não definir no `.env`. O mesmo checkout não deve executar os dois modos simultaneamente sobre o mesmo banco.

## Modo demo (sem conexão real)

Para mexer na interface sem Docker, backend ou LiveKit: `cd frontend && npm ci && npm run demo` e abra http://localhost:5173. Qualquer usuário/senha entra. Amigos simulados conversam, falam na call, entram e saem (para ouvir os efeitos sonoros) e um deles transmite uma tela animada; "Encerrar transmissão travada" (botão ⋯) libera a tela para você testar o compartilhamento com sua tela real, que fica só no seu navegador. Mudanças no código aparecem na hora. Sem Node no host: `docker run --rm -it -p 127.0.0.1:5173:5173 -e npm_config_cache=/tmp/npm-cache -v "$PWD/frontend:/src" -w /src -u "$(id -u):$(id -g)" node:24.22.1-alpine sh -c "npm ci && npm run demo"`. A simulação fica em `frontend/src/demo/` e não entra no build de produção.

## Início rápido no Mac ou Linux

Pré-requisitos: Docker Engine com Compose **2.24.4+** (no Mac, OrbStack), Git e Bash. Não instale Java, Node ou Kubernetes no macOS. Reserve espaço para imagens e builds; os limites dos serviços, incluindo o bot de música, somam cerca de 3 GiB, fora SO/cache/builds.

```bash
git clone <URL-HTTPS-DO-SEU-REPOSITORIO> chat-friends
cd chat-friends
./scripts/up.sh
./scripts/admin.sh admin
```

`up.sh` gera `.env` com credenciais aleatórias e permissão 0600 se não existir, valida os parâmetros e sobe a stack. Nunca versionar esse arquivo. O segundo comando lê a senha sem eco; mínimo 12 caracteres, máximo 72 bytes UTF-8. É idempotente: uma conta administradora existente mantém a senha. Não existe senha padrão. Abra **localhost, porta 8080**, no navegador da máquina que executa Docker. URLs locais aqui são instruções para o proprietário; não existe preview público do ambiente Codex.

Apenas os serviços web e mídia têm portas locais publicadas; PostgreSQL e backend permanecem internos. Execute `./scripts/compose.sh down` para parar sem apagar dados. **Não use `down -v` com dados importantes.**

Para internet: preencha `.env`, DNS, firewall e roteador conforme [NETWORKING](docs/NETWORKING.md), então `CHAT_MODE=prd ./scripts/up.sh`. Não basta trocar localhost por um IP privado: captura de mídia exige contexto seguro.

## O que está incluído

- Java 25 / Spring Boot 3.5.16, Maven Wrapper 3.9.11, PostgreSQL 17 / Flyway / sessões JDBC.
- React 19 / TypeScript / Vite, SDK oficial LiveKit, Caddy e LiveKit self-hosted.
- Bot de música na chamada: busca por nome ou link do YouTube, fila compartilhada, pausa/pular e volume individual. Serviço privado incluído no Compose; detalhes e limites em [MUSIC](docs/MUSIC.md).
- Contas individuais, administrador, alteração/redefinição de senha, desativação e invalidação de sessões. Cada pessoa troca nick, usuário, foto de perfil, cores do tema, tamanho da interface e sons da chamada.
- Mensagens de até 4.000 unidades UTF-16, confirmação após commit, idempotência por UUID, histórico e recuperação após reconexão.
- Presença da página separada da chamada, microfone, seleção de entrada, ganho de microfone, supressão de ruído nativa, volumes locais por participante/transmissão, indicadores de mic/recepção e tela até Full HD 60 fps com controles próprios, layout em painéis arrastáveis.
- Reserva de tela atômica com lease de 30 s, heartbeat, revogação e reconciliação. Sinalização passa por admissão que revalida sessão e retira fontes de tela de tokens reutilizados; veja [SECURITY](docs/SECURITY.md) para fronteiras e limite de múltiplas tracks maliciosas.
- Compose dev/prd, backup/restauração, diagnóstico, Terraform GCP sem apply, CI e documentação operacional.

## Desenvolvimento e documentação

`./scripts/check.sh` executa testes com PostgreSQL separado e build/lint do frontend em containers. [CONTRIBUTING](CONTRIBUTING.md) explica execução parcial e testes de navegador. Não execute testes destrutivos contra o banco `friends`.

| Tema | Guia |
|---|---|
| Aprendizado e visão completa | [Guia para desenvolvedores júnior](docs/JUNIOR_DEVELOPER_GUIDE.md) |
| Arquitetura e decisões | [ARCHITECTURE](docs/ARCHITECTURE.md), [ADRs](docs/adr/001-foundation.md) |
| API e segurança | [API](docs/API.md), [SECURITY](docs/SECURITY.md) |
| Uso | [USER_GUIDE](docs/USER_GUIDE.md) |
| OrbStack e rede | [LOCAL_SETUP](docs/LOCAL_SETUP.md), [NETWORKING](docs/NETWORKING.md) |
| Acesso público com endereço gratuito | [DuckDNS :18443 e DNS-01](docs/DUCKDNS_SETUP.md), [migração entre modos](docs/MIGRATION.md) |
| Operação e dados | [OPERATIONS](docs/OPERATIONS.md), [BACKUP_RESTORE](docs/BACKUP_RESTORE.md) |
| GCP e alternativas | [GCP_DEPLOY](docs/GCP_DEPLOY.md), [HOSTING_COSTS](docs/HOSTING_COSTS.md) |
| Migração | [MIGRATION](docs/MIGRATION.md) |
| Testes e limites | [TESTING](docs/TESTING.md), [COMPATIBILITY](docs/COMPATIBILITY.md), [STATUS](docs/STATUS.md) |
| Problemas | [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) |
| Próximas funcionalidades (planejadas) | [Atalhos pessoais](docs/SHORTCUTS_PLAN.md), [fila de música compartilhada](docs/MUSIC_PLAYER_PLAN.md) |

O repositório já continha [LICENSE](LICENSE), GPL-3.0. Esse arquivo foi preservado; a intenção de licenciamento do código novo precisa ser confirmada pelo proprietário antes de distribuir. Não houve publicação de imagens ou recursos em nuvem. Dependências e suas licenças: [DEPENDENCIES](docs/DEPENDENCIES.md).

Para atualizar a instalação com privilégios separados, MFA e recuperação, siga [o procedimento de segurança](docs/SECURITY_UPGRADE.md) antes do próximo deploy. Preserve `generated/runtime.env` e a chave MFA junto ao backup criptografado.

## Clube da Sorte

Abra **Jogos** para o caça-níquel com manivela e a Roleta Royale 3D, individual ou em salas para até oito pessoas. Coins, apostas, devoluções, extrato e pódio são controlados pelo servidor. A música da main permanece disponível; integração da fila com Coins fica para depois. Regras e operação em [GAMES](docs/GAMES.md).
