import { describe, expect, it } from "vitest";
import {
  RESUMABLE_UPLOAD_CHUNK_SIZE,
  RESUMABLE_UPLOAD_THRESHOLD,
  isCompatibleResumableUpload,
  normalizeResumableUploadUrl,
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

  it("retoma apenas uploads do mesmo endpoint público", () => {
    const endpoint = "https://supabase1.dbe.digital/storage/v1/upload/resumable";

    expect(isCompatibleResumableUpload(`${endpoint}/upload-id`, endpoint)).toBe(true);
    expect(isCompatibleResumableUpload(
      "http://supabase1.dbe.digital:8000/storage/v1//upload/resumable/upload-id",
      endpoint,
    )).toBe(false);
    expect(isCompatibleResumableUpload(
      "https://outro-host.example/storage/v1/upload/resumable/upload-id",
      endpoint,
    )).toBe(false);
    expect(isCompatibleResumableUpload("url-invalida", endpoint)).toBe(false);
  });

  it("corrige a URL interna devolvida pelo Storage auto-hospedado", () => {
    const endpoint = "https://supabase1.dbe.digital/storage/v1/upload/resumable";
    const internalUrl =
      "http://supabase1.dbe.digital:8000/storage/v1//upload/resumable/upload-id";

    expect(normalizeResumableUploadUrl(internalUrl, endpoint))
      .toBe(`${endpoint}/upload-id`);
    expect(normalizeResumableUploadUrl(`${endpoint}/upload-id`, endpoint))
      .toBe(`${endpoint}/upload-id`);
    expect(normalizeResumableUploadUrl(
      "https://outro-host.example/storage/v1/upload/resumable/upload-id",
      endpoint,
    )).toBe("https://outro-host.example/storage/v1/upload/resumable/upload-id");
  });
});
