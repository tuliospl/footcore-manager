# Importar times e jogadores no Footcore

Abra **Base de dados → Importar times CSV** e selecione um ou vários arquivos. Cada arquivo representa um clube. Os arquivos ficam na sua máquina: o jogo lê os dados no navegador e guarda a biblioteca localmente.

Use `aurora.csv` e `serra.csv` desta pasta como modelos completos. São clubes e jogadores fictícios. Abra no Excel, LibreOffice ou editor de texto, use **ponto e vírgula** como separador e salve como **CSV UTF-8**. Não inclua uma linha de cabeçalhos. UTF-8 com BOM também é aceito; arquivos Windows-1252 são convertidos com um aviso para conferir acentos.

## Primeira linha: clube

```text
Nome;País;Força;Estádio;Técnico;País do técnico;Cor de fundo;Cor do texto;Capacidade
Aurora FC;BRA;65;Arena da Aurora;Técnico de exemplo;BRA;FFD43B;151B2B;15000
```

A linha acima com os nomes das colunas é apenas explicativa: no arquivo, comece diretamente com `Aurora FC`.

- Nome: obrigatório, até 80 caracteres.
- País e país do técnico: três letras maiúsculas; padrão BRA (técnico usa o país do clube).
- Força: inteiro de 1 a 99; padrão 65. Usada para estimar o geral quando o jogador não o informa. Não tentamos reproduzir a escala de força do jogo de origem.
- Estádio: padrão `Estádio [nome do clube]`.
- Técnico: opcional, guardado como referência.
- Cores: seis dígitos hexadecimais, com ou sem `#`; padrão verde e branco.
- Capacidade: inteiro de 1.000 a 200.000, sem separador de milhares; padrão 15000.
- Uma décima coluna legada é tolerada, mas ignorada com aviso. Não usamos esse dado para atribuir uma divisão.

A sigla do time é gerada a partir das primeiras três letras/números do nome. Cada nova carreira começa com R$ 6 milhões por clube e ingresso de R$ 32.

## Linhas seguintes: um jogador por linha

As dez primeiras colunas seguem a estrutura da referência fornecida. As quatro últimas são extensões do Footcore e podem ficar vazias.

```text
Nome;Posição;País;Estrela;Idade;Pé;Titular;Técnica;Física/Mental;Extra;Geral;Potencial;Salário;Valor
João Exemplo;A;BRA;S;23;D;S;Fin;Vel;6;76;84;10400;2800000
```

Não copie a linha dos nomes das colunas para o CSV. Nome e posição são obrigatórios em cada linha de jogador.

| Coluna | Valores |
| --- | --- |
| Posição | G/GK/GOL → GOL; L/FB/LAT → LAT; Z/CB/ZAG → ZAG; V/DM/VOL → VOL; M/MF/MC/MEI → MC; P/WG/A/FW/ATA → ATA |
| País | Três letras; padrão: país do clube |
| Estrela / Titular | S ou Y para sim; N para não; vazio equivale a não |
| Idade | 16 a 50; se vazia, 24 com aviso |
| Pé | D/R: direito; E/L: esquerdo; A/B: ambos; padrão D |
| Técnica / Física-Mental | Siglas de referência, por exemplo Fin / Vel; opcionais, até 20 caracteres |
| Extra | 0 a 7; padrão 0 |
| Geral | 1 a 99; se vazio, escala global por força do clube, contexto do país, idade e papel no elenco; algumas referências individuais têm notas revisadas pelo Footcore |
| Potencial | Do geral até 99; se estimado, margem por idade com teto 93 (95 para referências revisadas); com geral explícito, +6 até 23 anos e zero acima disso, limitado a 99 |
| Salário | Reais por rodada, inteiro de 0 a 10000000000, sem R$ ou separadores |
| Valor | Valor de mercado em reais, inteiro de 0 a 10000000000 |

Salário e valor vazios são calculados pelas regras do jogo. Geral e potencial estimados são uma adaptação nossa; revise os valores na prévia. Pontas viram ATA com aviso porque o motor ainda não distingue essa posição. País, técnico, pé e características ficam guardados como referência; ainda não geram habilidades na simulação. Estrela/titularidade só participam da estimativa quando o geral está vazio. A escalação continua sendo escolhida pelas posições e pelo geral.

Nomes com ponto e vírgula ou aspas devem ser delimitados por aspas duplas, duplicando aspas internas: `"João ""Canhoto"" Silva"`. Evite quebras de linha dentro dos nomes.

## Conferir e começar

1. Importe até 20 CSVs por vez (até 256 KB cada). A biblioteca comporta 20 clubes.
2. Confira os avisos por arquivo e use **Ver elenco**. Um arquivo inválido não entra; os demais arquivos válidos são importados.
3. Cada clube precisa de 14 a 40 jogadores, pelo menos um goleiro e dez atletas de linha. Elencos incompletos devem ser preenchidos na planilha antes de importar; não criamos jogadores fictícios automaticamente.
4. Marque um número par de clubes, entre 2 e 20. Escolha seu time e clique em **Iniciar carreira com estes times**. O jogo cria turno e returno e zera as estatísticas.
5. A carreira anterior fica em **Base de dados → Restaurar carreira anterior**. Uma restauração troca as duas carreiras. Há uma única cópia anterior por navegador; uma nova importação iniciada substitui essa cópia. Se não houver espaço para salvar, a troca é interrompida.

Clubes com mesmo nome e país são tratados como duplicados. Para corrigir um CSV, remova o clube da biblioteca e importe a revisão. Remover da biblioteca não altera a carreira em andamento. O botão **CSV ↓** exporta o cadastro da biblioteca com os atributos explícitos; ele não é um backup do progresso.

Não há jogadores sem clube no início de uma carreira CSV. O mercado contém os jogadores dos clubes participantes; a geração de atletas sem clube nas temporadas seguintes segue as regras existentes do jogo.

## Limites desta versão

O pacote `.m26` enviado já foi convertido: em **Base de dados → Explorar times convertidos**, filtre por país ou nome, marque os times e adicione-os à biblioteca. São 559 clubes, 15.400 registros de jogadores e 559 escudos, sem substituir sua carreira automaticamente. Os CSVs estão em `data/m26/times/` e o relatório de conversão em `data/m26/conversion-report.json`.

O leitor Python interpreta os arquivos como dados, sem executar classes Java. Para reconverter esse mesmo esquema de arquivos, execute `python3 scripts/convert_m26.py`. Outros esquemas binários são rejeitados em vez de tentar adivinhar seus campos. O seletor de arquivos do navegador continua recebendo CSVs; ele não lê diretamente novos arquivos `.m26`.

Os escudos recuperados são aplicados aos clubes adicionados pelo catálogo. Exportar apenas o CSV não inclui o escudo. Camisas, campos e fotos de estádios permanecem nos arquivos originais; não são usados na interface nesta versão. A carreira mundial organiza os clubes em divisões e calendários por país. A biblioteca CSV monta uma liga personalizada. Os elencos refletem o conteúdo do pacote, sem conferência contra transferências atuais. Geral, potencial, salário e valor são estimativas do Footcore, não dados individuais recuperados do `.m26`.
