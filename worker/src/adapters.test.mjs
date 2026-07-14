import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireMedia,
  extractMetadata,
  parseInstagramMetadata,
} from "./adapters.mjs";

test("Cobalt rejeita resposta sem mídia", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({ status: "error", error: { code: "blocked" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  await assert.rejects(
    () =>
      acquireMedia("https://example.com", {
        cobaltUrl: "https://cobalt.test",
      }),
    /blocked/,
  );
  global.fetch = original;
});

test("normaliza a origem de túnel da Railway", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "tunnel",
        url: "https://old-host.up.railway.app/tunnel?id=abc",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const result = await acquireMedia("https://example.com", {
    cobaltUrl: "https://current.up.railway.app/",
  });
  assert.equal(
    result.mediaUrl,
    "https://current.up.railway.app/tunnel?id=abc",
  );
  global.fetch = original;
});

test("preserva todos os itens de um carrossel", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "picker",
        picker: [
          { type: "photo", url: "https://cdn.test/1.jpg" },
          { type: "video", url: "https://cdn.test/2.mp4" },
          { type: "photo", url: "https://cdn.test/3.jpg" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const result = await acquireMedia("https://instagram.com/p/carousel", {
      cobaltUrl: "https://cobalt.test",
    });
    assert.equal(result.mediaItems.length, 3);
    assert.deepEqual(
      result.mediaItems.map((item) => item.type),
      ["photo", "video", "photo"],
    );
  } finally {
    global.fetch = original;
  }
});

test("extrai a legenda completa e o autor dos metadados do Instagram", () => {
  const html = `<meta name="description" content="3 likes - francesfmarapiraca no July 13, 2026: &quot;Um carro foi atingido por um inc&#xea;ndio. Ningu&#xe9;m ficou ferido. &#x1f4f9; Reprodu&#xe7;&#xe3;o&quot;. " /><meta property="og:title" content="Franc&#xea;s FM | Arapiraca no Instagram: &quot;Um carro foi atingido por um inc&#xea;ndio. Ningu&#xe9;m ficou ferido. &#x1f4f9; Reprodu&#xe7;&#xe3;o&quot;" /><meta name="twitter:title" content="Franc&#xea;s FM | Arapiraca (&#064;francesfmarapiraca) &#x2022; Reel do Instagram" />`;
  assert.deepEqual(parseInstagramMetadata(html), {
    caption:
      "Um carro foi atingido por um incêndio. Ninguém ficou ferido. 📹 Reprodução",
    author: "francesfmarapiraca",
    provider: "instagram-meta",
  });
});

test("consulta a página pública móvel do Reel em vez do embed vazio", async () => {
  const original = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(
      '<meta property="og:title" content="Portal no Instagram: &quot;Legenda completa da publicação&quot;" />',
      { status: 200 },
    );
  };
  try {
    const result = await extractMetadata(
      "https://www.instagram.com/reel/DavpwruN_4A/?utm_source=test",
    );
    assert.equal(result.caption, "Legenda completa da publicação");
    assert.match(request.url, /\/reel\/DavpwruN_4A\/\?__a=1$/);
    assert.match(request.options.headers["User-Agent"], /Instagram/);
  } finally {
    global.fetch = original;
  }
});
