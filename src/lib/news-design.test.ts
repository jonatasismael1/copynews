import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESIGN_CONFIG,
  DESIGN_TEMPLATES,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  TITLE_FONT_MIN,
  applyDesignFormat,
  clampMediaPosition,
  coverMedia,
  fitHeadline,
  mergeDesignConfig,
  significantCrop,
  suggestDesignFormat,
  titleColorForSurface,
  validateDesignImage,
  validateDesignMedia,
} from "./news-design";

const context = {
  font: "",
  measureText: (text: string) => ({ width: text.length * 18 }),
} as CanvasRenderingContext2D;

describe("template de arte", () => {
  it.each([
    ["vertical", 1080, 1920],
    ["horizontal", 1920, 1080],
    ["quadrada", 1080, 1080],
  ])("mantém uma imagem %s cobrindo o canvas", (_name, width, height) => {
    const result = coverMedia(width, height, {
      ...DEFAULT_DESIGN_CONFIG.media,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(result.width).toBeGreaterThanOrEqual(DESIGN_WIDTH);
    expect(result.height).toBeGreaterThanOrEqual(DESIGN_HEIGHT);
    expect(result.x).toBeLessThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(0);
  });

  it("limita o arraste para a imagem nunca deixar áreas vazias", () => {
    expect(clampMediaPosition(200, 300, 1600, 2200)).toEqual({ x: 0, y: 0 });
    expect(clampMediaPosition(-900, -900, 1600, 2200)).toEqual({
      x: -520,
      y: -280,
    });
  });

  it("ajusta títulos curtos e preserva caracteres especiais", () => {
    const result = fitHeadline(
      'Saúde: "Ação rápida" em Maceió',
      876,
      1.22,
      5,
      context,
    );
    expect(result.fits).toBe(true);
    expect(result.fontSize).toBe(DEFAULT_DESIGN_CONFIG.title.fontSize);
  });

  it("avisa quando o título não cabe nem no tamanho mínimo", () => {
    const result = fitHeadline(
      "Título jornalístico muito longo ".repeat(30),
      876,
      1.22,
      5,
      context,
    );
    expect(result.fits).toBe(false);
    expect(result.fontSize).toBe(TITLE_FONT_MIN);
    expect(result.lineCount).toBeGreaterThan(5);
  });

  it("restaura configurações ausentes sem perder ajustes salvos", () => {
    expect(
      mergeDesignConfig({
        media: { zoom: 1.5 },
        showCategory: false,
      }),
    ).toMatchObject({
      media: { zoom: 1.5, offsetX: 0, offsetY: 0 },
      title: DEFAULT_DESIGN_CONFIG.title,
      showCategory: false,
      showBrand: true,
    });
  });

  it("valida formato e limite do upload", () => {
    expect(
      validateDesignImage(
        new File(["imagem"], "noticia.png", { type: "image/png" }),
      ),
    ).toBeNull();
    expect(
      validateDesignImage(
        new File(["arquivo"], "noticia.svg", { type: "image/svg+xml" }),
      ),
    ).toContain("JPG, PNG ou WebP");
    expect(
      validateDesignMedia(
        new File(["video"], "noticia.mp4", { type: "video/mp4" }),
      ),
    ).toBeNull();
  });

  it("permite ajustar a mídia inteira sem deformar", () => {
    const result = coverMedia(1920, 1080, {
      ...DEFAULT_DESIGN_CONFIG.media,
      fit: "contain",
    });
    expect(result.width / result.height).toBeCloseTo(1920 / 1080);
    expect(result.width).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(result.height).toBeLessThanOrEqual(DESIGN_HEIGHT);
  });

  it.each([
    ["story", 1080, 1920, "9:16"],
    ["portrait", 1080, 1350, "4:5"],
    ["square", 1080, 1080, "1:1"],
  ] as const)("mantém o formato %s no espaço interno real", (format, width, height, ratio) => {
    expect(DESIGN_TEMPLATES[format]).toMatchObject({ width, height, ratio });
    const next = applyDesignFormat(DEFAULT_DESIGN_CONFIG, format);
    expect(next.format).toBe(format);
    expect(next.title.fontSize).toBe(DESIGN_TEMPLATES[format].title.fontSize);
  });

  it("sugere formato pela proporção e prioriza 4:5 para carrossel", () => {
    expect(suggestDesignFormat(1080, 1920)).toBe("story");
    expect(suggestDesignFormat(1080, 1350)).toBe("portrait");
    expect(suggestDesignFormat(1080, 1080)).toBe("square");
    expect(suggestDesignFormat(1080, 1920, 5)).toBe("portrait");
  });

  it("identifica recorte relevante sem deformar a mídia", () => {
    expect(significantCrop(1920, 1080, "story")).toBe(true);
    expect(significantCrop(1080, 1350, "portrait")).toBe(false);
  });

  it("atualiza configuração antiga para o título fiel com padding explícito", () => {
    const restored = mergeDesignConfig({
      title: { x: 102, width: 876, fontSize: 36 },
    });
    expect(restored.title.width).toBe(996);
    expect(restored.title.fontSize).toBeGreaterThan(36);
    expect(restored.title.paddingX).toBe(26);
  });

  it("mantém a composição visual aprovada de cada template", () => {
    expect(
      Object.fromEntries(
        Object.entries(DESIGN_TEMPLATES).map(([format, template]) => [
          format,
          {
            canvas: `${template.width}x${template.height}`,
            surface: template.surface,
            title: {
              x: template.title.x,
              y: template.title.y,
              width: template.title.width,
              fontSize: template.title.fontSize,
              lineHeight: template.title.lineHeight,
              paddingX: template.title.paddingX,
              maxLines: template.title.maxLines,
              fontFamily: template.title.fontFamily,
            },
            categoryY: template.category.y,
          },
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "portrait": {
          "canvas": "1080x1350",
          "categoryY": 852,
          "surface": "gradient",
          "title": {
            "fontFamily": "Sora",
            "fontSize": 58,
            "lineHeight": 1.08,
            "maxLines": 4,
            "paddingX": 12,
            "width": 940,
            "x": 70,
            "y": 934,
          },
        },
        "square": {
          "canvas": "1080x1080",
          "categoryY": 682,
          "surface": "gradient",
          "title": {
            "fontFamily": "Sora",
            "fontSize": 52,
            "lineHeight": 1.06,
            "maxLines": 4,
            "paddingX": 12,
            "width": 940,
            "x": 70,
            "y": 754,
          },
        },
        "story": {
          "canvas": "1080x1920",
          "categoryY": 1316,
          "surface": "box",
          "title": {
            "fontFamily": "Open Sans",
            "fontSize": 64,
            "lineHeight": 1.04,
            "maxLines": 3,
            "paddingX": 26,
            "width": 996,
            "x": 42,
            "y": 1390,
          },
        },
      }
    `);
  });

  it("usa título branco e tarja ampla nos formatos de publicação", () => {
    expect(titleColorForSurface(DESIGN_TEMPLATES.portrait.surface)).toBe("#ffffff");
    expect(titleColorForSurface(DESIGN_TEMPLATES.square.surface)).toBe("#ffffff");
    expect(DESIGN_TEMPLATES.portrait.category).toMatchObject({
      minWidth: 540,
      height: 72,
    });
    expect(DESIGN_TEMPLATES.square.category).toMatchObject({
      minWidth: 520,
      height: 68,
    });
  });
});
