# Working in chat-friends

- Use the existing checkout. Cloud tasks are already isolated; do not create a worktree unless requested.
- App/UI and documentation are in Portuguese. Keep source, API docs and operational instructions consistent.
- Stack: Java 25 / Spring Boot 3.5.16 / Maven Wrapper 3.9.11; PostgreSQL/Flyway; React/TypeScript/Vite; LiveKit/Caddy/Compose. No Redis, Kubernetes, webcam, recording or AI features in the MVP.
- Standard local workflow: `./scripts/up.sh`, `./scripts/admin.sh admin`, `./scripts/diagnose.sh`. Host needs Docker Compose >=2.24.4 and Bash; runtimes run in containers.
- `./scripts/check.sh` creates a separate friends_test database and runs backend tests plus frontend lint/build. Never point the integration suite at the friends application database; its fixtures truncate tables.
- Backend tests: from backend, `./mvnw -B -ntp verify` with DATABASE_URL, POSTGRES_USER, POSTGRES_PASSWORD, LIVEKIT_API_KEY and LIVEKIT_API_SECRET set for tests. The 15 integration tests use real PostgreSQL and a mocked administrative media gateway for deterministic failure/race cases.
- Frontend: from frontend, `npm ci`, `npm run lint`, `npm run build`, `npm test`. Browser tests need a disposable running stack and TEST_ADMIN_PASSWORD; signaling test also needs TEST_LIVEKIT_SECRET. CHROMIUM_PATH is optional. Do not print these values. The complete media suite requires working WebRTC and screen capture, not just HTTP.
- Terraform: `terraform -chdir=infra/gcp init -backend=false`, `fmt -check`, `validate`. Never apply or activate billing without explicit authorization. No image publication by default.
- Keep secrets in ignored .env/generated files; do not commit reports containing passwords or tokens. Do not dump process environments, cookie jars, expanded Compose config or private messages. Use `compose config -q`.
- Do not bypass TLS, checksums or managed browser policies. Cloud Chromium's WebRtcIPHandling policy prevented media validation here; record this limitation rather than claiming voice/screen passed.
- Database locks serialize chat commits and screen leases. Preserve idempotency and revoke-before-grant ordering. All public self-hosted signaling must pass MediaAdmission; never publish LiveKit 7880 or forward incoming elevated tokens unchanged.
- See docs/SECURITY.md for the residual multi-track publication limitation and docs/STATUS.md for evidence/external checks. Fixes to these areas need meaningful race/auth tests.
- Append new Flyway migrations; do not rewrite applied ones. Preserve existing user changes and LICENSE. The owner still needs to confirm licensing intent before distribution.
