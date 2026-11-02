# Virtual Gaming House (VGH)

Aplicação web colaborativa para amigos e grupos jogarem, conversarem e compartilharem tela ao vivo em um espaço virtual próprio.

## Recursos Principais

- **Voz e Áudio em Tempo Real:** Conexão com cancelamento de ruído, ganho de microfone, controle de volume individual e indicadores visuais de quem está falando.
- **Transmissões ao Vivo e Compartilhamento de Tela:** Suporte a até 3 transmissões simultâneas com layout flexível (grid, destaque e popout).
- **Chat Integrado:** Mensagens em tempo real, presença de membros e histórico de conversa.
- **Games Club (Cassino & Mini-jogos):** Roleta, Blackjack, Slot Machine e Jogo de Ritmo com sistema de moedas e histórico de rodadas.
- **Party Club:** Jogos interativos para grupos com palco 3D, quiz/trivia e tela de desenho compartilhado.
- **Bot de Música:** Fila de reprodução, busca de faixas e controles de reprodução (tocar, pausar, pular, parar).
- **Outlook / Calendário de Jogos:** Agendamento de partidas e sessões com os amigos.
- **Espaço de Trabalho Modular (Dockview):** Janelas redimensionáveis, painéis desacopláveis, abas e personalização de tema e atalhos de teclado.
- **Segurança e Perfis:** Gerenciamento de conta, fotos de perfil, cores personalizadas e controle de sessões.

## Tecnologias

- **React 19** com TypeScript
- **Vite** para empacotamento rápido e servidor de desenvolvimento
- **Dockview** para gerenciamento de janelas e layout do espaço de trabalho
- **Three.js** para o palco e animações 3D
- **Web Audio API** e supressor de ruído SapphiRed

## Execução

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# Compilar para produção
npm run build
```
