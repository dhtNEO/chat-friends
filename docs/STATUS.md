# Estado da implementação — 26/10/2026 (America/Sao_Paulo)

O projeto possui somente **dev** (local, padrão) e **prd** (internet). A integração de rede privada anterior foi removida do código, scripts, Compose e documentação. A produção usa DuckDNS, HTTPS/WSS :18443 e DNS-01; o proprietário confirmou seu funcionamento no Mac. Isso não equivale a benchmark de 16 participantes.

## Evidências

| Verificação | Evidência |
|---|---|
| Backend Java 25/Spring Boot 3.5.16, PostgreSQL separado | 17 testes de integração passaram, incluindo preferências de recepção por sessão, migração V2 e tetos Full HD |
| Modos dev/prd | 22 testes Node, inspeção de portas Compose e migração de marcadores sem alterar `.env`; modos antigos recusados como entrada |
| Frontend React/TypeScript/Vite | lint/build e 11 testes Playwright executados no runner Linux |
| Mídia sintética | medidores na saída real Web Audio verificam ganho/mudo/volumes por cliente e da transmissão; canvas recebido em 1920×1080, controles em tela cheia e layouts desktop/móvel testados |
| ICE | STUN autenticado em UDP/TCP; problema de loopback do container corrigido sem alterar política gerenciada do Chromium |
| Admissão de mídia | JWT elevado é reduzido a microfone na conexão; sessão expirada recusada |
| Edge DNS-01 | Caddy 2.11.4, módulo local filtra erros com token; testes Go e HTTPS :18443 com CA de laboratório explícita |
| CSP prd | Chromium recebe a política do Caddy real: consulta HTTPS ao domínio de mídia permitida e outro destino bloqueado; resposta remota simulada |
| Prd no Mac | logs do proprietário confirmaram DNS-01 válido para os dois nomes em staging; depois o proprietário confirmou funcionamento em produção |
| Atualizador DuckDNS | API/DNS simulados, retry, lock Docker e recuperação de órfãos; confirmação de saúde administrativa na SFU real |
| Backup/restore | restauração isolada e completa exercitadas na implementação; dados/sessões tratados conforme BACKUP_RESTORE |
| Infraestrutura | Terraform fmt/init/validate passaram na implementação; nenhum apply ou contratação |

A validação local usa mídia artificial e o browser pode escolher TCP sob a política gerenciada do runner. Não alteramos TLS/checksums/políticas para obter passe. Trivy com a base disponível não reportou HIGH/CRITICAL no módulo Go atualizado; isso não é auditoria exaustiva de imagens/transitivas nem garantia sobre advisories futuros. Downloads de dependências bloqueados no runner foram obtidos das fontes oficiais com hash idêntico ao lock e verificação completa dos módulos.

## Limites ainda abertos

- Exclusividade adversarial estrita de múltiplas tracks: lease/revogação/replay são protegidos, mas um publicador autorizado pode tentar múltiplas tracks da mesma fonte. Reconciliação não é proibição atômica na SFU; ver SECURITY.
- Carga progressiva de 2/4/8/16 participantes, upload/CPU/RAM/RTT/perda e qualidade humana precisam de medição. Nenhuma capacidade de 16 pessoas ou e2-medium foi comprovada.
- Qualidade da supressão de ruído nativa e captura de áudio do sistema/jogo variam por navegador/SO. Teste sintético Linux não prova suporte completo no macOS/Windows.
- Renewals reais em operação prolongada, testes de falha/reinício no Mac, TURN, build multiarch e migração completa entre hosts não são automaticamente cobertos pelo relato de funcionamento.
- Tarifas/cotas cloud e licença pretendida para o código novo precisam de revisão pelo proprietário. GPL-3.0 preexistente foi preservada; nenhuma conta paga, apply ou publicação de imagem foi feita pelo agente.

## Manutenção

[TESTING](TESTING.md) contém os comandos atuais de validação. [DUCKDNS_SETUP](DUCKDNS_SETUP.md) cobre produção e agendamento; [MIGRATION](MIGRATION.md) explica migração dos marcadores de modo e troca real de ambiente. O checkout preserva credenciais, token, banco e certificados existentes; não usar `down -v`.
