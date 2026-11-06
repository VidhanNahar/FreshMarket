"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <button type="button" aria-label="Toggle light and dark theme" aria-pressed={mounted && resolvedTheme === "dark"} disabled={!mounted} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-input bg-card text-foreground transition-colors hover:bg-muted" title="Toggle light and dark theme"><Sun aria-hidden="true" className="hidden h-4 w-4 dark:block" /><Moon aria-hidden="true" className="h-4 w-4 dark:hidden" /></button>;
}
