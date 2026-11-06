export default function Loading() {
  return <section role="status" aria-label="Loading page" className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12">
    <p className="editorial-kicker text-primary">FreshMarket</p><p className="mt-3 text-sm text-muted-foreground">Finding your next great thing…</p>
    <div aria-hidden="true" className="mt-8 animate-pulse space-y-8"><div className="h-12 w-2/3 max-w-lg rounded-xl bg-muted" /><div className="h-14 rounded-xl bg-muted" /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map(key => <div key={key} className="overflow-hidden rounded-2xl border border-border bg-card"><div className="aspect-[4/3] bg-muted" /><div className="space-y-3 p-5"><div className="h-4 w-3/4 rounded bg-muted" /><div className="h-6 w-1/2 rounded bg-muted" /></div></div>)}</div></div>
  </section>;
}
