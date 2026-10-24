// Client upload helper with progress events (fetch can't report upload
// progress). Unwraps the standard API envelope.
"use client";

import { ApiError } from "@/lib/fetcher";

/**
 * POSTs multipart data and reports progress 0–1.
 * @param url - API route
 * @param form - FormData payload
 * @param onProgress - called as bytes are sent
 */
export function uploadWithProgress<T>(url: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { ok: boolean; data?: T; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok) resolve(body.data as T);
      else reject(new ApiError(body?.error ?? `Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Network error, check your connection", 0));
    xhr.send(form);
  });
}
