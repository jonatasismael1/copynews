import * as tus from "tus-js-client";
import { supabase } from "@/lib/supabase";

export const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
export const RESUMABLE_UPLOAD_CHUNK_SIZE = 6 * 1024 * 1024;

export function storageResumableEndpoint(projectUrl: string) {
  const url = new URL(projectUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  if (url.hostname.endsWith(".supabase.co")) {
    const projectId = url.hostname.split(".")[0];
    if (!projectId) throw new Error("Projeto de armazenamento inválido.");
    return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${url.origin}${basePath}/storage/v1/upload/resumable`;
}

export function isCompatibleResumableUpload(
  uploadUrl: string | null | undefined,
  endpoint: string,
) {
  if (!uploadUrl) return false;

  try {
    const previousUrl = new URL(uploadUrl);
    const endpointUrl = new URL(endpoint);
    const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");

    return (
      previousUrl.origin === endpointUrl.origin
      && previousUrl.pathname.startsWith(`${endpointPath}/`)
    );
  } catch {
    return false;
  }
}

export function normalizeResumableUploadUrl(uploadUrl: string, endpoint: string) {
  try {
    const previousUrl = new URL(uploadUrl, endpoint);
    const endpointUrl = new URL(endpoint);
    const resumableMarker = "/upload/resumable/";
    const markerIndex = previousUrl.pathname.lastIndexOf(resumableMarker);

    if (previousUrl.hostname !== endpointUrl.hostname || markerIndex < 0) return uploadUrl;

    const uploadId = previousUrl.pathname.slice(markerIndex + resumableMarker.length);
    if (!uploadId) return uploadUrl;

    const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
    return `${endpointUrl.origin}${endpointPath}/${uploadId}${previousUrl.search}${previousUrl.hash}`;
  } catch {
    return uploadUrl;
  }
}

class NormalizedTusResponse implements tus.HttpResponse {
  constructor(
    private readonly response: tus.HttpResponse,
    private readonly endpoint: string,
  ) {}

  getStatus() {
    return this.response.getStatus();
  }

  getHeader(header: string) {
    const value = this.response.getHeader(header);
    if (!value || header.toLowerCase() !== "location") return value;
    return normalizeResumableUploadUrl(value, this.endpoint);
  }

  getBody() {
    return this.response.getBody();
  }

  getUnderlyingObject() {
    return this.response.getUnderlyingObject();
  }
}

class NormalizedTusRequest implements tus.HttpRequest {
  constructor(
    private readonly request: tus.HttpRequest,
    private readonly endpoint: string,
  ) {}

  getMethod() {
    return this.request.getMethod();
  }

  getURL() {
    return this.request.getURL();
  }

  setHeader(header: string, value: string) {
    this.request.setHeader(header, value);
  }

  getHeader(header: string) {
    return this.request.getHeader(header);
  }

  setProgressHandler(handler: (bytesSent: number) => void) {
    this.request.setProgressHandler(handler);
  }

  async send(body: unknown) {
    const response = await this.request.send(body);
    return new NormalizedTusResponse(response, this.endpoint);
  }

  abort() {
    return this.request.abort();
  }

  getUnderlyingObject() {
    return this.request.getUnderlyingObject();
  }
}

class NormalizedTusHttpStack implements tus.HttpStack {
  constructor(
    private readonly httpStack: tus.HttpStack,
    private readonly endpoint: string,
  ) {}

  createRequest(method: string, url: string) {
    const publicUrl = normalizeResumableUploadUrl(url, this.endpoint);
    return new NormalizedTusRequest(this.httpStack.createRequest(method, publicUrl), this.endpoint);
  }

  getName() {
    return `${this.httpStack.getName()}-public-url`;
  }
}

type StorageUploadOptions = {
  contentType: string;
  upsert?: boolean;
  onProgress?: (percentage: number) => void;
};

export async function uploadStorageFile(
  bucketName: string,
  objectName: string,
  file: Blob,
  { contentType, upsert = false, onProgress }: StorageUploadOptions,
) {
  if (file.size <= RESUMABLE_UPLOAD_THRESHOLD) {
    const { error } = await supabase.storage.from(bucketName).upload(objectName, file, {
      contentType,
      cacheControl: "31536000",
      upsert,
    });
    if (error) throw error;
    onProgress?.(100);
    return objectName;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken)
    throw sessionError || new Error("Sua sessão expirou. Entre novamente antes de enviar o vídeo.");

  const projectUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!projectUrl) throw new Error("Armazenamento não configurado.");

  const endpoint = storageResumableEndpoint(projectUrl);

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      httpStack: new NormalizedTusHttpStack(tus.defaultOptions.httpStack, endpoint),
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      chunkSize: RESUMABLE_UPLOAD_CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(upsert ? { "x-upsert": "true" } : {}),
      },
      metadata: {
        bucketName,
        objectName,
        contentType,
        cacheControl: "31536000",
      },
      onProgress(bytesUploaded, bytesTotal) {
        onProgress?.(bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0);
      },
      onError(error) {
        reject(new Error(`Falha no envio retomável: ${error.message}`));
      },
      onSuccess() {
        onProgress?.(100);
        resolve();
      },
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      const compatibleUpload = previousUploads.find((previousUpload) =>
        isCompatibleResumableUpload(previousUpload.uploadUrl, endpoint));
      if (compatibleUpload) upload.resumeFromPreviousUpload(compatibleUpload);
      upload.start();
    }).catch(reject);
  });

  return objectName;
}
