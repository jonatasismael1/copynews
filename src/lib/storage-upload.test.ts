import { describe, expect, it } from "vitest";
import {
  RESUMABLE_UPLOAD_CHUNK_SIZE,
  RESUMABLE_UPLOAD_THRESHOLD,
  storageResumableEndpoint,
} from "./storage-upload";

describe("upload retomável", () => {
  it("usa o host direto recomendado pelo Supabase", () => {
    expect(storageResumableEndpoint("https://bfrhtnwgzhcubfrvrylf.supabase.co"))
      .toBe("https://bfrhtnwgzhcubfrvrylf.storage.supabase.co/storage/v1/upload/resumable");
  });

  it("usa o gateway do projeto quando o Supabase é auto-hospedado", () => {
    expect(storageResumableEndpoint("https://supabase1.dbe.digital/"))
      .toBe("https://supabase1.dbe.digital/storage/v1/upload/resumable");
  });

  it("mantém blocos de 6 MB para arquivos grandes", () => {
    expect(RESUMABLE_UPLOAD_THRESHOLD).toBe(6 * 1024 * 1024);
    expect(RESUMABLE_UPLOAD_CHUNK_SIZE).toBe(6 * 1024 * 1024);
  });
});
