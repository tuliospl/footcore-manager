# Footcore Manager

Um jogo de gestão de futebol inspirado nos managers clássicos brasileiros. O MVP roda inteiramente no navegador e salva a carreira automaticamente no IndexedDB do navegador.

## Recursos

- Nova carreira com escolha do clube, 559 times e 15.400 jogadores do pacote MKFP
- 36 ligas jogáveis de 18 países, com calendários e classificações separados
- Divisões de referência: Brasil 2026 e Europa 2026/27
- Simulação de partidas baseada em elenco, forma, moral e tática
- Partida minuto a minuto com placar, campo, energia e relato de lances
- Pausa, intervalo, cinco substituições e escolha do cobrador de pênaltis
- Amarelos, vermelho direto, expulsão por segundo amarelo e pênaltis convertidos ou perdidos
- Evolução e regressão de geral e potencial por desempenho, posição e idade
- Compra e venda de jogadores
- Busca de atletas dos outros clubes por nome, equipe e posição
- Propostas com valor livre, recusas, contrapropostas e histórico salvo
- Anúncios dos clubes com preço fixo e contratação direta
- Empréstimos até o fim da temporada, com taxa, salário e retorno automático
- Clubes exigem mais por peças-chave, titulares, jovens promissores e atletas difíceis de repor
- Folha salarial, bilheteria e orçamento do clube
- Ampliação do estádio em cinco níveis
- Moral da torcida e do elenco
- Classificação, notícias e estatísticas individuais
- Escalação automática por posição, com estatísticas apenas dos titulares
- Progresso de evolução visível no elenco e proteção do último goleiro
- Nova temporada com envelhecimento dos atletas e estatísticas reiniciadas
- Histórico de posições e pontos por temporada; jogos e gols reiniciam a cada campeonato
- Resumo automático no fim da temporada com classificação, prêmios, seleção da liga, finanças e evolução do elenco

## Executar

```bash
npm start
```

Acesse `http://localhost:4173`.

O jogo abre a seleção de clubes no primeiro acesso. Quem já tem uma carreira pode usar **Novo jogo**, escolher país, campeonato e clube e clicar em **Comandar este clube**. Ao iniciar, a nova carreira substitui a atual.

A carreira fica salva neste navegador; limpar os dados do site apaga o progresso. É necessário Python 3 para o servidor local e Node.js para os testes.

## Publicar no GitHub Pages

O fluxo em `.github/workflows/pages.yml` publica o jogo automaticamente após cada envio para a branch `main`. No GitHub, abra **Settings → Pages**, selecione **GitHub Actions** em **Source** e aguarde a conclusão da ação **Publicar jogo no GitHub Pages**.

## Negociações

Em **Mercado**, combine nome, clube, país do clube, campeonato, múltiplas posições, disponibilidade e intervalos de idade, geral, potencial e valor de mercado. Também é possível limitar salário por rodada, exigir margem de evolução e mostrar somente contratações que cabem no caixa. Posições usam OU; os demais filtros usam E. Os intervalos são inclusivos; valores mínimos maiores que os máximos são sinalizados. Clique em **Fazer proposta**, informe o valor em reais e envie. Se o clube aceitar, o jogador muda de elenco e o valor é transferido entre os caixas imediatamente. Uma contraproposta pode ser usada como novo valor, mas precisa ser enviada para concluir o negócio.

O valor de mercado é apenas uma referência. A diretoria considera importância esportiva, reposição, potencial, tamanho do elenco, situação financeira e disputa pelo título. Ofertas muito baixas são recusadas; ofertas próximas recebem uma contraproposta. Repetir a mesma oferta não sorteia uma nova resposta. Nenhum clube vende seu último goleiro ou fica com menos de 14 atletas. As últimas 20 respostas ficam salvas na carreira, com as cinco mais recentes exibidas no mercado. Atletas sem clube continuam disponíveis por preço fixo.

Use o filtro **Disponibilidade** para encontrar **Preço fixo**, **Empréstimo** ou **Sob proposta**. Os clubes anunciam reservas fora dos planos para venda direta; jovens reservas de até 24 anos com potencial de evolução são oferecidos por empréstimo quando o clube tem caixa não negativo. Titulares e peças-chave continuam sujeitos a negociação. A disponibilidade é reavaliada conforme o elenco e as finanças mudam.

Na venda direta, confira o preço e confirme a compra sem enviar proposta. No empréstimo, a taxa inicial é proporcional às rodadas restantes, seu clube paga 100% do salário por rodada e o atleta retorna ao clube de origem após a última rodada da temporada. O contrato não tem opção de compra ou reembolso da taxa. Atletas emprestados não podem ser vendidos; é necessário manter pelo menos 14 jogadores próprios e um goleiro próprio. A evolução obtida durante o empréstimo acompanha o atleta no retorno. Carreiras já salvas recebem essas opções sem reiniciar o jogo.

## Acompanhar partidas

Clique em **Jogar rodada** para abrir os placares da rodada. Clique no seu jogo para escolher o cobrador e use **Iniciar rodada** para acompanhar o relógio automaticamente, em velocidade normal ou rápida. Também é possível usar **Avançar 5 minutos**, que respeita as paradas para decisões.

Use **Pausar rodada** ou clique no placar do seu jogo para organizar a prancheta. O banco aparece ao lado do campo: arraste um reserva sobre o titular que sai, ou selecione o reserva e clique no destino (também funciona por toque ou teclado). Antes do início, as trocas são livres e não contam no limite. Durante o jogo, elas contam como substituições. São permitidas cinco substituições; quem sai não retorna e expulsos não podem ser substituídos. Os reservas entram descansados e a energia, a tática e o número de atletas em campo afetam a força da equipe. O adversário também faz substituições.

O relógio para aos 45 minutos, quando seu time sofre uma expulsão e quando ganha um pênalti. Quando seu time ganha um pênalti, um popup abre automaticamente sobre os placares. Selecione um dos atletas em campo e clique em **Cobrar com [nome]** no próprio popup. A lista mostra posição, geral efetivo, energia e nota. Se fechar o popup, a rodada continua parada e o botão **Escolher cobrador e bater** permite reabri-lo. Um pênalti pendente também reabre ao recarregar a página. Após a cobrança, convertida ou perdida, a simulação continua automaticamente na velocidade escolhida; cobranças aos 45 minutos ou no fim respeitam o intervalo e o encerramento. Nem todos os pênaltis são convertidos; gols de pênalti não geram assistências. Os cartões afetam esta partida; não há suspensão automática para a rodada seguinte nesta versão.

A partida é salva durante o acompanhamento e volta pausada ao recarregar ou sair da tela. Ao final, clique em **Concluir rodada** para registrar gols, assistências, cartões, participações e notas dos jogos acompanhados, além de atualizar tabela, moral e finanças uma única vez. O relato continua disponível na última rodada. Transferências ficam bloqueadas enquanto a partida estiver aberta.

## Testes

```bash
npm test
```

## Esquemas e posições

A prancheta oferece **4-4-2 (losango), 4-3-3, 4-2-3-1, 3-5-2 e 5-3-2**. Mudar o esquema reposiciona os atletas que já estão em campo buscando o maior número de posições naturais; não faz substituições automáticas. O esquema escolhido permanece para as próximas partidas. Também é possível arrastar titulares para trocar suas posições ou ocupar uma vaga deixada por expulsão, mantendo o número de jogadores.

Um jogador improvisado fica vermelho, com texto **Fora de posição** e o geral original e efetivo. A perda é de 10% em outra posição do mesmo setor (ZAG/LAT ou VOL/MC), 20% entre setores e 50% para improvisações envolvendo GOL, arredondada ao inteiro mais próximo. Esse geral reduzido entra na força da equipe e nas cobranças de pênalti, sem alterar o atributo permanente do jogador. Um goleiro presente deve permanecer no gol. Se ele for expulso, substitua um atleta de linha por um goleiro reserva: ele vai automaticamente para GOL e a equipe continua com um atleta a menos.

## Rodada ao vivo e notas

A tela **Rodada ao vivo** destaca seu jogo com os últimos lances e mostra os demais placares da sua liga em uma lista compacta. Todos avançam no mesmo relógio; pausa, intervalo e decisões do seu time param o acompanhamento da rodada. Os outros jogos têm simulação própria, gols, cartões, substituições e notas. Seus resultados finais são os mesmos exibidos ao vivo, sem novo sorteio ao concluir a rodada.

Clique em um placar para abrir o jogo. O seu abre a prancheta e pausa a rodada para mudanças; os demais abrem apenas informações. Use **Escalações e notas** para comparar desempenho, energia, minutos, gols e assistências das duas equipes. **Voltar aos jogos** retorna aos placares; **Continuar rodada** retoma a simulação. O campo fica restrito à aba **Táticas e substituições**, com a nota de cada atleta junto à camisa.

As notas são estimativas de 1 a 10: começam em 6,0 e consideram gols, assistências, finalizações, cartões, pênaltis perdidos, defesas comuns, defesas de pênalti e gols sofridos durante a participação. Cobranças para fora não contam como defesa. Defensores recebem maior impacto pelos gols sofridos e bônus por pelo menos 60 minutos sem sofrer gols. Atletas que não entraram ficam sem nota. A avaliação de um substituído ou expulso deixa de variar depois da saída.

Ao concluir a rodada, as notas de todos os clubes são registradas uma única vez. Em **Elenco**, **Nota média** mostra a média da temporada e a quantidade de jogos avaliados; clique no cabeçalho para ordenar. Partidas antigas sem avaliação não entram na média. As médias reiniciam na nova temporada. Os placares da **Última rodada** são clicáveis e conservam escalações, minutos e notas finais para consulta.

## Mundo e divisões

A base usada pelo jogo fica em `data/world/database.json`. Os 559 clubes estão disponíveis para novas carreiras e no mercado. As Séries A, B e C brasileiras contêm seus 20 clubes; algumas outras divisões são parciais. A seleção de clube mostra a quantidade presente e esperada. O Manthiqueira é o único representante de sua divisão estadual no pacote: participa do mercado, mas não permite iniciar carreira sem mais adversários.

**Formato da simulação:** todos os campeonatos usam pontos corridos em turno e returno. Divisões adjacentes do mesmo país têm acesso e rebaixamento; no Brasil, quatro clubes sobem e quatro descem quando as duas divisões estão disponíveis. Ainda não há grupos, mata-mata, copas nacionais ou continentais. Os confrontos são gerados pelo jogo, sem reproduzir datas ou ordem do calendário oficial. Ligas com número ímpar têm folgas. As demais ligas avançam proporcionalmente ao calendário do manager, terminando junto com a temporada; a folha é cobrada uma vez por rodada disputada pelo clube. Os elencos do pacote e seus atributos estimados não são atualizados pela consulta às divisões.

**Persistência:** IndexedDB acomoda a carreira mundial (aproximadamente 8 MB). Carreiras antigas do localStorage são migradas ao abrir. Não abra a mesma carreira em várias abas para jogar simultaneamente.

**Atualizar o pacote:** após `npm run convert:m26`, revise os participantes em `scripts/build_world.py` e execute `npm run build:world`. O gerador valida nomes, clubes duplicados e cobertura integral antes de produzir o manifesto. `scripts/build_world.mjs` reutiliza o parser CSV do jogo para gerar a base. As fontes consultadas ficam em `data/world/leagues.json`, e o resumo de cobertura em [data/world/README.md](data/world/README.md).


### Escala global de jogadores e economia (versão 2)

Os `.m26` fornecidos não possuem geral individual: há força do clube, idade, posição, titular/estrela e características categóricas. A antiga soma força + bônus saturava em 99. Agora `src/player-balance.js` comprime a força para uma escala global e considera contexto do clube, papel, maturidade e uma pequena variação determinística. Nacionalidade do jogador não entra no cálculo. Jogadores não perdem geral ao trocar de país ou clube. A idade reduz principalmente potencial restante e valor de revenda; goleiros têm uma curva de maturidade diferente.

As referências individuais são **decisões editoriais de balanceamento**, não notas oficiais, estatísticas de desempenho nem avaliações obtidas de outro jogo. Exemplos: Kane 90, Gnabry 82, Davies 84, Jorginho 79, Mbappé/Haaland/Yamal 92. Os demais jogadores usam a estimativa, limitada a 89 de geral na criação; potencial estimado vai até 93, e referências específicas até 95. Geral e potencial explícitos em CSV/JSON continuam tendo prioridade. Habilidades técnicas/físicas do M26 são categorias, não pontuações numéricas somáveis.

Valores em reais seguem uma curva exponencial: referência de R$ 3 milhões no geral 65, crescimento de `exp(0,17 × (geral − 65))`, multiplicado por idade e perspectiva de evolução. São preços da economia do jogo, não cotações reais. Um atleta 99 no auge fica na ordem das centenas de milhões, não R$ 3 milhões. Propostas exigidas, preço fixo e taxas de empréstimo continuam calculados à parte. A ordenação por valor de mercado não confunde empréstimo barato com atleta pouco valioso. “Cabe no caixa” considera pagamento inicial, sem salários futuros.

Novas carreiras mundiais recebem orçamento de transferências proporcional ao valor do elenco (12%, entre R$ 2 e 400 milhões). Carreiras mundiais existentes recebem a atualização de notas e valores uma única vez, preservando níveis já conquistados, idade, caixa, estatísticas, calendário, transferências e empréstimos. Se houver uma partida aberta, a migração aguarda sua conclusão. Bases externas personalizadas não têm atributos explícitos sobrescritos. O mercado de carreiras fictícias antigas recebe apenas a nova curva de preços. O elenco original do pacote permanece inalterado nos arquivos fonte.


### Escalação antes do jogo e jogadores livres

**Escalação** abre uma prancheta persistente com 11 titulares, até 7 reservas e os não relacionados. Arraste entre posições e vagas do banco, ou selecione o atleta e depois clique no destino. “Não relacionar” libera uma vaga no banco e “Relacionar no banco” preenche uma vaga. Trocar de esquema mantém os mesmos titulares e os reposiciona; “Escalar automaticamente” recompõe a seleção. O goleiro deve continuar no gol. Improvisações usam a redução de geral existente. O botão do cabeçalho leva primeiro à preparação e **Ir a jogo** cria a partida com os jogadores e posições escolhidos; não relacionados não podem entrar durante essa partida. Mudanças na partida respeitam o limite de cinco substituições. Vendas, saídas e retornos de empréstimos reparam posições inválidas na preparação sem apagar as outras escolhas.

A base `.m26` não fornece agentes livres ou duração contratual. A carreira mundial começa sem jogadores livres fictícios. A atualização remove somente o antigo grupo gerado que ainda estiver sem clube; atletas já contratados e jogadores liberados por contratos são preservados. Durações contratuais são simuladas, distribuídas entre o fim da temporada atual e das duas seguintes. O filtro **Disponibilidade → Sem contrato** permanece disponível mesmo vazio e reúne os atletas que ficam livres durante a carreira. Contratar exige luvas de 8% do valor de mercado (mínimo R$ 10 mil), além de assumir o salário por rodada; não se paga uma transferência a outro clube. O vínculo contratado vale até o fim da segunda temporada seguinte.

A coluna **Contrato** no elenco mostra o vencimento e a renovação: luvas de quatro salários por rodada, com vínculo até o fim da segunda temporada seguinte. Contratos já tão longos não são renovados novamente. Os empréstimos retornam antes do processamento de vencimentos; atletas do seu clube sem renovação são liberados ao final da temporada. Para evitar uma carreira inviável, o jogo renova automaticamente sem luvas quando a saída deixaria menos de 14 atletas, menos de dez jogadores de linha ou nenhum goleiro. Clubes controlados pelo jogo priorizam renovação: principais peças têm 0,5% de chance de não renovar (0,2% para jovens), reservas adultos 18%, veteranos reservas 40% e jovens reservas 4%. São parâmetros de balanceamento, não estatísticas do futebol real. Cada clube libera no máximo dois atletas por temporada; saídas de jogadores de geral 80 ou superior pelos clubes automáticos ficam limitadas a dois em todo o mundo por temporada. Recarregar a carreira não muda a decisão. No seu clube, renovações continuam manuais, com a proteção mínima do elenco descrita acima. A data de contrato e as movimentações são simulação do Footcore, não informações do contrato real.

No mercado, a ordenação é exclusivamente pelos cabeçalhos; o antigo seletor “Ordenar” foi removido. Filtros e paginação continuam combináveis.


Clubes automáticos também procuram agentes livres após rodadas concluídas: avaliam carências por posição, nível esportivo, vagas de elenco (incluindo atletas emprestados) e caixa para luvas mais quatro rodadas de folha. Até quatro contratações ocorrem por rodada, sem escolher ou gastar pelo clube do usuário. Jogadores recém-liberados têm uma janela para o manager observá-los: saídas do fim da temporada podem ser contratadas pelos rivais após a primeira rodada da temporada seguinte; saídas na mesma temporada esperam mais de uma rodada. O clube que liberou o atleta não o recontrata nesse período de mercado livre. As contratações aparecem nas notícias e ficam registradas na carreira.


## Evolução dinâmica de jogadores

`src/development.js` aplica evolução somente ao concluir cada partida, tanto na liga acompanhada como nas ligas simuladas. As notas incorporam gols, assistências, finalizações, cartões amarelos/vermelhos, pênaltis perdidos, defesas e gols sofridos. Goleiros, zagueiros e laterais têm um componente adicional para jogos sem sofrer gols (mínimo 60 minutos) e gols sofridos; goleiros também recebem crédito por pênaltis efetivamente defendidos. Só contam acontecimentos durante a participação do atleta. Reservas que não entram não ganham nem perdem atributos por desempenho.

As contribuições são acumuladas proporcionalmente aos minutos. Notas abaixo da referência de 6,2 pressionam a evolução para baixo; contribuições defensivas podem compensá-las. Atletas jovens evoluem mais rápido; atletas de elite precisam de mais evidência para subir. O potencial é uma projeção revisável, nunca inferior ao geral, e só é revisado depois de pelo menos 450 minutos avaliados na temporada. Por desempenho, os limites por temporada são +4/−4 de geral e +3/−4 de potencial. São parâmetros de jogo, não estatísticas reais. Frações de progresso sobrevivem ao salvamento e à mudança de temporada, mas os limites e a amostra mínima são renovados; não se acumulam vários pontos bloqueados atrás de um teto.

No encerramento da temporada, o envelhecimento ocorre uma única vez e pode reduzir geral e potencial, além das oscilações por desempenho. O desgaste começa após 31 anos para jogadores de linha, 33 para zagueiros/volantes e 35 para goleiros. Acumula de 0,95 a 4 pontos anuais conforme a idade; apenas pontos inteiros são aplicados, mantendo a fração para a próxima temporada. Boas atuações podem compensar parte do declínio. O desgaste também alcança reservas e jogadores sem clube. Valores de mercado acompanham os atributos atualizados; salários e contratos não são renegociados automaticamente.

Em **Elenco**, cada jogador mostra a variação de geral e potencial desde o início da avaliação na temporada. Goleiros e defensores também exibem jogos sem sofrer gols e gols sofridos enquanto estiveram em campo; goleiros mostram defesas e defesas de pênalti. Carreiras antigas mantêm seus atributos, caixa e histórico: os novos indicadores começam nas próximas partidas avaliadas, sem inventar atuações ou recalcular retroativamente o passado.
