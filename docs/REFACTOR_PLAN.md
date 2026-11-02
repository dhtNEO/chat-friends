# Plano de Refatoração v2.0 (Rust + SQLite + SolidJS + GCP Secret Manager)

## Objetivo
Reduzir drasticamente o uso de RAM e CPU na VM `e2-small` (1 vCPU, 2 GB RAM) no Google Cloud (~1.6 GB -> ~120 MB), mantendo apenas Chat de Texto, Voz e Compartilhamento de Tela de alta performance.

## Pilares da Nova Arquitetura
1. **3 Contêineres Apenas:** `caddy` (TLS DNS-01 DuckDNS), `app` (Binário Rust servindo API, WebSockets, SQLite WAL e arquivos estáticos do frontend) e `livekit` (WebRTC SFU).
2. **Backend Rust (`Axum` + `SQLx` + `SQLite`):** Autenticação Argon2id com código de convite (`SERVER_INVITE_CODE`), sem MFA, sem limite artificial de telas compartilhadas, e task em background que atualiza o IP no DuckDNS a cada 5 minutos.
3. **Frontend SolidJS (Estilo Discord):** Zero Virtual DOM. Transmissão de tela Opt-in (`autoSubscribe: false` para vídeo, presets `720p@30fps` e `1080p@60fps`), volumes isolados com curva perceptual quadrática (Voz 0-200%, Live 0-100%), ganho de microfone com Limiter suave em -3dB + VU Meter em tempo real, e sons sintetizados via Web Audio API.
4. **CI/CD & GCP Secret Manager:** Build no GitHub Actions -> Google Artifact Registry. Segredos injetados via GCP Secret Manager no boot da VM.
