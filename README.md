# Entre amigos

Espaço privado para até 16 conexões: chat persistente, uma sala de voz e uma tela compartilhada. Interface em português. Sem cadastro público, anúncios, IA, gravação ou serviços pagos obrigatórios.

**Implementação local; validações externas ainda pendentes.** Leia [STATUS](docs/STATUS.md) antes de abrir o acesso à internet. Capacidade para 16 pessoas, OrbStack, ARM64, TURN e áudio de jogos no macOS não são garantidos por um build.

## Início rápido no Mac ou Linux

Pré-requisitos: Docker Engine com Compose **2.24.4+** (no Mac, OrbStack), Git e Bash. Não instale Java, Node ou Kubernetes no macOS. Reserve espaço para imagens e builds; os limites dos serviços somam cerca de 2,5 GiB, fora SO/cache/builds.

```bash
git clone <URL-HTTPS-DO-SEU-REPOSITORIO> chat-friends
cd chat-friends
./scripts/up.sh
./scripts/admin.sh admin
```

`up.sh` gera `.env` com credenciais aleatórias e permissão 0600 se não existir, valida os parâmetros e sobe a stack. Nunca versionar esse arquivo. O segundo comando lê a senha sem eco; mínimo 12 caracteres, máximo 72 bytes UTF-8. É idempotente: uma conta administradora existente mantém a senha. Não existe senha padrão. Abra **localhost, porta 8080**, no navegador da máquina que executa Docker. URLs locais aqui são instruções para o proprietário; não existe preview público do ambiente Codex.

Apenas os serviços web e mídia têm portas locais publicadas; PostgreSQL e backend permanecem internos. Execute `./scripts/compose.sh down` para parar sem apagar dados. **Não use `down -v` com dados importantes.**

Para internet: preencha `.env`, DNS, firewall e roteador conforme [NETWORKING](docs/NETWORKING.md), então `CHAT_MODE=internet ./scripts/up.sh`. Não basta trocar localhost por um IP privado: captura de mídia exige contexto seguro.

## O que está incluído

- Java 25 / Spring Boot 3.5.16, Maven Wrapper 3.9.11, PostgreSQL 17 / Flyway / sessões JDBC.
- React 19 / TypeScript / Vite, SDK oficial LiveKit, Caddy e LiveKit self-hosted.
- Contas individuais, administrador, alteração/redefinição de senha, desativação e invalidação de sessões.
- Mensagens de até 4.000 unidades UTF-16, confirmação após commit, idempotência por UUID, histórico e recuperação após reconexão.
- Presença da página separada da chamada, microfone, seleção de entrada, silenciar recepção, indicação de fala, tela ampliável e qualidade reduzida.
- Reserva de tela atômica com lease de 30 s, heartbeat, revogação e reconciliação. Sinalização passa por admissão que revalida sessão e retira fontes de tela de tokens reutilizados; veja [SECURITY](docs/SECURITY.md) para fronteiras e limite de múltiplas tracks maliciosas.
- Compose local/internet, backup/restauração, diagnóstico, Terraform GCP sem apply, CI e documentação operacional.

## Desenvolvimento e documentação

`./scripts/check.sh` executa testes com PostgreSQL separado e build/lint do frontend em containers. [CONTRIBUTING](CONTRIBUTING.md) explica execução parcial e testes de navegador. Não execute testes destrutivos contra o banco `friends`.

| Tema | Guia |
|---|---|
| Arquitetura e decisões | [ARCHITECTURE](docs/ARCHITECTURE.md), [ADRs](docs/adr/001-foundation.md) |
| API e segurança | [API](docs/API.md), [SECURITY](docs/SECURITY.md) |
| Uso | [USER_GUIDE](docs/USER_GUIDE.md) |
| OrbStack e rede | [LOCAL_SETUP](docs/LOCAL_SETUP.md), [NETWORKING](docs/NETWORKING.md) |
| Operação e dados | [OPERATIONS](docs/OPERATIONS.md), [BACKUP_RESTORE](docs/BACKUP_RESTORE.md) |
| GCP e alternativas | [GCP_DEPLOY](docs/GCP_DEPLOY.md), [HOSTING_COSTS](docs/HOSTING_COSTS.md) |
| Migração | [MIGRATION](docs/MIGRATION.md) |
| Testes e limites | [TESTING](docs/TESTING.md), [COMPATIBILITY](docs/COMPATIBILITY.md), [STATUS](docs/STATUS.md) |
| Problemas | [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) |

O repositório já continha [LICENSE](LICENSE), GPL-3.0. Esse arquivo foi preservado; a intenção de licenciamento do código novo precisa ser confirmada pelo proprietário antes de distribuir. Não houve publicação de imagens ou recursos em nuvem. Dependências e suas licenças: [DEPENDENCIES](docs/DEPENDENCIES.md).
