import assert from "node:assert/strict";
import test from "node:test";
import { alignHeadlineWithCaption, deriveHeadlineFromCaption, isLikelyBrandOnlyTitle, recoverBrandOnlyHeadline } from "./caption-headline.mjs";
import { normalizeHeadlineCase } from "./openrouter.mjs";

const caption = "Um trágico acidente tirou a vida de Valdeci Domingos Gomes, na Avenida Fernando Corrêa da Costa, em Cuiabá. Ele atravessava a via quando foi atingido por uma motocicleta Honda XRE. @caboeteiros24h #caboeteiros #viral";

test("descarta marca isolada que não pertence ao texto jornalístico", () => {
  assert.equal(isLikelyBrandOnlyTitle("Caboeteiros 24h", caption), true);
  assert.equal(isLikelyBrandOnlyTitle("Homem morre após ser atropelado", caption), false);
});

test("produz fallback factual sem IA quando o vídeo restrito só fornece a capa", () => {
  assert.equal(
    deriveHeadlineFromCaption(caption),
    "Homem morre após ser atropelado por motocicleta em Fernando Corrêa",
  );
});

test("substitui o título de marca já na etapa de metadados", () => {
  assert.equal(
    recoverBrandOnlyHeadline("Caboeteiros 24h", caption),
    "Homem morre após ser atropelado por motocicleta em Fernando Corrêa",
  );
});

test("corrige OCR cursivo quando a mesma frase existe na legenda", () => {
  const source = "Assim como ela, talvez, você só precisa escolher se curar. Às vezes, você não deixou de acreditar no amor.";
  assert.equal(
    alignHeadlineWithCaption("Aspim como ela talvez você nó precina encolhen ae curar", source),
    "Assim como ela talvez você só precisa escolher se curar.",
  );
});

test("completa o final visual truncado quando ele aparece literalmente na legenda", () => {
  const source = "Assim como ela, talvez, você só precisa escolher se curar. Às vezes, você não deixou de acreditar no amor.";
  assert.equal(
    alignHeadlineWithCaption("Aspim como ela, talvez, você nó precina encolhen", source),
    "Assim como ela talvez você só precisa escolher se curar.",
  );
});

test("não troca manchete por trecho apenas vagamente relacionado da legenda", () => {
  assert.equal(
    alignHeadlineWithCaption("A mãe tenta vender e a filha mostra o cu", "Vendas online, amostras e muitos mais. Continua a novela destas duas."),
    "A mãe tenta vender e a filha mostra o cu",
  );
});

test("deriva manchete factual de incêndio sem IA", () => {
  assert.equal(
    deriveHeadlineFromCaption("Uma oficina de conserto de eletrodomésticos pegou fogo na tarde desta quarta-feira, em Arapiraca."),
    "Incêndio atinge oficina de conserto de eletrodomésticos em Arapiraca",
  );
});

test("recupera ponto turístico pela legenda e remove duplicação do OCR", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Novo ponto turisti co novo ponto turistico na av Ceci Cunha",
      "Já viram o novo ponto turístico da Av. Ceci Cunha? Eu sempre vou tirar essa piada.",
    ),
    "Novo ponto turístico na Av. Ceci Cunha",
  );
});

test("corrige mãe e junta palavra separada pelo OCR", () => {
  assert.equal(
    alignHeadlineWithCaption("A mae tenta vender e a filha mostra o c u😂", "Vendas online, amostras e muitos mais."),
    "A mãe tenta vender e a filha mostra o cu😂",
  );
});

test("completa prévia cortada somente com fatos presentes na legenda", () => {
  const source = "Catty Lares apareceu com roupas masculinas e cabelo cortado. No batismo em uma igreja evangélica recebeu o novo nome Carlos Emanuel.";
  assert.equal(
    alignHeadlineWithCaption("Catty Lares oficialment -mulher trans e aparece nasculino e sendo chama após se converter em ig", source),
    "Catty Lares oficialmente é uma ex-mulher trans e aparece com visual masculino e sendo chamado de Emanuel após se converter em igreja evangélica",
  );
});

test("remove leitura duplicada no início e preserva a manchete completa", () => {
  const source = "Um morador autorizou a colocação de um adesivo de JHC. A frase aqui não cola sem autorização chamou atenção. O adesivo foi colocado por cima do material de Renanzinho.";
  assert.equal(
    alignHeadlineWithCaption(
      '"Aqui não cold Sém “Aqui não cola Sem autorização”: Adesivo de JHC é colado por cima de Renanzinho após autorização do morador',
      source,
    ),
    '“Aqui não cola sem autorização”: Adesivo de JHC é colado por cima de Renanzinho após autorização do morador',
  );
});

test("remove cabeçalho social corrompido sem cortar a manchete", () => {
  const source = "A Polícia Federal (PF) deflagrou a Operação Faces Expostas contra um grupo suspeito de aplicar fraudes contra a Caixa Econômica Federal em Alagoas.";
  assert.equal(
    alignHeadlineWithCaption(
      "Fi (C)eraDIOsAMPAIOOFICIAL BR Fi (O)@RADIOSAMPAIOOFICIAL Polícia Federal deflagra operação contra fraude milionária e prende três suspeitos de golpes contra a Caixa em Alagoas",
      source,
    ),
    "Polícia Federal deflagra operação contra fraude milionária e prende três suspeitos de golpes contra a Caixa em Alagoas",
  );
});

test("remove repetições contíguas sem alterar o restante do texto", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Cicatriz não Cicatriz não sinal de derrota sinal de derrota comprovante de que comprovante de que você tentou",
      "Algumas cicatrizes não precisam ser escondidas: são comprovante de que você tentou.",
    ),
    "Cicatriz não sinal de derrota comprovante de que você tentou",
  );
});

test("separa palavras fundidas quando a sequência existe na legenda", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Aqui nao colasem autorização",
      "A frase aqui não cola sem autorização chamou atenção.",
    ),
    "Aqui não cola sem autorização",
  );
});

test("recupera o verbo curto omitido quando a legenda confirma a voz passiva", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "“Aqui não cola sem autorização”: Adesivo de JHC colado por cima de Renanzinho após autorização do morador",
      "A nova propaganda foi colocada por cima de um adesivo de Renanzinho.",
    ),
    "“Aqui não cola sem autorização”: Adesivo de JHC é colado por cima de Renanzinho após autorização do morador",
  );
});

test("preserva o verbo é quando a legenda também contém a conjunção e", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Trabalhador salva menina de atropelamento em segundos e é recompensado",
      "Um trabalhador evitou o atropelamento e depois foi recompensado.",
    ),
    "Trabalhador salva menina de atropelamento em segundos e é recompensado",
  );
});

test("corrige dígitos confundidos com letras usando a legenda como dicionário", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Homem com mandado de pris40 por pensão alimentícia d3tido em Palmeira dos Índios",
      "A polícia cumpriu um mandado de prisão por pensão alimentícia em Palmeira dos Índios.",
    ),
    "Homem com mandado de prisão por pensão alimentícia detido em Palmeira dos Índios",
  );
});

test("remove chamada promocional acrescentada ao fim do título", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "André Mendonça dá o troco ao jogo sujo do qual é vítima, afirma Mario Sabino veja mais no",
      "André Mendonça dá o troco ao jogo sujo do qual é vítima, afirma Mario Sabino. Veja mais no YouTube.",
    ),
    "André Mendonça dá o troco ao jogo sujo do qual é vítima afirma Mario Sabino",
  );
});

test("remove uma marca curta antes da manchete ancorada pela legenda", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "INT TNT Sports Brasil Samu Lino voando e nao tem como esquecer desse momento absurdo com a Tati",
      "O dia em que Samu Lino e @tatimantovani nos proporcionaram essa entrevista.",
    ),
    "Samu Lino voando e não tem como esquecer desse momento absurdo com a Tati",
  );
});

test("remove fragmento ilegível no fim quando a legenda confirma a manchete", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Vamos passar a bota na corrupgao, diz menina da bota ao falar sobre candidatura Palme ra nel eb",
      "A Menina da Bota falou sobre uma possível candidatura e disse que vai passar a bota na corrupção.",
    ),
    "Vamos passar a bota na corrupção, diz menina da bota ao falar sobre candidatura",
  );
});

test("restaura a abertura de uma citação atribuída", () => {
  assert.equal(
    alignHeadlineWithCaption(
      'Vamos passar a bota na corrupção", diz menina da bota ao falar sobre candidatura',
      "A Menina da Bota disse que vai passar a bota na corrupção ao falar sobre candidatura.",
    ),
    '“Vamos passar a bota na corrupção”, diz menina da bota ao falar sobre candidatura',
  );
});

test("junta palavra antes de remover uma leitura repetida", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Lindbergh critica ato na Paulista e acusa Paulistae acusa manifestantes de aliança com Trump",
      "Lindbergh Farias criticou o ato na Paulista e acusa os manifestantes de aliança com Trump.",
    ),
    "Lindbergh critica ato na Paulista e acusa manifestantes de aliança com Trump",
  );
});

test("remove segunda leitura parcialmente fundida sem perder o complemento", () => {
  assert.equal(
    alignHeadlineWithCaption(
      '"NAO CUIDA NEM DA CIDADE DELE, IMAGINA DOS OUTROS" Ouvinte desabafa e mostra Ouvinte desabafae abandono em Murici',
      'Um ouvinte de Murici mostrou uma ponte abandonada. "Se não cuida nem da cidade dele, imagina das outras", desabafou o morador.',
    ),
    '"Não CUIDA NEM da CIDADE DELE, IMAGINA DOS OUTROS" Ouvinte desabafa e mostra abandono em Murici',
  );
});

test("recupera o objeto perdido entre duas leituras sobrepostas", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Lindbergh critica ato na Paulista e acusa Paulistae acusa com Trump",
      "Lindbergh criticou a manifestação na Avenida Paulista e afirmou que o ato representa uma aliança com Trump.",
    ),
    "Lindbergh critica ato na Paulista e acusa manifestantes de aliança com Trump",
  );
});

test("usa a legenda factual quando a capa social vence a manchete do carrossel", () => {
  const source = "O Tribunal Regional Eleitoral de Alagoas (TRE-AL) determinou a retirada de um vídeo de Paulo Dantas contra JHC por irregularidade no impulsionamento.";
  assert.equal(
    alignHeadlineWithCaption(
      "paulodantasalagoas Seguir paulodantasalagoas Mentira não apaga resultado Hoje temos mais policiais",
      source,
    ),
    "Justiça vê irregularidade e manda retirar vídeo impulsionado por Paulo Dantas contra JHC",
  );
});

test("restaura o marcador de moeda confirmado pela legenda", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Mulher cobra cirurgia de 319 mil",
      "A mulher cobra do Estado uma cirurgia de R$ 319 mil.",
    ),
    "Mulher cobra cirurgia de R$ 319 mil",
  );
});

test("restaura moeda quando a legenda possui centavos e a arte usa valor arredondado", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "Mulher cobra cirurgia de 319 mil",
      "A mulher cobra do Estado uma cirurgia sem sentir dor. No processo, o valor foi fixado em R$ 319,4 mil.",
    ),
    "Mulher cobra cirurgia de R$ 319 mil",
  );
});

test("corrige copula sem acento em chamada de condenação", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "União Polêmico e condenado novamente por atacar candidato JHC multa de 15 mil",
      "O União Polêmico foi condenado novamente por atacar o candidato JHC e recebeu multa de 15 mil.",
    ),
    "União Polêmico é condenado novamente por atacar candidato JHC; multa de 15 mil",
  );
});

test("corrige nome antes de remover o começo repetido", () => {
  assert.equal(
    alignHeadlineWithCaption(
      "André Mendonça dá o André Mendonga dá troco ao jogo sujo do qual é vítima, afirma Mario Sabino ista ao vivo",
      "André Mendonça dá o troco ao jogo sujo do qual é vítima, afirma Mario Sabino.",
    ),
    "André Mendonça dá o troco ao jogo sujo do qual é vítima afirma Mario Sabino",
  );
});

test("reconstrói duas leituras temporais sobrepostas usando a legenda", () => {
  const source = "Um homem sofreu uma crise de asma e precisou de atendimento médico na tarde desta terça-feira (8), no Centro de Maceió. O Serviço de Atendimento Móvel de Urgência (Samu) foi acionado para prestar socorro, com apoio da Polícia Militar de Alagoas (PM-AL).";
  assert.equal(
    alignHeadlineWithCaption(
      "Homem passa mal no Hom passa mal no entro de Maceió e recebe socorro do e recebe soco Samu e da PM",
      source,
    ),
    "Homem passa mal no Centro de Maceió e recebe socorro do Samu e da PM",
  );
});

test("remove sobreposição parcial e completa local confirmado pela legenda", () => {
  const source = "Uma motocicleta que havia sido roubada foi localizada na noite desta terça-feira (8), na Barra de Santo Antônio. O veículo estava escondido em uma área de canavial.";
  const aligned = alignHeadlineWithCaption(
    "MOTOCICLETA ROUBADA ENCONTRADA E UBADA ENCONTRA EM CANAVIAL NA BARRA DE SANTO ae TAN AY",
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Motocicleta roubada é encontrada em canavial na Barra de Santo Antônio",
  );
});

test("preserva título correto de incêndio sem expandir pela legenda", () => {
  const title = "Homem socorrido após incêndio atingir casa no bairro Ponta Grossa, em Maceió";
  const source = "Um homem foi socorrido após um incêndio atingir uma residência no bairro Ponta Grossa, em Maceió.";
  assert.equal(alignHeadlineWithCaption(title, source), title);
});

test("preserva título correto de homicídio usado como controle", () => {
  const title = "Câmeras registram chegada de suspeitos antes de homicídio em Arapiraca";
  const source = `${title}\n\nCâmeras de videomonitoramento registraram a movimentação dos suspeitos envolvidos no homicídio de João Vitor, em Arapiraca.`;
  assert.equal(alignHeadlineWithCaption(title, source), title);
  assert.equal(alignHeadlineWithCaption(`${title}\n\nCâmeras`, source), title);
});

test("reconstrói título muito fragmentado com fatos confirmados pela legenda", () => {
  const source = "Após ser colocado em liberdade depois de passar por audiência de custódia, o jovem de 23 anos, que confessou ter executado Fagner Jean dos Santos, voltou a ser preso novamente, desta vez por tentativa de homicídio em Santana do Ipanema, Sertão de Alagoas. De acordo com informações apuradas, o suspeito tentou matar a própria tia com uma chave de fenda.";
  assert.equal(
    alignHeadlineWithCaption(
      "Após ser colocado em liberdade por a Apos ser colocado o per gt icidi em volta a e Pes tia em Santana do Ipanema Be tentar matar atiaem do Ipanema",
      source,
    ),
    "Jovem volta a ser preso após tentar matar a própria tia em Santana do Ipanema",
  );
});

test("remove palavra longa repetida e restaura fragmentos confirmados pela legenda", () => {
  const source = "Esse é um dos mitos que mais escuto no consultório. Anticoncepcional não precisa de pausa para o corpo descansar.";
  assert.equal(
    alignHeadlineWithCaption(
      "eu pudesse apagar ima MENTIRA obre TICONCEPCIONA TICONCEPC seria essa",
      source,
    ),
    "Se eu pudesse apagar uma MENTIRA sobre ANTICONCEPCIONAL seria essa",
  );
});

test("recupera o sujeito perdido de uma manchete sobre captura de animal", () => {
  const source = "Uma cobra foi avistada e capturada na região do Bosque das Arapiracas. A ação chamou atenção pelo tamanho do animal.";
  assert.equal(
    alignHeadlineWithCaption(
      "TURADA NO BOSQUE DAS OBRA CAPTURADA NO BOSQUE DAS ARAPIRACAS; AMANHO IMPRESSIONA",
      source,
    ),
    "Cobra capturada no Bosque das Arapiracas; tamanho impressiona",
  );
});

test("reconstrói chamada rural com municípios preservados pelo OCR", () => {
  const source = "O povo sertanejo pede socorro. A verdadeira realidade da zona rural é a falta de água nas torneiras.";
  assert.equal(
    alignHeadlineWithCaption(
      "Essa de toda zona rural dejOlho zona ruralide Olho D'Agua; Olivença; Monteiropolis,",
      source,
    ),
    "Essa é a realidade da zona rural de Olho d'Água, Olivença e Monteirópolis",
  );
});

test("preserva sufixo visual curto ausente da legenda", () => {
  const source = "Em campanha pela zona rural de Palmeira dos Índios, Júlio Cezar se revoltou com moradores por não abrirem as portas de suas casas para ele.";
  assert.equal(
    alignHeadlineWithCaption(
      "Júlio Cezar se revolta com população da zona rural por não abrirem as portas para recebê-lo",
      source,
    ),
    "Júlio Cezar se revolta com população da zona rural por não abrirem as portas para recebê-lo",
  );
});

test("preserva e corrige linha curta final confirmada pelo contexto", () => {
  const source = "Gkay chamou a atenção dos seguidores em um vídeo. A influenciadora explicou que a tremedeira era efeito colateral do tratamento contra a depressão.";
  const aligned = alignHeadlineWithCaption(
    "GKAY FALA DE TRATAMENTO CONTRA DEPRESSÃO APÓS VIDEO CHAMAR ATENÇÃO DE FAS",
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Gkay fala de tratamento contra depressão após vídeo chamar atenção de fãs",
  );
});

test("remove prefixo longo de ruído quando a manchete restante é confirmada", () => {
  const source = "CONFUSÃO APÓS CRB X SPORT: POLÍCIA INTERVÉM NAS ARQUIBANCADAS DO REI PELÉ. A partida terminou em momentos de tensão.";
  const aligned = alignHeadlineWithCaption(
    "TRE a VIGO pero E et E E Bias Gia Gwe CONFUSÃO APÓS CRB SPORT: POLÍCIA INTERVÉM NAS ARQUIBANCADAS DO REI PELÉ.",
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Confusão após CRB x sport polícia intervém nas arquibancadas do rei pelé.",
  );
});

test("remove primeira leitura corrompida de um prefixo repetido", () => {
  const source = "BADERNA NO REI PELÉ! Após a derrota do Sport para o CRB, torcedores tentaram invadir o setor e foram reprimidos pela Polícia Militar.";
  const aligned = alignHeadlineWithCaption(
    "BADERNA: toda DO SPORT BADERNA: TORCIDA DO SPORT TENTA INVADIR SETOR DO CRB E E REPRIMIDA PELA PM NO REI PELE APOS DERROTA",
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Baderna: torcida do sport tenta invadir setor do CRB é reprimida pela PM no rei pelé após derrota",
  );
});

test("completa somente a palavra visual ausente depois de preposição pendente", () => {
  const source = "A carreata na zona rural de Palmeira dos Índios gerou comentários nas redes sociais e nos grupos de WhatsApp.";
  const aligned = alignHeadlineWithCaption(
    "CARREATA DE JÚLIO CEZAR NA ZONA RURAL DE PALMEIRA DOS ÍNDIOS GERA REPERCUSSÃO NAS",
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Carreata de júlio cezar na zona rural de Palmeira dos Índios gera repercussão nas redes",
  );
});

test("corrige primeira letra e confusão consonantal com evidência da legenda", () => {
  const source = "O candidato Júlio Cezar realizou uma carreata na zona rural de Palmeira dos Índios.";
  const aligned = alignHeadlineWithCaption(
    "PARREATA DE JÚLIO CEZAR NA ZONA RURAL DE PALMEIRA DOS ÍNDIOS GERA REPERGUSSÃO NAS REDES",
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Carreata de Júlio Cezar na zona rural de Palmeira dos Índios gera repercussão nas redes",
  );
});

test("remove aspas visual isolada sem afetar a expressão entre aspas", () => {
  const source =
    "Dra. Cíntia Maia questiona a cobrança por tratamento de esgoto fantasma em Pão de Açúcar.";
  const aligned = alignHeadlineWithCaption(
    'DRA. CÍNTIA MAIA QUESTIONA COBRANÇA POR TRATAMENTO DE ESGOTO “FANTASMA” EM PÃO DE AÇÚCAR”',
    source,
  );
  assert.equal(
    normalizeHeadlineCase(aligned, source),
    "Dra. Cíntia Maia questiona a cobrança por tratamento de esgoto fantasma em Pão de Açúcar",
  );
});
