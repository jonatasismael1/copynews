import * as tus from "tus-js-client";
import { supabase } from "@/lib/supabase";

export const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
export const RESUMABLE_UPLOAD_CHUNK_SIZE = 6 * 1024 * 1024;

export function storageResumableEndpoint(projectUrl: string) {
  const projectId = new URL(projectUrl).hostname.split(".")[0];
  if (!projectId) throw new Error("Projeto de armazenamento inválido.");
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
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

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: storageResumableEndpoint(projectUrl),
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
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(reject);
  });

  return objectName;
}
