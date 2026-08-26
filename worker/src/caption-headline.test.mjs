import assert from "node:assert/strict";
import test from "node:test";
import { deriveHeadlineFromCaption, isLikelyBrandOnlyTitle, recoverBrandOnlyHeadline } from "./caption-headline.mjs";

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
