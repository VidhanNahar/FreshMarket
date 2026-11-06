"use client";
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-xl space-y-4 p-10"><h1 className="text-2xl font-bold">This page couldn’t be displayed</h1><p>Try loading it again. Check any submitted transaction in the explorer before sending another request.</p><button type="button" onClick={reset} className="rounded-lg bg-emerald-700 px-4 py-2 text-white">Try again</button></section>;
}
