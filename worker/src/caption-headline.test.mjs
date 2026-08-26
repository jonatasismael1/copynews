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
