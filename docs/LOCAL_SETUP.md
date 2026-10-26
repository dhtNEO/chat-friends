# Desenvolvimento no Mac / OrbStack

Instale OrbStack e Git. Execute Docker/Compose pelo terminal; ferramentas Java/Node estão nas imagens. Stack base usa containers Linux e portas de loopback publicadas. Não pressupomos acesso do Codex ao Mac.

```bash
./scripts/up.sh
./scripts/admin.sh admin
./scripts/diagnose.sh
```

No próprio Mac, abra localhost:8080. Microfone/tela podem usar a exceção de contexto seguro para localhost. `.env`: APP_ORIGIN=http://localhost:8080, LIVEKIT_PUBLIC_URL=ws://localhost:8080, LIVEKIT_NODE_IP=127.0.0.1, COOKIE_SECURE=false. Todos os amigos não podem usar esse “localhost” remotamente.

Builds podem ocupar CPU/memória além dos limites de runtime. Em VM pequena, prefira construir imagens em CI/Mac e transferir com `docker save`/`docker load`, mantendo arquiteturas corretas. Não há registro público obrigatório. No M4 Pro, a seleção ARM64 é feita pelas imagens multiarch; build ARM64 não foi executado neste runner AMD64.

Configurar nome/qualidade: edite SPACE_NAME, SCREEN_HEIGHT (360–720), SCREEN_FPS (5–30), SCREEN_BITRATE (100.000–4.000.000) no `.env`; execute up.sh. UI oferece também 480p/15 fps/1 Mbps. São tetos solicitados ao encoder; qualidade real depende de conteúdo, codec, cliente e congestionamento.

Os dados ficam em volume nomeado `chat-friends_database`. Shutdown: `./scripts/compose.sh down` preserva volume. Não suspenda o Mac durante encontros; suspensão quebra chamadas e conexões. Após reinício, serviços têm restart policy, mas confirme portas/DNS/IP e healthchecks. Se o daemon não iniciou, inicie OrbStack e rode up.sh novamente. Recomenda-se cabo de rede.

Ambiente cloud Codex com proxy: pode exigir CA corporativa e proxy para builds, além de NO_PROXY para tráfego entre containers. Os Dockerfiles aceitam segredos de build opcionais `maven_settings`, `build_truststore`, `build_ca`; não desligue TLS/checksums. Não copie esses arquivos para o projeto. Configuração específica do runner não é necessária no Mac doméstico usual.
