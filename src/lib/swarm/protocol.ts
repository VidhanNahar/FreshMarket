export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export function validImageBytes(bytes: Uint8Array, type: string): boolean {
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}
export function uploadAuthorization(origin: string, hash: string, type: string, size: number, timestamp: number) {
  return `FreshMarket Swarm image upload\nOrigin: ${origin}\nSHA-256: ${hash}\nType: ${type}\nBytes: ${size}\nTime: ${timestamp}\nAuthorize this public image upload. No blockchain transaction.`;
}
