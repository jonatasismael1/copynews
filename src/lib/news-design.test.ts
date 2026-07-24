import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESIGN_CONFIG,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  TITLE_FONT_MIN,
  clampMediaPosition,
  coverMedia,
  fitHeadline,
  mergeDesignConfig,
  validateDesignImage,
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
    expect(result.fontSize).toBeGreaterThanOrEqual(TITLE_FONT_MIN);
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
  });
});
