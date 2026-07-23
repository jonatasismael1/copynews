import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireMedia,
  extractMetadata,
  isInstagramReelUrl,
  isYouTubeUrl,
  isVideoMediaItem,
  selectDownloadableMedia,
  parseArticleMetadata,
  parseInstagramEmbedImage,
  parseInstagramMetadata,
} from "./adapters.mjs";

test("identifica links do YouTube sem confundir outros domínios", () => {
  assert.equal(isYouTubeUrl("https://youtu.be/abc123"), true);
  assert.equal(isYouTubeUrl("https://www.youtube.com/watch?v=abc123"), true);
  assert.equal(isYouTubeUrl("https://youtube.example/watch?v=abc123"), false);
});

test("usa o oEmbed do YouTube sem classificar o vídeo como matéria estática", async () => {
  const original = global.fetch;
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(
      JSON.stringify({
        title: "Defesa Civil interdita ponte",
        author_name: "Portal Local",
        thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await extractMetadata(
      "https://www.youtube.com/watch?v=abc123",
    );
    assert.match(requestedUrl, /youtube\.com\/oembed/);
    assert.equal(result.provider, "youtube-oembed");
    assert.equal(result.title, "Defesa Civil interdita ponte");
    assert.equal(result.mediaItems[0].auditOnly, true);
  } finally {
    global.fetch = original;
  }
});

test("identifica Reel e não confunde a capa JPG com o vídeo", () => {
  assert.equal(isInstagramReelUrl("https://www.instagram.com/reel/Da2vzBfSyxk/"), true);
  assert.equal(isInstagramReelUrl("https://www.instagram.com/p/Da03fX7lJrc/"), false);
  assert.equal(
    isVideoMediaItem({ type: "unknown", filename: "instagram_Da2vzBfSyxk.jpg" }),
    false,
  );
  assert.equal(
    isVideoMediaItem({ type: "unknown", filename: "instagram_Da2vzBfSyxk.mp4" }),
    true,
  );
  assert.equal(
    selectDownloadableMedia([
      { filename: "capa.jpg", auditOnly: true },
      { filename: "reel.mp4", auditOnly: false },
    ]).filename,
    "reel.mp4",
  );
  assert.equal(
    selectDownloadableMedia([{ filename: "capa.jpg", auditOnly: true }]),
    undefined,
  );
});

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

test("prefere a imagem vertical completa do embed à prévia quadrada", () => {
  const cropped =
    "https://scontent.test/post.jpg?stp=c0.114.1440.1440a_dst-jpg_e35_s640x640_tt6&amp;oh=crop";
  const full =
    "https://scontent.test/post.jpg?stp=dst-jpg_e35_tt6\\u0026oh=full";
  assert.equal(
    parseInstagramEmbedImage(`{\"thumbnail\":\"${cropped}\",\"display_url\":\"${full}\"}`),
    "https://scontent.test/post.jpg?stp=dst-jpg_e35_tt6&oh=full",
  );
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

test("extrai o texto, a data e a imagem de uma matéria", () => {
  const html = `<meta property="og:title" content="TRE rejeita pedido" />
    <meta property="og:description" content="Decisão preserva reportagens" />
    <meta property="og:image" content="https://cdn.test/capa.jpg" />
    <article><time datetime="2026-07-13 15:36"></time><main class="news-internal-text">
      <p>Primeiro fato confirmado.</p><p>Segundo fato confirmado.</p>
    </main></article>`;
  const result = parseArticleMetadata(html, "https://jornal.test/materia");
  assert.equal(result.title, "TRE rejeita pedido");
  assert.equal(result.caption, "Decisão preserva reportagens");
  assert.match(result.articleBody, /Primeiro fato confirmado/);
  assert.match(result.articleBody, /Segundo fato confirmado/);
  assert.equal(result.publishedAt, "2026-07-13 15:36");
  assert.equal(result.mediaItems[0].url, "https://cdn.test/capa.jpg");
  assert.equal(result.provider, "web-article");
});

test("consulta a página pública móvel do Reel em vez do embed vazio", async () => {
  const original = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/embed/"))
      return new Response(
        '{"display_url":"https:\\/\\/scontent.test\\/original.jpg?stp=dst-jpg_e35_tt6\\u0026oh=full"}',
        { status: 200 },
      );
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
    assert.equal(result.mediaItems[0].url, "https://scontent.test/original.jpg?stp=dst-jpg_e35_tt6&oh=full");
    assert.match(requests[0].url, /\/reel\/DavpwruN_4A\/\?__a=1$/);
    assert.match(requests[0].options.headers["User-Agent"], /Instagram/);
  } finally {
    global.fetch = original;
  }
});
