# Dependências e licenças

Versões diretas fixadas em pom.xml/package.json/Dockerfiles/Compose; resolução JS registrada em package-lock.json, provider em .terraform.lock.hcl, Maven via BOM Spring Boot. Atualizações precisam repetir testes. Tags de imagens fixam versão; para reprodução bit a bit fixe também digest multiarch após verificar manifests, pois tags podem ser republicadas.

| Componente | Licença de referência |
|---|---|
| Spring Boot/Security/Session, Maven, Flyway Community | Apache-2.0 |
| Eclipse Temurin/OpenJDK | GPL-2.0 com Classpath Exception (JDK) |
| PostgreSQL | PostgreSQL License |
| React, Vite, TypeScript, Node (com componentes adicionais) | MIT / Apache-2.0 (TypeScript) |
| LiveKit server e SDKs | Apache-2.0 |
| Dockview (painéis arrastáveis: dockview-react, dockview, dockview-core) | MIT |
| Caddy | Apache-2.0 |
| Terraform 1.13 | Business Source License 1.1; verificar termos de uso |
| Provider Google | MPL-2.0 |
| Playwright | Apache-2.0 |

É inventário inicial, não parecer jurídico nem inventário exaustivo de transitivas/imagens. Consulte LICENSE/NOTICE de cada distribuição antes de redistribuir. Preserve avisos; gere SBOM e revisão de transitivas na publicação. `npm audit` é executado na validação, não prova ausência de vulnerabilidades desconhecidas. CI executa Trivy em arquivos para dependências/segredos; mantenha banco de advisories atualizado e trate resultados com contexto.

LICENSE GPL-3.0 já existia no commit inicial e não foi alterado. Confirmação da licença pretendida para o código novo permanece decisão do proprietário.

Edge DuckDNS: Caddy 2.11.7, `caddy-dns/duckdns` v0.5.0 e `libdns/duckdns` v0.3.0; resolução Go completa em `infra/caddy/go.mod` e `go.sum`. O módulo local `duckdns_private` filtra erros do provider antes de enviá-los aos logs. Fontes: https://github.com/caddy-dns/duckdns e https://github.com/libdns/duckdns. Não publicar imagens sem revisar os avisos/licenças das distribuições.


## Artefatos de segurança

Java mantém Boot 3.5.16/Spring 6.2.19 com Tomcat 10.1.61, Jackson 2.21.8 e JRE 25.0.4.1. Caddy 2.11.7 é compilado com Go 1.27.3 sobre Alpine 3.24.3; web usa o mesmo módulo/lock e não recebe token DNS. LiveKit 1.13.11 é recompilado com Go 1.27.3 e x/net 0.60.0, única alteração do módulo upstream. PostgreSQL 17.11 permanece na mesma major e tem gosu 1.19 recompilado com Go 1.27.3. Fontes dos dois últimos têm checksum no Dockerfile. Não desativar validação de checksums/TLS para construir.

`mvn verify` gera CycloneDX `backend/target/bom.json` com dependências resolvidas. CI analisa esse SBOM e SO das imagens Java, e SO/bibliotecas Go das demais imagens. Duas exceções temporárias e específicas de Spring MVC têm justificativa e vencimento em `security/vulnerability-exceptions.json`; novos HIGH/CRITICAL ou exceções vencidas bloqueiam o gate. Isso não é uma alegação de ausência de vulnerabilidades. Fontes/recursos XSLT/SSE não podem ser adicionados sem reavaliar essas exceções.
