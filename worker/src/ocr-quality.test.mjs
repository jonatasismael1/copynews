import assert from "node:assert/strict";
import test from "node:test";
import {
  ocrRefinementReasons,
  selectVisionHeadline,
  shouldRefineOcrWithVision,
} from "./ocr-quality.mjs";

test("preserva OCR local confiável usado como controle", () => {
  const title = "Arsal e Polícia Militar tentam impedir equipe de militância de Marina JHC";
  const caption = "Duas vans da equipe de apoiadores de Marina JHC foram abordadas por policiais militares e agentes da Arsal.";
  assert.equal(
    shouldRefineOcrWithVision({ title, confidence: 0.95 }, caption),
    false,
  );
});

test("refina leitura local de baixa confiança", () => {
  assert.deepEqual(
    ocrRefinementReasons(
      { title: "Pe JHC reúne grande multidão qm em Maceió durante a Mia poets Caminhada", confidence: 0.823 },
      "JHC participa da Grande Caminhada da Mudança em Maceió.",
    ).includes("low_local_confidence"),
    true,
  );
});

test("refina valor monetário sem número mesmo com confiança alta", () => {
  const reasons = ocrRefinementReasons(
    { title: "Saúde de Alagoas gasta quase RS bilhões em ano marcado por operação da PF", confidence: 0.95 },
    "O orçamento atualizado chegou a R$ 5,93 bilhões.",
  );
  assert.ok(reasons.includes("missing_currency_amount"));
});

test("refina percentual perdido em comparação eleitoral", () => {
  const reasons = ocrRefinementReasons(
    { title: "JHC aparece mais de a frente de Renan Filho", confidence: 0.95 },
    "JHC tem 53,3% e Renan Filho tem 41,4% dos votos válidos.",
  );
  assert.ok(reasons.includes("missing_comparison_amount"));
});

test("refina trecho repetido mesmo com confiança alta", () => {
  const reasons = ocrRefinementReasons(
    { title: "Saúde em ano marcado por operação da marcado por operação da PF", confidence: 0.95 },
    "A saúde estadual foi alvo de operação da PF.",
  );
  assert.ok(reasons.includes("repeated_phrase"));
});

test("refina texto corrompido com pouco apoio da legenda", () => {
  const reasons = ocrRefinementReasons(
    { title: "cmafac ral ih Judas IMMUOLOS ou aye nala Palícia Hitar", confidence: 0.91 },
    "Duas motocicletas Honda Pop foram localizadas pela Polícia Militar em Arapiraca.",
  );
  assert.ok(reasons.includes("low_caption_agreement"));
});

test("não confunde editoria curta da visão com a manchete principal", () => {
  assert.equal(
    selectVisionHeadline({
      title: "ELEIÇÕES 2026",
      text: "ELEIÇÕES 2026\nFaltando apenas 10 dias para eleições, JHC aparece mais de 11% à frente de Renan Filho em disputa pelo Governo de Alagoas",
    }),
    "Faltando apenas 10 dias para eleições, JHC aparece mais de 11% à frente de Renan Filho em disputa pelo Governo de Alagoas",
  );
});

test("preserva título visual já identificado corretamente", () => {
  const title = "Saúde de Alagoas gasta quase R$ 6 bilhões em ano marcado por operação da PF";
  assert.equal(
    selectVisionHeadline({ title, text: `AUMENTO DE 287,8%\n${title}\nFRANCÊS NEWS` }),
    title,
  );
});
