import type { Hex } from "viem";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, uploadAuthorization, validImageBytes } from "./protocol";

/** Upload completion is reported only after Bee returns a valid immutable reference. No automatic retries. */
export async function uploadImage(file: File, options: {
  address: Hex; signMessage: (message: string) => Promise<Hex>; onProgress: (progress: number) => void;
}): Promise<string> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type) || !file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Choose a PNG, JPEG, or WebP image up to 4 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validImageBytes(bytes, file.type)) throw new Error("The file contents do not match its image type");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
  const timestamp = Date.now();
  const signature = await options.signMessage(uploadAuthorization(window.location.origin, hash, file.type, file.size, timestamp));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/swarm/upload");
    request.timeout = 90_000;
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-Upload-Wallet", options.address);
    request.setRequestHeader("X-Upload-Time", String(timestamp));
    request.setRequestHeader("X-Upload-Signature", signature);
    request.upload.onprogress = (event) => { if (event.lengthComputable) options.onProgress(Math.min(95, Math.round(event.loaded / event.total * 95))); };
    request.onerror = () => reject(new Error("Swarm upload could not reach the server. Check your connection."));
    request.ontimeout = () => reject(new Error("Swarm upload timed out. Check your node before trying again."));
    request.onload = () => {
      let result: { reference?: string; error?: string };
      try { result = JSON.parse(request.responseText); } catch { reject(new Error("Upload returned an invalid response")); return; }
      if (request.status !== 200 || !/^[a-fA-F0-9]{64}$/.test(result.reference ?? "")) {
        reject(new Error(result.error ?? "Swarm upload failed")); return;
      }
      options.onProgress(100);
      resolve(`bzz://${result.reference!.toLowerCase()}`);
    };
    request.send(file);
  });
}
