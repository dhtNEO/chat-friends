# Plano — atalhos pessoais de teclado

Status: planejamento, sem funcionalidade implementada. Requisito: cada usuário configura seus próprios atalhos. Executar antes do plano de [música compartilhada](MUSIC_PLAYER_PLAN.md), aproveitando a mesma base de ações e preferências.

## Comportamento e limite do navegador

Adicionar **Minha conta → Atalhos**, com gravar combinação, remover, ativar/desativar e restaurar configurações. Exibir os atalhos nos botões correspondentes. Não ativar combinações automaticamente: cada pessoa escolhe as suas e o aplicativo verifica conflitos.

No site, atalhos funcionam quando a página tem foco, inclusive no player em tela cheia se o evento chegar ao documento. **Não funcionam como atalhos globais enquanto outro aplicativo ou jogo está em foco.** Instalar como PWA não remove esse limite. Keyboard Lock não é um registro de atalhos globais. Caso o objetivo inclua mutar sem sair do jogo, abrir uma etapa separada para aplicativo desktop com integração ao sistema; não prometer isso na implementação web.

| Ação inicial | Efeito |
|---|---|
| Alternar microfone | Mesma ação do botão; exige conexão de voz, sem entrar na chamada automaticamente |
| Alternar recepção | Silencia/restaura a saída deste cliente, preservando os volumes escolhidos |
| Aumentar/reduzir saída | Passos de 5 pontos percentuais, entre 0 e 100 |
| Silenciar/restaurar transmissão | Somente o som da tela neste cliente |
| Parar minha transmissão | Libera captura e lease pelo fluxo já existente |
| Expandir/compactar player | Mesma ação do player; não precisa de tela cheia do navegador |

Entrar na voz, iniciar captura de tela e música compartilhada ficam fora da primeira entrega de atalhos. Exigem gestos/permissões ou ações coletivas e serão incorporados somente depois da base validada. Continuar permitindo os botões existentes.

## Preferências e interpretação das teclas

- Persistir os atalhos no PostgreSQL **por conta**, com perfis macOS e Windows/Linux. Volume continua sendo preferência local de cada navegador. Login de outra pessoa nunca herda os atalhos da conta anterior.
- Guardar versão do formato, ação permitida, `KeyboardEvent.code` e modificadores explícitos (`ctrl`, `alt`, `shift`, `meta`). Mostrar nomes adequados ao sistema, como ⌘ no Mac. Não converter silenciosamente Ctrl em ⌘ ao trocar de perfil.
- Recusar combinações duplicadas no mesmo perfil, modificadores isolados e atalhos conhecidos do navegador/sistema. A lista de reservas não consegue detectar tudo; incluir uma área para testar a combinação no dispositivo real.
- Exigir Ctrl, Alt ou Meta para ações do MVP. Não capturar letras isoladas, Enter, Tab, Escape ou teclas de navegação. Não substituir a navegação acessível normal.
- Ignorar IME/composição, `event.repeat`, eventos já consumidos e ações indisponíveis. Evitar dois listeners ativos após reload, reconexão ou reabertura das configurações.
- Por padrão, não executar atalhos em campos editáveis. Oferecer opção pessoal **Usar combinações ao digitar**, limitada a combinações com modificadores. O modo de gravação sempre suspende as ações da sala.
- `preventDefault` apenas para uma combinação reconhecida que o aplicativo pode tratar. Um atalho indisponível não deve ligar microfone, entrar na voz ou alterar o estado da sala.

## Implementação proposta

1. **Extrair ações existentes.** Criar um controlador de voz/áudio reutilizável. Botões e atalhos chamam as mesmas funções de `Voice.tsx` e `MediaPlayback.tsx`; preservar busy locks, tratamento de erro, volume via Web Audio e liberação da lease. Não duplicar a lógica de microfone nos listeners de teclado.
2. **Preferências próprias.** Criar migração Flyway com o próximo número disponível para `user_shortcuts(account_id, platform, revision, enabled, allow_while_typing, bindings_json, updated_at)`, chave única por conta/plataforma. Não alterar V1/V2 aplicadas.
3. **API autenticada.** `GET /api/me/shortcuts?platform=...` e `PUT /api/me/shortcuts` com `{platform, revision, bindings, enabled, allowWhileTyping}`. Derivar a conta da sessão, sem aceitar `accountId` do cliente. CSRF, enum de ações, tamanho limitado e conflito de revisão → 409. Versionar o formato do JSON e manter a sessão como única autoridade sobre a conta.
4. **Interface.** Acrescentar a seção a `Settings`/Minha conta, com estado de gravação, conflito, salvamento e erro. A última configuração válida continua ativa se salvar falhar. Limpar preferências carregadas ao sair ou trocar de conta.
5. **Listener único.** Criar `useKeyboardShortcuts` ligado ao controlador atual. Aplicar alterações sem reload e remover o listener no logout/unmount. Alterações vindas de outra sessão podem ser recarregadas ao voltar o foco; não precisam de um novo canal permanente.
6. **Documentação.** Atualizar API, USER_GUIDE, COMPATIBILITY e TESTING. Explicar o foco da página antes de o usuário configurar atalhos para jogar.

Ações de música entram depois que o player existir: volume/mudo **locais** e comandos compartilhados separados visualmente. Teclas multimídia pelo Media Session são uma melhoria posterior; não dão ao site atalhos globais para o microfone.

## Push-to-talk e atalhos globais — entregas separadas

Push-to-talk pode ser uma segunda entrega web, se desejado. Usar modo explícito e temporário: pressionar abre o microfone, soltar fecha, com fechamento também em `blur`, `visibilitychange`, desconexão e logout. Não restaurar um estado que deixe o microfone aberto após perder `keyup`. Testar troca de janela e diálogos de permissão. O foco da página continua obrigatório.

Atalhos globais exigem uma decisão de produto adicional: aplicativo desktop, sistemas suportados, instalação/atualização e permissões de acessibilidade/teclado. Essa decisão não deve bloquear os atalhos web pessoais.

## Aceite e testes

| Verificação | Resultado exigido |
|---|---|
| Duas contas, mesma combinação | Cada uma executa apenas sua configuração; uma não altera a outra |
| Reload e troca de conta | Perfil reaparece na conta correta; nenhum atalho anterior fica ativo |
| Mutar/desmutar e recepção | Estado real e indicadores mudam; ganho e volumes são preservados |
| Digitação, IME, repetição e gravação | Sem ações inesperadas, letras perdidas ou toggles repetidos |
| Falha de API, revisão antiga, ação desconhecida | Erro controlado; preferências válidas preservadas |
| Voz desconectada e captura de outra pessoa | Atalho não cria conexão, captura nem autorização indevida |
| Mac e Windows/Linux | Teste humano com os teclados reais e conflitos do navegador/SO |

Testes de integração para isolamento por sessão/conta, validação e concorrência; Playwright para capturar/gravar e executar ações, digitar com segurança e remover listeners. Reaproveitar os medidores de áudio para provar mudo/volume, sem depender apenas do texto do botão. Confirmar o job `stack` do CI da versão implementada. O planejamento por si só não comprova os novos comportamentos.

## Referências

- [MDN: keydown e elemento com foco](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event), [fonte consultada no GitHub](https://github.com/mdn/content/blob/main/files/en-us/web/api/element/keydown_event/index.md).
- [MDN: Media Session](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession), [fonte consultada no GitHub](https://github.com/mdn/content/blob/main/files/en-us/web/api/mediasession/index.md).
