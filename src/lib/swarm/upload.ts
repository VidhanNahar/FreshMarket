import type { Hex } from "viem";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, uploadAuthorization, validImageBytes } from "./protocol";

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(new DOMException("Upload canceled", "AbortError")); };
    operation.then((value) => { signal.removeEventListener("abort", cancel); resolve(value); },
      (error) => { signal.removeEventListener("abort", cancel); reject(error); });
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
}

/** Upload completion is reported only after Bee returns a valid immutable reference. No automatic retries. */
export async function uploadImage(file: File, options: {
  signal?: AbortSignal; address: Hex; signMessage: (message: string) => Promise<Hex>; onProgress: (progress: number) => void;
}): Promise<string> {
  options.signal?.throwIfAborted();
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type) || !file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Choose a PNG, JPEG, or WebP image up to 4 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validImageBytes(bytes, file.type)) throw new Error("The file contents do not match its image type");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
  const timestamp = Date.now();
  const signature = await abortable(options.signMessage(uploadAuthorization(window.location.origin, hash, file.type, file.size, timestamp)), options.signal);
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/swarm/upload");
    request.timeout = 90_000;
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-Upload-Wallet", options.address);
    request.setRequestHeader("X-Upload-Time", String(timestamp));
    request.setRequestHeader("X-Upload-Digest", hash);
    request.setRequestHeader("X-Upload-Bytes", String(file.size));
    request.setRequestHeader("X-Upload-Signature", signature);
    const cancel = () => request.abort();
    const cleanup = () => options.signal?.removeEventListener("abort", cancel);
    request.onabort = () => { cleanup(); reject(new DOMException("Upload canceled", "AbortError")); };
    options.signal?.addEventListener("abort", cancel, { once: true });
    request.upload.onprogress = (event) => { if (event.lengthComputable) options.onProgress(Math.min(95, Math.round(event.loaded / event.total * 95))); };
    request.onerror = () => { cleanup(); reject(new Error("Swarm upload could not reach the server. Check your connection.")); };
    request.ontimeout = () => { cleanup(); reject(new Error("Swarm upload timed out. Check your node before trying again.")); };
    request.onload = () => {
      cleanup();
      let result: { reference?: string; error?: string };
      try { result = JSON.parse(request.responseText); } catch { reject(new Error("Upload returned an invalid response")); return; }
      if (request.status !== 200 || !/^[a-fA-F0-9]{64}$/.test(result.reference ?? "")) {
        reject(new Error(result.error ?? "Swarm upload failed")); return;
      }
      options.onProgress(100);
      resolve(`bzz://${result.reference!.toLowerCase()}`);
    };
    if (options.signal?.aborted) { cleanup(); reject(new DOMException("Upload canceled", "AbortError")); return; }
    request.send(file);
  });
}
