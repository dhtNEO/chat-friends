# GCP — preparação, sem aplicar

Terraform 1.13.5 e provider Google 7.11.0 fixados. Configuração cria VPC/sub-rede, regras mínimas, IPv4 estático, service account sem papéis IAM, VM e2-medium e disco de dados persistente. API admin LiveKit/DB não expostos. Boot Ubuntu 24.04 AMD64; startup instala Docker/Compose e monta disco de dados, sem segredos e sem clonar repo privado. OS Login, IAP SSH, Secure Boot e sem chaves em metadata.

```bash
cd infra/gcp
terraform init -backend=false
terraform fmt -check
terraform validate
```

Esses checks não provam capacidade, permissões reais ou disponibilidade regional. Não houve plan autenticado nem apply. Para futura implantação, o proprietário deve autorizar custos, criar/selecionar projeto e faturamento, habilitar Compute/IAM/IAP conforme necessário e conceder ao operador permissões de provisionamento e OS Login/IAP. Não conceder Owner à identidade da VM. Scope cloud-platform sem IAM não concede recursos por si só. Estado Terraform contém metadados de infraestrutura e deve ser protegido; nenhuma senha de app nele.

Depois de revisar custos, preencher terraform.tfvars e revisar um plano, aplicar é uma ação futura do proprietário. Entregar código/imagens por canal privado, sem publicar imagens por engano. Conectar com `gcloud compute ssh NOME --zone ZONA --tunnel-through-iap`; OS Login/IAP exige IAM do operador. Preparar `/srv/chat-friends` para o usuário de manutenção com permissões restritas. Acesso ao grupo docker equivale a root.

Crie `.env` diretamente na VM por SSH seguro/editor (0600), ou transfira por canal privado, nunca user-data/Terraform. Secret Manager é opcional e tem custos/roles próprios; não incluído. Preencha DNS/APP_ORIGIN/WSS/IP anunciado e execute `CHAT_MODE=internet ./scripts/up.sh`, administrador ou restauração conforme MIGRATION. Builds podem exceder e2-medium: preferir imagens já compiladas na arquitetura certa e carregadas com docker load; então configure e `compose up --no-build`.

Disco de dados tem prevent_destroy; VM tem deletion_protection. Startup só formata o dispositivo dedicado se não houver filesystem detectado. Não reaproveite esse script em máquina com dados desconhecidos. Discos Docker ficam sob /srv/chat-friends-data/docker; backup da aplicação continua obrigatório e externo. A VM não recebe um job de backup remoto por padrão porque o destino/credenciais não foram escolhidos.

## Oracle ARM manual

Verificar cota e disponibilidade da conta (HOSTING_COSTS). Criar VM Ubuntu ARM64 e disco, acesso SSH do proprietário, firewall/NSG com mesmas portas mínimas. Instalar Docker Engine e Compose da documentação oficial e verificar suporte ARM64 das tags fixadas. Transferir checkout privado e segredos 0600, configurar domínios/IP, executar mesma stack. Sem Terraform Oracle nesta versão. Não usar Docker AMD64 em emulação como evidência de desempenho ARM. Keep-alive artificial para contornar retomada por ociosidade não é recomendado; manter backup fora da VM. Testar restauração e medir 2→4→8→16 participantes.

LiveKit Cloud: configure LIVEKIT_INTERNAL_URL (HTTPS da API), LIVEKIT_PUBLIC_URL (WSS do projeto), chave/segredo e webhook do projeto apontando à URL HTTPS `/api/livekit/webhook`. Compose aceita LIVEKIT_INTERNAL_URL por variável; o serviço local pode ser desligado com override revisado das dependências. Sinalização direta Cloud não herda a admissão/downscoping self-hosted: valide políticas de revogação e revise SECURITY antes de usá-la com usuários não confiáveis. Não coloque segredo no frontend. Revalidar quotas e fonte de publicação no serviço escolhido.
