"use client";

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert" className="mx-auto my-12 max-w-xl space-y-4 rounded-2xl border border-amber-500/40 p-8">
      <h1 className="text-xl font-bold">Something went wrong</h1><p>We couldn’t display this page. Your wallet transactions are not retried by reloading. Keep any submitted transaction reference before continuing.</p>
      <button type="button" className="rounded-lg bg-emerald-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Reload page</button>
    </section>;
    return this.props.children;
  }
}
