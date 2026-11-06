"use client";

import { useEffect, useState } from "react";
import { expirationState } from "@/lib/listing-expiration";

/** Re-anchor the display timer on each confirmed block; estimates never prune data. */
export function ExpirationCountdown({ expiresAtBlock, currentBlock }: { expiresAtBlock: bigint; currentBlock?: bigint }) {
  return <CountdownAtBlock key={`${expiresAtBlock}:${currentBlock}`} expiresAtBlock={expiresAtBlock} currentBlock={currentBlock} />;
}
function CountdownAtBlock({ expiresAtBlock, currentBlock }: { expiresAtBlock: bigint; currentBlock?: bigint }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const state = expirationState(expiresAtBlock, currentBlock, elapsed);
  return <span title={`Expiration block ${expiresAtBlock}. Countdown uses Rabdi's two-second target; block confirmation is authoritative.`}
    className={state.expired ? "font-medium text-gray-500" : state.nearExpiry ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>{state.label}</span>;
}
