// Public media contract shared by independently hosted readers; no app/provider dependencies.
export const DEFAULT_SWARM_GATEWAY = "https://api.gateway.testnet.ethswarm.org";
export function swarmReference(value: string): string | null {
  const match = /^bzz:\/\/([a-fA-F0-9]{64})\/?$/.exec(value.trim());
  return match ? match[1].toLowerCase() : null;
}
export function resolveImageSource(value: string, gateway = DEFAULT_SWARM_GATEWAY): string | null {
  const reference = swarmReference(value);
  if (reference) {
    try {
      const base = new URL(gateway);
      if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
      return `${base.href.replace(/\/$/, "")}/bzz/${reference}/`;
    } catch { return null; }
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
