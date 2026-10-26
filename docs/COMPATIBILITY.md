# Compatibilidade

Legenda: **testado** exige execução neste ambiente e evidência em STATUS; **documental** indica API/SDK suportado em princípio; **pendente** não foi executado. Não há garantia universal de captura de áudio de qualquer jogo.

| Ambiente | Chat/login | Voz/tela | Áudio da tela |
|---|---|---|---|
| Chromium Linux AMD64 no runner | testes Playwright, ver STATUS | mídia sintética, Full HD e ICE UDP/TCP testados; browser pode usar TCP | faixa sintética e volumes testados; não prova áudio real do sistema |
| macOS M4 Pro + OrbStack + Chrome/Edge | pendente | APIs documentadas; teste humano pendente | depende de versão/seleção de aba/janela e permissões macOS |
| macOS Safari | pendente | teste humano obrigatório; diferenças de seleção/codec | não prometer áudio do jogo |
| macOS Firefox | pendente | teste humano obrigatório | verificar no próprio sistema |
| Windows Chrome/Edge | pendente | APIs documentadas; teste humano pendente | seleção de tela/aba e checkbox de áudio podem variar |
| Windows Firefox | pendente | teste humano obrigatório | verificar suporte atual |
| Celular | layout adaptável; viewport testável | captura de tela pode não existir; fora do objetivo desktop | não garantido |

A tela não depende de áudio do sistema. UI solicita áudio quando disponível; sem track de áudio, o vídeo continua. Navegador pode omitir captura de som mesmo após solicitação. Microfone é independente. No macOS conferir permissões de Microfone e Gravação de Tela/Áudio do Sistema, fechar/reabrir navegador se o SO exigir.

Fontes técnicas: LiveKit screenshare docs e API getDisplayMedia/secure contexts dos navegadores. URLs oficiais fornecidas na especificação; páginas comerciais/LiveKit bloqueadas pelo runner em 25/10/2026, portanto não afirmamos revalidação das tabelas atuais. SDKs e fontes do servidor foram consultados via GitHub/Maven/npm.
