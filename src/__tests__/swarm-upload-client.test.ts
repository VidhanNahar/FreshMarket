import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { uploadImage } from "@/lib/swarm/upload";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const file = { type: "image/png", size: png.length, arrayBuffer: async () => png.slice().buffer } as File;
const address = "0x1111111111111111111111111111111111111111";
afterEach(() => { vi.unstubAllGlobals(); });
describe("Swarm upload client", () => {
  it("cancels while waiting for a wallet signature without starting a request", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("window", { location: { origin: "https://freshmarket.example" } });
    const xhr = vi.fn(); vi.stubGlobal("XMLHttpRequest", xhr);
    let started!: () => void;
    const signing = new Promise<void>((resolve) => { started = resolve; });
    const signMessage = vi.fn(() => { started(); return new Promise<`0x${string}`>(() => {}); });
    const controller = new AbortController();
    const pending = uploadImage(file, { address, signal: controller.signal, signMessage, onProgress: vi.fn() });
    await signing;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr).not.toHaveBeenCalled();
  });

  it("signs the content authorization, reports progress, and preserves the immutable reference", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("window", { location: { origin: "https://freshmarket.example" } });
    const open = vi.fn();
    class FakeXHR {
      upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
      status = 200; responseText = JSON.stringify({ reference: "ab".repeat(32) });
      onload?: () => void; onerror?: () => void; ontimeout?: () => void;
      open = open; setRequestHeader = vi.fn();
      send(body: File) {
        expect(body).toBe(file);
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
        this.onload?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const signMessage = vi.fn().mockResolvedValue(`0x${"11".repeat(65)}`);
    const onProgress = vi.fn();
    expect(await uploadImage(file, { address, signMessage, onProgress })).toBe(`bzz://${"ab".repeat(32)}`);
    expect(signMessage.mock.calls[0][0]).toContain("Origin: https://freshmarket.example");
    expect(signMessage.mock.calls[0][0]).toContain("SHA-256:");
    expect(open).toHaveBeenCalledWith("POST", "/api/swarm/upload");
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });
  it("rejects oversize, wrong-type and spoofed files before signing", async () => {
    const signMessage = vi.fn();
    const onProgress = vi.fn();
    for (const bad of [{ ...file, size: 5000000 }, { ...file, type: "image/svg+xml" }, { ...file, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }]) {
      await expect(uploadImage(bad as File, { address, signMessage, onProgress })).rejects.toThrow();
    }
    expect(signMessage).not.toHaveBeenCalled();
  });
});
