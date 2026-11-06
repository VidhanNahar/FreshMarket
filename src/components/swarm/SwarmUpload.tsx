"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { uploadImage } from "@/lib/swarm/upload";

export function SwarmUpload({ onUploaded, onBusyChange }: { onUploaded: (reference: string) => void; onBusyChange: (busy: boolean) => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, [address]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  async function send(file?: File) {
    if (!file || lock.current) return;
    if (!address) { setMessage("Connect your seller wallet to authorize an upload."); return; }
    const request = new AbortController();
    controller.current = request;
    lock.current = true; setBusy(true); onBusyChange(true); setProgress(0); setMessage("Confirm upload authorization in your wallet. No gas transaction is requested.");
    try {
      const reference = await uploadImage(file, { signal: request.signal, address, signMessage: (text) => signMessageAsync({ message: text, account: address }), onProgress: setProgress });
      if (!active.current || request.signal.aborted) return;
      onUploaded(reference); setMessage("Image uploaded to Swarm. Review the reference before publishing the listing.");
    } catch (error) { if (active.current) setMessage(request.signal.aborted ? "Upload canceled because the wallet or page changed." : error instanceof Error ? error.message : "Upload failed. Please try again."); }
    finally { lock.current = false; if (active.current) { setBusy(false); onBusyChange(false); } }
  }
  return <section aria-label="Swarm image upload" className="mt-4 space-y-3 rounded-xl border border-dashed border-border p-4"
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void send(event.dataTransfer.files[0]); }}>
    <label htmlFor="swarm-image" className="block text-sm font-semibold">Upload to Swarm or drop an image here</label>
    <p id="swarm-help" className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 4 MiB. Uploads require a configured Bee node and an enabled wallet. You can also use an HTTPS image URL.</p>
    <input id="swarm-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} aria-describedby="swarm-help" className="block w-full text-sm file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-2" onChange={(event) => { void send(event.target.files?.[0]); event.target.value = ""; }} />
    {busy && <div><progress aria-label="Image upload progress" max={100} value={progress} className="w-full" /><p className="text-xs">{progress < 95 ? `${progress}% — sending image` : "Waiting for Swarm storage confirmation…"}</p></div>}
    {message && <p role="status" className="break-words text-sm">{message}</p>}
  </section>;
}
