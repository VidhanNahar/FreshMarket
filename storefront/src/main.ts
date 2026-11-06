import { createReader, portablePrice, readCatalogue, type PortableListing } from "./reader";
import "./style.css";

document.querySelector("#theme-toggle")?.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("freshmarket-theme", dark ? "dark" : "light"); } catch { /* Storage may be disabled. */ }
});
window.addEventListener("storage", event => {
  if (event.key === "freshmarket-theme") document.documentElement.classList.toggle("dark", event.newValue === "dark");
});
const client = createReader(import.meta.env.VITE_ARKIV_ACCESS_KEY ?? "");
const grid = document.querySelector<HTMLElement>("#listings")!;
const status = document.querySelector<HTMLElement>("#read-status")!;
const refresh = document.querySelector<HTMLButtonElement>("#refresh")!;
const filter = document.querySelector<HTMLSelectElement>("#status-filter")!;
if (!window.location.pathname.startsWith("/storefront/")) document.querySelector(".home-link")?.remove();
let rows: PortableListing[] = [];
let busy = false;
let lastSuccess: string | undefined;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const node = document.createElement(tag);
  node.textContent = text; // Treat all public blockchain content as text, never HTML.
  return node;
}
function render() {
  grid.replaceChildren();
  const selected = rows.filter((row) => filter.value === "all" || row.status === filter.value);
  if (!selected.length) grid.append(element("p", "No live listings match this status. Publish on FreshMarket, then refresh here."));
  for (const row of selected) {
    const article = element("article", "");
    if (row.imageUrl) {
      const image = element("img", ""); image.src = row.imageUrl; image.alt = row.title; image.loading = "lazy"; image.referrerPolicy = "no-referrer";
      // Lazy images may stay off screen for a long time; do not expire them before loading starts.
      image.onerror = () => { image.replaceWith(element("p", "Image unavailable")); };
      article.append(image);
    }
    article.append(element("p", `${row.category} / ${row.city} / ${row.condition}`), element("h2", row.title), element("strong", portablePrice(row.priceMinor)));
    const badge = element("span", row.status); badge.className = `badge ${row.status}`;
    article.append(badge, element("h3", "ENTITY KEY"), element("code", row.id), element("h3", "SELLER"), element("code", row.seller), element("p", `Expires at block ${row.expiresAtBlock}`));
    const link = element("a", "Inspect on Rabdi Explorer ↗");
    link.href = `https://rabdi.explorer.arkiv.network/entity/${encodeURIComponent(row.id)}`;
    link.target = "_blank"; link.rel = "noopener noreferrer";
    if (window.location.pathname.startsWith("/storefront/")) {
      const details = element("a", "View item details →");
      details.className = "detail-link";
      details.href = `/listing/${encodeURIComponent(row.id)}`;
      article.append(details);
    }
    article.append(link); grid.append(article);
  }
}
async function load() {
  if (busy) return;
  busy = true; refresh.disabled = true; grid.setAttribute("aria-busy", "true");
  status.textContent = "Reading directly from Arkiv Rabdi…";
  try {
    const result = await readCatalogue(client);
    rows = result.listings;
    lastSuccess = `Block ${result.block} · ${rows.length} live records${result.truncated ? " (read limit reached: showing the first part of a very large catalogue)" : ""} · refreshed ${new Date().toLocaleTimeString()}`;
    status.textContent = lastSuccess;
    render();
  } catch {
    // Keep prior data visible, clearly marked as stale; never report a failed RPC as an empty catalogue.
    status.textContent = `Arkiv is unavailable or rate limited. Retry refresh.${lastSuccess ? ` Last successful read: ${lastSuccess}. Displayed records may be stale.` : ""}`;
  } finally { busy = false; refresh.disabled = false; grid.setAttribute("aria-busy", "false"); }
}
refresh.addEventListener("click", () => void load());
filter.addEventListener("change", render);
void load();
// Each refresh performs fresh RPC reads; there is no FreshMarket cache or write invalidation channel.
setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
