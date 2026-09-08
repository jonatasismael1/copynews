import assert from "node:assert/strict";
import test from "node:test";
import { selectSourceOcrFrames, selectTemporalHeadline } from "./local-ocr.mjs";

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

test("deduplica duas leituras sobrepostas do mesmo título", () => {
  const frame = [
    line('"Aqui não cold Sém', 700, 94, 42),
    line('“Aqui não cola sem autorização”: Adesivo de JHC é colado por cima de Renanzinho após autorização do morador', 700, 91, 42),
  ];
  const title = selectTemporalHeadline([frame, frame, frame])
    .map((item) => item.text)
    .join(" ");
  assert.equal(title, '“Aqui não cola sem autorização”: Adesivo de JHC é colado por cima de Renanzinho após autorização do morador');
});

test("não confunde fragmento curto persistente com a manchete completa", () => {
  const fixedHeadline = [
    line("TNT Sports Brasil", 80, 92, 24),
    line("Samu Lino", 130, 91, 28),
    line("Samu Lino voando e não tem", 130, 94, 34),
    line("como esquecer desse momento", 174, 94, 34),
    line("absurdo com a Tati", 218, 94, 34),
  ];
  const frames = [
    fixedHeadline,
    fixedHeadline,
    fixedHeadline,
    fixedHeadline,
    [...fixedHeadline, line("Lança um espanhol do nada", 820, 97, 42)],
  ];

  const title = selectTemporalHeadline(frames).map((item) => item.text).join(" ");
  assert.equal(title.includes("Samu Lino voando e não tem"), true);
  assert.equal(title.includes("como esquecer desse momento"), true);
  assert.equal(title.includes("Lança um espanhol"), false);
});

test("remove a assinatura pequena acima de uma manchete persistente", () => {
  const frame = [
    line("TNT Sports Brasil", 80, 92, 24),
    line("Samu Lino voando e não tem", 130, 94, 34),
    line("como esquecer desse momento", 174, 94, 34),
    line("absurdo com a Tati KKKKKKKKK", 218, 94, 34),
  ];

  const title = selectTemporalHeadline([frame, frame, frame, frame, frame])
    .map((item) => item.text)
    .join(" ");
  assert.equal(title.includes("TNT Sports Brasil"), false);
  assert.equal(
    title,
    "Samu Lino voando e não tem como esquecer desse momento absurdo com a Tati KKKKKKKKK",
  );
});

test("remove uma chamada promocional pequena abaixo da manchete", () => {
  const frame = [
    line("Lindbergh critica ato na Paulista", 700, 94, 52),
    line("e acusa manifestantes de aliança", 764, 94, 52),
    line("com Trump", 828, 94, 52),
    line("Fique informado em T82.com.br", 910, 93, 24),
  ];

  const title = selectTemporalHeadline([frame, frame, frame])
    .map((item) => item.text)
    .join(" ");
  assert.equal(
    title,
    "Lindbergh critica ato na Paulista e acusa manifestantes de aliança com Trump",
  );
});

test("usa somente a capa no OCR de carrossel e mantém a janela do vídeo", () => {
  const paths = ["capa.jpg", "documento-1.jpg", "documento-2.jpg"];
  assert.deepEqual(selectSourceOcrFrames(paths, false), ["capa.jpg"]);
  assert.deepEqual(selectSourceOcrFrames(paths, true), paths);
});
