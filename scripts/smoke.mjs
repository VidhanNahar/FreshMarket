// Read-only HTTP smoke checks. Does not connect a wallet, upload data, or broadcast transactions.
const base = new URL(process.argv[2] ?? 'http://localhost:3000');
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Use an HTTP(S) application URL');
const checks = [
  ['/', 'FreshMarket'], ['/browse', 'Browse active listings'], ['/sell', 'Create a New Listing'],
  ['/my-listings', 'My listings'], ['/listing/invalid', 'Listing'], ['/storefront/index.html', 'SECOND LOOK'],
  ['/identity', 'ENS storefront identity'],
];
for (const [path, expected] of checks) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30_000) });
  const html = await response.text();
  if (!response.ok || !html.includes(expected)) throw new Error(`Failed ${path}: HTTP ${response.status} or missing page marker`);
  console.log(`PASS ${path}: ${response.status}`);
  if (path === '/storefront/index.html') {
    const source = html.match(/src="([^"]+\.js)"/);
    if (!source) throw new Error('Standalone reader script missing');
    const script = await fetch(new URL(source[1], response.url), { signal: AbortSignal.timeout(15_000) });
    if (!script.ok || !(script.headers.get('content-type') ?? '').includes('javascript')) throw new Error('Standalone reader asset failed');
    console.log('PASS standalone JavaScript asset');
  }
}
const redirect = await fetch(new URL('/storefront', base), { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
if (redirect.status !== 307 || !redirect.headers.get('location')?.endsWith('/storefront/index.html')) throw new Error('Storefront redirect failed');
console.log('PASS storefront redirect');
