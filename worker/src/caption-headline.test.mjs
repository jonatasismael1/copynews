import assert from "node:assert/strict";
import test from "node:test";
import { alignHeadlineWithCaption, deriveHeadlineFromCaption, isLikelyBrandOnlyTitle, recoverBrandOnlyHeadline } from "./caption-headline.mjs";

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
