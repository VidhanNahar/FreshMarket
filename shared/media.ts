// Public media contract shared by independently hosted readers; no app/provider dependencies.
export const DEFAULT_SWARM_GATEWAY = "https://api.gateway.ethswarm.org";
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
    if (url.protocol !== "https:" || url.username || url.password) return null;
    // The public gateway's copied /access link serves an HTML viewer, not an image.
    // Preserve the network and file path when turning it into a direct content URL.
    const gateways: Record<string, string> = {
      "gateway.ethswarm.org": "api.gateway.ethswarm.org",
      "gateway.testnet.ethswarm.org": "api.gateway.testnet.ethswarm.org",
    };
    const apiHost = gateways[url.hostname];
    if (apiHost && /^\/(access|bzz)\//.test(url.pathname)) {
      const match = /^\/(?:access|bzz)\/([a-fA-F0-9]{64})(\/.*)?$/.exec(url.pathname);
      if (!match) return null;
      url.hostname = apiHost;
      url.pathname = `/bzz/${match[1].toLowerCase()}${match[2] || "/"}`;
    }
    return url.href;
  } catch { return null; }
}
