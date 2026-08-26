import assert from "node:assert/strict";
import test from "node:test";
import { selectTemporalHeadline } from "./local-ocr.mjs";

const line = (text, y, confidence = 90, height = 42) => ({
  text,
  x: 40,
  y,
  height,
  confidence,
});

test("prioriza a manchete que aparece depois e ignora a marca persistente", () => {
  const frames = [
    [line("Caboeteiros 24h", 700)],
    [line("Caboeteiros 24h", 700), line("Acidente Cuiabá", 790), line("Homem morre após ser atropelado por motocicleta", 850), line("na Fernando Corrêa", 910)],
    [line("Caboeteiros 24h", 700), line("Acidente Cuiabá", 790), line("Homem morre após ser atropelado por motocicleta", 850), line("na Fernando Corrêa", 910)],
    [line("Caboeteiros 24h", 700)],
    [line("Caboeteiros 24h", 700)],
  ];
  const title = selectTemporalHeadline(frames).map((item) => item.text).join(" ");
  assert.equal(title.includes("Caboeteiros"), false);
  assert.equal(title.includes("Homem morre após ser atropelado por motocicleta"), true);
  assert.equal(title.includes("Fernando Corrêa"), true);
});

test("preserva todas as linhas curtas de uma manchete persistente", () => {
  const frame = [
    line("Ela confiou nele... Namorado trola", 700, 90, 42),
    line("Namorada e brincadeira termina em", 768, 90, 30),
    line("Quase tragédia: É um menino", 836, 90, 30),
    line("Noticiou Brasil", 976, 90, 42),
  ];
  const title = selectTemporalHeadline([frame, frame, frame, frame, frame])
    .map((item) => item.text)
    .join(" ");
  assert.equal(title.includes("Namorada e brincadeira termina em"), true);
  assert.equal(title.includes("Quase tragédia: É um menino"), true);
  assert.equal(title.includes("Noticiou Brasil"), false);
});

test("prefere a leitura completa mesmo quando a incompleta tem confiança maior", () => {
  const frame = [
    line("Ela confiou nele... Namorado trola", 700, 90, 42),
    line("Ela confiou namorado trola", 700, 96, 42),
    line("Namorada e brincadeira termina em", 768, 92, 30),
    line("Quase tragédia: É um menino", 836, 92, 30),
  ];
  const title = selectTemporalHeadline([frame, frame, frame])
    .map((item) => item.text)
    .join(" ");
  assert.equal(title.includes("confiou nele"), true);
});
