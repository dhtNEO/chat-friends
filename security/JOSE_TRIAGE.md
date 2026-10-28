# CVE-2026-116587 — Caddy, web e edge

Revisão: 28/10/2026. Responsável: maintainer. Próxima decisão obrigatória: **11/11/2026**.

## Achado e correção disponível

O [advisory GHSA-mgcc-cww5-fp2q](https://github.com/advisories/GHSA-mgcc-cww5-fp2q) descreve consumo excessivo de CPU ao interpretar uma chave privada RSA/JWK maliciosa. A validação de parâmetros grandes chega ao `crypto/rsa.PrivateKey.Validate` sem os limites necessários.

- `github.com/go-jose/go-jose/v4`: afetada até 4.1.5; corrigida em **4.1.6**. O lock foi atualizado, com checksum verificado pelo Go. Web e edge usam o mesmo lock `infra/caddy/go.mod`/`go.sum`.
- `github.com/go-jose/go-jose/v3`: afetada até 3.0.5; **sem versão corrigida informada pelo upstream**. Não substituir o import v3 por v4 via `replace`: são APIs/identidades de tipos diferentes.

## Por que v3 ainda está presente

O grafo do Caddy 2.11.7 inclui Smallstep e `go.step.sm/crypto`, que ainda dependem da linha v3. A implementação de PKI/ACME servidor do Caddy importa Smallstep; o emissor interno também usa seus provisioners. Referências versionadas:

- [Caddy: handler de servidor ACME](https://github.com/caddyserver/caddy/blob/v2.11.7/modules/caddypki/acmeserver/acmeserver.go).
- [Caddy: emissor interno](https://github.com/caddyserver/caddy/blob/v2.11.7/modules/caddytls/internalissuer.go).
- Grafo resolvido: `go mod graph`; o wrapper JOSE de `go.step.sm/crypto` v0.91.0 importa `go-jose/v3`.

Não identificamos entrada JWK controlada por visitante nesses caminhos com os Caddyfiles entregues pelo projeto. Web serve arquivos/proxy. Edge usa ACME como **cliente de uma CA pública**, incluindo DNS-01; não publica uma CA/servidor ACME. A API administrativa está desativada. Os JWTs de admissão são verificados pelo backend Java, não por autenticador JOSE no Caddy.

Isso é triagem de aplicabilidade à configuração atual, **não remoção da CVE do binário**, garantia universal ou autorização para usar v3 em outros serviços.

## Escopo e controles da exceção

`vulnerability-exceptions.json` aceita somente esta CVE, pacote v3, versão v3.0.5, tipo `gobinary` e target normalizado `usr/bin/caddy`. A regra vence em 11/11/2026. Outro target, tipo, pacote, versão, ID ou prazo vencido continua bloqueado. Não há exceção para a v4: o binário precisa conter a versão corrigida.

`scripts/tests/caddy-security.py` adapta os três Caddyfiles reais usando nomes/token fictícios e sem rede. A política exige:

1. Admin explicitamente desativado.
2. Somente apps HTTP/TLS, sem app PKI explícito.
3. Handlers conhecidos de arquivos/proxy/cabeçalhos/limites, sem servidor ACME ou autenticação adicional.
4. Emissores explicitamente configurados somente ACME; sem emissor interno ou TLS on-demand.

Os testes negativos de `security-policy-test.py` demonstram que introduzir esses recursos ou trocar o escopo do achado faz a verificação falhar. A checagem roda no CI antes dos demais testes da stack. Configurações personalizadas fora desses arquivos exigem nova revisão; a exceção não comprova sua segurança.

## Plano de saída e operação

Monitorar patch da linha v3 ou migração das dependências Smallstep/Caddy para uma linha corrigida. Atualizar o lock, construir web e edge, repetir testes Go/Caddy/HTTPS/navegador e scans, e remover a exceção assim que o pacote afetado sair dos binários ou houver correção reconhecida.

Antes de ativar PKI interna, ACME servidor, autenticação JWK/OIDC, provisioners ou handlers adicionais, interromper o uso desta triagem e revisar a exposição. Não ampliar o prazo automaticamente para obter pipeline verde. Se não houver solução/evidência suficiente até o vencimento, manter o bloqueio e decidir uma substituição/migração da dependência.

Para aplicar as imagens corrigidas em uma instalação existente, usar a janela e o backup do [procedimento de atualização](../docs/SECURITY_UPGRADE.md). Alterar o lock ou fazer merge não atualiza um contêiner já em execução. Nenhuma mudança de roteador ou de infraestrutura paga é necessária para este patch.
