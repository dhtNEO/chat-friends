# Custos e alternativas — 25/10/2026

**Sem contratação, faturamento, créditos promocionais ou apply.** As páginas comerciais oficiais retornaram HTTP 403 pela política de rede deste runner; não foi possível revalidar cota/tarifa corrente. Valores de cotas abaixo são referências fornecidas na especificação, não ofertas confirmadas. Não há preço de VM inventado.

## Banda mensurável e estimativa reproduzível

Tela em GB decimais = Mbps × espectadores remotos × horas × 0,45. Com 4 Mbps e 15 espectadores: **27 GB/h**, **540 GB em 20 h**, **1.620 GB em 60 h**, antes de áudio/overhead. São respectivamente cerca de 502,9 GiB e 1.508,7 GiB. Uma SFU recebe uma cópia do transmissor e entrega aos espectadores; upload doméstico precisa suportar esse fan-out, não apenas 4 Mbps. Áudio/overhead aumentam o total. Conteúdo parado e controle adaptativo podem reduzir bitrate real: medir.

```bash
docker run --rm -v "$PWD:/work" -w /work node:24.14.0-alpine node scripts/costs.mjs hours=20 viewers=15 mbps=4
```

Script aplica **hipótese explícita** de 15% de overhead, configurável; não substitui medição. Para custo USD/mês preencha as tarifas oficiais com `vmUSDHour=... diskUSDGiBMonth=... ipv4USDHour=... egressUSDGiB=... backupUSDGiBMonth=... logsUSDMonth=... domainUSDMonth=...`. Registre fonte, data, região e faixas de preço. Use tarifa média efetiva se houver tiers. Não arredondar GB para GiB como se fossem iguais.

| Item | 24/7 | Encontros de 20 h/mês | Fonte a revalidar |
|---|---|---|---|
| e2-medium | 730 × USD/h | horas ligada × USD/h (inclua preparação) | Compute Engine pricing/calculator |
| Disco boot 20 + dados 20 GiB | 40 × USD/GiB-mês | continua cobrado parada | Disk pricing |
| IPv4 estático | 730 × tarifa IPv4 | pode mudar tarifa e continuar cobrado parada | VPC network pricing |
| Saída tela+áudio | consumo real em GiB × tarifa/tier | consumo real | Network pricing, destino Brasil |
| Backup | GiB armazenados + operações/egress | idem | local alternativo ou storage escolhido |
| Logs | limite local no disco; exportação opcional paga | idem | Cloud Logging se habilitado |
| Domínio | preço anual / 12 | idem | registrador do proprietário |

Compare southamerica-east1 (São Paulo, provável menor latência para brasileiros) com us-central1/us-east1 (podem ter VM mais barata, mas rotas/egress/latência diferentes). Disponibilidade e tarifa regional precisam de cotação no dia. E2-medium: 4 GiB, CPU compartilhada; duas vCPUs visíveis não são dois núcleos dedicados. E2-small somente após medir margem; e2-micro não é stack completa comprovada. Sem Spot por padrão, balanceador, NAT Gateway, Cloud SQL ou Secret Manager obrigatório.

Alertas de orçamento avisam, **não são teto de gasto**. Defina alertas, revise uso e desligue VM após encontros se apropriado. Discos, snapshots, IPs reservados e storage podem continuar após parar/excluir VM. Para encerrar: backup externo validado, remover proteção de exclusão de forma deliberada, destruir recursos revisando plano e conferir discos/IPs/snapshots remanescentes na conta. Terraform tem prevent_destroy do disco e deletion_protection da VM.

## Alternativas

| Opção | Vantagens | Limites |
|---|---|---|
| Mac em casa | sem nova mensalidade de computação | energia, domínio, eventual IP público, upload, suspensão, hardware |
| Oracle Always Free ARM | mesma stack ARM64 | cotas por tenancy, indisponibilidade de capacidade, retomada de ociosas |
| LiveKit Cloud Build | substitui mídia, bom para prova | backend/DB continuam hospedados separadamente; quota de tráfego/minutos |
| GCP | VM controlada e migração prevista | custo de saída pode dominar; não contar com créditos |

Referências **não revalidadas** da especificação: Oracle 1.500 OCPU-h e 9.000 GB-h/mês, equivalente a 2 OCPUs/12 GB 24/7 em tenancy elegível; 10 TB/mês de saída. Não usar 4 OCPUs/24 GB como promessa universal. LiveKit Build 5.000 participante-minutos e 50 GB: 16 conectados consomem minutos em ~5 h 12 min; 50 GB de tela a 27 GB/h duram ~1 h 51 min, antes de áudio/overhead. Confirmar concorrência e quotas atuais. GCP Free Tier e2-micro/regiões/disco/egress são itens separados e não cobrem automaticamente este uso.

Hospedagem estática e funções HTTP não hospedam SFU UDP. Frontend gratuito não elimina backend/mídia. Nenhuma conta foi criada.

Fontes oficiais para a cotação pelo proprietário:
- https://cloud.google.com/products/compute/pricing
- https://cloud.google.com/compute/disks-image-pricing
- https://cloud.google.com/vpc/network-pricing
- https://cloud.google.com/products/calculator
- https://docs.cloud.google.com/free/docs/free-cloud-features
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.livekit.io/deploy/admin/quotas-and-limits/
