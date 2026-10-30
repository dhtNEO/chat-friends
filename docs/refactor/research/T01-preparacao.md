# T01 — Preparação da pesquisa de jornadas

## Base, evidência e limites

Inspeção estática em 30/10/2026 de `refactor@736d22939be8329981732e2e9360efc9c52ccf1d`, descendente de `1b0ffd9a0dc15de3a2dcf0efb0053791c425a1e4`. Nenhuma sessão humana, observação em navegador, medição de tempo ou aprovação de produto foi realizada. O inventário descreve caminhos e estados presentes no código; comportamento percebido e cobertura de dispositivos continuam por verificar. O arquivo histórico não foi usado como evidência de usabilidade atual.

A entrada T01 foi encontrada em planned, owner nulo, sem dependências. Reserva por Codex: planned → in_progress após revalidação; após concluir estes preparativos, in_progress → blocked por sessões e revisão de produto indisponíveis. Estado, responsável e evidências canônicos estão no [backlog](../backlog.json). A ausência de baseline no plano ativo confirma a lacuna documental, não confirma que a organização seja inadequada aos amigos.

Checkout inicial limpo, branch local work em `d8fdd89a7f980f7cf03736c6b83682cc517aaf15`. O fetch Git falhou por conexão ao proxy. Arquivos atuais consultados pelo conector GitHub no SHA acima, sem substituir o checkout existente. A validação documental usa uma cópia de trabalho em work/t01-snapshot. A branch de entrega deve partir do SHA de refactor, preservando todo o restante da árvore.

## Inventário de telas e estados

Referências de código abaixo pertencem ao SHA inspecionado. Estados listados são alvos de inspeção em sessão, não resultados observados com participantes.

| Superfície / entrada | Estados e variações a cobrir | Fonte atual |
| --- | --- | --- |
| Entrada | formulário, envio ocupado, erro, sessão não mantida, sessão expirada e nova entrada | frontend/src/App.tsx:118–214; AccountSecurity.tsx |
| Shell / Canais | painéis abertos/fechados, abas, divisão, maximizar/restaurar, restauração do layout, gaveta em tela estreita, papel admin/comum | App.tsx:453–730; Dock.tsx; docs/USER_GUIDE.md |
| Conversa / #geral | conectado/reconectando, histórico vazio/carregado, mensagem aguardando confirmação, reenvio, emoji, duas vistas | App.tsx:900–1104 |
| Membros | lista, presença, pessoa na voz e controles de volume | App.tsx:521–555; Voice.tsx:940–1048 |
| Sala de voz | fora, conectando, dentro, reconectando, permissão negada, mic/áudio desligados, sair | Voice.tsx:300–440 e 1062–1315 |
| Transmissão | captura cancelada/negada, publicar/parar, zero/uma/três fontes, fonte encerrada, seleção individual, todas/nenhuma, grade, qualidade e volume por fonte | Voice.tsx:screenContent e controles; docs/USER_GUIDE.md |
| Organização da sala | blocos Pessoas/Transmissão/Música, foco/restaurar, mídia separada, janela externa fechada e retorno | RoomLayout.tsx; Dock.tsx; guia atual (caminhos a verificar em execução) |
| Música | busca vazia/com resultados, fila vazia/com itens, tocando/parado, erro e volume independente | Music.tsx; guia atual (inspeção de runtime pendente) |
| Clube da Sorte | jogar/ranking/extrato, sala aberta/cheia, criar/entrar por código, rodada, aposta bloqueada, saldo insuficiente e erro | GamesClub.tsx:248–931 |
| Beat Club | entrada, lobby, preparação, partida, resultado, erro/saída | PartyClub.tsx; guia atual (aprofundar antes das sessões deste jogo) |
| Calendário rotulado Outlook | carregando, erro, mês/dia, vazio/eventos, criar/editar, presença e confirmação de cancelamento | Outlook.tsx:249–606 |
| Configurações | Conta, Voz e áudio, Atalhos, Aparência e Sons; salvar/erro, perfil/senha, autenticador e sessões | Profile.tsx:205–410; AccountSecurity.tsx |
| Administração | contas, criação/alteração e reautenticação; acesso restrito ao papel admin | App.tsx:1146–1246; AccountSecurity.tsx |

Confirmar também foco visível, ordem por teclado, zoom 200%, largura até 900 px e largura desktop, persistência pessoal do layout, retorno após fechar painel e mensagens de falha. Não presumir suporte de captura em celular: se indisponível, observar como espectador e registrar a limitação.

## Mapa de jornadas e tarefas

Cada jornada começa de um estado resetado com contas fictícias e termina por evidência verificável pelo moderador. O texto da tarefa não revela rótulos nem sequência de cliques.

| ID / necessidade | Preparação e percurso esperado para análise | Instrução neutra / sucesso verificável | Limite |
| --- | --- | --- | --- |
| J1 Entrar na voz | conta comum autenticada → localizar sala → permissão → conectado → sair | “Entre na conversa de voz com os amigos e depois saia.” Sucesso: presença e áudio sintético recebidos, saída confirmada. | 120 s |
| J2 Conversar durante live | observador conectado; três contas auxiliares publicam telas sintéticas → selecionar uma → todas/grade → chat → voltar | “Veja só a tela de Amigo B, depois acompanhe as três e envie a frase fictícia combinada sem sair da chamada.” Sucesso: seleção correta, três fontes visíveis, mensagem confirmada e chamada mantida. | 180 s |
| J3 Ajustar volumes | voz, música e live sintéticas audíveis; volumes resetados → pessoa → transmissão → música → saída | “Deixe Amigo A mais baixo, silencie só a transmissão de B e mantenha música e outras vozes audíveis.” Sucesso: controles e efeito correspondentes, sem silenciar fontes indevidas; ao final restaurar volumes. | 180 s |
| J4 Iniciar jogo | conta com saldo fictício, auxiliar disponível → Clube → criar/entrar em sala → iniciar rodada | “Crie uma partida de Roleta para jogar com Amigo A e iniciem uma rodada com moedas fictícias.” Sucesso: ambos na sala e rodada iniciada. Não exigir vitória ou tempo da rodada. | 180 s |
| J5 Marcar encontro | calendário sem evento de mesmo nome → criar → conferir data/hora → auxiliar confirma presença | “Marque o Encontro teste para amanhã às 20h no seu fuso e confira a presença de Amigo A.” Sucesso: evento persistido, data/hora corretas e presença visível. | 180 s |

Cronometrar J2 também por subtarefa (individual, grade, mensagem); J3 por fonte. Separar tempo de espera de terceiros do tempo de interação e registrar ambos. No piloto ajustar limites impraticáveis antes de coletar R1, documentando a mudança. Dados excluídos não se apagam: ficam sinalizados com motivo.

## Avaliação heurística técnica preliminar

Escala proposta de gravidade para triagem: 0 sem problema; 1 cosmético; 2 atrito recuperável; 3 impede tarefa sem ajuda; 4 impede tarefa crítica ou expõe dado. Severidades abaixo são provisórias, derivadas de leitura; frequência e impacto real dependem de sessões. Não são defeitos novos confirmados nem autorização para executar outras specs.

| ID / heurística | Observação técnica verificável | Hipótese que exige usuários | Gravidade proposta / validação |
| --- | --- | --- | --- |
| H1 Correspondência com linguagem | App.tsx:480/657, Dock.tsx:27 e Outlook.tsx:249/256 usam Outlook; o calendário também diz Agenda compartilhada | Pessoas podem procurar um provedor de e-mail em vez de encontros | 2; J5 e pergunta posterior sobre Agenda |
| H2 Reconhecimento e consistência | Shell usa ícones/painéis e sala tem blocos, foco, separação e restauração documentados | Novatos podem perder chat/controles ao organizar a sala, especialmente no celular | 2; J1/J2, primeiro clique, desvios e recuperação |
| H3 Visibilidade do estado | Chat exibe Conectado/Reconectando e Aguardando confirmação; voz tem Conectando/Reconectando à voz | A diferença entre sessão, chat e voz pode não ser compreendida | 3; cenário de desconexão controlada depois das tarefas principais |
| H4 Controle e liberdade | Voice.tsx:842–872 oferece seleção por checkbox, todas/limpar e grade; fechar a sala não encerra chamada segundo o guia | Pode haver dúvida sobre assistir, transmitir e sair | 3; J2 e pedido de explicar o que permanece ativo |
| H5 Prevenção de erros | Silenciar áudio atua em voz/mic; música/live têm controles próprios; há volume geral e por pessoa/fonte | Ajuste da fonte errada pode provocar silêncio inesperado | 2; J3 com verificação de cada fonte |
| H6 Recuperação | Chat tem reenvio e calendário mostra erros/confirma cancelamento; presença tem estados desabilitados durante envio | Feedback pode não orientar recuperação ou evitar repetição percebida | 2; tarefa extra de falha controlada e pergunta sobre próxima ação |
| H7 Acessibilidade | Há labels, status e grupos em Voice/App/Outlook; isso não comprova navegação completa por teclado | Ordem, foco e controles de mídia podem dificultar uso sem mouse | gravidade a classificar; repetir J1–J5 por teclado e registrar bloqueios |

Não estimar contraste, desempenho, taxa de erro ou qualidade de áudio por leitura. Não concluir preferência de marca: Entre amigos/VGH continuam opções para investigação e decisão de produto.

## Roteiro de duas rodadas

Duas rodadas de 5–8 participantes **em cada rodada** (10–16 sessões), 45–60 minutos por sessão; recrutamento e convites ainda não realizados. Buscar em cada rodada pelo menos 2 usuários de celular e 2 que executem tarefas somente por teclado; categorias podem se sobrepor. Incluir iniciantes e habituais, registrar experiência, dispositivo, SO, navegador e tecnologia assistiva sem dados identificadores. Preferir pessoas diferentes em R2; se houver repetição, registrar e separar o efeito de aprendizado. Não generalizar percentuais à população.

Antes de R1, moderador e produto devem confirmar objetivos, limites e ambiente descartável. Fazer um piloto interno, identificado como piloto e excluído da baseline. Preparar três transmissores auxiliares com telas geométricas e áudio de teste, conta comum, dados fictícios, evento removível, jogo com moedas de teste, conexão e capacidade do dispositivo. Registrar SHA exato, versão do roteiro, navegador e alterações de ambiente. Evitar ambientes e contas de produção. Não alterar segurança, grants, limites ou migrações para viabilizar a pesquisa.

Abertura (5 min): “Estamos avaliando a interface. Você pode parar ou pular qualquer tarefa. Usaremos apenas dados fictícios. Não gravaremos áudio, vídeo, tela nem conteúdo de conversas; faremos notas sobre ações e dificuldades.” Obter consentimento antes de começar, inclusive para notas anonimizadas. Sem consentimento, não coletar. Consentimentos/contatos ficam fora do repositório, em local restrito sob controle de produto; publicar só agregado sanitizado. Produto deve definir retenção e descarte antes do recrutamento.

Contexto (5 min): frequência de uso e objetivo principal, dispositivo e navegação habitual. Tarefas (25–35 min): ler J1; J2 exige conexão já preparada se J1 falhar; depois J3. Alternar J4/J5 entre participantes para reduzir efeito de ordem. Não ensinar caminhos; pedir pensamento em voz alta, sem capturar conteúdo. Iniciar relógio ao terminar a leitura e confirmar entendimento. Parar no sucesso, desistência, limite ou bloqueio. Toda ajuda do moderador é registrada e muda o resultado para assistido quando leva à conclusão.

Após cada tarefa: “De 1 a 7, quão difícil foi? 1 = muito fácil; 7 = muito difícil.” Registrar resposta antes de discutir. Perguntar “O que esperava acontecer?”. Não inverter essa escala ao consolidar.

Cenários adicionais (até 5 min, sem misturar com tarefas principais): negar microfone, cancelar captura, interromper rede no ambiente descartável ou encerrar uma das três fontes. Executar apenas quando seguro e suportado; marcar não executado com motivo. Não desligar serviços compartilhados nem simular falha em produção.

Encerramento (5–10 min): perguntar primeiro como a pessoa chamaria o produto e onde procuraria encontros; só depois apresentar Entre amigos/VGH e Outlook/Agenda, alternando a ordem. Registrar compreensão e justificativas, sem assumir que preferência é aprovação. Perguntar quais jornadas usaria com mais frequência e principal dificuldade.

R1: medir a interface atual e consolidar problemas por jornada/dispositivo, com gravidade, evidência e divergências. Produto revisa achados, prioridades e hipóteses; registrar decisão e responsáveis. Nenhuma alteração de redesign faz parte desta entrega.

R2: após revisão de R1, repetir tarefas equivalentes e métricas com 5–8 participantes. Se ainda for o mesmo runtime, usar R2 para aprofundar/revalidar, sem alegar melhora causada por redesign. Se produto especificar um protótipo futuro, registrar versão, fidelidade e limitações (sem prova de áudio/WebRTC real), aplicar tarefas equivalentes e separar resultados do produto real. Mudança de tarefa/dispositivo invalida comparação direta; reportar estratos e razões. R2 depende de participantes e decisões futuras, sem inventar protótipo ou aprovação agora.

## Medição, baseline e metas propostas

O [CSV vazio](T01-resultados.csv) é uma linha por participante × tarefa × rodada, sem exemplos que pareçam dados reais. Usar pseudônimos R1-P01 etc.; nenhuma associação com nomes no repositório. Formulário de sessão: rodada, pseudônimo, consentimento registrado (sim/não, sem assinatura), data, SHA/versão, dispositivo/navegador, modalidade de entrada, experiência e moderador. Registrar só notas de interação sem fala ou mensagem privada.

- Resultado: independente (objetivo completo sem ajuda); assistido (concluído com dica); falha (limite, objetivo incorreto ou bloqueio); desistiu; não executado (motivo obrigatório). Assistência inclui indicar caminho ou controle; esclarecer enunciado sem ensinar deve ser anotado.
- Sucesso independente = independentes / tentativas executadas. Assistidos separados; falha e desistência entram no denominador. Não executados ficam fora e são contados por motivo. Sempre publicar contagens n/N por jornada e estrato; não só percentuais.
- Tempo em segundos: início/fim definidos no roteiro; tempo decorrido total e espera externa separados. Mediana e intervalo min–máx dos sucessos independentes; relatar separadamente tempos censurados de falhas/desistências e tempos assistidos. Não substituir falhas pelo limite em uma média.
- Erro: ação que leva a estado diferente do objetivo, envio inválido ou recuperação necessária. Contar uma vez por ocorrência e anotar categoria/recuperação, sem contar espera ou exploração como erro. Crítico: impedir conclusão, sair da chamada indevidamente ou alterar fonte/evento errado sem recuperação. Registrar erros por tentativa e participantes afetados; não confundir mensagens de erro do sistema com erro do usuário.
- Dificuldade: resposta inteira 1–7 após cada tarefa; mediana e intervalo por jornada, ausências como vazio, nunca zero.
- Baseline: **não medida**. R1 produzirá n/N, tempos, erros, dificuldade e limitações por jornada/dispositivo. Valores ausentes continuam vazios até coleta consentida. R2 mantém os mesmos campos e registra diferenças de versão/coorte.

Metas exploratórias propostas para discutir com produto antes das sessões: ≥80% de sucesso independente por jornada (arredondar para cima: 4/5, 5/6, 6/7, 7/8), mediana de dificuldade ≤3, nenhum erro crítico sem recuperação e mediana de tempo independente ≤90 s em J1 e ≤150 s em J2–J5. Nenhum bloqueio por teclado ou celular nas jornadas aplicáveis. Limites de sessão não são metas de desempenho. Metas não aprovadas e não comprovadas; revisar após piloto e confrontar com R1, com justificativa registrada antes de R2. Não selecionar só os resultados favoráveis nem alegar significância estatística.

## Formulário de síntese e revisão (vazio)

Preencher após cada rodada, mantendo referência às linhas sanitizadas de coleta:

| Jornada / dispositivo / versão | Executadas / não executadas e motivos | Independentes n/N / assistidas / falhas / desistências | Tempo mediano [min–máx] | Erros / críticos | Dificuldade mediana [min–máx] |
| --- | --- | --- | --- | --- | --- |
| A preencher após coleta | | | | | |

Registro de problema: ID, rodada/jornada, comportamento observado (separado de interpretação), frequência n/N, impacto/recuperação, gravidade 0–4, hipótese explicativa, evidência sanitizada, proposta, responsável pela próxima ação, decisão de produto e versão/data. Resultados divergentes e tarefas não executadas devem permanecer visíveis.

Revisão humana: nome/papel do revisor autorizado, data, decisões aceitas/rejeitadas/pendentes, dúvidas e critérios de nova rodada. Nenhum campo está aprovado nesta entrega.

## Handoff e critérios que permanecem pendentes

Preparativos disponíveis entregues: inventário estático, mapa, triagem heurística, roteiro R1/R2, métricas/metas propostas e instrumentos vazios. Falta executar piloto e duas rodadas consentidas com 5–8 participantes cada, preencher resultados, estabelecer baseline real e revisar descobertas com produto. Confirmar marca e rótulo do calendário; registrar decisões e especificação do protótipo quando houver evidência. Até lá, manter T01 aberta e não liberar implementação dependente de T01.

Próximo passo: Produto/UX organiza ambiente descartável, política de retenção, recrutamento e consentimento, executa R1, revisa e agenda R2. Transferência do owner exige registro no backlog; não atribuir aprovação a Produto/UX por este documento.

## Verificação desta entrega

- `python3 docs/refactor/validate.py` na cópia documental do SHA base com estes seis arquivos alterados: aprovado, “Plano válido: 30 tarefas; estados, dependências e links consistentes.”
- Check pontual em Python: T01 blocked/owner Codex/validation confirmed e CSV contendo apenas cabeçalho único com campos de resultado, tempo, erros e dificuldade: aprovado.
- Primeira execução do validador detectou três imagens históricas ausentes na cópia local; completadas com os arquivos originais, sem editar archive, antes de repetir.
- Suites de backend, frontend e mídia não executadas: entrega exclusivamente documental, conforme README ativo. Sem evidência de runtime ou pesquisa humana.
- A revisão humana deste PR e da pesquisa permanece pendente. O SHA validado do código é o SHA base indicado acima; checks documentais abrangem as alterações desta entrega.
