# Chat Friends (v2.0)

Aplicação enxuta e de alta performance para chamadas de voz, chat em tempo real e compartilhamento de tela opt-in com visual minimalista estilo Discord.

Projetada para operar de forma extremamente econômica em uma máquina virtual `e2-small` (1 vCPU, 2 GB RAM) no Google Cloud Platform (~120 MB de RAM total).

---

## 🚀 Arquitetura v2.0

- **Backend Rust (`Axum` + `Tokio` + `SQLx` + `SQLite WAL`):**
  - Autenticação com Argon2id e código de convite do servidor (`SERVER_INVITE_CODE`).
  - Sem MFA ou limites artificiais de compartilhamento de tela.
  - Chat persistente com histórico e canal `broadcast` para eventos via WebSocket (`/ws`).
  - Geração de tokens JWT LiveKit (HS256) com 12 horas de validade.
  - Task em background que atualiza o IP no DuckDNS a cada 5 minutos.
  - Purga automática horária de sessões expiradas.

- **Frontend SolidJS (`SolidJS` + `LiveKit Client` + `Web Audio API`):**
  - Zero Virtual DOM para máxima economia de CPU e renderização instantânea.
  - **Compartilhamento de Tela Opt-In:** Transmissões de vídeo de tela nunca são inscritas automaticamente, poupando banda e bateria.
  - **Presets de Transmissão:** 720p @ 30 FPS (Econômico) ou 1080p @ 60 FPS (Fluido).
  - **Áudio Avançado:** Curva perceptual quadrática para volumes independentes de voz (0-200%) e live (0-100%).
  - **Calibração de Microfone:** Brickwall Limiter suave (-3 dB) e VU Meter em tempo real a 60 FPS.
  - **Efeitos Sonoros:** Sons suaves estilo Discord via Web Audio API e arquivos de entrada/saída.

- **Infraestrutura e DevOps:**
  - Apenas 3 contêineres: `caddy` (TLS DNS-01 DuckDNS), `app` (Rust + SolidJS) e `livekit` (SFU WebRTC).
  - Gerenciamento de segredos com **Google Cloud Secret Manager**.
  - Imagens de contêiner armazenadas no **Google Artifact Registry**.
  - Provisionamento automatizado com **Terraform** e **GitHub Actions**.

---

## 🛠️ Desenvolvimento Local

```bash
# Frontend (SolidJS + Vite)
npm --prefix frontend install
npm --prefix frontend run dev

# Compilação para produção
npm --prefix frontend run build
```

Consulte `docs/REFACTOR_PLAN.md` para detalhes aprofundados sobre a arquitetura e diretrizes de governança.
