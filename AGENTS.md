# Working in chat-friends

- Use the existing checkout. Cloud tasks are already isolated; do not create a worktree unless requested.
- App/UI and documentation are in Portuguese. Keep source, API docs and operational instructions consistent.
- Stack: Java 25 / Spring Boot 3.5.16 / Maven Wrapper 3.9.11; PostgreSQL/Flyway; React/TypeScript/Vite; LiveKit/Caddy/Compose. No Redis, Kubernetes, webcam, recording or AI features in the MVP.
- Modes: only CHAT_MODE=dev (default, loopback) and CHAT_MODE=prd (internet). Persisted legacy markers migrate internally; old mode inputs are rejected. Prefix production admin/compose/backup/restore/diagnose commands with CHAT_MODE=prd.
- Standard dev workflow: `./scripts/up.sh`, `./scripts/admin.sh admin`, `./scripts/diagnose.sh`. Host needs Docker Compose >=2.24.4 and Bash; runtimes run in containers.
- `./scripts/check.sh` creates a separate friends_test database and runs backend tests plus frontend lint/build. Never point the integration suite at the friends application database; its fixtures truncate tables.
- Backend tests: from backend, `./mvnw -B -ntp verify` with DATABASE_URL, POSTGRES_USER, POSTGRES_PASSWORD, LIVEKIT_API_KEY and LIVEKIT_API_SECRET set for tests. The security/integration tests use real PostgreSQL and a mocked administrative media gateway for deterministic failure/race cases.
- Frontend: from frontend, `npm ci`, `npm run lint`, `npm run build`, `npm test`. Browser tests need a disposable running stack and TEST_ADMIN_PASSWORD; signaling test also needs TEST_LIVEKIT_SECRET. CHROMIUM_PATH is optional. Do not print these values. The complete media suite requires working WebRTC and screen capture, not just HTTP.
- Terraform: `terraform -chdir=infra/gcp init -backend=false`, `fmt -check`, `validate`. Never apply or activate billing without explicit authorization. No image publication by default.
- Keep secrets in ignored .env/generated files; do not commit reports containing passwords or tokens. Do not dump process environments, cookie jars, expanded Compose config or private messages. Use `compose config -q`.
- Do not bypass TLS, checksums or managed browser policies. Cloud Chromium restricts non-proxied UDP; browser media tests passed over TCP without changing policy. Native ICE probes separately validate both Docker media ports. Keep container loopback candidates disabled: Docker forwards to the container network interface.
- Database locks serialize chat commits and screen leases. Preserve idempotency and revoke-before-grant ordering. All public self-hosted signaling must pass MediaAdmission; never publish LiveKit 7880 or forward incoming elevated tokens unchanged.
- See docs/SECURITY.md for the residual multi-track publication limitation and docs/STATUS.md for evidence/external checks. Fixes to these areas need meaningful race/auth tests.
- Append new Flyway migrations; do not rewrite applied ones. Preserve existing user changes and LICENSE. The owner still needs to confirm licensing intent before distribution.

- DuckDNS: docs/DUCKDNS_SETUP.md. Token privado em generated/duckdns/token, nunca em argv/logs. Preservar lock Docker e pending/applied; diagnóstico não confirma aplicação. CI testa mocks e lock real sem conta; nunca alegar validação WAN/ACME sem executá-la.

- DuckDNS DNS-01: edge customizado infra/caddy, provider duckdns_private filtra erros com token. Nunca usar upstream diretamente nem exportar segredo no Compose. Porta pública 18443, host/container 443; mudanças de origem exigem startup completo.

- Hardening: docs/SECURITY_UPGRADE.md. Backend runtime uses APP_DB_* only; do not restore DBA credentials or enable Flyway in runtime. Run migrations through the maintenance service. Preserve generated/runtime.env (MFA key) and generated/network overrides; helper mounts must not expose database/MFA keys or writable code.
- Web build now uses repository context: docker build -f frontend/Dockerfile . . Custom Caddy/SFU/gosu use patched Go with verified sources/locks. Keep vulnerability exceptions package/version-specific and expiring; never suppress all HIGH/CRITICAL findings.
- Administrator bootstrap reads the 0600 file as the host UID/GID, not root with capabilities disabled. Production administrators must complete TOTP enrollment. Do not weaken MFA/CSRF or browser media assertions to make tests pass.
