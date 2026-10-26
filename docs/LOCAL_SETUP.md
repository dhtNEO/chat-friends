# Desenvolvimento no Mac / OrbStack

Instale OrbStack e Git. Execute Docker/Compose pelo terminal; ferramentas Java/Node estão nas imagens. Stack base usa containers Linux e portas de loopback publicadas. Não pressupomos acesso do Codex ao Mac.

```bash
./scripts/up.sh
./scripts/admin.sh admin
./scripts/diagnose.sh
```

No próprio Mac, abra localhost:8080. Microfone/tela podem usar a exceção de contexto seguro para localhost. `.env`: APP_ORIGIN=http://localhost:8080, LIVEKIT_PUBLIC_URL=ws://localhost:8080, LIVEKIT_NODE_IP=127.0.0.1, COOKIE_SECURE=false. Todos os amigos não podem usar esse “localhost” remotamente.

Builds podem ocupar CPU/memória além dos limites de runtime. Em VM pequena, prefira construir imagens em CI/Mac e transferir com `docker save`/`docker load`, mantendo arquiteturas corretas. Não há registro público obrigatório. No M4 Pro, a seleção ARM64 é feita pelas imagens multiarch; build ARM64 não foi executado neste runner AMD64.

Configurar nome/qualidade: edite SPACE_NAME, SCREEN_HEIGHT (360–1080), SCREEN_FPS (5–30), SCREEN_BITRATE (100.000–8.000.000) no `.env`; execute up.sh. UI oferece 1080p/30 fps/8 Mbps, 720p/30 fps/4 Mbps e 480p/15 fps/1 Mbps, sempre respeitando os tetos do servidor. São tetos solicitados ao encoder; qualidade real depende de conteúdo, codec, cliente e congestionamento.

Os dados ficam em volume nomeado `chat-friends_database`. Shutdown: `./scripts/compose.sh down` preserva volume. Não suspenda o Mac durante encontros; suspensão quebra chamadas e conexões. Após reinício, serviços têm restart policy, mas confirme portas/DNS/IP e healthchecks. Se o daemon não iniciou, inicie OrbStack e rode up.sh novamente. Recomenda-se cabo de rede.

Ambiente cloud Codex com proxy: pode exigir CA corporativa e proxy para builds, além de NO_PROXY para tráfego entre containers. Os Dockerfiles aceitam segredos de build opcionais `maven_settings`, `build_truststore`, `build_ca`; não desligue TLS/checksums. Não copie esses arquivos para o projeto. Configuração específica do runner não é necessária no Mac doméstico usual.

Modo de desenvolvimento: `CHAT_MODE=dev` (padrão). Para produção no mesmo Mac, usar `CHAT_MODE=prd` e seguir [DuckDNS](DUCKDNS_SETUP.md). Não trocar de modo mantendo origens/cookie/IP do outro ambiente; veja [migração](MIGRATION.md).

Instalações existentes mantêm o `.env`. Para habilitar Full HD, definir `SCREEN_HEIGHT=1080` e `SCREEN_BITRATE=8000000` (com `SCREEN_FPS=30`) antes de iniciar novamente com o modo correto. Não substituir o `.env` inteiro: ele contém os segredos atuais.

Para atualizar a instalação com privilégios separados, MFA e recuperação, siga [o procedimento de segurança](SECURITY_UPGRADE.md) antes do próximo deploy. Preserve `generated/runtime.env` e a chave MFA junto ao backup criptografado.

Os testes de rede foram validados com Docker Engine 28 e Compose >= 2.24.4; mantenha o OrbStack atualizado. Java/Node não são necessários no host.
