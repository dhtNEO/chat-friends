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
| Fontes do letreiro VGH: Russo One e Orbitron 700 (subconjunto latino, `frontend/public/brand/fonts`, auto-hospedadas por causa da CSP) | SIL OFL 1.1 (textos ao lado dos arquivos) |
| Kit de marca VGH (favicon, ícones PWA/Apple em `frontend/public/brand`) | Arte do projeto; a logo raster foi gerada por IA, revisar uso antes de distribuir |
| Caddy | Apache-2.0 |
| Terraform 1.13 | Business Source License 1.1; verificar termos de uso |
| Provider Google | MPL-2.0 |
| Playwright | Apache-2.0 |

É inventário inicial, não parecer jurídico nem inventário exaustivo de transitivas/imagens. Consulte LICENSE/NOTICE de cada distribuição antes de redistribuir. Preserve avisos; gere SBOM e revisão de transitivas na publicação. `npm audit` é executado na validação, não prova ausência de vulnerabilidades desconhecidas. CI executa Trivy em arquivos para dependências/segredos; mantenha banco de advisories atualizado e trate resultados com contexto.

LICENSE GPL-3.0 já existia no commit inicial e não foi alterado. Confirmação da licença pretendida para o código novo permanece decisão do proprietário.

Edge DuckDNS: Caddy 2.11.4, `caddy-dns/duckdns` v0.5.0 e `libdns/duckdns` v0.3.0; resolução Go completa em `infra/caddy/go.mod` e `go.sum`. O módulo local `duckdns_private` filtra erros do provider antes de enviá-los aos logs. Fontes: https://github.com/caddy-dns/duckdns e https://github.com/libdns/duckdns. Não publicar imagens sem revisar os avisos/licenças das distribuições.
