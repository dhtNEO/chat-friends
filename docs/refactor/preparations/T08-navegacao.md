# T08 — proposta técnica independente

Levantamento original na base babba756; proposta usada na implementação autorizada pela D008. Estado/owner somente no [backlog](../backlog.json). A dispensa específica está na D008; consultar a spec e a execução para o contrato final e evidências. Este documento preserva a proposta original. Não é resultado de teste com usuários.

## Destinos e URL

Os destinos solicitados são Conversa (`chat`), Sala (`voice`), Jogos (`games`) e Agenda (`outlook`). Preservar ids internos e API de agenda; rótulo visível não exige migração de dados nem novos canais. Música pertence à Sala com miniplayer persistente; Mais reúne configurações, membros e administração conforme autorização da sessão.

Propor hashes versionados `#/v1/conversa`, `#/v1/sala`, `#/v1/jogos`, `#/v1/agenda`, com parser fechado a esses destinos. URL seleciona apresentação, nunca entra na voz/publica mídia automaticamente. URL direta deve sobreviver à autenticação sem carregar dados antes da sessão. Transição explícita de destino usa uma entrada de histórico; inicialização/correção de hash desconhecido usa replace, sem ciclo. Voltar/Avançar e hashchange selecionam destino sem novo push. Não colocar conta, token, mensagem ou dados privados no hash. Registrar a política de hash inválido/versão futura antes de implementar; proposta: Conversa como fallback, sem interpretar segmentos arbitrários.

## Adaptação e ações

- 320–599 px: uma área principal; quatro destinos rotulados e Mais, sem rolagem horizontal ou gesto obrigatório.
- 600–1023 px: área principal e auxiliar sob demanda, com abertura/fechamento e retorno de foco explícitos.
- >=1024 px: leitura e mídia lado a lado somente quando as larguras mínimas couberem; preferir recolher auxiliar a comprimir os controles essenciais.

Entrada/saída da voz deve estar a no máximo duas ações de qualquer destino. Envio deve estar a no máximo duas ações de qualquer destino, desconsiderando digitação, sem enviar automaticamente ao navegar. Drawer/modalidade deve reutilizar o contrato T06; primitivos/tokens devem seguir T09 quando disponibilizados. Não substituir esses critérios por contagem apenas de cliques do mouse.

## Layout v4 e reversão

Manter `chat-friends:layout:v4:compact` e `:wide` intactos durante a adoção do shell simples. Esses snapshots são por navegador e não têm conta no nome; não inferir propriedade da conta nem permissões a partir deles. Novo estado de preferência de shell deve ter namespace/versão próprios, validação e isolamento por conta; ausência ou corrupção não apaga v4.

Modo avançado é opt-in explícito. Só ele continua usando a persistência v4 existente; modo simples não chama saveLayout/fromJSON sobre o snapshot antigo para representar seus destinos. Voltar ao avançado restaura v4 e conserva filtro de painel administrativo para não-admin. Fallback/reversão deve reativar o caminho v4 sem migração destrutiva. Registrar a decisão final de flag/preferência e comportamento se storage estiver indisponível. Fazer fixtures de v4 válido/corrompido, troca de conta, permissões e ida/volta; comparar o snapshot original byte a byte quando o modo simples não o editou.

## Identidade e ciclo de mídia

Workspace deve permanecer proprietário estável da chamada, players, transmissões, captura e AudioContext. Não condicionar Voice/players ao destino atual ou ao breakpoint; não usar destino/hash/modo como key. Alternar shell deve alterar apresentação/hosts sem recriar esses proprietários. Mover um portal para outro container pode remontar seus filhos; planejar hosts permanentes e verificar identidades, em vez de presumir estabilidade por usar createPortal. Desmontagem da página/sessão continua encerrando recursos corretamente.

Antes de integrar, observar identidade de Room/conexão, elementos video/audio, srcObject/MediaStreamTrack, players/contextos e ausência de join/leave/grant extras após navegar, Voltar, resize e alternar shell. Manter três transmissões simultâneas, seleção independente e grade; um novo shell não pode reduzir a cobertura existente a uma única transmissão.

## Matriz proposta de verificação

| Área | Casos a executar depois da liberação |
|---|---|
| Navegação | Quatro destinos rotulados, aria-current, teclado, foco previsível, <=2 ações para voz/envio |
| URL | Entrada direta antes/depois do login, reload, Voltar/Avançar, hash inválido e versão desconhecida; sem pushes recursivos |
| Responsividade | 320/390/768/1024/1440 px, paisagem, zoom, safe areas e teclado virtual; sem overflow da navegação |
| Persistência | v4 válido/corrompido, storage indisponível, simples→avançado→simples, reversão e troca de conta |
| Mídia | Identidade dos objetos e ausência de reconexão/republish em todos os destinos, resize, histórico e modos; três lives com seleção individual/grade |
| Sessão | Logout/expiração cancela recursos; hash não concede acesso nem reabre chamada |

Estender fixtures/testes existentes; não simular teclado virtual real ou aprovação assistiva apenas redimensionando viewport. Resultados efetivamente executados após a liberação constam na execução T08; não presumir execução de todos os checks externos desta matriz.
