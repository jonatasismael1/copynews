import { describe, expect, it } from "vitest";
import {
  canTransition,
  engagementRate,
  isPublishedOnLocalDay,
} from "./business";
import { aiResultSchema, sourceUrlSchema } from "./schemas";
describe("regras editoriais", () => {
  it("valida URLs HTTP", () => {
    expect(
      sourceUrlSchema.safeParse("https://instagram.com/reel/abc").success,
    ).toBe(true);
    expect(sourceUrlSchema.safeParse("javascript:alert(1)").success).toBe(
      false,
    );
    expect(() => sourceUrlSchema.safeParse("")).not.toThrow();
    expect(sourceUrlSchema.safeParse("").success).toBe(false);
  });
  it("impede redator de aprovar", () => {
    expect(canTransition("awaiting_approval", "approved", "writer")).toBe(
      false,
    );
    expect(canTransition("awaiting_approval", "approved", "editor")).toBe(true);
  });
  it("não inventa denominador de engajamento", () => {
    expect(
      engagementRate({
        likes: 5,
        comments: 2,
        shares: 2,
        saves: 1,
        reach: 100,
      }),
    ).toBe(10);
    expect(
      engagementRate({ likes: 5, comments: 2, shares: 2, saves: 1 }),
    ).toBeNull();
  });
  it("conta publicação no fuso operacional", () => {
    expect(isPublishedOnLocalDay("2026-07-14T02:30:00Z", "2026-07-13")).toBe(
      true,
    );
  });
  it("rejeita JSON de IA incompleto", () => {
    expect(aiResultSchema.safeParse({ title: "x" }).success).toBe(false);
  });
});
